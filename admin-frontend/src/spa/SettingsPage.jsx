import React, { useEffect, useState } from "react";

const operatorRoleOptions = [
  { value: "result_operator", label: "Result + Support" },
  { value: "result_only_operator", label: "Only Result Engine" },
  { value: "support_operator", label: "Only Support Chat" }
];

const emptyOperatorForm = {
  id: "",
  name: "",
  phone: "",
  password: "",
  role: "result_operator",
  status: "active",
  twoFactorEnabled: "true"
};

export function SettingsPage({ apiBase, token, fetchApi, PageHeader, PageState }) {
  const [state, setState] = useState({ loading: true, error: "", settings: [], operators: [] });
  const [form, setForm] = useState({
    notice_text: "",
    support_phone: "",
    support_hours: "",
    admin_two_factor_enabled: "true",
    latest_app_version: "",
    latest_app_apk_url: "",
    latest_app_update_required: "false",
    latest_app_update_title: "",
    latest_app_update_message: ""
  });
  const [message, setMessage] = useState("");
  const [operatorForm, setOperatorForm] = useState(emptyOperatorForm);
  const [operatorMessage, setOperatorMessage] = useState("");

  useEffect(() => {
    Promise.all([
      fetchApi(apiBase, "/api/admin/settings", token),
      fetchApi(apiBase, "/api/admin/operators", token)
    ])
      .then(([settings, operators]) => {
        setState({ loading: false, error: "", settings, operators });
        const map = Object.fromEntries(settings.map((item) => [item.key, item.value]));
        setForm({
          notice_text: map.notice_text || "",
          support_phone: map.support_phone || "",
          support_hours: map.support_hours || "",
          admin_two_factor_enabled: map.admin_two_factor_enabled || "true",
          latest_app_version: map.latest_app_version || "",
          latest_app_apk_url: map.latest_app_apk_url || "",
          latest_app_update_required: map.latest_app_update_required || "false",
          latest_app_update_title: map.latest_app_update_title || "New update available",
          latest_app_update_message: map.latest_app_update_message || "Please download the latest APK to continue."
        });
      })
      .catch((error) => setState({ loading: false, error: error.message, settings: [], operators: [] }));
  }, [apiBase, fetchApi, token]);

  async function save() {
    const settings = await fetchApi(apiBase, "/api/admin/settings", token, { method: "POST", body: form });
    setState((current) => ({ ...current, settings }));
    setMessage("Settings updated successfully.");
  }

  async function saveOperator() {
    setOperatorMessage("");
    try {
      const operator = await fetchApi(apiBase, "/api/admin/operators", token, { method: "POST", body: operatorForm });
      setState((current) => {
        const exists = current.operators.some((item) => item.id === operator.id);
        const operators = exists
          ? current.operators.map((item) => (item.id === operator.id ? operator : item))
          : [operator, ...current.operators];
        return { ...current, operators };
      });
      setOperatorForm(emptyOperatorForm);
      setOperatorMessage("Operator access saved successfully.");
    } catch (error) {
      setOperatorMessage(error?.message || "Operator save failed.");
    }
  }

  function editOperator(operator) {
    setOperatorForm({
      id: operator.id,
      name: operator.name || "",
      phone: operator.phone || "",
      password: "",
      role: operator.role || "result_operator",
      status: operator.deactivatedAt ? "disabled" : "active",
      twoFactorEnabled: operator.twoFactorEnabled === false ? "false" : "true"
    });
    setOperatorMessage("Password blank rakho to existing password same rahega.");
  }

  if (state.loading) return <PageState title="Settings" subtitle="Loading settings..." />;
  if (state.error) return <PageState title="Settings" subtitle={state.error} tone="error" />;

  return (
    <>
      <PageHeader title="Settings" subtitle="Shared settings for admin, mobile, and web surfaces." />
      <section className="panel">
        <div className="form-grid">
          <label className="wide"><span>Notice Text</span><textarea rows={4} value={form.notice_text} onChange={(e) => setForm({ ...form, notice_text: e.target.value })} /></label>
          <label><span>Support Phone</span><input value={form.support_phone} onChange={(e) => setForm({ ...form, support_phone: e.target.value })} /></label>
          <label><span>Support Hours</span><input value={form.support_hours} onChange={(e) => setForm({ ...form, support_hours: e.target.value })} /></label>
          <label><span>Admin Authenticator 2FA</span><select value={form.admin_two_factor_enabled} onChange={(e) => setForm({ ...form, admin_two_factor_enabled: e.target.value })}><option value="true">Required</option><option value="false">Disabled</option></select></label>
          <label><span>Latest App Version</span><input placeholder="1.0.3" value={form.latest_app_version} onChange={(e) => setForm({ ...form, latest_app_version: e.target.value })} /></label>
          <label><span>Latest APK URL</span><input placeholder="https://..." value={form.latest_app_apk_url} onChange={(e) => setForm({ ...form, latest_app_apk_url: e.target.value })} /></label>
          <label><span>Force Update</span><select value={form.latest_app_update_required} onChange={(e) => setForm({ ...form, latest_app_update_required: e.target.value })}><option value="false">No</option><option value="true">Yes</option></select></label>
          <label className="wide"><span>Update Popup Title</span><input value={form.latest_app_update_title} onChange={(e) => setForm({ ...form, latest_app_update_title: e.target.value })} /></label>
          <label className="wide"><span>Update Popup Message</span><textarea rows={3} value={form.latest_app_update_message} onChange={(e) => setForm({ ...form, latest_app_update_message: e.target.value })} /></label>
        </div>
        <div className="actions"><button className="primary" onClick={save}>Save Settings</button></div>
        <p className="message success">{message}</p>
      </section>
      <section className="panel">
        <div className="panel-head">
          <h2>Operator Access</h2>
          <p>Result Engine ya Support Chat ke liye limited operator account create/update karo.</p>
        </div>
        <div className="form-grid">
          <label><span>Operator Name</span><input value={operatorForm.name} onChange={(e) => setOperatorForm({ ...operatorForm, name: e.target.value })} /></label>
          <label><span>Phone</span><input inputMode="numeric" maxLength={10} value={operatorForm.phone} onChange={(e) => setOperatorForm({ ...operatorForm, phone: e.target.value })} /></label>
          <label><span>{operatorForm.id ? "New Password (optional)" : "Password"}</span><input type="password" value={operatorForm.password} onChange={(e) => setOperatorForm({ ...operatorForm, password: e.target.value })} /></label>
          <label><span>Access Role</span><select value={operatorForm.role} onChange={(e) => setOperatorForm({ ...operatorForm, role: e.target.value })}>{operatorRoleOptions.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}</select></label>
          <label><span>Status</span><select value={operatorForm.status} onChange={(e) => setOperatorForm({ ...operatorForm, status: e.target.value })}><option value="active">Active</option><option value="disabled">Disabled</option></select></label>
          <label><span>2FA</span><select value={operatorForm.twoFactorEnabled} onChange={(e) => setOperatorForm({ ...operatorForm, twoFactorEnabled: e.target.value })}><option value="true">Required</option><option value="false">Disabled</option></select></label>
        </div>
        <div className="actions">
          <button className="primary" onClick={saveOperator}>{operatorForm.id ? "Update Operator" : "Create Operator"}</button>
          {operatorForm.id ? <button className="secondary" onClick={() => { setOperatorForm(emptyOperatorForm); setOperatorMessage(""); }}>Cancel Edit</button> : null}
        </div>
        {operatorMessage ? <p className={`message ${operatorMessage.includes("failed") || operatorMessage.includes("required") ? "error" : "success"}`}>{operatorMessage}</p> : null}
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Name</th><th>Phone</th><th>Role</th><th>Status</th><th>2FA</th><th>Action</th></tr>
            </thead>
            <tbody>
              {state.operators.length ? state.operators.map((operator) => (
                <tr key={operator.id}>
                  <td>{operator.name}</td>
                  <td>{operator.phone}</td>
                  <td>{formatOperatorRole(operator.role)}</td>
                  <td>{operator.deactivatedAt ? "Disabled" : "Active"}</td>
                  <td>{operator.twoFactorEnabled === false ? "Off" : "Required"}</td>
                  <td><button className="secondary" onClick={() => editOperator(operator)}>Edit</button></td>
                </tr>
              )) : (
                <tr><td colSpan={6}>No operator accounts yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function formatOperatorRole(role) {
  return operatorRoleOptions.find((item) => item.value === role)?.label || role || "-";
}
