import { fail, getResponseCorsHeaders, ok } from "../http.mjs";
import { hasFullAdminRole, hasSupportDeskRole, requireAdminPanelUser, requireAdminUser } from "../middleware/auth-middleware.mjs";
import {
  buildExportPayload,
  getDashboardSummary,
  getMonitoringSummary,
  getReconciliationSummary,
  getReportsSummary,
  getSnapshotSection
} from "../services/admin-reporting-service.mjs";
import { getAdminLiveEvents } from "../db/admin-live-events-db.mjs";
import { addAuditLog } from "../stores/admin-store.mjs";

export async function adminDashboardSummaryController(request) {
  const admin = await requireAdminUser(request);
  if (admin.response) return admin.response;
  const url = new URL(request.url);
  return ok(await getDashboardSummary({
    includeRecent: url.searchParams.get("includeRecent") !== "false",
    includeTrends: url.searchParams.get("includeTrends") !== "false"
  }), request);
}

export async function adminReportsSummaryController(request) {
  const admin = await requireAdminUser(request);
  if (admin.response) return admin.response;
  const url = new URL(request.url);
  return ok(await getReportsSummary(url.searchParams.get("from"), url.searchParams.get("to"), {
    userLimit: url.searchParams.get("userLimit"),
    marketLimit: url.searchParams.get("marketLimit"),
    includeSeries: url.searchParams.get("includeSeries") !== "false"
  }), request);
}

export async function adminMonitoringSummaryController(request) {
  const admin = await requireAdminUser(request);
  if (admin.response) return admin.response;
  return ok(await getMonitoringSummary(), request);
}

export async function adminLiveEventsController(request) {
  const admin = await requireAdminPanelUser(request);
  if (admin.response) return admin.response;
  const url = new URL(request.url);
  const limit = Number(url.searchParams.get("limit") || 30);
  const events = await getAdminLiveEvents({ limit });
  if (hasFullAdminRole(admin.user.role)) {
    return ok({ events }, request);
  }
  if (hasSupportDeskRole(admin.user.role)) {
    return ok({ events: events.filter((event) => event.type === "support") }, request);
  }
  return ok({ events: [] }, request);
}

export async function adminReconciliationSummaryController(request) {
  const admin = await requireAdminUser(request);
  if (admin.response) return admin.response;
  const url = new URL(request.url);
  return ok(
    await getReconciliationSummary({
      type: url.searchParams.get("type"),
      status: url.searchParams.get("status"),
      page: url.searchParams.get("page"),
      limit: url.searchParams.get("limit"),
      staleHours: url.searchParams.get("staleHours")
    }),
    request
  );
}

export async function adminSnapshotItemsController(request) {
  const admin = await requireAdminUser(request);
  if (admin.response) return admin.response;
  const url = new URL(request.url);
  const result = await getSnapshotSection(url.searchParams.get("section"), {
    page: url.searchParams.get("page"),
    limit: url.searchParams.get("limit")
  });
  if (!result.ok) {
    return fail(result.error, result.status, request);
  }
  return ok(result.data, request);
}

export async function adminExportDataController(request) {
  const admin = await requireAdminUser(request);
  if (admin.response) return admin.response;
  const type = String(new URL(request.url).searchParams.get("type") ?? "users");
  const result = await buildExportPayload(type);
  if (!result.ok) return fail(result.error, result.status, request);
  await addAuditLog({
    actorUserId: admin.user.id,
    action: "EXPORT_DATA",
    entityType: "export",
    entityId: type,
    details: JSON.stringify({ type, rowCount: result.data.rowCount })
  });
  const encoder = new TextEncoder();
  const iterator = result.data.stream[Symbol.asyncIterator]();
  const stream = new ReadableStream({
    async pull(controller) {
      const next = await iterator.next();
      if (next.done) {
        controller.close();
        return;
      }
      controller.enqueue(encoder.encode(String(next.value)));
    },
    async cancel() {
      if (typeof iterator.return === "function") {
        await iterator.return();
      }
    }
  });
  return new Response(stream, {
    status: 200,
    headers: {
      ...getResponseCorsHeaders(request),
      "Content-Type": `${result.data.mimeType}; charset=${result.data.charset || "utf-8"}`,
      "Content-Disposition": `attachment; filename=\"${result.data.filename}\"`
    }
  });
}
