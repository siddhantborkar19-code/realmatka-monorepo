import { Platform } from "react-native";

declare const require: (name: string) => { OTPWidget: OtpWidgetApi };

type OtpWidgetApi = {
  initializeWidget: (widgetId: string, tokenAuth: string) => Promise<void>;
  sendOTP: (body: { identifier: string }) => Promise<Record<string, unknown>>;
  retryOTP: (body: { reqId: string; retryChannel?: number }) => Promise<Record<string, unknown>>;
  verifyOTP: (body: { reqId: string; otp: string }) => Promise<Record<string, unknown>>;
};

const widgetId = String(process.env.EXPO_PUBLIC_MSG91_WIDGET_ID || "3665686f3337383235393230").trim();
const tokenAuth = String(process.env.EXPO_PUBLIC_MSG91_WIDGET_TOKEN_AUTH || "515019TD9LSW73F69fe0873P1").trim();
const sdkDisabled = String(process.env.EXPO_PUBLIC_MSG91_NATIVE_SDK_DISABLED || "").trim() === "1";

let initialized = false;

export function isMsg91NativeOtpAvailable() {
  return Platform.OS !== "web" && !sdkDisabled && Boolean(widgetId && tokenAuth);
}

async function getOtpWidget() {
  if (!isMsg91NativeOtpAvailable()) {
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
  const candidates = [payload.reqId, payload.req_id, payload.requestId, payload.request_id, payload.message, readNested(payload, "reqId"), readNested(payload, "req_id")];
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
  if (type && type !== "success") {
    throw new Error(getString(payload.message) || fallback);
  }
}

export async function sendMsg91NativeOtp(phone: string) {
  const otpWidget = await getOtpWidget();
  const response = await otpWidget.sendOTP({ identifier: `91${phone.replace(/[^0-9]/g, "")}` });
  assertSdkSuccess(response, "OTP send nahi hua. Dobara try karo.");
  return {
    reqId: extractReqId(response),
    accessToken: extractAccessToken(response),
    raw: response
  };
}

export async function retryMsg91NativeOtp(reqId: string) {
  const otpWidget = await getOtpWidget();
  const response = await otpWidget.retryOTP({ reqId, retryChannel: 11 });
  assertSdkSuccess(response, "OTP resend nahi hua. Dobara try karo.");
  return {
    reqId: extractReqId(response) || reqId,
    accessToken: extractAccessToken(response),
    raw: response
  };
}

export async function verifyMsg91NativeOtp(reqId: string, otp: string) {
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
