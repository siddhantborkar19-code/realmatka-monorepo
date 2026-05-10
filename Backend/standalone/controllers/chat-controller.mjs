import { fail, getJsonBody, ok } from "../http.mjs";
import { requireAdminOrSupportOperator, requireAuthenticatedUser } from "../middleware/auth-middleware.mjs";
import {
  getAdminConversationMessages,
  getAdminConversations,
  getUserConversation,
  sendAdminSupportMessage,
  sendUserSupportMessage,
  updateAdminConversationStatus
} from "../services/chat-service.mjs";

export async function userConversationController(request) {
  const auth = await requireAuthenticatedUser(request);
  if (auth.response) return auth.response;
  const url = new URL(request.url);
  const limit = Number(url.searchParams.get("limit") || 80);
  return ok(await getUserConversation(auth.user.id, { limit }), request);
}

export async function userSendController(request) {
  const auth = await requireAuthenticatedUser(request);
  if (auth.response) return auth.response;
  const body = await getJsonBody(request);
  const result = await sendUserSupportMessage(auth.user, body.text);
  if (!result.ok) return fail(result.error, result.status, request);
  return ok(result.data, request);
}

export async function adminConversationsController(request) {
  const auth = await requireAdminOrSupportOperator(request);
  if (auth.response) return auth.response;
  const url = new URL(request.url);
  const limit = Number(url.searchParams.get("limit") || 50);
  const offset = Number(url.searchParams.get("offset") || 0);
  const filter = String(url.searchParams.get("filter") || "all");
  const search = String(url.searchParams.get("search") || "");
  return ok(await getAdminConversations({ limit, offset, filter, search }), request);
}

export async function adminMessagesController(request) {
  const auth = await requireAdminOrSupportOperator(request);
  if (auth.response) return auth.response;
  const url = new URL(request.url);
  const limit = Number(url.searchParams.get("limit") || 100);
  const result = await getAdminConversationMessages(url.searchParams.get("conversationId"), { limit });
  if (!result.ok) return fail(result.error, result.status, request);
  return ok(result.data, request);
}

export async function adminSendController(request) {
  const auth = await requireAdminOrSupportOperator(request);
  if (auth.response) return auth.response;
  const body = await getJsonBody(request);
  const result = await sendAdminSupportMessage(auth.user.id, body.conversationId, body.text);
  if (!result.ok) return fail(result.error, result.status, request);
  return ok(result.data, request);
}

export async function adminUpdateStatusController(request) {
  const auth = await requireAdminOrSupportOperator(request);
  if (auth.response) return auth.response;
  const body = await getJsonBody(request);
  const result = await updateAdminConversationStatus(body.conversationId, body.status);
  if (!result.ok) return fail(result.error, result.status, request);
  return ok(result.data, request);
}
