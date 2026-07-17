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
      const openPanna = String(cells[1 + offset * 3] || "").replace(/\D/g, "");
      const jodi = String(cells[2 + offset * 3] || "").padStart(2, "0");
      const closePanna = String(cells[3 + offset * 3] || "").replace(/\D/g, "");
      if (/^\d{2}$/.test(jodi) && /^\d{3}$/.test(openPanna)) {
        values.set(dateKey(addDays(start, offset)), { jodi, openPanna, closePanna });
      }
    }
  }
  return values;
}

function parseCached(slug) {
  const data = JSON.parse(fs.readFileSync(path.join(cacheDir, `${slug}.chart.json`), "utf8"));
  const months = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
  const values = new Map();
  const pannaByLabel = new Map(data.panna.map((row) => [String(row[0]), row]));
  for (const row of data.jodi) {
    const match = String(row[0]).match(/^(\d{4})\s+([A-Za-z]{3})\s+(\d{1,2})\s+to/i);
    if (!match) continue;
    const start = new Date(Date.UTC(Number(match[1]), months[match[2]], Number(match[3])));
    const panna = pannaByLabel.get(String(row[0])) || [];
    row.slice(1, 8).forEach((raw, offset) => {
      const jodi = String(raw || "").padStart(2, "0");
      const openPanna = String(panna[1 + offset * 2] || "");
      const closePanna = String(panna[2 + offset * 2] || "");
      if (/^\d{2}$/.test(jodi) && /^\d{3}$/.test(openPanna)) {
        values.set(dateKey(addDays(start, offset)), { jodi, openPanna, closePanna });
      }
    });
  }
  return values;
}

function isSinglePanna(panna) {
  return /^\d{3}$/.test(panna) && new Set(panna.split("")).size === 3;
}

function buildSinglePannaRows(values) {
  const rows = [];
  let digitMismatch = 0;
  for (const [key, current] of [...values.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const date = new Date(`${key}T00:00:00Z`);
    const lastWeek = values.get(dateKey(addDays(date, -7)));
    const previousDay = values.get(dateKey(addDays(date, -1)));
    if (!lastWeek || !previousDay) continue;
    const skip = [...new Set([lastWeek.jodi[0], lastWeek.jodi[1], previousDay.jodi[1]])];
    for (const candidate of [previousDay.jodi[0], ...digits]) {
      if (skip.length < 3 && !skip.includes(candidate)) skip.push(candidate);
    }
    const selected = digits.filter((digit) => !skip.includes(digit));
    const pannaDigit = String(current.openPanna.split("").reduce((sum, digit) => sum + Number(digit), 0) % 10);
    if (pannaDigit !== current.jodi[0]) digitMismatch += 1;
    const single = isSinglePanna(current.openPanna);
    rows.push({ key, openPanna: current.openPanna, openDigit: pannaDigit, skip, selected, single, hit: single && selected.includes(pannaDigit) });
  }
  return { rows, digitMismatch };
}

function pannaSummary(rows) {
  const tests = rows.length;
  const hits = rows.filter((row) => row.hit).length;
  const singlePanna = rows.filter((row) => row.single).length;
  const stake = tests * 84 * 5;
  const returns = hits * 5 * 160;
  return {
    tests,
    hits,
    hitRate: tests ? hits * 100 / tests : 0,
    singlePanna,
    singlePannaRate: tests ? singlePanna * 100 / tests : 0,
    stake,
    returns,
    profit: returns - stake,
    monthlyAverage: tests ? (returns - stake) * 30 / tests : 0,
    from: rows[0]?.key,
    to: rows.at(-1)?.key
  };
}

const pannaResults = markets.map(([market, slug, freshFile]) => {
  const source = freshFile ? "fresh" : "cached";
  const values = freshFile ? parseFresh(freshFile) : parseCached(slug);
  const { rows, digitMismatch } = buildSinglePannaRows(values);
  return {
    market,
    source,
    latestDate: [...values.keys()].sort().at(-1),
    digitMismatch,
    last30: pannaSummary(rows.slice(-30)),
    last60: pannaSummary(rows.slice(-60)),
    last90: pannaSummary(rows.slice(-90)),
    allTime: pannaSummary(rows)
  };
});

console.log(JSON.stringify({ assumptions: { pannaPerDigit: 12, selectedDigits: 7, betPerPanna: 5, dailyStake: 420, winReturn: 800, breakEvenHitRate: 52.5 }, results: pannaResults }, null, 2));
process.exit(0);

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
const fallbackNames = featureDefs.map(([name]) => name);

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
const searchRules = [3].flatMap((skipCount) =>
  combinations(fallbackNames, skipCount).map((rule) => ({ rule, skipCount }))
);

function buildFeatureRecords(values) {
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
    if (valid) records.push({ key, actual, features });
  }
  return records;
}

function ruleHit(record, candidate) {
  const { rule, skipCount } = candidate;
  const skip = [];
  for (const name of [...rule, ...fallbackNames, ...digits]) {
    const digit = record.features[name] ?? name;
    if (skip.length < skipCount && !skip.includes(digit)) skip.push(digit);
  }
  return record.actual[0] !== record.actual[1] && !skip.includes(record.actual[0]) && !skip.includes(record.actual[1]);
}

function ruleScore(rows, candidate) {
  const hits = rows.filter((record) => ruleHit(record, candidate)).length;
  const selectedDigits = 10 - candidate.skipCount;
  const jodiCount = selectedDigits * (selectedDigits - 1);
  const stakePerDay = jodiCount * 10;
  return { tests: rows.length, hits, rate: rows.length ? hits * 100 / rows.length : 0, jodiCount, stakePerDay, profit: hits * 950 - rows.length * stakePerDay };
}

function selectRule(rows) {
  return searchRules.map((candidate) => ({ ...candidate, ...ruleScore(rows, candidate) }))
    .sort((a, b) => b.profit - a.profit || a.skipCount - b.skipCount || a.rule.join("+").localeCompare(b.rule.join("+")))[0];
}

function searchMarket(values) {
  const records = buildFeatureRecords(values);
  const test = records.slice(-30);
  const training = records.slice(0, -30);
  if (test.length < 30 || training.length < 30) return { available: false, records: records.length, training: training.length, tests: test.length };
  const fullSelected = selectRule(training);
  const recentSelected = selectRule(training.slice(-Math.min(90, training.length)));
  return {
    available: true,
    testFrom: test[0].key,
    testTo: test.at(-1).key,
    fullTraining: { rule: fullSelected.rule, skipCount: fullSelected.skipCount, training: ruleScore(training, fullSelected), test: ruleScore(test, fullSelected) },
    recent90Training: {
      rule: recentSelected.rule,
      skipCount: recentSelected.skipCount,
      training: ruleScore(training.slice(-Math.min(90, training.length)), recentSelected),
      test: ruleScore(test, recentSelected),
      last60: ruleScore(records.slice(-60), recentSelected),
      last90: ruleScore(records.slice(-90), recentSelected),
      allTime: ruleScore(records, recentSelected)
    }
  };
}

function summarize(rows) {
  const hits = rows.filter((row) => row.hit).length;
  const stake = rows.length * 42 * 10;
  return { tests: rows.length, hits, rate: rows.length ? hits * 100 / rows.length : 0, stake, profit: hits * 950 - stake, from: rows[0]?.key, to: rows.at(-1)?.key };
}

const results = markets.map(([market, slug, freshFile]) => {
  const source = freshFile ? "fresh" : "cached";
  const values = freshFile ? parseFresh(freshFile) : parseCached(slug);
  const rows = build(values);
  return { market, source, latestDate: [...values.keys()].sort().at(-1), last30: summarize(rows.slice(-30)), last60: summarize(rows.slice(-60)), last90: summarize(rows.slice(-90)), allTime: summarize(rows), ruleSearch: searchMarket(values) };
});

function total(period) {
  return results.reduce((sum, row) => {
    const value = row[period];
    sum.tests += value.tests; sum.hits += value.hits; sum.stake += value.stake; sum.profit += value.profit;
    return sum;
  }, { tests: 0, hits: 0, stake: 0, profit: 0 });
}

const totals = Object.fromEntries(["last30", "last60", "last90", "allTime"].map((period) => {
  const value = total(period);
  value.rate = value.tests ? value.hits * 100 / value.tests : 0;
  return [period, value];
}));

console.log(JSON.stringify({ results, totals }, null, 2));
