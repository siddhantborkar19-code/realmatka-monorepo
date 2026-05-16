import { issueOtp, verifyOtp } from "../routes/auth-otp.mjs";
import { findUserByPhone, verifyCredential } from "../db.mjs";
import { getAppSettings } from "../stores/admin-store.mjs";
import { addWalletEntry, getBankAccountsForUser, getUserBalance, getWalletEntriesForUser } from "../stores/wallet-store.mjs";

export const MIN_WITHDRAW_AMOUNT = 500;
const DEFAULT_WITHDRAW_MAX_AMOUNT = 99999;
const DEFAULT_WITHDRAW_MULTIPLE = 100;
const WITHDRAW_WEEKEND_CLOSED_MESSAGE = "Saturday aur Sunday ko withdraw service band rahegi.";
const WITHDRAW_TIME_CLOSED_MESSAGE = "Withdraw request timing 11:00 AM se 11:00 PM tak hi available hai.";
const WITHDRAW_START_MINUTES = 11 * 60;
const WITHDRAW_END_MINUTES = 23 * 60;

function normalizeAmount(value) {
  return Number(value ?? 0);
}

function toSettingsMap(items) {
  return new Map((items || []).map((item) => [String(item.key || "").trim(), String(item.value || "").trim()]));
}

function readSettingBoolean(settings, key, fallback) {
  const raw = String(settings.get(key) ?? "").trim().toLowerCase();
  if (!raw) {
    return fallback;
  }
  return !["0", "false", "no", "off", "disabled"].includes(raw);
}

function readSettingNumber(settings, key, fallback) {
  const value = Number(String(settings.get(key) ?? "").trim());
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function readSettingText(settings, key, fallback) {
  const value = String(settings.get(key) ?? "").trim();
  return value || fallback;
}

function parseTimeToMinutes(value, fallback) {
  const match = String(value || "").trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  if (!match) {
    return fallback;
  }
  let hour = Number(match[1]);
  const minute = Number(match[2] ?? 0);
  const meridiem = String(match[3] || "").toUpperCase();
  if (!Number.isFinite(hour) || !Number.isFinite(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return fallback;
  }
  if (meridiem === "PM" && hour < 12) hour += 12;
  if (meridiem === "AM" && hour === 12) hour = 0;
  return hour * 60 + minute;
}

async function getWithdrawConfig() {
  const settings = toSettingsMap(await getAppSettings());
  const minAmount = Math.max(1, readSettingNumber(settings, "wallet_withdraw_min_amount", MIN_WITHDRAW_AMOUNT));
  const maxAmount = Math.max(minAmount, readSettingNumber(settings, "wallet_withdraw_max_amount", DEFAULT_WITHDRAW_MAX_AMOUNT));
  const multiple = Math.max(1, readSettingNumber(settings, "wallet_withdraw_multiple", DEFAULT_WITHDRAW_MULTIPLE));
  return {
    minAmount,
    maxAmount,
    multiple,
    weekendClosed: readSettingBoolean(settings, "wallet_withdraw_weekend_closed", true),
    startMinutes: parseTimeToMinutes(settings.get("wallet_withdraw_start_time"), WITHDRAW_START_MINUTES),
    endMinutes: parseTimeToMinutes(settings.get("wallet_withdraw_end_time"), WITHDRAW_END_MINUTES),
    weekendMessage: readSettingText(settings, "wallet_withdraw_weekend_message", WITHDRAW_WEEKEND_CLOSED_MESSAGE),
    timeMessage: readSettingText(settings, "wallet_withdraw_time_message", WITHDRAW_TIME_CLOSED_MESSAGE)
  };
}

function getIndiaWeekday(date = new Date()) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    weekday: "long"
  }).format(date);
}

function getIndiaMinutes(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);
  return hour * 60 + minute;
}

function isWithdrawWeekendClosed(date = new Date()) {
  const weekday = getIndiaWeekday(date);
  return weekday === "Saturday" || weekday === "Sunday";
}

function isWithdrawTimeClosed(config, date = new Date()) {
  const currentMinutes = getIndiaMinutes(date);
  return currentMinutes < config.startMinutes || currentMinutes >= config.endMinutes;
}

function validateWithdrawAmount(amount, config) {
  if (!Number.isFinite(amount) || amount <= 0) {
    return "Valid withdrawal amount is required";
  }
  if (amount < config.minAmount) {
    return `Minimum withdraw is Rs ${config.minAmount}`;
  }
  if (amount > config.maxAmount) {
    return `Maximum withdraw is Rs ${config.maxAmount}`;
  }
  if (amount % config.multiple !== 0) {
    return `Withdraw amount must be a multiple of Rs ${config.multiple}`;
  }
  return "";
}

async function ensureWithdrawAllowed(userId, amount) {
  const config = await getWithdrawConfig();
  if (config.weekendClosed && isWithdrawWeekendClosed()) {
    return { ok: false, status: 400, error: config.weekendMessage };
  }
  if (isWithdrawTimeClosed(config)) {
    return { ok: false, status: 400, error: config.timeMessage };
  }

  const validationError = validateWithdrawAmount(amount, config);
  if (validationError) {
    return { ok: false, status: 400, error: validationError };
  }

  const bankAccounts = await getBankAccountsForUser(userId);
  if (!bankAccounts.length) {
    return { ok: false, status: 400, error: "Add bank details before requesting a withdrawal" };
  }

  const beforeBalance = await getUserBalance(userId);
  if (amount > beforeBalance) {
    return { ok: false, status: 400, error: "Insufficient balance" };
  }

  const walletEntries = await getWalletEntriesForUser(userId);
  const existingPendingWithdraw = walletEntries.find(
    (entry) => entry.type === "WITHDRAW" && (entry.status === "INITIATED" || entry.status === "BACKOFFICE")
  );
  if (existingPendingWithdraw) {
    return { ok: false, status: 400, error: "Your previous withdraw request is still pending." };
  }

  return { ok: true, data: { beforeBalance } };
}

export async function getWalletHistory(userId, limit = 5000) {
  return getWalletEntriesForUser(userId, limit);
}

export async function getWalletBalance(userId) {
  return getUserBalance(userId);
}

export async function createDepositRequest(userId, amountInput, payload = {}) {
  const amount = normalizeAmount(amountInput);
  const referenceId = String(payload.referenceId ?? "").trim();
  const proofUrl = String(payload.proofUrl ?? "").trim();
  const note = String(payload.note ?? "").trim();
  if (amount <= 0) {
    return { ok: false, status: 400, error: "Amount must be greater than 0" };
  }

  const beforeBalance = await getUserBalance(userId);
  const entry = await addWalletEntry({
    userId,
    type: "DEPOSIT",
    status: "INITIATED",
    amount,
    beforeBalance,
    afterBalance: beforeBalance,
    referenceId,
    proofUrl,
    note
  });

  return { ok: true, data: entry };
}

export async function createWithdrawRequest(userId, payload) {
  const amount = normalizeAmount(payload.amount);
  const referenceId = String(payload.referenceId ?? "").trim();
  const proofUrl = String(payload.proofUrl ?? "").trim();
  const note = String(payload.note ?? "").trim();

  const guard = await ensureWithdrawAllowed(userId, amount);
  if (!guard.ok) {
    return guard;
  }

  const entry = await addWalletEntry({
    userId,
    type: "WITHDRAW",
    status: "INITIATED",
    amount,
    beforeBalance: guard.data.beforeBalance,
    afterBalance: guard.data.beforeBalance,
    referenceId,
    proofUrl,
    note
  });

  return { ok: true, data: entry };
}

export async function sendWithdrawOtp(user, amountInput) {
  const amount = normalizeAmount(amountInput);
  const guard = await ensureWithdrawAllowed(user.id, amount);
  if (!guard.ok) {
    return guard;
  }

  try {
    const otpState = await issueOtp(user.phone, "withdraw");
    return {
      ok: true,
      data: {
        sent: otpState.sent,
        expiresAt: otpState.expiresAt,
        provider: otpState.provider,
        devCode: otpState.devCode,
        mode: otpState.mode ?? "otp"
      }
    };
  } catch (error) {
    return { ok: false, status: 500, error: error instanceof Error ? error.message : "Unable to send withdraw OTP" };
  }
}

export async function confirmWithdrawRequest(user, payload) {
  const amount = normalizeAmount(payload.amount);
  const otp = String(payload.otp ?? "").trim();
  const pin = String(payload.pin ?? "").trim();
  const accessToken = String(payload.accessToken ?? "").trim();
  const referenceId = String(payload.referenceId ?? "").trim();
  const proofUrl = String(payload.proofUrl ?? "").trim();
  const note = String(payload.note ?? "").trim();

  const guard = await ensureWithdrawAllowed(user.id, amount);
  if (!guard.ok) {
    return guard;
  }

  if (pin) {
    if (!/^[0-9]{4}$/.test(pin)) {
      return { ok: false, status: 400, error: "PIN must be exactly 4 digits" };
    }

    const fullUser = await findUserByPhone(user.phone);
    if (!fullUser || !fullUser.hasMpin) {
      return { ok: false, status: 400, error: "PIN is not set for this account" };
    }
    if (!verifyCredential(pin, fullUser.mpinHash)) {
      return { ok: false, status: 400, error: "Wrong PIN. Try again." };
    }

    const entry = await addWalletEntry({
      userId: user.id,
      type: "WITHDRAW",
      status: "INITIATED",
      amount,
      beforeBalance: guard.data.beforeBalance,
      afterBalance: guard.data.beforeBalance,
      referenceId,
      proofUrl,
      note
    });

    return { ok: true, data: entry };
  }

  if (!accessToken && !/^[0-9]{6}$/.test(otp)) {
    return { ok: false, status: 400, error: "Valid OTP verification is required" };
  }

  let validOtp = false;
  try {
    validOtp = await verifyOtp(user.phone, "withdraw", otp, accessToken);
  } catch (error) {
    return { ok: false, status: 500, error: error instanceof Error ? error.message : "Unable to verify withdraw OTP" };
  }

  if (!validOtp) {
    return { ok: false, status: 400, error: "Invalid or expired OTP" };
  }

  const entry = await addWalletEntry({
    userId: user.id,
    type: "WITHDRAW",
    status: "INITIATED",
    amount,
    beforeBalance: guard.data.beforeBalance,
    afterBalance: guard.data.beforeBalance,
    referenceId,
    proofUrl,
    note
  });

  return { ok: true, data: entry };
}
