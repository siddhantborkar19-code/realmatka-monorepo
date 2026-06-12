import { getAppSettings, upsertAppSetting } from "../stores/admin-store.mjs";
import { getChartRecord, getChartRecordsForMarkets, listMarkets, updateMarketRecord } from "../stores/market-store.mjs";

const MARKET_SNAPSHOT_TTL_MS = 60_000;
const MARKET_RESULT_RESET_AFTER_MINUTES = 30;
const MARKET_RESULT_RESET_SETTING_KEY = "market_results_reset_day_india";
const MARKET_MANUAL_CLOSE_DAY_SETTING_PREFIX = "market_manual_close_day_india:";
const MARKET_MANUAL_CLOSE_SOURCE_SETTING_PREFIX = "market_manual_close_source:";
const MARKET_DAY_ROLLOVER_MINUTES = 30;
const MARKET_TIME_CHANGE_SCHEDULES = [
  {
    effectiveDate: "2026-04-27",
    markets: new Map([
  ["kalyan", { open: "03:20 PM", close: "05:20 PM" }],
  ["time-bazar", { open: "12:55 PM", close: "01:55 PM" }],
  ["milan-day", { open: "02:55 PM", close: "04:55 PM" }],
  ["milan-night", { open: "08:55 PM", close: "10:55 PM" }]
    ])
  }
];
const OPEN_CUTOFF_ONLY_BOARDS = [
  "Jodi Digit",
  "Jodi Digit Bulk",
  "Red Bracket",
  "Digit Based Jodi",
  "Half Sangam",
  "Full Sangam"
];
const WEEKDAY_OFF_BY_SLUG = new Map([
  ["kalyan-night", new Set([0, 6])],
  ["main-bazar", new Set([0, 6])],
  ["maya-bazar", new Set([0, 6])],
  ["rajdhani-night", new Set([0, 6])],
  ["kalyan", new Set([0])],
  ["madhur-night", new Set([0])],
  ["mangal-bazar", new Set([0])],
  ["milan-day", new Set([0])],
  ["milan-night", new Set([0])],
  ["rajdhani-day", new Set([0])],
  ["time-bazar", new Set([0])]
]);

let marketSnapshotCache = null;
let marketSnapshotPromise = null;

function parseClockTimeToMinutes(value) {
  const match = String(value || "").trim().match(/^(\d{1,2}):(\d{2})\s*([AP]M)$/i);
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

function getIndiaNowParts() {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });

  return Object.fromEntries(formatter.formatToParts(now).map((part) => [part.type, part.value]));
}

function getIndiaNow() {
  const parts = getIndiaNowParts();
  return new Date(
    Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second)
    )
  );
}

function getCurrentMinutes() {
  const now = getIndiaNow();
  return now.getUTCHours() * 60 + now.getUTCMinutes();
}

function getIndiaDateKey(date = getIndiaNow()) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getIndiaWeekday(date = getIndiaNow()) {
  return new Date(date).getUTCDay();
}

function getMarketManualCloseSettingKey(slug) {
  return `${MARKET_MANUAL_CLOSE_DAY_SETTING_PREFIX}${String(slug || "").trim()}`;
}

function getMarketManualCloseSourceSettingKey(slug) {
  return `${MARKET_MANUAL_CLOSE_SOURCE_SETTING_PREFIX}${String(slug || "").trim()}`;
}

function isMarketWeeklyOff(market, date = getIndiaNow()) {
  const offDays = WEEKDAY_OFF_BY_SLUG.get(String(market?.slug ?? "").trim());
  return Boolean(offDays && offDays.has(getIndiaWeekday(date)));
}

function getScheduledMarketTimeOverride(slug, date = getIndiaNow()) {
  const dateKey = getIndiaDateKey(date);
  let activeOverride = null;
  for (const schedule of MARKET_TIME_CHANGE_SCHEDULES) {
    if (dateKey >= schedule.effectiveDate) {
      const override = schedule.markets.get(String(slug || "").trim());
      if (override) {
        activeOverride = override;
      }
    }
  }
  return activeOverride;
}

function applyScheduledMarketTimeOverride(market, date = getIndiaNow()) {
  if (!market) {
    return market;
  }
  const override = getScheduledMarketTimeOverride(market.slug, date);
  if (!override) {
    return market;
  }
  return {
    ...market,
    open: override.open,
    close: override.close
  };
}

function getBlockedBoardLabelsForPhase(phase) {
  if (phase === "closed") {
    return [...OPEN_CUTOFF_ONLY_BOARDS];
  }
  if (phase === "close-running") {
    return [...OPEN_CUTOFF_ONLY_BOARDS];
  }
  return [];
}

export function getMarketRuntimeMeta(market, date = getIndiaNow()) {
  const scheduledMarket = applyScheduledMarketTimeOverride(market, date);
  const savedStatus = String(scheduledMarket?.status || "").trim().toLowerCase();
  const savedAction = String(scheduledMarket?.action || "").trim().toLowerCase();
  const todayKey = getIndiaDateKey(date);
  const manualCloseDay = String(scheduledMarket?.manualCloseDay || "").trim();
  const hasTemporaryCloseToday = manualCloseDay === todayKey;
  const currentMinutes = date.getUTCHours() * 60 + date.getUTCMinutes();

  if (
    hasTemporaryCloseToday &&
    (
      savedStatus === "closed" ||
      savedStatus.includes("closed for today") ||
      savedAction === "closed"
    )
  ) {
    return {
      phase: "closed",
      sortBucket: 2,
      anchor: parseClockTimeToMinutes(scheduledMarket?.close),
      canPlaceBet: false,
      isClosed: true,
      label: "Betting is Closed for Today",
      status: "Closed for Today",
      action: "Closed"
    };
  }

  if (hasTemporaryCloseToday && (savedStatus === "paused" || savedAction === "paused")) {
    return {
      phase: "closed",
      sortBucket: 2,
      anchor: parseClockTimeToMinutes(scheduledMarket?.close),
      canPlaceBet: false,
      isClosed: true,
      label: "Betting is Closed for Today",
      status: "Paused",
      action: "Closed"
    };
  }

  if (isMarketWeeklyOff(scheduledMarket, date)) {
    return {
      phase: "closed",
      sortBucket: 2,
      anchor: parseClockTimeToMinutes(scheduledMarket?.close),
      canPlaceBet: false,
      isClosed: true,
      label: "Betting is Closed for Today",
      status: "Weekly Off",
      action: "Closed"
    };
  }

  if (currentMinutes < MARKET_DAY_ROLLOVER_MINUTES) {
    return {
      phase: "open-running",
      sortBucket: 0,
      anchor: 0,
      canPlaceBet: true,
      isClosed: false,
      label: "Betting Running Now",
      status: "Betting open now",
      action: "Place Bet"
    };
  }

  const openMinutes = parseClockTimeToMinutes(scheduledMarket?.open);
  const closeMinutes = parseClockTimeToMinutes(scheduledMarket?.close);

  if (currentMinutes < openMinutes) {
    return {
      phase: "upcoming",
      sortBucket: 1,
      anchor: openMinutes,
      canPlaceBet: true,
      isClosed: false,
      label: "Betting Running Now",
      status: "Betting open now",
      action: "Place Bet"
    };
  }

  if (currentMinutes < closeMinutes) {
    return {
      phase: "close-running",
      sortBucket: 0,
      anchor: closeMinutes,
      canPlaceBet: true,
      isClosed: false,
      label: "Betting is Running for Close",
      status: "Betting open now",
      action: "Place Bet"
    };
  }

  return {
    phase: "closed",
    sortBucket: 2,
    anchor: closeMinutes,
    canPlaceBet: false,
    isClosed: true,
    label: "Betting is Closed for Today",
    status: "Betting is Closed for Today",
    action: "Closed"
  };
}

function getMarketPhaseMeta(market, currentMinutes) {
  const scheduledMarket = applyScheduledMarketTimeOverride(market);
  if (isMarketWeeklyOff(scheduledMarket)) {
    return { sortBucket: 2, anchor: parseClockTimeToMinutes(scheduledMarket?.close) };
  }
  if (currentMinutes < MARKET_DAY_ROLLOVER_MINUTES) {
    return { sortBucket: 0, anchor: 0 };
  }
  const openMinutes = parseClockTimeToMinutes(scheduledMarket?.open);
  const closeMinutes = parseClockTimeToMinutes(scheduledMarket?.close);

  if (currentMinutes < openMinutes) {
    return { sortBucket: 1, anchor: openMinutes };
  }
  if (currentMinutes < closeMinutes) {
    return { sortBucket: 0, anchor: closeMinutes };
  }
  return { sortBucket: 2, anchor: closeMinutes };
}

function sortMarketsByCurrentPhase(markets) {
  const currentMinutes = getCurrentMinutes();
  return [...markets].sort((left, right) => {
    const leftMeta = getMarketPhaseMeta(left, currentMinutes);
    const rightMeta = getMarketPhaseMeta(right, currentMinutes);

    if (leftMeta.sortBucket !== rightMeta.sortBucket) {
      return leftMeta.sortBucket - rightMeta.sortBucket;
    }

    if (leftMeta.sortBucket === 0 || leftMeta.sortBucket === 1) {
      const diff = leftMeta.anchor - rightMeta.anchor;
      if (diff !== 0) {
        return diff;
      }
    }

    if (leftMeta.sortBucket === 2) {
      const diff = leftMeta.anchor - rightMeta.anchor;
      if (diff !== 0) {
        return diff;
      }
    }

    return String(left?.name || "").localeCompare(String(right?.name || ""));
  });
}

function parseResult(result) {
  const parts = String(result ?? "").trim().split("-");
  return {
    openPanna: /^[0-9]{3}$/.test(parts[0] ?? "") ? parts[0] : "",
    jodi: /^[0-9]{2}$/.test(parts[1] ?? "") ? parts[1] : "",
    closePanna: /^[0-9]{3}$/.test(parts[2] ?? "") ? parts[2] : ""
  };
}

function getWeekStart(date) {
  const value = new Date(date);
  const day = value.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  value.setUTCDate(value.getUTCDate() + diff);
  value.setUTCHours(0, 0, 0, 0);
  return value;
}

function getWeekChartLabel(date) {
  const start = getWeekStart(date);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return `${start.getFullYear()} ${formatChartDay(start)} to ${formatChartDay(end)}`;
}

function formatChartDay(date) {
  const value = new Date(date);
  const month = value.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
  const day = String(value.getUTCDate()).padStart(2, "0");
  return `${month} ${day}`;
}

function getWeekdayIndex(date) {
  const day = new Date(date).getUTCDay();
  return day === 0 ? 6 : day - 1;
}

function normalizeWeekLabel(label) {
  return String(label ?? "").trim().replace(/\s+/g, " ");
}

function getCurrentChartRow(rows) {
  const label = normalizeWeekLabel(getWeekChartLabel(getIndiaNow()));
  return (Array.isArray(rows) ? rows : []).find((row) => normalizeWeekLabel(row?.[0]) === label) ?? null;
}

function isPlaceholderResult(result) {
  return !String(result ?? "").trim() || String(result ?? "").trim() === "***-**-***";
}

async function applyNightlyMarketResultReset(markets) {
  const indiaNow = getIndiaNow();
  const currentMinutes = indiaNow.getUTCHours() * 60 + indiaNow.getUTCMinutes();
  if (currentMinutes < MARKET_RESULT_RESET_AFTER_MINUTES) {
    return markets;
  }

  const todayKey = getIndiaDateKey(indiaNow);
  const settings = await getAppSettings();
  const lastResetKey = settings.find((item) => item?.key === MARKET_RESULT_RESET_SETTING_KEY)?.value ?? "";
  if (lastResetKey === todayKey) {
    return markets;
  }

  const marketsToReset = (Array.isArray(markets) ? markets : []).filter((market) => !isPlaceholderResult(market?.result));
  if (marketsToReset.length) {
    await Promise.all(
      marketsToReset.map((market) =>
        updateMarketRecord(market.slug, {
          result: "***-**-***",
          resultLockedAt: null,
          resultLockedByUserId: null
        })
      )
    );
  }

  await upsertAppSetting(MARKET_RESULT_RESET_SETTING_KEY, todayKey);

  if (!marketsToReset.length) {
    return markets;
  }

  const resetLookup = new Set(marketsToReset.map((market) => market.slug));
  return markets.map((market) =>
    resetLookup.has(market.slug)
      ? {
          ...market,
          result: "***-**-***",
          resultLockedAt: null,
          resultLockedByUserId: null
        }
      : market
  );
}

function deriveTodayResultFromCharts(market, jodiChart, pannaChart) {
  const storedResult = String(market?.result ?? "").trim();
  const indiaNow = getIndiaNow();
  const currentDayIndex = getWeekdayIndex(indiaNow);
  const jodiRow = getCurrentChartRow(jodiChart?.rows);
  const pannaRow = getCurrentChartRow(pannaChart?.rows);
  if (!jodiRow || !pannaRow) {
    return storedResult;
  }

  const jodi = String(jodiRow[currentDayIndex + 1] ?? "").trim();
  const openPanna = String(pannaRow[1 + currentDayIndex * 2] ?? "").trim();
  const closePanna = String(pannaRow[2 + currentDayIndex * 2] ?? "").trim();

  if (/^[0-9]{3}$/.test(openPanna) && /^[0-9*]{2}$/.test(jodi) && /^[0-9]{3}$/.test(closePanna)) {
    return `${openPanna}-${jodi}-${closePanna}`;
  }
  if (/^[0-9]{3}$/.test(openPanna) && /^[0-9*]{2}$/.test(jodi)) {
    return `${openPanna}-${jodi}-***`;
  }

  return isPlaceholderResult(storedResult) ? "***-**-***" : storedResult;
}

async function applyTemporaryMarketCloseReset(markets) {
  const settings = await getAppSettings();
  const todayKey = getIndiaDateKey(getIndiaNow());
  const manualCloseDayBySlug = new Map(
    settings
      .filter((item) => String(item?.key || "").startsWith(MARKET_MANUAL_CLOSE_DAY_SETTING_PREFIX))
      .map((item) => [String(item.key).slice(MARKET_MANUAL_CLOSE_DAY_SETTING_PREFIX.length), String(item.value || "").trim()])
  );
  const manualCloseSourceBySlug = new Map(
    settings
      .filter((item) => String(item?.key || "").startsWith(MARKET_MANUAL_CLOSE_SOURCE_SETTING_PREFIX))
      .map((item) => [String(item.key).slice(MARKET_MANUAL_CLOSE_SOURCE_SETTING_PREFIX.length), String(item.value || "").trim()])
  );

  const staleClosedMarkets = [];
  const nextMarkets = (Array.isArray(markets) ? markets : []).map((market) => {
    const manualCloseDay = manualCloseDayBySlug.get(String(market?.slug || "").trim()) || "";
    const manualCloseSource = manualCloseSourceBySlug.get(String(market?.slug || "").trim()) || "";
    const savedStatus = String(market?.status || "").trim().toLowerCase();
    const savedAction = String(market?.action || "").trim().toLowerCase();
    const hasTemporaryCloseState =
      savedStatus === "closed" ||
      savedStatus.includes("closed for today") ||
      savedStatus === "paused" ||
      savedAction === "closed" ||
      savedAction === "paused";

    if (hasTemporaryCloseState && (manualCloseDay !== todayKey || manualCloseSource !== "explicit")) {
      staleClosedMarkets.push(String(market?.slug || "").trim());
      return {
        ...market,
        status: "Active",
        action: "Open",
        manualCloseDay: ""
      };
    }

    return {
      ...market,
      manualCloseDay
    };
  });

  if (staleClosedMarkets.length) {
    await Promise.all(
      staleClosedMarkets.flatMap((slug) => [
        updateMarketRecord(slug, { status: "Active", action: "Open" }).catch(() => null),
        upsertAppSetting(getMarketManualCloseSettingKey(slug), "").catch(() => null),
        upsertAppSetting(getMarketManualCloseSourceSettingKey(slug), "").catch(() => null)
      ])
    );
  }

  return nextMarkets;
}

function buildChartLookup(charts) {
  const lookup = new Map();

  for (const chart of Array.isArray(charts) ? charts : []) {
    if (!chart?.marketSlug || !chart?.chartType) {
      continue;
    }
    lookup.set(`${chart.marketSlug}:${chart.chartType}`, chart);
  }

  return lookup;
}

function decorateMarketWithLookup(market, chartLookup) {
  if (!market) {
    return market;
  }

  const scheduledMarket = applyScheduledMarketTimeOverride(market);

  const jodiChart = chartLookup.get(`${scheduledMarket.slug}:jodi`) ?? null;
  const pannaChart = chartLookup.get(`${scheduledMarket.slug}:panna`) ?? null;
  const runtimeMeta = getMarketRuntimeMeta(scheduledMarket);
  const nextResult = jodiChart && pannaChart ? deriveTodayResultFromCharts(scheduledMarket, jodiChart, pannaChart) : scheduledMarket.result;

  return {
    ...scheduledMarket,
    result: nextResult,
    phase: runtimeMeta.phase,
    label: runtimeMeta.label,
    canPlaceBet: runtimeMeta.canPlaceBet,
    blockedBoardLabels: getBlockedBoardLabelsForPhase(runtimeMeta.phase),
    status: runtimeMeta.status,
    action: runtimeMeta.action
  };
}

async function buildMarketSnapshot() {
  const seededMarkets = await listMarkets();
  const normalizedMarkets = await applyTemporaryMarketCloseReset(seededMarkets);
  const markets = await applyNightlyMarketResultReset(normalizedMarkets);
  if (!markets.length) {
    return markets;
  }

  const charts = await getChartRecordsForMarkets(
    markets.map((market) => market.slug),
    ["jodi", "panna"]
  );
  const chartLookup = buildChartLookup(charts);
  const decoratedMarkets = markets.map((market) => decorateMarketWithLookup(market, chartLookup));

  const changedResults = decoratedMarkets.filter(
    (market, index) => String(market?.result ?? "").trim() !== String(markets[index]?.result ?? "").trim()
  );
  if (changedResults.length) {
    await Promise.all(
      changedResults.map((market) =>
        updateMarketRecord(market.slug, { result: String(market.result ?? "***-**-***") }).catch(() => null)
      )
    );
  }

  return sortMarketsByCurrentPhase(decoratedMarkets);
}

export function invalidateMarketListSnapshot() {
  marketSnapshotCache = null;
}

export async function refreshMarketListSnapshot() {
  marketSnapshotCache = null;
  return getMarketListSnapshot({ forceRefresh: true });
}

export async function getMarketListSnapshot({ forceRefresh = false, maxAgeMs = MARKET_SNAPSHOT_TTL_MS } = {}) {
  const cacheIsFresh =
    marketSnapshotCache &&
    Date.now() - marketSnapshotCache.cachedAt < maxAgeMs &&
    Array.isArray(marketSnapshotCache.data);

  if (!forceRefresh && cacheIsFresh) {
    return marketSnapshotCache.data;
  }

  if (!forceRefresh && marketSnapshotPromise) {
    return marketSnapshotPromise;
  }

  marketSnapshotPromise = (async () => {
    const data = await buildMarketSnapshot();
    marketSnapshotCache = {
      data,
      cachedAt: Date.now()
    };
    return data;
  })();

  try {
    return await marketSnapshotPromise;
  } finally {
    marketSnapshotPromise = null;
  }
}

export async function getMarketSnapshotBySlug(slug) {
  const markets = await getMarketListSnapshot();
  return markets.find((market) => market.slug === slug) ?? null;
}

export async function getDecoratedMarketBySlug(slug) {
  const market = await getMarketSnapshotBySlug(slug);
  if (market) {
    return market;
  }

  const sourceMarket = (await listMarkets()).find((item) => item.slug === slug) ?? null;
  if (!sourceMarket) {
    return sourceMarket;
  }

  const scheduledMarket = applyScheduledMarketTimeOverride(sourceMarket);

  const [jodiChart, pannaChart] = await Promise.all([
    getChartRecord(scheduledMarket.slug, "jodi"),
    getChartRecord(scheduledMarket.slug, "panna")
  ]);
  const runtimeMeta = getMarketRuntimeMeta(scheduledMarket);

  return {
    ...scheduledMarket,
    result: deriveTodayResultFromCharts(scheduledMarket, jodiChart, pannaChart),
    phase: runtimeMeta.phase,
    label: runtimeMeta.label,
    canPlaceBet: runtimeMeta.canPlaceBet,
    blockedBoardLabels: getBlockedBoardLabelsForPhase(runtimeMeta.phase),
    status: runtimeMeta.status,
    action: runtimeMeta.action
  };
}
