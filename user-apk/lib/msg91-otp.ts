import { Platform } from "react-native";

declare const require: (name: string) => { OTPWidget: OtpWidgetApi };

type OtpWidgetApi = {
  initializeWidget: (widgetId: string, tokenAuth: string) => Promise<void>;
  sendOTP: (body: { identifier: string }) => Promise<Record<string, unknown>>;
  retryOTP: (body: { reqId: string; retryChannel?: number }) => Promise<Record<string, unknown>>;
  verifyOTP: (body: { reqId: string; otp: string }) => Promise<Record<string, unknown>>;
};

type Msg91BrowserWindow = Window & {
  initSendOTP?: (configuration: Record<string, unknown>) => void;
  sendOtp?: (
    identifier: string,
    success?: (data: Record<string, unknown>) => void,
    failure?: (error: unknown) => void
  ) => void;
  sendOTP?: (
    identifier: string,
    success?: (data: Record<string, unknown>) => void,
    failure?: (error: unknown) => void
  ) => void;
  retryOtp?: (
    channel: string | null,
    success?: (data: Record<string, unknown>) => void,
    failure?: (error: unknown) => void,
    reqId?: string
  ) => void;
  retryOTP?: (
    channel: string | null,
    success?: (data: Record<string, unknown>) => void,
    failure?: (error: unknown) => void,
    reqId?: string
  ) => void;
  verifyOtp?: (
    otp: string,
    success?: (data: Record<string, unknown>) => void,
    failure?: (error: unknown) => void,
    reqId?: string
  ) => void;
  verifyOTP?: (
    otp: string,
    success?: (data: Record<string, unknown>) => void,
    failure?: (error: unknown) => void,
    reqId?: string
  ) => void;
  getWidgetData?: () => Record<string, unknown>;
  __realMatkaMsg91ScriptPromise?: Promise<void>;
  __realMatkaMsg91Initialized?: boolean;
  __realMatkaMsg91LastToken?: string;
  __realMatkaMsg91LastReqId?: string;
  __realMatkaMsg91TokenWaiters?: Array<(token: string) => void>;
};

const widgetId = String(process.env.EXPO_PUBLIC_MSG91_WIDGET_ID || "366570677169313137313933").trim();
const tokenAuth = String(process.env.EXPO_PUBLIC_MSG91_WIDGET_TOKEN_AUTH || "515019TX2NYO2A6a081380P1").trim();
const sdkDisabled = String(process.env.EXPO_PUBLIC_MSG91_NATIVE_SDK_DISABLED || "").trim() === "1";

let initialized = false;

function isMsg91DebugEnabled() {
  if (typeof window === "undefined") {
    return false;
  }
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get("debugOtp") === "1" || window.localStorage.getItem("realmatka.msg91.debug") === "1";
  } catch {
    return false;
  }
}

function debugMsg91(label: string, payload: unknown) {
  if (isMsg91DebugEnabled()) {
    console.log(`[MSG91 ${label}]`, payload);
  }
}

export function isMsg91NativeOtpAvailable() {
  if (!widgetId || !tokenAuth) {
    return false;
  }
  if (Platform.OS === "web") {
    return typeof window !== "undefined";
  }
  return !sdkDisabled;
}

async function getOtpWidget() {
  if (Platform.OS === "web" || !isMsg91NativeOtpAvailable()) {
    throw new Error("MSG91 native OTP SDK is not available");
  }
  const mod = require("@msg91comm/sendotp-react-native");
  const otpWidget = mod.OTPWidget as OtpWidgetApi;
  if (!initialized) {
    await otpWidget.initializeWidget(widgetId, tokenAuth);
    initialized = true;
  }
  return otpWidget;
}

function getBrowserWindow() {
  if (typeof window === "undefined") {
    throw new Error("MSG91 web OTP SDK is not available");
  }
  return window as Msg91BrowserWindow;
}

function loadMsg91WebScript() {
  const browserWindow = getBrowserWindow();
  if (
    (typeof browserWindow.sendOtp === "function" || typeof browserWindow.sendOTP === "function") &&
    (typeof browserWindow.verifyOtp === "function" || typeof browserWindow.verifyOTP === "function")
  ) {
    return Promise.resolve();
  }
  if (browserWindow.__realMatkaMsg91ScriptPromise) {
    return browserWindow.__realMatkaMsg91ScriptPromise;
  }

  browserWindow.__realMatkaMsg91ScriptPromise = new Promise<void>((resolve, reject) => {
    const urls = ["https://verify.msg91.com/otp-provider.js", "https://verify.phone91.com/otp-provider.js"];
    let index = 0;

    function attempt() {
      const script = document.createElement("script");
      script.src = urls[index];
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => {
        index += 1;
        if (index < urls.length) {
          attempt();
        } else {
          reject(new Error("MSG91 OTP SDK load nahi hua. Dobara try karo."));
        }
      };
      document.head.appendChild(script);
    }

    attempt();
  });

  return browserWindow.__realMatkaMsg91ScriptPromise;
}

function waitForMsg91WebMethods(timeoutMs = 6000) {
  const browserWindow = getBrowserWindow();
  if (
    (typeof browserWindow.sendOtp === "function" || typeof browserWindow.sendOTP === "function") &&
    (typeof browserWindow.verifyOtp === "function" || typeof browserWindow.verifyOTP === "function")
  ) {
    return Promise.resolve();
  }

  return new Promise<void>((resolve, reject) => {
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      if (
        (typeof browserWindow.sendOtp === "function" || typeof browserWindow.sendOTP === "function") &&
        (typeof browserWindow.verifyOtp === "function" || typeof browserWindow.verifyOTP === "function")
      ) {
        window.clearInterval(timer);
        resolve();
        return;
      }
      if (Date.now() - startedAt >= timeoutMs) {
        window.clearInterval(timer);
        reject(new Error("MSG91 OTP method available nahi hai."));
      }
    }, 150);
  });
}

async function initializeMsg91WebWidget() {
  const browserWindow = getBrowserWindow();
  await loadMsg91WebScript();
  if (!browserWindow.__realMatkaMsg91Initialized) {
    if (typeof browserWindow.initSendOTP !== "function") {
      throw new Error("MSG91 OTP SDK initialize nahi hua.");
    }
    browserWindow.initSendOTP({
      widgetId,
      tokenAuth,
      exposeMethods: true,
      captchaRenderId: "",
      success: (data: unknown) => {
        debugMsg91("global success", data);
        const token = extractAccessToken((data && typeof data === "object" ? data : { value: data }) as Record<string, unknown>);
        if (token) {
          browserWindow.__realMatkaMsg91LastToken = token;
          const waiters = browserWindow.__realMatkaMsg91TokenWaiters || [];
          browserWindow.__realMatkaMsg91TokenWaiters = [];
          waiters.forEach((resolve) => resolve(token));
        }
      },
      failure: (error: unknown) => {
        debugMsg91("global failure", error);
      }
    });
    browserWindow.__realMatkaMsg91Initialized = true;
  }
  await waitForMsg91WebMethods();
}

function waitForMsg91SuccessToken(timeoutMs = 2500) {
  const browserWindow = getBrowserWindow();
  if (browserWindow.__realMatkaMsg91LastToken) {
    const token = browserWindow.__realMatkaMsg91LastToken;
    browserWindow.__realMatkaMsg91LastToken = "";
    return Promise.resolve(token);
  }

  return new Promise<string>((resolve) => {
    const timer = window.setTimeout(() => {
      const waiters = browserWindow.__realMatkaMsg91TokenWaiters || [];
      browserWindow.__realMatkaMsg91TokenWaiters = waiters.filter((waiter) => waiter !== resolve);
      resolve("");
    }, timeoutMs);
    const wrappedResolve = (token: string) => {
      window.clearTimeout(timer);
      resolve(token);
    };
    browserWindow.__realMatkaMsg91TokenWaiters = [...(browserWindow.__realMatkaMsg91TokenWaiters || []), wrappedResolve];
  });
}

function getString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readNested(payload: Record<string, unknown>, key: string) {
  const data = payload.data;
  if (data && typeof data === "object" && key in data) {
    return (data as Record<string, unknown>)[key];
  }
  const response = payload.response;
  if (response && typeof response === "object" && key in response) {
    return (response as Record<string, unknown>)[key];
  }
  if (data && typeof data === "object") {
    const nestedResponse = (data as Record<string, unknown>).response;
    if (nestedResponse && typeof nestedResponse === "object" && key in nestedResponse) {
      return (nestedResponse as Record<string, unknown>)[key];
    }
  }
  return undefined;
}

function extractAccessToken(payload: Record<string, unknown>) {
  const candidates = [
    payload["access-token"],
    payload.accessToken,
    payload.access_token,
    payload.jwt,
    payload.jwtToken,
    payload.jwt_token,
    payload["jwt-token"],
    payload.token,
    readNested(payload, "access-token"),
    readNested(payload, "accessToken"),
    readNested(payload, "access_token"),
    readNested(payload, "jwt"),
    readNested(payload, "jwtToken"),
    readNested(payload, "jwt_token"),
    readNested(payload, "jwt-token"),
    readNested(payload, "token")
  ];

  for (const value of candidates) {
    const text = getString(value);
    if (text && text.split(".").length >= 3 && text.length > 32) {
      return text;
    }
  }
  return "";
}

function extractReqId(payload: Record<string, unknown>) {
  const candidates = [
    payload.reqId,
    payload.reqid,
    payload.reqID,
    payload.req_id,
    payload.req_Id,
    payload.reqID,
    payload.requestId,
    payload.request_id,
    payload.requestID,
    payload.requestid,
    payload.request,
    payload.request_id,
    payload["request-id"],
    payload["req-id"],
    readNested(payload, "reqId"),
    readNested(payload, "reqid"),
    readNested(payload, "reqID"),
    readNested(payload, "req_id"),
    readNested(payload, "req_Id"),
    readNested(payload, "requestId"),
    readNested(payload, "request_id"),
    readNested(payload, "requestID"),
    readNested(payload, "requestid"),
    readNested(payload, "request"),
    readNested(payload, "request-id"),
    readNested(payload, "req-id")
  ];
  for (const value of candidates) {
    const text = getString(value);
    if (text) {
      return text;
    }
  }
  return "";
}

function getMsg91WidgetReqId() {
  if (Platform.OS !== "web") {
    return "";
  }
  try {
    const browserWindow = getBrowserWindow();
    if (browserWindow.__realMatkaMsg91LastReqId) {
      return browserWindow.__realMatkaMsg91LastReqId;
    }
    if (typeof browserWindow.getWidgetData === "function") {
      const widgetData = browserWindow.getWidgetData();
      debugMsg91("widget data", widgetData);
      return extractReqId(widgetData);
    }
  } catch {
    return "";
  }
  return "";
}

async function waitForMsg91WidgetReqId(timeoutMs = 2500) {
  const existingReqId = getMsg91WidgetReqId();
  if (existingReqId) {
    return existingReqId;
  }
  if (Platform.OS !== "web") {
    return "";
  }

  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    await new Promise((resolve) => window.setTimeout(resolve, 150));
    const reqId = getMsg91WidgetReqId();
    if (reqId) {
      return reqId;
    }
  }
  return "";
}

function assertSdkSuccess(payload: Record<string, unknown>, fallback: string) {
  const type = getString(payload.type).toLowerCase();
  const status = getString(payload.status).toLowerCase();
  const message = getString(payload.message) || getString(payload.error) || getString(readNested(payload, "message"));
  const failed =
    ["error", "failed", "failure", "invalid"].includes(type) ||
    ["error", "failed", "failure", "invalid"].includes(status) ||
    (typeof payload.success === "boolean" && !payload.success);

  if (failed) {
    throw new Error(message || fallback);
  }
}

function getSdkErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }
  if (typeof error === "string" && error.trim()) {
    return error.trim();
  }
  if (error && typeof error === "object") {
    const payload = error as Record<string, unknown>;
    const candidates = [
      payload.message,
      payload.error,
      payload.description,
      payload.reason,
      payload.status,
      readNested(payload, "message"),
      readNested(payload, "error"),
      readNested(payload, "description"),
      readNested(payload, "reason")
    ];
    for (const value of candidates) {
      const text = getString(value);
      if (text) {
        return text;
      }
    }
  }
  return fallback;
}

function rejectSdkError(reject: (reason?: unknown) => void, fallback: string) {
  return (error: unknown) => reject(new Error(getSdkErrorMessage(error, fallback)));
}

export async function sendMsg91NativeOtp(phone: string) {
  const normalizeSendResponse = (response: Record<string, unknown>) => {
    assertSdkSuccess(response, "OTP send nahi hua. Dobara try karo.");
    const reqId = extractReqId(response);
    const accessToken = extractAccessToken(response);
    if (!reqId && !accessToken) {
      throw new Error(getString(response.message) || "MSG91 se OTP request id nahi mila. Widget/template settings check karo.");
    }
    return {
      reqId,
      accessToken,
      raw: response
    };
  };

  if (Platform.OS === "web") {
    await initializeMsg91WebWidget();
    const browserWindow = getBrowserWindow();
    const sendOtpMethod = browserWindow.sendOtp || browserWindow.sendOTP;
    if (typeof sendOtpMethod !== "function") {
      throw new Error("MSG91 send OTP method available nahi hai.");
    }
    const response = await new Promise<Record<string, unknown>>((resolve, reject) => {
      sendOtpMethod(`91${phone.replace(/[^0-9]/g, "")}`, resolve, rejectSdkError(reject, "OTP send nahi hua. Dobara try karo."));
    });
    debugMsg91("send response", response);
    const normalized = normalizeSendResponse({
      ...response,
      reqId: extractReqId(response) || (await waitForMsg91WidgetReqId())
    });
    browserWindow.__realMatkaMsg91LastReqId = normalized.reqId;
    return normalized;
  }

  const otpWidget = await getOtpWidget();
  const response = await otpWidget.sendOTP({ identifier: `91${phone.replace(/[^0-9]/g, "")}` });
  return normalizeSendResponse(response);
}

export async function retryMsg91NativeOtp(reqId: string) {
  if (Platform.OS === "web") {
    await initializeMsg91WebWidget();
    const browserWindow = getBrowserWindow();
    const retryOtpMethod = browserWindow.retryOtp || browserWindow.retryOTP;
    if (typeof retryOtpMethod !== "function") {
      throw new Error("MSG91 resend OTP method available nahi hai.");
    }
    const response = await new Promise<Record<string, unknown>>((resolve, reject) => {
      retryOtpMethod(null, resolve, rejectSdkError(reject, "OTP resend nahi hua. Dobara try karo."), reqId);
    });
    debugMsg91("retry response", response);
    assertSdkSuccess(response, "OTP resend nahi hua. Dobara try karo.");
    const nextReqId = extractReqId(response) || getMsg91WidgetReqId() || reqId;
    const accessToken = extractAccessToken(response);
    if (!nextReqId && !accessToken) {
      throw new Error(getString(response.message) || "MSG91 se OTP resend request id nahi mila.");
    }
    return {
      reqId: nextReqId,
      accessToken,
      raw: response
    };
  }

  const otpWidget = await getOtpWidget();
  const response = await otpWidget.retryOTP({ reqId, retryChannel: 11 });
  assertSdkSuccess(response, "OTP resend nahi hua. Dobara try karo.");
  const nextReqId = extractReqId(response) || reqId;
  const accessToken = extractAccessToken(response);
  if (!nextReqId && !accessToken) {
    throw new Error(getString(response.message) || "MSG91 se OTP resend request id nahi mila.");
  }
  return {
    reqId: nextReqId,
    accessToken,
    raw: response
  };
}

export async function verifyMsg91NativeOtp(reqId: string, otp: string) {
  if (Platform.OS === "web") {
    await initializeMsg91WebWidget();
    const browserWindow = getBrowserWindow();
    const verifyOtpMethod = browserWindow.verifyOtp || browserWindow.verifyOTP;
    if (typeof verifyOtpMethod !== "function") {
      throw new Error("MSG91 verify OTP method available nahi hai.");
    }
    const response = await new Promise<Record<string, unknown>>((resolve, reject) => {
      verifyOtpMethod(otp, resolve, rejectSdkError(reject, "Invalid OTP. Dobara try karo."), reqId);
    });
    debugMsg91("verify response", response);
    assertSdkSuccess(response, "Invalid OTP. Dobara try karo.");
    const accessToken = extractAccessToken(response) || (await waitForMsg91SuccessToken());
    if (!accessToken) {
      throw new Error("OTP verified token receive nahi hua.");
    }
    return {
      accessToken,
      raw: response
    };
  }

  const otpWidget = await getOtpWidget();
  const response = await otpWidget.verifyOTP({ reqId, otp });
  assertSdkSuccess(response, "Invalid OTP. Dobara try karo.");
  const accessToken = extractAccessToken(response);
  if (!accessToken) {
    throw new Error("OTP verified token receive nahi hua.");
  }
  return {
    accessToken,
    raw: response
  };
}
