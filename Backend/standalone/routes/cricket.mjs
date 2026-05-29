import { corsPreflight, fail, getJsonBody, ok } from "../http.mjs";
import { requireAdminOrCricketOperator, requireAuthenticatedUser } from "../middleware/auth-middleware.mjs";
import {
  getAdminCricketBets,
  getCricketHistory,
  getCricketMatches,
  placeCricketBet,
  saveAdminCricketMatch,
  settleAdminCricketResult
} from "../services/cricket-service.mjs";

export function options(request) {
  return corsPreflight(request);
}

export async function matches(request) {
  return ok(await getCricketMatches(), request);
}

export async function history(request) {
  const auth = await requireAuthenticatedUser(request);
  if (auth.response) return auth.response;
  const url = new URL(request.url);
  const limit = Number(url.searchParams.get("limit") || 200);
  return ok(await getCricketHistory(auth.user.id, limit), request);
}

export async function place(request) {
  const auth = await requireAuthenticatedUser(request);
  if (auth.response) return auth.response;
  const result = await placeCricketBet(auth.user, await getJsonBody(request));
  if (!result.ok) return fail(result.error, result.status, request);
  return ok(result.data, request);
}

export async function adminMatches(request) {
  const admin = await requireAdminOrCricketOperator(request);
  if (admin.response) return admin.response;
  return ok(await getCricketMatches({ admin: true }), request);
}

export async function adminSaveMatch(request) {
  const admin = await requireAdminOrCricketOperator(request);
  if (admin.response) return admin.response;
  const result = await saveAdminCricketMatch(await getJsonBody(request));
  if (!result.ok) return fail(result.error, result.status, request);
  return ok(result.data, request);
}

export async function adminBets(request) {
  const admin = await requireAdminOrCricketOperator(request);
  if (admin.response) return admin.response;
  const url = new URL(request.url);
  return ok(await getAdminCricketBets(String(url.searchParams.get("matchId") || ""), Number(url.searchParams.get("limit") || 500)), request);
}

export async function adminSettle(request) {
  const admin = await requireAdminOrCricketOperator(request);
  if (admin.response) return admin.response;
  const result = await settleAdminCricketResult(await getJsonBody(request));
  if (!result.ok) return fail(result.error, result.status, request);
  return ok(result.data, request);
}
