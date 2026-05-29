import { fail, getSessionToken, unauthorized } from "../http.mjs";
import { requireAdminByToken, requireUserByToken } from "../stores/auth-store.mjs";

const FULL_ADMIN_ROLES = new Set(["admin", "super_admin"]);
const RESULT_ENGINE_ROLES = new Set(["operator", "result_operator", "result_only_operator"]);
const SUPPORT_DESK_ROLES = new Set(["operator", "result_operator", "support_operator"]);
const CRICKET_OPERATOR_ROLES = new Set(["cricket_operator"]);

export function normalizeAdminRole(role) {
  return String(role || "").trim().toLowerCase();
}

export function hasFullAdminRole(role) {
  return FULL_ADMIN_ROLES.has(normalizeAdminRole(role));
}

export function hasResultEngineRole(role) {
  const normalized = normalizeAdminRole(role);
  return FULL_ADMIN_ROLES.has(normalized) || RESULT_ENGINE_ROLES.has(normalized);
}

export function hasSupportDeskRole(role) {
  const normalized = normalizeAdminRole(role);
  return FULL_ADMIN_ROLES.has(normalized) || SUPPORT_DESK_ROLES.has(normalized);
}

export function hasCricketOperatorRole(role) {
  const normalized = normalizeAdminRole(role);
  return FULL_ADMIN_ROLES.has(normalized) || CRICKET_OPERATOR_ROLES.has(normalized);
}

export function hasAdminPanelRole(role) {
  return hasResultEngineRole(role) || hasSupportDeskRole(role);
}

export async function requireAuthenticatedUser(request) {
  const user = await requireUserByToken(getSessionToken(request));
  if (!user) {
    return { user: null, response: unauthorized(request) };
  }
  return { user, response: null };
}

async function requireAdminByRole(request, predicate, message) {
  const admin = await requireAdminByToken(getSessionToken(request));
  if (!admin) {
    return { user: null, response: unauthorized(request) };
  }
  if (!predicate(admin.role)) {
    return { user: null, response: fail(message, 403, request) };
  }
  return { user: admin, response: null };
}

export async function requireAdminUser(request) {
  return requireAdminByRole(request, hasFullAdminRole, "Admin access required");
}

export async function requireAdminPanelUser(request) {
  return requireAdminByRole(request, hasAdminPanelRole, "Admin panel access required");
}

export async function requireAdminOrResultOperator(request) {
  return requireAdminByRole(request, hasResultEngineRole, "Result engine access required");
}

export async function requireAdminOrSupportOperator(request) {
  return requireAdminByRole(request, hasSupportDeskRole, "Support desk access required");
}

export async function requireAdminOrCricketOperator(request) {
  return requireAdminByRole(request, hasCricketOperatorRole, "Cricket dashboard access required");
}
