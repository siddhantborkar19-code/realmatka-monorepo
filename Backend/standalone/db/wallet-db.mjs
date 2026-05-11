import { isStandalonePostgresEnabled } from "../config.mjs";
import {
  __internalGetPgPool,
  __internalGetReadyPgPool,
  __internalGetSqlite,
  __internalMapWalletEntryRow,
  __internalNowIso,
  __internalToIso
} from "../db.mjs";

const CREDIT_WALLET_ENTRY_TYPES = [
  "DEPOSIT",
  "REFERRAL_COMMISSION",
  "BID_WIN",
  "SIGNUP_BONUS",
  "FIRST_DEPOSIT_BONUS",
  "ADMIN_CREDIT"
];
const DEBIT_WALLET_ENTRY_TYPES = ["WITHDRAW", "BID_PLACED", "BID_WIN_REVERSAL", "ADMIN_DEBIT"];

function toSqlStringList(values) {
  return values.map((value) => `'${String(value).replace(/'/g, "''")}'`).join(", ");
}

const CREDIT_WALLET_ENTRY_TYPES_SQL = toSqlStringList(CREDIT_WALLET_ENTRY_TYPES);
const DEBIT_WALLET_ENTRY_TYPES_SQL = toSqlStringList(DEBIT_WALLET_ENTRY_TYPES);
const WITHDRAW_PROCESSING_TIMEOUT_MS = 3 * 60 * 60 * 1000;
const AUTO_REJECT_SWEEP_MIN_INTERVAL_MS = 60 * 1000;

let lastAutoRejectSweepAt = 0;
let autoRejectSweepPromise = null;

function getWalletBalanceDeltaSql(columnPrefix = "") {
  return `CASE
    WHEN ${columnPrefix}status = 'SUCCESS' AND ${columnPrefix}type IN (${CREDIT_WALLET_ENTRY_TYPES_SQL}) THEN COALESCE(${columnPrefix}amount, 0)
    WHEN ((${columnPrefix}status = 'SUCCESS' AND ${columnPrefix}type IN (${DEBIT_WALLET_ENTRY_TYPES_SQL}))
       OR (${columnPrefix}status = 'BACKOFFICE' AND ${columnPrefix}type = 'WITHDRAW')) THEN -COALESCE(${columnPrefix}amount, 0)
    ELSE 0
  END`;
}

function getIndiaDateKey(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function getAutoRejectReason(entry, now = new Date()) {
  const createdAt = new Date(entry?.createdAt || "");
  if (Number.isNaN(createdAt.getTime())) {
    return "Auto rejected: pending withdraw expired.";
  }

  const status = String(entry?.status || "").toUpperCase();
  if (status === "BACKOFFICE" && now.getTime() - createdAt.getTime() > WITHDRAW_PROCESSING_TIMEOUT_MS) {
    return "Auto rejected: withdraw stayed in processing for more than 3 hours.";
  }

  return "Auto rejected: withdraw was not completed on the same day.";
}

async function getAccurateUserBalanceFromPg(executor, userId) {
  const result = await executor.query(
    `SELECT COALESCE(SUM(${getWalletBalanceDeltaSql()}), 0) AS balance
     FROM wallet_entries
     WHERE user_id = $1`,
    [userId]
  );
  return Number(result.rows[0]?.balance ?? 0);
}

function getAccurateUserBalanceFromSqlite(db, userId) {
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(${getWalletBalanceDeltaSql()}), 0) AS balance
       FROM wallet_entries
       WHERE user_id = ?`
    )
    .get(userId);
  return Number(row?.balance ?? 0);
}

export async function getUserBalance(userId) {
  await autoRejectExpiredWithdrawRequests();
  if (isStandalonePostgresEnabled()) {
    const pool = await __internalGetReadyPgPool();
    return getAccurateUserBalanceFromPg(pool, userId);
  }

  return getAccurateUserBalanceFromSqlite(__internalGetSqlite(), userId);
}

export async function getWalletEntriesForUser(userId, limit = 50) {
  await autoRejectExpiredWithdrawRequests();
  const normalizedLimit = Math.max(1, Math.min(5000, Number(limit) || 50));
  if (isStandalonePostgresEnabled()) {
    const pool = await __internalGetReadyPgPool();
    const result = await pool.query(
      `SELECT id, user_id, type, status, amount, before_balance, after_balance, reference_id, proof_url, note, created_at
       FROM wallet_entries
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [userId, normalizedLimit]
    );
    return result.rows.map((row) => __internalMapWalletEntryRow(row));
  }

  const rows = __internalGetSqlite()
    .prepare(
      `SELECT id, user_id, type, status, amount, before_balance, after_balance, reference_id, proof_url, note, created_at
       FROM wallet_entries
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT ?`
    )
    .all(userId, normalizedLimit);

  return rows.map((row) => __internalMapWalletEntryRow(row));
}

function getWalletEntryBalanceDelta(entry) {
  const amount = Number(entry.amount ?? 0);
  const type = String(entry.type || "").toUpperCase();
  const status = String(entry.status || "").toUpperCase();
  if (status === "SUCCESS" && CREDIT_WALLET_ENTRY_TYPES.includes(type)) return amount;
  if (status === "SUCCESS" && DEBIT_WALLET_ENTRY_TYPES.includes(type)) return -amount;
  if (status === "BACKOFFICE" && type === "WITHDRAW") return -amount;
  return 0;
}

export async function rebalanceWalletEntriesForUser(userId) {
  const entries = await getWalletEntriesForUser(userId, 5000);
  const orderedEntries = [...entries].sort((left, right) => {
    const timeDiff = new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
    if (timeDiff !== 0) return timeDiff;
    return String(left.id).localeCompare(String(right.id));
  });

  let runningBalance = 0;
  if (isStandalonePostgresEnabled()) {
    const pool = await __internalGetReadyPgPool();
    for (const entry of orderedEntries) {
      const beforeBalance = runningBalance;
      const afterBalance = beforeBalance + getWalletEntryBalanceDelta(entry);
      await pool.query(
        `UPDATE wallet_entries
         SET before_balance = $2, after_balance = $3
         WHERE id = $1`,
        [entry.id, beforeBalance, afterBalance]
      );
      runningBalance = afterBalance;
    }
    return runningBalance;
  }

  const db = __internalGetSqlite();
  const update = db.prepare(
    `UPDATE wallet_entries
     SET before_balance = ?, after_balance = ?
     WHERE id = ?`
  );
  for (const entry of orderedEntries) {
    const beforeBalance = runningBalance;
    const afterBalance = beforeBalance + getWalletEntryBalanceDelta(entry);
    update.run(beforeBalance, afterBalance, entry.id);
    runningBalance = afterBalance;
  }
  return runningBalance;
}

export async function clearWalletEntriesForUser(userId, types = []) {
  const normalizedTypes = Array.from(
    new Set((Array.isArray(types) ? types : []).map((item) => String(item || "").trim().toUpperCase()).filter(Boolean))
  );

  if (!normalizedTypes.length) {
    return { deletedCount: 0, balance: await getUserBalance(userId) };
  }

  if (isStandalonePostgresEnabled()) {
    const pool = await __internalGetReadyPgPool();
    const result = await pool.query(
      `DELETE FROM wallet_entries
       WHERE user_id = $1 AND type = ANY($2::text[])`,
      [userId, normalizedTypes]
    );
    const balance = await rebalanceWalletEntriesForUser(userId);
    return { deletedCount: Number(result.rowCount || 0), balance };
  }

  const db = __internalGetSqlite();
  const placeholders = normalizedTypes.map(() => "?").join(", ");
  const result = db.prepare(`DELETE FROM wallet_entries WHERE user_id = ? AND type IN (${placeholders})`).run(userId, ...normalizedTypes);
  const balance = await rebalanceWalletEntriesForUser(userId);
  return { deletedCount: Number(result.changes || 0), balance };
}

export async function getBankAccountsForUser(userId) {
  if (isStandalonePostgresEnabled()) {
    const pool = await __internalGetReadyPgPool();
    const result = await pool.query(
      `SELECT id, account_number, holder_name, ifsc, created_at
       FROM bank_accounts
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [userId]
    );
    return result.rows.map((row) => ({
      id: row.id,
      accountNumber: row.account_number,
      holderName: row.holder_name,
      ifsc: row.ifsc,
      createdAt: __internalToIso(row.created_at)
    }));
  }

  const rows = __internalGetSqlite()
    .prepare(
      `SELECT id, account_number, holder_name, ifsc, created_at
       FROM bank_accounts
       WHERE user_id = ?
       ORDER BY created_at DESC`
    )
    .all(userId);

  return rows.map((row) => ({
    id: row.id,
    accountNumber: row.account_number,
    holderName: row.holder_name,
    ifsc: row.ifsc,
    createdAt: row.created_at
  }));
}

export async function addWalletEntry({ userId, type, status, amount, beforeBalance, afterBalance, referenceId = "", proofUrl = "", note = "" }) {
  const id = `wallet_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const createdAt = __internalNowIso();

  if (isStandalonePostgresEnabled()) {
    const pool = __internalGetPgPool();
    await pool.query(
      `INSERT INTO wallet_entries (id, user_id, type, status, amount, before_balance, after_balance, reference_id, proof_url, note, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [id, userId, type, status, amount, beforeBalance, afterBalance, referenceId || null, proofUrl || null, note || null, createdAt]
    );
  } else {
    __internalGetSqlite()
      .prepare(
        `INSERT INTO wallet_entries (id, user_id, type, status, amount, before_balance, after_balance, reference_id, proof_url, note, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(id, userId, type, status, amount, beforeBalance, afterBalance, referenceId || null, proofUrl || null, note || null, createdAt);
  }

  return { id, userId, type, status, amount, beforeBalance, afterBalance, referenceId, proofUrl, note, createdAt };
}

async function findWalletEntryById(entryId) {
  if (isStandalonePostgresEnabled()) {
    const pool = __internalGetPgPool();
    const result = await pool.query(
      `SELECT id, user_id, type, status, amount, before_balance, after_balance, reference_id, proof_url, note, created_at
       FROM wallet_entries
       WHERE id = $1
       LIMIT 1`,
      [entryId]
    );
    return __internalMapWalletEntryRow(result.rows[0]);
  }

  return __internalMapWalletEntryRow(
    __internalGetSqlite()
      .prepare(
        `SELECT id, user_id, type, status, amount, before_balance, after_balance, reference_id, proof_url, note, created_at
         FROM wallet_entries
         WHERE id = ?
         LIMIT 1`
      )
      .get(entryId)
  );
}

export async function findWalletEntryByReferenceId(userId, referenceId) {
  if (!referenceId) {
    return null;
  }

  if (isStandalonePostgresEnabled()) {
    const pool = await __internalGetReadyPgPool();
    const result = await pool.query(
      `SELECT id, user_id, type, status, amount, before_balance, after_balance, reference_id, proof_url, note, created_at
       FROM wallet_entries
       WHERE user_id = $1 AND reference_id = $2
       ORDER BY created_at DESC, id DESC
       LIMIT 1`,
      [userId, referenceId]
    );
    return __internalMapWalletEntryRow(result.rows[0]);
  }

  return __internalMapWalletEntryRow(
    __internalGetSqlite()
      .prepare(
        `SELECT id, user_id, type, status, amount, before_balance, after_balance, reference_id, proof_url, note, created_at
         FROM wallet_entries
         WHERE user_id = ? AND reference_id = ?
         ORDER BY created_at DESC, id DESC
         LIMIT 1`
      )
      .get(userId, referenceId)
  );
}

async function updateWalletEntryStatus(entryId, status) {
  if (isStandalonePostgresEnabled()) {
    const pool = __internalGetPgPool();
    await pool.query(`UPDATE wallet_entries SET status = $1 WHERE id = $2`, [status, entryId]);
  } else {
    __internalGetSqlite().prepare(`UPDATE wallet_entries SET status = ? WHERE id = ?`).run(status, entryId);
  }

  return findWalletEntryById(entryId);
}

export async function updateWalletEntryAdmin(entryId, updates = {}) {
  const current = await findWalletEntryById(entryId);
  if (!current) return null;

  const nextStatus = String(updates.status ?? current.status).trim() || current.status;
  const nextReferenceId = String(updates.referenceId ?? current.referenceId ?? "").trim();
  const nextProofUrl = String(updates.proofUrl ?? current.proofUrl ?? "").trim();
  const nextNote = String(updates.note ?? current.note ?? "").trim();
  const nextBeforeBalance = Number.isFinite(Number(updates.beforeBalance)) ? Number(updates.beforeBalance) : Number(current.beforeBalance ?? 0);
  const nextAfterBalance = Number.isFinite(Number(updates.afterBalance)) ? Number(updates.afterBalance) : Number(current.afterBalance ?? 0);

  if (isStandalonePostgresEnabled()) {
    const pool = __internalGetPgPool();
    const result = await pool.query(
      `UPDATE wallet_entries
       SET status = $2,
           before_balance = $3,
           after_balance = $4,
           reference_id = $5,
           proof_url = $6,
           note = $7
       WHERE id = $1
       RETURNING id, user_id, type, status, amount, before_balance, after_balance, reference_id, proof_url, note, created_at`,
      [entryId, nextStatus, nextBeforeBalance, nextAfterBalance, nextReferenceId || null, nextProofUrl || null, nextNote || null]
    );
    return __internalMapWalletEntryRow(result.rows[0]);
  }

  __internalGetSqlite()
    .prepare(
      `UPDATE wallet_entries
       SET status = ?, before_balance = ?, after_balance = ?, reference_id = ?, proof_url = ?, note = ?
       WHERE id = ?`
    )
    .run(nextStatus, nextBeforeBalance, nextAfterBalance, nextReferenceId || null, nextProofUrl || null, nextNote || null, entryId);

  return findWalletEntryById(entryId);
}

export async function getWalletApprovalRequests() {
  await autoRejectExpiredWithdrawRequests();
  if (isStandalonePostgresEnabled()) {
    const pool = await __internalGetReadyPgPool();
    const result = await pool.query(
      `SELECT id, user_id, type, status, amount, before_balance, after_balance, reference_id, proof_url, note, created_at
       FROM wallet_entries
       WHERE (type = 'DEPOSIT' AND status = 'INITIATED')
          OR (type = 'WITHDRAW' AND status = ANY($1::text[]))
       ORDER BY created_at DESC, id DESC`,
      [["INITIATED", "BACKOFFICE"]]
    );
    return result.rows.map((row) => __internalMapWalletEntryRow(row));
  }

  return __internalGetSqlite()
    .prepare(
      `SELECT id, user_id, type, status, amount, before_balance, after_balance, reference_id, proof_url, note, created_at
       FROM wallet_entries
       WHERE (type = ? AND status = ?)
          OR (type = ? AND status IN (?, ?))
       ORDER BY created_at DESC, id DESC`
    )
    .all("DEPOSIT", "INITIATED", "WITHDRAW", "INITIATED", "BACKOFFICE")
    .map((row) => __internalMapWalletEntryRow(row));
}

export async function getWalletRequestHistory() {
  await autoRejectExpiredWithdrawRequests();
  const filters = ["DEPOSIT", "WITHDRAW"];
  if (isStandalonePostgresEnabled()) {
    const pool = await __internalGetReadyPgPool();
    const result = await pool.query(
      `SELECT id, user_id, type, status, amount, before_balance, after_balance, reference_id, proof_url, note, created_at
       FROM wallet_entries
       WHERE type = ANY($1::text[])
       ORDER BY created_at DESC, id DESC`,
      [filters]
    );
    return result.rows.map((row) => __internalMapWalletEntryRow(row));
  }

  return __internalGetSqlite()
    .prepare(
      `SELECT id, user_id, type, status, amount, before_balance, after_balance, reference_id, proof_url, note, created_at
       FROM wallet_entries
       WHERE type IN (?, ?)
       ORDER BY created_at DESC, id DESC`
    )
    .all(filters[0], filters[1])
    .map((row) => __internalMapWalletEntryRow(row));
}

export async function getWalletRequestHistoryPage({ limit = 500, offset = 0 } = {}) {
  await autoRejectExpiredWithdrawRequests();
  const filters = ["DEPOSIT", "WITHDRAW"];
  const normalizedLimit = Math.max(1, Math.min(5000, Number(limit) || 500));
  const normalizedOffset = Math.max(0, Number(offset) || 0);
  if (isStandalonePostgresEnabled()) {
    const pool = await __internalGetReadyPgPool();
    const [countResult, rowsResult] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS total FROM wallet_entries WHERE type = ANY($1::text[])`, [filters]),
      pool.query(
        `SELECT id, user_id, type, status, amount, before_balance, after_balance, reference_id, proof_url, note, created_at
         FROM wallet_entries
         WHERE type = ANY($1::text[])
         ORDER BY created_at DESC, id DESC
         LIMIT $2 OFFSET $3`,
        [filters, normalizedLimit, normalizedOffset]
      )
    ]);
    const total = Number(countResult.rows[0]?.total ?? 0);
    return {
      items: rowsResult.rows.map((row) => __internalMapWalletEntryRow(row)),
      pagination: {
        limit: normalizedLimit,
        offset: normalizedOffset,
        total,
        hasMore: normalizedOffset + rowsResult.rows.length < total
      }
    };
  }

  const sqlite = __internalGetSqlite();
  const total = Number(
    sqlite.prepare(`SELECT COUNT(*) AS total FROM wallet_entries WHERE type IN (?, ?)`).get(filters[0], filters[1])?.total ?? 0
  );
  const items = sqlite
    .prepare(
      `SELECT id, user_id, type, status, amount, before_balance, after_balance, reference_id, proof_url, note, created_at
       FROM wallet_entries
       WHERE type IN (?, ?)
       ORDER BY created_at DESC, id DESC
       LIMIT ? OFFSET ?`
    )
    .all(filters[0], filters[1], normalizedLimit, normalizedOffset)
    .map((row) => __internalMapWalletEntryRow(row));
  return {
    items,
    pagination: {
      limit: normalizedLimit,
      offset: normalizedOffset,
      total,
      hasMore: normalizedOffset + items.length < total
    }
  };
}

export async function getWalletAdminRequestItems({ history = false } = {}) {
  await autoRejectExpiredWithdrawRequests();
  if (isStandalonePostgresEnabled()) {
    const pool = await __internalGetReadyPgPool();
    const params = history ? [["DEPOSIT", "WITHDRAW"]] : [["INITIATED", "BACKOFFICE"]];
    const query = history
      ? `SELECT we.id, we.user_id, we.type, we.status, we.amount, we.before_balance, we.after_balance, we.reference_id, we.proof_url, we.note, we.created_at,
           u.phone AS user_phone, u.name AS user_name, u.approval_status AS user_approval_status,
           COALESCE(balance.balance, 0) AS live_balance,
           bank.id AS bank_id, bank.account_number AS bank_account_number, bank.holder_name AS bank_holder_name, bank.ifsc AS bank_ifsc, bank.created_at AS bank_created_at
         FROM wallet_entries we
         LEFT JOIN users u ON u.id = we.user_id
         LEFT JOIN LATERAL (
           SELECT COALESCE(SUM(${getWalletBalanceDeltaSql("latest.")}), 0) AS balance
           FROM wallet_entries latest
           WHERE latest.user_id = we.user_id
         ) balance ON TRUE
         LEFT JOIN LATERAL (SELECT id, account_number, holder_name, ifsc, created_at FROM bank_accounts WHERE user_id = we.user_id ORDER BY created_at DESC, id DESC LIMIT 1) bank ON TRUE
         WHERE we.type = ANY($1::text[])
         ORDER BY we.created_at DESC, we.id DESC`
      : `SELECT we.id, we.user_id, we.type, we.status, we.amount, we.before_balance, we.after_balance, we.reference_id, we.proof_url, we.note, we.created_at,
           u.phone AS user_phone, u.name AS user_name, u.approval_status AS user_approval_status,
           COALESCE(balance.balance, 0) AS live_balance,
           bank.id AS bank_id, bank.account_number AS bank_account_number, bank.holder_name AS bank_holder_name, bank.ifsc AS bank_ifsc, bank.created_at AS bank_created_at
         FROM wallet_entries we
         LEFT JOIN users u ON u.id = we.user_id
         LEFT JOIN LATERAL (
           SELECT COALESCE(SUM(${getWalletBalanceDeltaSql("latest.")}), 0) AS balance
           FROM wallet_entries latest
           WHERE latest.user_id = we.user_id
         ) balance ON TRUE
         LEFT JOIN LATERAL (SELECT id, account_number, holder_name, ifsc, created_at FROM bank_accounts WHERE user_id = we.user_id ORDER BY created_at DESC, id DESC LIMIT 1) bank ON TRUE
         WHERE (we.type = 'DEPOSIT' AND we.status = 'INITIATED')
            OR (we.type = 'WITHDRAW' AND we.status = ANY($1::text[]))
         ORDER BY we.created_at DESC, we.id DESC`;
    const result = await pool.query(query, params);
    return result.rows.map((row) => ({
      ...__internalMapWalletEntryRow(row),
      user: row.user_phone || row.user_name || row.user_approval_status ? { id: row.user_id, phone: row.user_phone ?? "", name: row.user_name ?? "", approvalStatus: row.user_approval_status ?? "Approved" } : null,
      liveBalance: Number(row.live_balance ?? 0),
      primaryBankAccount: row.bank_id ? { id: row.bank_id, accountNumber: row.bank_account_number, holderName: row.bank_holder_name, ifsc: row.bank_ifsc, createdAt: __internalToIso(row.bank_created_at) } : null,
      referenceId: row.reference_id ?? "",
      proofUrl: row.proof_url ?? "",
      note: row.note ?? ""
    }));
  }

  const sqlite = __internalGetSqlite();
  const query = history
    ? `SELECT we.id, we.user_id, we.type, we.status, we.amount, we.before_balance, we.after_balance, we.reference_id, we.proof_url, we.note, we.created_at,
         u.phone AS user_phone, u.name AS user_name, u.approval_status AS user_approval_status,
         COALESCE((SELECT SUM(${getWalletBalanceDeltaSql("latest.")}) FROM wallet_entries latest WHERE latest.user_id = we.user_id), 0) AS live_balance,
         (SELECT id FROM bank_accounts bank WHERE bank.user_id = we.user_id ORDER BY created_at DESC, id DESC LIMIT 1) AS bank_id,
         (SELECT account_number FROM bank_accounts bank WHERE bank.user_id = we.user_id ORDER BY created_at DESC, id DESC LIMIT 1) AS bank_account_number,
         (SELECT holder_name FROM bank_accounts bank WHERE bank.user_id = we.user_id ORDER BY created_at DESC, id DESC LIMIT 1) AS bank_holder_name,
         (SELECT ifsc FROM bank_accounts bank WHERE bank.user_id = we.user_id ORDER BY created_at DESC, id DESC LIMIT 1) AS bank_ifsc,
         (SELECT created_at FROM bank_accounts bank WHERE bank.user_id = we.user_id ORDER BY created_at DESC, id DESC LIMIT 1) AS bank_created_at
       FROM wallet_entries we
       LEFT JOIN users u ON u.id = we.user_id
       WHERE we.type IN (?, ?)
       ORDER BY we.created_at DESC, we.id DESC`
    : `SELECT we.id, we.user_id, we.type, we.status, we.amount, we.before_balance, we.after_balance, we.reference_id, we.proof_url, we.note, we.created_at,
         u.phone AS user_phone, u.name AS user_name, u.approval_status AS user_approval_status,
         COALESCE((SELECT SUM(${getWalletBalanceDeltaSql("latest.")}) FROM wallet_entries latest WHERE latest.user_id = we.user_id), 0) AS live_balance,
         (SELECT id FROM bank_accounts bank WHERE bank.user_id = we.user_id ORDER BY created_at DESC, id DESC LIMIT 1) AS bank_id,
         (SELECT account_number FROM bank_accounts bank WHERE bank.user_id = we.user_id ORDER BY created_at DESC, id DESC LIMIT 1) AS bank_account_number,
         (SELECT holder_name FROM bank_accounts bank WHERE bank.user_id = we.user_id ORDER BY created_at DESC, id DESC LIMIT 1) AS bank_holder_name,
         (SELECT ifsc FROM bank_accounts bank WHERE bank.user_id = we.user_id ORDER BY created_at DESC, id DESC LIMIT 1) AS bank_ifsc,
         (SELECT created_at FROM bank_accounts bank WHERE bank.user_id = we.user_id ORDER BY created_at DESC, id DESC LIMIT 1) AS bank_created_at
       FROM wallet_entries we
       LEFT JOIN users u ON u.id = we.user_id
       WHERE (we.type = ? AND we.status = ?)
          OR (we.type = ? AND we.status IN (?, ?))
       ORDER BY we.created_at DESC, we.id DESC`;
  const params = history ? ["DEPOSIT", "WITHDRAW"] : ["DEPOSIT", "INITIATED", "WITHDRAW", "INITIATED", "BACKOFFICE"];

  return sqlite.prepare(query).all(...params).map((row) => ({
    ...__internalMapWalletEntryRow(row),
    user: row.user_phone || row.user_name || row.user_approval_status ? { id: row.user_id, phone: row.user_phone ?? "", name: row.user_name ?? "", approvalStatus: row.user_approval_status ?? "Approved" } : null,
    liveBalance: Number(row.live_balance ?? 0),
    primaryBankAccount: row.bank_id ? { id: row.bank_id, accountNumber: row.bank_account_number, holderName: row.bank_holder_name, ifsc: row.bank_ifsc, createdAt: __internalToIso(row.bank_created_at) } : null,
    referenceId: row.reference_id ?? "",
    proofUrl: row.proof_url ?? "",
    note: row.note ?? ""
  }));
}

async function listAutoRejectCandidateWithdraws() {
  const todayIndia = getIndiaDateKey();
  const processingCutoffIso = new Date(Date.now() - WITHDRAW_PROCESSING_TIMEOUT_MS).toISOString();

  if (isStandalonePostgresEnabled()) {
    const pool = await __internalGetReadyPgPool();
    const result = await pool.query(
      `SELECT id, user_id, type, status, amount, before_balance, after_balance, reference_id, proof_url, note, created_at
       FROM wallet_entries
       WHERE type = 'WITHDRAW'
         AND status IN ('INITIATED', 'BACKOFFICE')
         AND (
           (status = 'BACKOFFICE' AND created_at <= $1)
           OR to_char((created_at AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD') < $2
         )
       ORDER BY created_at ASC, id ASC`,
      [processingCutoffIso, todayIndia]
    );
    return result.rows.map((row) => __internalMapWalletEntryRow(row));
  }

  const rows = __internalGetSqlite()
    .prepare(
      `SELECT id, user_id, type, status, amount, before_balance, after_balance, reference_id, proof_url, note, created_at
       FROM wallet_entries
       WHERE type = 'WITHDRAW'
         AND status IN ('INITIATED', 'BACKOFFICE')
       ORDER BY created_at ASC, id ASC`
    )
    .all()
    .map((row) => __internalMapWalletEntryRow(row));

  return rows.filter((entry) => {
    const createdAt = new Date(entry?.createdAt || "");
    if (Number.isNaN(createdAt.getTime())) {
      return false;
    }
    const status = String(entry?.status || "").toUpperCase();
    const isTimedOutProcessing = status === "BACKOFFICE" && createdAt.getTime() <= Date.now() - WITHDRAW_PROCESSING_TIMEOUT_MS;
    const isPreviousIndiaDay = getIndiaDateKey(createdAt) < todayIndia;
    return isTimedOutProcessing || isPreviousIndiaDay;
  });
}

async function applyAutoRejectToWithdrawEntry(entry, reason) {
  const currentNote = String(entry?.note || "").trim();
  const nextNote = currentNote ? `${currentNote} | ${reason}` : reason;
  const status = String(entry?.status || "").toUpperCase();

  if (status === "BACKOFFICE") {
    return updateWalletEntryAdmin(entry.id, {
      status: "REJECTED",
      beforeBalance: Number(entry.afterBalance ?? entry.beforeBalance ?? 0),
      afterBalance: Number(entry.beforeBalance ?? entry.afterBalance ?? 0),
      note: nextNote
    });
  }

  return updateWalletEntryAdmin(entry.id, {
    status: "REJECTED",
    beforeBalance: Number(entry.beforeBalance ?? 0),
    afterBalance: Number(entry.afterBalance ?? entry.beforeBalance ?? 0),
    note: nextNote
  });
}

export async function autoRejectExpiredWithdrawRequests({ force = false } = {}) {
  const now = Date.now();
  if (!force && now - lastAutoRejectSweepAt < AUTO_REJECT_SWEEP_MIN_INTERVAL_MS) {
    return { checked: false, rejectedCount: 0 };
  }
  if (autoRejectSweepPromise) {
    return autoRejectSweepPromise;
  }

  autoRejectSweepPromise = (async () => {
    const candidates = await listAutoRejectCandidateWithdraws();
    let rejectedCount = 0;
    for (const entry of candidates) {
      const latest = await findWalletEntryById(entry.id);
      if (!latest || !["INITIATED", "BACKOFFICE"].includes(String(latest.status || "").toUpperCase())) {
        continue;
      }
      await applyAutoRejectToWithdrawEntry(latest, getAutoRejectReason(latest, new Date()));
      rejectedCount += 1;
    }
    lastAutoRejectSweepAt = Date.now();
    return { checked: true, rejectedCount };
  })();

  try {
    return await autoRejectSweepPromise;
  } finally {
    autoRejectSweepPromise = null;
  }
}

export async function resolveWalletApprovalRequest(entryId, action) {
  const request = await findWalletEntryById(entryId);
  if (!request || request.status !== "INITIATED" || !["DEPOSIT", "WITHDRAW"].includes(request.type)) {
    return null;
  }

  if (action === "reject") {
    return { request: await updateWalletEntryStatus(entryId, "REJECTED"), settlementEntry: null };
  }

  await rebalanceWalletEntriesForUser(request.userId);
  const beforeBalance = await getUserBalance(request.userId);
  if (request.type === "WITHDRAW" && request.amount > beforeBalance) {
    throw new Error("User has insufficient live balance for withdraw approval");
  }

  if (request.type === "DEPOSIT") {
    const approvedRequest = await updateWalletEntryAdmin(entryId, {
      status: "SUCCESS",
      beforeBalance,
      afterBalance: beforeBalance + request.amount
    });
    const { applyFirstDepositBonusIfEligible, applyReferralDepositBonusIfEligible } = await import("../db.mjs");
    const bonusEntry = await applyFirstDepositBonusIfEligible({
      userId: request.userId,
      depositAmount: request.amount,
      depositEntryId: entryId
    });
    await applyReferralDepositBonusIfEligible({
      userId: request.userId,
      depositAmount: request.amount,
      depositEntryId: entryId
    });
    await rebalanceWalletEntriesForUser(request.userId);
    return {
      request: (await findWalletEntryById(entryId)) ?? approvedRequest,
      settlementEntry: bonusEntry
    };
  }

  return {
    request: await updateWalletEntryAdmin(entryId, {
      status: "BACKOFFICE",
      beforeBalance,
      afterBalance: beforeBalance - request.amount
    }),
    settlementEntry: null
  };
}

export async function completeWalletRequest(entryId) {
  const request = await findWalletEntryById(entryId);
  if (!request || !["DEPOSIT", "WITHDRAW"].includes(request.type)) return null;
  if (request.status === "SUCCESS") return request;

  if (request.type === "DEPOSIT" && request.status !== "INITIATED") {
    throw new Error("Deposit completion skipped: only pending deposits can be credited safely");
  }

  if (request.type === "WITHDRAW" && request.status === "BACKOFFICE") {
    const completedRequest = await updateWalletEntryAdmin(entryId, {
      status: "SUCCESS",
      beforeBalance: Number(request.beforeBalance ?? 0),
      afterBalance: Number(request.afterBalance ?? 0)
    });
    await rebalanceWalletEntriesForUser(request.userId);
    return (await findWalletEntryById(entryId)) ?? completedRequest;
  }

  await rebalanceWalletEntriesForUser(request.userId);
  const beforeBalance = await getUserBalance(request.userId);
  if (request.type === "WITHDRAW" && request.amount > beforeBalance) {
    throw new Error("User has insufficient live balance for withdraw completion");
  }

  const completedRequest = await updateWalletEntryAdmin(entryId, {
    status: "SUCCESS",
    beforeBalance,
    afterBalance: request.type === "DEPOSIT" ? beforeBalance + request.amount : beforeBalance - request.amount
  });

  if (request.type === "DEPOSIT") {
    const { applyFirstDepositBonusIfEligible, applyReferralDepositBonusIfEligible } = await import("../db.mjs");
    await applyFirstDepositBonusIfEligible({
      userId: request.userId,
      depositAmount: request.amount,
      depositEntryId: entryId
    });
    await applyReferralDepositBonusIfEligible({
      userId: request.userId,
      depositAmount: request.amount,
      depositEntryId: entryId
    });
  }

  await rebalanceWalletEntriesForUser(request.userId);
  return (await findWalletEntryById(entryId)) ?? completedRequest;
}

export async function rejectWalletRequest(entryId) {
  const request = await findWalletEntryById(entryId);
  if (!request || !["DEPOSIT", "WITHDRAW"].includes(request.type)) return null;
  if (!["INITIATED", "BACKOFFICE"].includes(String(request.status || ""))) return null;

  if (request.type === "WITHDRAW" && String(request.status || "") === "BACKOFFICE") {
    const restored = await updateWalletEntryAdmin(entryId, {
      status: "REJECTED",
      beforeBalance: Number(request.afterBalance ?? request.beforeBalance ?? 0),
      afterBalance: Number(request.beforeBalance ?? request.afterBalance ?? 0)
    });
    await rebalanceWalletEntriesForUser(request.userId);
    return restored;
  }

  return updateWalletEntryAdmin(entryId, {
    status: "REJECTED",
    beforeBalance: request.beforeBalance ?? 0,
    afterBalance: request.afterBalance ?? request.beforeBalance ?? 0
  });
}
