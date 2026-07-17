const fs = require("fs");
const path = require("path");

const file = path.resolve(__dirname, "..", "fresh-data", "PNTR NIGHT PANEL CHART RECORD MATKA BAZAR.html");
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

function make42(skip) {
  const selected = digits.filter((digit) => !skip.includes(digit));
  const jodis = [];
  for (const open of selected) for (const close of selected) if (open !== close) jodis.push(open + close);
  return jodis;
}

function build(fallbackMode) {
  const rows = [];
  for (const [dateKey, actual] of [...values.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const date = new Date(`${dateKey}T00:00:00Z`);
    const lastWeek = values.get(key(add(date, -7)));
    const previousNight = values.get(key(add(date, -1)));
    const twoWeek = values.get(key(add(date, -14)));
    if (![lastWeek, previousNight, twoWeek].every((jodi) => /^\d{2}$/.test(jodi || ""))) continue;
    const skip = [...new Set([lastWeek[0], lastWeek[1], previousNight[1]])];
    const fallback = fallbackMode === "twoWeekOpenFirst"
      ? [twoWeek[0], twoWeek[1], previousNight[0]]
      : fallbackMode === "twoWeekCloseFirst"
        ? [twoWeek[1], twoWeek[0], previousNight[0]]
        : [previousNight[0], twoWeek[0], twoWeek[1]];
    for (const candidate of [...fallback, ...digits]) if (skip.length < 3 && !skip.includes(candidate)) skip.push(candidate);
    const jodis = make42(skip);
    rows.push({ dateKey, actual, lastWeek, previousNight, twoWeek, skip, jodis, hit: jodis.includes(actual) });
  }
  return rows;
}

function summarize(rows) {
  const hits = rows.filter((row) => row.hit).length;
  const stake = rows.length * 42 * 5;
  return {
    tests: rows.length, hits, misses: rows.length - hits,
    rate: rows.length ? hits * 100 / rows.length : 0,
    stake, returned: hits * 475, profit: hits * 475 - stake,
    from: rows[0]?.dateKey, to: rows.at(-1)?.dateKey
  };
}

const output = {};
for (const mode of ["twoWeekOpenFirst", "twoWeekCloseFirst", "previousNightOpenFirst"]) {
  const rows = build(mode);
  output[mode] = {
    last30: summarize(rows.slice(-30)),
    last60: summarize(rows.slice(-60)),
    last90: summarize(rows.slice(-90)),
    allTime: summarize(rows)
  };
}
console.log(JSON.stringify(output, null, 2));
