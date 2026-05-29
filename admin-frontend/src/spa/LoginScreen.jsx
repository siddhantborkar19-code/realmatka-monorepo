import React, { useEffect, useState } from "react";
import { fetchApi, formatApiError, normalizeAdminApiBase } from "../lib/api.js";
import { storeAdminSession } from "../lib/session.js";

const FULL_ADMIN_ROLES = new Set(["admin", "super_admin"]);
const RESULT_OPERATOR_ROLES = new Set(["operator", "result_operator"]);
const RESULT_ONLY_OPERATOR_ROLES = new Set(["result_only_operator"]);
const SUPPORT_OPERATOR_ROLES = new Set(["support_operator"]);
const CRICKET_OPERATOR_ROLES = new Set(["cricket_operator"]);

function isAllowedAdminRole(role) {
  const normalized = normalizeAdminRole(role);
  return FULL_ADMIN_ROLES.has(normalized) || RESULT_OPERATOR_ROLES.has(normalized) || RESULT_ONLY_OPERATOR_ROLES.has(normalized) || SUPPORT_OPERATOR_ROLES.has(normalized) || CRICKET_OPERATOR_ROLES.has(normalized);
}

function normalizeAdminRole(role) {
  return String(role || "").trim().toLowerCase();
}

function getDefaultRouteForRole(role) {
  const normalized = normalizeAdminRole(role);
  if (RESULT_OPERATOR_ROLES.has(normalized) || RESULT_ONLY_OPERATOR_ROLES.has(normalized)) {
    return "results";
  }
  if (SUPPORT_OPERATOR_ROLES.has(normalized)) {
    return "support";
  }
  if (CRICKET_OPERATOR_ROLES.has(normalized)) {
    return "cricket";
  }
  return "dashboard";
}

export function LoginScreen({ apiBase, setApiBase, setToken, bootError }) {
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [challenge, setChallenge] = useState(null);
  const [message, setMessage] = useState(bootError);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setMessage(bootError);
  }, [bootError]);

  async function handleSubmit(event) {
    event.preventDefault();
    if (challenge) {
      await handleVerifyTwoFactor();
      return;
    }

    const normalizedPhone = String(phone || "").replace(/[^0-9]/g, "");
    if (normalizedPhone.length !== 10) {
      setMessage("Valid 10 digit super admin phone dalo.");
      return;
    }
    if (!String(password || "").trim()) {
      setMessage("Password dalo.");
      return;
    }

    setBusy(true);
    setMessage("");
    const normalizedApiBase = normalizeAdminApiBase(apiBase);

    try {
      const data = await fetchApi(normalizedApiBase, "/api/auth/login", "", {
        method: "POST",
        body: { phone: normalizedPhone, password: String(password || "").trim() }
      });
      if (data.requiresTwoFactor) {
        setChallenge({
          challengeId: data.challengeId,
          expiresAt: data.expiresAt,
          provider: data.provider,
          setupRequired: Boolean(data.setupRequired),
          setup: data.setup || null
        });
        setOtp("");
        setMessage("Authenticator app ka 6 digit code enter karo.");
        return;
      }
      if (!isAllowedAdminRole(data.user?.role)) {
        throw new Error("Admin access required");
      }
      storeAdminSession(data.token);
      setToken(data.token);
      window.location.hash = `#/${getDefaultRouteForRole(data.user?.role)}`;
    } catch (error) {
      setMessage(formatApiError(error, "Login failed"));
    } finally {
      setBusy(false);
    }
  }

  async function handleVerifyTwoFactor() {
    const normalizedOtp = String(otp || "").replace(/[^0-9]/g, "");
    if (normalizedOtp.length !== 6) {
      setMessage("Valid 6 digit 2FA code dalo.");
      return;
    }

    setBusy(true);
    setMessage("");
    const normalizedApiBase = normalizeAdminApiBase(apiBase);

    try {
      const data = await fetchApi(normalizedApiBase, "/api/auth/admin-verify-2fa", "", {
        method: "POST",
        body: { challengeId: challenge.challengeId, otp: normalizedOtp }
      });
      if (!isAllowedAdminRole(data.user?.role)) {
        throw new Error("Admin access required");
      }
      storeAdminSession(data.token);
      setChallenge(null);
      setOtp("");
      setToken(data.token);
      window.location.hash = `#/${getDefaultRouteForRole(data.user?.role)}`;
    } catch (error) {
      setMessage(formatApiError(error, "2FA verify failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-shell">
      <section className={`panel login-card${busy ? " busy" : ""}`}>
        <div className="brand login-brand">
          <span className="brand-badge">Admin Panel</span>
          <h1>Real Matka Control Room</h1>
        </div>
        <div className="panel-head">
          <h2>Admin / Operator Login</h2>
          <p>{challenge ? "Password verify ho gaya. Ab 2FA code dalo." : ""}</p>
        </div>
        <form className="form-grid" onSubmit={handleSubmit}>
          <label>
            <span>Phone</span>
            <input disabled={Boolean(challenge)} value={phone} onChange={(event) => setPhone(event.target.value)} type="text" />
          </label>
          <label>
            <span>Password</span>
            <input disabled={Boolean(challenge)} value={password} onChange={(event) => setPassword(event.target.value)} type="password" />
          </label>
          {challenge ? (
            <>
              <label>
                <span>Authenticator Code</span>
                <input autoFocus inputMode="numeric" maxLength={6} value={otp} onChange={(event) => setOtp(event.target.value)} type="text" />
              </label>
              <div className="actions">
                <button type="submit" className="primary">Verify 2FA</button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    setChallenge(null);
                    setOtp("");
                    setMessage("");
                  }}
                >
                  Back
                </button>
              </div>
            </>
          ) : <button type="submit" className="primary">Login</button>}
        </form>
        {message ? <p className="message error">{message}</p> : null}
      </section>
    </div>
  );
}
