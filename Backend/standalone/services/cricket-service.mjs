import { getUserBalance } from "../db.mjs";
import { addWalletEntry } from "../stores/wallet-store.mjs";
import {
  addCricketBet,
  findCricketMatch,
  listAllCricketBets,
  listCricketMarketResults,
  listCricketBetsForMatch,
  listCricketBetsForUser,
  listCricketMatches,
  saveCricketMarketResult,
  updateCricketBetSettlement,
  upsertCricketMatch
} from "../db/cricket-db.mjs";

const MARKET_TYPES = new Set(["toss_winner", "match_winner", "first_over_runs", "first_2_over_runs", "first_3_over_runs"]);
const MIN_CRICKET_BET_AMOUNT = 10;
const MAX_CRICKET_BET_AMOUNT = 2000;

const CRICKET_RATES = {
  toss_winner: { team_a: 1.8, team_b: 1.8 },
  match_winner: { team_a: 1.8, team_b: 1.8 },
  first_over_runs: { "0_5": 2.4, "6_10": 2.2, "11_15": 3, "16_plus": 4 },
  first_2_over_runs: { "0_10": 2.5, "11_18": 2.1, "19_26": 2.8, "27_plus": 4 },
  first_3_over_runs: { "0_15": 2.6, "16_27": 2, "28_39": 2.8, "40_plus": 4 }
};

export function getCricketRates() {
  return CRICKET_RATES;
}

function normalizeMarketType(value) {
  const normalized = String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (normalized === "toss" || normalized === "toss_winner") return "toss_winner";
  if (normalized === "match" || normalized === "winner" || normalized === "match_winner") return "match_winner";
  if (normalized === "first_over" || normalized === "first_over_runs") return "first_over_runs";
  if (normalized === "first_2_over" || normalized === "first_2_over_runs") return "first_2_over_runs";
  if (normalized === "first_3_over" || normalized === "first_3_over_runs") return "first_3_over_runs";
  return "";
}

function normalizeSelection(value, marketType = "") {
  const normalized = String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (normalized === "team_a" || normalized === "a") return "team_a";
  if (normalized === "team_b" || normalized === "b") return "team_b";
  if (normalized === "cancel" || normalized === "refund" || normalized === "no_result") return "cancel";
  const marketRates = CRICKET_RATES[marketType] || {};
  if (Object.prototype.hasOwnProperty.call(marketRates, normalized)) return normalized;
  return "";
}

function getSelectionLabel(match, selection) {
  if (selection === "team_a") return match.teamA;
  if (selection === "team_b") return match.teamB;
  if (selection === "cancel") return "Cancelled / Refund";
  return String(selection || "").replace(/_/g, "-").replace("-plus", "+");
}

function getMarketLabel(marketType) {
  if (marketType === "toss_winner") return "Toss Winner";
  if (marketType === "match_winner") return "Match Winner";
  if (marketType === "first_over_runs") return "First Over Runs";
  if (marketType === "first_2_over_runs") return "First 2 Overs Runs";
  if (marketType === "first_3_over_runs") return "First 3 Overs Runs";
  return marketType;
}

function getRate(marketType, selection) {
  return Number(CRICKET_RATES[marketType]?.[selection] || 0);
}

function isAfterClose(closeAt) {
  if (!closeAt) return false;
  const closeTime = new Date(closeAt).getTime();
  if (Number.isNaN(closeTime)) return false;
  return Date.now() >= closeTime;
}

function getMarketOpenState(match, marketType) {
  if (String(match.status || "").toLowerCase() !== "live") {
    return { open: false, reason: "Cricket match is closed" };
  }
  const result = match.marketResults?.[marketType]?.winner;
  if (result) return { open: false, reason: "Result already published" };
  if (marketType === "toss_winner") {
    if (match.tossWinner) return { open: false, reason: "Toss result already published" };
    if (!match.tossBettingOpen) return { open: false, reason: "Toss betting is closed" };
    if (isAfterClose(match.tossCloseAt)) return { open: false, reason: "Toss betting time is over" };
    return { open: true, reason: "" };
  }
  if (marketType !== "match_winner" && !match.matchBettingOpen) return { open: false, reason: "Cricket betting is closed" };
  if (marketType !== "match_winner" && isAfterClose(match.matchCloseAt || match.startAt)) return { open: false, reason: "Cricket betting time is over" };
  if (match.matchWinner) return { open: false, reason: "Match result already published" };
  if (!match.matchBettingOpen) return { open: false, reason: "Match winner betting is closed" };
  if (isAfterClose(match.matchCloseAt)) return { open: false, reason: "Match winner betting time is over" };
  return { open: true, reason: "" };
}

function decorateMatch(match, resultMap = new Map()) {
  if (!match) return null;
  const marketResults = Object.fromEntries((resultMap.get(match.id) || []).map((item) => [item.marketType, item]));
  const enrichedMatch = { ...match, marketResults };
  const marketCloseAt = match.matchCloseAt || match.startAt;
  const marketTypes = Array.from(MARKET_TYPES);
  const markets = {};
  for (const marketType of marketTypes) {
    markets[marketType] = {
      label: getMarketLabel(marketType),
      rates: CRICKET_RATES[marketType],
      open: getMarketOpenState(enrichedMatch, marketType).open,
      closeAt: marketType === "toss_winner" ? match.tossCloseAt : marketCloseAt,
      winner: marketResults[marketType]?.winner || (marketType === "toss_winner" ? match.tossWinner : marketType === "match_winner" ? match.matchWinner : null)
    };
  }
  return {
    ...enrichedMatch,
    markets
  };
}

export async function getCricketMatches({ admin = false } = {}) {
  const matches = await listCricketMatches({ admin });
  const resultRows = await listCricketMarketResults(matches.map((match) => match.id));
  const resultMap = new Map();
  for (const row of resultRows) {
    const list = resultMap.get(row.matchId) || [];
    list.push(row);
    resultMap.set(row.matchId, list);
  }
  return {
    rates: CRICKET_RATES,
    matches: matches.map((match) => decorateMatch(match, resultMap))
  };
}

function defaultCloseTimes(startAt) {
  const start = new Date(String(startAt || ""));
  if (Number.isNaN(start.getTime())) {
    return { tossCloseAt: null, matchCloseAt: null };
  }
  return {
    tossCloseAt: new Date(start.getTime() - 35 * 60 * 1000).toISOString(),
    matchCloseAt: start.toISOString()
  };
}

export async function saveAdminCricketMatch(body) {
  try {
    const defaults = defaultCloseTimes(body.startAt);
    const match = await upsertCricketMatch({
      id: body.id,
      title: body.title,
      teamA: body.teamA,
      teamB: body.teamB,
      status: body.status || "Live",
      startAt: body.startAt,
      tossBettingOpen: body.tossBettingOpen,
      matchBettingOpen: body.matchBettingOpen,
      tossCloseAt: body.tossCloseAt || defaults.tossCloseAt,
      matchCloseAt: body.matchCloseAt || defaults.matchCloseAt
    });
    return { ok: true, data: decorateMatch(match) };
  } catch (error) {
    return { ok: false, status: 400, error: error?.message || "Unable to save cricket match" };
  }
}

export async function placeCricketBet(user, body) {
  const matchId = String(body.matchId || "").trim();
  const marketType = normalizeMarketType(body.marketType || body.betType);
  const selection = normalizeSelection(body.selection, marketType);
  const amount = Number(body.amount || 0);
  if (!matchId || !marketType || !selection || selection === "cancel") {
    return { ok: false, status: 400, error: "Match, market, and team selection are required" };
  }
  if (!MARKET_TYPES.has(marketType)) {
    return { ok: false, status: 400, error: "Invalid cricket market" };
  }
  if (!Number.isFinite(amount) || amount < MIN_CRICKET_BET_AMOUNT || amount > MAX_CRICKET_BET_AMOUNT) {
    return { ok: false, status: 400, error: `Cricket bet amount Rs ${MIN_CRICKET_BET_AMOUNT} se Rs ${MAX_CRICKET_BET_AMOUNT} ke beech hona chahiye` };
  }

  const match = await findCricketMatch(matchId);
  if (!match) return { ok: false, status: 404, error: "Cricket match not found" };

  const resultRows = await listCricketMarketResults([match.id]);
  const marketResults = Object.fromEntries(resultRows.map((item) => [item.marketType, item]));
  const openState = getMarketOpenState({ ...match, marketResults }, marketType);
  if (!openState.open) {
    return { ok: false, status: 400, error: openState.reason || "Cricket betting is closed" };
  }

  const rate = getRate(marketType, selection);
  if (!rate) {
    return { ok: false, status: 400, error: "Invalid cricket selection" };
  }
  const beforeBalance = await getUserBalance(user.id);
  if (amount > beforeBalance) {
    return { ok: false, status: 400, error: "Insufficient balance" };
  }

  const bet = await addCricketBet({ userId: user.id, match, marketType, selection, amount, rate });
  await addWalletEntry({
    userId: user.id,
    type: "BID_PLACED",
    status: "SUCCESS",
    amount,
    beforeBalance,
    afterBalance: beforeBalance - amount,
    referenceId: `cricket-bet:${bet.id}`,
    note: `Cricket bet placed: ${match.title} ${getMarketLabel(marketType)} ${getSelectionLabel(match, selection)}`
  });

  return { ok: true, data: bet };
}

export async function getCricketHistory(userId, limit = 200) {
  return listCricketBetsForUser(userId, limit);
}

export async function getAdminCricketBets(matchId, limit = 500) {
  return String(matchId || "").trim() ? listCricketBetsForMatch(matchId) : listAllCricketBets(limit);
}

export async function settleAdminCricketResult(body) {
  const matchId = String(body.matchId || "").trim();
  const marketType = normalizeMarketType(body.marketType || body.betType);
  const winner = normalizeSelection(body.winner || body.selection, marketType);
  if (!matchId) return { ok: false, status: 400, error: "matchId is required" };
  if (!MARKET_TYPES.has(marketType)) return { ok: false, status: 400, error: "Valid market type is required" };
  if (!winner) return { ok: false, status: 400, error: "Winner team is required" };

  const match = await findCricketMatch(matchId);
  if (!match) return { ok: false, status: 404, error: "Cricket match not found" };

  const pendingBets = (await listCricketBetsForMatch(matchId)).filter((bet) => bet.status === "Pending" && bet.marketType === marketType);
  const resultLabel = `${getMarketLabel(marketType)}: ${getSelectionLabel(match, winner)}`;
  let won = 0;
  let lost = 0;
  let refunded = 0;
  let totalPayout = 0;

  for (const bet of pendingBets) {
    const isRefund = winner === "cancel";
    const isWin = !isRefund && bet.selection === winner;
    const payout = isRefund ? Number(bet.amount || 0) : isWin ? Math.round(Number(bet.amount) * Number(bet.rate) * 100) / 100 : 0;
    const status = isRefund ? "Refunded" : isWin ? "Won" : "Lost";
    const updated = await updateCricketBetSettlement(bet.id, status, payout, resultLabel);
    if (payout > 0) {
      const beforeBalance = await getUserBalance(updated.userId);
      await addWalletEntry({
        userId: updated.userId,
        type: isRefund ? "BID_REFUND" : "BID_WIN",
        status: "SUCCESS",
        amount: payout,
        beforeBalance,
        afterBalance: beforeBalance + payout,
        referenceId: `${isRefund ? "cricket-refund" : "cricket-win"}:${updated.id}`,
        note: `${isRefund ? "Cricket refund" : "Cricket win"}: ${match.title} ${getMarketLabel(marketType)}`
      });
      totalPayout += payout;
    }
    if (isRefund) refunded += 1;
    else if (isWin) won += 1;
    else lost += 1;
  }

  const savedMatch = await saveCricketMarketResult(matchId, marketType, winner);
  return {
    ok: true,
    data: {
      match: decorateMatch(savedMatch),
      settlement: { processed: pendingBets.length, won, lost, refunded, totalPayout }
    }
  };
}
