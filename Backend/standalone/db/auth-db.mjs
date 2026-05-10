import { randomBytes } from "node:crypto";
import { hashSecret } from "../http.mjs";
import {
  __internalCacheActiveUserByTokenHash,
  __internalClearCachedAuthSession,
  __internalGetCachedActiveUserByTokenHash,
  __internalGetReadyPgPool,
  __internalGetSqlite,
  __internalIsUserAccountActive,
  __internalMapUserRow,
  __internalNowIso,
  __internalSessionTtlMs,
  hashCredential
} from "../db.mjs";

export { verifyCredential } from "../db.mjs";

const OPERATOR_ADMIN_ROLES = new Set(["operator", "result_operator", "result_only_operator", "support_operator"]);
const OPERATOR_ROLE_SQL = "'operator','result_operator','result_only_operator','support_operator'";

export async function findUserByPhone(phone) {
  if (__internalGetReadyPgPool) {
    const pool = await __internalGetReadyPgPool();
    const result = await pool.query(
      `SELECT id, phone, password_hash, mpin_hash, mpin_configured, name, role, referral_code, joined_at, approval_status, approved_at, rejected_at, blocked_at, deactivated_at, status_note, signup_bonus_granted, referred_by_user_id
       FROM users
       WHERE phone = $1
       LIMIT 1`,
      [phone]
    );
    return __internalMapUserRow(result.rows[0]);
  }

  const row = __internalGetSqlite()
    .prepare(
      `SELECT id, phone, password_hash, mpin_hash, mpin_configured, name, role, referral_code, joined_at, approval_status, approved_at, rejected_at, blocked_at, deactivated_at, status_note, signup_bonus_granted, referred_by_user_id
       FROM users
       WHERE phone = ?
       LIMIT 1`
    )
    .get(phone);
  return __internalMapUserRow(row);
}

function mapAdminAccountRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    adminId: row.id,
    userId: row.id,
    phone: row.phone,
    adminPhone: row.phone,
    name: row.display_name,
    adminDisplayName: row.display_name,
    passwordHash: row.password_hash,
    role: row.role ?? "admin",
    adminTwoFactorEnabled: row.two_factor_enabled == null ? true : Boolean(row.two_factor_enabled),
    adminTwoFactorSecret: row.two_factor_secret ?? "",
    blockedAt: row.blocked_at ?? null,
    deactivatedAt: row.deactivated_at ?? null,
    approvalStatus: "Approved",
    approvedAt: row.created_at ?? null,
    rejectedAt: null,
    statusNote: "",
    hasMpin: false,
    mpinHash: null,
    referralCode: "",
    joinedAt: row.created_at ?? null,
    signupBonusGranted: true,
    referredByUserId: null
  };
}

function mapOperatorAdminRow(row) {
  if (!row) {
    return null;
  }
  return {
    id: row.id,
    phone: row.phone,
    name: row.display_name,
    role: row.role,
    twoFactorEnabled: row.two_factor_enabled == null ? true : Boolean(row.two_factor_enabled),
    blockedAt: row.blocked_at ?? null,
    deactivatedAt: row.deactivated_at ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null
  };
}

function normalizeOperatorRole(role) {
  const normalized = String(role || "result_operator").trim().toLowerCase();
  return OPERATOR_ADMIN_ROLES.has(normalized) ? normalized : "";
}

async function getReadyPgPoolOrNull() {
  try {
    return await __internalGetReadyPgPool();
  } catch {
    return null;
  }
}

async function findRawAdminByIdOrPhone({ id, phone }) {
  const pool = await getReadyPgPoolOrNull();
  if (pool) {
    const result = id
      ? await pool.query(`SELECT id, phone, display_name, role FROM admins WHERE id = $1 LIMIT 1`, [id])
      : await pool.query(`SELECT id, phone, display_name, role FROM admins WHERE phone = $1 LIMIT 1`, [phone]);
    return result.rows[0] || null;
  }

  return id
    ? __internalGetSqlite().prepare(`SELECT id, phone, display_name, role FROM admins WHERE id = ? LIMIT 1`).get(id)
    : __internalGetSqlite().prepare(`SELECT id, phone, display_name, role FROM admins WHERE phone = ? LIMIT 1`).get(phone);
}

export async function listOperatorAdminAccounts() {
  const pool = await getReadyPgPoolOrNull();
  if (pool) {
    const result = await pool.query(
      `SELECT id, phone, display_name, role, two_factor_enabled, blocked_at, deactivated_at, created_at, updated_at
       FROM admins
       WHERE role IN (${OPERATOR_ROLE_SQL})
       ORDER BY created_at DESC, id DESC`
    );
    return result.rows.map(mapOperatorAdminRow);
  }

  return __internalGetSqlite()
    .prepare(
      `SELECT id, phone, display_name, role, two_factor_enabled, blocked_at, deactivated_at, created_at, updated_at
       FROM admins
       WHERE role IN (${OPERATOR_ROLE_SQL})
       ORDER BY created_at DESC, id DESC`
    )
    .all()
    .map(mapOperatorAdminRow);
}

export async function upsertOperatorAdminAccount({ id = "", phone, displayName, role, password = "", active = true, twoFactorEnabled = true }) {
  const normalizedRole = normalizeOperatorRole(role);
  if (!normalizedRole) {
    throw new Error("Invalid operator role");
  }

  const existing = await findRawAdminByIdOrPhone({ id, phone });
  if (existing && !OPERATOR_ADMIN_ROLES.has(String(existing.role || "").toLowerCase())) {
    throw new Error("This admin account cannot be managed as an operator");
  }
  if (!existing && !String(password || "").trim()) {
    throw new Error("Password is required for a new operator");
  }

  const now = __internalNowIso();
  const adminId = existing?.id || id || `op_${randomBytes(12).toString("hex")}`;
  const deactivatedAt = active ? null : now;
  const passwordHash = String(password || "").trim() ? hashCredential(String(password || "").trim()) : "";

  const pool = await getReadyPgPoolOrNull();
  if (pool) {
    if (existing) {
      const values = [adminId, phone, displayName, normalizedRole, Boolean(twoFactorEnabled), deactivatedAt, now];
      let sql = `UPDATE admins
                 SET phone = $2,
                     display_name = $3,
                     role = $4,
                     two_factor_enabled = $5,
                     blocked_at = NULL,
                     deactivated_at = $6,
                     updated_at = $7`;
      if (passwordHash) {
        values.push(passwordHash);
        sql += `, password_hash = $8, two_factor_secret = NULL`;
      }
      sql += ` WHERE id = $1
               RETURNING id, phone, display_name, role, two_factor_enabled, blocked_at, deactivated_at, created_at, updated_at`;
      const result = await pool.query(sql, values);
      return mapOperatorAdminRow(result.rows[0]);
    }

    const result = await pool.query(
      `INSERT INTO admins (id, phone, password_hash, display_name, role, two_factor_enabled, two_factor_secret, blocked_at, deactivated_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NULL, NULL, $7, $8, $8)
       RETURNING id, phone, display_name, role, two_factor_enabled, blocked_at, deactivated_at, created_at, updated_at`,
      [adminId, phone, passwordHash, displayName, normalizedRole, Boolean(twoFactorEnabled), deactivatedAt, now]
    );
    return mapOperatorAdminRow(result.rows[0]);
  }

  const sqlite = __internalGetSqlite();
  if (existing) {
    if (passwordHash) {
      sqlite
        .prepare(
          `UPDATE admins
           SET phone = ?, display_name = ?, role = ?, two_factor_enabled = ?, two_factor_secret = NULL, blocked_at = NULL, deactivated_at = ?, updated_at = ?, password_hash = ?
           WHERE id = ?`
        )
        .run(phone, displayName, normalizedRole, twoFactorEnabled ? 1 : 0, deactivatedAt, now, passwordHash, adminId);
    } else {
      sqlite
        .prepare(
          `UPDATE admins
           SET phone = ?, display_name = ?, role = ?, two_factor_enabled = ?, blocked_at = NULL, deactivated_at = ?, updated_at = ?
           WHERE id = ?`
        )
        .run(phone, displayName, normalizedRole, twoFactorEnabled ? 1 : 0, deactivatedAt, now, adminId);
    }
  } else {
    sqlite
      .prepare(
        `INSERT INTO admins (id, phone, password_hash, display_name, role, two_factor_enabled, two_factor_secret, blocked_at, deactivated_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?)`
      )
      .run(adminId, phone, passwordHash, displayName, normalizedRole, twoFactorEnabled ? 1 : 0, deactivatedAt, now, now);
  }

  const row = sqlite
    .prepare(
      `SELECT id, phone, display_name, role, two_factor_enabled, blocked_at, deactivated_at, created_at, updated_at
       FROM admins
       WHERE id = ?
       LIMIT 1`
    )
    .get(adminId);
  return mapOperatorAdminRow(row);
}

export async function findAdminByPhone(phone) {
  try {
    const pool = await __internalGetReadyPgPool();
    const result = await pool.query(
      `SELECT
         id,
         phone,
         password_hash,
         display_name,
         role,
         two_factor_enabled,
         two_factor_secret,
         blocked_at,
         deactivated_at,
         created_at
       FROM admins
       WHERE phone = $1
       LIMIT 1`,
      [phone]
    );
    return mapAdminAccountRow(result.rows[0]);
  } catch {
    const row = __internalGetSqlite()
      .prepare(
        `SELECT
           id,
           phone,
           password_hash,
           display_name,
           role,
           two_factor_enabled,
           two_factor_secret,
           blocked_at,
           deactivated_at,
           created_at
         FROM admins
         WHERE phone = ?
         LIMIT 1`
      )
      .get(phone);
    return mapAdminAccountRow(row);
  }
}

export async function findAdminById(adminId) {
  try {
    const pool = await __internalGetReadyPgPool();
    const result = await pool.query(
      `SELECT
         id,
         phone,
         password_hash,
         display_name,
         role,
         two_factor_enabled,
         two_factor_secret,
         blocked_at,
         deactivated_at,
         created_at
       FROM admins
       WHERE id = $1
       LIMIT 1`,
      [adminId]
    );
    return mapAdminAccountRow(result.rows[0]);
  } catch {
    const row = __internalGetSqlite()
      .prepare(
        `SELECT
           id,
           phone,
           password_hash,
           display_name,
           role,
           two_factor_enabled,
           two_factor_secret,
           blocked_at,
           deactivated_at,
           created_at
         FROM admins
         WHERE id = ?
         LIMIT 1`
      )
      .get(adminId);
    return mapAdminAccountRow(row);
  }
}

export async function createAdminSession(adminId) {
  const rawToken = randomBytes(24).toString("hex");
  const tokenHash = hashSecret(rawToken);
  const createdAt = __internalNowIso();

  try {
    const pool = await __internalGetReadyPgPool();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`DELETE FROM admin_sessions WHERE admin_id = $1`, [adminId]);
      await client.query(
        `INSERT INTO admin_sessions (token_hash, admin_id, created_at)
         VALUES ($1, $2, $3)`,
        [tokenHash, adminId, createdAt]
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch {
    const sqlite = __internalGetSqlite();
    sqlite.exec("BEGIN");
    try {
      sqlite.prepare(`DELETE FROM admin_sessions WHERE admin_id = ?`).run(adminId);
      sqlite.prepare(`INSERT INTO admin_sessions (token_hash, admin_id, created_at) VALUES (?, ?, ?)`).run(tokenHash, adminId, createdAt);
      sqlite.exec("COMMIT");
    } catch (error) {
      sqlite.exec("ROLLBACK");
      throw error;
    }
  }

  __internalClearCachedAuthSession(tokenHash);
  return { rawToken, tokenHash, createdAt };
}

export async function updateAdminTwoFactorSecret(adminId, secret) {
  const updatedAt = __internalNowIso();

  try {
    const pool = await __internalGetReadyPgPool();
    const result = await pool.query(
      `UPDATE admins
       SET two_factor_secret = $2, updated_at = $3
       WHERE id = $1
       RETURNING
         id,
         phone,
         password_hash,
         display_name,
         role,
         two_factor_enabled,
         two_factor_secret,
         blocked_at,
         deactivated_at,
         created_at`,
      [adminId, secret, updatedAt]
    );
    return mapAdminAccountRow(result.rows[0]);
  } catch {
    __internalGetSqlite()
      .prepare(
        `UPDATE admins
         SET two_factor_secret = ?, updated_at = ?
         WHERE id = ?`
      )
      .run(secret, updatedAt, adminId);

    return findAdminById(adminId);
  }
}

export async function createSession(userId) {
  const rawToken = randomBytes(24).toString("hex");
  const tokenHash = hashSecret(rawToken);
  const createdAt = __internalNowIso();

  try {
    const pool = await __internalGetReadyPgPool();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`DELETE FROM sessions WHERE user_id = $1`, [userId]);
      await client.query(
        `INSERT INTO sessions (token_hash, user_id, created_at)
         VALUES ($1, $2, $3)`,
        [tokenHash, userId, createdAt]
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch {
    const sqlite = __internalGetSqlite();
    sqlite.exec("BEGIN");
    try {
      sqlite.prepare(`DELETE FROM sessions WHERE user_id = ?`).run(userId);
      sqlite.prepare(`INSERT INTO sessions (token_hash, user_id, created_at) VALUES (?, ?, ?)`).run(tokenHash, userId, createdAt);
      sqlite.exec("COMMIT");
    } catch (error) {
      sqlite.exec("ROLLBACK");
      throw error;
    }
  }

  __internalClearCachedAuthSession(tokenHash);
  return { rawToken, tokenHash, createdAt };
}

export async function requireUserByToken(token) {
  if (!token) {
    return null;
  }

  const tokenHash = hashSecret(token);
  const cachedUser = __internalGetCachedActiveUserByTokenHash(tokenHash);
  if (cachedUser) {
    return cachedUser;
  }

  const minCreatedAt = new Date(Date.now() - __internalSessionTtlMs).toISOString();

  try {
    const pool = await __internalGetReadyPgPool();
    const result = await pool.query(
      `SELECT u.id, u.phone, u.password_hash, u.mpin_hash, u.mpin_configured, u.name, u.role, u.referral_code, u.joined_at, u.approval_status, u.approved_at, u.rejected_at, u.blocked_at, u.deactivated_at, u.status_note, u.signup_bonus_granted, u.referred_by_user_id
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = $1 AND s.created_at >= $2
       LIMIT 1`,
      [tokenHash, minCreatedAt]
    );
    const user = __internalMapUserRow(result.rows[0]);
    const activeUser = __internalIsUserAccountActive(user) ? user : null;
    if (activeUser) {
      __internalCacheActiveUserByTokenHash(tokenHash, activeUser);
    } else {
      __internalClearCachedAuthSession(tokenHash);
    }
    return activeUser;
  } catch {
    const row = __internalGetSqlite()
      .prepare(
        `SELECT u.id, u.phone, u.password_hash, u.mpin_hash, u.mpin_configured, u.name, u.role, u.referral_code, u.joined_at, u.approval_status, u.approved_at, u.rejected_at, u.blocked_at, u.deactivated_at, u.status_note, u.signup_bonus_granted, u.referred_by_user_id
         FROM sessions s
         JOIN users u ON u.id = s.user_id
         WHERE s.token_hash = ? AND s.created_at >= ?
         LIMIT 1`
      )
      .get(tokenHash, minCreatedAt);
    const user = __internalMapUserRow(row);
    const activeUser = __internalIsUserAccountActive(user) ? user : null;
    if (activeUser) {
      __internalCacheActiveUserByTokenHash(tokenHash, activeUser);
    } else {
      __internalClearCachedAuthSession(tokenHash);
    }
    return activeUser;
  }
}

export async function requireUserSnapshotByToken(token) {
  if (!token) {
    return null;
  }

  const tokenHash = hashSecret(token);
  const minCreatedAt = new Date(Date.now() - __internalSessionTtlMs).toISOString();

  try {
    const pool = await __internalGetReadyPgPool();
    const result = await pool.query(
      `SELECT
         u.id,
         u.phone,
         u.password_hash,
         u.mpin_hash,
         u.mpin_configured,
         u.name,
         u.role,
         u.referral_code,
         u.joined_at,
         u.approval_status,
         u.approved_at,
         u.rejected_at,
         u.blocked_at,
         u.deactivated_at,
         u.status_note,
         u.signup_bonus_granted,
         u.referred_by_user_id,
         COALESCE((
           SELECT we.after_balance
           FROM wallet_entries we
           WHERE we.user_id = u.id
           ORDER BY we.created_at DESC, we.id DESC
           LIMIT 1
         ), 0) AS wallet_balance
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = $1 AND s.created_at >= $2
       LIMIT 1`,
      [tokenHash, minCreatedAt]
    );

    const user = __internalMapUserRow(result.rows[0]);
    if (!__internalIsUserAccountActive(user)) {
      __internalClearCachedAuthSession(tokenHash);
      return null;
    }

    __internalCacheActiveUserByTokenHash(tokenHash, user);
    return {
      ...user,
      walletBalance: Number(result.rows[0]?.wallet_balance ?? 0)
    };
  } catch {
    const row = __internalGetSqlite()
      .prepare(
        `SELECT
           u.id,
           u.phone,
           u.password_hash,
           u.mpin_hash,
           u.mpin_configured,
           u.name,
           u.role,
           u.referral_code,
           u.joined_at,
           u.approval_status,
           u.approved_at,
           u.rejected_at,
           u.blocked_at,
           u.deactivated_at,
           u.status_note,
           u.signup_bonus_granted,
           u.referred_by_user_id,
           COALESCE((
             SELECT we.after_balance
             FROM wallet_entries we
             WHERE we.user_id = u.id
             ORDER BY we.created_at DESC, we.id DESC
             LIMIT 1
           ), 0) AS wallet_balance
         FROM sessions s
         JOIN users u ON u.id = s.user_id
         WHERE s.token_hash = ? AND s.created_at >= ?
         LIMIT 1`
      )
      .get(tokenHash, minCreatedAt);

    const user = __internalMapUserRow(row);
    if (!__internalIsUserAccountActive(user)) {
      __internalClearCachedAuthSession(tokenHash);
      return null;
    }

    __internalCacheActiveUserByTokenHash(tokenHash, user);
    return {
      ...user,
      walletBalance: Number(row?.wallet_balance ?? 0)
    };
  }
}

export async function requireAdminByToken(token) {
  if (!token) {
    return null;
  }

  const tokenHash = hashSecret(token);
  const minCreatedAt = new Date(Date.now() - __internalSessionTtlMs).toISOString();

  try {
    const pool = await __internalGetReadyPgPool();
    const result = await pool.query(
      `SELECT
         a.id,
         a.phone,
         a.password_hash,
         a.display_name,
         a.role,
         a.two_factor_enabled,
         a.blocked_at,
         a.deactivated_at,
         a.created_at
       FROM admin_sessions s
       JOIN admins a ON a.id = s.admin_id
       WHERE s.token_hash = $1 AND s.created_at >= $2
       LIMIT 1`,
      [tokenHash, minCreatedAt]
    );
    return mapAdminAccountRow(result.rows[0]);
  } catch {
    const row = __internalGetSqlite()
      .prepare(
        `SELECT
           a.id,
           a.phone,
           a.password_hash,
           a.display_name,
           a.role,
           a.two_factor_enabled,
           a.blocked_at,
           a.deactivated_at,
           a.created_at
         FROM admin_sessions s
         JOIN admins a ON a.id = s.admin_id
         WHERE s.token_hash = ? AND s.created_at >= ?
         LIMIT 1`
      )
      .get(tokenHash, minCreatedAt);
    return mapAdminAccountRow(row);
  }
}

export async function getAppSettings() {
  const { getAppSettings } = await import("../db.mjs");
  return getAppSettings();
}
