const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const dataDir = path.join(__dirname, "chart-data");
const freshDir = path.join(root, "fresh-data");
const allDigits = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

const pages = fs.readdirSync(root).filter((name) => {
  if (!/-predictor\.html$/.test(name) || name === "jodi-predictor.html") return false;
  return fs.readFileSync(path.join(root, name), "utf8").includes("window.PREDICTOR_MARKET");
});

function uniqueInOrder(values) {
  const out = [];
  for (const value of values) if (value !== undefined && value !== "" && !out.includes(value)) out.push(value);
  return out;
}

function uniqueSorted(values) {
  return [...new Set(values)].sort((a, b) => Number(a) - Number(b));
}

function fillSkipDigitsFromRules(primaryDigits, fallbackDigits = []) {
  const skip = uniqueInOrder(primaryDigits);
  for (const digit of fallbackDigits) if (skip.length < 3 && !skip.includes(digit)) skip.push(digit);
  for (const digit of allDigits) if (skip.length < 3 && !skip.includes(digit)) skip.push(digit);
  return uniqueSorted(skip.slice(0, 3));
}

function getSkip(strategy, inputs) {
  const { lastWeek, prevWeek, thirdWeek, previousDay, twoDayPrevious, threeDayPrevious } = inputs;
  switch (strategy) {
    case "open_week_2d_3d": return fillSkipDigitsFromRules([lastWeek[0], twoDayPrevious[0], threeDayPrevious[0]]);
    case "mahadevi_optimized": return fillSkipDigitsFromRules([thirdWeek[1], twoDayPrevious[1], threeDayPrevious[0]]);
    case "mahadevi_morning_optimized": return fillSkipDigitsFromRules([twoDayPrevious[0], twoDayPrevious[1], threeDayPrevious[1]]);
    case "sita_day_optimized": return fillSkipDigitsFromRules([previousDay[0], previousDay[1], twoDayPrevious[0]]);
    case "andhra_night_optimized": return fillSkipDigitsFromRules([lastWeek[0], prevWeek[0], prevWeek[1]]);
    case "andhra_morning_optimized": return fillSkipDigitsFromRules([twoDayPrevious[0], threeDayPrevious[0], threeDayPrevious[1]]);
    case "andhra_day_optimized": return fillSkipDigitsFromRules([lastWeek[1], previousDay[0], threeDayPrevious[0]]);
    case "ntr_day_optimized": return fillSkipDigitsFromRules([lastWeek[1], prevWeek[1], previousDay[1]]);
    case "mangal_bazar_optimized": return fillSkipDigitsFromRules([prevWeek[1], previousDay[0], threeDayPrevious[1]]);
    case "madhur_day_optimized": return fillSkipDigitsFromRules([lastWeek[1], prevWeek[0], twoDayPrevious[1]]);
    case "sita_night_optimized": return fillSkipDigitsFromRules([lastWeek[1], previousDay[0], twoDayPrevious[1]]);
    case "milan_night_combo": return fillSkipDigitsFromRules([thirdWeek[0], twoDayPrevious[0], threeDayPrevious[1]]);
    case "ntr_morning_combo": return fillSkipDigitsFromRules([lastWeek[0], lastWeek[1], twoDayPrevious[1]]);
    case "star_tara_night_combo": return fillSkipDigitsFromRules([lastWeek[0], thirdWeek[1], previousDay[1]]);
    case "maya_bazar_combo": return fillSkipDigitsFromRules([prevWeek[1], previousDay[0], twoDayPrevious[1]]);
    default: throw new Error(`Unknown strategy ${strategy}`);
  }
}

function parseStartDate(label) {
  const match = String(label).match(/^(\d{4})\s+([A-Za-z]{3})\s+(\d{1,2})\s+to/i);
  if (!match) throw new Error(`Bad date label: ${label}`);
  const months = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
  return new Date(Date.UTC(Number(match[1]), months[match[2]], Number(match[3])));
}

function dateKey(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date, days) {
  return new Date(date.getTime() + days * 86400000);
}

const freshFiles = {
  "andhra-day": "Andhra Day Panel Chart Record - Satta Matka Charts by Dpboss.com.html",
  "andhra-morning": "Andhra Morning Panel Chart Record _ Dpboss Chart History.html",
  "andhra-night": "Andhra Night Panel Chart Record _ Satta Matka Live Records.html",
  "madhur-day": "Madhur Day Panel Chart Record _ Online Matka Bazar.html",
  "mahadevi-morning": "Mahadevi Morning Panel Chart _ Matka Bazar Panel.html",
  "mahadevi": "Mahadevi Panel Chart _ Online Matka Panel Result.html",
  "mangal-bazar": "MANGAL BAZAR PANEL CHART RECORD MATKA BAZAR.html",
  "maya-bazar": "Maya Bazar Panel Chart _ Live Panel Record.html",
  "milan-night": "Milan Night Panel Chart _ Night Milan Panel Record.html",
  "ntr-day": "NTR DAY PANEL CHART RECORD MATKA BAZAR.html",
  "ntr-morning": "NTR MORNING PANEL CHART RECORD MATKA BAZAR.html",
  "ntr-night": "PNTR NIGHT PANEL CHART RECORD MATKA BAZAR.html",
  "sita-day": "Sita Day Panel Chart _ Matka Bazar Panel Record.html",
  "sita-night": "Sita Night Panel Chart Record _ Online Panel Result.html",
  "star-tara-night": "STAR TARA NIGHT PANEL CHART RECORD MATKA BAZAR.html"
};

function cellText(html) {
  return String(html).replace(/<br\s*\/?\s*>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/\s+/g, " ").trim();
}

function loadSeries(slug) {
  const file = path.join(freshDir, freshFiles[slug]);
  const html = fs.readFileSync(file, "utf8");
  const byDate = new Map();
  for (const rowMatch of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...rowMatch[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => cellText(m[1]));
    if (!/^\d{2}\/\d{2}\/\d{4}\s+to\s+\d{2}\/\d{2}\/\d{4}$/.test(cells[0] || "")) continue;
    const [day, month, year] = cells[0].slice(0, 10).split("/").map(Number);
    const start = new Date(Date.UTC(year, month - 1, day));
    const dayCount = Math.min(7, Math.floor((cells.length - 1) / 3));
    for (let offset = 0; offset < dayCount; offset++) {
      const raw = cells[2 + offset * 3];
      const value = String(raw || "").padStart(2, "0");
      if (/^\d{2}$/.test(value)) byDate.set(dateKey(addDays(start, offset)), value);
    }
  }
  return byDate;
}

function marketConfig(page) {
  const html = fs.readFileSync(path.join(root, page), "utf8");
  const name = html.match(/name:\s*"([^"]+)"/)[1];
  const strategy = html.match(/openStrategy:\s*"([^"]+)"/)[1];
  const slugMap = {
    "NTR Morning": "ntr-morning", "Maya Bazar": "maya-bazar", "Andhra Morning": "andhra-morning",
    "Mahadevi Morning": "mahadevi-morning", "Madhur Day": "madhur-day", "SITA Day": "sita-day",
    "Andhra Day": "andhra-day", Mahadevi: "mahadevi", "NTR Day": "ntr-day", "SITA Night": "sita-night",
    "Star Tara Night": "star-tara-night", "Andhra Night": "andhra-night", "NTR Night": "ntr-night",
    "Milan Night": "milan-night", "Mangal Bazar": "mangal-bazar"
  };
  return { name, strategy, slug: slugMap[name] };
}

function basePrediction(strategy, inputs) {
  const openSkip = getSkip(strategy, inputs);
  const closeSkip = getSkip(strategy, inputs);
  const open = allDigits.filter((d) => !openSkip.includes(d)).slice(0, 7);
  const close = allDigits.filter((d) => !closeSkip.includes(d)).slice(0, 7);
  const jodis = [];
  for (const o of open) for (const c of close) if (o !== c) jodis.push(o + c);
  return { openSkip, closeSkip, open, close, jodis };
}

const file01FixedClose = {
  "NTR Night": "7", "Mangal Bazar": "3", "Andhra Night": "8", "NTR Day": "5",
  "Star Tara Night": "7", "Mahadevi Morning": "0", "Andhra Morning": "8", "Andhra Day": "3",
  "Milan Night": "2", "NTR Morning": "9", Mahadevi: "3", "SITA Night": "7", "SITA Day": "2"
};

function file01Prediction(lastWeek, prevWeek, fixedCloseSkip) {
  const rawOpenSkip = [lastWeek[0], lastWeek[1], prevWeek[1]];
  let openSkip = [...new Set(rawOpenSkip)].sort((a, b) => Number(a) - Number(b));
  let openRemaining = allDigits.filter((digit) => !openSkip.includes(digit));
  if (openRemaining.length > 7) {
    const duplicate = new Set(rawOpenSkip).size !== rawOpenSkip.length;
    const lastOpen = Number(lastWeek[0]);
    const nearby = [String((lastOpen + 1) % 10), String((lastOpen + 9) % 10), String((lastOpen + 2) % 10), String((lastOpen + 8) % 10)];
    let extra = "";
    if (duplicate) {
      if (openRemaining.includes(prevWeek[0])) extra = prevWeek[0];
      else extra = nearby.find((digit) => openRemaining.includes(digit)) || "";
    }
    extra ||= openRemaining[0] || "";
    openRemaining = openRemaining.filter((digit) => digit !== extra);
  }
  const openSelected = openRemaining.slice(0, 7);
  const closeSkip = [];
  for (const digit of [lastWeek[0], lastWeek[1], fixedCloseSkip, prevWeek[1], prevWeek[0], ...allDigits]) {
    if (closeSkip.length < 3 && !closeSkip.includes(digit)) closeSkip.push(digit);
  }
  const closeSelected = allDigits.filter((digit) => !closeSkip.includes(digit)).slice(0, 7);
  const jodis = [];
  for (const open of openSelected) for (const close of closeSelected) if (open !== close) jodis.push(open + close);
  return jodis;
}

function rankCandidates(candidates, history) {
  const recent = history.slice(-90);
  const counts = new Map(candidates.map((j) => [j, 0]));
  recent.forEach((j, index) => {
    if (counts.has(j)) counts.set(j, counts.get(j) + 1 + index / Math.max(1, recent.length));
  });
  return [...candidates].sort((a, b) => (counts.get(b) - counts.get(a)) || Number(a) - Number(b));
}

function combinations(values, count) {
  const out = [];
  function visit(start, picked) {
    if (picked.length === count) { out.push([...picked]); return; }
    for (let index = start; index <= values.length - (count - picked.length); index++) {
      picked.push(values[index]); visit(index + 1, picked); picked.pop();
    }
  }
  visit(0, []);
  return out;
}

function make42(selected) {
  const jodis = [];
  for (const open of selected) for (const close of selected) if (open !== close) jodis.push(open + close);
  return jodis;
}

function complementaryBoth2Seven(oldJodis, recentHistory) {
  const oldSelected = [...new Set(oldJodis.map((jodi) => jodi[0]))];
  const oldSkip = allDigits.filter((digit) => !oldSelected.includes(digit));
  const candidates = combinations(oldSelected, 4).map((overlap4) => {
    const secondSelected = [...oldSkip, ...overlap4];
    let score = 0;
    recentHistory.forEach((jodi, index) => {
      if (!/^\d{2}$/.test(jodi || "") || jodi[0] === jodi[1]) return;
      const oldProxy = oldSelected.includes(jodi[0]) && oldSelected.includes(jodi[1]);
      const secondProxy = secondSelected.includes(jodi[0]) && secondSelected.includes(jodi[1]);
      if (secondProxy) score += (1 + index / Math.max(1, recentHistory.length)) * (oldProxy ? 2 : 1);
    });
    return { secondSelected, score };
  }).sort((a, b) => b.score - a.score || a.secondSelected.join("").localeCompare(b.secondSelected.join("")));
  return make42(candidates[0].secondSelected);
}

function summarizeComplement(records, secondKey) {
  const out = { tests: records.length, both: 0, oldOnly: 0, secondOnly: 0, bothMiss: 0, stake: 0, returned: 0, profit: 0 };
  for (const record of records) {
    const oldHit = record.base.includes(record.actual);
    const secondHit = record[secondKey].includes(record.actual);
    if (oldHit && secondHit) out.both += 1;
    else if (oldHit) out.oldOnly += 1;
    else if (secondHit) out.secondOnly += 1;
    else out.bothMiss += 1;
    out.stake += (record.base.length + record[secondKey].length) * 5;
    out.returned += (Number(oldHit) + Number(secondHit)) * 475;
  }
  out.covered = out.both + out.oldOnly + out.secondOnly;
  out.coverageRate = out.tests ? out.covered * 100 / out.tests : 0;
  out.profit = out.returned - out.stake;
  return out;
}

function score(records, selector) {
  let hits = 0, stake = 0, returned = 0, removed = 0, replacements = 0;
  for (const record of records) {
    const picked = selector(record);
    const hit = picked.includes(record.actual);
    hits += hit ? 1 : 0;
    stake += picked.length * 10;
    returned += hit ? 1000 : 0;
    removed += record.removedCount || 0;
    replacements += record.replacementCount || 0;
  }
  return { tests: records.length, hits, rate: records.length ? hits * 100 / records.length : 0, stake, profit: returned - stake, avg: records.length ? stake / 10 / records.length : 0, removed, replacements };
}

const output = [];
for (const page of pages) {
  const config = marketConfig(page);
  if (!config.slug || !freshFiles[config.slug] || !fs.existsSync(path.join(freshDir, freshFiles[config.slug]))) continue;
  const byDate = loadSeries(config.slug);
  const dates = [...byDate.keys()].sort();
  const candidates = [];
  for (const key of dates) {
    const date = new Date(`${key}T00:00:00Z`);
    const at = (days) => byDate.get(dateKey(addDays(date, days)));
    const inputs = { lastWeek: at(-7), prevWeek: at(-14), thirdWeek: at(-21), previousDay: at(-1), twoDayPrevious: at(-2), threeDayPrevious: at(-3) };
    if (!Object.values(inputs).every((v) => /^\d{2}$/.test(v || ""))) continue;
    const base = basePrediction(config.strategy, inputs);
    const oldSameDay = new Set([inputs.lastWeek, inputs.prevWeek, inputs.thirdWeek]);
    const filtered = base.jodis.filter((j) => !oldSameDay.has(j));
    const extraOpen = base.openSkip[0];
    const extraClose = base.closeSkip[0];
    const open8 = [...base.open, extraOpen];
    const close8 = [...base.close, extraClose];
    const pool8 = [];
    for (const o of open8) for (const c of close8) if (o !== c && !oldSameDay.has(o + c) && !filtered.includes(o + c)) pool8.push(o + c);
    const pastHistory = dates.filter((d) => d < key).map((d) => byDate.get(d));
    const ranked = rankCandidates(pool8, pastHistory);
    const replacementCount = Math.max(0, base.jodis.length - filtered.length);
    const replaced = [...filtered, ...ranked.slice(0, replacementCount)];
    const full8 = [...filtered, ...ranked];
    const file01 = file01FixedClose[config.name]
      ? file01Prediction(inputs.lastWeek, inputs.prevWeek, file01FixedClose[config.name])
      : [];
    const second84 = complementaryBoth2Seven(base.jodis, pastHistory.slice(-7));
    candidates.push({ date: key, actual: byDate.get(key), inputs, base: base.jodis, file01, second84, filtered, replaced, full8, removedCount: base.jodis.length - filtered.length, replacementCount: Math.min(replacementCount, ranked.length) });
  }
  const training = candidates.slice(0, -30);
  const learnedOptions = allDigits.map((fixedDigit) => {
    let covered = 0, combinedHits = 0, stake = 0;
    for (const record of training) {
      const second = file01Prediction(record.inputs.lastWeek, record.inputs.prevWeek, fixedDigit);
      const oldHit = record.base.includes(record.actual);
      const secondHit = second.includes(record.actual);
      if (oldHit || secondHit) covered += 1;
      combinedHits += Number(oldHit) + Number(secondHit);
      stake += (record.base.length + second.length) * 5;
    }
    return { fixedDigit, covered, combinedHits, profit950: combinedHits * 475 - stake };
  }).sort((a, b) => b.covered - a.covered || b.profit950 - a.profit950 || Number(a.fixedDigit) - Number(b.fixedDigit));
  const learnedFixedDigit = learnedOptions[0]?.fixedDigit || "0";
  const records = candidates.slice(-30);
  const complement = records.reduce((acc, record) => {
    const oldHit = record.base.includes(record.actual);
    const newHit = record.file01.includes(record.actual);
    if (oldHit && newHit) acc.both += 1;
    else if (oldHit) acc.oldOnly += 1;
    else if (newHit) acc.file01Only += 1;
    else acc.bothMiss += 1;
    acc.oldStake += record.base.length * 5;
    acc.file01Stake += record.file01.length * 5;
    return acc;
  }, { both: 0, oldOnly: 0, file01Only: 0, bothMiss: 0, oldStake: 0, file01Stake: 0 });
  complement.covered = complement.both + complement.oldOnly + complement.file01Only;
  complement.coverageRate = records.length ? complement.covered * 100 / records.length : 0;
  complement.return950 = (complement.both * 2 + complement.oldOnly + complement.file01Only) * 475;
  complement.profit950 = complement.return950 - complement.oldStake - complement.file01Stake;
  const learnedComplement = records.reduce((acc, record) => {
    const second = file01Prediction(record.inputs.lastWeek, record.inputs.prevWeek, learnedFixedDigit);
    const oldHit = record.base.includes(record.actual);
    const secondHit = second.includes(record.actual);
    if (oldHit && secondHit) acc.both += 1;
    else if (oldHit) acc.oldOnly += 1;
    else if (secondHit) acc.file01Only += 1;
    else acc.bothMiss += 1;
    acc.oldStake += record.base.length * 5;
    acc.file01Stake += second.length * 5;
    return acc;
  }, { fixedDigit: learnedFixedDigit, both: 0, oldOnly: 0, file01Only: 0, bothMiss: 0, oldStake: 0, file01Stake: 0 });
  learnedComplement.covered = learnedComplement.both + learnedComplement.oldOnly + learnedComplement.file01Only;
  learnedComplement.coverageRate = records.length ? learnedComplement.covered * 100 / records.length : 0;
  learnedComplement.return950 = (learnedComplement.both * 2 + learnedComplement.oldOnly + learnedComplement.file01Only) * 475;
  learnedComplement.profit950 = learnedComplement.return950 - learnedComplement.oldStake - learnedComplement.file01Stake;
  output.push({ market: config.name, base: score(records, (r) => r.base), file01: score(records, (r) => r.file01), complement, learnedComplement, complement84Latest30: summarizeComplement(records, "second84"), complement84AllTime: summarizeComplement(candidates, "second84"), filtered: score(records, (r) => r.filtered), replaced: score(records, (r) => r.replaced), full8: score(records, (r) => r.full8) });
}

function aggregate(key) {
  const sum = output.reduce((a, row) => {
    const x = row[key];
    a.tests += x.tests; a.hits += x.hits; a.stake += x.stake; a.profit += x.profit; a.removed += x.removed; a.replacements += x.replacements;
    return a;
  }, { tests: 0, hits: 0, stake: 0, profit: 0, removed: 0, replacements: 0 });
  sum.rate = sum.tests ? sum.hits * 100 / sum.tests : 0;
  sum.avg = sum.tests ? sum.stake / 10 / sum.tests : 0;
  return sum;
}

const oldTop10 = new Set(["NTR Morning", "Andhra Morning", "Mahadevi Morning", "SITA Day", "Andhra Day", "Mahadevi", "NTR Day", "Star Tara Night", "Andhra Night", "NTR Night"]);
const complementTop10 = output.filter((row) => oldTop10.has(row.market)).reduce((acc, row) => {
  for (const key of ["both", "oldOnly", "file01Only", "bothMiss", "covered", "oldStake", "file01Stake", "return950", "profit950"]) acc[key] += row.complement[key];
  return acc;
}, { both: 0, oldOnly: 0, file01Only: 0, bothMiss: 0, covered: 0, oldStake: 0, file01Stake: 0, return950: 0, profit950: 0 });
complementTop10.tests = [...oldTop10].length * 30;
complementTop10.coverageRate = complementTop10.covered * 100 / complementTop10.tests;
const learnedComplementTop10 = output.filter((row) => oldTop10.has(row.market)).reduce((acc, row) => {
  for (const key of ["both", "oldOnly", "file01Only", "bothMiss", "covered", "oldStake", "file01Stake", "return950", "profit950"]) acc[key] += row.learnedComplement[key];
  return acc;
}, { both: 0, oldOnly: 0, file01Only: 0, bothMiss: 0, covered: 0, oldStake: 0, file01Stake: 0, return950: 0, profit950: 0 });
learnedComplementTop10.tests = [...oldTop10].length * 30;
learnedComplementTop10.coverageRate = learnedComplementTop10.covered * 100 / learnedComplementTop10.tests;

console.log(JSON.stringify({ output, complementTop10, learnedComplementTop10, aggregate: { base: aggregate("base"), filtered: aggregate("filtered"), replaced: aggregate("replaced"), full8: aggregate("full8") } }, null, 2));
