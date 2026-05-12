import { ok } from "../http.mjs";
import { requireAuthenticatedUser } from "../middleware/auth-middleware.mjs";
import { getBidHistory } from "../services/bids-service.mjs";

export async function bidsHistoryController(request) {
  const auth = await requireAuthenticatedUser(request);
  if (auth.response) return auth.response;
  const url = new URL(request.url);
  const limit = Number(url.searchParams.get("limit") || 5000);
  return ok(await getBidHistory(auth.user.id, limit), request);
}
