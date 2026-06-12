import { getBidsForMarket } from "../stores/bids-store.mjs";
import { getAdminSnapshot, getAppSettings, findUserById, upsertAppSetting } from "../stores/admin-store.mjs";
import { findMarketBySlug, getChartRecord, updateMarketRecord, upsertChartRecord } from "../stores/market-store.mjs";
import { logger } from "../ops/logger.mjs";

const MARKET_MANUAL_CLOSE_DAY_SETTING_PREFIX = "market_manual_close_day_india:";
const MARKET_MANUAL_CLOSE_SOURCE_SETTING_PREFIX = "market_manual_close_source:";

function getIndiaDateKey() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());

  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${lookup.year}-${lookup.month}-${lookup.day}`;
}

function getMarketManualCloseSettingKey(slug) {
  return `${MARKET_MANUAL_CLOSE_DAY_SETTING_PREFIX}${String(slug || "").trim()}`;
}

function getMarketManualCloseSourceSettingKey(slug) {
  return `${MARKET_MANUAL_CLOSE_SOURCE_SETTING_PREFIX}${String(slug || "").trim()}`;
}

export async function updateChartData({ slug, chartType, rows }, deps) {
  const normalizedRows = deps.normalizeChartRowsForSave(
    chartType,
    rows.map((row) => (Array.isArray(row) ? row.map((cell) => String(cell ?? "")) : []))
  );
  const validationError = deps.validateChartRows(normalizedRows, chartType);
  if (validationError) return { ok: false, status: 400, error: validationError };

  const previousChart = await getChartRecord(slug, chartType);
  const previousRows = Array.isArray(previousChart?.rows) ? previousChart.rows : [];
  const updated = await upsertChartRecord(slug, chartType, normalizedRows);
  if (!updated) return { ok: false, status: 400, error: "Unable to update chart" };

  if (chartType === "panna") {
    await upsertChartRecord(slug, "jodi", deps.deriveJodiRowsFromPannaRows(normalizedRows));
  }

  return {
    ok: true,
    updated,
    auditDetails: {
      rowCount: normalizedRows.length,
      previousRowCount: previousRows.length,
      previousRows,
      rows: normalizedRows
    }
  };
}

export async function updateMarketData(payload, deps) {
  const { slug, result, status, action, open, close, category, availabilityMode = "manual" } = payload;
  if (!deps.isValidMarketResultString(result)) {
    return { ok: false, status: 400, error: "Result must follow ***-**-***, 123-4*-***, or 123-45-678 format" };
  }

  const existingMarket = await findMarketBySlug(slug);
  if (!existingMarket) return { ok: false, status: 404, error: "Market not found" };

  const isResultOnlyUpdate = availabilityMode === "result-only";
  let preserveExplicitClose = false;
  if (isResultOnlyUpdate) {
    const settings = await getAppSettings();
    const settingValues = new Map(settings.map((item) => [String(item?.key || ""), String(item?.value || "").trim()]));
    preserveExplicitClose =
      settingValues.get(getMarketManualCloseSettingKey(slug)) === getIndiaDateKey() &&
      settingValues.get(getMarketManualCloseSourceSettingKey(slug)) === "explicit";
  }
  const effectiveStatus = isResultOnlyUpdate
    ? (preserveExplicitClose ? existingMarket.status : "Active")
    : status;
  const effectiveAction = isResultOnlyUpdate
    ? (preserveExplicitClose ? existingMarket.action : "Open")
    : action;
  const updated = await updateMarketRecord(slug, {
    result,
    status: effectiveStatus,
    action: effectiveAction,
    open,
    close,
    category
  });
  const normalizedStatus = String(effectiveStatus || "").trim().toLowerCase();
  const normalizedAction = String(effectiveAction || "").trim().toLowerCase();
  const shouldTemporarilyClose =
    normalizedStatus === "closed" ||
    normalizedStatus.includes("closed for today") ||
    normalizedStatus === "paused" ||
    normalizedAction === "closed" ||
    normalizedAction === "paused";
  await upsertAppSetting(
    getMarketManualCloseSettingKey(slug),
    shouldTemporarilyClose ? getIndiaDateKey() : ""
  );
  await upsertAppSetting(
    getMarketManualCloseSourceSettingKey(slug),
    shouldTemporarilyClose && !isResultOnlyUpdate ? "explicit" : ""
  );
  await deps.syncChartsFromMarketResult(updated);

  let broadcast = null;
  if (existingMarket.result !== result && !deps.isPlaceholderMarketResult(result)) {
    try {
      broadcast = await deps.sendMarketResultBroadcast(updated, result);
    } catch (error) {
      logger.error("Market result broadcast failed", {
        error,
        marketSlug: slug,
        result
      });
    }
  }

  return { ok: true, market: updated, broadcast };
}

export async function settleMarketData({ slug, mode, previousResult = "" }, deps) {
  const market = await findMarketBySlug(slug);
  if (!market) return { ok: false, status: 404, error: "Market not found" };
  if (!["settle", "resettle", "reset", "resettle-changed"].includes(mode)) {
    return { ok: false, status: 400, error: "Invalid settlement mode" };
  }
  if ((mode === "resettle" || mode === "resettle-changed") && !deps.canSettleMarketResult(market.result)) {
    return { ok: false, status: 400, error: "Cannot resettle market while result is placeholder or incomplete" };
  }

  const settlement =
    mode === "reset"
      ? await deps.resetMarketSettlement(market, previousResult)
      : mode === "resettle"
        ? await deps.resettleMarket(market)
        : mode === "resettle-changed"
          ? await deps.resettleChangedMarket(market, previousResult)
        : await deps.settlePendingBidsForMarket(market);

  return { ok: true, market, settlement };
}

export async function buildSettlementPreview(slug, deps) {
  const market = await findMarketBySlug(slug);
  if (!market) return { ok: false, status: 404, error: "Market not found" };

  const bids = await getBidsForMarket(market.name);
  const previewItems = [];
  let eligible = 0;
  let wins = 0;
  let losses = 0;
  let pending = 0;
  let payout = 0;

  for (const bid of bids) {
    const outcome = deps.evaluateBidAgainstMarket(bid, market);
    const user = await findUserById(bid.userId);
    if (!outcome) {
      pending += 1;
      if (previewItems.length < 20) {
        previewItems.push({
          id: bid.id,
          userName: user?.name ?? "Unknown",
          phone: user?.phone ?? "",
          boardLabel: bid.boardLabel,
          digit: bid.digit,
          sessionType: bid.sessionType,
          currentStatus: bid.status,
          previewStatus: "Pending",
          previewPayout: 0
        });
      }
      continue;
    }

    eligible += 1;
    if (outcome.status === "Won") {
      wins += 1;
      payout += outcome.payout;
    } else {
      losses += 1;
    }

    if (previewItems.length < 20) {
      previewItems.push({
        id: bid.id,
        userName: user?.name ?? "Unknown",
        phone: user?.phone ?? "",
        boardLabel: bid.boardLabel,
        digit: bid.digit,
        sessionType: bid.sessionType,
        currentStatus: bid.status,
        previewStatus: outcome.status,
        previewPayout: outcome.payout
      });
    }
  }

  return {
    ok: true,
    data: {
      market: { slug: market.slug, name: market.name, result: market.result },
      summary: {
        totalBids: bids.length,
        eligible,
        pending,
        wins,
        losses,
        payout: deps.roundAmount(payout)
      },
      items: previewItems
    }
  };
}

export async function buildMarketExposure(slug, deps) {
  const market = await findMarketBySlug(slug);
  if (!market) return { ok: false, status: 404, error: "Market not found" };

  const bids = (await getBidsForMarket(market.name)).filter((bid) => bid.status === "Pending");
  const comboMap = new Map();
  const boardMap = new Map();
  let totalStake = 0;
  let totalPotentialPayout = 0;
  let maxSinglePotentialPayout = 0;

  for (const bid of bids) {
    const stake = deps.roundAmount(Number(bid.points || 0));
    const potentialPayout = deps.getBidPotentialPayout(bid);
    const comboKey = [bid.boardLabel, bid.sessionType || "-", bid.digit].join("|");
    const boardKey = bid.boardLabel;
    totalStake += stake;
    totalPotentialPayout += potentialPayout;
    maxSinglePotentialPayout = Math.max(maxSinglePotentialPayout, potentialPayout);

    const comboEntry = comboMap.get(comboKey) || { boardLabel: bid.boardLabel, sessionType: bid.sessionType || "-", digit: bid.digit, bidsCount: 0, stake: 0, potentialPayout: 0 };
    comboEntry.bidsCount += 1;
    comboEntry.stake = deps.roundAmount(comboEntry.stake + stake);
    comboEntry.potentialPayout = deps.roundAmount(comboEntry.potentialPayout + potentialPayout);
    comboMap.set(comboKey, comboEntry);

    const boardEntry = boardMap.get(boardKey) || { boardLabel: bid.boardLabel, bidsCount: 0, stake: 0, potentialPayout: 0 };
    boardEntry.bidsCount += 1;
    boardEntry.stake = deps.roundAmount(boardEntry.stake + stake);
    boardEntry.potentialPayout = deps.roundAmount(boardEntry.potentialPayout + potentialPayout);
    boardMap.set(boardKey, boardEntry);
  }

  return {
    ok: true,
    data: {
      market: { slug: market.slug, name: market.name, result: market.result },
      summary: {
        pendingBids: bids.length,
        totalStake: deps.roundAmount(totalStake),
        totalPotentialPayout: deps.roundAmount(totalPotentialPayout),
        maxSinglePotentialPayout: deps.roundAmount(maxSinglePotentialPayout),
        uniqueExposureSpots: comboMap.size
      },
      topExposures: [...comboMap.values()].sort((left, right) => right.potentialPayout - left.potentialPayout || right.stake - left.stake).slice(0, 12),
      boardExposure: [...boardMap.values()].sort((left, right) => right.potentialPayout - left.potentialPayout || right.stake - left.stake).slice(0, 10)
    }
  };
}

export async function buildBackupSnapshot() {
  const snapshot = await getAdminSnapshot();
  const settings = await getAppSettings();
  const charts = [];
  for (const market of snapshot.markets) {
    const jodi = await getChartRecord(market.slug, "jodi");
    const panna = await getChartRecord(market.slug, "panna");
    charts.push({ slug: market.slug, jodi: jodi?.rows ?? [], panna: panna?.rows ?? [] });
  }
  return { generatedAt: new Date().toISOString(), version: 1, markets: snapshot.markets, settings, charts };
}

export async function restoreBackupSnapshot({ snapshot, dryRun }, deps) {
  const settings = Array.isArray(snapshot.settings) ? snapshot.settings : [];
  const markets = Array.isArray(snapshot.markets) ? snapshot.markets : [];
  const charts = Array.isArray(snapshot.charts) ? snapshot.charts : [];
  const chartErrors = [];
  const marketErrors = [];

  for (const market of markets) {
    const slug = String(market?.slug ?? "").trim();
    const result = String(market?.result ?? "").trim();
    const status = String(market?.status ?? "").trim();
    const action = String(market?.action ?? "").trim();
    const open = String(market?.open ?? "").trim();
    const close = String(market?.close ?? "").trim();
    const category = String(market?.category ?? "").trim();
    if (!slug || !result || !status || !action || !open || !close || !category) {
      marketErrors.push("Each restored market must include slug, result, status, action, open, close, and category");
      continue;
    }
    if (!deps.isValidMarketResultString(result)) marketErrors.push(`${slug}: invalid market result format`);
  }

  for (const chart of charts) {
    const jodiError = deps.validateChartRows(chart.jodi || [], "jodi");
    const pannaError = deps.validateChartRows(chart.panna || [], "panna");
    if (jodiError) chartErrors.push(`${chart.slug}: ${jodiError}`);
    if (pannaError) chartErrors.push(`${chart.slug}: ${pannaError}`);
  }

  if (chartErrors.length) return { ok: false, status: 400, error: chartErrors[0] };
  if (marketErrors.length) return { ok: false, status: 400, error: marketErrors[0] };

  if (!dryRun) {
    for (const item of settings) {
      await upsertAppSetting(String(item.key ?? ""), String(item.value ?? ""));
    }
    for (const market of markets) {
      await updateMarketRecord(String(market.slug ?? ""), {
        result: String(market.result ?? "***-**-***"),
        status: String(market.status ?? "Betting open now"),
        action: String(market.action ?? "Place Bet"),
        open: String(market.open ?? ""),
        close: String(market.close ?? ""),
        category: String(market.category ?? "main")
      });
    }
    for (const chart of charts) {
      await upsertChartRecord(String(chart.slug ?? ""), "jodi", chart.jodi || []);
      await upsertChartRecord(String(chart.slug ?? ""), "panna", chart.panna || []);
    }
  }

  return {
    ok: true,
    data: {
      dryRun,
      summary: { settings: settings.length, markets: markets.length, charts: charts.length }
    }
  };
}
