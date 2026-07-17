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

const featureDefs = [
  ["pd_o", -1, 0], ["pd_c", -1, 1], ["p2d_o", -2, 0], ["p2d_c", -2, 1],
  ["p3d_o", -3, 0], ["p3d_c", -3, 1], ["p4d_o", -4, 0], ["p4d_c", -4, 1],
  ["lw_o", -7, 0], ["lw_c", -7, 1], ["p2w_o", -14, 0], ["p2w_c", -14, 1],
  ["p3w_o", -21, 0], ["p3w_c", -21, 1], ["p4w_o", -28, 0], ["p4w_c", -28, 1]
];
const fallbackNames = featureDefs.map(([name]) => name);

const dated = [...values.entries()].sort(([a], [b]) => a.localeCompare(b));
const records = [];
for (const [dateKey, actual] of dated) {
  const date = new Date(`${dateKey}T00:00:00Z`);
  const features = {};
  let valid = true;
  for (const [name, days, side] of featureDefs) {
    const jodi = values.get(key(add(date, days)));
    if (!/^\d{2}$/.test(jodi || "")) { valid = false; break; }
    features[name] = jodi[side];
  }
  if (valid) records.push({ dateKey, actual, features });
}

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

const rules = combinations(featureDefs.map(([name]) => name), 3);

function predict(record, rule) {
  const skip = [];
  for (const name of [...rule, ...fallbackNames, ...digits]) {
    const digit = record.features[name] ?? name;
    if (skip.length < 3 && !skip.includes(digit)) skip.push(digit);
  }
  return !skip.includes(record.actual[0]) && !skip.includes(record.actual[1]) && record.actual[0] !== record.actual[1];
}

function score(rows, rule) {
  const hits = rows.filter((record) => predict(record, rule)).length;
  return { tests: rows.length, hits, rate: rows.length ? hits * 100 / rows.length : 0, profit: hits * 950 - rows.length * 420 };
}

const test = records.slice(-30);
const training = records.slice(0, -30);

function selectRule(trainingRows) {
  return rules.map((rule) => ({ rule, ...score(trainingRows, rule) }))
    .sort((a, b) => b.profit - a.profit || b.hits - a.hits || a.rule.join("+").localeCompare(b.rule.join("+")))[0];
}

const selections = {};
for (const windowSize of [90, 180, 365, training.length]) {
  const trainRows = training.slice(-Math.min(windowSize, training.length));
  const selected = selectRule(trainRows);
  selections[`train${windowSize}`] = { selected, test: score(test, selected.rule) };
}

let walkHits = 0;
const walkRows = [];
for (let index = records.length - 30; index < records.length; index++) {
  const trainRows = records.slice(Math.max(0, index - 180), index);
  const selected = selectRule(trainRows);
  const hit = predict(records[index], selected.rule);
  walkHits += hit ? 1 : 0;
  walkRows.push({ date: records[index].dateKey, rule: selected.rule, hit });
}
const walkForward = { tests: 30, hits: walkHits, rate: walkHits * 100 / 30, profit: walkHits * 950 - 30 * 420 };

function weekdayOf(record) {
  return new Date(`${record.dateKey}T00:00:00Z`).getUTCDay();
}

function weekdayTest(trainRows) {
  const selectedByDay = {};
  for (let day = 0; day < 7; day++) {
    const sameDay = trainRows.filter((record) => weekdayOf(record) === day);
    selectedByDay[day] = selectRule(sameDay);
  }
  let hits = 0;
  const details = test.map((record) => {
    const selected = selectedByDay[weekdayOf(record)];
    const hit = predict(record, selected.rule);
    hits += hit ? 1 : 0;
    return { date: record.dateKey, weekday: weekdayOf(record), rule: selected.rule, hit };
  });
  return { tests: test.length, hits, rate: hits * 100 / test.length, profit: hits * 950 - test.length * 420, selectedByDay, details };
}

const weekdayAll = weekdayTest(training);
const weekday180 = weekdayTest(training.slice(-180));

const testOracle = rules.map((rule) => ({ rule, ...score(test, rule) }))
  .sort((a, b) => b.profit - a.profit || a.rule.join("+").localeCompare(b.rule.join("+")))[0];

console.log(JSON.stringify({ featureCount: featureDefs.length, ruleCount: rules.length, testFrom: test[0]?.dateKey, testTo: test.at(-1)?.dateKey, selections, walkForward, walkRows, weekdayAll, weekday180, testOracle }, null, 2));
