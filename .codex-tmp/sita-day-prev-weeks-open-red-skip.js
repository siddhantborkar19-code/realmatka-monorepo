const fs = require("fs");
const path = require("path");

const file = path.resolve(__dirname, "..", "fresh-data", "Sita Day Panel Chart _ Matka Bazar Panel Record.html");
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
  return { selected, jodis };
}

function collectSkip(date, ignoreHistoricalRedBracket) {
  const skip = [];
  let week = 1;
  while (skip.length < 3 && week <= 12) {
    const jodi = values.get(key(add(date, -7 * week)));
    week += 1;
    if (!/^\d{2}$/.test(jodi || "")) continue;
    if (ignoreHistoricalRedBracket && jodi[0] === jodi[1]) continue;
    if (!skip.includes(jodi[0])) skip.push(jodi[0]);
  }
  return skip;
}

function build(ignoreHistoricalRedBracket) {
  const rows = [];
  for (const [dateKey, actual] of [...values.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const date = new Date(`${dateKey}T00:00:00Z`);
    const first3 = [-7, -14, -21].map((days) => values.get(key(add(date, days))));
    if (!first3.every((jodi) => /^\d{2}$/.test(jodi || ""))) continue;
    const skip = collectSkip(date, ignoreHistoricalRedBracket);
    if (skip.length !== 3) continue;
    const { selected, jodis } = make42(skip);
    rows.push({ dateKey, actual, first3, skip, selected, jodis, hit: jodis.includes(actual), actualRed: actual[0] === actual[1] });
  }
  return rows;
}

function summarize(rows) {
  const hits = rows.filter((row) => row.hit).length;
  const redResults = rows.filter((row) => row.actualRed).length;
  const stake10 = rows.length * 42 * 10;
  const stake5 = rows.length * 42 * 5;
  return {
    tests: rows.length, hits, misses: rows.length - hits, redResults,
    rate: rows.length ? hits * 100 / rows.length : 0,
    profitRate1000Bet10: hits * 1000 - stake10,
    profitRate950Bet5: hits * 475 - stake5,
    from: rows[0]?.dateKey, to: rows.at(-1)?.dateKey
  };
}

const basic = build(false);
const redReplacement = build(true);
console.log(JSON.stringify({
  basic: { latest30: summarize(basic.slice(-30)), allTime: summarize(basic) },
  redReplacement: { latest30: summarize(redReplacement.slice(-30)), allTime: summarize(redReplacement) }
}, null, 2));
