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

function fill3(items) {
  const out = [];
  for (const digit of [...items, ...digits]) if (out.length < 3 && !out.includes(digit)) out.push(digit);
  return out;
}

function make42(selected) {
  const jodis = [];
  for (const open of selected) for (const close of selected) if (open !== close) jodis.push(open + close);
  return jodis;
}

function trendOrder(history, allowed, hot = true) {
  const stats = Object.fromEntries(digits.map((digit) => [digit, { count: 0, last: -1 }]));
  history.forEach((jodi, index) => {
    for (const digit of jodi) {
      stats[digit].count += 1;
      stats[digit].last = index;
    }
  });
  return [...allowed].sort((a, b) => {
    if (stats[a].count !== stats[b].count) return hot ? stats[b].count - stats[a].count : stats[a].count - stats[b].count;
    if (stats[a].last !== stats[b].last) return stats[b].last - stats[a].last;
    return Number(a) - Number(b);
  });
}

function combinations(values, count) {
  const out = [];
  function visit(start, picked) {
    if (picked.length === count) { out.push([...picked]); return; }
    for (let index = start; index <= values.length - (count - picked.length); index++) {
      picked.push(values[index]);
      visit(index + 1, picked);
      picked.pop();
    }
  }
  visit(0, []);
  return out;
}

function buildPairOptimized(windowSize, bothWeight, newOnlyWeight) {
  const rows = [];
  for (let index = 0; index < dated.length; index++) {
    const [dateKey, actual] = dated[index];
    const date = new Date(`${dateKey}T00:00:00Z`);
    const previousDay = values.get(key(add(date, -1)));
    const twoDayPrevious = values.get(key(add(date, -2)));
    if (!/^\d{2}$/.test(previousDay || "") || !/^\d{2}$/.test(twoDayPrevious || "") || index < windowSize) continue;

    const oldSkip = fill3([previousDay[0], previousDay[1], twoDayPrevious[0]]);
    const oldSelected = digits.filter((digit) => !oldSkip.includes(digit));
    const history = dated.slice(index - windowSize, index).map(([, jodi]) => jodi);
    const candidates = combinations(oldSelected, 4).map((overlap4) => {
      const secondSelected = [...oldSkip, ...overlap4];
      let score = 0;
      history.forEach((jodi, historyIndex) => {
        if (jodi[0] === jodi[1]) return;
        const oldProxy = oldSelected.includes(jodi[0]) && oldSelected.includes(jodi[1]);
        const secondProxy = secondSelected.includes(jodi[0]) && secondSelected.includes(jodi[1]);
        if (!secondProxy) return;
        const recency = 1 + historyIndex / Math.max(1, history.length);
        score += recency * (oldProxy ? bothWeight : newOnlyWeight);
      });
      return { overlap4, secondSelected, score };
    }).sort((a, b) => b.score - a.score || a.secondSelected.join("").localeCompare(b.secondSelected.join("")));

    const secondSelected = candidates[0].secondSelected;
    const oldJodis = make42(oldSelected);
    const secondJodis = make42(secondSelected);
    const oldHit = oldJodis.includes(actual);
    const secondHit = secondJodis.includes(actual);
    const overlapJodis = oldJodis.filter((jodi) => secondJodis.includes(jodi)).length;
    rows.push({ dateKey, actual, oldSkip, oldSelected, secondSelected, oldJodis, secondJodis, oldHit, secondHit, overlapJodis });
  }
  return rows;
}

const dated = [...values.entries()].sort(([a], [b]) => a.localeCompare(b));

function build(windowSize, hot = true) {
  const rows = [];
  for (let index = 0; index < dated.length; index++) {
    const [dateKey, actual] = dated[index];
    const date = new Date(`${dateKey}T00:00:00Z`);
    const previousDay = values.get(key(add(date, -1)));
    const twoDayPrevious = values.get(key(add(date, -2)));
    if (!/^\d{2}$/.test(previousDay || "") || !/^\d{2}$/.test(twoDayPrevious || "") || index < windowSize) continue;

    const oldSkip = fill3([previousDay[0], previousDay[1], twoDayPrevious[0]]);
    const oldSelected = digits.filter((digit) => !oldSkip.includes(digit));
    const history = dated.slice(index - windowSize, index).map(([, jodi]) => jodi);
    const overlap4 = trendOrder(history, oldSelected, hot).slice(0, 4);
    const secondSelected = [...oldSkip, ...overlap4];
    const oldJodis = make42(oldSelected);
    const secondJodis = make42(secondSelected);
    const oldHit = oldJodis.includes(actual);
    const secondHit = secondJodis.includes(actual);
    const overlapJodis = oldJodis.filter((jodi) => secondJodis.includes(jodi)).length;
    rows.push({ dateKey, actual, oldSkip, oldSelected, secondSelected, oldJodis, secondJodis, oldHit, secondHit, overlapJodis });
  }
  return rows;
}

function summarize(rows) {
  let both = 0, oldOnly = 0, secondOnly = 0, bothMiss = 0, stake = 0, returned = 0, positiveDays = 0, maxMissStreak = 0, missStreak = 0;
  for (const row of rows) {
    if (row.oldHit && row.secondHit) both += 1;
    else if (row.oldHit) oldOnly += 1;
    else if (row.secondHit) secondOnly += 1;
    else bothMiss += 1;
    const dayStake = (row.oldJodis.length + row.secondJodis.length) * 5;
    const dayReturn = (Number(row.oldHit) + Number(row.secondHit)) * 475;
    stake += dayStake;
    returned += dayReturn;
    if (dayReturn > dayStake) positiveDays += 1;
    if (!row.oldHit && !row.secondHit) { missStreak += 1; maxMissStreak = Math.max(maxMissStreak, missStreak); } else missStreak = 0;
  }
  return {
    tests: rows.length, both, oldOnly, secondOnly, bothMiss,
    covered: both + oldOnly + secondOnly,
    coverageRate: rows.length ? (both + oldOnly + secondOnly) * 100 / rows.length : 0,
    onePassRate: rows.length ? (oldOnly + secondOnly) * 100 / rows.length : 0,
    averageTotalBets: rows.length ? rows.reduce((sum, row) => sum + row.oldJodis.length + row.secondJodis.length, 0) / rows.length : 0,
    averageDuplicateJodis: rows.length ? rows.reduce((sum, row) => sum + row.overlapJodis, 0) / rows.length : 0,
    positiveDays, negativeDays: rows.length - positiveDays, maxMissStreak,
    stake, returned, profit: returned - stake,
    from: rows[0]?.dateKey, to: rows.at(-1)?.dateKey
  };
}

const variants = {};
for (const windowSize of [7, 14, 30]) {
  for (const hot of [true, false]) {
    const name = `${hot ? "hot" : "cold"}${windowSize}`;
    const rows = build(windowSize, hot);
    variants[name] = { latest30: summarize(rows.slice(-30)), allTime: summarize(rows) };
  }
}

for (const windowSize of [7, 14, 30, 60, 90]) {
  for (const [label, bothWeight, newOnlyWeight] of [
    ["balanced", 1, 1], ["both2", 2, 1], ["both3", 3, 1],
    ["new2", 1, 2], ["new3", 1, 3], ["cover", 0, 1]
  ]) {
    const rows = buildPairOptimized(windowSize, bothWeight, newOnlyWeight);
    variants[`pair_${label}_${windowSize}`] = { latest30: summarize(rows.slice(-30)), allTime: summarize(rows) };
  }
}

console.log(JSON.stringify(variants, null, 2));
