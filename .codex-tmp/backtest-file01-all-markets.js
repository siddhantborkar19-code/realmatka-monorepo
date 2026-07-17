const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const freshDir = path.join(root, "fresh-data");
const digits = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

const markets = [
  ["NTR Night", "PNTR NIGHT PANEL CHART RECORD MATKA BAZAR.html", "7"],
  ["Mangal Bazar", "MANGAL BAZAR PANEL CHART RECORD MATKA BAZAR.html", "3"],
  ["Andhra Night", "Andhra Night Panel Chart Record _ Satta Matka Live Records.html", "8"],
  ["NTR Day", "NTR DAY PANEL CHART RECORD MATKA BAZAR.html", "5"],
  ["Rajdhani Day", "Rajdhani Day Panel Chart Records _ Rajdhani Day Panel.html", "6"],
  ["Star Tara Night", "STAR TARA NIGHT PANEL CHART RECORD MATKA BAZAR.html", "7"],
  ["Mahadevi Morning", "Mahadevi Morning Panel Chart _ Matka Bazar Panel.html", "0"],
  ["Andhra Morning", "Andhra Morning Panel Chart Record _ Dpboss Chart History.html", "8"],
  ["Andhra Day", "Andhra Day Panel Chart Record - Satta Matka Charts by Dpboss.com.html", "3"],
  ["Milan Night", "Milan Night Panel Chart _ Night Milan Panel Record.html", "2"],
  ["Milan Day", "Milan Day Panel Chart _ Milan Day Panel Record.html", "0"],
  ["Star Tara Morning", "STAR TARA MORNING PANEL CHART RECORD MATKA BAZAR.html", "6"],
  ["NTR Morning", "NTR MORNING PANEL CHART RECORD MATKA BAZAR.html", "9"],
  ["Sridevi Night", "Sridevi Night Panel Chart _ Satta Matka Panel Live.html", "6"],
  ["Mahadevi", "Mahadevi Panel Chart _ Online Matka Panel Result.html", "3"],
  ["Sridevi", "Sridevi Panel Chart _ Live Panel Patta Result.html", "2"],
  ["SITA Night", "Sita Night Panel Chart Record _ Online Panel Result.html", "7"],
  ["Time Bazar", "Time Bazar Panel Chart _ Live Matka Panel Record.html", "0"],
  ["SITA Morning", "Sita Morning Panel Chart Record _ Live Panel Patti.html", "6"],
  ["Milan Morning", "Milan Morning Panel Chart _ Milan Morning Panel Record.html", "0"],
  ["SITA Day", "Sita Day Panel Chart _ Matka Bazar Panel Record.html", "2"]
];

const clean = (value) => String(value).replace(/<br\s*\/?\s*>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/\s+/g, " ").trim();
const dateKey = (date) => date.toISOString().slice(0, 10);
const addDays = (date, days) => new Date(date.getTime() + days * 86400000);

function parseMarket(fileName) {
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

function buildPrediction(lastWeek, prevWeek, fixedCloseSkip) {
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

  const closeSkip = [];
  for (const digit of [lastWeek[0], lastWeek[1], fixedCloseSkip, prevWeek[1], prevWeek[0], ...digits]) {
    if (closeSkip.length < 3 && !closeSkip.includes(digit)) closeSkip.push(digit);
  }
  const closeSelected = digits.filter((digit) => !closeSkip.includes(digit)).slice(0, 7);
  const jodis = [];
  for (const open of openSelected) for (const close of closeSelected) if (open !== close) jodis.push(open + close);
  return jodis;
}

function runMarket(name, fileName, fixedCloseSkip) {
  const values = parseMarket(fileName);
  const tests = [];
  for (const [key, actual] of [...values.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const date = new Date(`${key}T00:00:00Z`);
    const lastWeek = values.get(dateKey(addDays(date, -7)));
    const prevWeek = values.get(dateKey(addDays(date, -14)));
    if (!/^\d{2}$/.test(lastWeek || "") || !/^\d{2}$/.test(prevWeek || "")) continue;
    const jodis = buildPrediction(lastWeek, prevWeek, fixedCloseSkip);
    tests.push({ key, actual, jodis, hit: jodis.includes(actual) });
  }
  const rows = tests.slice(-30);
  const hits = rows.filter((row) => row.hit).length;
  const stake = rows.reduce((sum, row) => sum + row.jodis.length * 10, 0);
  return {
    market: name,
    fixedCloseSkip,
    tests: rows.length,
    hits,
    misses: rows.length - hits,
    rate: rows.length ? hits * 100 / rows.length : 0,
    averageJodis: rows.length ? stake / 10 / rows.length : 0,
    stake,
    returnAmount: hits * 1000,
    profit: hits * 1000 - stake,
    from: rows[0]?.key,
    to: rows.at(-1)?.key
  };
}

const results = markets.map((market) => runMarket(...market));
const total = results.reduce((sum, row) => {
  sum.tests += row.tests; sum.hits += row.hits; sum.stake += row.stake; sum.returnAmount += row.returnAmount; sum.profit += row.profit;
  return sum;
}, { tests: 0, hits: 0, stake: 0, returnAmount: 0, profit: 0 });
total.rate = total.tests ? total.hits * 100 / total.tests : 0;

console.log(JSON.stringify({ results, total }, null, 2));
