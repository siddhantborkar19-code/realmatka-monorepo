import { fail, getJsonBody, ok } from "../http.mjs";
import { buildMsg91WidgetUrl } from "../routes/auth-otp.mjs";
import { requireAuthenticatedUser } from "../middleware/auth-middleware.mjs";
import {
  confirmWithdrawRequest,
  createDepositRequest,
  createWithdrawRequest,
  getWalletBalance,
  getWalletHistory,
  sendWithdrawOtp
} from "../services/wallet-service.mjs";

export async function walletHistoryController(request) {
  const auth = await requireAuthenticatedUser(request);
  if (auth.response) return auth.response;
  const url = new URL(request.url);
  const limit = Number(url.searchParams.get("limit") || 5000);
  return ok(await getWalletHistory(auth.user.id, limit), request);
}

export async function walletBalanceController(request) {
  const auth = await requireAuthenticatedUser(request);
  if (auth.response) return auth.response;
  return ok({ balance: await getWalletBalance(auth.user.id) }, request);
}

export async function walletDepositController(request) {
  const auth = await requireAuthenticatedUser(request);
  if (auth.response) return auth.response;
  const body = await getJsonBody(request);
  const result = await createDepositRequest(auth.user.id, body.amount);
  if (!result.ok) return fail(result.error, result.status, request);
  return ok(result.data, request);
}

export async function walletWithdrawController(request) {
  const auth = await requireAuthenticatedUser(request);
  if (auth.response) return auth.response;
  const body = await getJsonBody(request);
  const result = await createWithdrawRequest(auth.user.id, body);
  if (!result.ok) return fail(result.error, result.status, request);
  return ok(result.data, request);
}

export async function walletRequestWithdrawOtpController(request) {
  const auth = await requireAuthenticatedUser(request);
  if (auth.response) return auth.response;
  const body = await getJsonBody(request);
  const result = await sendWithdrawOtp(auth.user, body.amount);
  if (!result.ok) return fail(result.error, result.status, request);
  if (result.data?.provider === "msg91" && result.data?.mode === "widget") {
    result.data.widgetUrl = buildMsg91WidgetUrl(request, auth.user.phone, "withdraw");
  }
  return ok(result.data, request);
}

export async function walletConfirmWithdrawController(request) {
  const auth = await requireAuthenticatedUser(request);
  if (auth.response) return auth.response;
  const body = await getJsonBody(request);
  const result = await confirmWithdrawRequest(auth.user, body);
  if (!result.ok) return fail(result.error, result.status, request);
  return ok(result.data, request);
}
