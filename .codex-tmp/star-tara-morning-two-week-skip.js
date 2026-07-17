const fs = require("fs");
const path = require("path");

const file = path.resolve(__dirname, "..", "fresh-data", "STAR TARA MORNING PANEL CHART RECORD MATKA BAZAR.html");
const html = fs.readFileSync(file, "utf8");
const digits = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];
const values = new Map();

const clean = (value) => String(value).replace(/<br\s*\/?\s*>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/\s+/g, " ").trim();
const key = (date) => date.toISOString().slice(0, 10);
const add = (date, days) => new Date(date.getTime() + days * 86400000);

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

const tests = [];
for (const [dateKey, actual] of [...values.entries()].sort(([a], [b]) => a.localeCompare(b))) {
  const date = new Date(`${dateKey}T00:00:00Z`);
  const lastWeek = values.get(key(add(date, -7)));
  const prevWeek = values.get(key(add(date, -14)));
  if (!/^\d{2}$/.test(lastWeek || "") || !/^\d{2}$/.test(prevWeek || "")) continue;
  const skip = [...new Set([...lastWeek, ...prevWeek])];
  const selected = digits.filter((digit) => !skip.includes(digit));
  const jodis = [];
  for (const open of selected) for (const close of selected) if (open !== close) jodis.push(open + close);
  const openSkip = [...new Set([lastWeek[0], prevWeek[0]])];
  const closeSkip = [...new Set([lastWeek[1], prevWeek[1]])];
  const openSelected = digits.filter((digit) => !openSkip.includes(digit));
  const closeSelected = digits.filter((digit) => !closeSkip.includes(digit));
  const sideJodis = [];
  for (const open of openSelected) for (const close of closeSelected) if (open !== close) sideJodis.push(open + close);
  tests.push({ dateKey, actual, lastWeek, prevWeek, skip, selected, jodis, hit: jodis.includes(actual), openSkip, closeSkip, sideJodis, sideHit: sideJodis.includes(actual) });
}

function summarize(rows) {
  const hits = rows.filter((row) => row.hit).length;
  const stake = rows.reduce((sum, row) => sum + row.jodis.length * 10, 0);
  return {
    tests: rows.length,
    hits,
    misses: rows.length - hits,
    rate: rows.length ? hits * 100 / rows.length : 0,
    averageSkipDigits: rows.length ? rows.reduce((sum, row) => sum + row.skip.length, 0) / rows.length : 0,
    averageJodis: rows.length ? rows.reduce((sum, row) => sum + row.jodis.length, 0) / rows.length : 0,
    stake,
    profit: hits * 1000 - stake,
    from: rows[0]?.dateKey,
    to: rows.at(-1)?.dateKey
  };
}

function summarizeSide(rows) {
  const hits = rows.filter((row) => row.sideHit).length;
  const stake = rows.reduce((sum, row) => sum + row.sideJodis.length * 10, 0);
  return {
    tests: rows.length,
    hits,
    misses: rows.length - hits,
    rate: rows.length ? hits * 100 / rows.length : 0,
    averageJodis: rows.length ? rows.reduce((sum, row) => sum + row.sideJodis.length, 0) / rows.length : 0,
    stake,
    profit: hits * 1000 - stake,
    from: rows[0]?.dateKey,
    to: rows.at(-1)?.dateKey
  };
}

function buildTrendTests(windowSize) {
  const dated = [...values.entries()].sort(([a], [b]) => a.localeCompare(b));
  const rows = [];
  for (let index = windowSize; index < dated.length; index++) {
    const [dateKey, actual] = dated[index];
    const history = dated.slice(index - windowSize, index).map(([, jodi]) => jodi);
    const stats = Object.fromEntries(digits.map((digit) => [digit, { count: 0, last: -1 }]));
    history.forEach((jodi, historyIndex) => {
      for (const digit of jodi) {
        stats[digit].count += 1;
        stats[digit].last = historyIndex;
      }
    });
    const selected = [...digits].sort((a, b) => {
      if (stats[a].count !== stats[b].count) return stats[b].count - stats[a].count;
      if (stats[a].last !== stats[b].last) return stats[b].last - stats[a].last;
      return Number(a) - Number(b);
    }).slice(0, 7);
    const jodis = [];
    for (const open of selected) for (const close of selected) if (open !== close) jodis.push(open + close);
    rows.push({ dateKey, actual, selected, jodis, hit: jodis.includes(actual) });
  }
  return rows;
}

function summarizeTrend(rows) {
  const hits = rows.filter((row) => row.hit).length;
  const stake = rows.reduce((sum, row) => sum + row.jodis.length * 10, 0);
  return { tests: rows.length, hits, misses: rows.length - hits, rate: rows.length ? hits * 100 / rows.length : 0, averageJodis: rows.length ? stake / 10 / rows.length : 0, stake, profit: hits * 1000 - stake, from: rows[0]?.dateKey, to: rows.at(-1)?.dateKey };
}

function buildFile01Tests() {
  const rows = [];
  const dated = [...values.entries()].sort(([a], [b]) => a.localeCompare(b));
  for (const [dateKey, actual] of dated) {
    const date = new Date(`${dateKey}T00:00:00Z`);
    const lastWeek = values.get(key(add(date, -7)));
    const prevWeek = values.get(key(add(date, -14)));
    if (!/^\d{2}$/.test(lastWeek || "") || !/^\d{2}$/.test(prevWeek || "")) continue;

    const rawOpenSkip = [lastWeek[0], lastWeek[1], prevWeek[1]];
    let openSkip = [...new Set(rawOpenSkip)].sort((a, b) => Number(a) - Number(b));
    let openRemaining = digits.filter((digit) => !openSkip.includes(digit));
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
      openSkip = [...new Set([...openSkip, extra])].sort((a, b) => Number(a) - Number(b));
      openRemaining = openRemaining.filter((digit) => digit !== extra);
    }
    const openSelected = openRemaining.slice(0, 7);

    const closePrimary = [lastWeek[0], lastWeek[1], "6"];
    const closeSkip = [];
    for (const digit of [...closePrimary, prevWeek[1], prevWeek[0], ...digits]) {
      if (closeSkip.length < 3 && !closeSkip.includes(digit)) closeSkip.push(digit);
    }
    closeSkip.sort((a, b) => Number(a) - Number(b));
    const closeSelected = digits.filter((digit) => !closeSkip.includes(digit)).slice(0, 7);
    const jodis = [];
    for (const open of openSelected) for (const close of closeSelected) if (open !== close) jodis.push(open + close);
    rows.push({ dateKey, actual, lastWeek, prevWeek, openSkip, closeSkip, openSelected, closeSelected, jodis, hit: jodis.includes(actual) });
  }
  return rows;
}

const file01 = buildFile01Tests();

const trend7 = buildTrendTests(7);
const trend14 = buildTrendTests(14);

console.log(JSON.stringify({
  combined: { latest30: summarize(tests.slice(-30)), allTime: summarize(tests) },
  separateSides: { latest30: summarizeSide(tests.slice(-30)), allTime: summarizeSide(tests) },
  trendTop7: {
    previous7: { latest30: summarizeTrend(trend7.slice(-30)), allTime: summarizeTrend(trend7) },
    previous14: { latest30: summarizeTrend(trend14.slice(-30)), allTime: summarizeTrend(trend14) }
  },
  file01: { latest30: summarizeTrend(file01.slice(-30)), allTime: summarizeTrend(file01) },
  latestRows: tests.slice(-30)
}, null, 2));
