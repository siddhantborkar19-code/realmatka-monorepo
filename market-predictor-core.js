const allDigits = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];
const market = window.PREDICTOR_MARKET;
const app = document.getElementById("app");
const defaultInputs = {
  lastWeek: "29",
  prevWeek: "82",
  thirdWeek: "44",
  previousDay: "02",
  twoDayPrevious: "59",
  threeDayPrevious: "40"
};

function normalizeJodi(value) {
  const digits = String(value || "").replace(/\D/g, "").slice(0, 2);
  return digits.length === 1 ? `0${digits}` : digits;
}

function isValidJodi(value) {
  return /^\d{2}$/.test(value);
}

function uniqueSorted(values) {
  return [...new Set(values)].sort((a, b) => Number(a) - Number(b));
}

function uniqueInOrder(values) {
  const result = [];
  values.forEach((value) => {
    if (value !== "" && value !== undefined && !result.includes(value)) {
      result.push(value);
    }
  });
  return result;
}

function formatRupees(value) {
  return `Rs ${Number(value || 0).toLocaleString("en-IN")}`;
}

function fillSkipDigitsFromRules(primaryDigits, fallbackDigits) {
  const skip = uniqueInOrder(primaryDigits);
  fallbackDigits.forEach((digit) => {
    if (skip.length < 3 && !skip.includes(digit)) skip.push(digit);
  });
  allDigits.forEach((digit) => {
    if (skip.length < 3 && !skip.includes(digit)) skip.push(digit);
  });
  return uniqueSorted(skip.slice(0, 3));
}

function frequencyOrder(values, hot) {
  const counts = Object.fromEntries(allDigits.map((digit) => [digit, 0]));
  values.forEach((digit) => {
    if (counts[digit] !== undefined) counts[digit] += 1;
  });
  return [...allDigits].sort((a, b) => {
    if (counts[a] !== counts[b]) return hot ? counts[b] - counts[a] : counts[a] - counts[b];
    return Number(a) - Number(b);
  });
}

function getSkipByStrategy(strategy, side, inputs) {
  const { lastWeek, prevWeek, thirdWeek, previousDay, twoDayPrevious, threeDayPrevious } = inputs;
  const previousRows = [
    { open: lastWeek[0], close: lastWeek[1] },
    { open: prevWeek[0], close: prevWeek[1] },
    { open: thirdWeek[0], close: thirdWeek[1] }
  ];
  const allPreviousDigits = previousRows.flatMap((row) => [row.open, row.close]);
  const sameSideDigits = previousRows.map((row) => row[side]);
  const hotAll = frequencyOrder(allPreviousDigits, true);
  const coldAll = frequencyOrder(allPreviousDigits, false);
  const hotSide = frequencyOrder(sameSideDigits, true);
  const coldSide = frequencyOrder(sameSideDigits, false);

  switch (strategy) {
    case "open_week_2d_3d":
      return fillSkipDigitsFromRules([lastWeek[0], twoDayPrevious[0], threeDayPrevious[0]], []);
    case "mahadevi_optimized":
      return fillSkipDigitsFromRules([thirdWeek[1], twoDayPrevious[1], threeDayPrevious[0]], []);
    case "mahadevi_morning_optimized":
      return fillSkipDigitsFromRules([twoDayPrevious[0], twoDayPrevious[1], threeDayPrevious[1]], []);
    case "sita_day_optimized":
      return fillSkipDigitsFromRules([previousDay[0], previousDay[1], twoDayPrevious[0]], []);
    case "andhra_night_optimized":
      return fillSkipDigitsFromRules([lastWeek[0], prevWeek[0], prevWeek[1]], []);
    case "andhra_morning_optimized":
      return fillSkipDigitsFromRules([twoDayPrevious[0], threeDayPrevious[0], threeDayPrevious[1]], []);
    case "andhra_day_optimized":
      return fillSkipDigitsFromRules([lastWeek[1], previousDay[0], threeDayPrevious[0]], []);
    case "ntr_day_optimized":
      return fillSkipDigitsFromRules([lastWeek[1], prevWeek[1], previousDay[1]], []);
    case "mangal_bazar_optimized":
      return fillSkipDigitsFromRules([prevWeek[1], previousDay[0], threeDayPrevious[1]], []);
    case "madhur_day_optimized":
      return fillSkipDigitsFromRules([lastWeek[1], prevWeek[0], twoDayPrevious[1]], []);
    case "sita_night_optimized":
      return fillSkipDigitsFromRules([lastWeek[1], previousDay[0], twoDayPrevious[1]], []);
    case "milan_night_combo":
      return fillSkipDigitsFromRules([thirdWeek[0], twoDayPrevious[0], threeDayPrevious[1]], []);
    case "ntr_morning_combo":
      return fillSkipDigitsFromRules([lastWeek[0], lastWeek[1], twoDayPrevious[1]], []);
    case "star_tara_night_combo":
      return fillSkipDigitsFromRules([lastWeek[0], thirdWeek[1], previousDay[1]], []);
    case "maya_bazar_combo":
      return fillSkipDigitsFromRules([prevWeek[1], previousDay[0], twoDayPrevious[1]], []);
    case "prev_day_jodi_skip":
      return fillSkipDigitsFromRules([lastWeek[0], lastWeek[1], previousDay[0], previousDay[1]], [prevWeek[0], prevWeek[1], thirdWeek[0], thirdWeek[1]]);
    case "prev_week_prev_day_close":
      return fillSkipDigitsFromRules([lastWeek[0], lastWeek[1], previousDay[1]], [previousDay[0], prevWeek[0], prevWeek[1], thirdWeek[0], thirdWeek[1]]);
    case "last_jodi_plus_p2close":
      return fillSkipDigitsFromRules([lastWeek[0], lastWeek[1], prevWeek[1]], [prevWeek[0], thirdWeek[0], thirdWeek[1]]);
    case "last3_unique_order":
      return fillSkipDigitsFromRules(allPreviousDigits, hotAll);
    case "last_jodi_plus_freq":
      return fillSkipDigitsFromRules([lastWeek[0], lastWeek[1]], hotAll);
    case "last_jodi_plus_same_side_freq":
      return fillSkipDigitsFromRules([lastWeek[0], lastWeek[1]], hotSide);
    case "freq_all_hot":
      return fillSkipDigitsFromRules(hotAll, []);
    case "freq_all_cold":
      return fillSkipDigitsFromRules(coldAll, []);
    case "same_side_hot":
      return fillSkipDigitsFromRules(hotSide, []);
    case "same_side_cold":
      return fillSkipDigitsFromRules(coldSide, []);
    default:
      return fillSkipDigitsFromRules([lastWeek[0], lastWeek[1], prevWeek[1]], [prevWeek[0], thirdWeek[0], thirdWeek[1]]);
  }
}

function buildPrediction(inputs) {
  const openSkip = getSkipByStrategy(market.openStrategy, "open", inputs);
  const closeSkip = getSkipByStrategy(market.closeStrategy, "close", inputs);
  const openSelected = allDigits.filter((digit) => !openSkip.includes(digit)).slice(0, 7);
  const closeSelected = allDigits.filter((digit) => !closeSkip.includes(digit)).slice(0, 7);
  const jodis = [];
  openSelected.forEach((openDigit) => {
    closeSelected.forEach((closeDigit) => {
      if (openDigit !== closeDigit) jodis.push(`${openDigit}${closeDigit}`);
    });
  });
  const maxJodiCount = Number(market.maxJodiCount || 0);
  const finalJodis = maxJodiCount > 0 ? jodis.slice(0, maxJodiCount) : jodis;
  return { openSkip, closeSkip, openSelected, closeSelected, jodis: finalJodis };
}

function readInputs() {
  const inputs = {};
  document.querySelectorAll("input[data-field]").forEach((input) => {
    const value = normalizeJodi(input.value);
    input.value = value;
    inputs[input.dataset.field] = value;
  });
  return inputs;
}

function renderChips(target, values, className) {
  target.innerHTML = "";
  values.forEach((value) => {
    const chip = document.createElement("div");
    chip.className = `chip ${className || ""}`;
    chip.textContent = value;
    target.appendChild(chip);
  });
}

function renderJodis(target, jodis) {
  target.innerHTML = "";
  jodis.forEach((jodi) => {
    const item = document.createElement("div");
    item.className = "jodi";
    item.textContent = jodi;
    target.appendChild(item);
  });
}

function generate() {
  const inputs = readInputs();
  const error = document.getElementById("error");
  if (!Object.values(inputs).every(isValidJodi)) {
    error.textContent = "Sabhi jodi 2 digit me daalo.";
    error.style.display = "block";
    return;
  }
  error.textContent = "";
  error.style.display = "none";

  const prediction = buildPrediction(inputs);
  window.latestJodis = prediction.jodis;

  document.getElementById("openSkipText").textContent = prediction.openSkip.join(", ");
  document.getElementById("openSelectedText").textContent = prediction.openSelected.join(", ");
  document.getElementById("closeSkipText").textContent = prediction.closeSkip.join(", ");
  document.getElementById("closeSelectedText").textContent = prediction.closeSelected.join(", ");
  document.getElementById("jodiCountText").textContent = String(prediction.jodis.length);
  document.getElementById("betAmountText").textContent = `Rs ${prediction.jodis.length * 10}`;
  renderChips(document.getElementById("openSkipChips"), prediction.openSkip, "skip");
  renderChips(document.getElementById("openSelectedChips"), prediction.openSelected, "");
  renderChips(document.getElementById("closeSkipChips"), prediction.closeSkip, "skip");
  renderChips(document.getElementById("closeSelectedChips"), prediction.closeSelected, "");
  renderJodis(document.getElementById("jodiGrid"), prediction.jodis);

  document.getElementById("logicText").innerHTML = [
    `Market: <strong>${market.name}</strong>.`,
    `Best trick: <strong>${market.trick}</strong>.`,
    `Last 30 backtest: <strong>${market.hit}/${market.total}</strong>, success <strong>${market.rate.toFixed(2)}%</strong>, profit <strong>${formatRupees(market.profit)}</strong>.`,
    `Open strategy: <strong>${market.openStrategy}</strong>. Close strategy: <strong>${market.closeStrategy}</strong>.`,
    `Open 7 x Close 7 = 49 possible jodi. Same digit wali double jodi skip karke final <strong>${prediction.jodis.length}</strong> jodi.`
  ].join("<br>");
}

function renderApp() {
  document.title = `${market.name} Predictor`;
  app.innerHTML = `
    <main class="shell">
      <section class="hero">
        <h1>${market.name} Prediction</h1>
        <p>Ye page sirf ${market.name} ke liye hai. Is market ka apna tested logic yahan fixed hai.</p>
      </section>
      <section class="panel">
        <div class="top-row">
          <h2>${market.name} Predictor</h2>
          <a class="secondary-link" href="jodi-predictor.html">All Predictors</a>
        </div>
        <div class="note">${market.trick}. Last 30: ${market.hit}/${market.total}, success ${market.rate.toFixed(2)}%, profit ${formatRupees(market.profit)}.</div>
        <div class="grid" style="margin-top: 14px;">
          ${[
            ["lastWeek", "Last Week Jodi"],
            ["prevWeek", "Uske Pichle Week Jodi"],
            ["thirdWeek", "Usse Bhi Pichle Week Jodi"],
            ["previousDay", "Previous Day Jodi"],
            ["twoDayPrevious", "2 Day Previous Jodi"],
            ["threeDayPrevious", "3 Day Previous Jodi"]
          ].map(([field, label]) => `
            <div>
              <label>${label}</label>
              <input data-field="${field}" inputmode="numeric" maxlength="2" value="${defaultInputs[field]}" />
            </div>
          `).join("")}
        </div>
        <button id="generate" type="button" style="margin-top: 14px;">Generate ${market.name}</button>
        <div id="error" class="error"></div>
        <div class="summary stats">
          <div class="box"><span>Market Strength</span><strong>${market.strength}</strong></div>
          <div class="box"><span>Last 30 Hit</span><strong>${market.hit}/${market.total}</strong></div>
          <div class="box"><span>Success Rate</span><strong>${market.rate.toFixed(2)}%</strong></div>
          <div class="box"><span>Backtest Profit</span><strong>${formatRupees(market.profit)}</strong></div>
        </div>
        <div class="summary">
          <div class="box"><span>Open Skip</span><strong id="openSkipText">-</strong><div id="openSkipChips" class="chips"></div></div>
          <div class="box"><span>Open 7 Digits</span><strong id="openSelectedText">-</strong><div id="openSelectedChips" class="chips"></div></div>
          <div class="box"><span>Close Skip</span><strong id="closeSkipText">-</strong><div id="closeSkipChips" class="chips"></div></div>
          <div class="box"><span>Close 7 Digits</span><strong id="closeSelectedText">-</strong><div id="closeSelectedChips" class="chips"></div></div>
          <div class="box"><span>Total Jodi</span><strong id="jodiCountText">-</strong></div>
          <div class="box"><span>Bet Amount @ Rs 10</span><strong id="betAmountText">-</strong></div>
        </div>
        <div class="logic" id="logicText">Generate par click karo.</div>
        <div class="top-row">
          <h2>Final ${market.name} Jodi</h2>
          <button class="copy" id="copyBtn" type="button">Copy</button>
        </div>
        <div id="jodiGrid" class="jodi-grid"></div>
      </section>
    </main>
  `;
  document.getElementById("generate").addEventListener("click", generate);
  document.getElementById("copyBtn").addEventListener("click", () => {
    if (!window.latestJodis?.length) generate();
    navigator.clipboard?.writeText((window.latestJodis || []).join("\n")).then(() => {
      const button = document.getElementById("copyBtn");
      button.textContent = "Copied";
      setTimeout(() => {
        button.textContent = "Copy";
      }, 1000);
    });
  });
  document.querySelectorAll("input[data-field]").forEach((input) => {
    input.addEventListener("input", () => {
      input.value = input.value.replace(/\D/g, "").slice(0, 2);
    });
  });
  generate();
}

renderApp();
