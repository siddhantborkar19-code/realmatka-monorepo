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
  __realMatkaMsg91ScriptPromise?: Promise<void>;
  __realMatkaMsg91Initialized?: boolean;
};

const widgetId = String(process.env.EXPO_PUBLIC_MSG91_WIDGET_ID || "366570677169313137313933").trim();
const tokenAuth = String(process.env.EXPO_PUBLIC_MSG91_WIDGET_TOKEN_AUTH || "515019TX2NYO2A6a081380P1").trim();
const sdkDisabled = String(process.env.EXPO_PUBLIC_MSG91_NATIVE_SDK_DISABLED || "").trim() === "1";

let initialized = false;

export function isMsg91NativeOtpAvailable() {
  return !sdkDisabled && Boolean(widgetId && tokenAuth) && (Platform.OS !== "web" || typeof window !== "undefined");
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
      success: () => undefined,
      failure: () => undefined
    });
    browserWindow.__realMatkaMsg91Initialized = true;
  }
  await waitForMsg91WebMethods();
}

function getString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readNested(payload: Record<string, unknown>, key: string) {
  const data = payload.data;
  if (data && typeof data === "object" && key in data) {
    return (data as Record<string, unknown>)[key];
  }
  return undefined;
}

function extractAccessToken(payload: Record<string, unknown>) {
  const candidates = [
    payload["access-token"],
    payload.accessToken,
    payload.access_token,
    payload.token,
    payload.message,
    readNested(payload, "access-token"),
    readNested(payload, "accessToken"),
    readNested(payload, "access_token"),
    readNested(payload, "token")
  ];

  for (const value of candidates) {
    const text = getString(value);
    if (text && (text.includes(".") || text.length > 32)) {
      return text;
    }
  }
  return "";
}

function extractReqId(payload: Record<string, unknown>) {
  const candidates = [
    payload.reqId,
    payload.req_id,
    payload.requestId,
    payload.request_id,
    readNested(payload, "reqId"),
    readNested(payload, "req_id"),
    readNested(payload, "requestId"),
    readNested(payload, "request_id")
  ];
  for (const value of candidates) {
    const text = getString(value);
    if (text) {
      return text;
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
      sendOtpMethod(`91${phone.replace(/[^0-9]/g, "")}`, resolve, reject);
    });
    return normalizeSendResponse(response);
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
      retryOtpMethod(null, resolve, reject, reqId);
    });
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
      verifyOtpMethod(otp, resolve, reject, reqId);
    });
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
