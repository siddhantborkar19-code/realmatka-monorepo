const fs = require("fs");
const path = require("path");

const freshDir = path.resolve(__dirname, "..", "fresh-data");
const files = {
  morning: "NTR MORNING PANEL CHART RECORD MATKA BAZAR.html",
  night: "NTR DAY PANEL CHART RECORD MATKA BAZAR.html"
};
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
const night = parse(files.night);
const rows = [];
for (const [dateKey, morningJodi] of [...morning.entries()].sort(([a], [b]) => a.localeCompare(b))) {
  const date = new Date(`${dateKey}T00:00:00Z`);
  const previousNight = night.get(key(add(date, -1)));
  if (!/^\d{2}$/.test(previousNight || "")) continue;
  const nightClose = previousNight[1];
  const nightDigits = [...new Set(previousNight)];
  const morningDigits = [...new Set(morningJodi)];
  const commonDigits = nightDigits.filter((digit) => morningDigits.includes(digit));
  rows.push({
    dateKey, previousNight, nightClose, morningJodi,
    openMatch: morningJodi[0] === nightClose,
    closeMatch: morningJodi[1] === nightClose,
    eitherMatch: morningJodi.includes(nightClose),
    commonCount: commonDigits.length,
    anyNightDigitRepeat: commonDigits.length > 0,
    bothDistinctNightDigitsRepeat: nightDigits.length === 2 && commonDigits.length === 2
  });
}

function summarize(count) {
  const sample = rows.slice(-count);
  const open = sample.filter((row) => row.openMatch).length;
  const close = sample.filter((row) => row.closeMatch).length;
  const either = sample.filter((row) => row.eitherMatch).length;
  return {
    requested: count, tests: sample.length, open, openRate: open * 100 / sample.length,
    close, closeRate: close * 100 / sample.length,
    either, eitherRate: either * 100 / sample.length,
    neither: sample.length - either,
    from: sample[0]?.dateKey, to: sample.at(-1)?.dateKey
  };
}

function summarizeBothDigits(count) {
  const sample = rows.slice(-count);
  const none = sample.filter((row) => row.commonCount === 0).length;
  const one = sample.filter((row) => row.commonCount === 1).length;
  const both = sample.filter((row) => row.bothDistinctNightDigitsRepeat).length;
  const any = sample.length - none;
  return {
    requested: count, tests: sample.length,
    none, noneRate: none * 100 / sample.length,
    any, anyRate: any * 100 / sample.length,
    one, oneRate: one * 100 / sample.length,
    both, bothRate: both * 100 / sample.length,
    from: sample[0]?.dateKey, to: sample.at(-1)?.dateKey
  };
}

console.log(JSON.stringify({
  closeDigit: { last30: summarize(30), last60: summarize(60), last90: summarize(90) },
  fullNightJodiDigits: { last30: summarizeBothDigits(30), last60: summarizeBothDigits(60), last90: summarizeBothDigits(90) }
}, null, 2));
