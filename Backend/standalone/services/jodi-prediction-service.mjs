import { pannaChartBySingle } from "../matka-rules.mjs";

const INDIA_TIME_ZONE = "Asia/Kolkata";
const TREND_DIGIT_LIMIT = 7;
const SINGLE_PANNA_STAKE = 10;
const SINGLE_PANNA_RATE = 160;
const FINAL_NUMBER_DIGIT_MAP = {
  0: ["2", "3", "5", "9"],
  1: ["4", "5", "7", "9"],
  2: ["0", "2", "6", "8"],
  3: ["0", "1", "8", "9"],
  4: ["1", "3", "6", "7"],
  5: ["2", "4", "6", "7"],
  6: ["0", "3", "6", "8"],
  7: ["1", "2", "4", "7"],
  8: ["2", "5", "6", "8"],
  9: ["1", "4", "7", "8"]
};
const ALL_DIGITS = Array.from({ length: 10 }, (_, digit) => String(digit));
const MONTH_INDEX = new Map([
  ["jan", 0],
  ["january", 0],
  ["feb", 1],
  ["february", 1],
  ["mar", 2],
  ["march", 2],
  ["apr", 3],
  ["april", 3],
  ["may", 4],
  ["jun", 5],
  ["june", 5],
  ["jul", 6],
  ["july", 6],
  ["aug", 7],
  ["august", 7],
  ["sep", 8],
  ["sept", 8],
  ["september", 8],
  ["oct", 9],
  ["october", 9],
  ["nov", 10],
  ["november", 10],
  ["dec", 11],
  ["december", 11]
]);

function getSourceRows(rows, key) {
  const sourceRows = Array.isArray(rows)
    ? rows
    : Array.isArray(rows?.rows)
      ? rows.rows
      : Array.isArray(rows?.[key])
        ? rows[key]
        : [];
  return sourceRows;
}

function normalizeJodiRows(rows) {
  const sourceRows = getSourceRows(rows, "jodi");
  const draws = [];

  for (const row of sourceRows) {
    if (!Array.isArray(row)) continue;
    for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
      const jodi = String(row[1 + dayIndex] ?? "").trim().padStart(2, "0");
      draws.push(/^[0-9]{2}$/.test(jodi) ? jodi : "");
    }
  }

  return draws;
}

function normalizePannaRows(rows, jodiRows = null) {
  const sourceRows = getSourceRows(rows, "panna");
  const sourceJodiRows = getSourceRows(jodiRows, "jodi");
  const draws = [];

  for (let rowIndex = 0; rowIndex < sourceRows.length; rowIndex += 1) {
    const row = sourceRows[rowIndex];
    if (!Array.isArray(row)) continue;
    for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
      const openPanna = normalizePanna(row[1 + dayIndex * 2]);
      const closePanna = normalizePanna(row[2 + dayIndex * 2]);
      const jodi = String(sourceJodiRows[rowIndex]?.[1 + dayIndex] ?? "").trim().padStart(2, "0");
      if (!openPanna) continue;
      draws.push({
        openPanna,
        closePanna,
        jodi: /^[0-9]{2}$/.test(jodi) ? jodi : "",
        weekLabel: String(row[0] ?? "").trim(),
        dayIndex
      });
    }
  }

  return draws;
}

function normalizePanna(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (raw.includes("*")) return "";
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  const normalized = digits.padStart(3, "0");
  return /^[0-9]{3}$/.test(normalized) ? normalized : "";
}

function getIndiaDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: INDIA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function getDrawDateKey(draw) {
  const weekLabel = String(draw?.weekLabel || "").trim();
  const match = weekLabel.match(/^(\d{4})\s+([A-Za-z]+)\s+(\d{1,2})\s+to\b/i);
  if (!match) return "";

  const year = Number.parseInt(match[1], 10);
  const month = MONTH_INDEX.get(match[2].toLowerCase());
  const day = Number.parseInt(match[3], 10);
  if (!Number.isInteger(year) || month === undefined || !Number.isInteger(day)) return "";

  const date = new Date(Date.UTC(year, month, day + Number(draw?.dayIndex || 0)));
  return date.toISOString().slice(0, 10);
}

function excludeTodayDraws(draws, todayDateKey = getIndiaDateKey()) {
  const kept = [];
  const excluded = [];
  for (const draw of draws) {
    if (getDrawDateKey(draw) === todayDateKey) excluded.push(draw);
    else kept.push(draw);
  }
  return { kept, excluded, todayDateKey };
}

function getPannaFinalDigit(panna) {
  return String([...String(panna)].reduce((sum, digit) => sum + Number(digit), 0) % 10);
}

function getPannaType(panna) {
  const uniqueDigits = new Set(String(panna).split("")).size;
  if (uniqueDigits === 1) return "triple";
  if (uniqueDigits === 2) return "double";
  if (uniqueDigits === 3) return "single";
  return "unknown";
}

function deriveJodiFromDraw(draw) {
  if (/^[0-9]{2}$/.test(draw?.jodi || "")) return draw.jodi;
  if (!draw?.openPanna || !draw?.closePanna) return "";
  return `${getPannaFinalDigit(draw.openPanna)}${getPannaFinalDigit(draw.closePanna)}`;
}

function getJodiFinalNumber(jodi) {
  if (!/^[0-9]{2}$/.test(jodi)) return null;
  return (Number(jodi[0]) + Number(jodi[1])) % 10;
}

function countWindow(draws, endIndex, fieldFn, windowSize) {
  const counts = Object.fromEntries(ALL_DIGITS.map((digit) => [digit, 0]));
  const end = Math.max(0, Math.min(endIndex, draws.length));
  const start = Math.max(0, end - windowSize);
  for (let index = start; index < end; index += 1) {
    const digit = fieldFn(draws[index]);
    if (counts[digit] !== undefined) counts[digit] += 1;
  }
  return counts;
}

function normalizeCounts(counts) {
  const max = Math.max(1, ...Object.values(counts));
  return Object.fromEntries(ALL_DIGITS.map((digit) => [digit, Number(counts[digit] || 0) / max]));
}

function getGapScores(draws, endIndex) {
  const scores = {};
  for (const digit of ALL_DIGITS) {
    let gap = 60;
    for (let index = endIndex - 1; index >= 0; index -= 1) {
      if (getPannaFinalDigit(draws[index]?.openPanna) === digit) {
        gap = endIndex - index;
        break;
      }
    }
    scores[digit] = Math.min(gap, 30) / 30;
  }
  return scores;
}

function getFailureLearningCounts(draws, endIndex, bucket) {
  const counts = Object.fromEntries(ALL_DIGITS.map((digit) => [digit, 0]));
  const baseDigits = FINAL_NUMBER_DIGIT_MAP[bucket] || [];

  for (let index = 1; index < endIndex; index += 1) {
    const previousBucket = getJodiFinalNumber(deriveJodiFromDraw(draws[index - 1]));
    if (previousBucket !== bucket) continue;
    const actualDigit = getPannaFinalDigit(draws[index].openPanna);
    if (!baseDigits.includes(actualDigit)) counts[actualDigit] += 1;
  }

  return counts;
}

function buildTrendMixDigitsAtIndex(draws, endIndex = draws.length, limit = TREND_DIGIT_LIMIT) {
  if (endIndex <= 0) return [];

  const previousDraw = draws[endIndex - 1];
  const previousJodi = deriveJodiFromDraw(previousDraw);
  const bucket = getJodiFinalNumber(previousJodi);
  const baseDigits = bucket === null ? [] : FINAL_NUMBER_DIGIT_MAP[bucket] || [];
  const recent7 = normalizeCounts(countWindow(draws, endIndex, (draw) => getPannaFinalDigit(draw.openPanna), 7));
  const recent14 = normalizeCounts(countWindow(draws, endIndex, (draw) => getPannaFinalDigit(draw.openPanna), 14));
  const recent30 = normalizeCounts(countWindow(draws, endIndex, (draw) => getPannaFinalDigit(draw.openPanna), 30));
  const failure = normalizeCounts(bucket === null ? {} : getFailureLearningCounts(draws, endIndex, bucket));
  const neighbor = Object.fromEntries(ALL_DIGITS.map((digit) => [digit, 0]));

  for (const sourceDigit of [getPannaFinalDigit(previousDraw.openPanna), previousDraw.closePanna ? getPannaFinalDigit(previousDraw.closePanna) : ""]) {
    if (!/^[0-9]$/.test(sourceDigit)) continue;
    for (const delta of [-1, 0, 1]) {
      neighbor[String((Number(sourceDigit) + delta + 10) % 10)] += 1;
    }
  }

  const scores = {};
  for (const digit of ALL_DIGITS) {
    scores[digit] = 0;
    scores[digit] += baseDigits.includes(digit) ? 0.8 : 0;
    scores[digit] += failure[digit] * 1.2;
    scores[digit] += recent7[digit] * 2;
    scores[digit] += recent14[digit] * 1;
    scores[digit] += recent30[digit] * 0.5;
    scores[digit] += neighbor[digit] * 0.8;
  }

  return ALL_DIGITS
    .slice()
    .sort((left, right) => scores[right] - scores[left] || Number(left) - Number(right))
    .slice(0, limit);
}

function getSinglePannaMap(digits) {
  return digits.map((digit) => ({
    digit,
    pannas: pannaChartBySingle[digit] || []
  }));
}

function flattenSinglePannas(pannaMap) {
  return pannaMap.flatMap((item) => item.pannas);
}

function backtestTrendMix(draws, limit, mode = "open") {
  const start = Math.max(1, draws.length - limit);
  let stake = 0;
  let win = 0;
  let hits = 0;
  let openHits = 0;
  let closeHits = 0;
  let closeTried = 0;
  let miss = 0;
  let currentMiss = 0;
  let maxMiss = 0;

  for (let index = start; index < draws.length; index += 1) {
    const digits = buildTrendMixDigitsAtIndex(draws, index);
    const roundStake = digits.length * 12 * SINGLE_PANNA_STAKE;
    let hit = false;
    stake += roundStake;

    const openDigit = getPannaFinalDigit(draws[index].openPanna);
    if (getPannaType(draws[index].openPanna) === "single" && digits.includes(openDigit)) {
      win += SINGLE_PANNA_STAKE * SINGLE_PANNA_RATE;
      hits += 1;
      openHits += 1;
      hit = true;
    } else if (mode === "openClose" && draws[index].closePanna) {
      closeTried += 1;
      stake += roundStake;
      const closeDigit = getPannaFinalDigit(draws[index].closePanna);
      if (getPannaType(draws[index].closePanna) === "single" && digits.includes(closeDigit)) {
        win += SINGLE_PANNA_STAKE * SINGLE_PANNA_RATE;
        hits += 1;
        closeHits += 1;
        hit = true;
      }
    }

    if (hit) {
      currentMiss = 0;
    } else {
      miss += 1;
      currentMiss += 1;
      maxMiss = Math.max(maxMiss, currentMiss);
    }
  }

  const plays = draws.length - start;
  return {
    plays,
    hits,
    openHits,
    closeHits,
    closeTried,
    miss,
    hitRate: plays ? roundPercent((hits / plays) * 100) : 0,
    maxMiss,
    stake,
    win,
    profit: win - stake,
    profitPerDay: plays ? Math.round((win - stake) / plays) : 0
  };
}

function roundPercent(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function getConfidenceLabel(backtest) {
  const last30Hits = Number(backtest?.last30?.hits || 0);
  const last60Hits = Number(backtest?.last60?.hits || 0);
  const missStreak = Number(backtest?.last30?.maxMiss || 0);

  if (last30Hits >= 21 && last60Hits >= 39 && missStreak <= 3) return "strong";
  if (last30Hits >= 18 && last60Hits >= 34) return "medium";
  return "weak";
}

export function buildPannaPredictionFromRows(rows, options = {}) {
  let draws = normalizePannaRows(rows, options.jodiRows);
  const todayExclusion = excludeTodayDraws(draws, options.todayDateKey || getIndiaDateKey());
  draws = todayExclusion.kept;

  const digits = buildTrendMixDigitsAtIndex(draws);
  const singlePannaMap = getSinglePannaMap(digits);
  const singlePannas = flattenSinglePannas(singlePannaMap);
  const stakePerOpen = singlePannas.length * SINGLE_PANNA_STAKE;
  const winReturn = SINGLE_PANNA_STAKE * SINGLE_PANNA_RATE;
  const backtest = {
    last30: backtestTrendMix(draws, 30, "open"),
    last60: backtestTrendMix(draws, 60, "open"),
    last90: backtestTrendMix(draws, 90, "open"),
    openFailCloseLast30: backtestTrendMix(draws, 30, "openClose")
  };

  return {
    strategy: "trend-mix-7-single-panna",
    digits,
    singlePannaMap,
    singlePannas,
    stats: {
      totalResults: draws.length,
      todayDateKey: todayExclusion.todayDateKey,
      excludedTodayCount: todayExclusion.excluded.length,
      digitCount: digits.length,
      pannaCount: singlePannas.length,
      stakePerOpen,
      betAmountPerPanna: SINGLE_PANNA_STAKE,
      singlePannaRate: SINGLE_PANNA_RATE,
      hitReturn: winReturn,
      hitProfit: winReturn - stakePerOpen,
      confidence: getConfidenceLabel(backtest),
      backtest
    },
    excludedToday: todayExclusion.excluded.map((item) => item.openPanna),
    latestResults: draws.slice(-10).map((item) => ({
      openPanna: item.openPanna,
      openDigit: getPannaFinalDigit(item.openPanna),
      closePanna: item.closePanna,
      closeDigit: item.closePanna ? getPannaFinalDigit(item.closePanna) : ""
    })),
    generatedAt: new Date().toISOString()
  };
}

export const buildJodiPredictionFromRows = buildPannaPredictionFromRows;
