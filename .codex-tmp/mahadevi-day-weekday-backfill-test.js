const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const sourceFile = path.join(root, "fresh-data", "Mahadevi Panel Chart _ Online Matka Panel Result.html");
const digits = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

const clean = (value) => String(value)
  .replace(/<br\s*\/?\s*>/gi, " ")
  .replace(/<[^>]+>/g, " ")
  .replace(/&nbsp;/gi, " ")
  .replace(/\s+/g, " ")
  .trim();
const dateKey = (date) => date.toISOString().slice(0, 10);
const addDays = (date, days) => new Date(date.getTime() + days * 86400000);

function parseFresh() {
  const html = fs.readFileSync(sourceFile, "utf8");
  const values = new Map();
  for (const row of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((match) => clean(match[1]));
    if (!/^\d{2}\/\d{2}\/\d{4}\s+to\s+\d{2}\/\d{2}\/\d{4}$/.test(cells[0] || "")) continue;
    const [day, month, year] = cells[0].slice(0, 10).split("/").map(Number);
    const start = new Date(Date.UTC(year, month - 1, day));
    const count = Math.min(7, Math.floor((cells.length - 1) / 3));
    for (let offset = 0; offset < count; offset++) {
      const jodi = String(cells[2 + offset * 3] || "").padStart(2, "0");
      if (/^\d{2}$/.test(jodi)) values.set(dateKey(addDays(start, offset)), { jodi });
    }
  }
  return values;
}

function weekdayDigit(date) {
  const day = date.getUTCDay();
  return day === 0 ? "7" : String(day);
}

function reverseWeekdayDigit(date) {
  const day = date.getUTCDay();
  return day === 0 ? "1" : String(8 - day);
}

function oldCutSkip(values, date, lastWeek) {
  const scheduled = weekdayDigit(date);
  const skip = [...new Set(lastWeek.jodi.split(""))];
  const cut = String((10 - Number(scheduled)) % 10);
  for (const candidate of [lastWeek.jodi.includes(scheduled) ? cut : scheduled, scheduled, ...digits]) {
    if (!skip.includes(candidate)) skip.push(candidate);
    if (skip.length === 3) break;
  }
  return skip;
}

function backwardOpenSkip(values, date, lastWeek) {
  const scheduled = weekdayDigit(date);
  const skip = [...new Set(lastWeek.jodi.split(""))];
  if (!skip.includes(scheduled)) skip.push(scheduled);

  // A repeated weekday digit is replaced by older same-day open digits.
  for (let weeksBack = 2; skip.length < 3 && weeksBack <= 12; weeksBack++) {
    const older = values.get(dateKey(addDays(date, -7 * weeksBack)));
    const candidate = older?.jodi?.[0];
    if (candidate && !skip.includes(candidate)) skip.push(candidate);
  }
  for (const candidate of digits) {
    if (skip.length === 3) break;
    if (!skip.includes(candidate)) skip.push(candidate);
  }
  return skip;
}

function reverseBackwardOpenSkip(values, date, lastWeek) {
  const scheduled = reverseWeekdayDigit(date);
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
  return skip;
}

function buildRows(values, skipBuilder) {
  const rows = [];
  for (const [key, current] of [...values.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const date = new Date(`${key}T00:00:00Z`);
    const lastWeek = values.get(dateKey(addDays(date, -7)));
    if (!lastWeek) continue;
    const skip = skipBuilder(values, date, lastWeek);
    const hit = current.jodi[0] !== current.jodi[1]
      && !skip.includes(current.jodi[0])
      && !skip.includes(current.jodi[1]);
    rows.push({ key, actual: current.jodi, lastWeek: lastWeek.jodi, weekdayDigit: weekdayDigit(date), skip, hit });
  }
  return rows;
}

function summary(rows) {
  const tests = rows.length;
  const hits = rows.filter((row) => row.hit).length;
  return {
    tests,
    hits,
    successRate: tests ? Number((hits * 100 / tests).toFixed(2)) : 0,
    stake: tests * 420,
    returns: hits * 950,
    profit: hits * 950 - tests * 420,
    from: rows[0]?.key,
    to: rows.at(-1)?.key
  };
}

function report(rows) {
  return {
    last30: summary(rows.slice(-30)),
    last60: summary(rows.slice(-60)),
    last90: summary(rows.slice(-90)),
    allTime: summary(rows)
  };
}

const values = parseFresh();
const oldRows = buildRows(values, oldCutSkip);
const newRows = buildRows(values, backwardOpenSkip);
const reverseRows = buildRows(values, reverseBackwardOpenSkip);
const duplicateCases = newRows.filter((row) => row.lastWeek.includes(row.weekdayDigit));

console.log(JSON.stringify({
  market: "Mahadevi",
  assumptions: { betPerJodi: 10, playedJodis: 42, dailyStake: 420, hitReturn: 950 },
  rule: "Previous-week jodi digits + weekday digit; when weekday digit repeats, fill third unique skip from 2-week/3-week older same-day open digit",
  oldCutRule: report(oldRows),
  newBackwardOpenRule: report(newRows),
  reverseBackwardOpenRule: report(reverseRows),
  repeatedWeekdayCases: {
    count: duplicateCases.length,
    last30Count: newRows.slice(-30).filter((row) => row.lastWeek.includes(row.weekdayDigit)).length,
    latestExamples: duplicateCases.slice(-8)
  }
}, null, 2));
