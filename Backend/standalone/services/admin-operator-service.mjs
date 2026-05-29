import { normalizeIndianPhone } from "../http.mjs";
import { listOperatorAdminAccounts, upsertOperatorAdminAccount } from "../stores/auth-store.mjs";

const OPERATOR_ROLES = new Set(["operator", "result_operator", "result_only_operator", "support_operator", "cricket_operator"]);

export async function getOperatorAccounts() {
  return listOperatorAdminAccounts();
}

export async function saveOperatorAccount(body) {
  const id = String(body?.id || "").trim();
  const phone = normalizeIndianPhone(body?.phone);
  const displayName = String(body?.name || body?.displayName || "").trim();
  const password = String(body?.password || "").trim();
  const role = String(body?.role || "result_operator").trim().toLowerCase();
  const active = String(body?.status || "active").toLowerCase() !== "disabled" && body?.active !== false;
  const twoFactorEnabled = String(body?.twoFactorEnabled ?? "true").toLowerCase() !== "false";

  if (!phone) {
    return { ok: false, status: 400, error: "Valid 10 digit operator phone is required" };
  }
  if (!displayName) {
    return { ok: false, status: 400, error: "Operator name is required" };
  }
  if (!OPERATOR_ROLES.has(role)) {
    return { ok: false, status: 400, error: "Invalid operator role" };
  }
  if (password && password.length < 8) {
    return { ok: false, status: 400, error: "Password must be at least 8 characters" };
  }

  try {
    const operator = await upsertOperatorAdminAccount({
      id,
      phone,
      displayName,
      role,
      password,
      active,
      twoFactorEnabled
    });
    return { ok: true, data: operator };
  } catch (error) {
    return { ok: false, status: 400, error: error instanceof Error ? error.message : "Unable to save operator" };
  }
}
