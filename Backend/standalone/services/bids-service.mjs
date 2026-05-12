import { getBidsForUser } from "../stores/bids-store.mjs";

export async function getBidHistory(userId, limit = 5000) {
  return getBidsForUser(userId, limit);
}
