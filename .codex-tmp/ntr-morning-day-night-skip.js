const fs = require("fs");
const path = require("path");

const freshDir = path.resolve(__dirname, "..", "fresh-data");
const files = {
  morning: "NTR MORNING PANEL CHART RECORD MATKA BAZAR.html",
  day: "NTR DAY PANEL CHART RECORD MATKA BAZAR.html",
  night: "PNTR NIGHT PANEL CHART RECORD MATKA BAZAR.html"
};
const digits = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];
const clean = (value) => String(value).replace(/<br\s*\/?\s*>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/\s+/g, " ").trim();
const key = (date) => date.toISOString().slice(0, 10);
const add = (date, days) => new Date(date.getTime() + days * 86400000);

function parse(fileName) {
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
      if (/^\d{2}$/.test(jodi)) values.set(key(add(start, offset)), jodi);
    }
  }
  return values;
}

const morning = parse(files.morning);
const day = parse(files.day);
const night = parse(files.night);

function makeJodis(skip) {
  const selected = digits.filter((digit) => !skip.includes(digit));
  const jodis = [];
  for (const open of selected) for (const close of selected) if (open !== close) jodis.push(open + close);
  return jodis;
}

const rows = [];
for (const [dateKey, actual] of [...morning.entries()].sort(([a], [b]) => a.localeCompare(b))) {
  const date = new Date(`${dateKey}T00:00:00Z`);
  const previousDay = day.get(key(add(date, -1)));
  const previousNight = night.get(key(add(date, -1)));
  const previousWeekMorning = morning.get(key(add(date, -7)));
  if (![previousDay, previousNight, previousWeekMorning].every((jodi) => /^\d{2}$/.test(jodi || ""))) continue;
  const baseSkip = [...new Set([previousDay[0], previousDay[1], previousNight[1]])];

  const variableJodis = makeJodis(baseSkip);
  const nightOpenSkip = [...baseSkip];
  for (const candidate of [previousNight[0], previousWeekMorning[0], previousWeekMorning[1], ...digits]) {
    if (nightOpenSkip.length < 3 && !nightOpenSkip.includes(candidate)) nightOpenSkip.push(candidate);
  }
  const weekOpenSkip = [...baseSkip];
  for (const candidate of [previousWeekMorning[0], previousWeekMorning[1], previousNight[0], ...digits]) {
    if (weekOpenSkip.length < 3 && !weekOpenSkip.includes(candidate)) weekOpenSkip.push(candidate);
  }
  rows.push({
    dateKey, actual, previousDay, previousNight, previousWeekMorning, baseSkip,
    uniqueThree: baseSkip.length === 3,
    variableJodis,
    nightOpenJodis: makeJodis(nightOpenSkip),
    weekOpenJodis: makeJodis(weekOpenSkip),
    bestSelected7: digits.filter((digit) => !weekOpenSkip.includes(digit))
  });
}

function summarize(sample, mode) {
  const active = mode === "noBetDuplicate" ? sample.filter((row) => row.uniqueThree) : sample;
  const keyName = mode === "variable" || mode === "noBetDuplicate" ? "variableJodis" : mode === "nightOpen" ? "nightOpenJodis" : "weekOpenJodis";
  const hits = active.filter((row) => row[keyName].includes(row.actual)).length;
  const stake = active.reduce((sum, row) => sum + row[keyName].length * 5, 0);
  return {
    calendarTests: sample.length, played: active.length, skipped: sample.length - active.length,
    hits, misses: active.length - hits, rate: active.length ? hits * 100 / active.length : 0,
    averageJodis: active.length ? stake / 5 / active.length : 0,
    stake, profit950: hits * 475 - stake,
    duplicateInputDays: sample.filter((row) => !row.uniqueThree).length,
    from: sample[0]?.dateKey, to: sample.at(-1)?.dateKey
  };
}

function summarizeOpenThenClose(sample) {
  const openHits = sample.filter((row) => row.bestSelected7.includes(row.actual[0])).length;
  const openStake = sample.length * 7 * 50;
  const openReturn = openHits * 475;
  const closePlayedRows = sample.filter((row) => row.bestSelected7.includes(row.actual[0]));
  const closeHits = closePlayedRows.filter((row) => {
    const close6 = row.bestSelected7.filter((digit) => digit !== row.actual[0]);
    return close6.includes(row.actual[1]);
  }).length;
  const closeStake = closePlayedRows.length * 6 * 50;
  const closeReturn = closeHits * 475;
  return {
    tests: sample.length,
    openHits, openRate: sample.length ? openHits * 100 / sample.length : 0,
    openStake, openReturn, openProfit: openReturn - openStake,
    closePlayed: closePlayedRows.length,
    closeHits, closeRateWhenPlayed: closePlayedRows.length ? closeHits * 100 / closePlayedRows.length : 0,
    closeStake, closeReturn, closeProfit: closeReturn - closeStake,
    combinedStake: openStake + closeStake,
    combinedReturn: openReturn + closeReturn,
    combinedProfit: openReturn + closeReturn - openStake - closeStake,
    from: sample[0]?.dateKey, to: sample.at(-1)?.dateKey
  };
}

function chooseTrendFallback(row, historyCount, hot) {
  const priorRows = rows.filter((candidate) => candidate.dateKey < row.dateKey).slice(-historyCount);
  const stats = Object.fromEntries(digits.map((digit) => [digit, { count: 0, last: -1 }]));
  priorRows.forEach((candidate, index) => {
    const close = candidate.actual[1];
    stats[close].count += 1;
    stats[close].last = index;
  });
  return [...row.bestSelected7].sort((a, b) => {
    if (stats[a].count !== stats[b].count) return hot ? stats[b].count - stats[a].count : stats[a].count - stats[b].count;
    if (stats[a].last !== stats[b].last) return stats[a].last - stats[b].last;
    return Number(a) - Number(b);
  })[0];
}

function summarizeAlwaysClose(sample, fallbackMode) {
  let hits = 0;
  for (const row of sample) {
    let close6;
    if (row.bestSelected7.includes(row.actual[0])) {
      close6 = row.bestSelected7.filter((digit) => digit !== row.actual[0]);
    } else {
      let fallback;
      if (fallbackMode === "previousWeekClose") fallback = row.previousWeekMorning[1];
      else if (fallbackMode === "previousNightOpen") fallback = row.previousNight[0];
      else if (fallbackMode === "cold7") fallback = chooseTrendFallback(row, 7, false);
      else if (fallbackMode === "cold14") fallback = chooseTrendFallback(row, 14, false);
      else if (fallbackMode === "cold30") fallback = chooseTrendFallback(row, 30, false);
      else if (fallbackMode === "hot7") fallback = chooseTrendFallback(row, 7, true);
      if (!row.bestSelected7.includes(fallback)) fallback = chooseTrendFallback(row, 14, false);
      close6 = row.bestSelected7.filter((digit) => digit !== fallback);
    }
    if (close6.includes(row.actual[1])) hits += 1;
  }
  const stake = sample.length * 6 * 50;
  return {
    tests: sample.length, played: sample.length, hits, misses: sample.length - hits,
    rate: sample.length ? hits * 100 / sample.length : 0,
    stake, returned: hits * 475, profit: hits * 475 - stake,
    from: sample[0]?.dateKey, to: sample.at(-1)?.dateKey
  };
}

const output = {};
for (const count of [30, 60, 90]) {
  const sample = rows.slice(-count);
  output[`last${count}`] = {
    variable42or56: summarize(sample, "variable"),
    noBetOnDuplicate: summarize(sample, "noBetDuplicate"),
    fallbackNightOpen42: summarize(sample, "nightOpen"),
    fallbackPreviousWeekMorning42: summarize(sample, "weekOpen")
    ,openThenConditionalClose: summarizeOpenThenClose(sample)
    ,alwaysClose6: {
      previousWeekClose: summarizeAlwaysClose(sample, "previousWeekClose"),
      previousNightOpen: summarizeAlwaysClose(sample, "previousNightOpen"),
      cold7: summarizeAlwaysClose(sample, "cold7"),
      cold14: summarizeAlwaysClose(sample, "cold14"),
      cold30: summarizeAlwaysClose(sample, "cold30"),
      hot7: summarizeAlwaysClose(sample, "hot7")
    }
  };
}
output.allTime = {
  variable42or56: summarize(rows, "variable"),
  noBetOnDuplicate: summarize(rows, "noBetDuplicate"),
  fallbackNightOpen42: summarize(rows, "nightOpen"),
  fallbackPreviousWeekMorning42: summarize(rows, "weekOpen")
  ,openThenConditionalClose: summarizeOpenThenClose(rows)
  ,alwaysClose6: {
    previousWeekClose: summarizeAlwaysClose(rows, "previousWeekClose"),
    previousNightOpen: summarizeAlwaysClose(rows, "previousNightOpen"),
    cold7: summarizeAlwaysClose(rows, "cold7"),
    cold14: summarizeAlwaysClose(rows, "cold14"),
    cold30: summarizeAlwaysClose(rows, "cold30"),
    hot7: summarizeAlwaysClose(rows, "hot7")
  }
};
console.log(JSON.stringify(output, null, 2));
