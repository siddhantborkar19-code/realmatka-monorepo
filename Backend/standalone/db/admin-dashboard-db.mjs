import { __internalGetReadyPgPool, __internalGetSqlite, __internalToIso } from "../db.mjs";
import { getSupportConversationSummary } from "./chat-db.mjs";

const WALLET_BALANCE_DELTA_SQL = `CASE
  WHEN status = 'SUCCESS' AND type IN ('DEPOSIT', 'REFERRAL_COMMISSION', 'BID_WIN', 'SIGNUP_BONUS', 'FIRST_DEPOSIT_BONUS', 'ADMIN_CREDIT') THEN COALESCE(amount, 0)
  WHEN ((status = 'SUCCESS' AND type IN ('WITHDRAW', 'BID_PLACED', 'BID_WIN_REVERSAL', 'ADMIN_DEBIT'))
     OR (status = 'BACKOFFICE' AND type = 'WITHDRAW')) THEN -COALESCE(amount, 0)
  ELSE 0
END`;

function getExposureBucket(label) {
  const value = String(label || "").toLowerCase();
  if (/(pana|panna|motor|sp dp tp|sangam)/.test(value)) {
    return "panna";
  }
  if (/(digit|jodi|bracket)/.test(value)) {
    return "digit";
  }
  return "";
}

function getExposureLabel(row) {
  const boardLabel = String(row?.board_label ?? row?.boardLabel ?? row?.game_type ?? row?.gameType ?? "").trim();
  const digit = String(row?.digit ?? "").trim();
  if (boardLabel && digit) {
    return `${boardLabel} ${digit}`;
  }
  return boardLabel || digit || "Unknown";
}

function toTopExposureEntries(map) {
  return [...map.entries()]
    .map(([label, points]) => ({ label, points: Number(points || 0) }))
    .sort((left, right) => right.points - left.points || left.label.localeCompare(right.label))
    .slice(0, 3);
}

function buildMarketExposure(rows) {
  const markets = new Map();

  for (const row of rows || []) {
    const marketName = String(row?.market || "").trim();
    if (!marketName) {
      continue;
    }
    const points = Number(row?.points || 0);
    const exposure =
      markets.get(marketName) ||
      {
        market: marketName,
        totalPoints: 0,
        betsCount: 0,
        digitMap: new Map(),
        pannaMap: new Map()
      };

    exposure.totalPoints += points;
    exposure.betsCount += 1;

    const bucket = getExposureBucket(row?.board_label ?? row?.boardLabel ?? row?.game_type ?? row?.gameType);
    if (bucket) {
      const label = getExposureLabel(row);
      const targetMap = bucket === "digit" ? exposure.digitMap : exposure.pannaMap;
      targetMap.set(label, Number(targetMap.get(label) || 0) + points);
    }

    markets.set(marketName, exposure);
  }

  return [...markets.values()]
    .map((item) => ({
      market: item.market,
      totalPoints: item.totalPoints,
      betsCount: item.betsCount,
      topDigits: toTopExposureEntries(item.digitMap),
      topPannas: toTopExposureEntries(item.pannaMap)
    }))
    .sort((left, right) => right.totalPoints - left.totalPoints || right.betsCount - left.betsCount || left.market.localeCompare(right.market))
    .slice(0, 10);
}

function businessDateKeyToRangeStartIso(key, fallback) {
  const match = String(key || "").trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return fallback;
  const [, year, month, day] = match;
  const start = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), 19, 0, 0, 0));
  start.setUTCDate(start.getUTCDate() - 1);
  return start.toISOString();
}

export async function getDashboardSummaryData(startOfToday, dateKeys = []) {
  const seriesFrom = dateKeys[0] ? businessDateKeyToRangeStartIso(dateKeys[0], startOfToday) : startOfToday;
  try {
    const pool = await __internalGetReadyPgPool();
    const [
      totalsResult,
      todayWalletResult,
      todayBidsResult,
      todaySessionsResult,
      todayActiveUsersResult,
      topUsersResult,
      recentBidsResult,
      recentRequestsResult,
      collectionSeriesResult,
      payoutSeriesResult,
      activeTrendResult,
      supportSummary,
      marketsResult,
      devicesResult,
      marketExposureRowsResult
    ] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS users, COUNT(*) FILTER (WHERE approval_status = 'Approved')::int AS approved_users, COUNT(*) FILTER (WHERE approval_status = 'Pending')::int AS pending_users FROM users WHERE role = 'user'`),
      pool.query(`SELECT COALESCE(SUM(CASE WHEN type = 'DEPOSIT' AND status = ANY(ARRAY['SUCCESS', 'BACKOFFICE']) THEN amount ELSE 0 END), 0) AS deposit_amount, COUNT(*) FILTER (WHERE type = 'DEPOSIT' AND status = 'INITIATED')::int AS deposit_requests, COALESCE(SUM(CASE WHEN type = 'WITHDRAW' AND status = 'SUCCESS' THEN amount ELSE 0 END), 0) AS withdraw_amount, COUNT(*) FILTER (WHERE type = 'WITHDRAW' AND status = 'INITIATED')::int AS withdraw_requests, COALESCE(SUM(CASE WHEN type = 'SIGNUP_BONUS' AND status = 'SUCCESS' THEN amount ELSE 0 END), 0) AS signup_bonus_amount, COUNT(*) FILTER (WHERE status = 'INITIATED' AND type IN ('DEPOSIT', 'WITHDRAW'))::int AS pending_wallet_requests, COUNT(*) FILTER (WHERE status = 'INITIATED' AND type = 'DEPOSIT')::int AS pending_deposits, COUNT(*) FILTER (WHERE status = 'INITIATED' AND type = 'WITHDRAW')::int AS pending_withdraws FROM wallet_entries WHERE created_at >= $1`, [startOfToday]),
      pool.query(`SELECT COUNT(*)::int AS bets_count, COALESCE(SUM(points), 0) AS bets_amount FROM bids WHERE created_at >= $1`, [startOfToday]),
      pool.query(`SELECT COUNT(*)::int AS login_count FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.created_at >= $1 AND u.role = 'user'`, [startOfToday]),
      pool.query(`SELECT COUNT(DISTINCT user_id)::int AS active_users FROM (SELECT s.user_id FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.created_at >= $1 AND u.role = 'user' UNION SELECT b.user_id FROM bids b JOIN users u ON u.id = b.user_id WHERE b.created_at >= $1 AND u.role = 'user' UNION SELECT we.user_id FROM wallet_entries we JOIN users u ON u.id = we.user_id WHERE we.created_at >= $1 AND u.role = 'user') active_users`, [startOfToday]),
      pool.query(`SELECT u.id, u.name, u.phone, COALESCE(balance.balance, 0) AS balance FROM users u LEFT JOIN LATERAL (SELECT COALESCE(SUM(${WALLET_BALANCE_DELTA_SQL}), 0) AS balance FROM wallet_entries WHERE user_id = u.id) balance ON TRUE WHERE u.approval_status = 'Approved' AND u.role = 'user' ORDER BY u.joined_at DESC, u.id DESC LIMIT 5`),
      pool.query(`SELECT b.id, b.market, b.board_label, b.digit, b.points, b.status, b.created_at, u.name AS user_name, u.phone AS user_phone FROM bids b LEFT JOIN users u ON u.id = b.user_id ORDER BY b.created_at DESC, b.id DESC LIMIT 8`),
      pool.query(`SELECT we.id, we.type, we.amount, we.created_at, u.name AS user_name, u.phone AS user_phone FROM wallet_entries we LEFT JOIN users u ON u.id = we.user_id WHERE we.status = 'INITIATED' AND we.type IN ('DEPOSIT', 'WITHDRAW') ORDER BY we.created_at DESC, we.id DESC LIMIT 8`),
      pool.query(`SELECT to_char((created_at AT TIME ZONE 'UTC') + interval '5 hours', 'YYYY-MM-DD') AS date, COALESCE(SUM(points), 0) AS collection FROM bids WHERE created_at >= $1 GROUP BY 1`, [seriesFrom]),
      pool.query(`SELECT to_char((created_at AT TIME ZONE 'UTC') + interval '5 hours', 'YYYY-MM-DD') AS date, COALESCE(SUM(amount), 0) AS payout FROM wallet_entries WHERE created_at >= $1 AND type = 'BID_WIN' AND status = ANY(ARRAY['SUCCESS', 'BACKOFFICE']) GROUP BY 1`, [seriesFrom]),
      pool.query(`SELECT date, COUNT(DISTINCT user_id)::int AS users FROM (SELECT to_char((s.created_at AT TIME ZONE 'UTC') + interval '5 hours', 'YYYY-MM-DD') AS date, s.user_id FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.created_at >= $1 AND u.role = 'user' UNION SELECT to_char((b.created_at AT TIME ZONE 'UTC') + interval '5 hours', 'YYYY-MM-DD') AS date, b.user_id FROM bids b JOIN users u ON u.id = b.user_id WHERE b.created_at >= $1 AND u.role = 'user' UNION SELECT to_char((we.created_at AT TIME ZONE 'UTC') + interval '5 hours', 'YYYY-MM-DD') AS date, we.user_id FROM wallet_entries we JOIN users u ON u.id = we.user_id WHERE we.created_at >= $1 AND u.role = 'user') activity GROUP BY date`, [seriesFrom]),
      getSupportConversationSummary(),
      pool.query(`SELECT COUNT(*)::int AS markets, COUNT(*) FILTER (WHERE LOWER(action) NOT LIKE '%closed%')::int AS live_markets, COUNT(*) FILTER (WHERE result = '***-**-***')::int AS placeholder_results FROM markets`),
      pool.query(`SELECT COUNT(*)::int AS device_registrations FROM notification_devices`),
      pool.query(`SELECT market, game_type, board_label, digit, points FROM bids WHERE created_at >= $1`, [startOfToday])
    ]);
    const collectionMap = new Map(collectionSeriesResult.rows.map((row) => [row.date, Number(row.collection ?? 0)]));
    const payoutMap = new Map(payoutSeriesResult.rows.map((row) => [row.date, Number(row.payout ?? 0)]));
    const activeMap = new Map(activeTrendResult.rows.map((row) => [row.date, Number(row.users ?? 0)]));
    const totals = totalsResult.rows[0] ?? {};
    const todayWallet = todayWalletResult.rows[0] ?? {};
    const todayBids = todayBidsResult.rows[0] ?? {};
    const todaySessions = todaySessionsResult.rows[0] ?? {};
    const todayActiveUsers = todayActiveUsersResult.rows[0] ?? {};
    const markets = marketsResult.rows[0] ?? {};
    const devices = devicesResult.rows[0] ?? {};
    return {
      totals: {
        users: Number(totals.users ?? 0),
        approvedUsers: Number(totals.approved_users ?? 0),
        pendingUsers: Number(totals.pending_users ?? 0),
        pendingWalletRequests: Number(todayWallet.pending_wallet_requests ?? 0),
        markets: Number(markets.markets ?? 0),
        liveMarkets: Number(markets.live_markets ?? 0),
        deviceRegistrations: Number(devices.device_registrations ?? 0),
        supportConversations: Number(supportSummary.conversationsCount ?? 0)
      },
      today: {
        depositAmount: Number(todayWallet.deposit_amount ?? 0),
        depositRequests: Number(todayWallet.deposit_requests ?? 0),
        withdrawAmount: Number(todayWallet.withdraw_amount ?? 0),
        withdrawRequests: Number(todayWallet.withdraw_requests ?? 0),
        signupBonusAmount: Number(todayWallet.signup_bonus_amount ?? 0),
        betsCount: Number(todayBids.bets_count ?? 0),
        betsAmount: Number(todayBids.bets_amount ?? 0),
        loginCount: Number(todaySessions.login_count ?? 0),
        activeUsers: Number(todayActiveUsers.active_users ?? 0)
      },
      trends: {
        collectionVsPayout: dateKeys.map((date) => ({ date, collection: collectionMap.get(date) ?? 0, payout: payoutMap.get(date) ?? 0 })),
        activeUsersTrend: dateKeys.map((date) => ({ date, users: activeMap.get(date) ?? 0 }))
      },
      pendingWork: {
        userApprovals: Number(totals.pending_users ?? 0),
        walletApprovals: Number(todayWallet.pending_wallet_requests ?? 0),
        pendingDeposits: Number(todayWallet.pending_deposits ?? 0),
        pendingWithdraws: Number(todayWallet.pending_withdraws ?? 0),
        supportUnread: Number(supportSummary.unreadForAdmin ?? 0)
      },
      marketExposure: buildMarketExposure(marketExposureRowsResult.rows),
      topUsers: topUsersResult.rows.map((row) => ({ id: row.id, name: row.name, phone: row.phone, balance: Number(row.balance ?? 0) })),
      recentBids: recentBidsResult.rows.map((row) => ({ id: row.id, market: row.market, boardLabel: row.board_label, digit: row.digit, points: Number(row.points ?? 0), status: row.status, createdAt: __internalToIso(row.created_at), userName: row.user_name ?? "Unknown", userPhone: row.user_phone ?? "" })),
      recentRequests: recentRequestsResult.rows.map((row) => ({ id: row.id, type: row.type, amount: Number(row.amount ?? 0), createdAt: __internalToIso(row.created_at), userName: row.user_name ?? "Unknown", userPhone: row.user_phone ?? "" })),
      placeholderResults: Number(markets.placeholder_results ?? 0)
    };
  } catch {
    const sqlite = __internalGetSqlite();
    const totals = sqlite.prepare(`SELECT COUNT(*) AS users, SUM(CASE WHEN approval_status = 'Approved' THEN 1 ELSE 0 END) AS approved_users, SUM(CASE WHEN approval_status = 'Pending' THEN 1 ELSE 0 END) AS pending_users FROM users WHERE role = 'user'`).get();
    const todayWallet = sqlite.prepare(`SELECT COALESCE(SUM(CASE WHEN type = 'DEPOSIT' AND status IN ('SUCCESS', 'BACKOFFICE') THEN amount ELSE 0 END), 0) AS deposit_amount, SUM(CASE WHEN type = 'DEPOSIT' AND status = 'INITIATED' THEN 1 ELSE 0 END) AS deposit_requests, COALESCE(SUM(CASE WHEN type = 'WITHDRAW' AND status = 'SUCCESS' THEN amount ELSE 0 END), 0) AS withdraw_amount, SUM(CASE WHEN type = 'WITHDRAW' AND status = 'INITIATED' THEN 1 ELSE 0 END) AS withdraw_requests, COALESCE(SUM(CASE WHEN type = 'SIGNUP_BONUS' AND status = 'SUCCESS' THEN amount ELSE 0 END), 0) AS signup_bonus_amount, SUM(CASE WHEN status = 'INITIATED' AND type IN ('DEPOSIT', 'WITHDRAW') THEN 1 ELSE 0 END) AS pending_wallet_requests, SUM(CASE WHEN status = 'INITIATED' AND type = 'DEPOSIT' THEN 1 ELSE 0 END) AS pending_deposits, SUM(CASE WHEN status = 'INITIATED' AND type = 'WITHDRAW' THEN 1 ELSE 0 END) AS pending_withdraws FROM wallet_entries WHERE created_at >= ?`).get(startOfToday);
    const todayBids = sqlite.prepare(`SELECT COUNT(*) AS bets_count, COALESCE(SUM(points), 0) AS bets_amount FROM bids WHERE created_at >= ?`).get(startOfToday);
    const todaySessions = sqlite.prepare(`SELECT COUNT(*) AS login_count FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.created_at >= ? AND u.role = 'user'`).get(startOfToday);
    const todayActiveUsers = sqlite.prepare(`SELECT COUNT(DISTINCT user_id) AS active_users FROM (SELECT s.user_id FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.created_at >= ? AND u.role = 'user' UNION SELECT b.user_id FROM bids b JOIN users u ON u.id = b.user_id WHERE b.created_at >= ? AND u.role = 'user' UNION SELECT we.user_id FROM wallet_entries we JOIN users u ON u.id = we.user_id WHERE we.created_at >= ? AND u.role = 'user') active_users`).get(startOfToday, startOfToday, startOfToday);
    const markets = sqlite.prepare(`SELECT COUNT(*) AS markets, SUM(CASE WHEN LOWER(action) NOT LIKE '%closed%' THEN 1 ELSE 0 END) AS live_markets, SUM(CASE WHEN result = '***-**-***' THEN 1 ELSE 0 END) AS placeholder_results FROM markets`).get();
    const devices = sqlite.prepare(`SELECT COUNT(*) AS device_registrations FROM notification_devices`).get();
    const topUsers = sqlite.prepare(`SELECT u.id, u.name, u.phone, COALESCE((SELECT SUM(${WALLET_BALANCE_DELTA_SQL.replaceAll("status", "we.status").replaceAll("type", "we.type").replaceAll("amount", "we.amount")}) FROM wallet_entries we WHERE we.user_id = u.id), 0) AS balance FROM users u WHERE u.approval_status = 'Approved' AND u.role = 'user' ORDER BY u.joined_at DESC, u.id DESC LIMIT 5`).all();
    const recentBids = sqlite.prepare(`SELECT b.id, b.market, b.board_label, b.digit, b.points, b.status, b.created_at, u.name AS user_name, u.phone AS user_phone FROM bids b LEFT JOIN users u ON u.id = b.user_id ORDER BY b.created_at DESC, b.id DESC LIMIT 8`).all();
    const recentRequests = sqlite.prepare(`SELECT we.id, we.type, we.amount, we.created_at, u.name AS user_name, u.phone AS user_phone FROM wallet_entries we LEFT JOIN users u ON u.id = we.user_id WHERE we.status = 'INITIATED' AND we.type IN ('DEPOSIT', 'WITHDRAW') ORDER BY we.created_at DESC, we.id DESC LIMIT 8`).all();
    const collectionSeries = sqlite.prepare(`SELECT strftime('%Y-%m-%d', datetime(created_at, '+5 hours')) AS date, COALESCE(SUM(points), 0) AS collection FROM bids WHERE created_at >= ? GROUP BY strftime('%Y-%m-%d', datetime(created_at, '+5 hours'))`).all(seriesFrom);
    const payoutSeries = sqlite.prepare(`SELECT strftime('%Y-%m-%d', datetime(created_at, '+5 hours')) AS date, COALESCE(SUM(amount), 0) AS payout FROM wallet_entries WHERE created_at >= ? AND type = 'BID_WIN' AND status IN ('SUCCESS', 'BACKOFFICE') GROUP BY strftime('%Y-%m-%d', datetime(created_at, '+5 hours'))`).all(seriesFrom);
    const activeTrend = sqlite.prepare(`SELECT date, COUNT(DISTINCT user_id) AS users FROM (SELECT strftime('%Y-%m-%d', datetime(s.created_at, '+5 hours')) AS date, s.user_id FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.created_at >= ? AND u.role = 'user' UNION SELECT strftime('%Y-%m-%d', datetime(b.created_at, '+5 hours')) AS date, b.user_id FROM bids b JOIN users u ON u.id = b.user_id WHERE b.created_at >= ? AND u.role = 'user' UNION SELECT strftime('%Y-%m-%d', datetime(we.created_at, '+5 hours')) AS date, we.user_id FROM wallet_entries we JOIN users u ON u.id = we.user_id WHERE we.created_at >= ? AND u.role = 'user') activity GROUP BY date`).all(seriesFrom, seriesFrom, seriesFrom);
    const marketExposureRows = sqlite.prepare(`SELECT market, game_type, board_label, digit, points FROM bids WHERE created_at >= ?`).all(startOfToday);
    const supportSummary = await getSupportConversationSummary();
    const collectionMap = new Map(collectionSeries.map((row) => [row.date, Number(row.collection ?? 0)]));
    const payoutMap = new Map(payoutSeries.map((row) => [row.date, Number(row.payout ?? 0)]));
    const activeMap = new Map(activeTrend.map((row) => [row.date, Number(row.users ?? 0)]));
    return {
      totals: {
        users: Number(totals?.users ?? 0),
        approvedUsers: Number(totals?.approved_users ?? 0),
        pendingUsers: Number(totals?.pending_users ?? 0),
        pendingWalletRequests: Number(todayWallet?.pending_wallet_requests ?? 0),
        markets: Number(markets?.markets ?? 0),
        liveMarkets: Number(markets?.live_markets ?? 0),
        deviceRegistrations: Number(devices?.device_registrations ?? 0),
        supportConversations: Number(supportSummary.conversationsCount ?? 0)
      },
      today: {
        depositAmount: Number(todayWallet?.deposit_amount ?? 0),
        depositRequests: Number(todayWallet?.deposit_requests ?? 0),
        withdrawAmount: Number(todayWallet?.withdraw_amount ?? 0),
        withdrawRequests: Number(todayWallet?.withdraw_requests ?? 0),
        signupBonusAmount: Number(todayWallet?.signup_bonus_amount ?? 0),
        betsCount: Number(todayBids?.bets_count ?? 0),
        betsAmount: Number(todayBids?.bets_amount ?? 0),
        loginCount: Number(todaySessions?.login_count ?? 0),
        activeUsers: Number(todayActiveUsers?.active_users ?? 0)
      },
      trends: {
        collectionVsPayout: dateKeys.map((date) => ({ date, collection: collectionMap.get(date) ?? 0, payout: payoutMap.get(date) ?? 0 })),
        activeUsersTrend: dateKeys.map((date) => ({ date, users: activeMap.get(date) ?? 0 }))
      },
      pendingWork: {
        userApprovals: Number(totals?.pending_users ?? 0),
        walletApprovals: Number(todayWallet?.pending_wallet_requests ?? 0),
        pendingDeposits: Number(todayWallet?.pending_deposits ?? 0),
        pendingWithdraws: Number(todayWallet?.pending_withdraws ?? 0),
        supportUnread: Number(supportSummary.unreadForAdmin ?? 0)
      },
      marketExposure: buildMarketExposure(marketExposureRows),
      topUsers: topUsers.map((row) => ({ id: row.id, name: row.name, phone: row.phone, balance: Number(row.balance ?? 0) })),
      recentBids: recentBids.map((row) => ({ id: row.id, market: row.market, boardLabel: row.board_label, digit: row.digit, points: Number(row.points ?? 0), status: row.status, createdAt: __internalToIso(row.created_at), userName: row.user_name ?? "Unknown", userPhone: row.user_phone ?? "" })),
      recentRequests: recentRequests.map((row) => ({ id: row.id, type: row.type, amount: Number(row.amount ?? 0), createdAt: __internalToIso(row.created_at), userName: row.user_name ?? "Unknown", userPhone: row.user_phone ?? "" })),
      placeholderResults: Number(markets?.placeholder_results ?? 0)
    };
  }
}
