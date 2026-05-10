import { fail, getJsonBody, ok } from "../http.mjs";
import { requireAdminUser } from "../middleware/auth-middleware.mjs";
import { getOperatorAccounts, saveOperatorAccount } from "../services/admin-operator-service.mjs";
import { addAuditLog } from "../stores/admin-store.mjs";

export async function adminOperatorsListController(request) {
  const admin = await requireAdminUser(request);
  if (admin.response) return admin.response;
  return ok(await getOperatorAccounts(), request);
}

export async function adminOperatorSaveController(request) {
  const admin = await requireAdminUser(request);
  if (admin.response) return admin.response;
  const body = await getJsonBody(request);
  const result = await saveOperatorAccount(body);
  if (!result.ok) return fail(result.error, result.status, request);

  await addAuditLog({
    actorUserId: admin.user.id,
    action: "OPERATOR_UPSERT",
    entityType: "admin_operator",
    entityId: result.data.id,
    details: JSON.stringify({ phone: result.data.phone, role: result.data.role, active: !result.data.deactivatedAt })
  });

  return ok(result.data, request);
}
