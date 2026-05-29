import Constants from "expo-constants";
import { Platform } from "react-native";

type HttpMethod = "GET" | "POST";

type RequestOptions = {
  method?: HttpMethod;
  body?: unknown;
  token?: string;
  timeoutMs?: number;
  retries?: number;
};

export type SessionUser = {
  id: string;
  phone: string;
  email?: string;
  name: string;
  role: string;
  hasMpin: boolean;
  referralCode: string;
  joinedAt: string | null;
  walletBalance?: number;
};

export type BidEntry = {
  id: string;
  userId: string;
  market: string;
  boardLabel: string;
  gameType: string;
  sessionType: "Open" | "Close" | "NA";
  digit: string;
  points: number;
  status: "Pending" | "Won" | "Lost";
  payout: number;
  settledAt: string | null;
  settledResult: string | null;
  createdAt: string;
};

export type WalletEntry = {
  id: string;
  userId: string;
  type: string;
  kind?: string;
  status: "SUCCESS" | "INITIATED" | "BACKOFFICE" | "REJECTED" | "FAILED" | "CANCELLED";
  amount: number;
  beforeBalance: number;
  afterBalance: number;
  referenceId: string | null;
  proofUrl: string | null;
  note: string | null;
  createdAt: string;
};

export type BankAccount = {
  id: string;
  userId: string;
  accountNumber: string;
  holderName: string;
  ifsc: string;
  createdAt: string;
};

export type MarketItem = {
  id: string;
  slug: string;
  name: string;
  result: string;
  phase?: "open-running" | "close-running" | "closed" | "upcoming";
  label?: string;
  canPlaceBet?: boolean;
  blockedBoardLabels?: string[];
  status: string;
  action: string;
  open: string;
  close: string;
  category: "starline" | "games" | "jackpot";
};

export type CricketMatch = {
  id: string;
  title: string;
  teamA: string;
  teamB: string;
  status: string;
  startAt: string | null;
  tossBettingOpen: boolean;
  matchBettingOpen: boolean;
  tossCloseAt: string | null;
  matchCloseAt: string | null;
  tossWinner: string | null;
  matchWinner: string | null;
  tossSettledAt: string | null;
  matchSettledAt: string | null;
  markets?: Record<string, { label: string; rates: Record<string, number>; open: boolean; closeAt: string | null; winner: string | null }>;
  createdAt: string;
};

export type CricketBet = {
  id: string;
  userId: string;
  matchId: string;
  matchTitle: string;
  marketType: string;
  selection: string;
  amount: number;
  rate: number;
  status: "Pending" | "Won" | "Lost" | "Refunded";
  payout: number;
  settledAt: string | null;
  settledResult: string;
  createdAt: string;
};

export type CricketMatchesPayload = {
  rates: Record<string, Record<string, number>>;
  matches: CricketMatch[];
};

export type SettingItem = {
  key: string;
  value: string;
  updatedAt: string;
};

export type BoardHelperData = {
  options: string[];
  suggestions: string[];
  validationMessage: string;
  sangam: { valid: boolean; value: string; message: string };
};

export type PaymentOrder = {
  id: string;
  amount: number;
  provider: string;
  reference: string;
  redirectUrl: string | null;
  status: string;
  remoteStatus?: string;
  checkoutMode?: "native" | "link";
  gatewayOrderId?: string | null;
  keyId?: string | null;
  displayName?: string | null;
  description?: string | null;
  customerName?: string | null;
  customerContact?: string | null;
  customerEmail?: string | null;
};

export type DepositConfig = {
  version: number;
  enabled: boolean;
  mode: "manual_qr" | "maintenance" | "razorpay" | "cashfree" | "upi_intent";
  minAmount: number;
  upiId: string;
  upiName: string;
  whatsappNumber: string;
  razorpayPlatform?: "web" | "native";
  title: string;
  message: string;
  maintenanceTitle: string;
  maintenanceMessage: string;
  updatedAt: string;
};

export type HealthSnapshot = {
  ok: boolean;
  status: "ok" | "warn" | "error";
  service: string;
  timestamp: string;
  uptimeSeconds: number;
  requestId?: string;
  checks?: {
    env?: { status: string; warnings?: string[]; errors?: string[] };
    manifest?: { status: string };
    database?: { status: string; provider?: string };
  };
};

export type OtpRequestResponse = {
  sent: boolean;
  purpose?: string;
  expiresAt: string;
  provider: string;
  devCode: string | null;
  mode?: "otp" | "widget";
  widgetUrl?: string | null;
};

export type GoogleAuthResponse = {
  needsRegistration: boolean;
  registrationToken?: string;
  profile?: {
    email: string;
    name: string;
    givenName: string;
    familyName: string;
    picture: string;
  };
  token?: string;
  user?: SessionUser;
};

export type ChartBatchPayload = {
  items: Array<{
    marketSlug: string;
    chartType: "jodi" | "panna";
    rows: string[][];
  }>;
  markets: string[];
  types: Array<"jodi" | "panna">;
};

type ApiEnvelope<T> = {
  ok: boolean;
  data?: T;
  error?: string;
};

type AuthFailureListener = (failedToken: string) => void;

export class ApiError extends Error {
  status: number;
  isAuthError: boolean;
  requestId?: string;

  constructor(message: string, status = 500) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.isAuthError = status === 401;
  }
}

function mapUserFacingErrorMessage(message: string, fallback: string) {
  const normalized = String(message || "").trim();
  const lower = normalized.toLowerCase();

  if (!normalized) {
    return fallback;
  }
  if (lower.includes("invalid phone or password")) {
    return "Wrong phone number ya password.";
  }
  if (lower.includes("invalid otp")) {
    return "Wrong OTP. Dobara try karo.";
  }
  if (
    lower.includes("otp send") ||
    lower.includes("send otp") ||
    lower.includes("otp sms") ||
    lower.includes("unable to send otp") ||
    lower.includes("otp configuration") ||
    lower.includes("template") ||
    lower.includes("sender") ||
    lower.includes("msg91")
  ) {
    return normalized;
  }
  if (
    lower.includes("verificationcheck was not found") ||
    lower.includes("/v2/services/") ||
    lower.includes("unable to verify otp") ||
    lower.includes("verify service") ||
    lower.includes("twilio")
  ) {
    return "OTP verify karne me problem aa rahi hai. Dobara try karo.";
  }
  if (lower.includes("invalid authenticator code")) {
    return "Wrong 2FA code. Dobara try karo.";
  }
  if (lower.includes("challenge expired") || lower.includes("setup required")) {
    return "Session expire ho gaya. Dobara login karo.";
  }
  if (lower.includes("current password")) {
    return "Current password galat hai.";
  }
  if (lower.includes("password") && lower.includes("match")) {
    return "Password aur confirm password same nahi hai.";
  }
  if (lower.includes("api server connect nahi ho raha")) {
    return "Server se connect nahi ho pa raha. Dobara try karo.";
  }
  if (lower.includes("api server response time")) {
    return "Server abhi busy hai. Thodi der baad dobara try karo.";
  }
  if (lower.includes("saturday aur sunday ko withdraw service band rahegi")) {
    return "Saturday aur Sunday ko withdraw service band rahegi.";
  }
  if (lower.includes("otp")) {
    return normalized;
  }
  if (lower.includes("password")) {
    return "Password sahi se check karo.";
  }
  if (lower.includes("request failed")) {
    return fallback;
  }

  return normalized;
}

let authFailureListener: AuthFailureListener | null = null;
const DEFAULT_GET_TIMEOUT_MS = 8_000;
const DEFAULT_MUTATION_TIMEOUT_MS = 15_000;

function normalizeApiBaseUrl(value: string) {
  const trimmed = String(value || "").trim();
  if (!trimmed) {
    return "";
  }

  const normalized = trimmed.replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(normalized)) {
    return "";
  }

  return normalized;
}

function getApiBaseUrl() {
  const configuredFromAppConfig =
    normalizeApiBaseUrl(String(Constants.expoConfig?.extra?.apiBaseUrl || "")) ||
    normalizeApiBaseUrl(String(Constants.manifest2?.extra?.expoClient?.extra?.apiBaseUrl || "")) ||
    normalizeApiBaseUrl(String(Constants.manifest?.extra?.apiBaseUrl || ""));

  if (configuredFromAppConfig) {
    return configuredFromAppConfig;
  }

  const configuredFromEnv =
    normalizeApiBaseUrl(process.env.EXPO_PUBLIC_API_BASE_URL || "") ||
    normalizeApiBaseUrl(process.env.EXPO_PUBLIC_API_BASE_URL_PRODUCTION || "") ||
    normalizeApiBaseUrl(process.env.EXPO_PUBLIC_APP_URL || "");

  if (configuredFromEnv) {
    return configuredFromEnv;
  }

  return "https://api.realmatka.in";
}

export function setAuthFailureListener(listener: AuthFailureListener | null) {
  authFailureListener = listener;
}

async function request<T>(path: string, options: RequestOptions = {}) {
  const method = options.method ?? "GET";
  const timeoutMs = options.timeoutMs ?? (method === "GET" ? DEFAULT_GET_TIMEOUT_MS : DEFAULT_MUTATION_TIMEOUT_MS);
  const retries = Math.max(0, Number(options.retries ?? (method === "GET" ? 1 : 0)));
  const url = `${getApiBaseUrl()}${path}`;

  let attempt = 0;

  while (true) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;

    try {
      response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(options.token ? { Authorization: `Bearer ${options.token}` } : {})
        },
        ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
        signal: controller.signal
      });
    } catch (error) {
      clearTimeout(timer);
      const isAbort = error instanceof Error && error.name === "AbortError";
      if (attempt < retries) {
        attempt += 1;
        await new Promise((resolve) => setTimeout(resolve, attempt * 900));
        continue;
      }
      const webCorsHint =
        !isAbort && Platform.OS === "web" && typeof window !== "undefined"
          ? ` Web par CORS: Railway/backend env mein EXTRA_CORS_ORIGINS=${window.location.origin} add karo (comma se multiple origins).`
          : "";
      throw new Error(
        isAbort
          ? `API server response time bahut slow hai. Server ko retry karo: ${getApiBaseUrl()}`
          : `API server connect nahi ho raha. API Base URL check karo: ${getApiBaseUrl()}.${webCorsHint}`
      );
    }

    clearTimeout(timer);

    const payload = (await response.json().catch(() => null)) as ApiEnvelope<T> | null;

    if (!response.ok || !payload?.ok) {
      const error = new ApiError(payload?.error || "Request failed", response.status || 500);
      error.requestId = response.headers.get("x-request-id") || "";
      const shouldRetry = method === "GET" && response.status >= 500 && attempt < retries;
      if (shouldRetry) {
        attempt += 1;
        await new Promise((resolve) => setTimeout(resolve, attempt * 900));
        continue;
      }
      if (error.isAuthError && options.token) {
        authFailureListener?.(options.token);
      }
      throw error;
    }

    return payload.data as T;
  }
}

async function healthRequest() {
  const url = `${getApiBaseUrl()}/health`;
  const response = await fetch(url);
  const payload = (await response.json().catch(() => null)) as HealthSnapshot | null;
  if (!response.ok || !payload?.service) {
    const error = new ApiError(payload && "error" in payload && typeof (payload as any).error === "string" ? (payload as any).error : "Health check failed", response.status || 500);
    error.requestId = response.headers.get("x-request-id") || "";
    throw error;
  }
  return {
    ...payload,
    requestId: response.headers.get("x-request-id") || ""
  } as HealthSnapshot;
}

function queryString(params: Record<string, string | undefined>) {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value != null && value !== "") {
      searchParams.set(key, value);
    }
  }
  const serialized = searchParams.toString();
  return serialized ? `?${serialized}` : "";
}

export const api = {
  login(phone: string, password: string) {
    return request<{ token: string; user: SessionUser }>("/api/auth/login", {
      method: "POST",
      body: { phone, password }
    });
  },

  googleLogin(payload: { accessToken?: string; idToken?: string }) {
    return request<GoogleAuthResponse>("/api/auth/google-login", {
      method: "POST",
      body: payload
    });
  },

  googleRegister(payload: {
    registrationToken: string;
    firstName: string;
    lastName: string;
    phone: string;
    password: string;
    confirmPassword: string;
    referenceCode?: string;
  }) {
    return request<{ token: string; user: SessionUser }>("/api/auth/google-register", {
      method: "POST",
      body: payload
    });
  },

  me(token: string) {
    return request<SessionUser & { walletBalance: number }>("/api/auth/me", { token, retries: 1, timeoutMs: 7_000 });
  },

  logout(token: string) {
    return request<{ success: boolean }>("/api/auth/logout", {
      method: "POST",
      token
    });
  },

  requestOtp(phone: string, purpose: "login" | "register" | "password_reset" | "withdraw") {
    return request<OtpRequestResponse>(
      "/api/auth/request-otp",
      {
        method: "POST",
        body: { phone, purpose }
      }
    );
  },

  otpLogin(phone: string, otp: string, accessToken = "") {
    return request<{ token: string; user: SessionUser }>("/api/auth/otp-login", {
      method: "POST",
      body: { phone, otp, accessToken }
    });
  },

  register(firstName: string, lastName: string, phone: string, otp: string, password: string, confirmPassword: string, referenceCode = "", accessToken = "") {
    return request<{ user: SessionUser & { approvalStatus: string } }>("/api/auth/register", {
      method: "POST",
      body: { firstName, lastName, phone, otp, password, confirmPassword, referenceCode, accessToken }
    });
  },

  forgotPassword(phone: string, otp: string, password: string, confirmPassword: string, accessToken = "") {
    return request<{ success: boolean }>("/api/auth/forgot-password", {
      method: "POST",
      body: { phone, otp, password, confirmPassword, accessToken }
    });
  },

  updatePassword(token: string, currentPassword: string, password: string, confirmPassword: string) {
    return request<{ success: boolean }>("/api/auth/update-password", {
      method: "POST",
      token,
      body: { currentPassword, password, confirmPassword }
    });
  },

  updateMpin(token: string, pin: string, confirmPin: string) {
    return request<{ success: boolean }>("/api/auth/update-mpin", {
      method: "POST",
      token,
      body: { pin, confirmPin }
    });
  },

  verifyMpin(token: string, pin: string) {
    return request<{ verified: boolean }>("/api/auth/verify-mpin", {
      method: "POST",
      token,
      body: { pin }
    });
  },

  listMarkets() {
    return request<MarketItem[]>("/api/markets/list", { retries: 2, timeoutMs: 7_000 });
  },

  getChart(slug: string, chartType: "jodi" | "panna") {
    return request<{ marketSlug: string; chartType: "jodi" | "panna"; rows: string[][] }>(
      `/api/charts/${encodeURIComponent(slug)}${queryString({ type: chartType })}`
    );
  },

  getChartBatch(markets: string[], chartTypes: Array<"jodi" | "panna"> = ["jodi", "panna"]) {
    return request<ChartBatchPayload>(
      `/api/charts/batch${queryString({
        markets: markets.join(","),
        types: chartTypes.join(",")
      })}`
    );
  },

  async getSettings() {
    return request<SettingItem[]>("/api/settings", { retries: 1, timeoutMs: 6_000 });
  },

  boardHelper(boardLabel: string, query = "", sessionType?: "Open" | "Close", first = "", second = "") {
    return request<BoardHelperData>(
      `/api/bids/board-helper${queryString({
        boardLabel,
        query,
        sessionType,
        first,
        second
      })}`
    );
  },

  bidHistory(token: string, limit = 5000) {
    return request<BidEntry[]>(`/api/bids/history${queryString({ limit: String(limit) })}`, { token });
  },

  cricketMatches() {
    return request<CricketMatchesPayload>("/api/cricket/matches", { retries: 1, timeoutMs: 7_000 });
  },

  cricketHistory(token: string, limit = 200) {
    return request<CricketBet[]>(`/api/cricket/history${queryString({ limit: String(limit) })}`, { token });
  },

  placeCricketBet(token: string, payload: { matchId: string; marketType: string; selection: string; amount: number }) {
    return request<CricketBet>("/api/cricket/place", {
      method: "POST",
      token,
      body: payload
    });
  },

  placeBids(
    token: string,
    payload: {
      requestId: string;
      market: string;
      boardLabel: string;
      sessionType: "Open" | "Close" | "NA";
      items: Array<{ digit: string; points: number; gameType: string }>;
    }
  ) {
    return request<BidEntry[]>("/api/bids/place", {
      method: "POST",
      token,
      body: payload
    });
  },

  walletBalance(token: string) {
    return request<{ balance: number }>("/api/wallet/balance", { token });
  },

  walletHistory(token: string, limit = 5000) {
    return request<WalletEntry[]>(`/api/wallet/history${queryString({ limit: String(limit) })}`, { token });
  },

  deposit(token: string, amount: number, referenceId = "", proofUrl = "", note = "") {
    return request<WalletEntry>("/api/wallet/deposit", {
      method: "POST",
      token,
      body: { amount, referenceId, proofUrl, note }
    });
  },

  withdraw(token: string, amount: number, referenceId = "", proofUrl = "", note = "") {
    return request<WalletEntry>("/api/wallet/withdraw", {
      method: "POST",
      token,
      body: { amount, referenceId, proofUrl, note }
    });
  },

  requestWithdrawOtp(token: string, amount: number) {
    return request<OtpRequestResponse>(
      "/api/wallet/withdraw/request-otp",
      {
        method: "POST",
        token,
        body: { amount }
      }
    );
  },

  confirmWithdraw(token: string, amount: number, pin: string, referenceId = "", proofUrl = "", note = "") {
    return request<WalletEntry>("/api/wallet/withdraw/confirm", {
      method: "POST",
      token,
      body: { amount, pin, referenceId, proofUrl, note }
    });
  },

  listBankAccounts(token: string) {
    return request<BankAccount[]>("/api/bank/list", { token });
  },

  addBankAccount(token: string, accountNumber: string, holderName: string, ifsc: string, pin: string) {
    return request<BankAccount>("/api/bank/add", {
      method: "POST",
      token,
      body: { accountNumber, holderName, ifsc, pin }
    });
  },

  updateProfile(token: string, name: string, phone: string) {
    return request<SessionUser & { walletBalance: number }>("/api/profile/update", {
      method: "POST",
      token,
      body: { name, phone }
    });
  },

  getReferralOverview(token: string) {
    return request<{
      referralCode: string;
      referredCount: number;
      referralIncomeTotal: number;
      referredUsers: Array<{ id: string; name: string; phone: string; joinedAt: string | null }>;
    }>("/api/profile/referrals", { token });
  },

  notificationHistory(token: string, limit = 50) {
    return request<Array<{ id: string; title: string; body: string; channel: string; read: boolean; createdAt: string }>>(
      `/api/notifications/history${queryString({ limit: String(limit) })}`,
      { token }
    );
  },

  registerNotificationDevice(token: string, platform: string, deviceToken: string) {
    return request<{ id: string; token: string; platform: string }>("/api/notifications/devices/register", {
      method: "POST",
      token,
      body: { platform, token: deviceToken }
    });
  },

  markNotificationsRead(token: string, notificationId?: string) {
    return request<{ updatedCount: number }>("/api/notifications/read", {
      method: "POST",
      token,
      body: notificationId ? { notificationId } : {}
    });
  },

  getSupportConversation(token: string, limit = 80) {
    return request<{
      conversation: { id: string; status: string };
      messages: Array<{
        id: string;
        conversationId: string;
        senderRole: "user" | "support";
        senderUserId: string | null;
        text: string;
        readByUser: boolean;
        readByAdmin: boolean;
        createdAt: string;
      }>;
    }>(`/api/chat/conversation${queryString({ limit: String(limit) })}`, { token });
  },

  sendSupportMessage(token: string, text: string) {
    return request<{ conversationId: string; message: unknown }>("/api/chat/send", {
      method: "POST",
      token,
      body: { text }
    });
  },

  createPaymentOrder(token: string, amount: number, platform = "web") {
    return request<PaymentOrder>("/api/payments/create-order", {
      method: "POST",
      token,
      body: { amount, platform }
    });
  },

  getDepositConfig() {
    return request<DepositConfig>("/api/payments/deposit-config", { retries: 1, timeoutMs: 6_000 });
  },

  confirmPaymentOrder(
    token: string,
    referenceId: string,
    payload: {
      razorpayPaymentId: string;
      razorpayOrderId: string;
      razorpaySignature: string;
    }
  ) {
    return request<PaymentOrder>("/api/payments/confirm", {
      method: "POST",
      token,
      body: {
        referenceId,
        razorpayPaymentId: payload.razorpayPaymentId,
        razorpayOrderId: payload.razorpayOrderId,
        razorpaySignature: payload.razorpaySignature
      }
    });
  },

  getPaymentOrderStatus(token: string, referenceId: string) {
    return request<PaymentOrder>("/api/payments/status", {
      method: "POST",
      token,
      body: { referenceId }
    });
  },

  startUpiDeposit(token: string, amount: number, appName: string, referenceId: string) {
    return request<WalletEntry>("/api/payments/upi-start", {
      method: "POST",
      token,
      body: { amount, appName, referenceId }
    });
  },

  reportUpiDeposit(
    token: string,
    payload: {
      referenceId: string;
      appName: string;
      utr: string;
      appReportedStatus: "SUBMITTED" | "FAILED" | "CANCELLED";
      rawResponse?: string;
    }
  ) {
    return request<WalletEntry>("/api/payments/upi-report", {
      method: "POST",
      token,
      body: payload
    });
  },

  getUpiDepositStatus(token: string, referenceId: string) {
    return request<WalletEntry>("/api/payments/upi-status", {
      method: "POST",
      token,
      body: { referenceId }
    });
  },

  health() {
    return healthRequest();
  }
};

export function formatApiError(error: unknown, fallback = "Request failed") {
  const message = error instanceof Error ? error.message : fallback;
  return mapUserFacingErrorMessage(message, fallback);
}
