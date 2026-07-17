const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const freshDir = path.join(root, "fresh-data");
const cacheDir = path.join(__dirname, "chart-data");
const digits = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

const markets = [
  ["Andhra Day", "andhra-day", "Andhra Day Panel Chart Record - Satta Matka Charts by Dpboss.com.html"],
  ["Andhra Morning", "andhra-morning", "Andhra Morning Panel Chart Record _ Dpboss Chart History.html"],
  ["Andhra Night", "andhra-night", "Andhra Night Panel Chart Record _ Satta Matka Live Records.html"],
  ["Kalyan", "kalyan", "Kalyan Panel Chart _ Live Kalyan Matka Records (2012-2026).html"],
  ["Kalyan Night", "kalyan-night", null],
  ["Karnataka Day", "karnataka-day", "Karnataka Day Panel Chart _ Matka Bazar Live Record.html"],
  ["Madhur Day", "madhur-day", "Madhur Day Panel Chart Record _ Online Matka Bazar.html"],
  ["Madhur Night", "madhur-night", "Madhur Night Panel Chart _ Madhur Night Record.html"],
  ["Mahadevi", "mahadevi", "Mahadevi Panel Chart _ Online Matka Panel Result.html"],
  ["Mahadevi Morning", "mahadevi-morning", "Mahadevi Morning Panel Chart _ Matka Bazar Panel.html"],
  ["Mahadevi Night", "mahadevi-night", "Mahadevi Night Panel Chart _ Live Matka Result.html"],
  ["Main Bazar", "main-bazar", null],
  ["Mangal Bazar", "mangal-bazar", "MANGAL BAZAR PANEL CHART RECORD MATKA BAZAR.html"],
  ["Maya Bazar", "maya-bazar", "Maya Bazar Panel Chart _ Live Panel Record.html"],
  ["Milan Day", "milan-day", "Milan Day Panel Chart _ Milan Day Panel Record.html"],
  ["Milan Morning", "milan-morning", "Milan Morning Panel Chart _ Milan Morning Panel Record.html"],
  ["Milan Night", "milan-night", "Milan Night Panel Chart _ Night Milan Panel Record.html"],
  ["NTR Day", "ntr-day", "NTR DAY PANEL CHART RECORD MATKA BAZAR.html"],
  ["NTR Morning", "ntr-morning", "NTR MORNING PANEL CHART RECORD MATKA BAZAR.html"],
  ["NTR Night", "ntr-night", "PNTR NIGHT PANEL CHART RECORD MATKA BAZAR.html"],
  ["Rajdhani Day", "rajdhani-day", "Rajdhani Day Panel Chart Records _ Rajdhani Day Panel.html"],
  ["Rajdhani Night", "rajdhani-night", null],
  ["SITA Day", "sita-day", "Sita Day Panel Chart _ Matka Bazar Panel Record.html"],
  ["SITA Morning", "sita-morning", "Sita Morning Panel Chart Record _ Live Panel Patti.html"],
  ["SITA Night", "sita-night", "Sita Night Panel Chart Record _ Online Panel Result.html"],
  ["Sridevi", "sridevi", "Sridevi Panel Chart _ Live Panel Patta Result.html"],
  ["Sridevi Night", "sridevi-night", "Sridevi Night Panel Chart _ Satta Matka Panel Live.html"],
  ["Star Tara Day", "star-tara-day", "STAR TARA DAY PANEL CHART RECORD MATKA BAZAR.html"],
  ["Star Tara Morning", "star-tara-morning", "STAR TARA MORNING PANEL CHART RECORD MATKA BAZAR.html"],
  ["Star Tara Night", "star-tara-night", "STAR TARA NIGHT PANEL CHART RECORD MATKA BAZAR.html"],
  ["Supreme Night", "supreme-night", "Supreme Night Panel Chart _ Live Panel Matka Record.html"],
  ["Time Bazar", "time-bazar", "Time Bazar Panel Chart _ Live Matka Panel Record.html"]
];

const clean = (value) => String(value).replace(/<br\s*\/?\s*>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/\s+/g, " ").trim();
const dateKey = (date) => date.toISOString().slice(0, 10);
const addDays = (date, days) => new Date(date.getTime() + days * 86400000);

function parseFresh(fileName) {
  const html = fs.readFileSync(path.join(freshDir, fileName), "utf8");
  const values = new Map();
  for (const row of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((match) => clean(match[1]));
    if (!/^\d{2}\/\d{2}\/\d{4}\s+to\s+\d{2}\/\d{2}\/\d{4}$/.test(cells[0] || "")) continue;
    const [day, month, year] = cells[0].slice(0, 10).split("/").map(Number);
    const start = new Date(Date.UTC(year, month - 1, day));
    const count = Math.min(7, Math.floor((cells.length - 1) / 3));
    for (let offset = 0; offset < count; offset++) {
      const jodi = String(cells[2 + offset * 3] || "").padStart(2, "0");
      if (/^\d{2}$/.test(jodi)) values.set(dateKey(addDays(start, offset)), jodi);
    }
  }
  return values;
}

function parseCached(slug) {
  const data = JSON.parse(fs.readFileSync(path.join(cacheDir, `${slug}.chart.json`), "utf8"));
  const months = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
  const values = new Map();
  for (const row of data.jodi) {
    const match = String(row[0]).match(/^(\d{4})\s+([A-Za-z]{3})\s+(\d{1,2})\s+to/i);
    if (!match) continue;
    const start = new Date(Date.UTC(Number(match[1]), months[match[2]], Number(match[3])));
    row.slice(1, 8).forEach((raw, offset) => {
      const jodi = String(raw || "").padStart(2, "0");
      if (/^\d{2}$/.test(jodi)) values.set(dateKey(addDays(start, offset)), jodi);
    });
  }
  return values;
}

function make42(skip) {
  const selected = digits.filter((digit) => !skip.includes(digit));
  const jodis = [];
  for (const open of selected) for (const close of selected) if (open !== close) jodis.push(open + close);
  return jodis;
}

function build(values) {
  const rows = [];
  for (const [key, actual] of [...values.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const date = new Date(`${key}T00:00:00Z`);
    const lastWeek = values.get(dateKey(addDays(date, -7)));
    const previousDay = values.get(dateKey(addDays(date, -1)));
    if (!/^\d{2}$/.test(lastWeek || "") || !/^\d{2}$/.test(previousDay || "")) continue;
    const skip = [...new Set([lastWeek[0], lastWeek[1], previousDay[1]])];
    for (const candidate of [previousDay[0], ...digits]) if (skip.length < 3 && !skip.includes(candidate)) skip.push(candidate);
    const jodis = make42(skip);
    rows.push({ key, actual, hit: jodis.includes(actual) });
  }
  return rows;
}

const featureDefs = [
  ["pd_o", -1, 0], ["pd_c", -1, 1], ["p2d_o", -2, 0], ["p2d_c", -2, 1],
  ["p3d_o", -3, 0], ["p3d_c", -3, 1], ["lw_o", -7, 0], ["lw_c", -7, 1],
  ["p2w_o", -14, 0], ["p2w_c", -14, 1], ["p3w_o", -21, 0], ["p3w_c", -21, 1]
];
const featureNames = featureDefs.map(([name]) => name);

function combinations(items, count) {
  const out = [];
  function visit(start, picked) {
    if (picked.length === count) { out.push([...picked]); return; }
    for (let index = start; index <= items.length - (count - picked.length); index++) {
      picked.push(items[index]); visit(index + 1, picked); picked.pop();
    }
  }
  visit(0, []);
  return out;
}

function buildRecords(values) {
  const records = [];
  for (const [key, actual] of [...values.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const date = new Date(`${key}T00:00:00Z`);
    const features = {};
    let valid = true;
    for (const [name, days, side] of featureDefs) {
      const jodi = values.get(dateKey(addDays(date, days)));
      if (!/^\d{2}$/.test(jodi || "")) { valid = false; break; }
      features[name] = jodi[side];
    }
    if (valid) records.push({ key, date, actual, features });
  }
  return records;
}

function frequencyOrder(records, index, window, side, hot, weekdayOnly = false) {
  const counts = Object.fromEntries(digits.map((digit) => [digit, 0]));
  const targetWeekday = records[index].date.getUTCDay();
  let used = 0;
  for (let cursor = index - 1; cursor >= 0 && used < window; cursor--) {
    if (weekdayOnly && records[cursor].date.getUTCDay() !== targetWeekday) continue;
    const value = records[cursor].actual;
    if (side === "open" || side === "both") counts[value[0]] += 1;
    if (side === "close" || side === "both") counts[value[1]] += 1;
    used += 1;
  }
  return [...digits].sort((a, b) => (hot ? counts[b] - counts[a] : counts[a] - counts[b]) || a.localeCompare(b));
}

function weightedOrder(records, index, window, side, hot, decay) {
  const scores = Object.fromEntries(digits.map((digit) => [digit, 0]));
  for (let age = 1; age <= window && index - age >= 0; age++) {
    const weight = Math.pow(decay, age - 1);
    const value = records[index - age].actual;
    if (side === "open" || side === "both") scores[value[0]] += weight;
    if (side === "close" || side === "both") scores[value[1]] += weight;
  }
  return [...digits].sort((a, b) => (hot ? scores[b] - scores[a] : scores[a] - scores[b]) || a.localeCompare(b));
}

function transitionOrder(records, index, window, sourceSide, targetSide, hot) {
  const scores = Object.fromEntries(digits.map((digit) => [digit, 0]));
  const currentSource = records[index - 1].actual[sourceSide];
  const start = Math.max(1, index - window);
  for (let cursor = start; cursor < index; cursor++) {
    if (records[cursor - 1].actual[sourceSide] !== currentSource) continue;
    scores[records[cursor].actual[targetSide]] += 1;
  }
  return [...digits].sort((a, b) => (hot ? scores[b] - scores[a] : scores[a] - scores[b]) || a.localeCompare(b));
}

function completeSkip(raw, records, index) {
  const skip = [];
  const fallback = frequencyOrder(records, index, 30, "both", false);
  for (const digit of [...raw, ...fallback, ...digits]) {
    if (!skip.includes(digit)) skip.push(digit);
    if (skip.length === 3) break;
  }
  return skip;
}

const strategies = [];
for (const rule of combinations(featureNames, 3)) strategies.push({ name: `lag:${rule.join("+")}`, type: "lag", rule });
for (const window of [7, 14, 21, 30, 60]) {
  for (const side of ["open", "close", "both"]) {
    for (const hot of [false, true]) strategies.push({ name: `freq:${window}:${side}:${hot ? "hot" : "cold"}`, type: "freq", window, side, hot });
  }
}
for (const window of [14, 30]) {
  for (const side of ["open", "close", "both"]) {
    for (const hot of [false, true]) {
      for (const decay of [0.8, 0.9]) strategies.push({ name: `weighted:${window}:${side}:${hot ? "hot" : "cold"}:${decay}`, type: "weighted", window, side, hot, decay });
    }
  }
}
for (const window of [4, 8, 12]) {
  for (const side of ["open", "close", "both"]) {
    for (const hot of [false, true]) strategies.push({ name: `weekday:${window}:${side}:${hot ? "hot" : "cold"}`, type: "weekday", window, side, hot });
  }
}
for (const window of [60, 180]) {
  for (const sourceSide of [0, 1]) for (const targetSide of [0, 1]) for (const hot of [false, true]) {
    strategies.push({ name: `transition:${window}:${sourceSide}->${targetSide}:${hot ? "hot" : "cold"}`, type: "transition", window, sourceSide, targetSide, hot });
  }
}

function strategySkip(records, index, strategy) {
  if (strategy.type === "lag") return completeSkip(strategy.rule.map((name) => records[index].features[name]), records, index);
  if (strategy.type === "freq") return completeSkip(frequencyOrder(records, index, strategy.window, strategy.side, strategy.hot), records, index);
  if (strategy.type === "weighted") return completeSkip(weightedOrder(records, index, strategy.window, strategy.side, strategy.hot, strategy.decay), records, index);
  if (strategy.type === "weekday") return completeSkip(frequencyOrder(records, index, strategy.window, strategy.side, strategy.hot, true), records, index);
  return completeSkip(transitionOrder(records, index, strategy.window, strategy.sourceSide, strategy.targetSide, strategy.hot), records, index);
}

function isHit(actual, skip) {
  return actual[0] !== actual[1] && !skip.includes(actual[0]) && !skip.includes(actual[1]);
}

function summary(outcomes) {
  const tests = outcomes.length;
  const hits = outcomes.filter(Boolean).length;
  return { tests, hits, rate: tests ? hits * 100 / tests : 0, profit: hits * 950 - tests * 420, monthlyAverage: tests ? (hits * 950 - tests * 420) * 30 / tests : 0 };
}

function adaptiveSearch(values) {
  const records = buildRecords(values);
  const warmup = 90;
  if (records.length < warmup + 30) return { available: false, records: records.length };
  const hitRows = strategies.map((strategy) => records.map((record, index) => index === 0 ? false : isHit(record.actual, strategySkip(records, index, strategy))));
  const prefixes = hitRows.map((row) => {
    const prefix = [0];
    for (const hit of row) prefix.push(prefix.at(-1) + (hit ? 1 : 0));
    return prefix;
  });
  function selectBest(start, end) {
    let best = 0;
    let bestHits = -1;
    let bestRecent = -1;
    for (let strategyIndex = 0; strategyIndex < strategies.length; strategyIndex++) {
      const prefix = prefixes[strategyIndex];
      const hits = prefix[end] - prefix[start];
      const recentStart = Math.max(start, end - 90);
      const recentHits = prefix[end] - prefix[recentStart];
      if (hits > bestHits || (hits === bestHits && recentHits > bestRecent) || (hits === bestHits && recentHits === bestRecent && strategies[strategyIndex].name < strategies[best].name)) {
        best = strategyIndex; bestHits = hits; bestRecent = recentHits;
      }
    }
    return best;
  }
  function strategySummary(strategyIndex, start, end) {
    return summary(hitRows[strategyIndex].slice(start, end));
  }

  const latestTestStart = records.length - 30;
  const fixedStrategy = selectBest(warmup, latestTestStart);
  const halfPoint = Math.floor((warmup + records.length) / 2);
  const halfStrategy = selectBest(warmup, halfPoint);
  const oracleStrategy = selectBest(warmup, records.length);
  const outcomes = [];
  const selections = new Map();
  for (let index = warmup; index < records.length; index++) {
    let best = 0;
    let best90 = -1;
    let best30 = -1;
    for (let strategyIndex = 0; strategyIndex < strategies.length; strategyIndex++) {
      const prefix = prefixes[strategyIndex];
      const hits90 = prefix[index] - prefix[Math.max(0, index - 90)];
      const hits30 = prefix[index] - prefix[Math.max(0, index - 30)];
      if (hits90 > best90 || (hits90 === best90 && hits30 > best30) || (hits90 === best90 && hits30 === best30 && strategies[strategyIndex].name < strategies[best].name)) {
        best = strategyIndex; best90 = hits90; best30 = hits30;
      }
    }
    outcomes.push(hitRows[best][index]);
    selections.set(strategies[best].name, (selections.get(strategies[best].name) || 0) + 1);
  }
  return {
    available: true,
    records: records.length,
    evaluatedFrom: records[warmup].key,
    evaluatedTo: records.at(-1).key,
    allTime: summary(outcomes),
    last30: summary(outcomes.slice(-30)),
    last60: summary(outcomes.slice(-60)),
    last90: summary(outcomes.slice(-90)),
    topSelections: [...selections.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, count]) => ({ name, count })),
    fixedBeforeLatest30: {
      strategy: strategies[fixedStrategy].name,
      training: strategySummary(fixedStrategy, warmup, latestTestStart),
      latest30: strategySummary(fixedStrategy, latestTestStart, records.length),
      allEvaluated: strategySummary(fixedStrategy, warmup, records.length)
    },
    halfSplit: {
      strategy: strategies[halfStrategy].name,
      training: strategySummary(halfStrategy, warmup, halfPoint),
      validation: strategySummary(halfStrategy, halfPoint, records.length)
    },
    diagnosticBestAllTime: {
      strategy: strategies[oracleStrategy].name,
      result: strategySummary(oracleStrategy, warmup, records.length)
    }
  };
}

const results = markets.map(([market, slug, freshFile]) => {
  const source = freshFile ? "fresh" : "cached";
  const values = freshFile ? parseFresh(freshFile) : parseCached(slug);
  return { market, source, latestDate: [...values.keys()].sort().at(-1), adaptive: adaptiveSearch(values) };
});

console.log(JSON.stringify({ strategyCount: strategies.length, results }, null, 2));
