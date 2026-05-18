import {
  addAuditLog as addAuditLogRecord,
  applyReferralLossCommission as applyReferralLossCommissionRecord,
  deleteUserAccount as deleteUserAccountRecord,
  findUserById as findUserByIdRecord,
  findUserByPhone as findUserByPhoneRecord,
  getAppSettings as getAppSettingsRecord,
  getUserAdminSummaries as getUserAdminSummariesRecord,
  getUsersPage as getUsersPageRecord,
  getUsersList as getUsersListRecord,
  listAllNotifications as listAllNotificationsRecord,
  updateUserApprovalStatus as updateUserApprovalStatusRecord,
  updateUserAccountStatus as updateUserAccountStatusRecord,
  upsertAppSetting as upsertAppSettingRecord
} from "../db/admin-core-db.mjs";

export const addAuditLog = addAuditLogRecord;
export const applyReferralLossCommission = applyReferralLossCommissionRecord;
export const deleteUserAccount = deleteUserAccountRecord;
export const findUserById = findUserByIdRecord;
export const findUserByPhone = findUserByPhoneRecord;
export const getAppSettings = getAppSettingsRecord;
export const getUserAdminSummaries = getUserAdminSummariesRecord;
export const getUsersPage = getUsersPageRecord;
export const getUsersList = getUsersListRecord;
export const listAllNotifications = listAllNotificationsRecord;
export const updateUserApprovalStatus = updateUserApprovalStatusRecord;
export const updateUserAccountStatus = updateUserAccountStatusRecord;
export const upsertAppSetting = upsertAppSettingRecord;
