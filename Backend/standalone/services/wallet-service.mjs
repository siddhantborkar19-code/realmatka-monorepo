import { issueOtp, verifyOtp } from "../routes/auth-otp.mjs";
import { findUserByPhone, verifyCredential } from "../db.mjs";
import { addWalletEntry, getBankAccountsForUser, getUserBalance, getWalletEntriesForUser } from "../stores/wallet-store.mjs";

export const MIN_WITHDRAW_AMOUNT = 500;
const WITHDRAW_WEEKEND_CLOSED_MESSAGE = "Saturday aur Sunday ko withdraw service band rahegi.";
const WITHDRAW_TIME_CLOSED_MESSAGE = "Withdraw request timing 11:00 AM se 11:00 PM tak hi available hai.";
const WITHDRAW_START_MINUTES = 11 * 60;
const WITHDRAW_END_MINUTES = 23 * 60;

function normalizeAmount(value) {
  return Number(value ?? 0);
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

function isWithdrawTimeClosed(date = new Date()) {
  const currentMinutes = getIndiaMinutes(date);
  return currentMinutes < WITHDRAW_START_MINUTES || currentMinutes >= WITHDRAW_END_MINUTES;
}

function validateWithdrawAmount(amount) {
  if (!Number.isFinite(amount) || amount <= 0) {
    return "Valid withdrawal amount is required";
  }
  if (amount < MIN_WITHDRAW_AMOUNT) {
    return `Minimum withdraw is Rs ${MIN_WITHDRAW_AMOUNT}`;
  }
  return "";
}

async function ensureWithdrawAllowed(userId, amount) {
  if (isWithdrawWeekendClosed()) {
    return { ok: false, status: 400, error: WITHDRAW_WEEKEND_CLOSED_MESSAGE };
  }
  if (isWithdrawTimeClosed()) {
    return { ok: false, status: 400, error: WITHDRAW_TIME_CLOSED_MESSAGE };
  }

  const validationError = validateWithdrawAmount(amount);
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

export async function createDepositRequest(userId, amountInput) {
  const amount = normalizeAmount(amountInput);
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
    afterBalance: beforeBalance
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
