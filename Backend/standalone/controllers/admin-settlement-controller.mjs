import { fail, getJsonBody, ok } from "../http.mjs";
import { requireAdminOrResultOperator, requireAdminUser } from "../middleware/auth-middleware.mjs";
import { addAuditLog } from "../stores/admin-store.mjs";
import {
  buildBackupSnapshot,
  buildMarketExposure,
  buildSettlementPreview,
  restoreBackupSnapshot,
  settleMarketData,
  updateChartData,
  updateMarketData
} from "../services/admin-settlement-service.mjs";
import { refreshMarketListSnapshot } from "../services/market-snapshot-service.mjs";

export async function adminChartUpdateController(request, deps) {
  const admin = await requireAdminOrResultOperator(request);
  if (admin.response) return admin.response;
  const body = await getJsonBody(request);
  const slug = String(body.slug ?? "");
  const chartType = String(body.chartType ?? "jodi") === "panna" ? "panna" : "jodi";
  const rows = Array.isArray(body.rows) ? body.rows : [];
  if (!slug || rows.length === 0) return fail("slug and rows are required", 400, request);

  const result = await updateChartData({ slug, chartType, rows }, deps);
  if (!result.ok) return fail(result.error, result.status, request);

  await addAuditLog({
    actorUserId: admin.user.id,
    action: "CHART_UPDATE",
    entityType: "chart",
    entityId: `${slug}:${chartType}`,
    details: JSON.stringify(result.auditDetails)
  });

  await refreshMarketListSnapshot();

  return ok(result.updated, request);
}

export async function adminMarketUpdateController(request, deps) {
  const admin = await requireAdminOrResultOperator(request);
  if (admin.response) return admin.response;
  const body = await getJsonBody(request);
  const slug = String(body.slug ?? "");
  const resultValue = String(body.result ?? "");
  const status = String(body.status ?? "");
  const action = String(body.action ?? "");
  const open = String(body.open ?? "");
  const close = String(body.close ?? "");
  const category = String(body.category ?? "");
  if (!slug || !resultValue || !status || !action || !open || !close || !category) {
    return fail("slug, result, status, action, open, close, and category are required", 400, request);
  }

  const result = await updateMarketData({ slug, result: resultValue, status, action, open, close, category }, deps);
  if (!result.ok) return fail(result.error, result.status, request);

  await addAuditLog({
    actorUserId: admin.user.id,
    action: "MARKET_UPDATE",
    entityType: "market",
    entityId: result.market.slug,
    details: JSON.stringify({ result: resultValue, status, action, open, close, category, broadcast: result.broadcast })
  });

  await refreshMarketListSnapshot();

  return ok({ market: result.market, broadcast: result.broadcast }, request);
}

export async function adminSettleMarketController(request, deps) {
  const admin = await requireAdminOrResultOperator(request);
  if (admin.response) return admin.response;
  const body = await getJsonBody(request);
  const slug = String(body.slug ?? "");
  const mode = String(body.mode ?? "settle");
  const previousResult = String(body.previousResult ?? "");
  if (!slug) return fail("slug is required", 400, request);

  const result = await settleMarketData({ slug, mode, previousResult }, deps);
  if (!result.ok) return fail(result.error, result.status, request);

  await addAuditLog({
    actorUserId: admin.user.id,
    action: mode === "reset" ? "MARKET_RESET" : mode === "resettle" || mode === "resettle-changed" ? "MARKET_RESETTLE" : "MARKET_SETTLE",
    entityType: "market",
    entityId: result.market.slug,
    details: JSON.stringify(result.settlement)
  });

  await refreshMarketListSnapshot();

  return ok({ market: result.market, settlement: result.settlement }, request);
}

export async function adminSettlementPreviewController(request, deps) {
  const admin = await requireAdminOrResultOperator(request);
  if (admin.response) return admin.response;
  const slug = String(new URL(request.url).searchParams.get("slug") ?? "");
  if (!slug) return fail("slug is required", 400, request);
  const result = await buildSettlementPreview(slug, deps);
  if (!result.ok) return fail(result.error, result.status, request);
  return ok(result.data, request);
}

export async function adminMarketExposureController(request, deps) {
  const admin = await requireAdminOrResultOperator(request);
  if (admin.response) return admin.response;
  const slug = String(new URL(request.url).searchParams.get("slug") ?? "");
  if (!slug) return fail("slug is required", 400, request);
  const result = await buildMarketExposure(slug, deps);
  if (!result.ok) return fail(result.error, result.status, request);
  return ok(result.data, request);
}

export async function adminBackupSnapshotController(request) {
  const admin = await requireAdminUser(request);
  if (admin.response) return admin.response;
  const payload = await buildBackupSnapshot();
  await addAuditLog({
    actorUserId: admin.user.id,
    action: "BACKUP_EXPORT",
    entityType: "backup",
    entityId: "snapshot",
    details: JSON.stringify({ generatedAt: payload.generatedAt, markets: payload.markets.length, charts: payload.charts.length, settings: payload.settings.length })
  });
  return ok({ filename: `admin-backup-${Date.now()}.json`, snapshot: payload }, request);
}

export async function adminRestoreSnapshotController(request, deps) {
  const admin = await requireAdminUser(request);
  if (admin.response) return admin.response;
  const body = await getJsonBody(request);
  const snapshot = body?.snapshot;
  const dryRun = Boolean(body?.dryRun);
  if (!snapshot || typeof snapshot !== "object") return fail("snapshot is required", 400, request);

  const result = await restoreBackupSnapshot({ snapshot, dryRun }, deps);
  if (!result.ok) return fail(result.error, result.status, request);

  if (!dryRun) {
    await addAuditLog({
      actorUserId: admin.user.id,
      action: "BACKUP_RESTORE",
      entityType: "backup",
      entityId: "snapshot",
      details: JSON.stringify({ settings: result.data.summary.settings, markets: result.data.summary.markets, charts: result.data.summary.charts, dryRun: false })
    });
    await refreshMarketListSnapshot();
  }

  return ok(result.data, request);
}
