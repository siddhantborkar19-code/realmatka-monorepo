import {
  __internalGetReadyPgPool,
  __internalGetSqlite,
  __internalMapBidRow,
  __internalNowIso,
  addBid,
  addWalletEntry,
  getUserBalance
} from "../db.mjs";
import { isStandalonePostgresEnabled } from "../config.mjs";
import { requireAuthenticatedUser } from "../middleware/auth-middleware.mjs";
import { getMarketListSnapshot, getMarketRuntimeMeta } from "../services/market-snapshot-service.mjs";
import {
  allDoublePannas,
  allSinglePannas,
  allTriplePannas,
  getPannaType,
  isValidPanna
} from "../matka-rules.mjs";
import { corsPreflight, fail, getJsonBody, ok } from "../http.mjs";
import { getMarketDayKey } from "../services/admin-settlement-helpers.mjs";

const MIN_BID_POINTS = 5;
const MAX_BID_POINTS = 99999;
const DUPLICATE_BID_WINDOW_SECONDS = 60;
const emptySangam = { valid: false, value: "", message: "" };
const sessionlessBoards = new Set([
  "Jodi Digit",
  "Jodi Digit Bulk",
  "Group Jodi",
  "Red Bracket",
  "Digit Based Jodi",
  "Half Sangam",
  "Full Sangam"
]);
export function options(request) {
  return corsPreflight(request);
}

export async function place(request) {
  const auth = await requireAuthenticatedUser(request);
  if (auth.response) return auth.response;
  const { user } = auth;

  const body = await getJsonBody(request);
  const market = String(body.market ?? "");
  const boardLabel = String(body.boardLabel ?? "");
  const requestedSessionType = String(body.sessionType ?? "Close");
  const sessionType = normalizeSessionType(boardLabel, requestedSessionType);
  const items = Array.isArray(body.items) ? body.items : [];
  const requestId = String(body.requestId ?? "").trim();

  if (!market || !boardLabel || items.length === 0) {
    return fail("Market, boardLabel, and items are required", 400, request);
  }

  const markets = await getMarketListSnapshot();
  const marketRecord = markets.find((item) => item.name === market);
  if (!marketRecord) {
    return fail("Market not found", 404, request);
  }

  const marketMeta = getMarketRuntimeMeta(marketRecord);
  if (marketMeta.phase === "closed") {
    return fail("Betting is closed for today", 400, request);
  }
  if (marketMeta.phase === "close-running" && sessionType === "Open") {
    return fail("Open session betting is closed for this board", 400, request);
  }

  const totalPoints = items.reduce((sum, item) => sum + Number(item?.points ?? 0), 0);

  if (totalPoints <= 0) {
    return fail("Total points must be greater than 0", 400, request);
  }

  for (const item of items) {
    const points = Number(item?.points ?? 0);
    if (!Number.isFinite(points) || points < MIN_BID_POINTS || points > MAX_BID_POINTS) {
      return fail(`Each bid amount must be between ${MIN_BID_POINTS} and ${MAX_BID_POINTS}`, 400, request);
    }
    const validationError = validateBidItem(boardLabel, String(item?.digit ?? ""), sessionType);
    if (validationError) {
      return fail(validationError, 400, request);
    }
  }

  const marketDay = getMarketDayKey(new Date());
  const normalizedItems = normalizeBidRequestItems(items, boardLabel);

  if (isStandalonePostgresEnabled()) {
    const pool = await __internalGetReadyPgPool();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [user.id]);

      const duplicateRows = requestId
        ? await findProcessedBidBatchByRequestIdPostgres(client, {
            userId: user.id,
            market,
            marketDay,
            boardLabel,
            sessionType,
            requestId,
            normalizedItems
          })
        : [];
      const recentDuplicateRows = duplicateRows.length
        ? duplicateRows
        : await findRecentDuplicateBidBatchPostgres(client, {
            userId: user.id,
            market,
            marketDay,
            boardLabel,
            sessionType,
            normalizedItems
          });
      if (recentDuplicateRows.length > 0) {
        await client.query("COMMIT");
        return ok(recentDuplicateRows, request);
      }

      const beforeBalance = await getAccurateUserBalancePostgres(client, user.id);
      if (totalPoints > beforeBalance) {
        await client.query("ROLLBACK");
        return fail("Insufficient balance", 400, request);
      }

      const createdAt = __internalNowIso();
      const created = [];
      for (const item of normalizedItems) {
        const id = `bid_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        await client.query(
          `INSERT INTO bids (id, user_id, market, market_day, board_label, game_type, session_type, digit, points, status, payout, settled_at, settled_result, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'Pending', 0, NULL, NULL, $10)`,
          [id, user.id, market, marketDay, boardLabel, item.gameType, sessionType, item.digit, item.points, createdAt]
        );
        created.push({
          id,
          userId: user.id,
          market,
          marketDay,
          boardLabel,
          gameType: item.gameType,
          sessionType,
          digit: item.digit,
          points: item.points,
          status: "Pending",
          payout: 0,
          settledAt: null,
          settledResult: null,
          createdAt
        });
      }

      const walletEntryId = `wallet_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      await client.query(
        `INSERT INTO wallet_entries (id, user_id, type, status, amount, before_balance, after_balance, reference_id, proof_url, note, created_at)
         VALUES ($1, $2, 'BID_PLACED', 'SUCCESS', $3, $4, $5, $6, NULL, NULL, $7)`,
        [walletEntryId, user.id, totalPoints, beforeBalance, beforeBalance - totalPoints, requestId || null, createdAt]
      );

      await client.query("COMMIT");
      return ok(created, request);
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {}
      throw error;
    } finally {
      client.release();
    }
  }

  const sqlite = __internalGetSqlite();
  sqlite.exec("BEGIN IMMEDIATE");
  try {
    const duplicateRows = requestId
      ? findProcessedBidBatchByRequestIdSqlite(sqlite, {
          userId: user.id,
          market,
          marketDay,
          boardLabel,
          sessionType,
          requestId,
          normalizedItems
        })
      : [];
    const recentDuplicateRows = duplicateRows.length
      ? duplicateRows
      : findRecentDuplicateBidBatchSqlite(sqlite, {
          userId: user.id,
          market,
          marketDay,
          boardLabel,
          sessionType,
          normalizedItems
        });
    if (recentDuplicateRows.length > 0) {
      sqlite.exec("COMMIT");
      return ok(recentDuplicateRows, request);
    }

    const beforeBalance = await getUserBalance(user.id);
    if (totalPoints > beforeBalance) {
      sqlite.exec("ROLLBACK");
      return fail("Insufficient balance", 400, request);
    }

    const created = await Promise.all(
      normalizedItems.map((item) =>
        addBid({
          userId: user.id,
          market,
          marketDay,
          boardLabel,
          gameType: item.gameType,
          sessionType,
          digit: item.digit,
          points: item.points,
          status: "Pending",
          payout: 0,
          settledAt: null,
          settledResult: null
        })
      )
    );

    await addWalletEntry({
      userId: user.id,
      type: "BID_PLACED",
      status: "SUCCESS",
      amount: totalPoints,
      beforeBalance,
      afterBalance: beforeBalance - totalPoints,
      referenceId: requestId || null
    });

    sqlite.exec("COMMIT");
    return ok(created, request);
  } catch (error) {
    try {
      sqlite.exec("ROLLBACK");
    } catch {}
    throw error;
  }
}

function normalizeBidRequestItems(items, boardLabel) {
  return items.map((item) => ({
    gameType: String(item?.gameType ?? boardLabel),
    digit: String(item?.digit ?? ""),
    points: Number(item?.points ?? 0)
  }));
}

function buildBidSignatureMap(items) {
  const counts = new Map();
  for (const item of items) {
    const signature = [item.gameType, item.digit, item.points.toFixed(2)].join("|");
    counts.set(signature, (counts.get(signature) ?? 0) + 1);
  }
  return counts;
}

function isDuplicateBatch(items, rows) {
  if (rows.length !== items.length) {
    return false;
  }
  const expected = buildBidSignatureMap(items);
  const actual = buildBidSignatureMap(
    rows.map((row) => ({
      gameType: String(row.game_type ?? row.gameType ?? ""),
      digit: String(row.digit ?? ""),
      points: Number(row.points ?? 0)
    }))
  );
  if (expected.size !== actual.size) {
    return false;
  }
  for (const [signature, count] of expected.entries()) {
    if (actual.get(signature) !== count) {
      return false;
    }
  }
  return true;
}

function findDuplicateBatchRows(items, rows) {
  const batchSize = items.length;
  if (!batchSize || rows.length < batchSize) {
    return [];
  }

  for (let index = 0; index <= rows.length - batchSize; index += 1) {
    const candidate = rows.slice(index, index + batchSize);
    if (isDuplicateBatch(items, candidate)) {
      return candidate;
    }
  }

  return [];
}

async function findRecentDuplicateBidBatchPostgres(
  client,
  { userId, market, marketDay, boardLabel, sessionType, normalizedItems }
) {
  const result = await client.query(
    `SELECT id, user_id, market, market_day, board_label, game_type, session_type, digit, points, status, payout, settled_at, settled_result, created_at
     FROM bids
     WHERE user_id = $1
       AND market = $2
       AND market_day = $3
       AND board_label = $4
       AND session_type = $5
       AND created_at >= NOW() - ($6::text || ' seconds')::interval
     ORDER BY created_at ASC, id ASC`,
    [userId, market, marketDay, boardLabel, sessionType, String(DUPLICATE_BID_WINDOW_SECONDS)]
  );
  const duplicateRows = findDuplicateBatchRows(normalizedItems, result.rows);
  if (!duplicateRows.length) {
    return [];
  }
  return duplicateRows.map((row) => __internalMapBidRow(row));
}

async function findProcessedBidBatchByRequestIdPostgres(
  client,
  { userId, market, marketDay, boardLabel, sessionType, requestId, normalizedItems }
) {
  const walletResult = await client.query(
    `SELECT created_at
     FROM wallet_entries
     WHERE user_id = $1
       AND type = 'BID_PLACED'
       AND status = 'SUCCESS'
       AND reference_id = $2
     ORDER BY created_at DESC, id DESC
     LIMIT 1`,
    [userId, requestId]
  );
  const createdAt = walletResult.rows[0]?.created_at;
  if (!createdAt) {
    return [];
  }

  const bidsResult = await client.query(
    `SELECT id, user_id, market, market_day, board_label, game_type, session_type, digit, points, status, payout, settled_at, settled_result, created_at
     FROM bids
     WHERE user_id = $1
       AND market = $2
       AND market_day = $3
       AND board_label = $4
       AND session_type = $5
       AND created_at BETWEEN ($6::timestamptz - INTERVAL '10 seconds') AND ($6::timestamptz + INTERVAL '10 seconds')
     ORDER BY created_at ASC, id ASC`,
    [userId, market, marketDay, boardLabel, sessionType, createdAt]
  );
  const duplicateRows = findDuplicateBatchRows(normalizedItems, bidsResult.rows);
  if (!duplicateRows.length) {
    return [];
  }
  return duplicateRows.map((row) => __internalMapBidRow(row));
}

function findRecentDuplicateBidBatchSqlite(
  sqlite,
  { userId, market, marketDay, boardLabel, sessionType, normalizedItems }
) {
  const windowStart = new Date(Date.now() - DUPLICATE_BID_WINDOW_SECONDS * 1000).toISOString();
  const rows = sqlite
    .prepare(
      `SELECT id, user_id, market, market_day, board_label, game_type, session_type, digit, points, status, payout, settled_at, settled_result, created_at
       FROM bids
       WHERE user_id = ?
         AND market = ?
         AND market_day = ?
         AND board_label = ?
         AND session_type = ?
         AND created_at >= ?
       ORDER BY created_at ASC, id ASC`
    )
    .all(userId, market, marketDay, boardLabel, sessionType, windowStart);
  const duplicateRows = findDuplicateBatchRows(normalizedItems, rows);
  if (!duplicateRows.length) {
    return [];
  }
  return duplicateRows.map((row) => __internalMapBidRow(row));
}

function findProcessedBidBatchByRequestIdSqlite(
  sqlite,
  { userId, market, marketDay, boardLabel, sessionType, requestId, normalizedItems }
) {
  const walletRow = sqlite
    .prepare(
      `SELECT created_at
       FROM wallet_entries
       WHERE user_id = ?
         AND type = 'BID_PLACED'
         AND status = 'SUCCESS'
         AND reference_id = ?
       ORDER BY created_at DESC, id DESC
       LIMIT 1`
    )
    .get(userId, requestId);
  if (!walletRow?.created_at) {
    return [];
  }

  const windowCenter = new Date(walletRow.created_at).getTime();
  const windowStart = new Date(windowCenter - 10_000).toISOString();
  const windowEnd = new Date(windowCenter + 10_000).toISOString();
  const rows = sqlite
    .prepare(
      `SELECT id, user_id, market, market_day, board_label, game_type, session_type, digit, points, status, payout, settled_at, settled_result, created_at
       FROM bids
       WHERE user_id = ?
         AND market = ?
         AND market_day = ?
         AND board_label = ?
         AND session_type = ?
         AND created_at BETWEEN ? AND ?
       ORDER BY created_at ASC, id ASC`
    )
    .all(userId, market, marketDay, boardLabel, sessionType, windowStart, windowEnd);
  const duplicateRows = findDuplicateBatchRows(normalizedItems, rows);
  if (!duplicateRows.length) {
    return [];
  }
  return duplicateRows.map((row) => __internalMapBidRow(row));
}

async function getAccurateUserBalancePostgres(client, userId) {
  const result = await client.query(
    `SELECT COALESCE(SUM(
      CASE
        WHEN status = 'SUCCESS' AND type IN ('DEPOSIT','BID_WIN','ADMIN_CREDIT','REFERRAL_COMMISSION','SIGNUP_BONUS','FIRST_DEPOSIT_BONUS','SPECIAL_DEPOSIT_BONUS') THEN amount
        WHEN ((status = 'SUCCESS' AND type IN ('WITHDRAW','BID_PLACED','ADMIN_DEBIT','BID_WIN_REVERSAL'))
           OR (status = 'BACKOFFICE' AND type = 'WITHDRAW')) THEN -amount
        ELSE 0
      END
    ), 0) AS live_balance
    FROM wallet_entries
    WHERE user_id = $1`,
    [userId]
  );
  return Number(result.rows[0]?.live_balance ?? 0);
}

export async function boardHelper(request) {
  const url = new URL(request.url);
  const boardLabel = url.searchParams.get("boardLabel")?.trim() ?? "";
  const query = url.searchParams.get("query")?.trim() ?? "";
  const sessionType = url.searchParams.get("sessionType") === "Open" ? "Open" : "Close";
  const first = url.searchParams.get("first")?.trim() ?? "";
  const second = url.searchParams.get("second")?.trim() ?? "";

  if (!boardLabel) {
    return fail("boardLabel is required", 400, request);
  }

  return ok(
    {
      options: getBoardOptions(boardLabel),
      suggestions: getPanaSuggestions(boardLabel, query),
      validationMessage: getPanaValidationMessage(boardLabel, query),
      sangam: buildSangamValue(boardLabel, sessionType, { first, second })
    },
    request
  );
}

function normalizeSessionType(boardLabel, requestedSessionType) {
  if (sessionlessBoards.has(boardLabel)) {
    return "NA";
  }
  return requestedSessionType === "Open" ? "Open" : "Close";
}

function validateBidItem(boardLabel, rawDigit, sessionType) {
  const digit = rawDigit.trim();
  if (!digit) {
    return "Bid digit is required";
  }
  if (sessionlessBoards.has(boardLabel) && sessionType !== "NA") {
    return `${boardLabel} me Open ya Close session use nahi hota`;
  }
  if (!sessionlessBoards.has(boardLabel) && !["Open", "Close"].includes(sessionType)) {
    return `${boardLabel} ke liye valid session required hai`;
  }
  if (["Single Digit", "Single Digit Bulk"].includes(boardLabel) && !/^[0-9]{1}$/.test(digit)) {
    return `${boardLabel} me sirf 1 digit allowed hai`;
  }
  if (["Jodi Digit", "Jodi Digit Bulk", "Red Bracket", "Digit Based Jodi"].includes(boardLabel) && !/^[0-9]{2}$/.test(digit)) {
    return `${boardLabel} me sirf 2 digit jodi allowed hai`;
  }
  if (boardLabel === "Group Jodi" && !/^[0-9]{2}-[0-9]{2}$/.test(digit)) {
    return "Group Jodi me format 12-34 hona chahiye";
  }
  if (boardLabel === "Odd Even" && !/^((Odd|Even)-(Odd|Even)|Odd|Even)$/i.test(digit)) {
    return "Odd Even me valid Odd/Even option chahiye";
  }
  if (boardLabel === "SP DP TP") {
    if (!isValidPanna(digit)) {
      return "SP DP TP me valid panna chahiye";
    }
  }
  if (["Single Pana", "Single Pana Bulk", "SP Motor"].includes(boardLabel)) {
    if (!isValidPanna(digit) || getPannaType(digit) !== "single") {
      return `${boardLabel} me sirf valid Single Pana entry allowed hai`;
    }
  }
  if (["Double Pana", "Double Pana Bulk", "DP Motor"].includes(boardLabel)) {
    if (!isValidPanna(digit) || getPannaType(digit) !== "double") {
      return `${boardLabel} me sirf valid Double Pana entry allowed hai`;
    }
  }
  if (boardLabel === "Triple Pana") {
    if (!isValidPanna(digit) || getPannaType(digit) !== "triple") {
      return "Triple Pana me sirf valid Triple Pana entry allowed hai";
    }
  }
  if (boardLabel === "Half Sangam") {
    const [first, second] = digit.split("-");
    if (!isValidPanna(first || "") || !/^[0-9]{1}$/.test(second || "")) {
      return "Half Sangam me format OpenPana-CloseAnk chahiye";
    }
  }
  if (boardLabel === "Full Sangam") {
    const [first, second] = digit.split("-");
    if (!isValidPanna(first || "") || !isValidPanna(second || "")) {
      return "Full Sangam me format OpenPana-ClosePana chahiye";
    }
  }
  return null;
}

function getBoardOptions(boardLabel) {
  if (boardLabel === "SP Motor") {
    return [...allSinglePannas];
  }
  if (boardLabel === "DP Motor") {
    return [...allDoublePannas];
  }
  if (boardLabel === "Triple Pana") {
    return [...allTriplePannas];
  }
  return [];
}

function getAllowedPannas(boardLabel) {
  if (boardLabel === "Choice Pana") {
    return [...allSinglePannas, ...allDoublePannas, ...allTriplePannas];
  }
  if (["Single Pana", "Single Pana Bulk", "SP Motor"].includes(boardLabel)) {
    return [...allSinglePannas];
  }
  if (["Double Pana", "Double Pana Bulk", "DP Motor"].includes(boardLabel)) {
    return [...allDoublePannas];
  }
  if (boardLabel === "Triple Pana") {
    return [...allTriplePannas];
  }
  return [];
}

function getPanaValidationMessage(boardLabel, value) {
  const panna = value.trim();
  if (!panna) {
    return "";
  }
  if (!/^[0-9]{3}$/.test(panna)) {
    return "Enter 3 digit panna.";
  }
  if (!isValidPanna(panna)) {
    return "Enter valid panna.";
  }
  if (["Single Pana", "Single Pana Bulk", "SP Motor"].includes(boardLabel) && getPannaType(panna) !== "single") {
    return "Enter valid Single Pana only.";
  }
  if (["Double Pana", "Double Pana Bulk", "DP Motor"].includes(boardLabel) && getPannaType(panna) !== "double") {
    return "Enter valid Double Pana only.";
  }
  if (boardLabel === "Triple Pana" && getPannaType(panna) !== "triple") {
    return "Enter valid Triple Pana only.";
  }
  return "";
}

function getPanaSuggestions(boardLabel, value) {
  const source = getAllowedPannas(boardLabel);
  if (!source.length) {
    return [];
  }
  if (boardLabel === "Choice Pana") {
    if (!value) {
      return source;
    }
    return source.filter((item) => item.startsWith(value));
  }
  if (!value) {
    return source.slice(0, 8);
  }
  return source.filter((item) => item.startsWith(value)).slice(0, 8);
}

function buildSangamValue(boardLabel, sessionType, row) {
  const first = row.first.trim();
  const second = row.second.trim();

  if (boardLabel !== "Half Sangam" && boardLabel !== "Full Sangam") {
    return emptySangam;
  }
  if (!first && !second) {
    return emptySangam;
  }

  if (boardLabel === "Half Sangam") {
    if (first && !isValidPanna(first)) {
      return { valid: false, value: "", message: "Open Pana valid hona chahiye." };
    }
    if (second && !/^[0-9]{1}$/.test(second)) {
      return { valid: false, value: "", message: "Close Ank 1 digit hona chahiye." };
    }
    if (!first || !second) {
      return emptySangam;
    }
    return { valid: true, value: `${first}-${second}`, message: "" };
  }

  if (first && !isValidPanna(first)) {
    return { valid: false, value: "", message: "Open Pana valid hona chahiye." };
  }
  if (second && !isValidPanna(second)) {
    return { valid: false, value: "", message: "Close Pana valid hona chahiye." };
  }
  if (!first || !second) {
    return emptySangam;
  }
  return { valid: true, value: `${first}-${second}`, message: "" };
}
