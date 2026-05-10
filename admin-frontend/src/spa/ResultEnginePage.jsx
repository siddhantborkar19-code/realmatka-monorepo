import React from "react";

export function ResultEnginePage({ LegacyResultsComponent, apiBase, token }) {
  return <LegacyResultsComponent apiBase={apiBase} token={token} mode="results" />;
}

export function AllChartPage({ LegacyResultsComponent, apiBase, token }) {
  return <LegacyResultsComponent apiBase={apiBase} token={token} mode="charts" />;
}

function parseClockTimeToMinutes(value) {
  const match = String(value || "").trim().match(/^(\d{1,2}):(\d{2})\s*([AP]M)$/i);
  if (!match) {
    return Number.MAX_SAFE_INTEGER;
  }

  let hours = Number(match[1]) % 12;
  const minutes = Number(match[2]);
  const meridiem = match[3].toUpperCase();
  if (meridiem === "PM") {
    hours += 12;
  }
  return hours * 60 + minutes;
}

function toResultSlots(result) {
  const normalized = String(result || "")
    .toUpperCase()
    .replace(/[^0-9*]/g, "")
    .slice(0, 8);
  const slots = new Array(8).fill("");
  for (let index = 0; index < Math.min(normalized.length, 8); index += 1) {
    slots[index] = normalized[index];
  }
  return slots;
}

export function getAdminCurrentMinutes() {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

function getMarketPhaseMeta(market, currentMinutes) {
  const status = String(market.status || "").toLowerCase();
  const action = String(market.action || "").toLowerCase();
  const isForcedClosed = status.includes("weekly off") || status.includes("closed for today") || action === "closed";
  const openMinutes = parseClockTimeToMinutes(market.open);
  const closeMinutes = parseClockTimeToMinutes(market.close);
  if (isForcedClosed) {
    return { label: status.includes("weekly off") ? "Weekly Off" : "Betting is Closed for Today", sortBucket: 1, anchor: openMinutes, closeAnchor: closeMinutes };
  }

  if (currentMinutes < openMinutes) {
    return { label: "Betting Running Now", sortBucket: 0, anchor: openMinutes, closeAnchor: closeMinutes };
  }
  if (currentMinutes < closeMinutes) {
    return { label: "Betting is Running for Close", sortBucket: 0, anchor: openMinutes, closeAnchor: closeMinutes };
  }
  return { label: "Betting is Closed for Today", sortBucket: 1, anchor: openMinutes, closeAnchor: closeMinutes };
}

export function sortAdminMarketsByTime(markets, currentMinutes) {
  return [...markets].sort((left, right) => {
    const leftMeta = getMarketPhaseMeta(left, currentMinutes);
    const rightMeta = getMarketPhaseMeta(right, currentMinutes);
    if (leftMeta.sortBucket !== rightMeta.sortBucket) {
      return leftMeta.sortBucket - rightMeta.sortBucket;
    }
    const diff = leftMeta.anchor - rightMeta.anchor;
    if (diff !== 0) return diff;
    const closeDiff = leftMeta.closeAnchor - rightMeta.closeAnchor;
    if (closeDiff !== 0) return closeDiff;
    return String(left.name || "").localeCompare(String(right.name || ""));
  });
}

export function AdminMarketPublishList({
  busy,
  currentMinutes,
  marketResultDrafts,
  marketResultInputRefs,
  markets,
  onDraftChange,
  onDraftKeyDown,
  onQuickPublish,
  onSelectMarket,
  selectedSlug
}) {
  const sortedMarkets = sortAdminMarketsByTime(markets, currentMinutes);

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>All Markets Quick Publish</h2>
        <p>User app jaisi time-wise market list ke saath inline result update.</p>
      </div>
      <div className="admin-market-card-list">
        {sortedMarkets.map((market) => {
          const phaseMeta = getMarketPhaseMeta(market, currentMinutes);
          const draftValue = Object.hasOwn(marketResultDrafts, market.slug) ? marketResultDrafts[market.slug] : market.result || "";
          const rowBusy = busy === `quick-${market.slug}`;
          return (
            <article className="admin-market-card" key={market.slug}>
              <div className="admin-market-card-top">
                <div className="admin-market-copy">
                  <span className="admin-market-eyebrow">{market.category || "Games"}</span>
                  <strong>{market.name}</strong>
                  <span className="admin-market-phase">{phaseMeta.label}</span>
                  <span>Open {market.open} | Close {market.close}</span>
                </div>
                <div className="admin-market-result">
                  <strong>{market.result || "***-**-***"}</strong>
                  <span>Current Result</span>
                </div>
              </div>
              <div className="admin-market-entry">
                <div className="result-slot-row admin-market-slot-row">
                  {toResultSlots(draftValue).map((value, index) => (
                    <React.Fragment key={`${market.slug}-slot-${index}`}>
                      {(index === 3 || index === 5) ? <span className="result-slot-separator">-</span> : null}
                      <input
                        ref={(node) => {
                          if (!marketResultInputRefs.current[market.slug]) {
                            marketResultInputRefs.current[market.slug] = [];
                          }
                          marketResultInputRefs.current[market.slug][index] = node;
                        }}
                        className="result-slot-input"
                        inputMode="text"
                        maxLength={1}
                        onChange={(event) => onDraftChange(market.slug, index, event.target.value)}
                        onKeyDown={(event) => onDraftKeyDown(market.slug, index, event)}
                        placeholder="*"
                        value={value}
                      />
                    </React.Fragment>
                  ))}
                </div>
              </div>
              <div className="row-actions admin-market-actions">
                <button className="secondary" onClick={() => onSelectMarket(market.slug)}>
                  {selectedSlug === market.slug ? "Selected" : "Open Editor"}
                </button>
                <button className="primary" disabled={rowBusy} onClick={() => void onQuickPublish(market)}>
                  {rowBusy ? "Publishing..." : "Publish"}
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

export function ResultPublishSettlementSection({
  busy,
  handleResultSlotChange,
  handleResultSlotKeyDown,
  isChartsMode,
  marketForm,
  markets,
  message,
  publishResult,
  resultInputRefs,
  resultSlots,
  resultSummaryCards,
  selectedSlug,
  setMarketForm,
  setSelectedSlug
}) {
  if (isChartsMode) {
    return null;
  }

  return (
    <>
      <section className="panel">
        <div className="result-engine-toolbar">
          <label className="toolbar-field result-market-picker">
            <span>Market</span>
            <select value={selectedSlug} onChange={(event) => setSelectedSlug(event.target.value)}>
              {markets.map((market) => <option key={market.slug} value={market.slug}>{market.name}</option>)}
            </select>
          </label>
          <div className="result-engine-summary-strip">
            {resultSummaryCards}
          </div>
          <button className="primary" disabled={!selectedSlug || busy === "publish"} onClick={() => void publishResult()}>
            {busy === "publish" ? "Publishing..." : "Publish Result"}
          </button>
        </div>
        <div className="result-engine-grid">
          <div className="result-entry-card">
            <div className="panel-head">
              <h2>Result Entry</h2>
              <p>Reset: `***-**-***` | Open: `123-4*-***` | Full: `123-45-678`</p>
            </div>
            <div className="result-slot-row">
              {resultSlots.map((value, index) => (
                <React.Fragment key={`result-slot-${index}`}>
                  {(index === 3 || index === 5) ? <span className="result-slot-separator">-</span> : null}
                  <input
                    ref={(node) => { resultInputRefs.current[index] = node; }}
                    className="result-slot-input"
                    inputMode="text"
                    maxLength={1}
                    onChange={(event) => handleResultSlotChange(index, event.target.value)}
                    onKeyDown={(event) => handleResultSlotKeyDown(index, event)}
                    placeholder="*"
                    value={value}
                  />
                </React.Fragment>
              ))}
            </div>
            <div className="result-market-form">
              <label><span>Status</span><select value={marketForm.status} onChange={(event) => setMarketForm((current) => ({ ...current, status: event.target.value }))}><option value="Active">Active</option><option value="Paused">Paused</option><option value="Closed">Closed</option></select></label>
              <label><span>Action</span><select value={marketForm.action} onChange={(event) => setMarketForm((current) => ({ ...current, action: event.target.value }))}><option value="Open">Open</option><option value="Close Running">Close Running</option><option value="Closed">Closed</option></select></label>
              <label><span>Open Time</span><input value={marketForm.open} onChange={(event) => setMarketForm((current) => ({ ...current, open: event.target.value }))} /></label>
              <label><span>Close Time</span><input value={marketForm.close} onChange={(event) => setMarketForm((current) => ({ ...current, close: event.target.value }))} /></label>
              <label><span>Category</span><select value={marketForm.category} onChange={(event) => setMarketForm((current) => ({ ...current, category: event.target.value }))}><option value="games">Games</option><option value="starline">Starline</option><option value="jackpot">Jackpot</option></select></label>
            </div>
            {message ? <p className={`message ${message.toLowerCase().includes("failed") || message.toLowerCase().includes("error") ? "error" : "success"}`}>{message}</p> : null}
          </div>
        </div>
      </section>
    </>
  );
}

export function buildNextResultFromSlotChange(index, rawValue, resultSlots, fromResultSlots) {
  const value = String(rawValue || "").toUpperCase().replace(/[^0-9*]/g, "").slice(-1);
  const nextSlots = [...resultSlots];
  nextSlots[index] = value;
  return {
    value,
    nextResult: fromResultSlots(nextSlots)
  };
}

export function getResultSlotNavigationTarget(index, key, resultSlots, maxLength) {
  if (key === "Backspace" && !resultSlots[index] && index > 0) {
    return { targetIndex: index - 1, preventDefault: false };
  }
  if (key === "ArrowLeft" && index > 0) {
    return { targetIndex: index - 1, preventDefault: true };
  }
  if (key === "ArrowRight" && index < maxLength - 1) {
    return { targetIndex: index + 1, preventDefault: true };
  }
  return null;
}

export function getEditorValuesFromSelectedCell(chartType, selectedEditorCell, parsePannaEditorCell, normalizeJodiPreviewCell) {
  if (chartType === "jodi") {
    return {
      jodi: normalizeJodiPreviewCell(selectedEditorCell).replace(/-/g, "*")
    };
  }

  const parsed = parsePannaEditorCell(selectedEditorCell);
  return {
    open: parsed.open === "---" ? "---" : parsed.open,
    close: parsed.close === "---" ? "---" : parsed.close
  };
}

export function getBracketMarkEditorValues(chartType) {
  return chartType === "jodi"
    ? { jodi: "**" }
    : { open: "---", close: "---" };
}

export function getClearedEditorValues(chartType) {
  return chartType === "jodi"
    ? { jodi: "" }
    : { open: "", close: "" };
}

export async function publishMarketResult({
  apiBase,
  chartType,
  fetchApi,
  fetchChartAfterPublish = true,
  marketForm,
  normalizeChartEditorRows,
  previousResult,
  selectedSlug,
  token
}) {
  let nextResult = String(marketForm.result || "").trim();
  const previous = String(previousResult || "").trim();

  await fetchApi(apiBase, "/api/admin/market-update", token, {
    method: "POST",
    body: { slug: selectedSlug, ...marketForm, result: nextResult }
  });

  const isPlaceholder = nextResult === "***-**-***";
  const isFullResult = /^[0-9]{3}-[0-9]{2}-[0-9]{3}$/.test(nextResult);
  const isOpenResult = /^[0-9]{3}-[0-9\*]{2}-\*{3}$/.test(nextResult);
  const previousIsOpenResult = /^[0-9]{3}-[0-9\*]{2}-\*{3}$/.test(previous);
  const previousIsFullResult = /^[0-9]{3}-[0-9]{2}-[0-9]{3}$/.test(previous);
  const didCorrectOpenResult = previousIsOpenResult && isOpenResult && previous !== nextResult;
  const didCorrectFullResult = previousIsFullResult && isFullResult && previous !== nextResult;
  const shouldReset = isPlaceholder;
  const shouldSettle = !isPlaceholder && (isOpenResult || isFullResult);
  const settlementMode = shouldReset ? "reset" : "resettle-changed";
  const settled = shouldReset || shouldSettle
    ? await fetchApi(apiBase, "/api/admin/settle-market", token, {
        method: "POST",
        body: { slug: selectedSlug, mode: settlementMode, previousResult: previous }
      })
    : { settlement: null };

  const [markets, chart] = await Promise.all([
    fetchApi(apiBase, "/api/markets/list", token),
    fetchChartAfterPublish ? fetchApi(apiBase, `/api/charts/${selectedSlug}?type=${chartType}`, token) : Promise.resolve(null)
  ]);

  const rows = chart?.rows || [];
  const normalizedRows = chart ? normalizeChartEditorRows(chartType, rows) : [];

  return {
    didSettle: shouldSettle,
    didPublishOpenResult: isOpenResult,
    didCorrectOpenResult,
    didCorrectFullResult,
    didResetPlaceholder: isPlaceholder,
    previousResult: previous,
    lastSettlement: settled.settlement || null,
    markets,
    normalizedRows,
    rows
  };
}

export async function saveMarketChart({
  apiBase,
  applyEditorValuesToRows,
  chartDraftRows,
  chartType,
  editorCloseValue,
  editorDayIndex,
  editorJodiValue,
  editorOpenValue,
  editorWeekLabel,
  fetchApi,
  formatPannaEditorCellValue,
  normalizeChartEditorRows,
  sanitizeJodiEditorInput,
  selectedSlug,
  serializeChartRows,
  token
}) {
  const nextDraftRows = applyEditorValuesToRows(chartDraftRows, chartType, editorWeekLabel, editorDayIndex, editorJodiValue, editorOpenValue, editorCloseValue);
  const nextRowsForSave = serializeChartRows(chartType, nextDraftRows);

  await fetchApi(apiBase, "/api/admin/chart-update", token, {
    method: "POST",
    body: { slug: selectedSlug, chartType, rows: nextRowsForSave }
  });

  const [chart, auditLogs] = await Promise.all([
    fetchApi(apiBase, `/api/charts/${selectedSlug}?type=${chartType}`, token),
    fetchApi(apiBase, "/api/admin/audit-logs", token).catch(() => [])
  ]);
  const rows = chart.rows || [];
  const normalizedRows = normalizeChartEditorRows(chartType, rows);
  const savedRow = normalizedRows.find((row) => String(row[0] || "").trim() === String(editorWeekLabel || "").trim());
  const savedCell = savedRow ? String(savedRow[editorDayIndex + 1] || "").trim() : "";
  const expectedCell = chartType === "jodi"
    ? sanitizeJodiEditorInput(editorJodiValue)
    : formatPannaEditorCellValue(editorOpenValue, editorCloseValue);

  if (expectedCell && savedCell !== expectedCell) {
    throw new Error(`Chart save mismatch. Expected ${expectedCell} but server returned ${savedCell || "empty"}.`);
  }

  return {
    auditLogs,
    normalizedRows,
    rows
  };
}

export function ChartEditorPreviewSection({
  applyBracketMark,
  applyEditorToChart,
  busy,
  chartHeaders,
  chartType,
  clearSelectedCell,
  diff,
  diffRows,
  editorCloseValue,
  editorDayIndex,
  editorJodiValue,
  editorOpenValue,
  editorWeekLabel,
  fillEditorFromSelectedCell,
  formatDate,
  formatPannaDisplayValue,
  handleChartTypeChange,
  highlightPreviewValue,
  history,
  isChartsMode,
  message,
  parsePannaEditorCell,
  previewRows,
  recentPreviewRows,
  safeParse,
  saveChart,
  selectedEditorCell,
  selectedEditorDateLabel,
  selectedMarket,
  selectedSlug,
  setEditorCloseValue,
  setEditorDayIndex,
  setEditorJodiValue,
  setEditorOpenValue,
  setEditorWeekLabel,
  setSelectedSlug,
  setShowFullChart,
  showFullChart,
  state,
  weekOptions
}) {
  if (!isChartsMode) {
    return null;
  }

  return (
    <>
      <section className="panel">
        <div className="panel-head">
          <h2>Chart Preview</h2>
          <p>Admin preview and edit controls use the same chart data shown in app and web.</p>
        </div>
        <div className="chart-preview-toolbar">
          <div className="chart-preview-title">
            <strong>{selectedMarket?.name || "-"}</strong>
            <span>Panna Chart</span>
          </div>
          <label className="chart-type-picker">
            <span>Market</span>
            <select value={selectedSlug} onChange={(event) => setSelectedSlug(event.target.value)}>
              {state.markets.map((market) => <option key={market.slug} value={market.slug}>{market.name}</option>)}
            </select>
          </label>
          <button className="secondary" type="button" onClick={() => setShowFullChart(true)}>Full View Chart</button>
        </div>
        <div className="chart-editor-panel">
          <div className="chart-editor-head">
            <div>
              <strong>Chart Update Controls</strong>
              <span>Edit previous missed day, bracket mark, or current chart cell before save.</span>
            </div>
            <button className="primary" type="button" disabled={!selectedSlug || busy === "chart"} onClick={() => void saveChart()}>
              {busy === "chart" ? "Saving..." : "Save Chart"}
            </button>
          </div>
          <div className="form-grid">
            <label>
              <span>Week Row</span>
              <select value={editorWeekLabel} onChange={(event) => setEditorWeekLabel(event.target.value)}>
                {weekOptions.map((label) => <option key={label} value={label}>{label}</option>)}
              </select>
            </label>
            <label>
              <span>Or Add Custom Week</span>
              <input value={editorWeekLabel} onChange={(event) => setEditorWeekLabel(event.target.value)} placeholder="2026 Mar 30 to Apr 05" />
            </label>
            <label>
              <span>Day</span>
              <select value={String(editorDayIndex)} onChange={(event) => setEditorDayIndex(Number(event.target.value))}>
                {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((label, index) => <option key={label} value={String(index)}>{label}</option>)}
              </select>
            </label>
            <div className="wide chart-editor-actions">
              <button className="secondary" type="button" onClick={() => fillEditorFromSelectedCell()}>Load Selected Cell</button>
              <button className="secondary" type="button" onClick={() => applyBracketMark()}>Mark Bracket</button>
              <button className="secondary" type="button" onClick={() => clearSelectedCell()}>Clear Cell</button>
              <button className="primary" type="button" onClick={() => applyEditorToChart()}>Apply Cell Update</button>
            </div>
            {chartType === "jodi" ? (
              <>
                <label>
                  <span>Jodi Value</span>
                  <input value={editorJodiValue} onChange={(event) => setEditorJodiValue(String(event.target.value || "").replace(/[^0-9*]/g, "").slice(0, 2))} placeholder="80 or **" />
                </label>
                <div className="chart-editor-current">
                  <span>Selected Cell</span>
                  <strong>{selectedEditorCell || "--"}</strong>
                </div>
              </>
            ) : (
              <>
                <label>
                  <span>Open Panna</span>
                  <input value={editorOpenValue} onChange={(event) => setEditorOpenValue(String(event.target.value || "").replace(/[^0-9-]/g, "").slice(0, 3))} placeholder="459 or ---" />
                </label>
                <label>
                  <span>Close Panna</span>
                  <input value={editorCloseValue} onChange={(event) => setEditorCloseValue(String(event.target.value || "").replace(/[^0-9-]/g, "").slice(0, 3))} placeholder="280 or ---" />
                </label>
                <div className="chart-editor-current chart-editor-current-panna">
                  <span>Selected Cell</span>
                  <strong>{formatPannaDisplayValue(selectedEditorCell)}</strong>
                  <small>Jodi: {parsePannaEditorCell(selectedEditorCell).jodi}</small>
                </div>
              </>
            )}
            <div className="wide compact-list">
              <div className="compact-row"><strong>Selected Week</strong><span>{editorWeekLabel || "-"}</span></div>
              <div className="compact-row"><strong>Selected Day</strong><span>{selectedEditorDateLabel}</span></div>
            </div>
          </div>
        </div>
        {message ? <p className={`message ${message.toLowerCase().includes("failed") || message.toLowerCase().includes("error") || message.toLowerCase().includes("mismatch") ? "error" : "success"}`}>{message}</p> : null}
        <div className="chart-preview-shell">
          <table className="chart-preview-table">
            <thead>
              <tr>
                {chartHeaders.map((label, index) => <th key={`preview-head-${index}`}>{label}</th>)}
              </tr>
            </thead>
            <tbody>
              {previewRows.length ? previewRows.map((row, rowIndex) => (
                <tr key={`preview-row-${rowIndex}`}>
                  <td>
                    <div className="chart-date-stack">
                      <span className="chart-date-year">{row.date.year}</span>
                      <span className="chart-date-line">{row.date.start}</span>
                      <span className="chart-date-bridge">{row.date.middle}</span>
                      <span className="chart-date-line">{row.date.end}</span>
                    </div>
                  </td>
                  {chartType === "panna"
                    ? row.cells.map((cell, cellIndex) => (
                      <td key={`preview-cell-${rowIndex}-${cellIndex}`}>
                        <div className="chart-panna-cell">
                          <span className="chart-panna-open">{cell.open}</span>
                          <span className={`chart-panna-jodi${highlightPreviewValue(cell.jodi) ? " hot" : ""}`}>{cell.jodi}</span>
                          <span className="chart-panna-close">{cell.close}</span>
                        </div>
                      </td>
                    ))
                    : row.cells.map((cell, cellIndex) => (
                      <td key={`preview-cell-${rowIndex}-${cellIndex}`}>
                        <div className={`chart-jodi-value${highlightPreviewValue(cell) ? " hot" : ""}`}>{cell}</div>
                      </td>
                    ))}
                </tr>
              )) : (
                <tr>
                  <td colSpan={chartHeaders.length}>No chart rows entered yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
      <section className="panel">
        <div className="dashboard-grid">
          <div className="subpanel">
            <h3>{isChartsMode ? "Chart Diff" : "Recent Chart Updates"}</h3>
            <div className="compact-list">
              {isChartsMode ? (
                <>
                  <div className="compact-row"><strong>Saved Rows</strong><span>{diff.savedCount}</span></div>
                  <div className="compact-row"><strong>Current Rows</strong><span>{diff.currentCount}</span></div>
                  <div className="compact-row"><strong>Added / Removed</strong><span>{diff.addedCount} / {diff.removedCount}</span></div>
                  <div className="compact-row"><strong>Changed Labels</strong><span>{diff.changedLabels.join(", ") || "-"}</span></div>
                </>
              ) : (
                history.length ? history.map((item) => <div className="compact-row" key={item.id}><strong>{formatDate(item.createdAt)}</strong><span>{item.entityId}</span></div>) : <div className="empty-card">No chart updates yet.</div>
              )}
            </div>
          </div>
          <div className="subpanel">
            <h3>{isChartsMode ? "Chart History" : "Chart Editing"}</h3>
            <div className="compact-list">
              {isChartsMode ? (
                history.length ? history.map((item) => {
                  const detail = safeParse(item.details) || {};
                  const previousRows = Array.isArray(detail.previousRows) ? detail.previousRows : [];
                  const nextRows = Array.isArray(detail.rows) ? detail.rows : [];
                  const localDiff = diffRows(previousRows, nextRows);
                  return <div className="compact-row" key={item.id}><strong>{formatDate(item.createdAt)}</strong><span>{`Added ${localDiff.addedCount}, Removed ${localDiff.removedCount}, Changed ${localDiff.changedCount}`}</span></div>;
                }) : <div className="empty-card">No chart updates yet.</div>
              ) : (
                <div className="empty-card">Chart preview, correction, and save controls are available in `All Chart`.</div>
              )}
            </div>
          </div>
        </div>
      </section>
      {isChartsMode && showFullChart ? (
        <div className="modal-shell" onClick={(event) => { if (event.target === event.currentTarget) setShowFullChart(false); }}>
          <div className="modal-card chart-modal-card">
            <div className="modal-head">
              <h3>{selectedMarket?.name || "-"} - {chartType === "panna" ? "Panna Chart" : "Jodi Chart"}</h3>
              <button className="secondary" onClick={() => setShowFullChart(false)}>Close</button>
            </div>
            <div className="chart-preview-shell chart-preview-shell-full">
              <table className="chart-preview-table chart-preview-table-full">
                <thead>
                  <tr>
                    {chartHeaders.map((label, index) => <th key={`modal-preview-head-${index}`}>{label}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {previewRows.length ? previewRows.map((row, rowIndex) => (
                    <tr key={`modal-preview-row-${rowIndex}`}>
                      <td>
                        <div className="chart-date-stack">
                          <span className="chart-date-year">{row.date.year}</span>
                          <span className="chart-date-line">{row.date.start}</span>
                          <span className="chart-date-bridge">{row.date.middle}</span>
                          <span className="chart-date-line">{row.date.end}</span>
                        </div>
                      </td>
                      {chartType === "panna"
                        ? row.cells.map((cell, cellIndex) => (
                          <td key={`modal-preview-cell-${rowIndex}-${cellIndex}`}>
                            <div className="chart-panna-cell">
                              <span className="chart-panna-open">{cell.open}</span>
                              <span className={`chart-panna-jodi${highlightPreviewValue(cell.jodi) ? " hot" : ""}`}>{cell.jodi}</span>
                              <span className="chart-panna-close">{cell.close}</span>
                            </div>
                          </td>
                        ))
                        : row.cells.map((cell, cellIndex) => (
                          <td key={`modal-preview-cell-${rowIndex}-${cellIndex}`}>
                            <div className={`chart-jodi-value${highlightPreviewValue(cell) ? " hot" : ""}`}>{cell}</div>
                          </td>
                        ))}
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={chartHeaders.length}>No chart rows entered yet.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
