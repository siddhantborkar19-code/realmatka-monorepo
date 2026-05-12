import { applyReferralLossCommission, addWalletEntry, getUserBalance, getUsersList } from "../stores/admin-store.mjs";
import { getBidsForMarket, updateBidSettlement } from "../stores/bids-store.mjs";
import { getChartRecord, upsertChartRecord } from "../stores/market-store.mjs";
import { getPannaType } from "../matka-rules.mjs";
import { sendUserNotifications } from "./notification-events-service.mjs";

export const payoutRates = {
  "Single Digit": 10,
  "Single Digit Bulk": 10,
  "Jodi Digit": 100,
  "Jodi Digit Bulk": 100,
  "Group Jodi": 100,
  "Red Bracket": 100,
  "Digit Based Jodi": 100,
  "Single Pana": 160,
  "Single Pana Bulk": 160,
  "SP Motor": 160,
  "Double Pana": 320,
  "Double Pana Bulk": 320,
  "DP Motor": 320,
  "Triple Pana": 1000,
  "Half Sangam": 1000,
  "Full Sangam": 10000,
  "SP DP TP": 320,
  "Odd Even": 10
};

export { getMarketDayKey };

function roundAmount(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function formatResultNotificationBody(result) {
  const parts = String(result ?? "")
    .trim()
    .split("-")
    .map((part) => String(part).replace(/\*/g, "").trim())
    .filter(Boolean);

  return parts.join("-") || String(result ?? "").trim() || "---";
}

function formatResultNotificationTitle(name) {
  return String(name ?? "").trim().toUpperCase() || "MARKET";
}

const MARKET_DAY_ROLLOVER_MINUTES = 30;

function getIndiaDateParts(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });
  return Object.fromEntries(formatter.formatToParts(new Date(date)).map((part) => [part.type, part.value]));
}

function getIndiaDateWithRollover(date = new Date()) {
  const parts = getIndiaDateParts(date);
  const result = new Date(
    Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second)
    )
  );
  const currentMinutes = result.getUTCHours() * 60 + result.getUTCMinutes();
  if (currentMinutes < MARKET_DAY_ROLLOVER_MINUTES) {
    result.setUTCDate(result.getUTCDate() - 1);
  }
  result.setUTCHours(0, 0, 0, 0);
  return result;
}

function getMarketDayKey(date = new Date()) {
  const normalized = getIndiaDateWithRollover(date);
  const year = normalized.getUTCFullYear();
  const month = String(normalized.getUTCMonth() + 1).padStart(2, "0");
  const day = String(normalized.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getMarketSettlementAnchor(market) {
  return market?.updatedAt || market?.resultUpdatedAt || market?.publishedAt || new Date();
}

async function getMarketCycleBids(market) {
  const settlementDayKey = getMarketDayKey(getMarketSettlementAnchor(market));
  const bids = await getBidsForMarket(market.name);
  const matched = [];
  let skippedCrossDay = 0;
  for (const bid of bids) {
    const bidDayKey = String(bid.marketDay || "").trim() || getMarketDayKey(bid.createdAt);
    if (bidDayKey === settlementDayKey) matched.push(bid);
    else skippedCrossDay += 1;
  }
  return { settlementDayKey, matched, skippedCrossDay };
}

export function isPlaceholderMarketResult(result) {
  return String(result ?? "").trim() === "***-**-***";
}

export async function sendMarketResultBroadcast(market, result) {
  const users = await getUsersList();
  const targets = users.filter((user) => user.role !== "admin" && user.approvalStatus === "Approved" && !user.blockedAt && !user.deactivatedAt);
  if (!targets.length) return { attemptedUsers: 0, pushed: 0, created: 0 };

  const dispatch = await sendUserNotifications(
    targets.map((user) => ({
      userId: user.id,
      title: market.name,
      body: `Result: ${result}`,
      channel: "result",
      url: "/(tabs)",
      persist: false,
      data: { marketSlug: market.slug, marketName: market.name, result }
    }))
  );

  return { attemptedUsers: targets.length, pushed: Number(dispatch?.pushed || 0), created: Array.isArray(dispatch?.created) ? dispatch.created.length : 0 };
}

export function getBidPotentialPayout(bid) {
  const rate = getBidPayoutRate(bid);
  return roundAmount(Number(bid.points || 0) * rate);
}

function getBidPayoutRate(bid) {
  if (bid?.boardLabel === "SP DP TP") {
    const gameType = String(bid.gameType ?? "").trim().toUpperCase();
    if (gameType === "SP" || getPannaType(bid.digit) === "single") return payoutRates["Single Pana"];
    if (gameType === "DP" || getPannaType(bid.digit) === "double") return payoutRates["Double Pana"];
    if (gameType === "TP" || getPannaType(bid.digit) === "triple") return payoutRates["Triple Pana"];
  }
  return Number(payoutRates[bid?.boardLabel] || 0);
}

export function isValidMarketResultString(result) {
  return /^[0-9*]{3}-[0-9*]{2}-[0-9*]{3}$/.test(String(result ?? "").trim());
}

export function validateChartRows(rows, chartType) {
  if (!Array.isArray(rows) || rows.length === 0) return "At least one chart row is required";
  for (const row of rows) {
    if (!Array.isArray(row) || row.length < 2) return "Every chart row must include a label and at least one value";
    const values = row.map((cell) => String(cell ?? "").trim());
    if (!values[0]) return "Every chart row must include a week label";
    if (chartType === "jodi" && values.slice(1).some((value) => value && !/^(?:[0-9]{2,3}|[0-9]\*|\*\*|--)$/.test(value))) {
      return "Jodi chart values must be 2 digit values or bracket placeholders";
    }
    if (chartType === "panna" && values.slice(1).some((value) => value && !/^(?:[0-9]{3}|[0-9]\*\*|---|\*\*\*)$/.test(value))) {
      return "Panna chart values must be 3 digit values";
    }
  }
  return "";
}

export function parseResult(result) {
  const parts = String(result ?? "").split("-");
  const openPanna = parts[0] && /^[0-9]{3}$/.test(parts[0]) ? parts[0] : null;
  const jodi = parts[1] && /^[0-9]{2}$/.test(parts[1]) ? parts[1] : null;
  const closePanna = parts[2] && /^[0-9]{3}$/.test(parts[2]) ? parts[2] : null;
  const openAnk = parts[1] && /^[0-9]/.test(parts[1]) ? parts[1][0] : null;
  const closeAnk = parts[1] && /^[0-9*][0-9]$/.test(parts[1]) ? parts[1][1] : null;
  return { openPanna, jodi, closePanna, openAnk, closeAnk };
}

function getWeekStart(date) {
  const value = new Date(date);
  const day = value.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  value.setDate(value.getDate() + diff);
  value.setHours(0, 0, 0, 0);
  return value;
}

function getWeekEnd(date) {
  const start = getWeekStart(date);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return end;
}

function formatChartDay(date) {
  const value = new Date(date);
  const month = value.toLocaleDateString("en-US", { month: "short" });
  const day = String(value.getDate()).padStart(2, "0");
  return `${month} ${day}`;
}

function getWeekChartLabel(date) {
  const start = getWeekStart(date);
  const end = getWeekEnd(date);
  return `${start.getFullYear()} ${formatChartDay(start)} to ${formatChartDay(end)}`;
}

function parseWeekLabelStartDate(label) {
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

function normalizeWeekLabel(label) {
  const parsed = parseWeekLabelStartDate(label);
  return parsed ? getWeekChartLabel(parsed) : String(label || "").trim();
}

function isPlaceholderChartValue(value) {
  const text = String(value || "").trim();
  return !text || text === "**" || text === "***" || text === "--" || text === "---";
}

function normalizeAndMergeChartRows(rows, size, placeholderFactory) {
  const merged = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!Array.isArray(row) || row.length === 0) continue;
    const label = normalizeWeekLabel(row[0]);
    const base = merged.get(label) ?? [label, ...Array.from({ length: size }, (_, index) => placeholderFactory(index))];
    for (let index = 0; index < size; index += 1) {
      const candidate = String(row[index + 1] ?? "").trim();
      if (!isPlaceholderChartValue(candidate)) base[index + 1] = candidate;
    }
    merged.set(label, base);
  }
  return Array.from(merged.values());
}

function getWeekdayIndex(date) {
  const day = new Date(date).getDay();
  return day === 0 ? 6 : day - 1;
}

function getOrCreateChartRow(rows, label, size, placeholderFactory) {
  const normalizedLabel = normalizeWeekLabel(label);
  const nextRows = normalizeAndMergeChartRows(rows, size, placeholderFactory).map((row) => [...row]);
  let index = nextRows.findIndex((row) => String(row?.[0] ?? "").trim() === normalizedLabel);
  if (index === -1) {
    const created = [normalizedLabel];
    for (let item = 0; item < size; item += 1) created.push(placeholderFactory(item));
    nextRows.push(created);
    index = nextRows.length - 1;
  } else if (nextRows[index].length < size + 1) {
    for (let item = nextRows[index].length - 1; item < size; item += 1) nextRows[index].push(placeholderFactory(item));
  }
  return { rows: nextRows, rowIndex: index };
}

function getChartRowSortKey(label) {
  const parsed = parseWeekLabelStartDate(label);
  return parsed ? parsed.getTime() : Number.MAX_SAFE_INTEGER;
}

function sortChartRowsChronologically(rows) {
  return [...rows].sort((left, right) => getChartRowSortKey(left?.[0]) - getChartRowSortKey(right?.[0]));
}

function sumDigitString(value) {
  return String(value || "").split("").reduce((total, digit) => total + Number(digit || 0), 0);
}

export function deriveJodiRowsFromPannaRows(rows) {
  return sortChartRowsChronologically(
    (Array.isArray(rows) ? rows : []).map((row, rowIndex) => {
      const label = String(row?.[0] ?? `Week ${rowIndex + 1}`).trim();
      const nextRow = [label];
      for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
        const open = String(row?.[1 + dayIndex * 2] ?? "").trim();
        const close = String(row?.[2 + dayIndex * 2] ?? "").trim();
        if (/^[0-9]{3}$/.test(open) && /^[0-9]{3}$/.test(close)) nextRow.push(`${sumDigitString(open) % 10}${sumDigitString(close) % 10}`);
        else if (/^[0-9]{3}$/.test(open) && /^[0-9]\*\*$/.test(close)) nextRow.push(`${close[0]}*`);
        else if (open === "***" || close === "***") nextRow.push("**");
        else nextRow.push("--");
      }
      return nextRow;
    })
  );
}

export function normalizeChartRowsForSave(chartType, rows) {
  if (chartType === "panna") return sortChartRowsChronologically(normalizeAndMergeChartRows(rows, 14, () => "---"));
  return sortChartRowsChronologically(normalizeAndMergeChartRows(rows, 7, () => "--"));
}

export async function syncChartsFromMarketResult(market) {
  const parsed = parseResult(market.result);
  const effectiveDate = new Date(market.updatedAt || Date.now());
  const label = getWeekChartLabel(effectiveDate);
  const weekdayIndex = getWeekdayIndex(effectiveDate);

  const jodiChart = await getChartRecord(market.slug, "jodi");
  const jodiRows = Array.isArray(jodiChart?.rows) ? jodiChart.rows : [];
  const jodiContainer = getOrCreateChartRow(jodiRows, label, 7, () => "**");
  if (market.result === "***-**-***") jodiContainer.rows[jodiContainer.rowIndex][weekdayIndex + 1] = "**";
  else if (parsed.openAnk && !parsed.jodi && !parsed.closePanna) jodiContainer.rows[jodiContainer.rowIndex][weekdayIndex + 1] = `${parsed.openAnk}*`;
  else if (parsed.jodi) jodiContainer.rows[jodiContainer.rowIndex][weekdayIndex + 1] = parsed.jodi;
  await upsertChartRecord(market.slug, "jodi", sortChartRowsChronologically(jodiContainer.rows));

  const pannaChart = await getChartRecord(market.slug, "panna");
  const pannaRows = Array.isArray(pannaChart?.rows) ? pannaChart.rows : [];
  const pannaContainer = getOrCreateChartRow(pannaRows, label, 14, () => "***");
  const openIndex = 1 + weekdayIndex * 2;
  const closeIndex = openIndex + 1;
  if (market.result === "***-**-***") {
    pannaContainer.rows[pannaContainer.rowIndex][openIndex] = "***";
    pannaContainer.rows[pannaContainer.rowIndex][closeIndex] = "***";
  } else {
    if (parsed.openPanna) pannaContainer.rows[pannaContainer.rowIndex][openIndex] = parsed.openPanna;
    if (parsed.closePanna) pannaContainer.rows[pannaContainer.rowIndex][closeIndex] = parsed.closePanna;
    else if (parsed.openAnk && !parsed.jodi) pannaContainer.rows[pannaContainer.rowIndex][closeIndex] = "***";
  }
  await upsertChartRecord(market.slug, "panna", sortChartRowsChronologically(pannaContainer.rows));
}

export function canSettleMarketResult(result) {
  const parsed = parseResult(result);
  return Boolean(parsed.openPanna || parsed.openAnk || parsed.jodi || parsed.closeAnk || parsed.closePanna);
}

function isOpenResultFormat(result) {
  return /^[0-9]{3}-[0-9\*]{2}-\*{3}$/.test(String(result ?? "").trim());
}

function isFullResultFormat(result) {
  return /^[0-9]{3}-[0-9]{2}-[0-9]{3}$/.test(String(result ?? "").trim());
}

function canEvaluateBidAgainstMarket(bid, parsed) {
  const board = bid.boardLabel;
  const sessionType = getEffectiveSessionType(bid);
  if (["Single Digit", "Single Digit Bulk", "Odd Even"].includes(board)) return sessionType === "Open" ? Boolean(parsed.openAnk) : Boolean(parsed.closeAnk);
  if (["Single Pana", "Single Pana Bulk", "SP Motor", "Double Pana", "Double Pana Bulk", "DP Motor", "Triple Pana"].includes(board)) return sessionType === "Open" ? Boolean(parsed.openPanna) : Boolean(parsed.closePanna);
  if (board === "SP DP TP") {
    if (sessionType === "Open") return Boolean(parsed.openPanna);
    if (sessionType === "Close") return Boolean(parsed.closePanna);
    return Boolean(parsed.openPanna);
  }
  if (["Jodi Digit", "Jodi Digit Bulk", "Group Jodi", "Red Bracket", "Digit Based Jodi"].includes(board)) return Boolean(parsed.jodi);
  if (board === "Half Sangam") return Boolean(parsed.openPanna && parsed.closeAnk);
  if (board === "Full Sangam") return Boolean(parsed.openPanna && parsed.closePanna);
  return Boolean(parsed.openPanna && parsed.jodi && parsed.closePanna);
}

function usesSession(board) {
  return !["Jodi Digit", "Jodi Digit Bulk", "Group Jodi", "Red Bracket", "Digit Based Jodi", "Half Sangam", "Full Sangam"].includes(board);
}

function getEffectiveSessionType(bid) {
  const board = bid.boardLabel;
  if (!usesSession(board)) return "NA";
  const sessionType = String(bid.sessionType || "").trim();
  if (sessionType === "Open" || sessionType === "Close") return sessionType;
  if (board === "SP DP TP") return "Open";
  return "Close";
}

function isOpenResultDependentBid(bid) {
  if (!usesSession(bid.boardLabel)) {
    return false;
  }
  return getEffectiveSessionType(bid) === "Open";
}

function isFullResultDependentBid(bid) {
  if (!usesSession(bid.boardLabel)) {
    return true;
  }
  return getEffectiveSessionType(bid) === "Close";
}

function shouldResettleForCurrentResultStage(bid, marketResult) {
  if (isOpenResultFormat(marketResult)) {
    return isOpenResultDependentBid(bid);
  }
  if (isFullResultFormat(marketResult)) {
    return isFullResultDependentBid(bid);
  }
  return false;
}

function isSingleDigitWin(board, digit, parsed, sessionType) {
  if (!["Single Digit", "Single Digit Bulk"].includes(board)) return false;
  return digit === (sessionType === "Open" ? parsed.openAnk : parsed.closeAnk);
}

function isJodiWin(board, digit, parsed) {
  if (!parsed.jodi) return false;
  if (["Jodi Digit", "Jodi Digit Bulk", "Red Bracket", "Digit Based Jodi"].includes(board)) return digit === parsed.jodi;
  if (board === "Group Jodi") {
    const [left, right] = digit.split("-");
    return left === parsed.jodi || right === parsed.jodi;
  }
  return false;
}

function isPanaWin(board, digit, parsed, sessionType) {
  const panel = sessionType === "Open" ? parsed.openPanna : parsed.closePanna;
  if (!panel) return false;
  if (["Single Pana", "Single Pana Bulk", "SP Motor"].includes(board)) return panel === digit && getPannaType(digit) === "single";
  if (["Double Pana", "Double Pana Bulk", "DP Motor"].includes(board)) return panel === digit && getPannaType(digit) === "double";
  if (board === "Triple Pana") return panel === digit && getPannaType(digit) === "triple";
  return false;
}

function isSpDpTpWin(board, gameType, digit, parsed, sessionType) {
  if (board !== "SP DP TP") return false;
  const expectedType = gameType === "SP" ? "single" : gameType === "DP" ? "double" : gameType === "TP" ? "triple" : getPannaType(digit);
  const panel = sessionType === "Close" ? parsed.closePanna : parsed.openPanna;
  return Boolean(panel === digit && getPannaType(panel ?? "") === expectedType);
}

function isOddEvenWin(board, digit, parsed, sessionType) {
  if (board !== "Odd Even") return false;
  const openKind = parsed.openAnk ? (Number(parsed.openAnk) % 2 === 0 ? "Even" : "Odd") : null;
  const closeKind = parsed.closeAnk ? (Number(parsed.closeAnk) % 2 === 0 ? "Even" : "Odd") : null;
  if (openKind && closeKind && digit === `${openKind}-${closeKind}`) return true;
  return digit === (sessionType === "Open" ? openKind : closeKind);
}

function isPanelGroupWin() {
  return false;
}

function isSangamWin(board, digit, parsed) {
  if (board === "Half Sangam") {
    const [first, second] = digit.split("-");
    return Boolean(first && second && first === parsed.openPanna && second === parsed.closeAnk);
  }
  if (board === "Full Sangam") {
    const [openPanel, closePanel] = digit.split("-");
    return Boolean(openPanel && closePanel && openPanel === parsed.openPanna && closePanel === parsed.closePanna);
  }
  return false;
}

export function evaluateBidAgainstMarket(bid, market) {
  const parsed = parseResult(market.result);
  const digit = String(bid.digit ?? "").trim();
  const board = bid.boardLabel;
  const gameType = String(bid.gameType ?? bid.boardLabel ?? "").trim();
  const sessionType = getEffectiveSessionType(bid);
  if (!canEvaluateBidAgainstMarket(bid, parsed)) return null;

  const isWin =
    isSingleDigitWin(board, digit, parsed, sessionType) ||
    isJodiWin(board, digit, parsed) ||
    isPanaWin(board, digit, parsed, sessionType) ||
    isSpDpTpWin(board, gameType, digit, parsed, sessionType) ||
    isOddEvenWin(board, digit, parsed, sessionType) ||
    isPanelGroupWin(board, digit, parsed) ||
    isSangamWin(board, digit, parsed, sessionType);

  return { status: isWin ? "Won" : "Lost", payout: isWin ? getBidPotentialPayout(bid) : 0 };
}

export async function settlePendingBidsForMarket(market) {
  if (!canSettleMarketResult(market.result)) {
    return { processed: 0, won: 0, lost: 0, wins: 0, losses: 0, skipped: 0, totalPayout: 0, settlementDayKey: null, skippedCrossDay: 0 };
  }

  const cycle = await getMarketCycleBids(market);
  const bids = cycle.matched.filter((bid) => bid.status === "Pending");
  let processed = 0;
  let won = 0;
  let lost = 0;
  let skipped = 0;
  let totalPayout = 0;
  const impactedUsers = new Map();

  for (const bid of bids) {
    if (!getBidPayoutRate(bid)) {
      skipped += 1;
      continue;
    }
    const outcome = evaluateBidAgainstMarket(bid, market);
    if (!outcome) {
      skipped += 1;
      continue;
    }
    const updated = await updateBidSettlement(bid.id, outcome.status, outcome.payout, market.result);
    if (!updated) {
      skipped += 1;
      continue;
    }
    processed += 1;
    const notificationState = impactedUsers.get(updated.userId) || { userId: updated.userId, wins: 0, losses: 0, payout: 0 };

      if (outcome.status === "Won" && outcome.payout > 0) {
        const beforeBalance = await getUserBalance(updated.userId);
        await addWalletEntry({
          userId: updated.userId,
          type: "BID_WIN",
          status: "SUCCESS",
          amount: outcome.payout,
          beforeBalance,
          afterBalance: beforeBalance + outcome.payout,
          note: `${market.name} result ${market.result}`
        });
        won += 1;
        totalPayout += outcome.payout;
        notificationState.wins += 1;
        notificationState.payout += outcome.payout;
    } else {
      await applyReferralLossCommission({ userId: updated.userId, lostAmount: updated.points, bidId: updated.id, market: updated.market, boardLabel: updated.boardLabel });
      lost += 1;
      notificationState.losses += 1;
    }

    impactedUsers.set(updated.userId, notificationState);
  }

  const notificationEntries = [...impactedUsers.values()].map((entry) => ({
    userId: entry.userId,
    title: formatResultNotificationTitle(market.name),
    body: formatResultNotificationBody(market.result),
    channel: "result",
    url: `/charts/${market.slug}`,
    data: { marketSlug: market.slug, marketName: market.name, result: market.result }
  }));

  if (notificationEntries.length) await sendUserNotifications(notificationEntries);
  return { processed, won, lost, wins: won, losses: lost, skipped, totalPayout: roundAmount(totalPayout), settlementDayKey: cycle.settlementDayKey, skippedCrossDay: cycle.skippedCrossDay };
}

export async function resettleMarket(market) {
  const cycle = await getMarketCycleBids(market);
  const settled = cycle.matched.filter((bid) => bid.status !== "Pending");
  for (const bid of settled) {
    if (bid.status === "Won" && bid.payout > 0) {
      const beforeBalance = await getUserBalance(bid.userId);
      const afterBalance = Math.max(0, beforeBalance - bid.payout);
      await addWalletEntry({
        userId: bid.userId,
        type: "BID_WIN_REVERSAL",
        status: "SUCCESS",
        amount: bid.payout,
        beforeBalance,
        afterBalance,
        note: `Previous ${bid.market} win reversed from result ${bid.settledResult || "unknown"} before resettle to ${market.result}`
      });
    }
    await updateBidSettlement(bid.id, "Pending", 0, "");
  }
  const result = await settlePendingBidsForMarket(market);
  return {
    ...result,
    settlementDayKey: result.settlementDayKey || cycle.settlementDayKey,
    skippedCrossDay: Number(result.skippedCrossDay || 0) + cycle.skippedCrossDay
  };
}

export async function resettleChangedMarket(market, previousResult) {
  const previous = String(previousResult || "").trim();
  const next = String(market.result || "").trim();
  const cycle = await getMarketCycleBids(market);
  const affectedSettled = cycle.matched.filter(
    (bid) =>
      bid.status !== "Pending" &&
      shouldResettleForCurrentResultStage(bid, next) &&
      String(bid.settledResult || "").trim() !== next
  );

  for (const bid of affectedSettled) {
    if (bid.status === "Won" && bid.payout > 0) {
      const beforeBalance = await getUserBalance(bid.userId);
      const afterBalance = Math.max(0, beforeBalance - bid.payout);
      await addWalletEntry({
        userId: bid.userId,
        type: "BID_WIN_REVERSAL",
        status: "SUCCESS",
        amount: bid.payout,
        beforeBalance,
        afterBalance,
        note: `Corrected ${bid.market} result from ${previous || "unknown"} to ${next || "unknown"}`
      });
    }
    await updateBidSettlement(bid.id, "Pending", 0, "");
  }

  const result = await settlePendingBidsForMarket(market);
  return {
    ...result,
    correctedPreviousResult: previous,
    correctedBidCount: affectedSettled.length,
    settlementDayKey: result.settlementDayKey || cycle.settlementDayKey,
    skippedCrossDay: Number(result.skippedCrossDay || 0) + cycle.skippedCrossDay
  };
}

export async function resetMarketSettlement(market) {
  const cycle = await getMarketCycleBids(market);
  const settled = cycle.matched.filter((bid) => bid.status !== "Pending");
  let reversedWins = 0;
  let reversedPayout = 0;

  for (const bid of settled) {
    if (bid.status === "Won" && bid.payout > 0) {
      const beforeBalance = await getUserBalance(bid.userId);
      const afterBalance = Math.max(0, beforeBalance - bid.payout);
      await addWalletEntry({
        userId: bid.userId,
        type: "BID_WIN_REVERSAL",
        status: "SUCCESS",
        amount: bid.payout,
        beforeBalance,
        afterBalance,
        note: `Result corrected to placeholder for ${market.name}`
      });
      reversedWins += 1;
      reversedPayout += bid.payout;
    }
    await updateBidSettlement(bid.id, "Pending", 0, "");
  }

  return {
    processed: settled.length,
    won: 0,
    lost: 0,
    wins: 0,
    losses: 0,
    skipped: 0,
    totalPayout: 0,
    reversedWins,
    reversedPayout: roundAmount(reversedPayout),
    settlementDayKey: cycle.settlementDayKey,
    skippedCrossDay: cycle.skippedCrossDay
  };
}
