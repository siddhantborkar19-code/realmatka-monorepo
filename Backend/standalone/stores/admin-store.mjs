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
} from "./admin-core-store.mjs";
import {
  getAdminSnapshot as getAdminSnapshotRecord,
  getAdminSnapshotSection as getAdminSnapshotSectionRecord,
  getAuditLogsPage as getAuditLogsPageRecord,
  getAuditLogs as getAuditLogsRecord,
  getDashboardSummaryData as getDashboardSummaryDataRecord,
  getMonitoringSummaryData as getMonitoringSummaryDataRecord,
  getReconciliationSummaryData as getReconciliationSummaryDataRecord,
  getReportsSummaryData as getReportsSummaryDataRecord
} from "./admin-reporting-store.mjs";
import {
  addWalletEntry as addWalletEntryRecord,
  clearWalletEntriesForUser as clearWalletEntriesForUserRecord,
  completeWalletRequest as completeWalletRequestRecord,
  getBankAccountsForUser as getBankAccountsForUserRecord,
  getUserBalance as getUserBalanceRecord,
  getWalletAdminRequestItems as getWalletAdminRequestItemsRecord,
  getWalletEntriesForUser as getWalletEntriesForUserRecord,
  getWalletRequestHistoryPage as getWalletRequestHistoryPageRecord,
  getWalletRequestHistory as getWalletRequestHistoryRecord,
  rejectWalletRequest as rejectWalletRequestRecord,
  resolveWalletApprovalRequest as resolveWalletApprovalRequestRecord,
  updateWalletEntryAdmin as updateWalletEntryAdminRecord
} from "./admin-wallet-store.mjs";
import {
  getBidsForUser as getBidsForUserRecord,
  listBidsPage as listBidsPageRecord,
  listAllBids as listAllBidsRecord
} from "./admin-bids-store.mjs";

export const addAuditLog = addAuditLogRecord;
export const addWalletEntry = addWalletEntryRecord;
export const applyReferralLossCommission = applyReferralLossCommissionRecord;
export const clearWalletEntriesForUser = clearWalletEntriesForUserRecord;
export const deleteUserAccount = deleteUserAccountRecord;
export const findUserById = findUserByIdRecord;
export const findUserByPhone = findUserByPhoneRecord;
export const getAdminSnapshot = getAdminSnapshotRecord;
export const getAdminSnapshotSection = getAdminSnapshotSectionRecord;
export const getAuditLogsPage = getAuditLogsPageRecord;
export const getAuditLogs = getAuditLogsRecord;
export const getAppSettings = getAppSettingsRecord;
export const getBankAccountsForUser = getBankAccountsForUserRecord;
export const getBidsForUser = getBidsForUserRecord;
export const getDashboardSummaryData = getDashboardSummaryDataRecord;
export const getMonitoringSummaryData = getMonitoringSummaryDataRecord;
export const getReconciliationSummaryData = getReconciliationSummaryDataRecord;
export const getReportsSummaryData = getReportsSummaryDataRecord;
export const getUserAdminSummaries = getUserAdminSummariesRecord;
export const getUserBalance = getUserBalanceRecord;
export const getUsersPage = getUsersPageRecord;
export const getUsersList = getUsersListRecord;
export const getWalletAdminRequestItems = getWalletAdminRequestItemsRecord;
export const getWalletEntriesForUser = getWalletEntriesForUserRecord;
export const getWalletRequestHistoryPage = getWalletRequestHistoryPageRecord;
export const getWalletRequestHistory = getWalletRequestHistoryRecord;
export const listAllBids = listAllBidsRecord;
export const listBidsPage = listBidsPageRecord;
export const listAllNotifications = listAllNotificationsRecord;
export const resolveWalletApprovalRequest = resolveWalletApprovalRequestRecord;
export const rejectWalletRequest = rejectWalletRequestRecord;
export const completeWalletRequest = completeWalletRequestRecord;
export const updateUserApprovalStatus = updateUserApprovalStatusRecord;
export const updateUserAccountStatus = updateUserAccountStatusRecord;
export const updateWalletEntryAdmin = updateWalletEntryAdminRecord;
export const upsertAppSetting = upsertAppSettingRecord;
