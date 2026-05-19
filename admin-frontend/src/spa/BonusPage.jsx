import React, { useEffect, useMemo, useState } from "react";

const defaultBonusForm = {
  bonus_enabled: "true",
  bonus_text: "",
  first_deposit_bonus_enabled: "true",
  first_deposit_bonus_minimum: "1000",
  first_deposit_bonus_amount: "50",
  first_deposit_bonus_upper_minimum: "2000",
  first_deposit_bonus_upper_amount: "100",
  special_deposit_bonus_enabled: "false",
  special_deposit_bonus_date: getTodayInputDate(),
  special_deposit_bonus_minimum: "5000",
  special_deposit_bonus_amount: "500",
  special_deposit_bonus_upper_minimum: "10000",
  special_deposit_bonus_upper_amount: "1000",
  special_deposit_bonus_text: "Today limited offer: Deposit Rs 5000+ and get Rs 500 bonus, or deposit Rs 10000+ and get Rs 1000 bonus.",
  referral_deposit_bonus_rate: "2",
  referral_deposit_bonus_max_times: "5",
  referral_deposit_bonus_max_per_deposit: "100"
};

export function BonusPage({ apiBase, token, fetchApi, PageHeader, PageState }) {
  const [state, setState] = useState({ loading: true, error: "", settings: [] });
  const [form, setForm] = useState(defaultBonusForm);
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetchApi(apiBase, "/api/admin/settings", token)
      .then((settings) => {
        const map = Object.fromEntries(settings.map((item) => [item.key, item.value]));
        setForm({ ...defaultBonusForm, ...pickBonusSettings(map) });
        setState({ loading: false, error: "", settings });
      })
      .catch((error) => setState({ loading: false, error: error.message, settings: [] }));
  }, [apiBase, fetchApi, token]);

  const summary = useMemo(() => {
    const firstStatus = form.first_deposit_bonus_enabled === "false" ? "Disabled" : `Rs ${form.first_deposit_bonus_minimum} = ${form.first_deposit_bonus_amount} | Rs ${form.first_deposit_bonus_upper_minimum}+ = ${form.first_deposit_bonus_upper_amount}`;
    const specialStatus = form.special_deposit_bonus_enabled === "true" ? `Rs ${form.special_deposit_bonus_minimum}+ = ${form.special_deposit_bonus_amount} | Rs ${form.special_deposit_bonus_upper_minimum}+ = ${form.special_deposit_bonus_upper_amount}` : "Disabled";
    return { firstStatus, specialStatus };
  }, [form]);

  async function save() {
    setMessage("");
    const settings = await fetchApi(apiBase, "/api/admin/settings", token, { method: "POST", body: form });
    setState((current) => ({ ...current, settings }));
    setMessage("Bonus system updated successfully.");
  }

  if (state.loading) return <PageState title="Bonus" subtitle="Loading bonus settings..." />;
  if (state.error) return <PageState title="Bonus" subtitle={state.error} tone="error" />;

  return (
    <>
      <PageHeader title="Bonus System" subtitle="Manage deposit, referral, and limited-time bonus rules from one place." />
      <section className="panel">
        <div className="panel-head">
          <h2>Live Bonus Summary</h2>
          <p>Yahan se jo save hoga wahi backend deposit success ke time use karega.</p>
        </div>
        <div className="mini-stats">
          {[
            <div className="mini-stat" key="signup"><span>Signup Bonus</span><strong>{form.bonus_enabled === "false" ? "Disabled" : "Enabled"}</strong></div>,
            <div className="mini-stat" key="first"><span>First Deposit</span><strong>{summary.firstStatus}</strong></div>,
            <div className="mini-stat" key="special"><span>Today Limited</span><strong>{summary.specialStatus}</strong></div>,
            <div className="mini-stat" key="referral"><span>Referral Deposit</span><strong>{form.referral_deposit_bonus_rate}% | Max {form.referral_deposit_bonus_max_times} deposits</strong></div>
          ]}
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>First Deposit Bonus</h2>
          <p>Ye bonus user ko sirf pehle successful deposit par milega.</p>
        </div>
        <div className="form-grid">
          <label><span>Status</span><select value={form.first_deposit_bonus_enabled} onChange={(e) => setForm({ ...form, first_deposit_bonus_enabled: e.target.value })}><option value="true">Enabled</option><option value="false">Disabled</option></select></label>
          <label><span>Minimum Deposit</span><input inputMode="numeric" value={form.first_deposit_bonus_minimum} onChange={(e) => setForm({ ...form, first_deposit_bonus_minimum: e.target.value })} /></label>
          <label><span>Bonus Amount</span><input inputMode="numeric" value={form.first_deposit_bonus_amount} onChange={(e) => setForm({ ...form, first_deposit_bonus_amount: e.target.value })} /></label>
          <label><span>Higher Slab Deposit</span><input inputMode="numeric" value={form.first_deposit_bonus_upper_minimum} onChange={(e) => setForm({ ...form, first_deposit_bonus_upper_minimum: e.target.value })} /></label>
          <label><span>Higher Slab Bonus</span><input inputMode="numeric" value={form.first_deposit_bonus_upper_amount} onChange={(e) => setForm({ ...form, first_deposit_bonus_upper_amount: e.target.value })} /></label>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Today Limited Deposit Bonus</h2>
          <p>Is offer ko first deposit se alag rakha gaya hai. Date match hone par har successful deposit par ek baar bonus milega.</p>
        </div>
        <div className="form-grid">
          <label><span>Status</span><select value={form.special_deposit_bonus_enabled} onChange={(e) => setForm({ ...form, special_deposit_bonus_enabled: e.target.value })}><option value="false">Disabled</option><option value="true">Enabled</option></select></label>
          <label><span>Offer Date</span><input type="date" value={form.special_deposit_bonus_date} onChange={(e) => setForm({ ...form, special_deposit_bonus_date: e.target.value })} /></label>
          <label><span>Minimum Deposit</span><input inputMode="numeric" value={form.special_deposit_bonus_minimum} onChange={(e) => setForm({ ...form, special_deposit_bonus_minimum: e.target.value })} /></label>
          <label><span>Bonus Amount</span><input inputMode="numeric" value={form.special_deposit_bonus_amount} onChange={(e) => setForm({ ...form, special_deposit_bonus_amount: e.target.value })} /></label>
          <label><span>Higher Slab Deposit</span><input inputMode="numeric" value={form.special_deposit_bonus_upper_minimum} onChange={(e) => setForm({ ...form, special_deposit_bonus_upper_minimum: e.target.value })} /></label>
          <label><span>Higher Slab Bonus</span><input inputMode="numeric" value={form.special_deposit_bonus_upper_amount} onChange={(e) => setForm({ ...form, special_deposit_bonus_upper_amount: e.target.value })} /></label>
          <label className="wide"><span>Offer Text</span><textarea rows={3} value={form.special_deposit_bonus_text} onChange={(e) => setForm({ ...form, special_deposit_bonus_text: e.target.value })} /></label>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Referral Deposit Bonus</h2>
          <p>Referred user ke successful deposit par referrer ko bonus milega.</p>
        </div>
        <div className="form-grid">
          <label><span>Deposit Bonus Percent</span><input inputMode="decimal" value={form.referral_deposit_bonus_rate} onChange={(e) => setForm({ ...form, referral_deposit_bonus_rate: e.target.value })} /></label>
          <label><span>Max Deposits Per User</span><input inputMode="numeric" value={form.referral_deposit_bonus_max_times} onChange={(e) => setForm({ ...form, referral_deposit_bonus_max_times: e.target.value })} /></label>
          <label><span>Max Bonus Per Deposit</span><input inputMode="numeric" value={form.referral_deposit_bonus_max_per_deposit} onChange={(e) => setForm({ ...form, referral_deposit_bonus_max_per_deposit: e.target.value })} /></label>
          <label><span>Signup Bonus</span><select value={form.bonus_enabled} onChange={(e) => setForm({ ...form, bonus_enabled: e.target.value })}><option value="true">Enabled</option><option value="false">Disabled</option></select></label>
          <label className="wide"><span>Bonus Text</span><input value={form.bonus_text} onChange={(e) => setForm({ ...form, bonus_text: e.target.value })} /></label>
        </div>
        <div className="actions"><button className="primary" onClick={save}>Save Bonus Settings</button></div>
        {message ? <p className="message success">{message}</p> : null}
      </section>
    </>
  );
}

function pickBonusSettings(map) {
  return Object.fromEntries(
    Object.keys(defaultBonusForm)
      .filter((key) => map[key] !== undefined && map[key] !== null && String(map[key]).trim() !== "")
      .map((key) => [key, String(map[key])])
  );
}

function getTodayInputDate() {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  const parts = Object.fromEntries(formatter.formatToParts(new Date()).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
