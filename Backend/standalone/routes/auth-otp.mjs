import { createSession, findUserByPhone, hashCredential, updateUserPassword } from "../db.mjs";
import { corsPreflight, fail, getJsonBody, normalizeIndianPhone, ok } from "../http.mjs";

const challenges = new Map();
const otpProvider = String(process.env.OTP_PROVIDER || "local").trim().toLowerCase();
const twilioAccountSid = String(process.env.TWILIO_ACCOUNT_SID || "").trim();
const twilioAuthToken = String(process.env.TWILIO_AUTH_TOKEN || "").trim();
const twilioVerifyServiceSid = String(process.env.TWILIO_VERIFY_SERVICE_SID || "").trim();
const msg91AuthKey = cleanEnvValue(process.env.MSG91_AUTH_KEY || "");
const msg91WidgetId = cleanEnvValue(process.env.MSG91_WIDGET_ID || "");
const msg91WidgetTokenAuth = cleanEnvValue(process.env.MSG91_WIDGET_TOKEN_AUTH || process.env.MSG91_AUTH_KEY || "");
const msg91OtpMode = cleanEnvValue(process.env.MSG91_OTP_MODE || "widget").toLowerCase();
const msg91OtpTemplateId = cleanEnvValue(process.env.MSG91_OTP_TEMPLATE_ID || "");
const msg91OtpSenderId = cleanEnvValue(process.env.MSG91_OTP_SENDER_ID || "");
const defaultAppScheme = cleanEnvValue(process.env.EXPO_PUBLIC_APP_SCHEME || "realmatka") || "realmatka";
const defaultAppWebUrl = cleanEnvValue(process.env.EXPO_PUBLIC_APP_URL || "https://play.realmatka.in") || "https://play.realmatka.in";

function cleanEnvValue(value) {
  return String(value || "").trim().replace(/['"]/g, "").trim();
}

function isMsg91Enabled() {
  return otpProvider === "msg91" && Boolean(msg91AuthKey) && (isMsg91ApiMode() || Boolean(msg91WidgetId && msg91WidgetTokenAuth));
}

function isMsg91ApiMode() {
  return msg91OtpMode !== "widget";
}

function isMsg91WidgetMode() {
  return msg91OtpMode === "widget";
}

function assertOtpProviderConfiguration() {
  if (otpProvider === "local" || !otpProvider) {
    return;
  }
  if (otpProvider === "twilio") {
    if (!twilioAccountSid || !twilioAuthToken || !twilioVerifyServiceSid) {
      throw new Error("Twilio OTP provider selected hai, lekin credentials missing hain.");
    }
    return;
  }
  if (otpProvider === "msg91") {
    if (!msg91AuthKey) {
      throw new Error("MSG91 OTP provider selected hai, lekin MSG91_AUTH_KEY missing hai.");
    }
    if (isMsg91WidgetMode() && (!msg91WidgetId || !msg91WidgetTokenAuth)) {
      throw new Error("MSG91 widget mode selected hai, lekin widget credentials missing hain.");
    }
    return;
  }
  throw new Error(`Unsupported OTP provider: ${otpProvider}`);
}

function isTwilioEnabled() {
  return otpProvider === "twilio" && Boolean(twilioAccountSid && twilioAuthToken && twilioVerifyServiceSid);
}

function getTwilioAuthHeader() {
  return `Basic ${Buffer.from(`${twilioAccountSid}:${twilioAuthToken}`).toString("base64")}`;
}

async function twilioRequest(path, body) {
  const response = await fetch(`https://verify.twilio.com/v2/Services/${twilioVerifyServiceSid}${path}`, {
    method: "POST",
    headers: {
      Authorization: getTwilioAuthHeader(),
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams(body).toString()
  });

  const raw = await response.text();
  let payload = null;
  try {
    payload = raw ? JSON.parse(raw) : null;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const message =
      payload?.message ||
      payload?.detail ||
      payload?.details ||
      `Twilio request failed with status ${response.status}`;
    throw new Error(message);
  }

  return payload;
}

async function msg91SendOtp(phone, otp) {
  const mobile = `91${phone}`;
  const params = new URLSearchParams({
    authkey: msg91AuthKey,
    mobile,
    otp,
    otp_length: "6",
    otp_expiry: "10"
  });

  let url = `https://api.msg91.com/api/sendotp.php?${params.toString()}`;
  if (msg91OtpTemplateId) {
    const v5Params = new URLSearchParams({
      authkey: msg91AuthKey,
      template_id: msg91OtpTemplateId,
      mobile,
      otp,
      otp_length: "6",
      otp_expiry: "10"
    });
    url = `https://control.msg91.com/api/v5/otp?${v5Params.toString()}`;
  } else if (msg91OtpSenderId) {
    params.set("sender", msg91OtpSenderId);
    url = `https://api.msg91.com/api/sendotp.php?${params.toString()}`;
  }

  const response = await fetch(url, {
    method: "GET",
    headers: {
      accept: "application/json"
    }
  });

  const raw = await response.text();
  let payload = null;
  try {
    payload = raw ? JSON.parse(raw) : null;
  } catch {
    payload = null;
  }

  const message = String(payload?.message || payload?.error || payload?.request_id || raw || "").trim();
  const type = String(payload?.type || "").trim().toLowerCase();
  if (!response.ok || ["error", "failed", "failure"].includes(type)) {
    throw new Error(message || `MSG91 OTP send failed with status ${response.status}`);
  }

  return payload || { message, type: type || "success" };
}

async function verifyMsg91AccessToken(accessToken) {
  const response = await fetch("https://control.msg91.com/api/v5/widget/verifyAccessToken", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      authkey: msg91AuthKey,
      "access-token": accessToken
    })
  });

  const raw = await response.text();
  let payload = null;
  try {
    payload = raw ? JSON.parse(raw) : null;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const message =
      payload?.message ||
      payload?.error ||
      payload?.details ||
      `MSG91 request failed with status ${response.status}`;
    throw new Error(message);
  }

  return payload;
}

function getMsg91WidgetTokenFromPayload(payload) {
  if (!payload || typeof payload !== "object") {
    return "";
  }

  const candidates = [
    payload?.token,
    payload?.accessToken,
    payload?.access_token,
    payload?.jwtToken,
    payload?.jwt_token,
    payload?.data?.token,
    payload?.data?.accessToken,
    payload?.data?.access_token
  ];

  for (const value of candidates) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return "";
}

function getMsg91VerifiedIdentifier(payload) {
  if (!payload || typeof payload !== "object") {
    return "";
  }

  const candidates = [
    payload?.identifier,
    payload?.mobile,
    payload?.phone,
    payload?.phone_number,
    payload?.mobileNumber,
    payload?.mobile_number,
    payload?.data?.identifier,
    payload?.data?.mobile,
    payload?.data?.phone,
    payload?.data?.phone_number,
    payload?.data?.mobileNumber,
    payload?.data?.mobile_number
  ];

  for (const value of candidates) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return "";
}

function getMsg91VerificationStatus(payload) {
  const candidates = [
    payload?.status,
    payload?.type,
    payload?.message,
    payload?.data?.status,
    payload?.data?.type,
    payload?.data?.message
  ];

  return candidates
    .map((value) => String(value || "").trim().toLowerCase())
    .find(Boolean) || "";
}

function isMsg91VerificationApproved(payload) {
  const status = getMsg91VerificationStatus(payload);
  if (!status) {
    return true;
  }

  return !["error", "failed", "failure", "unauthorized", "invalid"].includes(status);
}

function getMsg91CallbackPath(purpose) {
  return purpose === "register"
    ? "/auth/register"
    : purpose === "password_reset"
      ? "/auth/forgot-password"
      : purpose === "withdraw"
        ? "/wallet/withdraw"
        : "/auth/otp-login";
}

function buildNativeMsg91ReturnUrl(purpose, phone) {
  const callbackPath = getMsg91CallbackPath(purpose);
  const query = `purpose=${encodeURIComponent(purpose)}&phone=${encodeURIComponent(phone)}`;
  return `${defaultAppScheme}://${callbackPath.replace(/^\/+/, "")}?${query}`;
}

function normalizeMsg91ReturnUrl(returnUrl, purpose, phone) {
  const requested = cleanEnvValue(returnUrl);
  if (/^https?:\/\//i.test(requested) || requested.toLowerCase().startsWith(`${defaultAppScheme.toLowerCase()}://`)) {
    return requested;
  }
  return buildNativeMsg91ReturnUrl(purpose, phone);
}

function buildMsg91ReturnUrl(request, purpose, phone) {
  const requestUrl = new URL(request.url);
  const requested = cleanEnvValue(requestUrl.searchParams.get("returnUrl") || "");
  if (requested) {
    return normalizeMsg91ReturnUrl(requested, purpose, phone);
  }

  const callbackPath = getMsg91CallbackPath(purpose);
  const query = `purpose=${encodeURIComponent(purpose)}&phone=${encodeURIComponent(phone)}`;
  if (request.headers.get("origin")) {
    return `${defaultAppWebUrl.replace(/\/+$/, "")}${callbackPath}?${query}`;
  }
  return `${defaultAppScheme}://${callbackPath.replace(/^\/+/, "")}?${query}`;
}

export function buildMsg91WidgetUrl(request, phone, purpose) {
  const requestUrl = new URL(request.url);
  const baseUrl = new URL("/api/auth/msg91/widget", requestUrl.origin);
  baseUrl.searchParams.set("phone", phone);
  baseUrl.searchParams.set("purpose", purpose);
  baseUrl.searchParams.set("returnUrl", buildMsg91ReturnUrl(request, purpose, phone));
  return baseUrl.toString();
}

function getRequestFingerprint(request, namespace, value = "") {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
  const realIp = request.headers.get("x-real-ip")?.trim() ?? "";
  const userAgent = request.headers.get("user-agent")?.trim() ?? "";
  return [namespace, value, forwarded || realIp || "local", userAgent.slice(0, 80)].join(":");
}

const rateLimitBuckets = new Map();
function assertRateLimit({ key, windowMs, max }) {
  const now = Date.now();
  const entry = rateLimitBuckets.get(key);
  if (!entry || entry.resetAt <= now) {
    rateLimitBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSeconds: 0 };
  }
  if (entry.count >= max) {
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)) };
  }
  entry.count += 1;
  rateLimitBuckets.set(key, entry);
  return { allowed: true, retryAfterSeconds: 0 };
}

function createOtpCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

async function sendOtp(phone, purpose) {
  assertOtpProviderConfiguration();

  if (isTwilioEnabled()) {
    const payload = await twilioRequest("/Verifications", {
      To: `+91${phone}`,
      Channel: "sms"
    });
    return {
      sent: true,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      provider: "twilio",
      devCode: null,
      sid: payload?.sid ?? null,
      status: payload?.status ?? "pending"
    };
  }

  if (otpProvider === "msg91" && isMsg91ApiMode()) {
    const code = createOtpCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    await msg91SendOtp(phone, code);
    challenges.set(`${phone}:${purpose}`, { code, expiresAt });
    return {
      sent: true,
      expiresAt,
      provider: "msg91",
      devCode: null,
      mode: "otp"
    };
  }

  if (isMsg91Enabled()) {
    return {
      sent: true,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      provider: "msg91",
      devCode: null,
      mode: "widget"
    };
  }

  const code = createOtpCode();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  challenges.set(`${phone}:${purpose}`, { code, expiresAt });
  return {
    sent: true,
    expiresAt,
    provider: "local",
    devCode: code
  };
}

export async function verifyOtp(phone, purpose, code, accessToken = "") {
  assertOtpProviderConfiguration();

  if (otpProvider === "msg91" && isMsg91WidgetMode()) {
    const normalizedAccessToken = String(accessToken || "").trim();
    if (!normalizedAccessToken) {
      return false;
    }
    const payload = await verifyMsg91AccessToken(normalizedAccessToken);
    if (!isMsg91VerificationApproved(payload)) {
      return false;
    }
    const identifier = getMsg91VerifiedIdentifier(payload);
    if (identifier) {
      const digits = identifier.replace(/\D/g, "");
      const normalizedIdentifier = digits.length === 12 && digits.startsWith("91") ? digits.slice(2) : digits;
      if (normalizedIdentifier && normalizedIdentifier !== phone) {
        return false;
      }
    }
    return true;
  }

  if (isTwilioEnabled()) {
    const payload = await twilioRequest("/VerificationCheck", {
      To: `+91${phone}`,
      Code: code
    });
    return payload?.status === "approved" || payload?.valid === true;
  }

  const challenge = challenges.get(`${phone}:${purpose}`);
  if (!challenge) {
    return false;
  }
  if (new Date(challenge.expiresAt).getTime() < Date.now()) {
    challenges.delete(`${phone}:${purpose}`);
    return false;
  }
  if (challenge.code !== code) {
    return false;
  }
  challenges.delete(`${phone}:${purpose}`);
  return true;
}

export async function issueOtp(phone, purpose) {
  return sendOtp(phone, purpose);
}

export function options(request) {
  return corsPreflight(request);
}

export async function requestOtp(request) {
  const body = await getJsonBody(request);
  const phone = normalizeIndianPhone(String(body.phone ?? "")) ?? String(body.phone ?? "").trim();
  const rawPurpose = String(body.purpose ?? "login");
  const purpose =
    rawPurpose === "password_reset"
      ? "password_reset"
      : rawPurpose === "register"
        ? "register"
        : rawPurpose === "withdraw"
          ? "withdraw"
          : "login";
  const rateLimit = assertRateLimit({
    key: getRequestFingerprint(request, "auth-request-otp", `${phone}:${purpose}`),
    windowMs: 10 * 60 * 1000,
    max: 5
  });

  if (!rateLimit.allowed) {
    return fail(`Too many OTP requests. Try again in ${rateLimit.retryAfterSeconds}s.`, 429, request);
  }

  if (!phone) {
    return fail("Phone number must be a valid 10 digit Indian mobile number", 400, request);
  }

  const user = await findUserByPhone(phone);
  if (!user && purpose !== "register") {
    return fail("User not found", 404, request);
  }

  if (purpose === "register" && user) {
    return fail("Phone number already registered", 400, request);
  }

  if ((purpose === "login" || purpose === "withdraw") && user?.deactivatedAt) {
    return fail("Your account is deactivated. Contact support.", 403, request);
  }
  if ((purpose === "login" || purpose === "withdraw") && user?.blockedAt) {
    return fail("Your account is blocked. Contact support.", 403, request);
  }

  if ((purpose === "login" || purpose === "withdraw") && user && user.approvalStatus !== "Approved") {
    return fail(
      user.approvalStatus === "Rejected"
        ? "Your account registration was rejected. Contact support."
        : "Your account is pending admin approval.",
      403,
      request
    );
  }

  try {
    const otpState = await sendOtp(phone, purpose);
    return ok(
      {
        sent: otpState.sent,
        purpose,
        expiresAt: otpState.expiresAt,
        provider: otpState.provider,
        devCode: otpState.devCode,
        mode: otpState.mode ?? "otp",
        widgetUrl: otpState.provider === "msg91" && otpState.mode === "widget" ? buildMsg91WidgetUrl(request, phone, purpose) : null
      },
      request
    );
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Unable to send OTP", 500, request);
  }
}

export async function msg91Widget(request) {
  if (request.method === "OPTIONS") {
    return corsPreflight(request);
  }

  try {
    assertOtpProviderConfiguration();
  } catch (error) {
    return fail(error instanceof Error ? error.message : "OTP configuration missing", 500, request);
  }

  if (!isMsg91WidgetMode() || !isMsg91Enabled()) {
    return fail("MSG91 OTP provider is not enabled", 400, request);
  }

  const url = new URL(request.url);
  const phone = normalizeIndianPhone(String(url.searchParams.get("phone") ?? "")) ?? String(url.searchParams.get("phone") ?? "").trim();
  const purpose = String(url.searchParams.get("purpose") || "login").trim();
  const returnUrl = normalizeMsg91ReturnUrl(url.searchParams.get("returnUrl") || "", purpose, phone);
  if (!phone || !returnUrl) {
    return new Response("Missing phone or returnUrl", { status: 400 });
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
  <title>Real Matka OTP Verification</title>
  <style>
    body { margin: 0; font-family: Arial, sans-serif; background: #0f172a; color: #fff; display: flex; min-height: 100vh; align-items: center; justify-content: center; }
    .wrap { width: min(92vw, 420px); background: #111827; border: 1px solid rgba(255,255,255,0.08); border-radius: 20px; padding: 24px; box-shadow: 0 20px 50px rgba(0,0,0,0.35); }
    h1 { margin: 0 0 8px; font-size: 24px; }
    p { margin: 0 0 16px; color: #cbd5e1; line-height: 1.5; }
    .meta { font-size: 13px; color: #94a3b8; margin-bottom: 18px; }
    .error { color: #fca5a5; font-size: 14px; margin-top: 14px; }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>Verify Mobile</h1>
    <p>OTP verification complete hote hi aap app me wapas redirect ho jaoge.</p>
    <div class="meta">Purpose: ${purpose} | Mobile: ${phone}</div>
    <div id="error" class="error"></div>
  </div>
  <script>
    function looksLikeToken(value) {
      var text = typeof value === 'string' ? value.trim() : '';
      if (!text) return false;
      if (text.split('.').length >= 3 && text.length > 24) return true;
      if (/^(success|verified|approved|true|false)$/i.test(text)) return false;
      return text.length >= 32;
    }
    function findTokenByKey(payload, depth) {
      if (!payload || depth > 4) return '';
      if (typeof payload === 'string') return looksLikeToken(payload) ? payload.trim() : '';
      if (typeof payload !== 'object') return '';
      var keys = Object.keys(payload);
      for (var i = 0; i < keys.length; i += 1) {
        var key = keys[i];
        var value = payload[key];
        if (/token|access/i.test(key) && typeof value === 'string' && value.trim()) {
          return value.trim();
        }
      }
      for (var j = 0; j < keys.length; j += 1) {
        var nested = findTokenByKey(payload[keys[j]], depth + 1);
        if (nested) return nested;
      }
      return '';
    }
    function extractVerifiedToken(payload) {
      var values = [
        typeof payload === 'string' ? payload : '',
        payload && payload.token,
        payload && payload.accessToken,
        payload && payload.access_token,
        payload && payload['access-token'],
        payload && payload.jwtToken,
        payload && payload.jwt_token,
        payload && payload['jwt-token'],
        payload && payload.data && payload.data.token,
        payload && payload.data && payload.data.accessToken,
        payload && payload.data && payload.data.access_token,
        payload && payload.data && payload.data['access-token'],
        payload && payload.data && payload.data.jwtToken,
        payload && payload.data && payload.data.jwt_token,
        payload && payload.data && payload.data['jwt-token'],
        payload && payload.response && payload.response.token,
        payload && payload.response && payload.response.accessToken,
        payload && payload.response && payload.response.access_token,
        payload && payload.response && payload.response['access-token']
      ];
      for (var i = 0; i < values.length; i += 1) {
        if (typeof values[i] === 'string' && values[i].trim()) {
          return values[i].trim();
        }
      }
      return findTokenByKey(payload, 0);
    }
    var configuration = {
      widgetId: ${JSON.stringify(msg91WidgetId)},
      tokenAuth: ${JSON.stringify(msg91WidgetTokenAuth)},
      identifier: ${JSON.stringify(`+91${phone}`)},
      exposeMethods: false,
      success: function (data) {
        var token = extractVerifiedToken(data);
        if (!token) {
          console.log('MSG91 success response without token', data);
          document.getElementById('error').textContent = 'Verified token receive nahi hua. Dobara try karo.';
          return;
        }
        var redirect = new URL(${JSON.stringify(returnUrl)});
        redirect.searchParams.set('msg91Token', token);
        redirect.searchParams.set('phone', ${JSON.stringify(phone)});
        redirect.searchParams.set('purpose', ${JSON.stringify(purpose)});
        window.location.replace(redirect.toString());
      },
      failure: function (error) {
        var message = 'OTP verify nahi ho paya. Dobara try karo.';
        if (error && typeof error === 'object' && error.message) {
          message = error.message;
        }
        document.getElementById('error').textContent = message;
      }
    };
    (function loadOtpScript(urls) {
      var index = 0;
      function attempt() {
        var s = document.createElement('script');
        s.src = urls[index];
        s.async = true;
        s.onload = function() {
          if (typeof window.initSendOTP === 'function') {
            window.initSendOTP(configuration);
          }
        };
        s.onerror = function() {
          index += 1;
          if (index < urls.length) attempt();
          else document.getElementById('error').textContent = 'OTP widget load nahi hua. Dobara try karo.';
        };
        document.head.appendChild(s);
      }
      attempt();
    })([
      'https://verify.msg91.com/otp-provider.js',
      'https://verify.phone91.com/otp-provider.js'
    ]);
  </script>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8"
    }
  });
}

export async function otpLogin(request) {
  const body = await getJsonBody(request);
  const phone = normalizeIndianPhone(String(body.phone ?? "")) ?? String(body.phone ?? "").trim();
  const otp = String(body.otp ?? "").trim();
  const accessToken = String(body.accessToken ?? "").trim();
  const rateLimit = assertRateLimit({
    key: getRequestFingerprint(request, "auth-otp-login", phone),
    windowMs: 10 * 60 * 1000,
    max: 10
  });

  if (!rateLimit.allowed) {
    return fail(`Too many OTP login attempts. Try again in ${rateLimit.retryAfterSeconds}s.`, 429, request);
  }

  if (!phone || (!accessToken && !/^[0-9]{6}$/.test(otp))) {
    return fail("Valid phone number and OTP verification are required", 400, request);
  }

  let valid = false;
  try {
    valid = await verifyOtp(phone, "login", otp, accessToken);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Unable to verify OTP", 500, request);
  }

  if (!valid) {
    return fail("Invalid or expired OTP", 400, request);
  }

  const user = await findUserByPhone(phone);
  if (!user) {
    return fail("User not found", 404, request);
  }

  if (user.deactivatedAt) {
    return fail("Your account is deactivated. Contact support.", 403, request);
  }
  if (user.blockedAt) {
    return fail("Your account is blocked. Contact support.", 403, request);
  }

  if (user.approvalStatus !== "Approved") {
    return fail(
      user.approvalStatus === "Rejected"
        ? "Your account registration was rejected. Contact support."
        : "Your account is pending admin approval.",
      403,
      request
    );
  }

  const { rawToken } = await createSession(user.id);
  return ok(
    {
      token: rawToken,
      user: {
        id: user.id,
        phone: user.phone,
        name: user.name,
        role: user.role,
        hasMpin: user.hasMpin,
        referralCode: user.referralCode,
        joinedAt: user.joinedAt
      }
    },
    request
  );
}

export async function forgotPassword(request) {
  const body = await getJsonBody(request);
  const phone = normalizeIndianPhone(String(body.phone ?? "")) ?? String(body.phone ?? "").trim();
  const otp = String(body.otp ?? "").trim();
  const accessToken = String(body.accessToken ?? "").trim();
  const password = String(body.password ?? "");
  const confirmPassword = String(body.confirmPassword ?? "");
  const rateLimit = assertRateLimit({
    key: getRequestFingerprint(request, "auth-forgot-password", phone),
    windowMs: 10 * 60 * 1000,
    max: 10
  });

  if (!rateLimit.allowed) {
    return fail(`Too many reset attempts. Try again in ${rateLimit.retryAfterSeconds}s.`, 429, request);
  }

  if (!phone || (!accessToken && !/^[0-9]{6}$/.test(otp))) {
    return fail("Valid phone number and OTP verification are required", 400, request);
  }

  if (password.length < 8) {
    return fail("Password must be at least 8 characters", 400, request);
  }

  if (password !== confirmPassword) {
    return fail("Password and confirm password must match", 400, request);
  }

  let valid = false;
  try {
    valid = await verifyOtp(phone, "password_reset", otp, accessToken);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Unable to verify OTP", 500, request);
  }

  if (!valid) {
    return fail("Invalid or expired OTP", 400, request);
  }

  const user = await findUserByPhone(phone);
  if (!user) {
    return fail("User not found", 404, request);
  }

  await updateUserPassword(user.id, hashCredential(password));
  return ok({ success: true }, request);
}
