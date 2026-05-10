import { fail, getJsonBody, ok } from "../http.mjs";
import { hasFullAdminRole, hasResultEngineRole, requireAdminPanelUser, requireAdminUser } from "../middleware/auth-middleware.mjs";
import { addAuditLog, getAuditLogs } from "../stores/admin-store.mjs";
import {
  cleanupWalletData,
  createWalletAdjustment,
  getAdminUserDetail,
  listAdminBidsPage,
  listAdminUsers,
  listWalletRequests,
  processWalletRequestAction,
  updateAdminUserApproval,
  updateAdminUserStatus
} from "../services/admin-user-wallet-service.mjs";

function roundAmount(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

export async function adminUsersController(request) {
  const admin = await requireAdminUser(request);
  if (admin.response) return admin.response;
  return ok(await listAdminUsers(), request);
}

export async function adminUserDetailController(request) {
  const admin = await requireAdminUser(request);
  if (admin.response) return admin.response;
  const userId = String(new URL(request.url).searchParams.get("userId") ?? "");
  if (!userId) return fail("userId is required", 400, request);
  const detail = await getAdminUserDetail(userId);
  if (!detail) return fail("User not found", 404, request);
  return ok(detail, request);
}

export async function adminUserApprovalController(request) {
  const admin = await requireAdminUser(request);
  if (admin.response) return admin.response;
  const body = await getJsonBody(request);
  const userId = String(body.userId ?? "");
  const action = String(body.action ?? "");
  if (!userId || !["approve", "reject"].includes(action)) {
    return fail("userId and valid action are required", 400, request);
  }

  const result = await updateAdminUserApproval(userId, action);
  if (!result.ok) return fail(result.error, result.status, request);

  await addAuditLog({
    actorUserId: admin.user.id,
    action: result.nextStatus === "Approved" ? "USER_APPROVED" : "USER_REJECTED",
    entityType: "user",
    entityId: result.user.id,
    details: JSON.stringify({
      phone: result.user.phone,
      approvalStatus: result.user.approvalStatus,
      signupBonusGranted: result.user.signupBonusGranted
    })
  });

  return ok({ user: result.user }, request);
}

export async function adminWalletRequestsController(request) {
  const admin = await requireAdminUser(request);
  if (admin.response) return admin.response;
  return ok(await listWalletRequests(false), request);
}

export async function adminWalletRequestHistoryController(request) {
  const admin = await requireAdminUser(request);
  if (admin.response) return admin.response;
  return ok(await listWalletRequests(true), request);
}

export async function adminWalletRequestActionController(request) {
  const admin = await requireAdminUser(request);
  if (admin.response) return admin.response;
  const body = await getJsonBody(request);
  const result = await processWalletRequestAction({
    requestId: String(body.requestId ?? ""),
    action: String(body.action ?? ""),
    note: String(body.note ?? "").trim(),
    referenceId: String(body.referenceId ?? "").trim(),
    proofUrl: String(body.proofUrl ?? "").trim()
  });
  if (!result.ok) return fail(result.error, result.status, request);

  await addAuditLog({
    actorUserId: admin.user.id,
    action: result.auditAction,
    entityType: "wallet_request",
    entityId: result.request.id,
    details: JSON.stringify(result.auditDetails)
  });

  return ok({ request: result.request, settlementEntry: result.settlementEntry }, request);
}

export async function adminUserStatusController(request) {
  const admin = await requireAdminUser(request);
  if (admin.response) return admin.response;
  const body = await getJsonBody(request);
  const userId = String(body.userId ?? "");
  const action = String(body.action ?? "");
  const note = String(body.note ?? "");
  if (!userId || !["block", "unblock", "deactivate", "activate"].includes(action)) {
    return fail("userId and valid action are required", 400, request);
  }

  const updatedUser = await updateAdminUserStatus(userId, action, note);
  if (!updatedUser) return fail("User not found", 404, request);

  await addAuditLog({
    actorUserId: admin.user.id,
    action: `USER_${action.toUpperCase()}`,
    entityType: "user",
    entityId: updatedUser.id,
    details: JSON.stringify({
      blockedAt: updatedUser.blockedAt,
      deactivatedAt: updatedUser.deactivatedAt,
      statusNote: updatedUser.statusNote
    })
  });

  return ok({ user: updatedUser }, request);
}

export async function adminWalletAdjustmentController(request) {
  const admin = await requireAdminUser(request);
  if (admin.response) return admin.response;
  const body = await getJsonBody(request);
  const userId = String(body.userId ?? "");
  const mode = String(body.mode ?? "").toLowerCase();
  const note = String(body.note ?? "").trim();
  const amount = roundAmount(Number(body.amount ?? 0));
  if (!userId || !["credit", "debit"].includes(mode) || amount <= 0) {
    return fail("userId, mode, and positive amount are required", 400, request);
  }

  const result = await createWalletAdjustment({ userId, mode, amount, note });
  if (!result.ok) return fail(result.error, result.status, request);

  await addAuditLog({
    actorUserId: admin.user.id,
    action: mode === "credit" ? "WALLET_CREDIT" : "WALLET_DEBIT",
    entityType: "wallet_entry",
    entityId: result.entry.id,
    details: JSON.stringify({ userId, amount, note: note || null })
  });

  return ok({ entry: result.entry }, request);
}

export async function adminCleanupWalletTestDataController(request) {
  const admin = await requireAdminUser(request);
  if (admin.response) return admin.response;
  const body = await getJsonBody(request);
  const types = Array.isArray(body.types) ? body.types : ["WITHDRAW"];
  const result = await cleanupWalletData({
    userId: String(body.userId ?? "").trim(),
    phone: String(body.phone ?? "").trim(),
    types
  });
  if (!result.ok) return fail(result.error, result.status, request);

  await addAuditLog({
    actorUserId: admin.user.id,
    action: "WALLET_TEST_DATA_CLEANUP",
    entityType: "wallet_entry",
    entityId: result.targetUser.id,
    details: JSON.stringify({
      userId: result.targetUser.id,
      phone: result.targetUser.phone,
      types,
      deletedCount: result.result.deletedCount,
      balance: result.result.balance
    })
  });

  return ok({
    userId: result.targetUser.id,
    phone: result.targetUser.phone,
    deletedCount: result.result.deletedCount,
    balance: result.result.balance
  }, request);
}

export async function adminBidsListController(request) {
  const admin = await requireAdminUser(request);
  if (admin.response) return admin.response;
  const url = new URL(request.url);
  const limit = Number(url.searchParams.get("limit") ?? 50);
  const offset = Number(url.searchParams.get("offset") ?? 0);
  const search = String(url.searchParams.get("search") ?? "");
  const status = String(url.searchParams.get("status") ?? "all");
  const from = String(url.searchParams.get("from") ?? "");
  const to = String(url.searchParams.get("to") ?? "");
  return ok(
    await listAdminBidsPage({
      limit,
      offset,
      search,
      status,
      from,
      to
    }),
    request
  );
}

export async function adminAuditLogsController(request) {
  const admin = await requireAdminPanelUser(request);
  if (admin.response) return admin.response;
  const logs = await getAuditLogs(200);
  if (hasFullAdminRole(admin.user.role)) {
    return ok(logs.slice(0, 100), request);
  }
  if (hasResultEngineRole(admin.user.role)) {
    const allowedActions = new Set(["CHART_UPDATE", "MARKET_UPDATE", "MARKET_SETTLE", "MARKET_RESET", "MARKET_RESETTLE"]);
    return ok(logs.filter((item) => allowedActions.has(item.action) && ["chart", "market"].includes(item.entityType)).slice(0, 100), request);
  }
  return ok([], request);
}
