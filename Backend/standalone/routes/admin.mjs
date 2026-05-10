import { corsPreflight } from "../http.mjs";
import {
  adminDashboardSummaryController,
  adminExportDataController,
  adminLiveEventsController,
  adminMonitoringSummaryController,
  adminReconciliationSummaryController,
  adminReportsSummaryController,
  adminSnapshotItemsController
} from "../controllers/admin-reporting-controller.mjs";
import {
  adminSettingsGetController,
  adminSettingsPublicController,
  adminSettingsUpdateController
} from "../controllers/admin-settings-controller.mjs";
import {
  adminNotificationsListController,
  adminNotificationsSummaryController,
  adminNotificationsSendController
} from "../controllers/admin-notifications-controller.mjs";
import {
  adminOperatorSaveController,
  adminOperatorsListController
} from "../controllers/admin-operator-controller.mjs";
import {
  adminAuditLogsController,
  adminBidsListController,
  adminCleanupWalletTestDataController,
  adminUserApprovalController,
  adminUserDetailController,
  adminUsersController,
  adminUserStatusController,
  adminWalletAdjustmentController,
  adminWalletRequestActionController,
  adminWalletRequestHistoryController,
  adminWalletRequestsController
} from "../controllers/admin-user-wallet-controller.mjs";
import {
  adminBackupSnapshotController,
  adminChartUpdateController,
  adminMarketExposureController,
  adminMarketUpdateController,
  adminRestoreSnapshotController,
  adminSettlementPreviewController,
  adminSettleMarketController
} from "../controllers/admin-settlement-controller.mjs";
import {
  canSettleMarketResult as settlementCanSettleMarketResult,
  deriveJodiRowsFromPannaRows as settlementDeriveJodiRowsFromPannaRows,
  evaluateBidAgainstMarket as settlementEvaluateBidAgainstMarket,
  getBidPotentialPayout as settlementGetBidPotentialPayout,
  isPlaceholderMarketResult as settlementIsPlaceholderMarketResult,
  isValidMarketResultString as settlementIsValidMarketResultString,
  normalizeChartRowsForSave as settlementNormalizeChartRowsForSave,
  resetMarketSettlement as settlementResetMarketSettlement,
  resettleChangedMarket as settlementResettleChangedMarket,
  resettleMarket as settlementResettleMarket,
  sendMarketResultBroadcast as settlementSendMarketResultBroadcast,
  settlePendingBidsForMarket as settlementSettlePendingBidsForMarket,
  syncChartsFromMarketResult as settlementSyncChartsFromMarketResult,
  validateChartRows as settlementValidateChartRows
} from "../services/admin-settlement-helpers.mjs";

export function options(request) {
  return corsPreflight(request);
}

function roundAmount(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

export async function users(request) {
  return adminUsersController(request);
}

export async function userDetail(request) {
  return adminUserDetailController(request);
}

export async function userApproval(request) {
  return adminUserApprovalController(request);
}

export async function walletRequests(request) {
  return adminWalletRequestsController(request);
}

export async function walletRequestHistory(request) {
  return adminWalletRequestHistoryController(request);
}

export async function walletRequestAction(request) {
  return adminWalletRequestActionController(request);
}

export async function userStatus(request) {
  return adminUserStatusController(request);
}

export async function walletAdjustment(request) {
  return adminWalletAdjustmentController(request);
}

export async function cleanupWalletTestData(request) {
  return adminCleanupWalletTestDataController(request);
}

export async function notificationsList(request) {
  return adminNotificationsListController(request);
}

export async function notificationsSummary(request) {
  return adminNotificationsSummaryController(request);
}

export async function notificationsSend(request) {
  return adminNotificationsSendController(request);
}

export async function settingsGet(request) {
  return adminSettingsGetController(request);
}

export async function settingsPublic(request) {
  return adminSettingsPublicController(request);
}

export async function settingsUpdate(request) {
  return adminSettingsUpdateController(request);
}

export async function operators(request) {
  return adminOperatorsListController(request);
}

export async function operatorSave(request) {
  return adminOperatorSaveController(request);
}

export async function bidsList(request) {
  return adminBidsListController(request);
}

export async function auditLogs(request) {
  return adminAuditLogsController(request);
}

const adminSettlementDeps = {
  canSettleMarketResult: settlementCanSettleMarketResult,
  deriveJodiRowsFromPannaRows: settlementDeriveJodiRowsFromPannaRows,
  evaluateBidAgainstMarket: settlementEvaluateBidAgainstMarket,
  getBidPotentialPayout: settlementGetBidPotentialPayout,
  isPlaceholderMarketResult: settlementIsPlaceholderMarketResult,
  isValidMarketResultString: settlementIsValidMarketResultString,
  normalizeChartRowsForSave: settlementNormalizeChartRowsForSave,
  resetMarketSettlement: settlementResetMarketSettlement,
  resettleChangedMarket: settlementResettleChangedMarket,
  resettleMarket: settlementResettleMarket,
  roundAmount,
  sendMarketResultBroadcast: settlementSendMarketResultBroadcast,
  settlePendingBidsForMarket: settlementSettlePendingBidsForMarket,
  syncChartsFromMarketResult: settlementSyncChartsFromMarketResult,
  validateChartRows: settlementValidateChartRows
};

export async function chartUpdate(request) {
  return adminChartUpdateController(request, adminSettlementDeps);
}

export async function marketUpdate(request) {
  return adminMarketUpdateController(request, adminSettlementDeps);
}

export async function settleMarket(request) {
  return adminSettleMarketController(request, adminSettlementDeps);
}

export async function settlementPreview(request) {
  return adminSettlementPreviewController(request, adminSettlementDeps);
}

export async function marketExposure(request) {
  return adminMarketExposureController(request, adminSettlementDeps);
}

export async function reconciliationSummary(request) {
  return adminReconciliationSummaryController(request);
}

export async function monitoringSummary(request) {
  return adminMonitoringSummaryController(request);
}

export async function liveEvents(request) {
  return adminLiveEventsController(request);
}

export async function exportData(request) {
  return adminExportDataController(request);
}

export async function snapshotItems(request) {
  return adminSnapshotItemsController(request);
}

export async function backupSnapshot(request) {
  return adminBackupSnapshotController(request);
}

export async function restoreSnapshot(request) {
  return adminRestoreSnapshotController(request, adminSettlementDeps);
}

export async function dashboardSummary(request) {
  return adminDashboardSummaryController(request);
}

export async function reportsSummary(request) {
  return adminReportsSummaryController(request);
}
