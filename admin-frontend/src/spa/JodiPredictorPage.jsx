import React, { useEffect, useMemo, useState } from "react";
import { formatApiError } from "../lib/api.js";

function normalizeMarkets(payload) {
  const markets = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.markets)
      ? payload.markets
      : Array.isArray(payload?.items)
        ? payload.items
        : [];

  return markets
    .map((market) => ({
      slug: String(market?.slug || "").trim(),
      name: String(market?.name || market?.title || market?.slug || "").trim()
    }))
    .filter((market) => market.slug);
}

export function JodiPredictorPage({ apiBase, token, fetchApi, PageHeader, PageState }) {
  const [markets, setMarkets] = useState([]);
  const [selectedMarket, setSelectedMarket] = useState("");
  const [prediction, setPrediction] = useState(null);
  const [state, setState] = useState({ loading: true, error: "" });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    fetchApi(apiBase, "/api/markets/list", token)
      .then((data) => {
        if (!active) return;
        const normalized = normalizeMarkets(data);
        setMarkets(normalized);
        setSelectedMarket((current) => current || normalized[0]?.slug || "");
        setState({ loading: false, error: "" });
      })
      .catch((error) => {
        if (active) {
          setState({ loading: false, error: formatApiError(error, "Market list load nahi hui.") });
        }
      });

    return () => {
      active = false;
    };
  }, [apiBase, fetchApi, token]);

  const selectedMarketName = useMemo(() => {
    return markets.find((market) => market.slug === selectedMarket)?.name || selectedMarket || "-";
  }, [markets, selectedMarket]);

  async function generatePrediction() {
    if (!selectedMarket) {
      setMessage("Market select karo.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const data = await fetchApi(apiBase, `/api/admin/jodi-prediction?market=${encodeURIComponent(selectedMarket)}`, token);
      setPrediction(data);
      setMessage(`${selectedMarketName} ke liye Trend Mix 7 digit ready hai.`);
    } catch (error) {
      setPrediction(null);
      setMessage(formatApiError(error, "Panna prediction generate nahi ho payi."));
    } finally {
      setBusy(false);
    }
  }

  async function copyValues(values, label = "Copied") {
    const text = values.join(" ");
    try {
      await navigator.clipboard.writeText(text);
      setMessage(label);
    } catch {
      setMessage(text);
    }
  }

  if (state.loading) return <PageState title="Panna Predictor" subtitle="Loading markets..." />;
  if (state.error) return <PageState title="Panna Predictor" subtitle={state.error} tone="error" />;

  return (
    <>
      <PageHeader title="Panna Predictor" subtitle="Trend Mix 7 digit se open single panna prediction generate karo." />
      <section className="panel">
        <div className="form-grid predictor-form">
          <label>
            <span>Market</span>
            <select value={selectedMarket} onChange={(event) => setSelectedMarket(event.target.value)}>
              {markets.map((market) => <option key={market.slug} value={market.slug}>{market.name || market.slug}</option>)}
            </select>
          </label>
          <div className="actions predictor-actions">
            <button className="primary" disabled={busy || !selectedMarket} onClick={generatePrediction}>
              {busy ? "Generating..." : "Generate 7 Digit"}
            </button>
            {prediction?.digits?.length ? (
              <>
                <button className="secondary" onClick={() => copyValues(prediction.digits, "7 digit copied.")}>Copy Digits</button>
                <button className="secondary" onClick={() => copyValues(prediction.singlePannas || [], "Single panna copied.")}>Copy Panna</button>
              </>
            ) : null}
          </div>
        </div>
        {message ? <p className={`message ${prediction ? "success" : ""}`}>{message}</p> : null}
      </section>

      {prediction ? (
        <>
          <section className="panel">
            <div className="panel-head">
              <h2>{selectedMarketName}</h2>
              <p>Chart results: {prediction.stats?.totalResults || 0} | Generated: {new Date(prediction.generatedAt).toLocaleString("en-IN")}</p>
            </div>
            <div className="mini-stats predictor-stats">
              <div className={`mini-stat confidence-${prediction.stats?.confidence || "weak"}`}><span>Confidence</span><strong>{prediction.stats?.confidence || "weak"}</strong></div>
              <div className="mini-stat"><span>Strategy</span><strong>Trend Mix 7</strong></div>
              <div className="mini-stat"><span>Digits</span><strong>{prediction.stats?.digitCount || 0}</strong></div>
              <div className="mini-stat"><span>Single Panna</span><strong>{prediction.stats?.pannaCount || 0}</strong></div>
              <div className="mini-stat"><span>Bet / Panna</span><strong>Rs {prediction.stats?.betAmountPerPanna || 10}</strong></div>
              <div className="mini-stat"><span>Open Stake</span><strong>Rs {prediction.stats?.stakePerOpen || 0}</strong></div>
              <div className="mini-stat"><span>Hit Return</span><strong>Rs {prediction.stats?.hitReturn || 0}</strong></div>
              <div className="mini-stat"><span>Hit Profit</span><strong>Rs {prediction.stats?.hitProfit || 0}</strong></div>
              <BacktestStat title="Last 30" data={prediction.stats?.backtest?.last30} />
              <BacktestStat title="Last 60" data={prediction.stats?.backtest?.last60} />
              <BacktestStat title="Last 90" data={prediction.stats?.backtest?.last90} />
              <BacktestStat title="Open Fail Close" data={prediction.stats?.backtest?.openFailCloseLast30} />
            </div>
          </section>

          <PredictionBlock
            title="Trend Mix 7 Digit"
            subtitle="In 7 final digits ke single panna open me use karo."
            values={prediction.digits || []}
            onCopy={() => copyValues(prediction.digits || [], "7 digit copied.")}
          />

          <section className="panel prediction-block prediction-block-wide">
            <div className="panel-head prediction-head">
              <div>
                <h2>Single Panna By Digit</h2>
                <p>{prediction.stats?.pannaCount || 0} panna | Sirf open single panna</p>
              </div>
              <button className="secondary" onClick={() => copyValues(prediction.singlePannas || [], "Single panna copied.")}>Copy All</button>
            </div>
            <div className="panna-predictor-groups">
              {(prediction.singlePannaMap || []).map((group) => (
                <div className="panna-predictor-group" key={group.digit}>
                  <div className="panna-predictor-digit">Digit {group.digit}</div>
                  <div className="jodi-chip-grid compact">
                    {(group.pannas || []).map((panna) => <span className="jodi-chip" key={`${group.digit}-${panna}`}>{panna}</span>)}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="panel">
            <div className="panel-head">
              <h2>Latest Chart Panna</h2>
              <p>Predictor me aaj ka chart result exclude hota hai.</p>
            </div>
            <div className="jodi-chip-grid compact">
              {(prediction.latestResults || []).map((item, index) => (
                <span className="jodi-chip muted" key={`${item.openPanna}-${index}`}>
                  {item.openPanna}-{item.openDigit} / {item.closePanna || "***"}-{item.closeDigit || "*"}
                </span>
              ))}
            </div>
          </section>
        </>
      ) : null}
    </>
  );
}

function BacktestStat({ title, data }) {
  return (
    <div className="mini-stat">
      <span>{title}</span>
      <strong>{data?.hits || 0}/{data?.plays || 0}</strong>
      <small>Profit Rs {data?.profit || 0}</small>
    </div>
  );
}

function PredictionBlock({ title, subtitle, values, onCopy }) {
  return (
    <section className="panel prediction-block prediction-block-wide">
      <div className="panel-head prediction-head">
        <div>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>
        <button className="secondary" onClick={onCopy}>Copy</button>
      </div>
      <div className="jodi-chip-grid">
        {values.map((value, index) => <span className="jodi-chip" key={`${title}-${value}-${index}`}>{value}</span>)}
      </div>
    </section>
  );
}
