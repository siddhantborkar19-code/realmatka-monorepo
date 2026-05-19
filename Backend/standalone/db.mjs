import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { Pool } from "pg";
import { fileURLToPath } from "node:url";
import { standaloneConfig, isStandalonePostgresEnabled } from "./config.mjs";
import { hashSecret } from "./http.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.resolve(__dirname, "..");
const projectRoot = path.resolve(backendRoot, "..");
const chartDataDirs = [
  path.join(backendRoot, "chart-data"),
  path.join(projectRoot, "data"),
  path.join(backendRoot, "data")
];
const sqlitePath = path.join(backendRoot, "data", "server.db");
const postgresSchemaSql = readFileSync(path.join(backendRoot, "postgres-schema.sql"), "utf8");
const sessionTtlMs = standaloneConfig.sessionTtlHours * 60 * 60 * 1000;
const authSessionCache = new Map();
const AUTH_SESSION_CACHE_TTL_MS = 15_000;
const signupBonusAmount = 25;
const signupBonusPromoAmount = 50;
const signupBonusPromoUserLimit = 50;
const signupBonusPromoAwardedCountSettingKey = "signup_bonus_promo_awarded_count";
const firstDepositBonusMinimum = 1000;
const firstDepositBonusUpperTierMinimum = 2000;
const firstDepositBonusBaseAmount = 50;
const firstDepositBonusUpperTierAmount = 100;
const specialDepositBonusMinimum = 5000;
const specialDepositBonusUpperTierMinimum = 10000;
const specialDepositBonusBaseAmount = 500;
const specialDepositBonusUpperTierAmount = 1000;
const defaultNoticeText =
  "Abhi market aur betting running hai. Aap app me bet place kar sakte ho. First deposit bonus: Rs 1000 par 50 points aur Rs 2000 par 100 points milenge. Bonus sirf first deposit par milega.";
const supportChatResolvedRetentionMs = Math.max(1, standaloneConfig.supportChatResolvedRetentionDays) * 24 * 60 * 60 * 1000;
const dbIndexDefinitions = [
  ["idx_users_role_approval_joined_at", "users (role, approval_status, joined_at DESC)"],
  ["idx_admin_accounts_phone", "admin_accounts (phone)"],
  ["idx_admins_phone", "admins (phone)"],
  ["idx_users_status_flags", "users (blocked_at, deactivated_at)"],
  ["idx_sessions_user_created_at", "sessions (user_id, created_at DESC)"],
  ["idx_admin_sessions_admin_created_at", "admin_sessions (admin_id, created_at DESC)"],
  ["idx_otp_challenges_phone_purpose_created_at", "otp_challenges (phone, purpose, created_at DESC)"],
  ["idx_otp_challenges_phone_purpose_expires_at", "otp_challenges (phone, purpose, expires_at DESC)"],
  ["idx_wallet_entries_user_created_at", "wallet_entries (user_id, created_at DESC)"],
  ["idx_wallet_entries_type_status_created_at", "wallet_entries (type, status, created_at DESC)"],
  ["idx_wallet_entries_user_type_created_at", "wallet_entries (user_id, type, created_at DESC)"],
  ["idx_wallet_entries_user_reference_id", "wallet_entries (user_id, reference_id)"],
  ["idx_bids_user_created_at", "bids (user_id, created_at DESC)"],
  ["idx_bids_market_created_at", "bids (market, created_at DESC)"],
  ["idx_bids_market_status_created_at", "bids (market, status, created_at DESC)"],
  ["idx_bids_user_status_created_at", "bids (user_id, status, created_at DESC)"],
  ["idx_bank_accounts_user_created_at", "bank_accounts (user_id, created_at DESC)"],
  ["idx_audit_logs_actor_created_at", "audit_logs (actor_user_id, created_at DESC)"],
  ["idx_audit_logs_entity_created_at", "audit_logs (entity_type, entity_id, created_at DESC)"],
  ["idx_notification_devices_user_enabled_updated_at", "notification_devices (user_id, enabled, updated_at DESC)"],
  ["idx_notifications_user_read_created_at", "notifications (user_id, read, created_at DESC)"],
  ["idx_payment_orders_user_created_at", "payment_orders (user_id, created_at DESC)"],
  ["idx_payment_orders_status_created_at", "payment_orders (status, created_at DESC)"],
  ["idx_chat_conversations_user_updated_at", "chat_conversations (user_id, updated_at DESC)"],
  ["idx_chat_conversations_status_last_message_at", "chat_conversations (status, last_message_at DESC)"],
  ["idx_chat_messages_conversation_created_at", "chat_messages (conversation_id, created_at DESC)"]
];

let sqlite = null;
let pgPool = null;
let pgBootstrapPromise = null;

function getDefaultSeedAdmin() {
  if (standaloneConfig.envAdminPhone && standaloneConfig.envAdminPassword) {
    return {
      id: "admin_1",
      phone: standaloneConfig.envAdminPhone,
      passwordHash: hashSecret(standaloneConfig.envAdminPassword),
      displayName: standaloneConfig.envAdminName,
      createdAt: "2025-04-12T10:00:00.000Z",
      role: "admin",
      twoFactorEnabled: true
    };
  }

  if (!standaloneConfig.allowDefaultAdminSeed) {
    return null;
  }
  if (!standaloneConfig.defaultAdminPhone || !standaloneConfig.defaultAdminPassword) {
    return null;
  }

  return {
    id: "admin_1",
    phone: standaloneConfig.defaultAdminPhone,
    passwordHash: hashSecret(standaloneConfig.defaultAdminPassword),
    displayName: standaloneConfig.defaultAdminName,
    createdAt: "2025-04-12T10:00:00.000Z",
    role: "admin",
    twoFactorEnabled: true
  };
}

function getDefaultWalletEntry() {
  return null;
}

function isUserAccountActive(user) {
  return Boolean(user) && !user.blockedAt && !user.deactivatedAt;
}

async function findSupportSenderUserId() {
  if (isStandalonePostgresEnabled()) {
    const pool = await getReadyPgPool();
    const result = await pool.query(
      `SELECT id
       FROM users
       WHERE role = 'admin'
       ORDER BY joined_at ASC, id ASC
       LIMIT 1`
    );
    return result.rows[0]?.id ?? null;
  }

  const row = getSqlite()
    .prepare(
      `SELECT id
       FROM users
       WHERE role = 'admin'
       ORDER BY joined_at ASC, id ASC
       LIMIT 1`
    )
    .get();
  return row?.id ?? null;
}

const seededMarkets = [
  ["seed_ntr_morning", "ntr-morning", "NTR Morning", "***-**-***", "Betting open now", "Place Bet", "09:00 AM", "10:00 AM", "main"],
  ["seed_sita_morning", "sita-morning", "Sita Morning", "***-**-***", "Betting open now", "Place Bet", "09:40 AM", "10:40 AM", "main"],
  ["seed_karnataka_day", "karnataka-day", "Karnataka Day", "***-**-***", "Betting open now", "Place Bet", "09:55 AM", "10:55 AM", "main"],
  ["seed_star_tara_morning", "star-tara-morning", "Star Tara Morning", "***-**-***", "Betting open now", "Place Bet", "10:05 AM", "11:05 AM", "main"],
  ["seed_milan_morning", "milan-morning", "Milan Morning", "***-**-***", "Betting open now", "Place Bet", "10:10 AM", "11:10 AM", "main"],
  ["seed_maya_bazar", "maya-bazar", "Maya Bazar", "***-**-***", "Betting open now", "Place Bet", "10:15 AM", "11:15 AM", "main"],
  ["seed_andhra_morning", "andhra-morning", "Andhra Morning", "***-**-***", "Betting open now", "Place Bet", "10:35 AM", "11:35 AM", "main"],
  ["seed_sridevi_morning", "sridevi-morning", "Sridevi Morning", "***-**-***", "Betting open now", "Place Bet", "10:00 AM", "11:00 AM", "main"],
  ["seed_sridevi", "sridevi", "Sridevi", "***-**-***", "Betting open now", "Place Bet", "11:25 AM", "12:25 PM", "main"],
  ["seed_kalyan_morning", "kalyan-morning", "Kalyan Morning", "***-**-***", "Betting open now", "Place Bet", "11:40 AM", "12:40 PM", "main"],
  ["seed_mahadevi_morning", "mahadevi-morning", "Mahadevi Morning", "***-**-***", "Betting open now", "Place Bet", "11:40 AM", "12:40 PM", "main"],
  ["seed_time_bazar", "time-bazar", "Time Bazar", "***-**-***", "Betting open now", "Place Bet", "12:45 PM", "01:45 PM", "main"],
  ["seed_madhur_day", "madhur-day", "Madhur Day", "***-**-***", "Betting open now", "Place Bet", "01:20 PM", "02:20 PM", "main"],
  ["seed_sita_day", "sita-day", "Sita Day", "***-**-***", "Betting open now", "Place Bet", "01:40 PM", "02:40 PM", "main"],
  ["seed_star_tara_day", "star-tara-day", "Star Tara Day", "***-**-***", "Betting open now", "Place Bet", "02:15 PM", "03:15 PM", "main"],
  ["seed_milan_day", "milan-day", "Milan Day", "***-**-***", "Betting open now", "Place Bet", "02:45 PM", "04:45 PM", "main"],
  ["seed_rajdhani_day", "rajdhani-day", "Rajdhani Day", "***-**-***", "Betting open now", "Place Bet", "03:00 PM", "05:00 PM", "main"],
  ["seed_andhra_day", "andhra-day", "Andhra Day", "***-**-***", "Betting open now", "Place Bet", "03:30 PM", "05:30 PM", "main"],
  ["seed_kalyan", "kalyan", "Kalyan", "***-**-***", "Betting open now", "Place Bet", "04:10 PM", "06:10 PM", "main"],
  ["seed_mahadevi", "mahadevi", "Mahadevi", "***-**-***", "Betting open now", "Place Bet", "04:25 PM", "06:25 PM", "main"],
  ["seed_ntr_day", "ntr-day", "NTR Day", "***-**-***", "Betting open now", "Place Bet", "04:50 PM", "06:50 PM", "main"],
  ["seed_sita_night", "sita-night", "Sita Night", "***-**-***", "Betting open now", "Place Bet", "06:40 PM", "07:40 PM", "main"],
  ["seed_sridevi_night", "sridevi-night", "Sridevi Night", "***-**-***", "Betting open now", "Place Bet", "07:05 PM", "08:05 PM", "main"],
  ["seed_star_tara_night", "star-tara-night", "Star Tara Night", "***-**-***", "Betting open now", "Place Bet", "07:15 PM", "08:15 PM", "main"],
  ["seed_mahadevi_night", "mahadevi-night", "Mahadevi Night", "***-**-***", "Betting open now", "Place Bet", "07:45 PM", "08:45 PM", "main"],
  ["seed_madhur_night", "madhur-night", "Madhur Night", "***-**-***", "Betting open now", "Place Bet", "08:20 PM", "10:20 PM", "main"],
  ["seed_supreme_night", "supreme-night", "Supreme Night", "***-**-***", "Betting open now", "Place Bet", "08:35 PM", "10:35 PM", "main"],
  ["seed_andhra_night", "andhra-night", "Andhra Night", "***-**-***", "Betting open now", "Place Bet", "08:40 PM", "10:40 PM", "main"],
  ["seed_ntr_night", "ntr-night", "NTR Night", "***-**-***", "Betting open now", "Place Bet", "08:50 PM", "10:50 PM", "main"],
  ["seed_milan_night", "milan-night", "Milan Night", "***-**-***", "Betting open now", "Place Bet", "08:50 PM", "10:50 PM", "main"],
  ["seed_kalyan_night", "kalyan-night", "Kalyan Night", "***-**-***", "Betting open now", "Place Bet", "09:25 PM", "11:25 PM", "main"],
  ["seed_rajdhani_night", "rajdhani-night", "Rajdhani Night", "***-**-***", "Betting open now", "Place Bet", "09:30 PM", "11:40 PM", "main"],
  ["seed_main_bazar", "main-bazar", "Main Bazar", "***-**-***", "Betting open now", "Place Bet", "09:45 PM", "11:55 PM", "main"],
  ["seed_mangal_bazar", "mangal-bazar", "Mangal Bazar", "***-**-***", "Betting open now", "Place Bet", "10:05 PM", "11:05 PM", "main"]
];

function nowIso() {
  return new Date().toISOString();
}

function roundMoney(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

const referralLossCommissionRate = Number(process.env.REFERRAL_LOSS_COMMISSION_RATE || "0.2");
const referralCommissionThreshold = Math.max(0.01, Number(process.env.REFERRAL_COMMISSION_THRESHOLD || "10"));
const referralDepositBonusRate = Math.max(0, Number(process.env.REFERRAL_DEPOSIT_BONUS_RATE || "2"));
const referralDepositBonusMaxTimesPerUser = Math.max(0, Math.floor(Number(process.env.REFERRAL_DEPOSIT_BONUS_MAX_TIMES_PER_USER || "5")));
const referralDepositBonusMaxPerDeposit = Math.max(0, Number(process.env.REFERRAL_DEPOSIT_BONUS_MAX_PER_DEPOSIT || "100"));

function settingValue(settings, key, fallback) {
  const item = settings.find((entry) => entry.key === key);
  const value = String(item?.value ?? "").trim();
  return value ? value : fallback;
}

function settingBool(settings, key, fallback) {
  const value = String(settingValue(settings, key, fallback ? "true" : "false")).trim().toLowerCase();
  return ["1", "true", "yes", "on", "enabled"].includes(value);
}

function settingNumber(settings, key, fallback) {
  const value = Number(settingValue(settings, key, String(fallback)));
  return Number.isFinite(value) ? value : fallback;
}

function getIndiaDateString(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function toIso(value) {
  if (!value) {
    return null;
  }
  return value instanceof Date ? value.toISOString() : String(value);
}

function toBool(value) {
  return value === true || value === 1 || value === "1" || value === "true";
}

function toChartRows(value) {
  if (Array.isArray(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    return JSON.parse(value);
  }
  return [];
}

function formatChartDayForRows(value) {
  const month = value.toLocaleString("en-US", { month: "short" });
  const day = String(value.getDate()).padStart(2, "0");
  return `${month} ${day}`;
}

function getWeekStartForRows(date) {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  const day = value.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  value.setDate(value.getDate() + diff);
  return value;
}

function getWeekEndForRows(date) {
  const value = getWeekStartForRows(date);
  value.setDate(value.getDate() + 6);
  return value;
}

function getWeekChartLabelForRows(date) {
  const start = getWeekStartForRows(date);
  const end = getWeekEndForRows(date);
  return `${start.getFullYear()} ${formatChartDayForRows(start)} to ${formatChartDayForRows(end)}`;
}

function parseWeekLabelStartDateForRows(label) {
  const value = String(label || "").trim();
  let match = value.match(/^(\d{4})\s+([A-Za-z]{3})\s+(\d{2})\s+to\s+([A-Za-z]{3})\s+(\d{2})$/);
  if (match) {
    const [, year, month, day] = match;
    const parsed = new Date(`${month} ${day}, ${year} 00:00:00`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  match = value.match(/^(\d{4})\s+(\d{2})\s+([A-Za-z]{3})\s+to\s+(\d{2})\s+([A-Za-z]{3})$/);
  if (match) {
    const [, year, day, month] = match;
    const parsed = new Date(`${month} ${day}, ${year} 00:00:00`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  return null;
}

function normalizeWeekLabelForRows(label) {
  const parsed = parseWeekLabelStartDateForRows(label);
  return parsed ? getWeekChartLabelForRows(parsed) : String(label || "").trim();
}

function isPlaceholderChartCellForRows(value) {
  const text = String(value || "").trim();
  return !text || text === "**" || text === "***" || text === "--" || text === "---";
}

function sortChartRowsChronologicallyForRows(rows) {
  return [...rows].sort((left, right) => {
    const leftParsed = parseWeekLabelStartDateForRows(left?.[0]);
    const rightParsed = parseWeekLabelStartDateForRows(right?.[0]);
    const leftTime = leftParsed ? leftParsed.getTime() : Number.MAX_SAFE_INTEGER;
    const rightTime = rightParsed ? rightParsed.getTime() : Number.MAX_SAFE_INTEGER;
    return leftTime - rightTime;
  });
}

function normalizeChartRowsForStorage(chartType, rows) {
  const size = chartType === "panna" ? 14 : 7;
  const placeholder = chartType === "panna" ? "---" : "--";
  const merged = new Map();

  for (const sourceRow of Array.isArray(rows) ? rows : []) {
    if (!Array.isArray(sourceRow) || sourceRow.length === 0) {
      continue;
    }

    const label = normalizeWeekLabelForRows(sourceRow[0]);
    const base = merged.get(label) ?? [label, ...Array.from({ length: size }, () => placeholder)];
    for (let index = 0; index < size; index += 1) {
      const candidate = String(sourceRow[index + 1] ?? "").trim();
      if (!isPlaceholderChartCellForRows(candidate)) {
        base[index + 1] = candidate;
      }
    }
    merged.set(label, base);
  }

  return sortChartRowsChronologicallyForRows(Array.from(merged.values()));
}

function hasMeaningfulChartRows(rows) {
  return (Array.isArray(rows) ? rows : []).some(
    (row) => Array.isArray(row) && row.slice(1).some((cell) => !isPlaceholderChartCellForRows(cell))
  );
}

function loadChartSeedPayloads() {
  const payloadBySlug = new Map();
  for (const dirPath of chartDataDirs) {
    let fileNames = [];
    try {
      fileNames = readdirSync(dirPath).filter((fileName) => fileName.endsWith(".chart.json"));
    } catch {
      continue;
    }

    for (const fileName of fileNames) {
      try {
        const payload = JSON.parse(readFileSync(path.join(dirPath, fileName), "utf8"));
        const slug = String(payload?.slug || fileName.replace(/\.chart\.json$/i, "")).trim();
        if (!slug) {
          continue;
        }

        payloadBySlug.set(slug, {
          slug,
          jodi: Array.isArray(payload?.jodi) ? payload.jodi : [],
          panna: Array.isArray(payload?.panna) ? payload.panna : []
        });
      } catch {
        // Skip malformed chart seed files instead of breaking backend bootstrap.
      }
    }
  }

  return Array.from(payloadBySlug.values());
}

async function syncChartsFromFilesToPostgres(client) {
  const chartPayloads = loadChartSeedPayloads();
  for (const payload of chartPayloads) {
    for (const chartType of ["jodi", "panna"]) {
      const fileRows = normalizeChartRowsForStorage(chartType, payload[chartType]);
      const existing = await client.query(
        `SELECT rows_json
         FROM charts
         WHERE market_slug = $1 AND chart_type = $2
         LIMIT 1`,
        [payload.slug, chartType]
      );
      const existingRows = normalizeChartRowsForStorage(chartType, toChartRows(existing.rows[0]?.rows_json));
      const mergedRows = normalizeChartRowsForStorage(chartType, [...existingRows, ...fileRows]);
      const targetRows = hasMeaningfulChartRows(existingRows) ? mergedRows : fileRows;
      await client.query(
        `INSERT INTO charts (market_slug, chart_type, rows_json)
         VALUES ($1, $2, $3)
         ON CONFLICT (market_slug, chart_type) DO UPDATE SET rows_json = EXCLUDED.rows_json`,
        [payload.slug, chartType, JSON.stringify(targetRows)]
      );
    }
  }
}

function syncChartsFromFilesToSqlite(db) {
  const upsertChartStatement = db.prepare(
    `INSERT INTO charts (market_slug, chart_type, rows_json)
     VALUES (?, ?, ?)
     ON CONFLICT(market_slug, chart_type) DO UPDATE SET rows_json = excluded.rows_json`
  );
  const selectExistingStatement = db.prepare(
    `SELECT rows_json
     FROM charts
     WHERE market_slug = ? AND chart_type = ?
     LIMIT 1`
  );
  const chartPayloads = loadChartSeedPayloads();

  for (const payload of chartPayloads) {
    for (const chartType of ["jodi", "panna"]) {
      const fileRows = normalizeChartRowsForStorage(chartType, payload[chartType]);
      const existing = selectExistingStatement.get(payload.slug, chartType);
      const existingRows = normalizeChartRowsForStorage(chartType, toChartRows(existing?.rows_json));
      const mergedRows = normalizeChartRowsForStorage(chartType, [...existingRows, ...fileRows]);
      const targetRows = hasMeaningfulChartRows(existingRows) ? mergedRows : fileRows;
      upsertChartStatement.run(payload.slug, chartType, JSON.stringify(targetRows));
    }
  }
}

function mapUserRow(row) {
  return row
    ? {
        id: row.id,
        phone: row.phone,
        email: row.email ?? "",
        googleSub: row.google_sub ?? "",
        googleLinkedAt: toIso(row.google_linked_at),
        authProvider: row.auth_provider ?? "password",
        passwordHash: row.password_hash,
        mpinHash: row.mpin_hash,
        hasMpin: toBool(row.mpin_configured),
        name: row.name,
        joinedAt: toIso(row.joined_at),
        referralCode: row.referral_code,
        role: row.role,
        approvalStatus: row.approval_status ?? "Approved",
        approvedAt: toIso(row.approved_at),
        rejectedAt: toIso(row.rejected_at),
        blockedAt: toIso(row.blocked_at),
        deactivatedAt: toIso(row.deactivated_at),
        statusNote: row.status_note ?? "",
        signupBonusGranted: toBool(row.signup_bonus_granted),
        firstDepositBonusGranted: toBool(row.first_deposit_bonus_granted),
        referredByUserId: row.referred_by_user_id ?? null,
        referralCommissionCarry: roundMoney(row.referral_commission_carry ?? 0)
      }
    : null;
}

function getCachedActiveUserByTokenHash(tokenHash) {
  const cached = authSessionCache.get(tokenHash);
  if (!cached) {
    return null;
  }

  if (cached.expiresAt <= Date.now()) {
    authSessionCache.delete(tokenHash);
    return null;
  }

  return cached.user;
}

function cacheActiveUserByTokenHash(tokenHash, user) {
  if (!tokenHash || !user) {
    return;
  }

  authSessionCache.set(tokenHash, {
    user,
    expiresAt: Date.now() + AUTH_SESSION_CACHE_TTL_MS
  });
}

function clearCachedAuthSession(tokenHash) {
  if (!tokenHash) {
    return;
  }
  authSessionCache.delete(tokenHash);
}

async function ensureSeedAdminInPostgres(client, seedAdmin) {
  if (!seedAdmin) {
    return;
  }

  await client.query(
    `INSERT INTO admins (id, phone, password_hash, display_name, role, two_factor_enabled, two_factor_secret, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, NULL, $7, $7)
     ON CONFLICT (id) DO UPDATE SET
       phone = EXCLUDED.phone,
       password_hash = EXCLUDED.password_hash,
       display_name = EXCLUDED.display_name,
       role = EXCLUDED.role,
       two_factor_enabled = EXCLUDED.two_factor_enabled,
       updated_at = EXCLUDED.updated_at`,
    [
      seedAdmin.id,
      seedAdmin.phone,
      seedAdmin.passwordHash,
      seedAdmin.displayName,
      seedAdmin.role,
      seedAdmin.twoFactorEnabled,
      seedAdmin.createdAt
    ]
  );
}

function ensureSeedAdminInSqlite(db, seedAdmin) {
  if (!seedAdmin) {
    return;
  }

  db.prepare(
    `INSERT INTO admins (id, phone, password_hash, display_name, role, two_factor_enabled, two_factor_secret, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       phone = excluded.phone,
       password_hash = excluded.password_hash,
       display_name = excluded.display_name,
       role = excluded.role,
       two_factor_enabled = excluded.two_factor_enabled,
       updated_at = excluded.updated_at`
  ).run(
    seedAdmin.id,
    seedAdmin.phone,
    seedAdmin.passwordHash,
    seedAdmin.displayName,
    seedAdmin.role,
    seedAdmin.twoFactorEnabled ? 1 : 0,
    seedAdmin.createdAt,
    seedAdmin.createdAt
  );
}

function mapWalletEntryRow(row) {
  return row
    ? {
        id: row.id,
        userId: row.user_id,
        type: row.type,
        status: row.status,
        amount: Number(row.amount),
        beforeBalance: Number(row.before_balance),
        afterBalance: Number(row.after_balance),
        referenceId: row.reference_id ?? "",
        proofUrl: row.proof_url ?? "",
        note: row.note ?? "",
        createdAt: toIso(row.created_at)
      }
    : null;
}

function mapPaymentOrderRow(row) {
  return row
    ? {
        id: row.id,
        userId: row.user_id,
        provider: row.provider,
        amount: Number(row.amount),
        status: row.status,
        reference: row.reference,
        checkoutToken: row.checkout_token ?? null,
        gatewayOrderId: row.gateway_order_id ?? null,
        gatewayPaymentId: row.gateway_payment_id ?? null,
        gatewaySignature: row.gateway_signature ?? null,
        verifiedAt: toIso(row.verified_at),
        redirectUrl: row.redirect_url ?? null,
        createdAt: toIso(row.created_at),
        updatedAt: toIso(row.updated_at)
      }
    : null;
}

function mapChatConversationRow(row) {
  return row
    ? {
        id: row.id,
        userId: row.user_id,
        status: row.status,
        createdAt: toIso(row.created_at),
        updatedAt: toIso(row.updated_at),
        lastMessageAt: toIso(row.last_message_at),
        resolvedAt: toIso(row.resolved_at)
      }
    : null;
}

function mapChatMessageRow(row) {
  return row
    ? {
        id: row.id,
        conversationId: row.conversation_id,
        senderRole: row.sender_role,
        senderUserId: row.sender_user_id ?? null,
        text: row.text,
        readByUser: toBool(row.read_by_user),
        readByAdmin: toBool(row.read_by_admin),
        createdAt: toIso(row.created_at)
      }
    : null;
}

function mapBidRow(row) {
  return row
    ? {
        id: row.id,
        userId: row.user_id,
        market: row.market,
        marketDay: row.market_day ?? null,
        boardLabel: row.board_label,
        gameType: row.game_type ?? row.board_label,
        sessionType: row.session_type,
        digit: row.digit,
        points: Number(row.points),
        status: row.status,
        payout: Number(row.payout ?? 0),
        settledAt: toIso(row.settled_at),
        settledResult: row.settled_result ?? null,
        createdAt: toIso(row.created_at)
      }
    : null;
}

function mapBankRow(row) {
  return row
    ? {
        id: row.id,
        accountNumber: row.account_number,
        holderName: row.holder_name,
        ifsc: row.ifsc,
        createdAt: toIso(row.created_at)
      }
    : null;
}

function mapMarketRow(row) {
  return row
    ? {
        id: row.id,
        slug: row.slug,
        name: row.name,
        result: row.result,
        status: row.status,
        action: row.action,
        open: row.open_time,
        close: row.close_time,
        category: row.category
      }
    : null;
}

function parseClockTimeToMinutes(value) {
  if (typeof value !== "string") {
    return Number.MAX_SAFE_INTEGER;
  }

  const match = value.trim().match(/^(\d{1,2}):(\d{2})\s*([AP]M)$/i);
  if (!match) {
    return Number.MAX_SAFE_INTEGER;
  }

  let hours = Number(match[1]) % 12;
  const minutes = Number(match[2]);
  const meridiem = match[3].toUpperCase();

  if (meridiem === "PM") {
    hours += 12;
  }

  return hours * 60 + minutes;
}

function sortMarketsByOpenTime(markets) {
  return [...markets].sort((left, right) => {
    const openDiff = parseClockTimeToMinutes(left.open) - parseClockTimeToMinutes(right.open);
    if (openDiff !== 0) {
      return openDiff;
    }

    const closeDiff = parseClockTimeToMinutes(left.close) - parseClockTimeToMinutes(right.close);
    if (closeDiff !== 0) {
      return closeDiff;
    }

    return left.name.localeCompare(right.name);
  });
}

function mapNotificationDeviceRow(row) {
  return row
    ? {
        id: row.id,
        userId: row.user_id,
        platform: row.platform,
        token: row.token,
        enabled: toBool(row.enabled),
        createdAt: toIso(row.created_at),
        updatedAt: toIso(row.updated_at)
      }
    : null;
}

function mapAuditLogRow(row) {
  return row
    ? {
        id: row.id,
        actorUserId: row.actor_user_id,
        action: row.action,
        entityType: row.entity_type,
        entityId: row.entity_id,
        details: row.details,
        createdAt: toIso(row.created_at)
      }
    : null;
}

function mapAppSettingRow(row) {
  return row
    ? {
        key: row.setting_key,
        value: row.setting_value,
        updatedAt: toIso(row.updated_at)
      }
    : null;
}

function ensureSqliteColumn(db, tableName, columnName, definition) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
  if (!columns.some((column) => column.name === columnName)) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }
}

async function ensurePostgresIndexes(client) {
  for (const [indexName, target] of dbIndexDefinitions) {
    await client.query(`CREATE INDEX IF NOT EXISTS ${indexName} ON ${target}`);
  }
}

function ensureSqliteIndexes(db) {
  for (const [indexName, target] of dbIndexDefinitions) {
    db.exec(`CREATE INDEX IF NOT EXISTS ${indexName} ON ${target}`);
  }
}

function verifyCredential(input, storedHash) {
  if (typeof storedHash !== "string" || !storedHash) {
    return false;
  }

  if (storedHash.startsWith("scrypt$")) {
    const [, salt, expected] = storedHash.split("$");
    if (!salt || !expected) {
      return false;
    }

    const actual = Buffer.from(scryptSync(input, salt, 64).toString("hex"));
    const desired = Buffer.from(expected);
    return actual.length === desired.length && timingSafeEqual(actual, desired);
  }

  const actual = Buffer.from(hashSecret(input));
  const desired = Buffer.from(storedHash);
  return actual.length === desired.length && timingSafeEqual(actual, desired);
}

function hashCredential(input) {
  const salt = randomBytes(16).toString("hex");
  const digest = scryptSync(input, salt, 64).toString("hex");
  return `scrypt$${salt}$${digest}`;
}

function isLocalPostgresUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    const hostname = (parsed.hostname || "").toLowerCase();
    return (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "::1" ||
      hostname.startsWith("192.168.") ||
      hostname.startsWith("10.") ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname)
    );
  } catch {
    return false;
  }
}

async function ensurePostgresBootstrap(pool) {
  if (pgBootstrapPromise) {
    return pgBootstrapPromise;
  }

  pgBootstrapPromise = (async () => {
    const client = await pool.connect();
    try {
      const defaultUser = getDefaultSeedAdmin();
      const defaultWalletEntry = getDefaultWalletEntry(defaultUser);
      await client.query("BEGIN");
      const usersTableExists = Boolean((await client.query(`SELECT to_regclass('public.users') AS value`)).rows[0]?.value);
      if (!usersTableExists) {
        await client.query(postgresSchemaSql);
      }
      await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ`);
      await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT`);
      await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS google_sub TEXT`);
      await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS google_linked_at TIMESTAMPTZ`);
      await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_provider TEXT NOT NULL DEFAULT 'password'`);
      await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ`);
      await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS blocked_at TIMESTAMPTZ`);
      await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMPTZ`);
      await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS status_note TEXT`);
      await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS mpin_configured BOOLEAN NOT NULL DEFAULT FALSE`);
      await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS signup_bonus_granted BOOLEAN NOT NULL DEFAULT FALSE`);
      await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS first_deposit_bonus_granted BOOLEAN NOT NULL DEFAULT FALSE`);
      await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS referred_by_user_id TEXT`);
      await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_commission_carry NUMERIC(12,2) NOT NULL DEFAULT 0`);
      await client.query(`ALTER TABLE bids ADD COLUMN IF NOT EXISTS market_day TEXT`);
      await client.query(`ALTER TABLE bids ADD COLUMN IF NOT EXISTS game_type TEXT`);
      await client.query(`ALTER TABLE markets ADD COLUMN IF NOT EXISTS result_locked_at TIMESTAMPTZ`);
      await client.query(`ALTER TABLE markets ADD COLUMN IF NOT EXISTS result_locked_by_user_id TEXT REFERENCES users(id)`);
      await client.query(`ALTER TABLE wallet_entries ADD COLUMN IF NOT EXISTS reference_id TEXT`);
      await client.query(`ALTER TABLE wallet_entries ADD COLUMN IF NOT EXISTS proof_url TEXT`);
      await client.query(`ALTER TABLE wallet_entries ADD COLUMN IF NOT EXISTS note TEXT`);
      await client.query(`ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS checkout_token TEXT`);
      await client.query(`ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS gateway_order_id TEXT`);
      await client.query(`ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS gateway_payment_id TEXT`);
      await client.query(`ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS gateway_signature TEXT`);
      await client.query(`ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ`);
      await client.query(`
        CREATE TABLE IF NOT EXISTS referral_commission_refs (
          reference_id TEXT PRIMARY KEY,
          referrer_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          referred_user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
          amount NUMERIC(12,2) NOT NULL,
          created_at TIMESTAMPTZ NOT NULL
        )
      `);
      await client.query(`ALTER TABLE referral_commission_refs ADD COLUMN IF NOT EXISTS referred_user_id TEXT REFERENCES users(id) ON DELETE CASCADE`);
      await client.query(`
        CREATE TABLE IF NOT EXISTS admins (
          id TEXT PRIMARY KEY,
          phone TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          display_name TEXT NOT NULL,
          role TEXT NOT NULL DEFAULT 'admin',
          two_factor_enabled BOOLEAN NOT NULL DEFAULT TRUE,
          two_factor_secret TEXT,
          blocked_at TIMESTAMPTZ,
          deactivated_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL
        )
      `);
      await client.query(`
        CREATE TABLE IF NOT EXISTS admin_sessions (
          token_hash TEXT PRIMARY KEY,
          admin_id TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL
        )
      `);
      await client.query(`
        CREATE TABLE IF NOT EXISTS chat_conversations (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id),
          status TEXT NOT NULL DEFAULT 'OPEN',
          created_at TIMESTAMPTZ NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL,
          last_message_at TIMESTAMPTZ NOT NULL,
          resolved_at TIMESTAMPTZ
        )
      `);
      await client.query(`ALTER TABLE chat_conversations ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ`);
      await client.query(`
        CREATE TABLE IF NOT EXISTS chat_messages (
          id TEXT PRIMARY KEY,
          conversation_id TEXT NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
          sender_role TEXT NOT NULL,
          sender_user_id TEXT,
          text TEXT NOT NULL,
          read_by_user BOOLEAN NOT NULL DEFAULT FALSE,
          read_by_admin BOOLEAN NOT NULL DEFAULT FALSE,
          created_at TIMESTAMPTZ NOT NULL
        )
      `);
      await client.query(`
        CREATE TABLE IF NOT EXISTS app_settings (
          setting_key TEXT PRIMARY KEY,
          setting_value TEXT NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL
        )
      `);
      await client.query(`
        CREATE TABLE IF NOT EXISTS admin_accounts (
          user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
          phone TEXT UNIQUE NOT NULL,
          display_name TEXT NOT NULL,
          two_factor_enabled BOOLEAN NOT NULL DEFAULT TRUE,
          created_at TIMESTAMPTZ NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL
        )
      `);
      await client.query(`ALTER TABLE admins ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'admin'`);
      await client.query(`ALTER TABLE admins ADD COLUMN IF NOT EXISTS two_factor_enabled BOOLEAN NOT NULL DEFAULT TRUE`);
      await client.query(`ALTER TABLE admins ADD COLUMN IF NOT EXISTS two_factor_secret TEXT`);
      await client.query(`ALTER TABLE admins ADD COLUMN IF NOT EXISTS blocked_at TIMESTAMPTZ`);
      await client.query(`ALTER TABLE admins ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMPTZ`);
      await client.query(`
        DO $$
        BEGIN
          IF EXISTS (
            SELECT 1
            FROM information_schema.table_constraints
            WHERE constraint_name = 'audit_logs_actor_user_id_fkey'
              AND table_name = 'audit_logs'
          ) THEN
            ALTER TABLE audit_logs DROP CONSTRAINT audit_logs_actor_user_id_fkey;
          END IF;
        END $$;
      `);
      await ensurePostgresIndexes(client);
      await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_unique ON users (LOWER(email)) WHERE email IS NOT NULL AND email <> ''`);
      await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_sub_unique ON users (google_sub) WHERE google_sub IS NOT NULL AND google_sub <> ''`);

      await ensureSeedAdminInPostgres(client, defaultUser);

      const walletCount = Number((await client.query("SELECT COUNT(*)::int AS count FROM wallet_entries")).rows[0]?.count ?? 0);
      if (walletCount === 0 && defaultWalletEntry) {
        await client.query(
          `INSERT INTO wallet_entries (id, user_id, type, status, amount, before_balance, after_balance, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            defaultWalletEntry.id,
            defaultWalletEntry.userId,
            defaultWalletEntry.type,
            defaultWalletEntry.status,
            defaultWalletEntry.amount,
            defaultWalletEntry.beforeBalance,
            defaultWalletEntry.afterBalance,
            nowIso()
          ]
        );
      }

      for (const market of seededMarkets) {
        await client.query(
          `INSERT INTO markets (id, slug, name, result, status, action, open_time, close_time, category)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           ON CONFLICT (slug) DO UPDATE SET
             name = EXCLUDED.name,
             result = EXCLUDED.result,
             status = EXCLUDED.status,
             action = EXCLUDED.action,
             open_time = EXCLUDED.open_time,
             close_time = EXCLUDED.close_time,
             category = EXCLUDED.category`,
          market
        );
      }

      await syncChartsFromFilesToPostgres(client);

      const settingsCount = Number((await client.query("SELECT COUNT(*)::int AS count FROM app_settings")).rows[0]?.count ?? 0);
      if (settingsCount === 0) {
        const settings = [
          ["notice_text", defaultNoticeText],
          ["support_phone", defaultUser?.phone || ""],
          ["support_hours", "10:00 AM - 10:00 PM"],
          ["bonus_enabled", "true"],
          ["bonus_text", "Signup bonus aur promo offers ko dashboard se monitor karo."],
          ["admin_two_factor_enabled", "true"]
        ];
        for (const [key, value] of settings) {
          await client.query(
            `INSERT INTO app_settings (setting_key, setting_value, updated_at) VALUES ($1, $2, $3)`,
            [key, value, nowIso()]
          );
        }
      }

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      pgBootstrapPromise = null;
      throw error;
    } finally {
      client.release();
    }
  })();

  return pgBootstrapPromise;
}

function getSqlite() {
  if (sqlite) {
    return sqlite;
  }

  mkdirSync(path.dirname(sqlitePath), { recursive: true });
  sqlite = new DatabaseSync(sqlitePath);
  const defaultUser = getDefaultSeedAdmin();
  const defaultWalletEntry = getDefaultWalletEntry(defaultUser);
  sqlite.exec(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      phone TEXT NOT NULL UNIQUE,
      email TEXT,
      google_sub TEXT,
      google_linked_at TEXT,
      auth_provider TEXT NOT NULL DEFAULT 'password',
      password_hash TEXT NOT NULL,
      mpin_hash TEXT NOT NULL,
      mpin_configured INTEGER NOT NULL DEFAULT 0,
      name TEXT NOT NULL,
      joined_at TEXT NOT NULL,
      referral_code TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      approval_status TEXT NOT NULL DEFAULT 'Approved',
      approved_at TEXT,
      rejected_at TEXT,
      blocked_at TEXT,
      deactivated_at TEXT,
      status_note TEXT,
      signup_bonus_granted INTEGER NOT NULL DEFAULT 0,
      first_deposit_bonus_granted INTEGER NOT NULL DEFAULT 0,
      referred_by_user_id TEXT,
      referral_commission_carry REAL NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

      CREATE TABLE IF NOT EXISTS wallet_entries (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        type TEXT NOT NULL,
        status TEXT NOT NULL,
        amount REAL NOT NULL,
        before_balance REAL NOT NULL,
        after_balance REAL NOT NULL,
        reference_id TEXT,
        proof_url TEXT,
        note TEXT,
        created_at TEXT NOT NULL
      );

    CREATE TABLE IF NOT EXISTS bids (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      market TEXT NOT NULL,
      market_day TEXT,
      board_label TEXT NOT NULL,
      game_type TEXT,
      session_type TEXT NOT NULL DEFAULT 'Close',
      digit TEXT NOT NULL,
      points REAL NOT NULL,
      status TEXT NOT NULL,
      payout REAL NOT NULL DEFAULT 0,
      settled_at TEXT,
      settled_result TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS bank_accounts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      account_number TEXT NOT NULL,
      holder_name TEXT NOT NULL,
      ifsc TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS notification_devices (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      platform TEXT NOT NULL,
      token TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      channel TEXT NOT NULL,
      read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS chat_conversations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'OPEN',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_message_at TEXT NOT NULL,
      resolved_at TEXT
    );

    CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      sender_role TEXT NOT NULL,
      sender_user_id TEXT,
      text TEXT NOT NULL,
      read_by_user INTEGER NOT NULL DEFAULT 0,
      read_by_admin INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS payment_orders (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      amount REAL NOT NULL,
      status TEXT NOT NULL,
      reference TEXT NOT NULL UNIQUE,
      checkout_token TEXT,
      gateway_order_id TEXT,
      gateway_payment_id TEXT,
      gateway_signature TEXT,
      verified_at TEXT,
      redirect_url TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      setting_key TEXT PRIMARY KEY,
      setting_value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS referral_commission_refs (
      reference_id TEXT PRIMARY KEY,
      referrer_user_id TEXT NOT NULL,
      referred_user_id TEXT,
      amount REAL NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS admin_accounts (
      user_id TEXT PRIMARY KEY,
      phone TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      two_factor_enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS admins (
      id TEXT PRIMARY KEY,
      phone TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      display_name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'admin',
      two_factor_enabled INTEGER NOT NULL DEFAULT 1,
      two_factor_secret TEXT,
      blocked_at TEXT,
      deactivated_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS admin_sessions (
      token_hash TEXT PRIMARY KEY,
      admin_id TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS otp_challenges (
      id TEXT PRIMARY KEY,
      phone TEXT NOT NULL,
      code_hash TEXT NOT NULL,
      purpose TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      consumed_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS markets (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      result TEXT NOT NULL,
      status TEXT NOT NULL,
      action TEXT NOT NULL,
      open_time TEXT NOT NULL,
      close_time TEXT NOT NULL,
      category TEXT NOT NULL,
      result_locked_at TEXT,
      result_locked_by_user_id TEXT
    );

    CREATE TABLE IF NOT EXISTS charts (
      market_slug TEXT NOT NULL,
      chart_type TEXT NOT NULL,
      rows_json TEXT NOT NULL,
      PRIMARY KEY (market_slug, chart_type)
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      actor_user_id TEXT NOT NULL,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      details TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);

  ensureSqliteColumn(sqlite, "users", "approved_at", "TEXT");
  ensureSqliteColumn(sqlite, "users", "email", "TEXT");
  ensureSqliteColumn(sqlite, "users", "google_sub", "TEXT");
  ensureSqliteColumn(sqlite, "users", "google_linked_at", "TEXT");
  ensureSqliteColumn(sqlite, "users", "auth_provider", "TEXT NOT NULL DEFAULT 'password'");
  ensureSqliteColumn(sqlite, "users", "rejected_at", "TEXT");
  ensureSqliteColumn(sqlite, "users", "blocked_at", "TEXT");
  ensureSqliteColumn(sqlite, "users", "deactivated_at", "TEXT");
  ensureSqliteColumn(sqlite, "users", "status_note", "TEXT");
  ensureSqliteColumn(sqlite, "users", "mpin_configured", "INTEGER NOT NULL DEFAULT 0");
  ensureSqliteColumn(sqlite, "users", "signup_bonus_granted", "INTEGER NOT NULL DEFAULT 0");
  ensureSqliteColumn(sqlite, "users", "first_deposit_bonus_granted", "INTEGER NOT NULL DEFAULT 0");
  ensureSqliteColumn(sqlite, "users", "referred_by_user_id", "TEXT");
  ensureSqliteColumn(sqlite, "users", "referral_commission_carry", "REAL NOT NULL DEFAULT 0");
  ensureSqliteColumn(sqlite, "referral_commission_refs", "referred_user_id", "TEXT");
  ensureSqliteColumn(sqlite, "bids", "market_day", "TEXT");
  ensureSqliteColumn(sqlite, "bids", "game_type", "TEXT");
  ensureSqliteColumn(sqlite, "markets", "result_locked_at", "TEXT");
  ensureSqliteColumn(sqlite, "markets", "result_locked_by_user_id", "TEXT");
  ensureSqliteColumn(sqlite, "wallet_entries", "reference_id", "TEXT");
  ensureSqliteColumn(sqlite, "wallet_entries", "proof_url", "TEXT");
  ensureSqliteColumn(sqlite, "wallet_entries", "note", "TEXT");
  ensureSqliteColumn(sqlite, "payment_orders", "checkout_token", "TEXT");
  ensureSqliteColumn(sqlite, "payment_orders", "gateway_order_id", "TEXT");
  ensureSqliteColumn(sqlite, "payment_orders", "gateway_payment_id", "TEXT");
  ensureSqliteColumn(sqlite, "payment_orders", "gateway_signature", "TEXT");
  ensureSqliteColumn(sqlite, "payment_orders", "verified_at", "TEXT");
  ensureSqliteColumn(sqlite, "chat_conversations", "resolved_at", "TEXT");
  ensureSqliteColumn(sqlite, "admin_accounts", "two_factor_enabled", "INTEGER NOT NULL DEFAULT 1");
  ensureSqliteColumn(sqlite, "admins", "role", "TEXT NOT NULL DEFAULT 'admin'");
  ensureSqliteColumn(sqlite, "admins", "two_factor_enabled", "INTEGER NOT NULL DEFAULT 1");
  ensureSqliteColumn(sqlite, "admins", "two_factor_secret", "TEXT");
  ensureSqliteColumn(sqlite, "admins", "blocked_at", "TEXT");
  ensureSqliteColumn(sqlite, "admins", "deactivated_at", "TEXT");
  sqlite.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_unique ON users (email)`);
  sqlite.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_sub_unique ON users (google_sub)`);
  ensureSqliteIndexes(sqlite);
  ensureSeedAdminInSqlite(sqlite, defaultUser);

  const walletCount = Number(sqlite.prepare("SELECT COUNT(*) AS count FROM wallet_entries").get().count || 0);
  if (walletCount === 0 && defaultWalletEntry) {
    sqlite.prepare(`
      INSERT INTO wallet_entries (id, user_id, type, status, amount, before_balance, after_balance, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(defaultWalletEntry.id, defaultWalletEntry.userId, defaultWalletEntry.type, defaultWalletEntry.status, defaultWalletEntry.amount, defaultWalletEntry.beforeBalance, defaultWalletEntry.afterBalance, nowIso());
  }

  const marketCount = Number(sqlite.prepare("SELECT COUNT(*) AS count FROM markets").get().count || 0);
  if (marketCount === 0) {
    const insert = sqlite.prepare(`
      INSERT INTO markets (id, slug, name, result, status, action, open_time, close_time, category)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insert.run("market_1", "mangal-bazar", "Mangal Bazar", "***-**-***", "Betting is running for close", "Place Bet", "10:05 PM", "11:05 PM", "games");
    insert.run("market_2", "bharat-starline", "Bharat Starline", "580", "Live bidding open now", "Play Now", "10:00 AM", "09:00 PM", "starline");
  }

  syncChartsFromFilesToSqlite(sqlite);

  const settingsCount = Number(sqlite.prepare("SELECT COUNT(*) AS count FROM app_settings").get().count || 0);
  if (settingsCount === 0) {
    const insertSetting = sqlite.prepare(`INSERT INTO app_settings (setting_key, setting_value, updated_at) VALUES (?, ?, ?)`);
    const createdAt = nowIso();
    insertSetting.run("notice_text", defaultNoticeText, createdAt);
    insertSetting.run("support_phone", defaultUser?.phone || "", createdAt);
    insertSetting.run("support_hours", "10:00 AM - 10:00 PM", createdAt);
    insertSetting.run("bonus_enabled", "true", createdAt);
    insertSetting.run("bonus_text", "Signup bonus aur promo offers ko dashboard se monitor karo.", createdAt);
    insertSetting.run("admin_two_factor_enabled", "true", createdAt);
  }

  return sqlite;
}

function getPgPool() {
  if (!isStandalonePostgresEnabled()) {
    return null;
  }

  if (!pgPool) {
    const normalizedUrl = new URL(standaloneConfig.databaseUrl);
    normalizedUrl.searchParams.delete("sslmode");
    pgPool = new Pool({
      connectionString: normalizedUrl.toString(),
      ssl: isLocalPostgresUrl(standaloneConfig.databaseUrl) ? false : { rejectUnauthorized: false }
    });
  }

  void ensurePostgresBootstrap(pgPool);
  return pgPool;
}

async function getReadyPgPool() {
  const pool = getPgPool();
  await ensurePostgresBootstrap(pool);
  return pool;
}

export {
  getPgPool as __internalGetPgPool,
  getReadyPgPool as __internalGetReadyPgPool,
  getSqlite as __internalGetSqlite,
  mapAppSettingRow as __internalMapAppSettingRow,
  mapAuditLogRow as __internalMapAuditLogRow,
  mapBidRow as __internalMapBidRow,
  mapChatConversationRow as __internalMapChatConversationRow,
  mapChatMessageRow as __internalMapChatMessageRow,
  mapMarketRow as __internalMapMarketRow,
  mapNotificationDeviceRow as __internalMapNotificationDeviceRow,
  mapUserRow as __internalMapUserRow,
  mapWalletEntryRow as __internalMapWalletEntryRow,
  clearCachedAuthSession as __internalClearCachedAuthSession,
  cacheActiveUserByTokenHash as __internalCacheActiveUserByTokenHash,
  getCachedActiveUserByTokenHash as __internalGetCachedActiveUserByTokenHash,
  findSupportSenderUserId as __internalFindSupportSenderUserId,
  isUserAccountActive as __internalIsUserAccountActive,
  nowIso as __internalNowIso,
  sessionTtlMs as __internalSessionTtlMs,
  supportChatResolvedRetentionMs as __internalSupportChatResolvedRetentionMs,
  toIso as __internalToIso,
  toBool as __internalToBool
};

export async function findUserByPhone(phone) {
  const { findUserByPhone: findUserByPhoneFromAuthDb } = await import("./db/auth-db.mjs");
  return findUserByPhoneFromAuthDb(phone);
}

export async function findUserByEmail(email) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!normalizedEmail) {
    return null;
  }

  if (isStandalonePostgresEnabled()) {
    const pool = await getReadyPgPool();
    const result = await pool.query(
      `SELECT id, phone, email, google_sub, google_linked_at, auth_provider, password_hash, mpin_hash, mpin_configured, name, role, referral_code, joined_at, approval_status, approved_at, rejected_at, blocked_at, deactivated_at, status_note, signup_bonus_granted, first_deposit_bonus_granted, referred_by_user_id
       FROM users
       WHERE LOWER(email) = $1
       LIMIT 1`,
      [normalizedEmail]
    );
    return mapUserRow(result.rows[0]);
  }

  return mapUserRow(
    getSqlite()
      .prepare(
        `SELECT id, phone, email, google_sub, google_linked_at, auth_provider, password_hash, mpin_hash, mpin_configured, name, role, referral_code, joined_at, approval_status, approved_at, rejected_at, blocked_at, deactivated_at, status_note, signup_bonus_granted, first_deposit_bonus_granted, referred_by_user_id
         FROM users
         WHERE LOWER(email) = ?
         LIMIT 1`
      )
      .get(normalizedEmail)
  );
}

export async function createSession(userId) {
  const { createSession: createSessionFromAuthDb } = await import("./db/auth-db.mjs");
  return createSessionFromAuthDb(userId);
}

export async function revokeSession(token) {
  if (!token) {
    return;
  }

  const tokenHash = hashSecret(token);
  clearCachedAuthSession(tokenHash);
  if (isStandalonePostgresEnabled()) {
    const pool = await getReadyPgPool();
    await pool.query("DELETE FROM sessions WHERE token_hash = $1", [tokenHash]);
    await pool.query("DELETE FROM admin_sessions WHERE token_hash = $1", [tokenHash]);
    return;
  }

  getSqlite().prepare("DELETE FROM sessions WHERE token_hash = ?").run(tokenHash);
  getSqlite().prepare("DELETE FROM admin_sessions WHERE token_hash = ?").run(tokenHash);
}

export async function requireUserByToken(token) {
  const { requireUserByToken: requireUserByTokenFromAuthDb } = await import("./db/auth-db.mjs");
  return requireUserByTokenFromAuthDb(token);
}

export async function requireUserSnapshotByToken(token) {
  const { requireUserSnapshotByToken: requireUserSnapshotByTokenFromAuthDb } = await import("./db/auth-db.mjs");
  return requireUserSnapshotByTokenFromAuthDb(token);
}

export async function getUserBalance(userId) {
  const { getUserBalance: getUserBalanceFromWalletDb } = await import("./db/wallet-db.mjs");
  return getUserBalanceFromWalletDb(userId);
}

export async function updateUserPassword(userId, passwordHash) {
  if (isStandalonePostgresEnabled()) {
      const pool = await getReadyPgPool();
    await pool.query("UPDATE users SET password_hash = $2 WHERE id = $1", [userId, passwordHash]);
    return;
  }

  getSqlite().prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(passwordHash, userId);
}

export async function updateUserMpin(userId, mpinHash) {
  if (isStandalonePostgresEnabled()) {
      const pool = await getReadyPgPool();
    await pool.query("UPDATE users SET mpin_hash = $2, mpin_configured = TRUE WHERE id = $1", [userId, mpinHash]);
    return;
  }

  getSqlite().prepare("UPDATE users SET mpin_hash = ?, mpin_configured = 1 WHERE id = ?").run(mpinHash, userId);
}

export async function updateUserProfile(userId, updates) {
  const nextName = typeof updates.name === "string" ? updates.name.trim() : "";
  const nextPhone = typeof updates.phone === "string" ? updates.phone.trim() : "";

  if (isStandalonePostgresEnabled()) {
      const pool = await getReadyPgPool();
    const result = await pool.query(
      `UPDATE users
       SET name = COALESCE(NULLIF($2, ''), name),
           phone = COALESCE(NULLIF($3, ''), phone)
       WHERE id = $1
       RETURNING id, phone, password_hash, mpin_hash, mpin_configured, name, role, referral_code, joined_at, approval_status, approved_at, rejected_at, blocked_at, deactivated_at, status_note, signup_bonus_granted, first_deposit_bonus_granted, referred_by_user_id`,
      [userId, nextName, nextPhone]
    );
    return mapUserRow(result.rows[0]);
  }

  const db = getSqlite();
  db.prepare(
    `UPDATE users
     SET name = COALESCE(NULLIF(?, ''), name),
         phone = COALESCE(NULLIF(?, ''), phone)
     WHERE id = ?`
  ).run(nextName, nextPhone, userId);

  const row = db
    .prepare(
      `SELECT id, phone, password_hash, mpin_hash, mpin_configured, name, role, referral_code, joined_at, approval_status, approved_at, rejected_at, blocked_at, deactivated_at, status_note, signup_bonus_granted, first_deposit_bonus_granted, referred_by_user_id
       FROM users
       WHERE id = ?
       LIMIT 1`
    )
    .get(userId);
  return mapUserRow(row);
}

export async function createUserAccount({ phone, passwordHash, referenceCode, firstName, lastName, email = "", googleSub = "", authProvider = "" }) {
  const existing = await findUserByPhone(phone);
  if (existing) {
    return { user: null, error: "Phone number already registered" };
  }
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const normalizedGoogleSub = String(googleSub || "").trim();
  const resolvedAuthProvider = String(authProvider || (normalizedGoogleSub ? "google" : "password")).trim() || "password";
  if (normalizedEmail && await findUserByEmail(normalizedEmail)) {
    return { user: null, error: "Email already registered" };
  }

  const normalizedReferenceCode = String(referenceCode ?? "").trim();
  const referrer = normalizedReferenceCode ? await findUserByReferralCode(normalizedReferenceCode) : null;
  if (normalizedReferenceCode && !referrer) {
    return { user: null, error: "Invalid reference code" };
  }

  const userId = `user_${Date.now()}`;
  const joinedAt = nowIso();
  const googleLinkedAt = normalizedGoogleSub ? joinedAt : null;
  const referralCode = String(Math.floor(100000 + Math.random() * 900000));
  const normalizedFirstName = String(firstName ?? "").trim();
  const normalizedLastName = String(lastName ?? "").trim();
  const name = `${normalizedFirstName} ${normalizedLastName}`.trim();

  if (isStandalonePostgresEnabled()) {
    const pool = await getReadyPgPool();
    const client = await pool.connect();
    let grantedSignupBonusAmount = 0;
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO users (id, phone, email, google_sub, google_linked_at, auth_provider, password_hash, mpin_hash, mpin_configured, name, joined_at, referral_code, role, approval_status, approved_at, signup_bonus_granted, first_deposit_bonus_granted, referred_by_user_id)
         VALUES ($1, $2, NULLIF($3, ''), NULLIF($4, ''), $5, $6, $7, $8, FALSE, $9, $10, $11, 'user', 'Approved', $10, FALSE, FALSE, $12)`,
        [userId, phone, normalizedEmail, normalizedGoogleSub, googleLinkedAt, resolvedAuthProvider, passwordHash, hashSecret("1234"), name, joinedAt, referralCode, referrer?.id ?? null]
      );

      const promoCountResult = await client.query(
        `SELECT setting_value
         FROM app_settings
         WHERE setting_key = $1
         FOR UPDATE`,
        [signupBonusPromoAwardedCountSettingKey]
      );
      const awardedPromoCount = Math.max(0, Number(promoCountResult.rows[0]?.setting_value ?? 0) || 0);
      const qualifiesForPromo = awardedPromoCount < signupBonusPromoUserLimit;
      grantedSignupBonusAmount = qualifiesForPromo ? signupBonusPromoAmount : signupBonusAmount;

      if (qualifiesForPromo) {
        const nextPromoCount = String(awardedPromoCount + 1);
        await client.query(
          `INSERT INTO app_settings (setting_key, setting_value, updated_at)
           VALUES ($1, $2, $3)
           ON CONFLICT (setting_key) DO UPDATE
           SET setting_value = EXCLUDED.setting_value, updated_at = EXCLUDED.updated_at`,
          [signupBonusPromoAwardedCountSettingKey, nextPromoCount, joinedAt]
        );
      }

      await client.query(
        `INSERT INTO wallet_entries (id, user_id, type, status, amount, before_balance, after_balance, reference_id, proof_url, note, created_at)
         VALUES ($1, $2, 'SIGNUP_BONUS', 'SUCCESS', $3, 0, $3, NULL, NULL, $4, $5)`,
        [
          `wallet_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          userId,
          grantedSignupBonusAmount,
          qualifiesForPromo ? "Signup bonus 50 point campaign for next 50 users." : "Signup bonus credited.",
          joinedAt
        ]
      );

      await client.query(
        `UPDATE users
         SET signup_bonus_granted = TRUE
         WHERE id = $1`,
        [userId]
      );

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } else {
    const sqlite = getSqlite();
    let grantedSignupBonusAmount = 0;
    sqlite.exec("BEGIN");
    try {
      sqlite
        .prepare(
          `INSERT INTO users (id, phone, password_hash, mpin_hash, mpin_configured, name, joined_at, referral_code, role, approval_status, approved_at, signup_bonus_granted, first_deposit_bonus_granted, referred_by_user_id)
           VALUES (?, ?, ?, ?, 0, ?, ?, ?, 'user', 'Approved', ?, 0, 0, ?)`
        )
        .run(userId, phone, passwordHash, hashSecret("1234"), name, joinedAt, referralCode, joinedAt, referrer?.id ?? null);

      if (normalizedEmail || normalizedGoogleSub) {
        sqlite
          .prepare(
            `UPDATE users
             SET email = NULLIF(?, ''),
                 google_sub = NULLIF(?, ''),
                 google_linked_at = ?,
                 auth_provider = ?
             WHERE id = ?`
          )
          .run(normalizedEmail, normalizedGoogleSub, googleLinkedAt, resolvedAuthProvider, userId);
      }

      const promoCountRow = sqlite
        .prepare(
          `SELECT setting_value
           FROM app_settings
           WHERE setting_key = ?
           LIMIT 1`
        )
        .get(signupBonusPromoAwardedCountSettingKey);
      const awardedPromoCount = Math.max(0, Number(promoCountRow?.setting_value ?? 0) || 0);
      const qualifiesForPromo = awardedPromoCount < signupBonusPromoUserLimit;
      grantedSignupBonusAmount = qualifiesForPromo ? signupBonusPromoAmount : signupBonusAmount;

      if (qualifiesForPromo) {
        sqlite
          .prepare(
            `INSERT INTO app_settings (setting_key, setting_value, updated_at)
             VALUES (?, ?, ?)
             ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value, updated_at = excluded.updated_at`
          )
          .run(signupBonusPromoAwardedCountSettingKey, String(awardedPromoCount + 1), joinedAt);
      }

      sqlite
        .prepare(
          `INSERT INTO wallet_entries (id, user_id, type, status, amount, before_balance, after_balance, reference_id, proof_url, note, created_at)
           VALUES (?, ?, 'SIGNUP_BONUS', 'SUCCESS', ?, 0, ?, NULL, NULL, ?, ?)`
        )
        .run(
          `wallet_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          userId,
          grantedSignupBonusAmount,
          grantedSignupBonusAmount,
          qualifiesForPromo ? "Signup bonus 50 point campaign for next 50 users." : "Signup bonus credited.",
          joinedAt
        );

      sqlite
        .prepare(
          `UPDATE users
           SET signup_bonus_granted = 1
           WHERE id = ?`
        )
        .run(userId);

      sqlite.exec("COMMIT");
    } catch (error) {
      sqlite.exec("ROLLBACK");
      throw error;
    }
  }

  return {
    user: {
      id: userId,
      phone,
      email: normalizedEmail,
      googleSub: normalizedGoogleSub,
      googleLinkedAt,
      authProvider: resolvedAuthProvider,
      name,
      role: "user",
      referralCode,
      joinedAt,
      approvalStatus: "Approved",
      hasMpin: false,
      approvedAt: joinedAt,
      rejectedAt: null,
      signupBonusGranted: true,
      referredByUserId: referrer?.id ?? null
    },
    error: null
  };
}

async function findUserByReferralCode(referenceCode) {
  if (isStandalonePostgresEnabled()) {
      const pool = await getReadyPgPool();
    const result = await pool.query(
      `SELECT id, phone, password_hash, mpin_hash, mpin_configured, name, role, referral_code, joined_at, approval_status, approved_at, rejected_at, blocked_at, deactivated_at, status_note, signup_bonus_granted, first_deposit_bonus_granted, referred_by_user_id
       FROM users
       WHERE referral_code = $1
       LIMIT 1`,
      [referenceCode]
    );
    return mapUserRow(result.rows[0]);
  }

  return mapUserRow(
    getSqlite()
      .prepare(
        `SELECT id, phone, password_hash, mpin_hash, mpin_configured, name, role, referral_code, joined_at, approval_status, approved_at, rejected_at, blocked_at, deactivated_at, status_note, signup_bonus_granted, first_deposit_bonus_granted, referred_by_user_id
         FROM users
         WHERE referral_code = ?
         LIMIT 1`
      )
      .get(referenceCode)
    );
  }

export async function findUserById(userId) {
  if (isStandalonePostgresEnabled()) {
      const pool = await getReadyPgPool();
    const result = await pool.query(
      `SELECT id, phone, password_hash, mpin_hash, mpin_configured, name, joined_at, referral_code, role, approval_status, approved_at, rejected_at, blocked_at, deactivated_at, status_note, signup_bonus_granted, first_deposit_bonus_granted, referred_by_user_id
       FROM users
       WHERE id = $1
       LIMIT 1`,
      [userId]
    );
    return mapUserRow(result.rows[0]);
  }

  return mapUserRow(
    getSqlite()
      .prepare(
        `SELECT id, phone, password_hash, mpin_hash, mpin_configured, name, joined_at, referral_code, role, approval_status, approved_at, rejected_at, blocked_at, deactivated_at, status_note, signup_bonus_granted, first_deposit_bonus_granted, referred_by_user_id
         FROM users
         WHERE id = ?
         LIMIT 1`
      )
      .get(userId)
  );
}

export async function getUsersList() {
  if (isStandalonePostgresEnabled()) {
      const pool = await getReadyPgPool();
    const result = await pool.query(
      `SELECT id, phone, password_hash, mpin_hash, name, joined_at, referral_code, role, approval_status, approved_at, rejected_at, blocked_at, deactivated_at, status_note, signup_bonus_granted, first_deposit_bonus_granted, referred_by_user_id
       FROM users
       ORDER BY joined_at DESC, id DESC`
    );
    return result.rows.map((row) => mapUserRow(row));
  }

  return getSqlite()
    .prepare(
      `SELECT id, phone, password_hash, mpin_hash, name, joined_at, referral_code, role, approval_status, approved_at, rejected_at, blocked_at, deactivated_at, status_note, signup_bonus_granted, first_deposit_bonus_granted, referred_by_user_id
       FROM users
       ORDER BY joined_at DESC, id DESC`
    )
    .all()
    .map((row) => mapUserRow(row));
}

export async function getUserAdminSummaries() {
  if (isStandalonePostgresEnabled()) {
    const pool = await getReadyPgPool();
    const result = await pool.query(`
      SELECT
        u.id,
        u.phone,
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
        u.first_deposit_bonus_granted,
        u.referred_by_user_id,
        COALESCE(balance.wallet_balance, 0) AS wallet_balance,
        COALESCE(session_stats.login_count, 0) AS login_count,
        COALESCE(bid_stats.bid_count, 0) AS bid_count,
        COALESCE(bid_stats.total_bet_amount, 0) AS total_bet_amount,
        COALESCE(payout_stats.total_payout_amount, 0) AS total_payout_amount,
        CASE
          WHEN session_stats.last_session_at IS NULL AND bid_stats.last_bid_at IS NULL AND wallet_stats.last_wallet_at IS NULL THEN NULL
          ELSE GREATEST(
            COALESCE(session_stats.last_session_at, '-infinity'::timestamptz),
            COALESCE(bid_stats.last_bid_at, '-infinity'::timestamptz),
            COALESCE(wallet_stats.last_wallet_at, '-infinity'::timestamptz)
          )
        END AS last_activity
      FROM users u
      LEFT JOIN LATERAL (
        SELECT COALESCE(
          SUM(
            CASE
              WHEN status = 'SUCCESS' AND type IN ('DEPOSIT', 'REFERRAL_COMMISSION', 'BID_WIN', 'SIGNUP_BONUS', 'FIRST_DEPOSIT_BONUS', 'SPECIAL_DEPOSIT_BONUS', 'ADMIN_CREDIT') THEN COALESCE(amount, 0)
        WHEN ((status = 'SUCCESS' AND type IN ('WITHDRAW', 'BID_PLACED', 'BID_WIN_REVERSAL', 'ADMIN_DEBIT'))
           OR (status = 'BACKOFFICE' AND type = 'WITHDRAW')) THEN -COALESCE(amount, 0)
              ELSE 0
            END
          ),
          0
        ) AS wallet_balance
        FROM wallet_entries
        WHERE user_id = u.id
      ) balance ON TRUE
      LEFT JOIN (
        SELECT user_id, COUNT(*)::int AS login_count, MAX(created_at) AS last_session_at
        FROM sessions
        GROUP BY user_id
      ) session_stats ON session_stats.user_id = u.id
      LEFT JOIN (
        SELECT user_id, COUNT(*)::int AS bid_count, COALESCE(SUM(points), 0) AS total_bet_amount, MAX(created_at) AS last_bid_at
        FROM bids
        GROUP BY user_id
      ) bid_stats ON bid_stats.user_id = u.id
      LEFT JOIN (
        SELECT user_id, MAX(created_at) AS last_wallet_at
        FROM wallet_entries
        GROUP BY user_id
      ) wallet_stats ON wallet_stats.user_id = u.id
      LEFT JOIN (
        SELECT user_id, COALESCE(SUM(amount), 0) AS total_payout_amount
        FROM wallet_entries
        WHERE type = 'BID_WIN' AND status = ANY(ARRAY['SUCCESS', 'BACKOFFICE'])
        GROUP BY user_id
      ) payout_stats ON payout_stats.user_id = u.id
      WHERE u.role = 'user'
      ORDER BY u.joined_at DESC, u.id DESC
    `);

    return result.rows.map((row) => ({
      id: row.id,
      phone: row.phone,
      name: row.name,
      role: row.role,
      referralCode: row.referral_code,
      joinedAt: toIso(row.joined_at),
      approvalStatus: row.approval_status ?? "Approved",
      approvedAt: toIso(row.approved_at),
      rejectedAt: toIso(row.rejected_at),
      blockedAt: toIso(row.blocked_at),
      deactivatedAt: toIso(row.deactivated_at),
      statusNote: row.status_note ?? "",
      signupBonusGranted: toBool(row.signup_bonus_granted),
      firstDepositBonusGranted: toBool(row.first_deposit_bonus_granted),
      referredByUserId: row.referred_by_user_id ?? null,
      walletBalance: Number(row.wallet_balance ?? 0),
      loginCount: Number(row.login_count ?? 0),
      bidCount: Number(row.bid_count ?? 0),
      totalBetAmount: Number(row.total_bet_amount ?? 0),
      totalPayoutAmount: Number(row.total_payout_amount ?? 0),
      lastActivity: toIso(row.last_activity)
    }));
  }

  return getSqlite()
    .prepare(
      `SELECT
         u.id,
         u.phone,
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
         u.first_deposit_bonus_granted,
         u.referred_by_user_id,
         COALESCE((
           SELECT SUM(
             CASE
               WHEN we.status = 'SUCCESS' AND we.type IN ('DEPOSIT', 'REFERRAL_COMMISSION', 'BID_WIN', 'SIGNUP_BONUS', 'FIRST_DEPOSIT_BONUS', 'SPECIAL_DEPOSIT_BONUS', 'ADMIN_CREDIT') THEN COALESCE(we.amount, 0)
        WHEN ((we.status = 'SUCCESS' AND we.type IN ('WITHDRAW', 'BID_PLACED', 'BID_WIN_REVERSAL', 'ADMIN_DEBIT'))
           OR (we.status = 'BACKOFFICE' AND we.type = 'WITHDRAW')) THEN -COALESCE(we.amount, 0)
               ELSE 0
             END
           )
           FROM wallet_entries we
           WHERE we.user_id = u.id
         ), 0) AS wallet_balance,
         (
           SELECT COUNT(*)
           FROM sessions s
           WHERE s.user_id = u.id
         ) AS login_count,
         (
           SELECT COUNT(*)
           FROM bids b
           WHERE b.user_id = u.id
         ) AS bid_count,
         COALESCE((
           SELECT SUM(b.points)
           FROM bids b
           WHERE b.user_id = u.id
         ), 0) AS total_bet_amount,
         COALESCE((
           SELECT SUM(we.amount)
           FROM wallet_entries we
           WHERE we.user_id = u.id
             AND we.type = 'BID_WIN'
             AND we.status IN ('SUCCESS', 'BACKOFFICE')
         ), 0) AS total_payout_amount,
         MAX(
           COALESCE((SELECT MAX(s.created_at) FROM sessions s WHERE s.user_id = u.id), ''),
           COALESCE((SELECT MAX(b.created_at) FROM bids b WHERE b.user_id = u.id), ''),
           COALESCE((SELECT MAX(we.created_at) FROM wallet_entries we WHERE we.user_id = u.id), '')
         ) AS last_activity
       FROM users u
       WHERE u.role = 'user'
       ORDER BY u.joined_at DESC, u.id DESC`
    )
    .all()
    .map((row) => ({
      id: row.id,
      phone: row.phone,
      name: row.name,
      role: row.role,
      referralCode: row.referral_code,
      joinedAt: toIso(row.joined_at),
      approvalStatus: row.approval_status ?? "Approved",
      approvedAt: toIso(row.approved_at),
      rejectedAt: toIso(row.rejected_at),
      blockedAt: toIso(row.blocked_at),
      deactivatedAt: toIso(row.deactivated_at),
      statusNote: row.status_note ?? "",
      signupBonusGranted: toBool(row.signup_bonus_granted),
      firstDepositBonusGranted: toBool(row.first_deposit_bonus_granted),
      referredByUserId: row.referred_by_user_id ?? null,
      walletBalance: Number(row.wallet_balance ?? 0),
      loginCount: Number(row.login_count ?? 0),
      bidCount: Number(row.bid_count ?? 0),
      totalBetAmount: Number(row.total_bet_amount ?? 0),
      totalPayoutAmount: Number(row.total_payout_amount ?? 0),
      lastActivity: row.last_activity ? toIso(row.last_activity) : null
    }));
}

export async function getReportsSummaryData(from, to) {
  const { getReportsSummaryData: getReportsSummaryDataFromAdminReportsDb } = await import("./db/admin-reports-db.mjs");
  return getReportsSummaryDataFromAdminReportsDb(from, to);
}

export async function getWalletEntriesForUser(userId, limit = 50) {
  const { getWalletEntriesForUser: getWalletEntriesForUserFromWalletDb } = await import("./db/wallet-db.mjs");
  return getWalletEntriesForUserFromWalletDb(userId, limit);
}

function getWalletEntryBalanceDelta(entry) {
  if (String(entry.status || "") !== "SUCCESS") {
    return 0;
  }

  const amount = Number(entry.amount ?? 0);
  const type = String(entry.type || "").toUpperCase();
  const creditTypes = new Set(["DEPOSIT", "REFERRAL_COMMISSION", "BID_WIN", "SIGNUP_BONUS", "FIRST_DEPOSIT_BONUS", "SPECIAL_DEPOSIT_BONUS", "ADMIN_CREDIT"]);
  const debitTypes = new Set(["WITHDRAW", "BID_PLACED", "BID_WIN_REVERSAL", "ADMIN_DEBIT"]);

  if (creditTypes.has(type)) return amount;
  if (debitTypes.has(type)) return -amount;
  return 0;
}

export async function rebalanceWalletEntriesForUser(userId) {
  const { rebalanceWalletEntriesForUser: rebalanceWalletEntriesForUserFromWalletDb } = await import("./db/wallet-db.mjs");
  return rebalanceWalletEntriesForUserFromWalletDb(userId);
}

export async function clearWalletEntriesForUser(userId, types = []) {
  const { clearWalletEntriesForUser: clearWalletEntriesForUserFromWalletDb } = await import("./db/wallet-db.mjs");
  return clearWalletEntriesForUserFromWalletDb(userId, types);
}

export async function getReferralOverview(userId) {
  if (isStandalonePostgresEnabled()) {
    const pool = await getReadyPgPool();
    const [referredUsersResult, referralIncomeResult] = await Promise.all([
      pool.query(
        `SELECT id, name, phone, joined_at
         FROM users
         WHERE referred_by_user_id = $1
         ORDER BY joined_at DESC, id DESC`,
        [userId]
      ),
      pool.query(
        `SELECT COALESCE(SUM(amount), 0) AS total
         FROM wallet_entries
         WHERE user_id = $1
           AND type = 'REFERRAL_COMMISSION'
           AND status = 'SUCCESS'`,
        [userId]
      )
    ]);

    return {
      referredCount: referredUsersResult.rows.length,
      referralIncomeTotal: roundMoney(referralIncomeResult.rows[0]?.total ?? 0),
      referredUsers: referredUsersResult.rows.map((row) => ({
        id: row.id,
        name: row.name,
        phone: row.phone,
        joinedAt: toIso(row.joined_at)
      }))
    };
  }

  const db = getSqlite();
  const referredUsers = db
    .prepare(
      `SELECT id, name, phone, joined_at
       FROM users
       WHERE referred_by_user_id = ?
       ORDER BY joined_at DESC, id DESC`
    )
    .all(userId)
    .map((row) => ({
      id: row.id,
      name: row.name,
      phone: row.phone,
      joinedAt: toIso(row.joined_at)
    }));

  const referralIncomeRow = db
    .prepare(
      `SELECT COALESCE(SUM(amount), 0) AS total
       FROM wallet_entries
       WHERE user_id = ?
         AND type = 'REFERRAL_COMMISSION'
         AND status = 'SUCCESS'`
    )
    .get(userId);

  return {
    referredCount: referredUsers.length,
    referralIncomeTotal: roundMoney(referralIncomeRow?.total ?? 0),
    referredUsers
  };
}

export async function getAdminReferralSummary(limit = 300) {
  const normalizedLimit = Math.max(1, Math.min(1000, Number(limit || 300)));

  if (isStandalonePostgresEnabled()) {
    const pool = await getReadyPgPool();
    const [referrersResult, relationshipsResult] = await Promise.all([
      pool.query(
        `WITH referred_counts AS (
           SELECT referred_by_user_id AS referrer_user_id, COUNT(*) AS referred_count
           FROM users
           WHERE referred_by_user_id IS NOT NULL
           GROUP BY referred_by_user_id
         ),
         wallet_referral AS (
           SELECT user_id AS referrer_user_id, COALESCE(SUM(amount), 0) AS wallet_credited
           FROM wallet_entries
           WHERE type = 'REFERRAL_COMMISSION'
             AND status = 'SUCCESS'
           GROUP BY user_id
         ),
         recorded_refs AS (
           SELECT referrer_user_id, COALESCE(SUM(amount), 0) AS recorded_commission, COUNT(*) AS recorded_count
           FROM referral_commission_refs
           GROUP BY referrer_user_id
         )
         SELECT
           u.id,
           u.name,
           u.phone,
           u.referral_code,
           u.referral_commission_carry,
           COALESCE(rc.referred_count, 0) AS referred_count,
           COALESCE(wr.wallet_credited, 0) AS wallet_credited,
           COALESCE(rr.recorded_commission, 0) AS recorded_commission,
           COALESCE(rr.recorded_count, 0) AS recorded_count
         FROM users u
         LEFT JOIN referred_counts rc ON rc.referrer_user_id = u.id
         LEFT JOIN wallet_referral wr ON wr.referrer_user_id = u.id
         LEFT JOIN recorded_refs rr ON rr.referrer_user_id = u.id
         WHERE COALESCE(rc.referred_count, 0) > 0
            OR COALESCE(wr.wallet_credited, 0) > 0
            OR COALESCE(rr.recorded_commission, 0) > 0
         ORDER BY COALESCE(wr.wallet_credited, 0) DESC, COALESCE(rc.referred_count, 0) DESC, u.joined_at DESC
         LIMIT $1`,
        [normalizedLimit]
      ),
      pool.query(
        `WITH pair_refs AS (
           SELECT referrer_user_id, referred_user_id, COALESCE(SUM(amount), 0) AS pair_commission, COUNT(*) AS pair_count
           FROM referral_commission_refs
           GROUP BY referrer_user_id, referred_user_id
         )
         SELECT
           child.id AS referred_id,
           child.name AS referred_name,
           child.phone AS referred_phone,
           child.joined_at AS referred_joined_at,
           child.referral_code AS referred_referral_code,
           referrer.id AS referrer_id,
           referrer.name AS referrer_name,
           referrer.phone AS referrer_phone,
           referrer.referral_code AS referrer_referral_code,
           COALESCE(pr.pair_commission, 0) AS pair_commission,
           COALESCE(pr.pair_count, 0) AS pair_count
         FROM users child
         JOIN users referrer ON referrer.id = child.referred_by_user_id
         LEFT JOIN pair_refs pr
           ON pr.referrer_user_id = referrer.id
          AND pr.referred_user_id = child.id
         WHERE child.referred_by_user_id IS NOT NULL
         ORDER BY child.joined_at DESC, child.id DESC
         LIMIT $1`,
        [normalizedLimit]
      )
    ]);

    const referrers = referrersResult.rows.map(mapAdminReferralReferrerRow);
    const relationships = relationshipsResult.rows.map(mapAdminReferralRelationshipRow);
    return buildAdminReferralSummaryPayload(referrers, relationships);
  }

  const db = getSqlite();
  const referrers = db
    .prepare(
      `WITH referred_counts AS (
         SELECT referred_by_user_id AS referrer_user_id, COUNT(*) AS referred_count
         FROM users
         WHERE referred_by_user_id IS NOT NULL
         GROUP BY referred_by_user_id
       ),
       wallet_referral AS (
         SELECT user_id AS referrer_user_id, COALESCE(SUM(amount), 0) AS wallet_credited
         FROM wallet_entries
         WHERE type = 'REFERRAL_COMMISSION'
           AND status = 'SUCCESS'
         GROUP BY user_id
       ),
       recorded_refs AS (
         SELECT referrer_user_id, COALESCE(SUM(amount), 0) AS recorded_commission, COUNT(*) AS recorded_count
         FROM referral_commission_refs
         GROUP BY referrer_user_id
       )
       SELECT
         u.id,
         u.name,
         u.phone,
         u.referral_code,
         u.referral_commission_carry,
         COALESCE(rc.referred_count, 0) AS referred_count,
         COALESCE(wr.wallet_credited, 0) AS wallet_credited,
         COALESCE(rr.recorded_commission, 0) AS recorded_commission,
         COALESCE(rr.recorded_count, 0) AS recorded_count
       FROM users u
       LEFT JOIN referred_counts rc ON rc.referrer_user_id = u.id
       LEFT JOIN wallet_referral wr ON wr.referrer_user_id = u.id
       LEFT JOIN recorded_refs rr ON rr.referrer_user_id = u.id
       WHERE COALESCE(rc.referred_count, 0) > 0
          OR COALESCE(wr.wallet_credited, 0) > 0
          OR COALESCE(rr.recorded_commission, 0) > 0
       ORDER BY COALESCE(wr.wallet_credited, 0) DESC, COALESCE(rc.referred_count, 0) DESC, u.joined_at DESC
       LIMIT ?`
    )
    .all(normalizedLimit)
    .map(mapAdminReferralReferrerRow);

  const relationships = db
    .prepare(
      `WITH pair_refs AS (
         SELECT referrer_user_id, referred_user_id, COALESCE(SUM(amount), 0) AS pair_commission, COUNT(*) AS pair_count
         FROM referral_commission_refs
         GROUP BY referrer_user_id, referred_user_id
       )
       SELECT
         child.id AS referred_id,
         child.name AS referred_name,
         child.phone AS referred_phone,
         child.joined_at AS referred_joined_at,
         child.referral_code AS referred_referral_code,
         referrer.id AS referrer_id,
         referrer.name AS referrer_name,
         referrer.phone AS referrer_phone,
         referrer.referral_code AS referrer_referral_code,
         COALESCE(pr.pair_commission, 0) AS pair_commission,
         COALESCE(pr.pair_count, 0) AS pair_count
       FROM users child
       JOIN users referrer ON referrer.id = child.referred_by_user_id
       LEFT JOIN pair_refs pr
         ON pr.referrer_user_id = referrer.id
        AND pr.referred_user_id = child.id
       WHERE child.referred_by_user_id IS NOT NULL
       ORDER BY child.joined_at DESC, child.id DESC
       LIMIT ?`
    )
    .all(normalizedLimit)
    .map(mapAdminReferralRelationshipRow);

  return buildAdminReferralSummaryPayload(referrers, relationships);
}

function mapAdminReferralReferrerRow(row) {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    referralCode: row.referral_code,
    referredCount: Number(row.referred_count || 0),
    walletCredited: roundMoney(row.wallet_credited || 0),
    pendingCarry: roundMoney(row.referral_commission_carry || 0),
    recordedCommission: roundMoney(row.recorded_commission || 0),
    recordedCount: Number(row.recorded_count || 0)
  };
}

function mapAdminReferralRelationshipRow(row) {
  return {
    referrer: {
      id: row.referrer_id,
      name: row.referrer_name,
      phone: row.referrer_phone,
      referralCode: row.referrer_referral_code
    },
    referred: {
      id: row.referred_id,
      name: row.referred_name,
      phone: row.referred_phone,
      referralCode: row.referred_referral_code,
      joinedAt: toIso(row.referred_joined_at)
    },
    pairCommission: roundMoney(row.pair_commission || 0),
    pairCount: Number(row.pair_count || 0)
  };
}

function buildAdminReferralSummaryPayload(referrers, relationships) {
  const totals = referrers.reduce(
    (summary, item) => ({
      referrers: summary.referrers + 1,
      referredUsers: summary.referredUsers + Number(item.referredCount || 0),
      walletCredited: roundMoney(summary.walletCredited + Number(item.walletCredited || 0)),
      pendingCarry: roundMoney(summary.pendingCarry + Number(item.pendingCarry || 0)),
      recordedCommission: roundMoney(summary.recordedCommission + Number(item.recordedCommission || 0))
    }),
    { referrers: 0, referredUsers: 0, walletCredited: 0, pendingCarry: 0, recordedCommission: 0 }
  );

  return { totals, referrers, relationships };
}

export async function getBidsForUser(userId, limit = 50) {
  const { getBidsForUser: getBidsForUserFromBidsDb } = await import("./db/bids-db.mjs");
  return getBidsForUserFromBidsDb(userId, limit);
}

export async function getBankAccountsForUser(userId) {
  const { getBankAccountsForUser: getBankAccountsForUserFromWalletDb } = await import("./db/wallet-db.mjs");
  return getBankAccountsForUserFromWalletDb(userId);
}

export async function addBankAccount({ userId, accountNumber, holderName, ifsc }) {
  const id = `bank_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const createdAt = nowIso();

  if (isStandalonePostgresEnabled()) {
      const pool = await getReadyPgPool();
    await pool.query(
      `INSERT INTO bank_accounts (id, user_id, account_number, holder_name, ifsc, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, userId, accountNumber, holderName, ifsc, createdAt]
    );
  } else {
    getSqlite()
      .prepare(
        `INSERT INTO bank_accounts (id, user_id, account_number, holder_name, ifsc, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(id, userId, accountNumber, holderName, ifsc, createdAt);
  }

  return { id, accountNumber, holderName, ifsc, createdAt };
}

export async function addWalletEntry({ userId, type, status, amount, beforeBalance, afterBalance, referenceId = "", proofUrl = "", note = "" }) {
  const { addWalletEntry: addWalletEntryFromWalletDb } = await import("./db/wallet-db.mjs");
  return addWalletEntryFromWalletDb({ userId, type, status, amount, beforeBalance, afterBalance, referenceId, proofUrl, note });
}

async function getReferralCommissionCarry(userId) {
  if (isStandalonePostgresEnabled()) {
    const pool = await getReadyPgPool();
    const result = await pool.query(
      `SELECT referral_commission_carry
       FROM users
       WHERE id = $1
       LIMIT 1`,
      [userId]
    );
    return roundMoney(result.rows[0]?.referral_commission_carry ?? 0);
  }

  const row = getSqlite()
    .prepare(
      `SELECT referral_commission_carry
       FROM users
       WHERE id = ?
       LIMIT 1`
    )
    .get(userId);
  return roundMoney(row?.referral_commission_carry ?? 0);
}

async function setReferralCommissionCarry(userId, amount) {
  const nextCarry = roundMoney(amount);

  if (isStandalonePostgresEnabled()) {
    const pool = await getReadyPgPool();
    await pool.query(
      `UPDATE users
       SET referral_commission_carry = $2
       WHERE id = $1`,
      [userId, nextCarry]
    );
    return nextCarry;
  }

  getSqlite()
    .prepare(
      `UPDATE users
       SET referral_commission_carry = ?
       WHERE id = ?`
    )
    .run(nextCarry, userId);
  return nextCarry;
}

async function recordReferralCommissionReference(referrerUserId, referenceId, amount, referredUserId = null) {
  const createdAt = nowIso();

  if (isStandalonePostgresEnabled()) {
    const pool = await getReadyPgPool();
    const result = await pool.query(
      `INSERT INTO referral_commission_refs (reference_id, referrer_user_id, referred_user_id, amount, created_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (reference_id) DO NOTHING`,
      [referenceId, referrerUserId, referredUserId || null, roundMoney(amount), createdAt]
    );
    return Number(result.rowCount || 0) > 0;
  }

  const insertResult = getSqlite()
    .prepare(
      `INSERT OR IGNORE INTO referral_commission_refs (reference_id, referrer_user_id, referred_user_id, amount, created_at)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(referenceId, referrerUserId, referredUserId || null, roundMoney(amount), createdAt);

  return Number(insertResult.changes || 0) > 0;
}

async function getReferralLossCommissionRecordedTotal(referrerUserId, referredUserId) {
  if (!referrerUserId || !referredUserId) {
    return 0;
  }

  if (isStandalonePostgresEnabled()) {
    const pool = await getReadyPgPool();
    const result = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) AS total
       FROM referral_commission_refs
       WHERE referrer_user_id = $1
         AND referred_user_id = $2
         AND reference_id LIKE 'referral-loss:%'`,
      [referrerUserId, referredUserId]
    );
    return roundMoney(result.rows[0]?.total ?? 0);
  }

  const row = getSqlite()
    .prepare(
      `SELECT COALESCE(SUM(amount), 0) AS total
       FROM referral_commission_refs
       WHERE referrer_user_id = ?
         AND referred_user_id = ?
         AND reference_id LIKE 'referral-loss:%'`
    )
    .get(referrerUserId, referredUserId);
  return roundMoney(row?.total ?? 0);
}

async function getReferralDepositCreditTotal(userId) {
  if (!userId) {
    return 0;
  }

  if (isStandalonePostgresEnabled()) {
    const pool = await getReadyPgPool();
    const result = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) AS total
       FROM wallet_entries
       WHERE user_id = $1
         AND type = 'DEPOSIT'
         AND status IN ('SUCCESS', 'BACKOFFICE')`,
      [userId]
    );
    return roundMoney(result.rows[0]?.total ?? 0);
  }

  const row = getSqlite()
    .prepare(
      `SELECT COALESCE(SUM(amount), 0) AS total
       FROM wallet_entries
       WHERE user_id = ?
         AND type = 'DEPOSIT'
         AND status IN ('SUCCESS', 'BACKOFFICE')`
    )
    .get(userId);
  return roundMoney(row?.total ?? 0);
}

async function getReferralSettledBetNetLossTotal(userId) {
  if (!userId) {
    return 0;
  }

  if (isStandalonePostgresEnabled()) {
    const pool = await getReadyPgPool();
    const result = await pool.query(
      `SELECT COALESCE(
         SUM(
           CASE
             WHEN LOWER(status) IN ('won', 'lost') THEN COALESCE(points, 0)
             ELSE 0
           END
         )
         - SUM(
           CASE
             WHEN LOWER(status) = 'won' THEN COALESCE(payout, 0)
             ELSE 0
           END
         ),
         0
       ) AS total
       FROM bids
       WHERE user_id = $1`,
      [userId]
    );
    return Math.max(0, roundMoney(result.rows[0]?.total ?? 0));
  }

  const row = getSqlite()
    .prepare(
      `SELECT COALESCE(
         SUM(
           CASE
             WHEN LOWER(status) IN ('won', 'lost') THEN COALESCE(points, 0)
             ELSE 0
           END
         )
         - SUM(
           CASE
             WHEN LOWER(status) = 'won' THEN COALESCE(payout, 0)
             ELSE 0
           END
         ),
         0
       ) AS total
       FROM bids
       WHERE user_id = ?`
    )
    .get(userId);
  return Math.max(0, roundMoney(row?.total ?? 0));
}

async function getSuccessfulWithdrawTotal(userId) {
  if (!userId) {
    return 0;
  }

  if (isStandalonePostgresEnabled()) {
    const pool = await getReadyPgPool();
    const result = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) AS total
       FROM wallet_entries
       WHERE user_id = $1
         AND status = 'SUCCESS'
         AND type = 'WITHDRAW'`,
      [userId]
    );
    return roundMoney(result.rows[0]?.total ?? 0);
  }

  const row = getSqlite()
    .prepare(
      `SELECT COALESCE(SUM(amount), 0) AS total
       FROM wallet_entries
       WHERE user_id = ?
         AND status = 'SUCCESS'
         AND type = 'WITHDRAW'`
    )
    .get(userId);
  return roundMoney(row?.total ?? 0);
}

export async function applyReferralLossCommission({ userId, lostAmount, bidId, market = "", boardLabel = "" }) {
  const player = await findUserById(userId);
  if (!player?.referredByUserId) {
    return null;
  }

  const referrer = await findUserById(player.referredByUserId);
  if (!referrer) {
    return null;
  }

  const [depositCredits, settledBetNetLoss, successfulWithdraws, alreadyRecorded] = await Promise.all([
    getReferralDepositCreditTotal(player.id),
    getReferralSettledBetNetLossTotal(player.id),
    getSuccessfulWithdrawTotal(player.id),
    getReferralLossCommissionRecordedTotal(referrer.id, player.id)
  ]);
  // Referral loss commission is only for real deposit money that is currently lost.
  // Pending stakes, recycled winnings, bonuses, referral income, and admin credits do not increase this base.
  const depositAtRisk = Math.max(0, roundMoney(depositCredits - successfulWithdraws));
  const commissionableLoss = Math.min(depositAtRisk, settledBetNetLoss);
  const targetCommissionTotal = roundMoney(commissionableLoss * (referralLossCommissionRate / 100));
  const commissionAmount = roundMoney(targetCommissionTotal - alreadyRecorded);
  if (commissionAmount <= 0) {
    return null;
  }

  const referralReferenceId = `referral-loss:${bidId}`;
  const wasRecorded = await recordReferralCommissionReference(referrer.id, referralReferenceId, commissionAmount, player.id);
  if (!wasRecorded) {
    return null;
  }

  const carryBefore = await getReferralCommissionCarry(referrer.id);
  const totalAccrued = roundMoney(carryBefore + commissionAmount);
  const payoutSteps = Math.floor((totalAccrued + 0.0001) / referralCommissionThreshold);
  const payoutAmount = roundMoney(payoutSteps * referralCommissionThreshold);
  const carryAfter = roundMoney(totalAccrued - payoutAmount);

  await setReferralCommissionCarry(referrer.id, carryAfter);

  if (payoutAmount <= 0) {
    return null;
  }

  const beforeBalance = await getUserBalance(referrer.id);
  const note = `Referral threshold payout${market ? ` | ${market}` : ""}${boardLabel ? ` | ${boardLabel}` : ""}`;
  const entry = await addWalletEntry({
    userId: referrer.id,
    type: "REFERRAL_COMMISSION",
    status: "SUCCESS",
    amount: payoutAmount,
    beforeBalance,
    afterBalance: beforeBalance + payoutAmount,
    referenceId: `referral-threshold:${referrer.id}:${Date.now()}`,
    note
  });

  await createNotification({
    userId: referrer.id,
    title: "Referral income credited",
    body: `Rs ${payoutAmount.toFixed(2)} referral income threshold complete hua.`,
    channel: "wallet"
  });

  return entry;
}

export async function applyReferralDepositBonusIfEligible({ userId, depositAmount, depositEntryId }) {
  const normalizedUserId = String(userId || "").trim();
  const normalizedDepositEntryId = String(depositEntryId || "").trim();
  const normalizedAmount = roundMoney(Number(depositAmount || 0));
  if (!normalizedUserId || !normalizedDepositEntryId || normalizedAmount <= 0) {
    return null;
  }

  const settings = await getAppSettings();
  const depositBonusRate = Math.max(0, settingNumber(settings, "referral_deposit_bonus_rate", referralDepositBonusRate));
  const maxTimesPerUser = Math.max(0, Math.floor(settingNumber(settings, "referral_deposit_bonus_max_times", referralDepositBonusMaxTimesPerUser)));
  const maxPerDeposit = Math.max(0, settingNumber(settings, "referral_deposit_bonus_max_per_deposit", referralDepositBonusMaxPerDeposit));
  if (depositBonusRate <= 0 || maxTimesPerUser <= 0) {
    return null;
  }

  const player = await findUserById(normalizedUserId);
  if (!player?.referredByUserId) {
    return null;
  }

  const referrer = await findUserById(player.referredByUserId);
  if (!referrer) {
    return null;
  }

  const bonusAmount = roundMoney(Math.min(normalizedAmount * (depositBonusRate / 100), maxPerDeposit));
  if (bonusAmount <= 0) {
    return null;
  }

  const referenceId = `referral-deposit:${normalizedDepositEntryId}`;
  const playerLabel = String(player.name || player.phone || "Referred user").trim();
  const noteBase = `Referral deposit bonus | ${playerLabel} | Deposit Rs ${normalizedAmount.toFixed(2)}`;

  if (isStandalonePostgresEnabled()) {
    const pool = await getReadyPgPool();
    const client = await pool.connect();
    let created = false;
    try {
      await client.query("BEGIN");
      const existingRef = await client.query(
        `SELECT reference_id
         FROM referral_commission_refs
         WHERE reference_id = $1
         LIMIT 1`,
        [referenceId]
      );

      if (!existingRef.rows[0]?.reference_id) {
        const countResult = await client.query(
          `SELECT COUNT(*)::int AS count
           FROM referral_commission_refs
           WHERE referrer_user_id = $1
             AND referred_user_id = $2
             AND reference_id LIKE 'referral-deposit:%'`,
          [referrer.id, player.id]
        );
        const awardedCount = Math.max(0, Number(countResult.rows[0]?.count ?? 0) || 0);
        if (awardedCount < maxTimesPerUser) {
          const sequence = awardedCount + 1;
          const balanceResult = await client.query(
            `SELECT COALESCE(SUM(
              CASE
                WHEN status = 'SUCCESS' AND type IN ('DEPOSIT', 'REFERRAL_COMMISSION', 'BID_WIN', 'SIGNUP_BONUS', 'FIRST_DEPOSIT_BONUS', 'SPECIAL_DEPOSIT_BONUS', 'ADMIN_CREDIT') THEN COALESCE(amount, 0)
                WHEN ((status = 'SUCCESS' AND type IN ('WITHDRAW', 'BID_PLACED', 'BID_WIN_REVERSAL', 'ADMIN_DEBIT'))
                   OR (status = 'BACKOFFICE' AND type = 'WITHDRAW')) THEN -COALESCE(amount, 0)
                ELSE 0
              END
            ), 0) AS balance
             FROM wallet_entries
             WHERE user_id = $1`,
            [referrer.id]
          );
          const beforeBalance = roundMoney(Number(balanceResult.rows[0]?.balance ?? 0));
          const afterBalance = roundMoney(beforeBalance + bonusAmount);

          await client.query(
            `INSERT INTO referral_commission_refs (reference_id, referrer_user_id, referred_user_id, amount, created_at)
             VALUES ($1, $2, $3, $4, $5)`,
            [referenceId, referrer.id, player.id, bonusAmount, nowIso()]
          );
          await client.query(
            `INSERT INTO wallet_entries (id, user_id, type, status, amount, before_balance, after_balance, reference_id, proof_url, note, created_at)
             VALUES ($1, $2, 'REFERRAL_COMMISSION', 'SUCCESS', $3, $4, $5, $6, NULL, $7, $8)`,
            [
              `wallet_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
              referrer.id,
              bonusAmount,
              beforeBalance,
              afterBalance,
              referenceId,
              `${noteBase} | ${sequence}/${maxTimesPerUser}`,
              nowIso()
            ]
          );
          created = true;
        }
      }

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    const entry = await findWalletEntryByReferenceId(referrer.id, referenceId);
    if (created && entry) {
      await createNotification({
        userId: referrer.id,
        title: "Referral deposit bonus credited",
        body: `Rs ${bonusAmount.toFixed(2)} referral deposit bonus credit hua.`,
        channel: "wallet"
      });
    }
    return entry;
  }

  const sqlite = getSqlite();
  let created = false;
  sqlite.exec("BEGIN");
  try {
    const existingRef = sqlite
      .prepare(
        `SELECT reference_id
         FROM referral_commission_refs
         WHERE reference_id = ?
         LIMIT 1`
      )
      .get(referenceId);

    if (!existingRef?.reference_id) {
      const countRow = sqlite
        .prepare(
          `SELECT COUNT(*) AS count
           FROM referral_commission_refs
           WHERE referrer_user_id = ?
             AND referred_user_id = ?
             AND reference_id LIKE 'referral-deposit:%'`
        )
        .get(referrer.id, player.id);
      const awardedCount = Math.max(0, Number(countRow?.count ?? 0) || 0);
      if (awardedCount < maxTimesPerUser) {
        const sequence = awardedCount + 1;
        const balanceRow = sqlite
          .prepare(
            `SELECT COALESCE(SUM(
              CASE
                WHEN status = 'SUCCESS' AND type IN ('DEPOSIT', 'REFERRAL_COMMISSION', 'BID_WIN', 'SIGNUP_BONUS', 'FIRST_DEPOSIT_BONUS', 'SPECIAL_DEPOSIT_BONUS', 'ADMIN_CREDIT') THEN COALESCE(amount, 0)
                WHEN ((status = 'SUCCESS' AND type IN ('WITHDRAW', 'BID_PLACED', 'BID_WIN_REVERSAL', 'ADMIN_DEBIT'))
                   OR (status = 'BACKOFFICE' AND type = 'WITHDRAW')) THEN -COALESCE(amount, 0)
                ELSE 0
              END
            ), 0) AS balance
             FROM wallet_entries
             WHERE user_id = ?`
          )
          .get(referrer.id);
        const beforeBalance = roundMoney(Number(balanceRow?.balance ?? 0));
        const afterBalance = roundMoney(beforeBalance + bonusAmount);

        sqlite
          .prepare(
            `INSERT INTO referral_commission_refs (reference_id, referrer_user_id, referred_user_id, amount, created_at)
             VALUES (?, ?, ?, ?, ?)`
          )
          .run(referenceId, referrer.id, player.id, bonusAmount, nowIso());
        sqlite
          .prepare(
            `INSERT INTO wallet_entries (id, user_id, type, status, amount, before_balance, after_balance, reference_id, proof_url, note, created_at)
             VALUES (?, ?, 'REFERRAL_COMMISSION', 'SUCCESS', ?, ?, ?, ?, NULL, ?, ?)`
          )
          .run(
            `wallet_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            referrer.id,
            bonusAmount,
            beforeBalance,
            afterBalance,
            referenceId,
            `${noteBase} | ${sequence}/${maxTimesPerUser}`,
            nowIso()
          );
        created = true;
      }
    }

    sqlite.exec("COMMIT");
  } catch (error) {
    sqlite.exec("ROLLBACK");
    throw error;
  }

  const entry = await findWalletEntryByReferenceId(referrer.id, referenceId);
  if (created && entry) {
    await createNotification({
      userId: referrer.id,
      title: "Referral deposit bonus credited",
      body: `Rs ${bonusAmount.toFixed(2)} referral deposit bonus credit hua.`,
      channel: "wallet"
    });
  }
  return entry;
}

export async function applyFirstDepositBonusIfEligible({ userId, depositAmount, depositEntryId }) {
  const normalizedUserId = String(userId || "").trim();
  const normalizedDepositEntryId = String(depositEntryId || "").trim();
  const normalizedAmount = roundMoney(Number(depositAmount || 0));
  if (!normalizedUserId || !normalizedDepositEntryId || normalizedAmount <= 0) {
    return null;
  }

  const user = await findUserById(normalizedUserId);
  if (!user || user.firstDepositBonusGranted) {
    return null;
  }

  const settings = await getAppSettings();
  if (!settingBool(settings, "first_deposit_bonus_enabled", true)) {
    return null;
  }
  const minimum = Math.max(0, settingNumber(settings, "first_deposit_bonus_minimum", firstDepositBonusMinimum));
  const baseAmount = Math.max(0, settingNumber(settings, "first_deposit_bonus_amount", firstDepositBonusBaseAmount));
  const upperMinimum = Math.max(minimum, settingNumber(settings, "first_deposit_bonus_upper_minimum", firstDepositBonusUpperTierMinimum));
  const upperAmount = Math.max(0, settingNumber(settings, "first_deposit_bonus_upper_amount", firstDepositBonusUpperTierAmount));
  const isUpperSlab = normalizedAmount >= upperMinimum;
  const bonusAmount =
    isUpperSlab
      ? upperAmount
      : normalizedAmount >= minimum
        ? baseAmount
        : 0;
  if (bonusAmount <= 0) {
    return null;
  }

  const referenceId = `first-deposit-bonus:${normalizedDepositEntryId}`;
  const existingEntry = await findWalletEntryByReferenceId(normalizedUserId, referenceId);
  if (existingEntry) {
    return existingEntry;
  }

  const beforeBalance = await getUserBalance(normalizedUserId);
  const entry = await addWalletEntry({
    userId: normalizedUserId,
    type: "FIRST_DEPOSIT_BONUS",
    status: "SUCCESS",
    amount: bonusAmount,
    beforeBalance,
    afterBalance: beforeBalance + bonusAmount,
    referenceId,
    note:
      isUpperSlab
        ? `First deposit bonus slab | Rs ${upperMinimum}+ -> Rs ${upperAmount}`
        : `First deposit bonus slab | Rs ${minimum}+ -> Rs ${baseAmount}`
  });

  if (isStandalonePostgresEnabled()) {
    const pool = await getReadyPgPool();
    await pool.query(`UPDATE users SET first_deposit_bonus_granted = TRUE WHERE id = $1`, [normalizedUserId]);
  } else {
    getSqlite().prepare(`UPDATE users SET first_deposit_bonus_granted = 1 WHERE id = ?`).run(normalizedUserId);
  }

  return entry;
}

export async function applySpecialDepositBonusIfEligible({ userId, depositAmount, depositEntryId }) {
  const normalizedUserId = String(userId || "").trim();
  const normalizedDepositEntryId = String(depositEntryId || "").trim();
  const normalizedAmount = roundMoney(Number(depositAmount || 0));
  if (!normalizedUserId || !normalizedDepositEntryId || normalizedAmount <= 0) {
    return null;
  }

  const settings = await getAppSettings();
  if (!settingBool(settings, "special_deposit_bonus_enabled", false)) {
    return null;
  }

  const bonusDate = settingValue(settings, "special_deposit_bonus_date", "").trim();
  if (bonusDate && bonusDate !== getIndiaDateString()) {
    return null;
  }

  const minimum = Math.max(0, settingNumber(settings, "special_deposit_bonus_minimum", specialDepositBonusMinimum));
  const baseAmount = Math.max(0, settingNumber(settings, "special_deposit_bonus_amount", specialDepositBonusBaseAmount));
  const upperMinimum = Math.max(minimum, settingNumber(settings, "special_deposit_bonus_upper_minimum", specialDepositBonusUpperTierMinimum));
  const upperAmount = Math.max(0, settingNumber(settings, "special_deposit_bonus_upper_amount", specialDepositBonusUpperTierAmount));
  const isUpperSlab = normalizedAmount >= upperMinimum;
  const bonusAmount =
    isUpperSlab
      ? upperAmount
      : normalizedAmount >= minimum
        ? baseAmount
        : 0;
  if (bonusAmount <= 0) {
    return null;
  }

  const referenceId = `special-deposit-bonus:${normalizedDepositEntryId}`;
  const existingEntry = await findWalletEntryByReferenceId(normalizedUserId, referenceId);
  if (existingEntry) {
    return existingEntry;
  }

  const beforeBalance = await getUserBalance(normalizedUserId);
  const entry = await addWalletEntry({
    userId: normalizedUserId,
    type: "SPECIAL_DEPOSIT_BONUS",
    status: "SUCCESS",
    amount: bonusAmount,
    beforeBalance,
    afterBalance: beforeBalance + bonusAmount,
    referenceId,
    note:
      isUpperSlab
        ? `Today limited deposit bonus | Rs ${upperMinimum}+ -> Rs ${upperAmount}`
        : `Today limited deposit bonus | Rs ${minimum}+ -> Rs ${baseAmount}`
  });

  await createNotification({
    userId: normalizedUserId,
    title: "Special deposit bonus credited",
    body: `Rs ${bonusAmount.toFixed(2)} special deposit bonus credit hua.`,
    channel: "wallet"
  });

  return entry;
}

export async function addBid({ userId, market, boardLabel, gameType, sessionType, digit, points, status, payout, settledAt, settledResult }) {
  const { addBid: addBidFromBidsDb } = await import("./db/bids-db.mjs");
  return addBidFromBidsDb({ userId, market, boardLabel, gameType, sessionType, digit, points, status, payout, settledAt, settledResult });
}

export async function listMarkets() {
  const { listMarkets: listMarketsFromMarketDb } = await import("./db/market-db.mjs");
  return listMarketsFromMarketDb();
}

export async function findMarketBySlug(slug) {
  const { findMarketBySlug: findMarketBySlugFromMarketDb } = await import("./db/market-db.mjs");
  return findMarketBySlugFromMarketDb(slug);
}

export async function getChartRecord(slug, chartType) {
  const { getChartRecord: getChartRecordFromMarketDb } = await import("./db/market-db.mjs");
  return getChartRecordFromMarketDb(slug, chartType);
}

export async function getChartRecordsForMarkets(slugs, chartTypes = ["jodi", "panna"]) {
  const { getChartRecordsForMarkets: getChartRecordsForMarketsFromMarketDb } = await import("./db/market-db.mjs");
  return getChartRecordsForMarketsFromMarketDb(slugs, chartTypes);
}

export async function upsertChartRecord(marketSlug, chartType, rows) {
  const { upsertChartRecord: upsertChartRecordFromMarketDb } = await import("./db/market-db.mjs");
  return upsertChartRecordFromMarketDb(marketSlug, chartType, rows);
}

export async function updateMarketRecord(slug, updates) {
  const { updateMarketRecord: updateMarketRecordFromMarketDb } = await import("./db/market-db.mjs");
  return updateMarketRecordFromMarketDb(slug, updates);
}

export async function getBidsForMarket(marketName) {
  const { getBidsForMarket: getBidsForMarketFromBidsDb } = await import("./db/bids-db.mjs");
  return getBidsForMarketFromBidsDb(marketName);
}

export async function updateBidSettlement(bidId, status, payout, settledResult) {
  const settledAt = status === "Pending" ? null : nowIso();
  const normalizedResult = status === "Pending" ? null : settledResult;

  if (isStandalonePostgresEnabled()) {
    const pool = getPgPool();
    const result = await pool.query(
      `UPDATE bids
       SET status = $1, payout = $2, settled_at = $3, settled_result = $4
       WHERE id = $5
       RETURNING id, user_id, market, board_label, game_type, session_type, digit, points, status, payout, settled_at, settled_result, created_at`,
      [status, payout, settledAt, normalizedResult, bidId]
    );
    return mapBidRow(result.rows[0]);
  }

  const db = getSqlite();
  db.prepare(`UPDATE bids SET status = ?, payout = ?, settled_at = ?, settled_result = ? WHERE id = ?`).run(
    status,
    payout,
    settledAt,
    normalizedResult,
    bidId
  );
  return mapBidRow(
    db.prepare(
      `SELECT id, user_id, market, board_label, game_type, session_type, digit, points, status, payout, settled_at, settled_result, created_at
       FROM bids WHERE id = ? LIMIT 1`
    ).get(bidId)
  );
}

export async function listNotificationsForUser(userId) {
  const { listNotificationsForUser: listNotificationsForUserFromNotificationDb } = await import("./db/notification-db.mjs");
  return listNotificationsForUserFromNotificationDb(userId);
}

export async function registerNotificationDevice(userId, platform, token) {
  const { registerNotificationDevice: registerNotificationDeviceFromNotificationDb } = await import("./db/notification-db.mjs");
  return registerNotificationDeviceFromNotificationDb(userId, platform, token);
}

export async function createNotification({ userId, title, body, channel = "general" }) {
  const { createNotification: createNotificationFromNotificationDb } = await import("./db/notification-db.mjs");
  return createNotificationFromNotificationDb({ userId, title, body, channel });
}

export async function listEnabledNotificationDevicesByUserIds(userIds) {
  const uniqueUserIds = [...new Set((userIds || []).map((value) => String(value || "").trim()).filter(Boolean))];
  if (!uniqueUserIds.length) {
    return [];
  }

  if (isStandalonePostgresEnabled()) {
    const pool = await getReadyPgPool();
    const placeholders = uniqueUserIds.map((_, index) => `$${index + 1}`).join(", ");
    const result = await pool.query(
      `SELECT id, user_id, platform, token, enabled, created_at, updated_at
       FROM notification_devices
       WHERE enabled = TRUE
         AND user_id IN (${placeholders})
       ORDER BY created_at DESC, id DESC`,
      uniqueUserIds
    );
    return result.rows.map((row) => mapNotificationDeviceRow(row)).filter(Boolean);
  }

  const placeholders = uniqueUserIds.map(() => "?").join(", ");
  return getSqlite()
    .prepare(
      `SELECT id, user_id, platform, token, enabled, created_at, updated_at
       FROM notification_devices
       WHERE enabled = 1
         AND user_id IN (${placeholders})
       ORDER BY created_at DESC, id DESC`
    )
    .all(...uniqueUserIds)
    .map((row) => mapNotificationDeviceRow(row))
    .filter(Boolean);
}

async function findChatConversationByUserId(userId) {
  if (isStandalonePostgresEnabled()) {
    const pool = await getReadyPgPool();
    const result = await pool.query(
      `SELECT id, user_id, status, created_at, updated_at, last_message_at, resolved_at
       FROM chat_conversations
       WHERE user_id = $1
       LIMIT 1`,
      [userId]
    );
    return mapChatConversationRow(result.rows[0]);
  }

  return mapChatConversationRow(
    getSqlite()
      .prepare(
        `SELECT id, user_id, status, created_at, updated_at, last_message_at, resolved_at
         FROM chat_conversations
         WHERE user_id = ?
         LIMIT 1`
      )
      .get(userId)
  );
}

async function findChatConversationById(conversationId) {
  if (isStandalonePostgresEnabled()) {
    const pool = await getReadyPgPool();
    const result = await pool.query(
      `SELECT id, user_id, status, created_at, updated_at, last_message_at, resolved_at
       FROM chat_conversations
       WHERE id = $1
       LIMIT 1`,
      [conversationId]
    );
    return mapChatConversationRow(result.rows[0]);
  }

  return mapChatConversationRow(
    getSqlite()
      .prepare(
        `SELECT id, user_id, status, created_at, updated_at, last_message_at, resolved_at
         FROM chat_conversations
         WHERE id = ?
         LIMIT 1`
      )
      .get(conversationId)
  );
}

async function touchChatConversation(conversationId, timestamp) {
  if (isStandalonePostgresEnabled()) {
    const pool = await getReadyPgPool();
    await pool.query(
      `UPDATE chat_conversations
       SET updated_at = $1, last_message_at = $1
       WHERE id = $2`,
      [timestamp, conversationId]
    );
    return;
  }

  getSqlite()
    .prepare(
      `UPDATE chat_conversations
       SET updated_at = ?, last_message_at = ?
       WHERE id = ?`
    )
    .run(timestamp, timestamp, conversationId);
}

export async function updateSupportConversationStatus(conversationId, status) {
  const { updateSupportConversationStatus: updateSupportConversationStatusFromChatDb } = await import("./db/chat-db.mjs");
  return updateSupportConversationStatusFromChatDb(conversationId, status);
}

export async function getOrCreateSupportConversation(userId) {
  const { getOrCreateSupportConversation: getOrCreateSupportConversationFromChatDb } = await import("./db/chat-db.mjs");
  return getOrCreateSupportConversationFromChatDb(userId);
}

export async function cleanupResolvedSupportConversations() {
  const { cleanupResolvedSupportConversations: cleanupResolvedSupportConversationsFromChatDb } = await import("./db/chat-db.mjs");
  return cleanupResolvedSupportConversationsFromChatDb();
}

export async function addSupportChatMessage({
  conversationId,
  senderRole,
  senderUserId = null,
  text,
  readByUser,
  readByAdmin
}) {
  const { addSupportChatMessage: addSupportChatMessageFromChatDb } = await import("./db/chat-db.mjs");
  return addSupportChatMessageFromChatDb({
    conversationId,
    senderRole,
    senderUserId,
    text,
    readByUser,
    readByAdmin
  });
}

export async function getSupportMessages(conversationId) {
  const { getSupportMessages: getSupportMessagesFromChatDb } = await import("./db/chat-db.mjs");
  return getSupportMessagesFromChatDb(conversationId);
}

export async function markSupportMessagesReadByUser(conversationId) {
  const { markSupportMessagesReadByUser: markSupportMessagesReadByUserFromChatDb } = await import("./db/chat-db.mjs");
  return markSupportMessagesReadByUserFromChatDb(conversationId);
}

export async function markSupportMessagesReadByAdmin(conversationId) {
  const { markSupportMessagesReadByAdmin: markSupportMessagesReadByAdminFromChatDb } = await import("./db/chat-db.mjs");
  return markSupportMessagesReadByAdminFromChatDb(conversationId);
}

export async function getSupportConversationBundleForUser(userId) {
  const { getSupportConversationBundleForUser: getSupportConversationBundleForUserFromChatDb } = await import("./db/chat-db.mjs");
  return getSupportConversationBundleForUserFromChatDb(userId);
}

export async function listSupportConversations() {
  const { listSupportConversations: listSupportConversationsFromChatDb } = await import("./db/chat-db.mjs");
  return listSupportConversationsFromChatDb();
}

export async function getSupportConversationSummary() {
  const { getSupportConversationSummary: getSupportConversationSummaryFromChatDb } = await import("./db/chat-db.mjs");
  return getSupportConversationSummaryFromChatDb();
}

export async function getSupportConversationDetailsForAdmin(conversationId) {
  const { getSupportConversationDetailsForAdmin: getSupportConversationDetailsForAdminFromChatDb } = await import("./db/chat-db.mjs");
  return getSupportConversationDetailsForAdminFromChatDb(conversationId);
}

export async function listAllNotifications(limit = 200) {
  const { listAllNotifications: listAllNotificationsFromNotificationDb } = await import("./db/notification-db.mjs");
  return listAllNotificationsFromNotificationDb(limit);
}

export async function getAppSettings() {
  if (isStandalonePostgresEnabled()) {
    const pool = await getReadyPgPool();
    const result = await pool.query(`SELECT setting_key, setting_value, updated_at FROM app_settings ORDER BY setting_key ASC`);
    return result.rows.map((row) => mapAppSettingRow(row));
  }

  return getSqlite()
    .prepare(`SELECT setting_key, setting_value, updated_at FROM app_settings ORDER BY setting_key ASC`)
    .all()
    .map((row) => mapAppSettingRow(row));
}

export async function upsertAppSetting(settingKey, settingValue) {
  const updatedAt = nowIso();

  if (isStandalonePostgresEnabled()) {
    const pool = await getReadyPgPool();
    const result = await pool.query(
      `INSERT INTO app_settings (setting_key, setting_value, updated_at)
       VALUES ($1, $2, $3)
       ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_at = EXCLUDED.updated_at
       RETURNING setting_key, setting_value, updated_at`,
      [settingKey, settingValue, updatedAt]
    );
    return mapAppSettingRow(result.rows[0]);
  }

  getSqlite()
    .prepare(
      `INSERT INTO app_settings (setting_key, setting_value, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value, updated_at = excluded.updated_at`
    )
    .run(settingKey, settingValue, updatedAt);

  return mapAppSettingRow(
    getSqlite().prepare(`SELECT setting_key, setting_value, updated_at FROM app_settings WHERE setting_key = ? LIMIT 1`).get(settingKey)
  );
}

export async function updateUserAccountStatus(userId, action, note = "") {
  const user = await findUserById(userId);
  if (!user) {
    return null;
  }

  const blockedAt = action === "block" ? nowIso() : action === "unblock" ? null : user.blockedAt;
  const deactivatedAt = action === "deactivate" ? nowIso() : action === "activate" ? null : user.deactivatedAt;
  const statusNote = note.trim();

  if (isStandalonePostgresEnabled()) {
    const pool = await getReadyPgPool();
    const result = await pool.query(
      `UPDATE users
       SET blocked_at = $2,
           deactivated_at = $3,
           status_note = $4
       WHERE id = $1
       RETURNING id, phone, password_hash, mpin_hash, name, joined_at, referral_code, role, approval_status, approved_at, rejected_at, blocked_at, deactivated_at, status_note, signup_bonus_granted, first_deposit_bonus_granted, referred_by_user_id`,
      [userId, blockedAt, deactivatedAt, statusNote]
    );
    return mapUserRow(result.rows[0]);
  }

  getSqlite()
    .prepare(
      `UPDATE users
       SET blocked_at = ?, deactivated_at = ?, status_note = ?
       WHERE id = ?`
    )
    .run(blockedAt, deactivatedAt, statusNote, userId);

  return findUserById(userId);
}

export async function listAllBids(limit = 300) {
  const { listAllBids: listAllBidsFromBidsDb } = await import("./db/bids-db.mjs");
  return listAllBidsFromBidsDb(limit);
}

export async function getDashboardSummaryData(startOfToday, dateKeys = []) {
  const { getDashboardSummaryData: getDashboardSummaryDataFromAdminDashboardDb } = await import("./db/admin-dashboard-db.mjs");
  return getDashboardSummaryDataFromAdminDashboardDb(startOfToday, dateKeys);
}

export async function getMonitoringSummaryData() {
  const { getMonitoringSummaryData: getMonitoringSummaryDataFromAdminMonitoringDb } = await import("./db/admin-monitoring-db.mjs");
  return getMonitoringSummaryDataFromAdminMonitoringDb();
}

export async function findPaymentOrderByReferenceForUser(userId, reference) {
  const { findPaymentOrderByReferenceForUser: findPaymentOrderByReferenceForUserFromPaymentDb } = await import("./db/payment-db.mjs");
  return findPaymentOrderByReferenceForUserFromPaymentDb(userId, reference);
}

export async function findPaymentOrderForCheckout(paymentOrderId, checkoutToken) {
  const { findPaymentOrderForCheckout: findPaymentOrderForCheckoutFromPaymentDb } = await import("./db/payment-db.mjs");
  return findPaymentOrderForCheckoutFromPaymentDb(paymentOrderId, checkoutToken);
}

export async function createPaymentOrder({
  id = `payment_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
  userId,
  amount,
  provider = "manual",
  reference = `RM${Date.now()}`,
  checkoutToken = null,
  gatewayOrderId = null,
  redirectUrl = null
}) {
  const { createPaymentOrder: createPaymentOrderFromPaymentDb } = await import("./db/payment-db.mjs");
  return createPaymentOrderFromPaymentDb({
    id,
    userId,
    amount,
    provider,
    reference,
    checkoutToken,
    gatewayOrderId,
    redirectUrl
  });
}

export async function completePaymentOrder({ paymentOrderId, gatewayOrderId, gatewayPaymentId, gatewaySignature }) {
  const { completePaymentOrder: completePaymentOrderFromPaymentDb } = await import("./db/payment-db.mjs");
  return completePaymentOrderFromPaymentDb({ paymentOrderId, gatewayOrderId, gatewayPaymentId, gatewaySignature });
}

export async function completePaymentLinkOrder({ reference, gatewayOrderId, gatewayPaymentId, gatewaySignature = "payment_link_webhook" }) {
  const { completePaymentLinkOrder: completePaymentLinkOrderFromPaymentDb } = await import("./db/payment-db.mjs");
  return completePaymentLinkOrderFromPaymentDb({ reference, gatewayOrderId, gatewayPaymentId, gatewaySignature });
}

export async function handlePaymentWebhook(reference, status) {
  const { handlePaymentWebhook: handlePaymentWebhookFromPaymentDb } = await import("./db/payment-db.mjs");
  return handlePaymentWebhookFromPaymentDb(reference, status);
}

async function findWalletEntryById(entryId) {
  if (isStandalonePostgresEnabled()) {
    const pool = getPgPool();
    const result = await pool.query(
      `SELECT id, user_id, type, status, amount, before_balance, after_balance, reference_id, proof_url, note, created_at
         FROM wallet_entries
         WHERE id = $1
         LIMIT 1`,
      [entryId]
    );
    return mapWalletEntryRow(result.rows[0]);
  }

    return mapWalletEntryRow(
      getSqlite()
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
    const pool = getPgPool();
    const result = await pool.query(
      `SELECT id, user_id, type, status, amount, before_balance, after_balance, reference_id, proof_url, note, created_at
       FROM wallet_entries
       WHERE user_id = $1 AND reference_id = $2
       ORDER BY created_at DESC, id DESC
       LIMIT 1`,
      [userId, referenceId]
    );
    return mapWalletEntryRow(result.rows[0]);
  }

  return mapWalletEntryRow(
    getSqlite()
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
    const pool = getPgPool();
    await pool.query(`UPDATE wallet_entries SET status = $1 WHERE id = $2`, [status, entryId]);
  } else {
    getSqlite().prepare(`UPDATE wallet_entries SET status = ? WHERE id = ?`).run(status, entryId);
  }

  return findWalletEntryById(entryId);
}

export async function updateWalletEntryAdmin(entryId, updates = {}) {
  const { updateWalletEntryAdmin: updateWalletEntryAdminFromWalletDb } = await import("./db/wallet-db.mjs");
  return updateWalletEntryAdminFromWalletDb(entryId, updates);
}

export async function getWalletApprovalRequests() {
  const { getWalletApprovalRequests: getWalletApprovalRequestsFromWalletDb } = await import("./db/wallet-db.mjs");
  return getWalletApprovalRequestsFromWalletDb();
}

export async function getWalletRequestHistory() {
  const { getWalletRequestHistory: getWalletRequestHistoryFromWalletDb } = await import("./db/wallet-db.mjs");
  return getWalletRequestHistoryFromWalletDb();
}

export async function getWalletAdminRequestItems({ history = false } = {}) {
  const { getWalletAdminRequestItems: getWalletAdminRequestItemsFromWalletDb } = await import("./db/wallet-db.mjs");
  return getWalletAdminRequestItemsFromWalletDb({ history });
}

export async function resolveWalletApprovalRequest(entryId, action) {
  const { resolveWalletApprovalRequest: resolveWalletApprovalRequestFromWalletDb } = await import("./db/wallet-db.mjs");
  return resolveWalletApprovalRequestFromWalletDb(entryId, action);
}

export async function completeWalletRequest(entryId) {
  const { completeWalletRequest: completeWalletRequestFromWalletDb } = await import("./db/wallet-db.mjs");
  return completeWalletRequestFromWalletDb(entryId);
}

export async function rejectWalletRequest(entryId) {
  const { rejectWalletRequest: rejectWalletRequestFromWalletDb } = await import("./db/wallet-db.mjs");
  return rejectWalletRequestFromWalletDb(entryId);
}

export async function updateUserApprovalStatus(userId, status) {
  const current = await findUserById(userId);
  if (!current) {
    return null;
  }

  const approvedAt = status === "Approved" ? nowIso() : null;
  const rejectedAt = status === "Rejected" ? nowIso() : null;
  const signupBonusGranted = status === "Approved" ? current.signupBonusGranted || true : current.signupBonusGranted;

  if (isStandalonePostgresEnabled()) {
    const pool = await getReadyPgPool();
    await pool.query(
      `UPDATE users
       SET approval_status = $1, approved_at = $2, rejected_at = $3, signup_bonus_granted = $4
       WHERE id = $5`,
      [status, approvedAt, rejectedAt, signupBonusGranted, userId]
    );
  } else {
    getSqlite()
      .prepare(
        `UPDATE users
         SET approval_status = ?, approved_at = ?, rejected_at = ?, signup_bonus_granted = ?
         WHERE id = ?`
      )
      .run(status, approvedAt, rejectedAt, signupBonusGranted ? 1 : 0, userId);
  }

  if (status === "Approved" && !current.signupBonusGranted) {
    const beforeBalance = await getUserBalance(userId);
    await addWalletEntry({
      userId,
      type: "SIGNUP_BONUS",
      status: "SUCCESS",
      amount: signupBonusAmount,
      beforeBalance,
      afterBalance: beforeBalance + signupBonusAmount
    });
  }

  return findUserById(userId);
}

export async function deleteUserAccount(userId) {
  const user = await findUserById(userId);
  if (!user) {
    return null;
  }
  if (user.role === "admin") {
    throw new Error("Admin account delete nahi kar sakte.");
  }

  if (isStandalonePostgresEnabled()) {
    const pool = await getReadyPgPool();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("UPDATE users SET referred_by_user_id = NULL WHERE referred_by_user_id = $1", [userId]);
      await client.query("UPDATE markets SET result_locked_by_user_id = NULL WHERE result_locked_by_user_id = $1", [userId]);
      await client.query("DELETE FROM referral_commission_refs WHERE referrer_user_id = $1 OR referred_user_id = $1", [userId]);
      await client.query(
        `DELETE FROM chat_messages
         WHERE conversation_id IN (SELECT id FROM chat_conversations WHERE user_id = $1)
            OR sender_user_id = $1`,
        [userId]
      );
      await client.query("DELETE FROM chat_conversations WHERE user_id = $1", [userId]);
      await client.query("DELETE FROM payment_orders WHERE user_id = $1", [userId]);
      await client.query("DELETE FROM notifications WHERE user_id = $1", [userId]);
      await client.query("DELETE FROM notification_devices WHERE user_id = $1", [userId]);
      await client.query("DELETE FROM bank_accounts WHERE user_id = $1", [userId]);
      await client.query("DELETE FROM bids WHERE user_id = $1", [userId]);
      await client.query("DELETE FROM wallet_entries WHERE user_id = $1", [userId]);
      await client.query("DELETE FROM sessions WHERE user_id = $1", [userId]);
      await client.query("DELETE FROM otp_challenges WHERE phone = $1", [user.phone]);
      await client.query("DELETE FROM users WHERE id = $1", [userId]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    return user;
  }

  const sqlite = getSqlite();
  const deleteUser = sqlite.transaction(() => {
    sqlite.prepare("UPDATE users SET referred_by_user_id = NULL WHERE referred_by_user_id = ?").run(userId);
    sqlite.prepare("UPDATE markets SET result_locked_by_user_id = NULL WHERE result_locked_by_user_id = ?").run(userId);
    sqlite.prepare("DELETE FROM referral_commission_refs WHERE referrer_user_id = ? OR referred_user_id = ?").run(userId, userId);
    sqlite
      .prepare(
        `DELETE FROM chat_messages
         WHERE conversation_id IN (SELECT id FROM chat_conversations WHERE user_id = ?)
            OR sender_user_id = ?`
      )
      .run(userId, userId);
    sqlite.prepare("DELETE FROM chat_conversations WHERE user_id = ?").run(userId);
    sqlite.prepare("DELETE FROM payment_orders WHERE user_id = ?").run(userId);
    sqlite.prepare("DELETE FROM notifications WHERE user_id = ?").run(userId);
    sqlite.prepare("DELETE FROM notification_devices WHERE user_id = ?").run(userId);
    sqlite.prepare("DELETE FROM bank_accounts WHERE user_id = ?").run(userId);
    sqlite.prepare("DELETE FROM bids WHERE user_id = ?").run(userId);
    sqlite.prepare("DELETE FROM wallet_entries WHERE user_id = ?").run(userId);
    sqlite.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
    sqlite.prepare("DELETE FROM otp_challenges WHERE phone = ?").run(user.phone);
    sqlite.prepare("DELETE FROM users WHERE id = ?").run(userId);
  });
  deleteUser();
  return user;
}

export async function addAuditLog(entry) {
  const id = `audit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const createdAt = nowIso();

  if (isStandalonePostgresEnabled()) {
    const pool = getPgPool();
    await pool.query(
      `INSERT INTO audit_logs (id, actor_user_id, action, entity_type, entity_id, details, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, entry.actorUserId, entry.action, entry.entityType, entry.entityId, entry.details, createdAt]
    );
  } else {
    getSqlite()
      .prepare(
        `INSERT INTO audit_logs (id, actor_user_id, action, entity_type, entity_id, details, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(id, entry.actorUserId, entry.action, entry.entityType, entry.entityId, entry.details, createdAt);
  }

  return { id, createdAt, ...entry };
}

export async function getAuditLogs(limit = 100) {
  const { getAuditLogs: getAuditLogsFromAdminAuditDb } = await import("./db/admin-audit-db.mjs");
  return getAuditLogsFromAdminAuditDb(limit);
}

export async function getAdminSnapshot() {
  const { getAdminSnapshot: getAdminSnapshotFromAdminSnapshotDb } = await import("./db/admin-snapshot-db.mjs");
  return getAdminSnapshotFromAdminSnapshotDb();
}

export { hashCredential, verifyCredential };
