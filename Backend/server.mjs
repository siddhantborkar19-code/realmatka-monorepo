import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { Readable } from "node:stream";
import { logger } from "./standalone/ops/logger.mjs";
import { validateEnvironment } from "./standalone/ops/env-validator.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);
const backendRoot = __dirname;
const workspaceRoot = path.resolve(backendRoot, "..");
const startedAt = Date.now();

async function loadEnvFile(filePath, { override = false } = {}) {
  try {
    const raw = await readFile(filePath, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }

      const separatorIndex = trimmed.indexOf("=");
      if (separatorIndex <= 0) {
        continue;
      }

      const key = trimmed.slice(0, separatorIndex).trim();
      if (!key || (!override && process.env[key] != null)) {
        continue;
      }

      const value = trimmed.slice(separatorIndex + 1).trim().replace(/^['"]|['"]$/g, "");
      process.env[key] = value;
    }
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw error;
    }
  }
}

await loadEnvFile(path.join(backendRoot, ".env.production"));
await loadEnvFile(path.join(backendRoot, ".env.local"));
await loadEnvFile(path.join(workspaceRoot, ".env.production"));
await loadEnvFile(path.join(workspaceRoot, ".env.local"));
await loadEnvFile(path.join(workspaceRoot, ".env.backend.local"), { override: true });

const envValidation = validateEnvironment();
if (!envValidation.ok) {
  logger.error("Backend environment validation failed", {
    envErrors: envValidation.errors,
    envWarnings: envValidation.warnings,
    envSummary: envValidation.summary
  });
  throw new Error(`Backend environment validation failed: ${envValidation.errors.join("; ")}`);
}
if (envValidation.warnings.length) {
  logger.warn("Backend environment validation warnings", {
    envWarnings: envValidation.warnings,
    envSummary: envValidation.summary
  });
}

const distServerDir = path.resolve(backendRoot, process.env.EXPO_SERVER_DIST_DIR || "dist/server");
const routesManifestPath = path.join(distServerDir, "_expo", "routes.json");
const port = Number(process.env.PORT || 3000);
const configuredCorsOrigins = [
  process.env.EXPO_PUBLIC_APP_URL,
  process.env.ADMIN_DOMAIN,
  process.env.PUBLIC_API_ORIGIN,
  process.env.EXTRA_CORS_ORIGINS,
  "https://realmatka.in",
  "https://www.realmatka.in",
  "https://realmatka-frontend-web.vercel.app",
  "http://localhost:8085",
  "http://localhost:8083",
  "http://localhost:8082",
  "http://localhost:8081",
  "http://localhost:5501",
  "http://localhost:5500",
  "http://127.0.0.1:8085",
  "http://127.0.0.1:8083",
  "http://127.0.0.1:8082",
  "http://127.0.0.1:8081",
  "http://127.0.0.1:5501",
  "http://127.0.0.1:5500"
]
  .flatMap((value) => (value ? value.split(",") : []))
  .map((value) => value.trim().replace(/\/$/, ""))
  .filter(Boolean);
const allowedCorsOrigins = new Set(configuredCorsOrigins);

function createRequestId() {
  return `req_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function isAllowedCorsOrigin(origin) {
  if (!origin) {
    return false;
  }

  if (allowedCorsOrigins.has(origin)) {
    return true;
  }

  return /^(https?:\/\/)(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+)(:\d+)?$/i.test(origin);
}
const routeModuleLoaders = {
  auth: () => import("./standalone/routes/auth.mjs"),
  authGoogle: () => import("./standalone/routes/auth-google.mjs"),
  authAccount: () => import("./standalone/routes/auth-account.mjs"),
  authOtp: () => import("./standalone/routes/auth-otp.mjs"),
  authRegister: () => import("./standalone/routes/auth-register.mjs"),
  wallet: () => import("./standalone/routes/wallet.mjs"),
  walletBalance: () => import("./standalone/routes/wallet-balance.mjs"),
  bids: () => import("./standalone/routes/bids.mjs"),
  bidsPlace: () => import("./standalone/routes/bids-place.mjs"),
  bank: () => import("./standalone/routes/bank.mjs"),
  profile: () => import("./standalone/routes/profile.mjs"),
  notifications: () => import("./standalone/routes/notifications.mjs"),
  payments: () => import("./standalone/routes/payments.mjs"),
  markets: () => import("./standalone/routes/markets.mjs"),
  chat: () => import("./standalone/routes/chat.mjs"),
  admin: () => import("./standalone/routes/admin.mjs")
};

const routeModuleCache = new Map();

async function loadStandaloneModule(key) {
  if (routeModuleCache.has(key)) {
    return routeModuleCache.get(key);
  }

  const loader = routeModuleLoaders[key];
  if (typeof loader !== "function") {
    throw new Error(`Unknown standalone route module: ${key}`);
  }

  const loaded = await loader();
  routeModuleCache.set(key, loaded);
  return loaded;
}

const standaloneRoutes = new Map([
  ["/api/auth/login", { loader: "auth", methods: { OPTIONS: "options", POST: "login" } }],
  ["/api/auth/google-login", { loader: "authGoogle", methods: { OPTIONS: "options", POST: "login" } }],
  ["/api/auth/google-register", { loader: "authGoogle", methods: { OPTIONS: "options", POST: "register" } }],
  ["/api/auth/admin-verify-2fa", { loader: "auth", methods: { OPTIONS: "options", POST: "verifyAdminTwoFactor" } }],
  ["/api/auth/me", { loader: "auth", methods: { OPTIONS: "options", GET: "me" } }],
  ["/api/auth/request-otp", { loader: "authOtp", methods: { OPTIONS: "options", POST: "requestOtp" } }],
  ["/api/auth/msg91/widget", { loader: "authOtp", methods: { OPTIONS: "options", GET: "msg91Widget" } }],
  ["/api/auth/otp-login", { loader: "authOtp", methods: { OPTIONS: "options", POST: "otpLogin" } }],
  ["/api/auth/forgot-password", { loader: "authOtp", methods: { OPTIONS: "options", POST: "forgotPassword" } }],
  ["/api/auth/register", { loader: "authRegister", methods: { OPTIONS: "options", POST: "register" } }],
  ["/api/auth/logout", { loader: "authAccount", methods: { OPTIONS: "options", POST: "logout" } }],
  ["/api/auth/update-password", { loader: "authAccount", methods: { OPTIONS: "options", POST: "updatePassword" } }],
  ["/api/auth/update-mpin", { loader: "authAccount", methods: { OPTIONS: "options", POST: "updateMpin" } }],
  ["/api/auth/verify-mpin", { loader: "authAccount", methods: { OPTIONS: "options", POST: "verifyMpin" } }],
  ["/api/profile/update", { loader: "profile", methods: { OPTIONS: "options", POST: "update" } }],
  ["/api/profile/referrals", { loader: "profile", methods: { OPTIONS: "options", GET: "referrals" } }],
  ["/api/wallet/balance", { loader: "walletBalance", methods: { OPTIONS: "options", GET: "balance" } }],
  ["/api/wallet/history", { loader: "wallet", methods: { OPTIONS: "options", GET: "history" } }],
  ["/api/wallet/deposit", { loader: "wallet", methods: { OPTIONS: "options", POST: "deposit" } }],
  ["/api/wallet/withdraw", { loader: "wallet", methods: { OPTIONS: "options", POST: "withdraw" } }],
  ["/api/wallet/withdraw/request-otp", { loader: "wallet", methods: { OPTIONS: "options", POST: "requestWithdrawOtp" } }],
  ["/api/wallet/withdraw/confirm", { loader: "wallet", methods: { OPTIONS: "options", POST: "confirmWithdraw" } }],
  ["/api/bids/history", { loader: "bids", methods: { OPTIONS: "options", GET: "history" } }],
  ["/api/bids/place", { loader: "bidsPlace", methods: { OPTIONS: "options", POST: "place" } }],
  ["/api/bids/board-helper", { loader: "bidsPlace", methods: { OPTIONS: "options", GET: "boardHelper" } }],
  ["/api/bank/list", { loader: "bank", methods: { OPTIONS: "options", GET: "list" } }],
  ["/api/bank/add", { loader: "bank", methods: { OPTIONS: "options", POST: "add" } }],
  ["/api/markets/list", { loader: "markets", methods: { OPTIONS: "options", GET: "list" } }],
  ["/api/notifications/history", { loader: "notifications", methods: { OPTIONS: "options", GET: "history" } }],
  ["/api/notifications/devices/register", { loader: "notifications", methods: { OPTIONS: "options", POST: "registerDevice" } }],
  ["/api/notifications/read", { loader: "notifications", methods: { OPTIONS: "options", POST: "markRead" } }],
  ["/api/chat/conversation", { loader: "chat", methods: { OPTIONS: "options", GET: "userConversation" } }],
  ["/api/chat/send", { loader: "chat", methods: { OPTIONS: "options", POST: "userSend" } }],
  ["/api/payments/deposit-config", { loader: "payments", methods: { OPTIONS: "options", GET: "depositConfig" } }],
  ["/api/payments/create-order", { loader: "payments", methods: { OPTIONS: "options", POST: "createOrder" } }],
  ["/api/payments/confirm", { loader: "payments", methods: { OPTIONS: "options", POST: "confirmOrder" } }],
  ["/api/payments/status", { loader: "payments", methods: { OPTIONS: "options", GET: "getPaymentOrderStatus", POST: "getPaymentOrderStatus" } }],
  ["/api/payments/upi-start", { loader: "payments", methods: { OPTIONS: "options", GET: "startUpiDeposit", POST: "startUpiDeposit" } }],
  ["/api/payments/upi-report", { loader: "payments", methods: { OPTIONS: "options", GET: "reportUpiDeposit", POST: "reportUpiDeposit" } }],
  ["/api/payments/upi-status", { loader: "payments", methods: { OPTIONS: "options", GET: "getUpiDepositStatus", POST: "getUpiDepositStatus" } }],
  ["/api/payments/upi-auto-credit", { loader: "payments", methods: { OPTIONS: "options", POST: "upiAutoCreditWebhook" } }],
  ["/api/payments/webhook", { loader: "payments", methods: { OPTIONS: "options", POST: "webhook" } }],
  ["/api/settings", { loader: "admin", methods: { OPTIONS: "options", GET: "settingsPublic" } }],
  ["/api/admin/users", { loader: "admin", methods: { OPTIONS: "options", GET: "users" } }],
  ["/api/admin/user-detail", { loader: "admin", methods: { OPTIONS: "options", GET: "userDetail" } }],
  ["/api/admin/user-approval", { loader: "admin", methods: { OPTIONS: "options", POST: "userApproval" } }],
  ["/api/admin/user-status", { loader: "admin", methods: { OPTIONS: "options", POST: "userStatus" } }],
  ["/api/admin/wallet-requests", { loader: "admin", methods: { OPTIONS: "options", GET: "walletRequests" } }],
  ["/api/admin/wallet-request-history", { loader: "admin", methods: { OPTIONS: "options", GET: "walletRequestHistory" } }],
  ["/api/admin/wallet-request-action", { loader: "admin", methods: { OPTIONS: "options", POST: "walletRequestAction" } }],
  ["/api/admin/wallet-test-cleanup", { loader: "admin", methods: { OPTIONS: "options", POST: "cleanupWalletTestData" } }],
  ["/api/admin/wallet-adjustment", { loader: "admin", methods: { OPTIONS: "options", POST: "walletAdjustment" } }],
  ["/api/admin/audit-logs", { loader: "admin", methods: { OPTIONS: "options", GET: "auditLogs" } }],
  ["/api/admin/bids", { loader: "admin", methods: { OPTIONS: "options", GET: "bidsList" } }],
  ["/api/admin/notifications", { loader: "admin", methods: { OPTIONS: "options", GET: "notificationsList", POST: "notificationsSend" } }],
  ["/api/admin/notifications-summary", { loader: "admin", methods: { OPTIONS: "options", GET: "notificationsSummary" } }],
  ["/api/admin/settings", { loader: "admin", methods: { OPTIONS: "options", GET: "settingsGet", POST: "settingsUpdate" } }],
  ["/api/admin/operators", { loader: "admin", methods: { OPTIONS: "options", GET: "operators", POST: "operatorSave" } }],
  ["/api/admin/referrals", { loader: "admin", methods: { OPTIONS: "options", GET: "referrals" } }],
  ["/api/admin/chart-update", { loader: "admin", methods: { OPTIONS: "options", POST: "chartUpdate" } }],
  ["/api/admin/market-update", { loader: "admin", methods: { OPTIONS: "options", POST: "marketUpdate" } }],
  ["/api/admin/settle-market", { loader: "admin", methods: { OPTIONS: "options", POST: "settleMarket" } }],
  ["/api/admin/settlement-preview", { loader: "admin", methods: { OPTIONS: "options", GET: "settlementPreview" } }],
  ["/api/admin/market-exposure", { loader: "admin", methods: { OPTIONS: "options", GET: "marketExposure" } }],
  ["/api/admin/reconciliation-summary", { loader: "admin", methods: { OPTIONS: "options", GET: "reconciliationSummary" } }],
  ["/api/admin/monitoring-summary", { loader: "admin", methods: { OPTIONS: "options", GET: "monitoringSummary" } }],
  ["/api/admin/live-events", { loader: "admin", methods: { OPTIONS: "options", GET: "liveEvents" } }],
  ["/api/admin/export", { loader: "admin", methods: { OPTIONS: "options", GET: "exportData" } }],
  ["/api/admin/snapshot-items", { loader: "admin", methods: { OPTIONS: "options", GET: "snapshotItems" } }],
  ["/api/admin/backup-snapshot", { loader: "admin", methods: { OPTIONS: "options", GET: "backupSnapshot", POST: "restoreSnapshot" } }],
  ["/api/admin/dashboard-summary", { loader: "admin", methods: { OPTIONS: "options", GET: "dashboardSummary" } }],
  ["/api/admin/reports-summary", { loader: "admin", methods: { OPTIONS: "options", GET: "reportsSummary" } }],
  ["/api/admin/chat-conversations", { loader: "chat", methods: { OPTIONS: "options", GET: "adminConversations" } }],
  ["/api/admin/chat-messages", { loader: "chat", methods: { OPTIONS: "options", GET: "adminMessages" } }],
  ["/api/admin/chat-send", { loader: "chat", methods: { OPTIONS: "options", POST: "adminSend" } }],
  ["/api/admin/chat-status", { loader: "chat", methods: { OPTIONS: "options", POST: "adminUpdateStatus" } }]
]);

let cachedManifest = null;
const handlerCache = new Map();

async function loadManifest() {
  if (cachedManifest) {
    return cachedManifest;
  }

  let parsed = {};
  try {
    const rawManifest = await readFile(routesManifestPath, "utf8");
    parsed = JSON.parse(rawManifest);
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw error;
    }
  }

  cachedManifest = {
    apiRoutes: (parsed.apiRoutes || []).map((route) => ({
      ...route,
      matcher: new RegExp(route.namedRegex)
    }))
  };

  return cachedManifest;
}

function getRouteMatch(pathname, routes) {
  for (const route of routes) {
    const match = pathname.match(route.matcher);
    if (match) {
      return {
        route,
        params: match.groups || {}
      };
    }
  }

  return null;
}

async function loadRouteModule(routeFile) {
  if (handlerCache.has(routeFile)) {
    return handlerCache.get(routeFile);
  }

  const modulePath = path.join(distServerDir, routeFile);
  const imported = require(modulePath);
  const resolved =
    imported?.default && typeof imported.default === "object"
      ? imported.default
      : imported;

  handlerCache.set(routeFile, resolved);
  return resolved;
}

function toWebRequest(req) {
  const origin = process.env.PUBLIC_API_ORIGIN || `http://${req.headers.host || `localhost:${port}`}`;
  const url = new URL(req.url || "/", origin);
  const method = req.method || "GET";
  const headers = new Headers();

  for (const [key, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        headers.append(key, item);
      }
    } else if (typeof value === "string") {
      headers.set(key, value);
    }
  }

  const init = {
    method,
    headers,
    body: method === "GET" || method === "HEAD" ? undefined : Readable.toWeb(req),
    duplex: method === "GET" || method === "HEAD" ? undefined : "half"
  };

  return new Request(url, init);
}

async function sendWebResponse(nodeRes, webResponse) {
  nodeRes.statusCode = webResponse.status;
  nodeRes.statusMessage = webResponse.statusText;

  webResponse.headers.forEach((value, key) => {
    nodeRes.setHeader(key, value);
  });

  if (!webResponse.body) {
    nodeRes.end();
    return;
  }

  const body = Readable.fromWeb(webResponse.body);
  body.on("error", (error) => {
    logger.error("Response stream error", { error });
    if (!nodeRes.headersSent) {
      nodeRes.statusCode = 500;
    }
    nodeRes.end();
  });
  body.pipe(nodeRes);
}

function sendJson(nodeRes, statusCode, payload) {
  const body = JSON.stringify(payload);
  nodeRes.statusCode = statusCode;
  nodeRes.setHeader("content-type", "application/json; charset=utf-8");
  nodeRes.end(body);
}

function applyCorsHeaders(req, res) {
  const requestOrigin = typeof req.headers.origin === "string" ? req.headers.origin.replace(/\/$/, "") : "";

  if (isAllowedCorsOrigin(requestOrigin)) {
    res.setHeader("access-control-allow-origin", requestOrigin);
    res.setHeader("vary", "Origin");
  }

  res.setHeader("access-control-allow-methods", "GET, POST, OPTIONS");
  res.setHeader("access-control-allow-headers", "Content-Type, Authorization, X-Request-Id");
  res.setHeader("access-control-expose-headers", "X-Request-Id");
}

async function handleApiRequest(req, res) {
  const pathname = new URL(req.url || "/", "http://localhost").pathname;
  const methodName = (req.method || "GET").toUpperCase();
  const standaloneRoute = standaloneRoutes.get(pathname);

  if (standaloneRoute) {
    const module = await loadStandaloneModule(standaloneRoute.loader);
    const handlerName = standaloneRoute.methods[methodName];
    const handler = handlerName ? module[handlerName] : null;
    if (typeof handler !== "function") {
      res.setHeader("allow", Object.keys(standaloneRoute.methods).join(", "));
      sendJson(res, 405, { ok: false, error: "Method not allowed" });
      return;
    }

    const webRequest = toWebRequest(req);
    const webResponse = await handler(webRequest);
    await sendWebResponse(res, webResponse);
    return;
  }

  if (pathname.startsWith("/api/markets/")) {
    const slug = pathname.replace(/^\/api\/markets\//, "").replace(/\/$/, "");
    if (slug) {
      const marketsRoutes = await loadStandaloneModule("markets");
      const handler = methodName === "OPTIONS" ? marketsRoutes.options : methodName === "GET" ? marketsRoutes.detail : null;
      if (typeof handler !== "function") {
        res.setHeader("allow", "GET, OPTIONS");
        sendJson(res, 405, { ok: false, error: "Method not allowed" });
        return;
      }
      const webRequest = toWebRequest(req);
      const webResponse = await handler(webRequest, { slug });
      await sendWebResponse(res, webResponse);
      return;
    }
  }

  if (pathname.startsWith("/api/charts/")) {
    if (pathname === "/api/charts/batch") {
      const marketsRoutes = await loadStandaloneModule("markets");
      const handler = methodName === "OPTIONS" ? marketsRoutes.options : methodName === "GET" ? marketsRoutes.chartBatch : null;
      if (typeof handler !== "function") {
        res.setHeader("allow", "GET, OPTIONS");
        sendJson(res, 405, { ok: false, error: "Method not allowed" });
        return;
      }
      const webRequest = toWebRequest(req);
      const webResponse = await handler(webRequest);
      await sendWebResponse(res, webResponse);
      return;
    }

    const slug = pathname.replace(/^\/api\/charts\//, "").replace(/\/$/, "");
    if (slug) {
      const marketsRoutes = await loadStandaloneModule("markets");
      const handler = methodName === "OPTIONS" ? marketsRoutes.options : methodName === "GET" ? marketsRoutes.chart : null;
      if (typeof handler !== "function") {
        res.setHeader("allow", "GET, OPTIONS");
        sendJson(res, 405, { ok: false, error: "Method not allowed" });
        return;
      }
      const webRequest = toWebRequest(req);
      const webResponse = await handler(webRequest, { slug });
      await sendWebResponse(res, webResponse);
      return;
    }
  }

  const { apiRoutes } = await loadManifest();
  const match = getRouteMatch(pathname, apiRoutes);

  if (!match) {
    sendJson(res, 404, { ok: false, error: "Route not found" });
    return;
  }

  const routeModule = await loadRouteModule(match.route.file);
  const handler = routeModule[methodName];

  if (typeof handler !== "function") {
    res.setHeader("allow", Object.keys(routeModule).filter((key) => /^[A-Z]+$/.test(key)).join(", "));
    sendJson(res, 405, { ok: false, error: "Method not allowed" });
    return;
  }

  const webRequest = toWebRequest(req);
  const webResponse = await handler(webRequest, match.params);
  await sendWebResponse(res, webResponse);
}

const server = createServer(async (req, res) => {
  const requestStartedAt = Date.now();
  const requestId = createRequestId();
  req.headers["x-request-id"] = requestId;
  res.setHeader("x-request-id", requestId);
  const requestLogger = logger.child({
    requestId,
    method: req.method || "GET",
    path: req.url || "/"
  });
  try {
    const pathname = new URL(req.url || "/", "http://localhost").pathname;
    applyCorsHeaders(req, res);

    if ((req.method || "GET").toUpperCase() === "OPTIONS" && pathname.startsWith("/api/")) {
      res.statusCode = 204;
      res.end();
      return;
    }

    if (pathname === "/health") {
      sendJson(res, 200, {
        ok: true,
        status: "ok",
        service: "realmatka-api",
        timestamp: new Date().toISOString()
      });
      return;
    }

    if (pathname === "/payments/checkout") {
      const paymentsRoutes = await loadStandaloneModule("payments");
      const webRequest = toWebRequest(req);
      const webResponse = await paymentsRoutes.checkoutPage(webRequest);
      await sendWebResponse(res, webResponse);
      return;
    }

    if (pathname === "/payments/callback") {
      const paymentsRoutes = await loadStandaloneModule("payments");
      const webRequest = toWebRequest(req);
      const webResponse = await paymentsRoutes.callbackPage(webRequest);
      await sendWebResponse(res, webResponse);
      return;
    }

    if (pathname.startsWith("/api/")) {
      await handleApiRequest(req, res);
      return;
    }

    sendJson(res, 200, {
      ok: true,
      service: "realmatka-api",
      routes: ["/health", "/api/*"]
    });
  } catch (error) {
    requestLogger.error("Unhandled backend request error", { error });
    sendJson(res, 500, {
      ok: false,
      error: error instanceof Error ? error.message : "Internal server error"
    });
  } finally {
    requestLogger.info("Request complete", {
      durationMs: Date.now() - requestStartedAt,
      statusCode: res.statusCode
    });
  }
});

server.listen(port, "0.0.0.0", () => {
  logger.info("Real Matka backend listening", {
    port,
    host: "0.0.0.0",
    startedAt: new Date(startedAt).toISOString(),
    envSummary: envValidation.summary,
    envWarnings: envValidation.warnings
  });
});

process.on("unhandledRejection", (error) => {
  logger.error("Unhandled promise rejection", { error });
});

process.on("uncaughtException", (error) => {
  logger.error("Uncaught exception", { error });
});
