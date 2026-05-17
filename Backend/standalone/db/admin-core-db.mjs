export {
  addAuditLog,
  applyReferralLossCommission,
  deleteUserAccount,
  findUserById,
  findUserByPhone,
  getAppSettings,
  getUserAdminSummaries,
  getUsersList,
  listAllNotifications,
  updateUserApprovalStatus,
  updateUserAccountStatus,
  upsertAppSetting
} from "../db.mjs";

import { getUsersList } from "../db.mjs";

export async function getUsersPage({ limit = 500, offset = 0 } = {}) {
  const normalizedLimit = Math.max(1, Math.min(5000, Number(limit) || 500));
  const normalizedOffset = Math.max(0, Number(offset) || 0);
  const users = await getUsersList();
  return {
    items: users.slice(normalizedOffset, normalizedOffset + normalizedLimit),
    pagination: {
      limit: normalizedLimit,
      offset: normalizedOffset,
      total: users.length,
      hasMore: normalizedOffset + normalizedLimit < users.length
    }
  };
}
