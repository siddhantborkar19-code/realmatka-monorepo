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

function weekdaySkipDigit(date) {
  const weekday = date.getUTCDay();
  return weekday === 0 ? "7" : String(weekday);
}

function cutDigit(digit) {
  return String((10 - Number(digit)) % 10);
}

function buildSinglePannaRows(values) {
  const rows = [];
  let digitMismatch = 0;
  for (const [key, current] of [...values.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const date = new Date(`${key}T00:00:00Z`);
    const lastWeek = values.get(dateKey(addDays(date, -7)));
    if (!lastWeek) continue;
    const scheduledDigit = weekdaySkipDigit(date);
    const weekdayOrCut = lastWeek.jodi.includes(scheduledDigit) ? cutDigit(scheduledDigit) : scheduledDigit;
    const skip = [...new Set([lastWeek.jodi[0], lastWeek.jodi[1]])];
    for (const candidate of [weekdayOrCut, scheduledDigit, ...digits]) {
      if (skip.length < 3 && !skip.includes(candidate)) skip.push(candidate);
    }
    const selected = digits.filter((digit) => !skip.includes(digit));
    const pannaDigit = String(current.openPanna.split("").reduce((sum, digit) => sum + Number(digit), 0) % 10);
    if (pannaDigit !== current.jodi[0]) digitMismatch += 1;
    const single = isSinglePanna(current.openPanna);
    const jodiHit = current.jodi[0] !== current.jodi[1] && selected.includes(current.jodi[0]) && selected.includes(current.jodi[1]);
    rows.push({ key, openPanna: current.openPanna, openDigit: pannaDigit, skip, selected, single, hit: single && selected.includes(pannaDigit), jodiHit });
  }
  return { rows, digitMismatch };
}

function pannaSummary(rows) {
  const tests = rows.length;
  const hits = rows.filter((row) => row.hit).length;
  const singlePanna = rows.filter((row) => row.single).length;
  const jodiHits = rows.filter((row) => row.jodiHit).length;
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
    jodiHits,
    jodiHitRate: tests ? jodiHits * 100 / tests : 0,
    jodiProfit: jodiHits * 950 - tests * 420,
    monthlyAverage: tests ? (returns - stake) * 30 / tests : 0,
    from: rows[0]?.key,
    to: rows.at(-1)?.key
  };
}

const weekdayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function skipForDayDigit(lastWeekJodi, dayDigit) {
  const skip = [...new Set([lastWeekJodi[0], lastWeekJodi[1]])];
  const dayOrCut = lastWeekJodi.includes(dayDigit) ? cutDigit(dayDigit) : dayDigit;
  for (const candidate of [dayOrCut, dayDigit, ...digits]) {
    if (!skip.includes(candidate)) skip.push(candidate);
    if (skip.length === 3) break;
  }
  return skip;
}

function buildDaywiseRecords(values) {
  const rows = [];
  for (const [key, current] of [...values.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const date = new Date(`${key}T00:00:00Z`);
    const lastWeek = values.get(dateKey(addDays(date, -7)));
    if (!lastWeek) continue;
    rows.push({ key, weekday: date.getUTCDay(), actual: current.jodi, lastWeek: lastWeek.jodi });
  }
  return rows;
}

function buildBackwardOpenRecords(values) {
  const rows = [];
  for (const [key, current] of [...values.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const date = new Date(`${key}T00:00:00Z`);
    const lastWeek = values.get(dateKey(addDays(date, -7)));
    if (!lastWeek) continue;
    const scheduled = weekdaySkipDigit(date);
    const skip = [...new Set(lastWeek.jodi.split(""))];
    if (!skip.includes(scheduled)) skip.push(scheduled);
    for (let weeksBack = 2; skip.length < 3 && weeksBack <= 12; weeksBack++) {
      const older = values.get(dateKey(addDays(date, -7 * weeksBack)));
      const candidate = older?.jodi?.[0];
      if (candidate && !skip.includes(candidate)) skip.push(candidate);
    }
    for (const candidate of digits) {
      if (skip.length === 3) break;
      if (!skip.includes(candidate)) skip.push(candidate);
    }
    const hit = current.jodi[0] !== current.jodi[1]
      && !skip.includes(current.jodi[0])
      && !skip.includes(current.jodi[1]);
    rows.push({ key, actual: current.jodi, skip, hit });
  }
  return rows;
}

function directSummary(rows) {
  const tests = rows.length;
  const hits = rows.filter((row) => row.hit).length;
  return { tests, hits, rate: tests ? hits * 100 / tests : 0, profit: hits * 950 - tests * 420 };
}

function buildDateDigitRecords(values, mode) {
  const rows = [];
  for (const [key, current] of [...values.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const date = new Date(`${key}T00:00:00Z`);
    const lastWeek = values.get(dateKey(addDays(date, -7)));
    if (!lastWeek) continue;
    const day = date.getUTCDate();
    const dateDigit = mode === "digit-sum"
      ? String(String(day).split("").reduce((sum, digit) => sum + Number(digit), 0) % 10)
      : String(day % 10);
    const skip = skipForDayDigit(lastWeek.jodi, dateDigit);
    const hit = current.jodi[0] !== current.jodi[1]
      && !skip.includes(current.jodi[0])
      && !skip.includes(current.jodi[1]);
    rows.push({ key, actual: current.jodi, lastWeek: lastWeek.jodi, dateDigit, skip, hit });
  }
  return rows;
}

function dayDigitHit(row, dayDigit) {
  const skip = skipForDayDigit(row.lastWeek, dayDigit);
  return row.actual[0] !== row.actual[1] && !skip.includes(row.actual[0]) && !skip.includes(row.actual[1]);
}

function chooseMapping(trainingRows, recentSameDays = null) {
  const mapping = {};
  const details = {};
  for (let weekday = 0; weekday < 7; weekday++) {
    let rows = trainingRows.filter((row) => row.weekday === weekday);
    if (recentSameDays) rows = rows.slice(-recentSameDays);
    const scores = digits.map((digit) => ({ digit, hits: rows.filter((row) => dayDigitHit(row, digit)).length, tests: rows.length }));
    scores.sort((a, b) => b.hits - a.hits || a.digit.localeCompare(b.digit));
    mapping[weekday] = scores[0].digit;
    details[weekdayNames[weekday]] = scores[0];
  }
  return { mapping, details };
}

function jodiSummary(rows, mapping) {
  const hits = rows.filter((row) => dayDigitHit(row, mapping[row.weekday])).length;
  return { tests: rows.length, hits, rate: rows.length ? hits * 100 / rows.length : 0, profit: hits * 950 - rows.length * 420 };
}

function walkForward(rows, recentSameDays) {
  const outcomes = [];
  for (let index = 0; index < rows.length; index++) {
    const priorSameDay = rows.slice(0, index).filter((row) => row.weekday === rows[index].weekday);
    if (priorSameDay.length < recentSameDays) continue;
    const mapping = chooseMapping(rows.slice(0, index), recentSameDays).mapping;
    outcomes.push(dayDigitHit(rows[index], mapping[rows[index].weekday]));
  }
  const hits = outcomes.filter(Boolean).length;
  return { tests: outcomes.length, hits, rate: outcomes.length ? hits * 100 / outcomes.length : 0, profit: hits * 950 - outcomes.length * 420, monthlyAverage: outcomes.length ? (hits * 950 - outcomes.length * 420) * 30 / outcomes.length : 0 };
}

const ntrMarket = markets.find(([market]) => market === "NTR Night");
const ntrValues = ntrMarket[2] ? parseFresh(ntrMarket[2]) : parseCached(ntrMarket[1]);
const daywiseRows = buildDaywiseRecords(ntrValues);
const latest30Start = daywiseRows.length - 30;
const daywiseTraining = daywiseRows.slice(0, latest30Start);
const daywiseTest = daywiseRows.slice(latest30Start);
const fullMapping = chooseMapping(daywiseTraining);
const recent8Mapping = chooseMapping(daywiseTraining, 8);
const recent12Mapping = chooseMapping(daywiseTraining, 12);
const fixedMapping = { 0: "7", 1: "1", 2: "2", 3: "3", 4: "4", 5: "5", 6: "6" };

if (process.env.ONE_DIGIT_ANDHRA === "1") {
  const targetMarkets = ["Andhra Morning", "Andhra Day", "Andhra Night"];
  const weekdayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const results = targetMarkets.map((targetMarket) => {
    const [, slug, freshFile] = markets.find(([market]) => market === targetMarket);
    const values = freshFile ? parseFresh(freshFile) : parseCached(slug);
    const rows = [...values.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => ({
      key,
      weekday: new Date(`${key}T00:00:00Z`).getUTCDay(),
      jodi: value.jodi
    }));
    const training = rows.slice(0, -30);
    const test = rows.slice(-30);
    const mapping = {};
    const days = {};
    for (let weekday = 0; weekday < 7; weekday++) {
      const trainDay = training.filter((row) => row.weekday === weekday);
      const scores = digits.map((digit) => ({
        digit,
        tests: trainDay.length,
        absent: trainDay.filter((row) => !row.jodi.includes(digit)).length
      })).sort((a, b) => b.absent - a.absent || a.digit.localeCompare(b.digit));
      const selected = scores[0];
      mapping[weekday] = selected.digit;
      const testDay = test.filter((row) => row.weekday === weekday);
      const testAbsent = testDay.filter((row) => !row.jodi.includes(selected.digit)).length;
      days[weekdayNames[weekday]] = {
        digit: selected.digit,
        training: { tests: selected.tests, absent: selected.absent, rate: selected.tests ? selected.absent * 100 / selected.tests : 0 },
        latest30: { tests: testDay.length, absent: testAbsent, rate: testDay.length ? testAbsent * 100 / testDay.length : 0 }
      };
    }
    const latestAbsent = test.filter((row) => !row.jodi.includes(mapping[row.weekday])).length;
    return { market: targetMarket, mapping, days, latest30: { tests: test.length, absent: latestAbsent, rate: latestAbsent * 100 / test.length } };
  });
  console.log(JSON.stringify({ results }, null, 2));
  process.exit(0);
}

if (process.env.ANDHRA_TWO_LAGS === "1") {
  const weekdayDigitMaps = {
    "Andhra Morning": { 0: "7", 1: "2", 2: "3", 3: "6", 4: "5", 5: "6", 6: "6" },
    "Andhra Day": { 0: "6", 1: "6", 2: "7", 3: "8", 4: "3", 5: "8", 6: "5" },
    "Andhra Night": { 0: "6", 1: "7", 2: "3", 3: "1", 4: "7", 5: "9", 6: "8" }
  };
  const featureDefs = [
    ["pd_o", -1, 0], ["pd_c", -1, 1], ["p2d_o", -2, 0], ["p2d_c", -2, 1],
    ["p3d_o", -3, 0], ["p3d_c", -3, 1], ["p4d_o", -4, 0], ["p4d_c", -4, 1],
    ["lw_o", -7, 0], ["lw_c", -7, 1], ["p2w_o", -14, 0], ["p2w_c", -14, 1],
    ["p3w_o", -21, 0], ["p3w_c", -21, 1]
  ];
  const featureNames = featureDefs.map(([name]) => name);
  const pairs = [];
  for (let first = 0; first < featureNames.length; first++) {
    for (let second = first + 1; second < featureNames.length; second++) pairs.push([featureNames[first], featureNames[second]]);
  }
  const makeSkip = (row, pair, dayMap) => {
    const raw = [dayMap[row.weekday], row.features[pair[0]], row.features[pair[1]]];
    const skip = [];
    for (const value of raw) {
      if (!skip.includes(value)) skip.push(value);
      else {
        const cut = cutDigit(value);
        if (!skip.includes(cut)) skip.push(cut);
      }
    }
    for (const name of featureNames) {
      if (skip.length >= 3) break;
      const value = row.features[name];
      if (!skip.includes(value)) skip.push(value);
    }
    for (const value of digits) {
      if (skip.length >= 3) break;
      if (!skip.includes(value)) skip.push(value);
    }
    return skip.slice(0, 3);
  };
  const score = (rows, pair, dayMap) => {
    const avoided = rows.filter((row) => {
      const skip = makeSkip(row, pair, dayMap);
      return !skip.includes(row.actual[0]) && !skip.includes(row.actual[1]);
    }).length;
    return { tests: rows.length, avoided, rate: rows.length ? avoided * 100 / rows.length : 0 };
  };
  const selectPair = (rows, dayMap) => pairs.map((pair) => ({ pair, result: score(rows, pair, dayMap) }))
    .sort((a, b) => b.result.avoided - a.result.avoided || a.pair.join("+").localeCompare(b.pair.join("+")))[0];

  const results = Object.keys(weekdayDigitMaps).map((marketName) => {
    const [, slug, freshFile] = markets.find(([market]) => market === marketName);
    const values = freshFile ? parseFresh(freshFile) : parseCached(slug);
    const rows = [];
    for (const [key, current] of [...values.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      const date = new Date(`${key}T00:00:00Z`);
      const features = {};
      let valid = true;
      for (const [name, days, side] of featureDefs) {
        const previous = values.get(dateKey(addDays(date, days)));
        if (!previous) { valid = false; break; }
        features[name] = previous.jodi[side];
      }
      if (valid) rows.push({ key, weekday: date.getUTCDay(), actual: current.jodi, features });
    }
    const training = rows.slice(0, -30);
    const latest30 = rows.slice(-30);
    const full = selectPair(training, weekdayDigitMaps[marketName]);
    const recent90 = selectPair(training.slice(-90), weekdayDigitMaps[marketName]);
    return {
      market: marketName,
      dayDigits: weekdayDigitMaps[marketName],
      fullHistoryPair: { pair: full.pair, training: full.result, latest30: score(latest30, full.pair, weekdayDigitMaps[marketName]), allTime: score(rows, full.pair, weekdayDigitMaps[marketName]) },
      recent90Pair: { pair: recent90.pair, training: recent90.result, latest30: score(latest30, recent90.pair, weekdayDigitMaps[marketName]) }
    };
  });
  console.log(JSON.stringify({ featureDefs: Object.fromEntries(featureDefs.map(([name, days, side]) => [name, { days, side: side ? "close" : "open" }])), results }, null, 2));
  process.exit(0);
}

if (process.env.WEEKDAY_COVERAGE === "1") {
  const coverage = markets.map(([market, slug, freshFile]) => {
    const values = freshFile ? parseFresh(freshFile) : parseCached(slug);
    const dates = [...values.keys()].sort().slice(-90);
    const counts = [0, 0, 0, 0, 0, 0, 0];
    for (const key of dates) counts[new Date(`${key}T00:00:00Z`).getUTCDay()] += 1;
    return {
      market,
      recentTests: dates.length,
      counts: { Sunday: counts[0], Monday: counts[1], Tuesday: counts[2], Wednesday: counts[3], Thursday: counts[4], Friday: counts[5], Saturday: counts[6] },
      playsAll7: counts.every((count) => count > 0)
    };
  });
  console.log(JSON.stringify({ results: coverage }, null, 2));
  process.exit(0);
}

if (process.env.CROSS_MORNING === "1") {
  const pairs = [
    ["Andhra Morning", "Andhra Night"],
    ["Mahadevi Morning", "Mahadevi Night"],
    ["Milan Morning", "Milan Night"],
    ["NTR Morning", "NTR Night"],
    ["SITA Morning", "SITA Night"],
    ["Star Tara Morning", "Star Tara Night"],
    ["Sridevi", "Sridevi Night"]
  ];
  const loadMarket = (name) => {
    const [, slug, freshFile] = markets.find(([market]) => market === name);
    return freshFile ? parseFresh(freshFile) : parseCached(slug);
  };
  const crossResults = pairs.map(([morning, night]) => {
    const morningValues = loadMarket(morning);
    const nightValues = loadMarket(night);
    const rows = [];
    for (const [key, current] of [...morningValues.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      const date = new Date(`${key}T00:00:00Z`);
      const previousNight = nightValues.get(dateKey(addDays(date, -1)));
      if (!previousNight) continue;
      const weekday = date.getUTCDay();
      const skip = skipForDayDigit(previousNight.jodi, fixedMapping[weekday]);
      const selected = digits.filter((digit) => !skip.includes(digit));
      const hit = current.jodi[0] !== current.jodi[1] && selected.includes(current.jodi[0]) && selected.includes(current.jodi[1]);
      rows.push({ key, weekday, actual: current.jodi, previousNight: previousNight.jodi, hit });
    }
    const summarizeHits = (items) => {
      const tests = items.length;
      const hits = items.filter((item) => item.hit).length;
      const profit = hits * 950 - tests * 420;
      return { tests, hits, rate: tests ? hits * 100 / tests : 0, profit, monthlyAverage: tests ? profit * 30 / tests : 0 };
    };
    return {
      morning,
      nightSource: night,
      latest30: summarizeHits(rows.slice(-30)),
      last60: summarizeHits(rows.slice(-60)),
      last90: summarizeHits(rows.slice(-90)),
      allTime: summarizeHits(rows)
    };
  });
  console.log(JSON.stringify({ mapping: fixedMapping, results: crossResults }, null, 2));
  process.exit(0);
}

if (process.env.DATEWISE_ALL === "1") {
  const modes = ["last-digit", "digit-sum"];
  const allMarketResults = markets.map(([market, slug, freshFile]) => {
    const values = freshFile ? parseFresh(freshFile) : parseCached(slug);
    const variants = {};
    for (const mode of modes) {
      const rows = buildDateDigitRecords(values, mode);
      const allTime = directSummary(rows);
      allTime.monthlyAverage = rows.length ? allTime.profit * 30 / rows.length : 0;
      variants[mode] = {
        latest30: directSummary(rows.slice(-30)),
        last60: directSummary(rows.slice(-60)),
        last90: directSummary(rows.slice(-90)),
        allTime
      };
    }
    return { market, latestDate: [...values.keys()].sort().at(-1), variants };
  });
  console.log(JSON.stringify({ assumptions: { jodis: 42, dailyStake: 420, hitReturn: 950 }, results: allMarketResults }, null, 2));
  process.exit(0);
}

if (process.env.ALL_BACKFILL === "1") {
  const allMarketResults = markets.map(([market, slug, freshFile]) => {
    const source = freshFile ? "fresh" : "cached";
    const values = freshFile ? parseFresh(freshFile) : parseCached(slug);
    const rows = buildBackwardOpenRecords(values);
    const allTime = directSummary(rows);
    allTime.monthlyAverage = rows.length ? allTime.profit * 30 / rows.length : 0;
    return {
      market,
      source,
      latestDate: [...values.keys()].sort().at(-1),
      latest30: directSummary(rows.slice(-30)),
      last60: directSummary(rows.slice(-60)),
      last90: directSummary(rows.slice(-90)),
      allTime
    };
  });
  console.log(JSON.stringify({ rule: "previous-week jodi + weekday 1..7; duplicate filled from older same-day open", results: allMarketResults }, null, 2));
  process.exit(0);
}

if (process.env.ALL_MARKETS === "1") {
  const allMarketResults = markets.map(([market, slug, freshFile]) => {
    const source = freshFile ? "fresh" : "cached";
    const values = freshFile ? parseFresh(freshFile) : parseCached(slug);
    const rows = buildDaywiseRecords(values);
    const allTime = jodiSummary(rows, fixedMapping);
    allTime.monthlyAverage = rows.length ? allTime.profit * 30 / rows.length : 0;
    return {
      market,
      source,
      latestDate: [...values.keys()].sort().at(-1),
      latest30: jodiSummary(rows.slice(-30), fixedMapping),
      last60: jodiSummary(rows.slice(-60), fixedMapping),
      last90: jodiSummary(rows.slice(-90), fixedMapping),
      allTime
    };
  });
  console.log(JSON.stringify({ mapping: fixedMapping, results: allMarketResults }, null, 2));
  process.exit(0);
}
const halfPoint = Math.floor(daywiseRows.length / 2);
const halfMapping = chooseMapping(daywiseRows.slice(0, halfPoint));

console.log(JSON.stringify({
  market: "NTR Night",
  assumptions: { jodis: 42, betPerJodi: 10, dailyStake: 420, hitReturn: 950 },
  fixedWeekday: {
    mapping: fixedMapping,
    latest30: jodiSummary(daywiseTest, fixedMapping),
    last60: jodiSummary(daywiseRows.slice(-60), fixedMapping),
    last90: jodiSummary(daywiseRows.slice(-90), fixedMapping),
    allTime: jodiSummary(daywiseRows, fixedMapping)
  },
  fullOlderHistory: {
    ...fullMapping,
    latest30: jodiSummary(daywiseTest, fullMapping.mapping),
    last60: jodiSummary(daywiseRows.slice(-60), fullMapping.mapping),
    last90: jodiSummary(daywiseRows.slice(-90), fullMapping.mapping),
    allTime: jodiSummary(daywiseRows, fullMapping.mapping)
  },
  recent8SameDays: { ...recent8Mapping, latest30: jodiSummary(daywiseTest, recent8Mapping.mapping) },
  recent12SameDays: { ...recent12Mapping, latest30: jodiSummary(daywiseTest, recent12Mapping.mapping) },
  halfSplit: { mapping: halfMapping.mapping, validation: jodiSummary(daywiseRows.slice(halfPoint), halfMapping.mapping) },
  walkForward8: walkForward(daywiseRows, 8),
  walkForward12: walkForward(daywiseRows, 12)
}, null, 2));
process.exit(0);

const pannaResults = markets.filter(([market]) => market === "NTR Morning").map(([market, slug, freshFile]) => {
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
