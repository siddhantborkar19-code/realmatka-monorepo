import {
  addSupportChatMessage,
  getSupportConversationBundleForUser,
  getSupportConversationDetailsForAdmin,
  listSupportConversations,
  markSupportMessagesReadByAdmin,
  markSupportMessagesReadByUser,
  updateSupportConversationStatus
} from "../stores/chat-store.mjs";

export async function getUserConversation(userId, options = {}) {
  const bundle = await getSupportConversationBundleForUser(userId, options);
  await markSupportMessagesReadByUser(bundle.conversation.id);
  return bundle;
}

export async function sendUserSupportMessage(user, text) {
  const normalizedText = String(text ?? "").trim();
  if (!normalizedText) {
    return { ok: false, status: 400, error: "Message text is required" };
  }
  if (normalizedText.length > 1000) {
    return { ok: false, status: 400, error: "Message is too long" };
  }

  const bundle = await getSupportConversationBundleForUser(user.id);
  const message = await addSupportChatMessage({
    conversationId: bundle.conversation.id,
    senderRole: "user",
    senderUserId: user.id,
    text: normalizedText,
    readByUser: true,
    readByAdmin: false
  });

  return { ok: true, data: { conversationId: bundle.conversation.id, message } };
}

export async function getAdminConversations(options = {}) {
  return listSupportConversations(options);
}

export async function getAdminConversationMessages(conversationId, options = {}) {
  const normalizedConversationId = String(conversationId ?? "").trim();
  if (!normalizedConversationId) {
    return { ok: false, status: 400, error: "conversationId is required" };
  }

  await markSupportMessagesReadByAdmin(normalizedConversationId);
  const details = await getSupportConversationDetailsForAdmin(normalizedConversationId, options);
  if (!details) {
    return { ok: false, status: 404, error: "Conversation not found" };
  }

  return { ok: true, data: details };
}

export async function sendAdminSupportMessage(adminUserId, conversationId, text) {
  const normalizedConversationId = String(conversationId ?? "").trim();
  const normalizedText = String(text ?? "").trim();
  if (!normalizedConversationId || !normalizedText) {
    return { ok: false, status: 400, error: "conversationId and text are required" };
  }
  if (normalizedText.length > 1000) {
    return { ok: false, status: 400, error: "Message is too long" };
  }

  const details = await getSupportConversationDetailsForAdmin(normalizedConversationId);
  if (!details) {
    return { ok: false, status: 404, error: "Conversation not found" };
  }

  const message = await addSupportChatMessage({
    conversationId: normalizedConversationId,
    senderRole: "support",
    senderUserId: adminUserId,
    text: normalizedText,
    readByUser: false,
    readByAdmin: true
  });

  return { ok: true, data: { conversationId: normalizedConversationId, message } };
}

export async function updateAdminConversationStatus(conversationId, status) {
  const normalizedConversationId = String(conversationId ?? "").trim();
  const normalizedStatus = String(status ?? "").trim().toUpperCase();
  if (!normalizedConversationId || !["OPEN", "PENDING", "RESOLVED"].includes(normalizedStatus)) {
    return { ok: false, status: 400, error: "conversationId and valid status are required" };
  }

  const details = await getSupportConversationDetailsForAdmin(normalizedConversationId);
  if (!details) {
    return { ok: false, status: 404, error: "Conversation not found" };
  }

  const conversation = await updateSupportConversationStatus(normalizedConversationId, normalizedStatus);
  return { ok: true, data: { conversation } };
}
