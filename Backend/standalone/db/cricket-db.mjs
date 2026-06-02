import { isStandalonePostgresEnabled } from "../config.mjs";
import {
  __internalGetReadyPgPool,
  __internalGetSqlite,
  __internalNowIso
} from "../db.mjs";

let ensured = false;

function boolValue(value) {
  return value === true || value === 1 || value === "1" || String(value).toLowerCase() === "true";
}

function mapMatch(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    matchType: row.match_type || "T20",
    teamA: row.team_a,
    teamB: row.team_b,
    teamALogoUrl: row.team_a_logo_url || "",
    teamBLogoUrl: row.team_b_logo_url || "",
    status: row.status,
    startAt: row.start_at || null,
    tossBettingOpen: boolValue(row.toss_betting_open),
    matchBettingOpen: boolValue(row.match_betting_open),
    tossCloseAt: row.toss_close_at || null,
    matchCloseAt: row.match_close_at || null,
    tossWinner: row.toss_winner || null,
    matchWinner: row.match_winner || null,
    tossSettledAt: row.toss_settled_at || null,
    matchSettledAt: row.match_settled_at || null,
    createdAt: row.created_at
  };
}

function mapBet(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    matchId: row.match_id,
    matchTitle: row.match_title || "",
    marketType: row.bet_type,
    selection: row.selection,
    amount: Number(row.amount ?? 0),
    rate: Number(row.rate ?? 0),
    status: row.status,
    payout: Number(row.payout ?? 0),
    settledAt: row.settled_at || null,
    settledResult: row.settled_result || "",
    createdAt: row.created_at,
    user: row.user_name || row.user_phone ? {
      id: row.user_id,
      name: row.user_name || "Unknown",
      phone: row.user_phone || ""
    } : null
  };
}

function mapMarketResult(row) {
  if (!row) return null;
  return {
    matchId: row.match_id,
    marketType: row.market_type,
    winner: row.winner,
    settledAt: row.settled_at || null
  };
}

function normalizeIso(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

async function ensureCricketTables() {
  if (ensured) return;

  if (isStandalonePostgresEnabled()) {
    const pool = await __internalGetReadyPgPool();
    await pool.query(`
      CREATE TABLE IF NOT EXISTS cricket_matches (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        team_a TEXT NOT NULL,
        team_b TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'Live',
        active_over INTEGER NOT NULL DEFAULT 1,
        betting_open BOOLEAN NOT NULL DEFAULT TRUE,
        result_runs INTEGER,
        result_wicket BOOLEAN,
        result_boundary BOOLEAN,
        result_settled_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL
      )
    `);
    await pool.query(`
      ALTER TABLE cricket_matches
        ADD COLUMN IF NOT EXISTS start_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS match_type TEXT DEFAULT 'T20',
        ADD COLUMN IF NOT EXISTS toss_betting_open BOOLEAN NOT NULL DEFAULT TRUE,
        ADD COLUMN IF NOT EXISTS match_betting_open BOOLEAN NOT NULL DEFAULT TRUE,
        ADD COLUMN IF NOT EXISTS toss_close_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS match_close_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS team_a_logo_url TEXT,
        ADD COLUMN IF NOT EXISTS team_b_logo_url TEXT,
        ADD COLUMN IF NOT EXISTS toss_winner TEXT,
        ADD COLUMN IF NOT EXISTS match_winner TEXT,
        ADD COLUMN IF NOT EXISTS toss_settled_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS match_settled_at TIMESTAMPTZ
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS cricket_bets (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        match_id TEXT NOT NULL,
        match_title TEXT NOT NULL,
        over_number INTEGER NOT NULL DEFAULT 0,
        bet_type TEXT NOT NULL,
        selection TEXT NOT NULL,
        amount NUMERIC NOT NULL,
        rate NUMERIC NOT NULL,
        status TEXT NOT NULL DEFAULT 'Pending',
        payout NUMERIC NOT NULL DEFAULT 0,
        settled_at TIMESTAMPTZ,
        settled_result TEXT,
        created_at TIMESTAMPTZ NOT NULL
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS cricket_market_results (
        match_id TEXT NOT NULL,
        market_type TEXT NOT NULL,
        winner TEXT NOT NULL,
        settled_at TIMESTAMPTZ NOT NULL,
        PRIMARY KEY (match_id, market_type)
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_cricket_matches_status ON cricket_matches (status, created_at DESC)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_cricket_bets_user_created_at ON cricket_bets (user_id, created_at DESC)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_cricket_bets_match_status ON cricket_bets (match_id, status, created_at ASC)`);
  } else {
    const db = __internalGetSqlite();
    db.prepare(`
      CREATE TABLE IF NOT EXISTS cricket_matches (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        team_a TEXT NOT NULL,
        team_b TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'Live',
        active_over INTEGER NOT NULL DEFAULT 1,
        betting_open INTEGER NOT NULL DEFAULT 1,
        result_runs INTEGER,
        result_wicket INTEGER,
        result_boundary INTEGER,
        result_settled_at TEXT,
        created_at TEXT NOT NULL
      )
    `).run();
    const columns = new Set(db.prepare(`PRAGMA table_info(cricket_matches)`).all().map((column) => column.name));
    const additions = [
      ["start_at", "TEXT"],
      ["match_type", "TEXT DEFAULT 'T20'"],
      ["toss_betting_open", "INTEGER NOT NULL DEFAULT 1"],
      ["match_betting_open", "INTEGER NOT NULL DEFAULT 1"],
      ["toss_close_at", "TEXT"],
      ["match_close_at", "TEXT"],
      ["team_a_logo_url", "TEXT"],
      ["team_b_logo_url", "TEXT"],
      ["toss_winner", "TEXT"],
      ["match_winner", "TEXT"],
      ["toss_settled_at", "TEXT"],
      ["match_settled_at", "TEXT"]
    ];
    for (const [name, type] of additions) {
      if (!columns.has(name)) {
        db.prepare(`ALTER TABLE cricket_matches ADD COLUMN ${name} ${type}`).run();
      }
    }
    db.prepare(`
      CREATE TABLE IF NOT EXISTS cricket_bets (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        match_id TEXT NOT NULL,
        match_title TEXT NOT NULL,
        over_number INTEGER NOT NULL DEFAULT 0,
        bet_type TEXT NOT NULL,
        selection TEXT NOT NULL,
        amount REAL NOT NULL,
        rate REAL NOT NULL,
        status TEXT NOT NULL DEFAULT 'Pending',
        payout REAL NOT NULL DEFAULT 0,
        settled_at TEXT,
        settled_result TEXT,
        created_at TEXT NOT NULL
      )
    `).run();
    db.prepare(`
      CREATE TABLE IF NOT EXISTS cricket_market_results (
        match_id TEXT NOT NULL,
        market_type TEXT NOT NULL,
        winner TEXT NOT NULL,
        settled_at TEXT NOT NULL,
        PRIMARY KEY (match_id, market_type)
      )
    `).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_cricket_matches_status ON cricket_matches (status, created_at DESC)`).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_cricket_bets_user_created_at ON cricket_bets (user_id, created_at DESC)`).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_cricket_bets_match_status ON cricket_bets (match_id, status, created_at ASC)`).run();
  }

  ensured = true;
}

export async function listCricketMatches({ admin = false } = {}) {
  await ensureCricketTables();
  if (isStandalonePostgresEnabled()) {
    const pool = await __internalGetReadyPgPool();
    const result = await pool.query(
      `SELECT * FROM cricket_matches
       ${admin ? "" : "WHERE status <> 'Hidden'"}
       ORDER BY COALESCE(start_at, created_at) ASC, created_at DESC, id DESC
       LIMIT 100`
    );
    return result.rows.map(mapMatch);
  }

  const rows = __internalGetSqlite()
    .prepare(
      `SELECT * FROM cricket_matches
       ${admin ? "" : "WHERE status <> 'Hidden'"}
       ORDER BY COALESCE(start_at, created_at) ASC, created_at DESC, id DESC
       LIMIT 100`
    )
    .all();
  return rows.map(mapMatch);
}

export async function findCricketMatch(matchId) {
  await ensureCricketTables();
  if (isStandalonePostgresEnabled()) {
    const pool = await __internalGetReadyPgPool();
    const result = await pool.query(`SELECT * FROM cricket_matches WHERE id = $1 LIMIT 1`, [matchId]);
    return mapMatch(result.rows[0]);
  }
  return mapMatch(__internalGetSqlite().prepare(`SELECT * FROM cricket_matches WHERE id = ? LIMIT 1`).get(matchId));
}

export async function upsertCricketMatch(input) {
  await ensureCricketTables();
  const now = __internalNowIso();
  const id = String(input.id || `cricket_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`).trim();
  const title = String(input.title || "").trim();
  const matchType = String(input.matchType || input.match_type || "T20").trim() || "T20";
  const teamA = String(input.teamA || "").trim();
  const teamB = String(input.teamB || "").trim();
  const teamALogoUrl = String(input.teamALogoUrl || input.teamALogo || "").trim();
  const teamBLogoUrl = String(input.teamBLogoUrl || input.teamBLogo || "").trim();
  const status = String(input.status || "Live").trim() || "Live";
  const startAt = normalizeIso(input.startAt);
  const tossCloseAt = normalizeIso(input.tossCloseAt);
  const matchCloseAt = normalizeIso(input.matchCloseAt);
  const tossBettingOpen = input.tossBettingOpen !== false && String(input.tossBettingOpen) !== "false";
  const matchBettingOpen = input.matchBettingOpen !== false && String(input.matchBettingOpen) !== "false";
  if (!title || !teamA || !teamB) {
    throw new Error("Match title, team A, and team B are required");
  }

  if (isStandalonePostgresEnabled()) {
    const pool = await __internalGetReadyPgPool();
    const result = await pool.query(
      `INSERT INTO cricket_matches (
         id, title, match_type, team_a, team_b, team_a_logo_url, team_b_logo_url, status, start_at, toss_betting_open, match_betting_open, toss_close_at, match_close_at, created_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       ON CONFLICT (id) DO UPDATE SET
         title = EXCLUDED.title,
         match_type = EXCLUDED.match_type,
         team_a = EXCLUDED.team_a,
         team_b = EXCLUDED.team_b,
         team_a_logo_url = EXCLUDED.team_a_logo_url,
         team_b_logo_url = EXCLUDED.team_b_logo_url,
         status = EXCLUDED.status,
         start_at = EXCLUDED.start_at,
         toss_betting_open = EXCLUDED.toss_betting_open,
         match_betting_open = EXCLUDED.match_betting_open,
         toss_close_at = EXCLUDED.toss_close_at,
         match_close_at = EXCLUDED.match_close_at
       RETURNING *`,
      [id, title, matchType, teamA, teamB, teamALogoUrl, teamBLogoUrl, status, startAt, tossBettingOpen, matchBettingOpen, tossCloseAt, matchCloseAt, now]
    );
    return mapMatch(result.rows[0]);
  }

  __internalGetSqlite()
    .prepare(
      `INSERT INTO cricket_matches (
         id, title, match_type, team_a, team_b, team_a_logo_url, team_b_logo_url, status, start_at, toss_betting_open, match_betting_open, toss_close_at, match_close_at, created_at
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         title = excluded.title,
         match_type = excluded.match_type,
         team_a = excluded.team_a,
         team_b = excluded.team_b,
         team_a_logo_url = excluded.team_a_logo_url,
         team_b_logo_url = excluded.team_b_logo_url,
         status = excluded.status,
         start_at = excluded.start_at,
         toss_betting_open = excluded.toss_betting_open,
         match_betting_open = excluded.match_betting_open,
         toss_close_at = excluded.toss_close_at,
         match_close_at = excluded.match_close_at`
    )
    .run(id, title, matchType, teamA, teamB, teamALogoUrl, teamBLogoUrl, status, startAt, tossBettingOpen ? 1 : 0, matchBettingOpen ? 1 : 0, tossCloseAt, matchCloseAt, now);
  return findCricketMatch(id);
}

export async function addCricketBet({ userId, match, marketType, selection, amount, rate }) {
  await ensureCricketTables();
  const id = `cricket_bid_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const createdAt = __internalNowIso();
  if (isStandalonePostgresEnabled()) {
    const pool = await __internalGetReadyPgPool();
    const result = await pool.query(
      `INSERT INTO cricket_bets (id, user_id, match_id, match_title, over_number, bet_type, selection, amount, rate, status, payout, created_at)
       VALUES ($1, $2, $3, $4, 0, $5, $6, $7, $8, 'Pending', 0, $9)
       RETURNING *`,
      [id, userId, match.id, match.title, marketType, selection, amount, rate, createdAt]
    );
    return mapBet(result.rows[0]);
  }
  __internalGetSqlite()
    .prepare(
      `INSERT INTO cricket_bets (id, user_id, match_id, match_title, over_number, bet_type, selection, amount, rate, status, payout, created_at)
       VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, 'Pending', 0, ?)`
    )
    .run(id, userId, match.id, match.title, marketType, selection, amount, rate, createdAt);
  return mapBet(__internalGetSqlite().prepare(`SELECT * FROM cricket_bets WHERE id = ? LIMIT 1`).get(id));
}

export async function listCricketBetsForUser(userId, limit = 200) {
  await ensureCricketTables();
  const normalizedLimit = Math.max(1, Math.min(1000, Number(limit) || 200));
  if (isStandalonePostgresEnabled()) {
    const pool = await __internalGetReadyPgPool();
    const result = await pool.query(
      `SELECT cb.*, u.name AS user_name, u.phone AS user_phone
       FROM cricket_bets cb
       LEFT JOIN users u ON u.id = cb.user_id
       WHERE cb.user_id = $1
       ORDER BY cb.created_at DESC, cb.id DESC
       LIMIT $2`,
      [userId, normalizedLimit]
    );
    return result.rows.map(mapBet);
  }
  return __internalGetSqlite()
    .prepare(
      `SELECT cb.*, u.name AS user_name, u.phone AS user_phone
       FROM cricket_bets cb
       LEFT JOIN users u ON u.id = cb.user_id
       WHERE cb.user_id = ?
       ORDER BY cb.created_at DESC, cb.id DESC
       LIMIT ?`
    )
    .all(userId, normalizedLimit)
    .map(mapBet);
}

export async function listCricketBetsForMatch(matchId) {
  await ensureCricketTables();
  if (!String(matchId || "").trim()) {
    return listAllCricketBets();
  }
  if (isStandalonePostgresEnabled()) {
    const pool = await __internalGetReadyPgPool();
    const result = await pool.query(
      `SELECT cb.*, u.name AS user_name, u.phone AS user_phone
       FROM cricket_bets cb
       LEFT JOIN users u ON u.id = cb.user_id
       WHERE cb.match_id = $1
       ORDER BY cb.created_at DESC, cb.id DESC`,
      [matchId]
    );
    return result.rows.map(mapBet);
  }
  return __internalGetSqlite()
    .prepare(
      `SELECT cb.*, u.name AS user_name, u.phone AS user_phone
       FROM cricket_bets cb
       LEFT JOIN users u ON u.id = cb.user_id
       WHERE cb.match_id = ?
       ORDER BY cb.created_at DESC, cb.id DESC`
    )
    .all(matchId)
    .map(mapBet);
}

export async function listAllCricketBets(limit = 500) {
  await ensureCricketTables();
  const normalizedLimit = Math.max(1, Math.min(2000, Number(limit) || 500));
  if (isStandalonePostgresEnabled()) {
    const pool = await __internalGetReadyPgPool();
    const result = await pool.query(
      `SELECT cb.*, u.name AS user_name, u.phone AS user_phone
       FROM cricket_bets cb
       LEFT JOIN users u ON u.id = cb.user_id
       ORDER BY cb.created_at DESC, cb.id DESC
       LIMIT $1`,
      [normalizedLimit]
    );
    return result.rows.map(mapBet);
  }
  return __internalGetSqlite()
    .prepare(
      `SELECT cb.*, u.name AS user_name, u.phone AS user_phone
       FROM cricket_bets cb
       LEFT JOIN users u ON u.id = cb.user_id
       ORDER BY cb.created_at DESC, cb.id DESC
       LIMIT ?`
    )
    .all(normalizedLimit)
    .map(mapBet);
}

export async function listCricketMarketResults(matchIds = []) {
  await ensureCricketTables();
  const ids = Array.from(new Set((Array.isArray(matchIds) ? matchIds : []).map((id) => String(id || "").trim()).filter(Boolean)));
  if (!ids.length) return [];
  if (isStandalonePostgresEnabled()) {
    const pool = await __internalGetReadyPgPool();
    const result = await pool.query(
      `SELECT match_id, market_type, winner, settled_at
       FROM cricket_market_results
       WHERE match_id = ANY($1::text[])`,
      [ids]
    );
    return result.rows.map(mapMarketResult);
  }
  const placeholders = ids.map(() => "?").join(", ");
  return __internalGetSqlite()
    .prepare(`SELECT match_id, market_type, winner, settled_at FROM cricket_market_results WHERE match_id IN (${placeholders})`)
    .all(...ids)
    .map(mapMarketResult);
}

export async function updateCricketBetSettlement(betId, status, payout, settledResult) {
  await ensureCricketTables();
  const settledAt = status === "Pending" ? null : __internalNowIso();
  if (isStandalonePostgresEnabled()) {
    const pool = await __internalGetReadyPgPool();
    const result = await pool.query(
      `UPDATE cricket_bets
       SET status = $1, payout = $2, settled_at = $3, settled_result = $4
       WHERE id = $5
       RETURNING *`,
      [status, payout, settledAt, settledResult, betId]
    );
    return mapBet(result.rows[0]);
  }
  __internalGetSqlite()
    .prepare(`UPDATE cricket_bets SET status = ?, payout = ?, settled_at = ?, settled_result = ? WHERE id = ?`)
    .run(status, payout, settledAt, settledResult, betId);
  return mapBet(__internalGetSqlite().prepare(`SELECT * FROM cricket_bets WHERE id = ? LIMIT 1`).get(betId));
}

export async function saveCricketMarketResult(matchId, marketType, winner) {
  await ensureCricketTables();
  const settledAt = __internalNowIso();
  const isToss = marketType === "toss_winner";
  const isMatchWinner = marketType === "match_winner";
  if (isStandalonePostgresEnabled()) {
    const pool = await __internalGetReadyPgPool();
    await pool.query(
      `INSERT INTO cricket_market_results (match_id, market_type, winner, settled_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (match_id, market_type) DO UPDATE SET winner = EXCLUDED.winner, settled_at = EXCLUDED.settled_at`,
      [matchId, marketType, winner, settledAt]
    );
    if (!isToss && !isMatchWinner) {
      return findCricketMatch(matchId);
    }
    const result = await pool.query(
      `UPDATE cricket_matches
       SET ${isToss ? "toss_winner = $1, toss_settled_at = $2, toss_betting_open = FALSE" : "match_winner = $1, match_settled_at = $2, match_betting_open = FALSE, status = 'Closed'"}
       WHERE id = $3
       RETURNING *`,
      [winner, settledAt, matchId]
    );
    return mapMatch(result.rows[0]);
  }
  __internalGetSqlite()
    .prepare(
      `INSERT INTO cricket_market_results (match_id, market_type, winner, settled_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(match_id, market_type) DO UPDATE SET winner = excluded.winner, settled_at = excluded.settled_at`
    )
    .run(matchId, marketType, winner, settledAt);
  if (!isToss && !isMatchWinner) {
    return findCricketMatch(matchId);
  }
  __internalGetSqlite()
    .prepare(
      `UPDATE cricket_matches
       SET ${isToss ? "toss_winner = ?, toss_settled_at = ?, toss_betting_open = 0" : "match_winner = ?, match_settled_at = ?, match_betting_open = 0, status = 'Closed'"}
       WHERE id = ?`
    )
    .run(winner, settledAt, matchId);
  return findCricketMatch(matchId);
}
