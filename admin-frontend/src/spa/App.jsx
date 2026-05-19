import React, { useEffect, useMemo, useRef, useState } from "react";
import { fetchApi as baseFetchApi, formatApiError, normalizeAdminApiBase } from "../lib/api.js";
import { clearAdminSession, getAdminSessionExpiry, getAdminToken } from "../lib/session.js";
import { LoginScreen } from "./LoginScreen.jsx";
import { AdminShell } from "./AdminShell.jsx";
import { AuditPage } from "./AuditPage.jsx";
import { BonusPage } from "./BonusPage.jsx";
import { NotificationsPage } from "./NotificationsPage.jsx";
import { AdminMarketPublishList, AllChartPage, ChartEditorPreviewSection, ResultEnginePage, ResultPublishSettlementSection, buildNextResultFromSlotChange, getAdminCurrentMinutes, getBracketMarkEditorValues, getClearedEditorValues, getEditorValuesFromSelectedCell, getResultSlotNavigationTarget, publishMarketResult, saveMarketChart, sortAdminMarketsByTime } from "./ResultEnginePage.jsx";
import { SettingsPage } from "./SettingsPage.jsx";
import { SupportChatPage } from "./SupportChatPage.jsx";

const SUPPORT_CONVERSATIONS_REFRESH_MS = 15_000;
const SUPPORT_MESSAGES_REFRESH_MS = 15_000;
const NAV_BADGES_REFRESH_MS = 10_000;
const NAV_BADGES_SEEN_KEY = "realmatka-admin-nav-seen-at";
const NAV_BADGE_ROUTE_KEYS = ["dashboard", "bids", "users", "requests", "deposits", "support"];
const ADMIN_BUSINESS_DAY_OFFSET_MS = 5 * 60 * 60 * 1000;
const FULL_ADMIN_ROLES = new Set(["admin", "super_admin"]);
const RESULT_OPERATOR_ROLES = new Set(["operator", "result_operator"]);
const RESULT_ONLY_OPERATOR_ROLES = new Set(["result_only_operator"]);
const SUPPORT_OPERATOR_ROLES = new Set(["support_operator"]);

function isAllowedAdminRole(role) {
  const normalized = normalizeAdminRole(role);
  return FULL_ADMIN_ROLES.has(normalized) || RESULT_OPERATOR_ROLES.has(normalized) || RESULT_ONLY_OPERATOR_ROLES.has(normalized) || SUPPORT_OPERATOR_ROLES.has(normalized);
}

function normalizeAdminRole(role) {
  return String(role || "").trim().toLowerCase();
}

function hasFullAdminRole(role) {
  return FULL_ADMIN_ROLES.has(normalizeAdminRole(role));
}

function getDefaultAdminApiBase() {
  return normalizeAdminApiBase(
    window.ADMIN_DEFAULT_API_BASE ||
      "https://api.realmatka.in"
  );
}

const DEFAULT_API_BASE = getDefaultAdminApiBase();

const navItems = [
  { key: "results", label: "Result Engine" },
  { key: "bids", label: "All Bids" },
  { key: "users", label: "Users" },
  { key: "referrals", label: "Referrals" },
  { key: "requests", label: "Withdraw History" },
  { key: "deposits", label: "Deposit History" },
  { key: "dashboard", label: "Dashboard" },
  { key: "support", label: "Support Chat" },
  { key: "charts", label: "All Chart" },
  { key: "reports", label: "Reports" },
  { key: "notifications", label: "Notifications" },
  { key: "bonus", label: "Bonus" },
  { key: "settings", label: "Settings" },
  { key: "audit", label: "Audit Logs" }
];

function getNavItemsForRole(role) {
  const normalized = normalizeAdminRole(role);
  if (hasFullAdminRole(normalized)) {
    return navItems;
  }
  if (RESULT_OPERATOR_ROLES.has(normalized)) {
    return navItems.filter((item) => item.key === "results" || item.key === "support");
  }
  if (RESULT_ONLY_OPERATOR_ROLES.has(normalized)) {
    return navItems.filter((item) => item.key === "results");
  }
  if (SUPPORT_OPERATOR_ROLES.has(normalized)) {
    return navItems.filter((item) => item.key === "support");
  }
  return [];
}

function getDefaultRouteForRole(role) {
  return getNavItemsForRole(role)[0]?.key || "dashboard";
}

const routeMeta = {
  dashboard: { eyebrow: "Control Room", title: "Operational Dashboard", subtitle: "Live business totals, payout watch, alerts, and active platform health in one place." },
  users: { eyebrow: "Identity", title: "User Management", subtitle: "Review approvals, wallet exposure, lifecycle state, and operator history faster." },
  referrals: { eyebrow: "Growth", title: "Referral Overview", subtitle: "Track who referred whom, credited referral income, and pending carry balance." },
  requests: { eyebrow: "Withdraw", title: "Withdraw History", subtitle: "Manual withdraw queue, paid entries, and operator notes in one place." },
  deposits: { eyebrow: "Deposit", title: "Deposit History", subtitle: "All deposit requests, proofs, and credit actions in one place." },
  support: { eyebrow: "Support", title: "Support Chat Desk", subtitle: "Respond to player issues quickly with a focused conversation workspace." },
  results: { eyebrow: "Settlement", title: "Result Engine", subtitle: "" },
  charts: { eyebrow: "Data", title: "Chart Operations", subtitle: "Edit and verify chart rows with better visibility into changes and history." },
  reports: { eyebrow: "Reports", title: "Revenue Reports", subtitle: "Track collection, payout, and user-level exposure across time ranges." },
  bids: { eyebrow: "Betting", title: "All Bets", subtitle: "" },
  notifications: { eyebrow: "Messaging", title: "Notification Center", subtitle: "Broadcast platform updates and target users from one operator screen." },
  bonus: { eyebrow: "Promotions", title: "Bonus System", subtitle: "Control deposit, referral, and limited-time bonus rules from one place." },
  settings: { eyebrow: "Configuration", title: "Platform Settings", subtitle: "Control notices, support info, and promotional text from one panel." },
  audit: { eyebrow: "Compliance", title: "Audit Trail", subtitle: "Review sensitive actions, exports, and recovery operations with confidence." }
};

const supportCannedReplies = [
  "Namaste, hum aapka issue check kar rahe hain. Thoda sa wait kijiye.",
  "Payment status verify kiya ja raha hai. Agar amount debit hua hai to shortly update milega.",
  "Withdraw request queue me hai. Team isse review karke process karegi.",
  "Kripya relevant screenshot ya exact issue detail bhejiye taaki hum jaldi help kar saken.",
  "Issue resolve ho gaya hai. App refresh karke dobara check kijiye."
];

export function App() {
  const [token, setToken] = useState(getAdminToken());
  const [apiBase, setApiBase] = useState(DEFAULT_API_BASE);
  const [route, setRoute] = useState(getHashRoute());
  const [me, setMe] = useState(null);
  const [bootError, setBootError] = useState("");
  const [authBooting, setAuthBooting] = useState(Boolean(getAdminToken()));
  const [navSeenAt, setNavSeenAt] = useState(() => loadNavSeenAt());
  const [navEvents, setNavEvents] = useState([]);
  const allowedNavItems = useMemo(() => (me ? getNavItemsForRole(me.role) : navItems), [me?.role]);
  const allowedRouteKeys = useMemo(() => new Set(allowedNavItems.map((item) => item.key)), [allowedNavItems]);
  const navBadges = useMemo(() => buildNavBadges(navEvents, navSeenAt, route), [navEvents, navSeenAt, route]);
  const visibleNavBadges = useMemo(() => {
    return Object.fromEntries(Object.entries(navBadges).filter(([key]) => allowedRouteKeys.has(key)));
  }, [allowedRouteKeys, navBadges]);

  useEffect(() => {
    const onHashChange = () => setRoute(getHashRoute());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    if (!token) {
      setMe(null);
      setAuthBooting(false);
      return;
    }
    setAuthBooting(true);
    const expiresAt = getAdminSessionExpiry();
    if (expiresAt && expiresAt <= Date.now()) {
      clearSession();
      setToken("");
      setAuthBooting(false);
      return;
    }
    fetchApi(apiBase, "/api/auth/me", token)
      .then((data) => {
        if (!isAllowedAdminRole(data.role)) {
          throw new Error("Admin access required");
        }
        setMe(data);
        setBootError("");
        setAuthBooting(false);
      })
      .catch((error) => {
        setBootError(formatApiError(error, "Unable to verify admin session"));
        clearSession();
        setToken("");
        setAuthBooting(false);
      });
  }, [apiBase, token]);

  useEffect(() => {
    if (!token || !me || !allowedRouteKeys.has(route) || !NAV_BADGE_ROUTE_KEYS.includes(route)) {
      return;
    }
    markNavRouteSeen(route, new Date().toISOString(), setNavSeenAt);
  }, [allowedRouteKeys, me, route, token]);

  useEffect(() => {
    if (!token || !me || authBooting || allowedRouteKeys.has(route)) {
      return;
    }
    const nextRoute = getDefaultRouteForRole(me.role);
    window.location.hash = `#/${nextRoute}`;
    setRoute(nextRoute);
  }, [allowedRouteKeys, authBooting, me, route, token]);

  useEffect(() => {
    if (!token || !me) {
      setNavEvents([]);
      return undefined;
    }

    let active = true;

    async function refreshNavEvents() {
      try {
        const data = await fetchApi(apiBase, "/api/admin/live-events?limit=80", token);
        if (active) {
          setNavEvents(Array.isArray(data?.events) ? data.events : []);
        }
      } catch {
        // Sidebar badges are an operator convenience; transient failures should not interrupt the workspace.
      }
    }

    void refreshNavEvents();
    const timer = window.setInterval(() => {
      void refreshNavEvents();
    }, NAV_BADGES_REFRESH_MS);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [apiBase, me, token]);

  useEffect(() => {
    if (!token || !me || !allowedRouteKeys.has(route) || !NAV_BADGE_ROUTE_KEYS.includes(route)) {
      return;
    }
    const newestActiveEventAt = getNewestEventTimeForRoute(navEvents, route);
    if (newestActiveEventAt) {
      markNavRouteSeen(route, newestActiveEventAt, setNavSeenAt);
    }
  }, [allowedRouteKeys, me, navEvents, route, token]);

  if (token && authBooting) {
    return (
      <div className="login-shell">
        <section className="panel login-card">
          <div className="panel-head">
            <h2>Checking session...</h2>
          </div>
        </section>
      </div>
    );
  }

  if (!token || !me) {
    return <LoginScreen apiBase={apiBase} setApiBase={setApiBase} setToken={setToken} bootError={bootError} />;
  }

  return (
    <AdminShell
      apiBase={apiBase}
      me={me}
      navItems={allowedNavItems}
      navBadges={visibleNavBadges}
      onLogout={() => {
        clearSession();
        setToken("");
      }}
      fetchApi={fetchApi}
      pageFactory={(refreshKey, refresh) => {
        const shared = { apiBase, token, me, refresh };
        if (!allowedRouteKeys.has(route)) {
          return <PageState title="Access restricted" subtitle="Is operator role ko ye section access nahi hai." tone="error" />;
        }
        if (route === "users") return <UsersPage {...shared} key={`users-${refreshKey}`} />;
        if (route === "referrals") return <ReferralsPage {...shared} key={`referrals-${refreshKey}`} />;
        if (route === "requests") {
          return (
            <RequestsPage
              {...shared}
              initialRequestType="WITHDRAW"
              key={`requests-${refreshKey}`}
              lockedRequestType="WITHDRAW"
              pageTitle="Withdraw History"
              pageSubtitle="Manual withdraw queue, paid entries, and operator notes in one place."
            />
          );
        }
        if (route === "deposits") {
          return (
            <RequestsPage
              {...shared}
              initialRequestType="DEPOSIT"
              key={`deposits-${refreshKey}`}
              lockedRequestType="DEPOSIT"
              pageTitle="Deposit History"
              pageSubtitle="All deposit requests, proofs, and wallet credit actions in one place."
            />
          );
        }
        if (route === "support") {
          return (
            <SupportChatPage
              apiBase={apiBase}
              fetchApi={fetchApi}
              formatDate={formatDate}
              formatRelativeAge={formatRelativeAge}
              isOlderThanMinutes={isOlderThanMinutes}
              key={`support-${refreshKey}`}
              miniStat={miniStat}
              PageHeader={PageHeader}
              PageState={PageState}
              supportCannedReplies={supportCannedReplies}
              supportConversationsRefreshMs={SUPPORT_CONVERSATIONS_REFRESH_MS}
              supportMessagesRefreshMs={SUPPORT_MESSAGES_REFRESH_MS}
              token={token}
            />
          );
        }
        if (route === "results") return <ResultEnginePage LegacyResultsComponent={LegacyResultsPage} apiBase={apiBase} key={`results-${refreshKey}`} token={token} />;
        if (route === "charts") return <AllChartPage LegacyResultsComponent={LegacyResultsPage} apiBase={apiBase} key={`charts-${refreshKey}`} token={token} />;
        if (route === "reports") return <ReportsPage {...shared} key={`reports-${refreshKey}`} />;
        if (route === "bids") return <BidsPage {...shared} key={`bids-${refreshKey}`} />;
        if (route === "notifications") {
          return (
            <NotificationsPage
              apiBase={apiBase}
              fetchApi={fetchApi}
              formatDate={formatDate}
              key={`notifications-${refreshKey}`}
              PageHeader={PageHeader}
              PageState={PageState}
              token={token}
            />
          );
        }
        if (route === "bonus") {
          return (
            <BonusPage
              apiBase={apiBase}
              fetchApi={fetchApi}
              key={`bonus-${refreshKey}`}
              PageHeader={PageHeader}
              PageState={PageState}
              token={token}
            />
          );
        }
        if (route === "settings") {
          return (
            <SettingsPage
              apiBase={apiBase}
              fetchApi={fetchApi}
              key={`settings-${refreshKey}`}
              PageHeader={PageHeader}
              PageState={PageState}
              token={token}
            />
          );
        }
        if (route === "audit") {
          return (
            <AuditPage
              apiBase={apiBase}
              downloadTextFile={downloadTextFile}
              exportAdminData={exportAdminData}
              fetchApi={fetchApi}
              formatDate={formatDate}
              key={`audit-${refreshKey}`}
              PageHeader={PageHeader}
              PageState={PageState}
              token={token}
            />
          );
        }
        return <DashboardPage {...shared} key={`dashboard-${refreshKey}`} />;
      }}
      route={route}
      routeMeta={routeMeta}
      setRoute={setRoute}
      token={token}
    />
  );
}

function loadNavSeenAt() {
  const fallback = buildInitialNavSeenAt();
  try {
    const parsed = JSON.parse(window.localStorage.getItem(NAV_BADGES_SEEN_KEY) || "{}");
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && Object.keys(parsed).length) {
      return { ...fallback, ...parsed };
    }
    persistNavSeenAt(fallback);
    return fallback;
  } catch {
    return fallback;
  }
}

function buildInitialNavSeenAt() {
  const now = new Date().toISOString();
  return NAV_BADGE_ROUTE_KEYS.reduce((acc, key) => {
    acc[key] = now;
    return acc;
  }, {});
}

function persistNavSeenAt(value) {
  try {
    window.localStorage.setItem(NAV_BADGES_SEEN_KEY, JSON.stringify(value));
  } catch {
    // Local storage can be blocked; badges will still work for the active session.
  }
}

function markNavRouteSeen(route, seenAt, setNavSeenAt) {
  setNavSeenAt((current) => {
    const currentTime = Date.parse(current?.[route] || "");
    const nextTime = Date.parse(seenAt || "");
    if (Number.isFinite(currentTime) && Number.isFinite(nextTime) && currentTime >= nextTime) {
      return current;
    }
    const next = { ...current, [route]: seenAt };
    persistNavSeenAt(next);
    return next;
  });
}

function getEventRoute(type) {
  if (type === "bid") return "bids";
  if (type === "deposit") return "deposits";
  if (type === "withdraw") return "requests";
  if (type === "user") return "users";
  if (type === "support") return "support";
  return "";
}

function getNewestEventTimeForRoute(events, route) {
  let newestTime = 0;
  for (const event of Array.isArray(events) ? events : []) {
    if (getEventRoute(event?.type) !== route) continue;
    const eventTime = Date.parse(event?.createdAt || "");
    if (Number.isFinite(eventTime) && eventTime > newestTime) {
      newestTime = eventTime;
    }
  }
  return newestTime ? new Date(newestTime).toISOString() : "";
}

function buildNavBadges(events, seenAt, activeRoute) {
  const counts = {};

  for (const event of Array.isArray(events) ? events : []) {
    const route = getEventRoute(event?.type);
    if (!route || route === activeRoute) continue;

    const eventTime = Date.parse(event?.createdAt || "");
    const seenTime = Date.parse(seenAt?.[route] || "");
    if (!Number.isFinite(eventTime)) continue;
    if (Number.isFinite(seenTime) && eventTime <= seenTime) continue;

    counts[route] = Number(counts[route] || 0) + 1;
  }

  const dashboardTotal = ["bids", "users", "requests", "deposits", "support"].reduce((sum, key) => sum + Number(counts[key] || 0), 0);
  if (activeRoute !== "dashboard" && dashboardTotal > 0) {
    counts.dashboard = dashboardTotal;
  }

  return counts;
}

async function fetchApi(apiBase, path, token, options = {}) {
  try {
    return await baseFetchApi(apiBase, path, token, options);
  } catch (error) {
    if (error?.status === 401 && token) {
      clearSession();
      window.location.hash = "#/";
    }
    throw error;
  }
}

function DashboardPage({ apiBase, token }) {
  const [state, setState] = useState({ loading: true, error: "", summary: null, reports: null, users: [], monitoring: null, health: null });

  useEffect(() => {
    Promise.all([
      fetchApi(apiBase, "/api/admin/dashboard-summary", token),
      fetchApi(apiBase, "/api/admin/reports-summary", token),
      fetchApi(apiBase, "/api/admin/users", token),
      fetchApi(apiBase, "/api/admin/monitoring-summary", token)
    ])
      .then(([summary, reports, users, monitoring]) => setState({ loading: false, error: "", summary, reports, users, monitoring, health: null }))
      .catch((error) =>
        setState({
          loading: false,
          error: formatApiError(error, "Dashboard load failed"),
          summary: null,
          reports: null,
          users: [],
          monitoring: null,
          health: null
        })
      );
  }, [apiBase, token]);

  if (state.loading) return <PageState title="Dashboard" subtitle="Loading dashboard..." />;
  if (state.error) return <PageState title="Dashboard" subtitle={state.error} tone="error" />;

  const blocked = state.users.filter((user) => user.blockedAt).length;
  const alerts = [];
  if (state.summary.pendingWork.pendingWithdraws > 0) {
    alerts.push({
      level: state.summary.pendingWork.pendingWithdraws >= 5 ? "high" : "medium",
      title: "Withdraw queue",
      body: `${state.summary.pendingWork.pendingWithdraws} pending withdraw requests need review.`
    });
  }
  state.reports.marketReports
    .filter((market) => Number(market.betsAmount || 0) > 0)
    .map((market) => ({
      ...market,
      ratio: Number(market.payoutAmount || 0) / Math.max(Number(market.betsAmount || 0), 1)
    }))
    .filter((market) => market.ratio >= 0.6)
    .sort((left, right) => right.ratio - left.ratio)
    .slice(0, 3)
    .forEach((market) => alerts.push({ level: market.ratio >= 0.8 ? "high" : "medium", title: `${market.market} risk`, body: `Collection ${formatCurrency(market.betsAmount)} vs payout ${formatCurrency(market.payoutAmount)}` }));
  if (blocked > 0) {
    alerts.push({ level: "medium", title: "Blocked users", body: `${blocked} blocked users need review.` });
  }
  const actionCards = [
    {
      title: "Withdraw Queue",
      value: state.summary.pendingWork.pendingWithdraws,
      note: "Pending withdraw requests waiting for operator action.",
      href: "#/requests"
    },
    {
      title: "Deposit Queue",
      value: state.summary.pendingWork.pendingDeposits,
      note: "Deposit proofs waiting for wallet credit review.",
      href: "#/requests"
    },
    {
      title: "User Approvals",
      value: state.summary.pendingWork.userApprovals,
      note: "New registrations that still need admin approval.",
      href: "#/users"
    },
    {
      title: "Support Inbox",
      value: state.monitoring?.summary?.supportUnread ?? state.summary.pendingWork.supportUnread ?? 0,
      note: "Unread user support threads across the app.",
      href: "#/support"
    }
  ];
  const riskMarkets = state.reports.marketReports
    .filter((market) => Number(market.betsAmount || 0) > 0)
    .map((market) => ({
      ...market,
      ratio: Number(market.payoutAmount || 0) / Math.max(Number(market.betsAmount || 0), 1)
    }))
    .sort((left, right) => right.ratio - left.ratio)
    .slice(0, 5);
  const requestMix = [
    { label: "Pending Deposits", value: state.summary.pendingWork.pendingDeposits, tone: "primary" },
    { label: "Pending Withdraws", value: state.summary.pendingWork.pendingWithdraws, tone: "danger" },
    { label: "Processing Withdraws", value: Math.max(0, state.summary.pendingWork.walletApprovals - state.summary.pendingWork.pendingDeposits), tone: "accent" }
  ];
  const marketExposure = state.summary.marketExposure || [];

  return (
    <>
      <PageHeader title="Dashboard" subtitle="React operator dashboard for live totals, requests, and risk watch." />
      <section className="panel hero-panel">
        <div className="hero-grid">
          <div className="hero-stat">
            <span className="hero-kicker">Net Flow Today</span>
            <strong>{formatCurrency(Number(state.summary.today.depositAmount || 0) - Number(state.summary.today.withdrawAmount || 0))}</strong>
            <p>Deposit minus withdraw amount for today.</p>
          </div>
          <div className="hero-stat">
            <span className="hero-kicker">Collection Delta</span>
            <strong>{formatCurrency(state.reports.totals.collectionVsPayoutDelta)}</strong>
            <p>Total collection vs payout delta from reports summary.</p>
          </div>
          <div className="hero-actions">
            <a className="primary" href="#/requests">Open Payout Queue</a>
            <a className="secondary" href="#/results">Open Result Engine</a>
            <a className="secondary" href="#/support">Open Support Desk</a>
          </div>
        </div>
      </section>
      <section className="panel"><div className="stats">{[
        statCard("Total Users", state.summary.totals.users),
        statCard("Active Users", state.summary.today.activeUsers),
        statCard("Live Markets", state.summary.totals.liveMarkets),
        statCard("Withdraw Pending", state.summary.pendingWork.pendingWithdraws),
        statCard("Support Unread", state.summary.pendingWork.supportUnread || 0)
      ]}</div></section>
      <section className="panel"><div className="mini-stats">{[
        miniStat("Deposit Today", formatCurrency(state.summary.today.depositAmount)),
        miniStat("Withdraw Today", formatCurrency(state.summary.today.withdrawAmount)),
        miniStat("Bets Today", `${state.summary.today.betsCount}`),
        miniStat("Signup Bonus", formatCurrency(state.summary.today.signupBonusAmount)),
        miniStat("Support Threads", state.summary.totals.supportConversations || 0)
      ]}</div></section>
      <section className="panel">
        <div className="dashboard-grid">
          <div className="subpanel">
            <h3>Today Snapshot</h3>
            <div className="compact-list">
              <div className="compact-row"><strong>Today Deposit Amount</strong><span>{formatCurrency(state.summary.today.depositAmount)}</span></div>
              <div className="compact-row"><strong>Today Deposit Requests</strong><span>{state.summary.today.depositRequests}</span></div>
              <div className="compact-row"><strong>Today Withdraw Amount</strong><span>{formatCurrency(state.summary.today.withdrawAmount)}</span></div>
              <div className="compact-row"><strong>Today Withdraw Requests</strong><span>{state.summary.today.withdrawRequests}</span></div>
              <div className="compact-row"><strong>Today Login Count</strong><span>{state.summary.today.loginCount}</span></div>
              <div className="compact-row"><strong>Today Active Users</strong><span>{state.summary.today.activeUsers}</span></div>
              <div className="compact-row"><strong>Today Bets Count</strong><span>{state.summary.today.betsCount}</span></div>
              <div className="compact-row"><strong>Today Bets Amount</strong><span>{formatCurrency(state.summary.today.betsAmount)}</span></div>
              <div className="compact-row"><strong>Today Signup Bonus</strong><span>{formatCurrency(state.summary.today.signupBonusAmount)}</span></div>
            </div>
          </div>
          <div className="subpanel">
            <h3>System Totals</h3>
            <div className="compact-list">
              <div className="compact-row"><strong>Total Users</strong><span>{state.summary.totals.users}</span></div>
              <div className="compact-row"><strong>Approved Users</strong><span>{state.summary.totals.approvedUsers}</span></div>
              <div className="compact-row"><strong>Pending Users</strong><span>{state.summary.totals.pendingUsers}</span></div>
              <div className="compact-row"><strong>Total Markets</strong><span>{state.summary.totals.markets}</span></div>
              <div className="compact-row"><strong>Live Markets</strong><span>{state.summary.totals.liveMarkets}</span></div>
              <div className="compact-row"><strong>Pending Wallet Requests</strong><span>{state.summary.totals.pendingWalletRequests}</span></div>
              <div className="compact-row"><strong>Device Registrations</strong><span>{state.summary.totals.deviceRegistrations}</span></div>
            </div>
          </div>
        </div>
      </section>
      <section className="panel">
        <div className="panel-head">
          <h2>Priority Actions</h2>
          <p>Operator ko abhi sabse pehle kis desk par jaana chahiye, ye yahan se clear dikhega.</p>
        </div>
        <div className="action-card-grid">
          {actionCards.map((card) => (
            <a className="action-card" href={card.href} key={card.title}>
              <span>{card.title}</span>
              <strong>{card.value}</strong>
              <p>{card.note}</p>
            </a>
          ))}
        </div>
      </section>
      <section className="panel">
        <div className="dashboard-grid">
          <div className="subpanel">
            <h3>Pending Work</h3>
            <div className="compact-list">
              <div className="compact-row"><strong>User Approvals</strong><span>{state.summary.pendingWork.userApprovals}</span></div>
              <div className="compact-row"><strong>Wallet Approvals</strong><span>{state.summary.pendingWork.walletApprovals}</span></div>
              <div className="compact-row"><strong>Pending Deposits</strong><span>{state.summary.pendingWork.pendingDeposits}</span></div>
              <div className="compact-row"><strong>Pending Withdraws</strong><span>{state.summary.pendingWork.pendingWithdraws}</span></div>
            </div>
          </div>
          <div className="subpanel">
            <h3>Report Totals</h3>
            <div className="compact-list">
              <div className="compact-row"><strong>Deposit Success</strong><span>{formatCurrency(state.reports.totals.depositsSuccess)}</span></div>
              <div className="compact-row"><strong>Deposit Pending</strong><span>{formatCurrency(state.reports.totals.depositsPending)}</span></div>
              <div className="compact-row"><strong>Withdraw Success</strong><span>{formatCurrency(state.reports.totals.withdrawsSuccess)}</span></div>
              <div className="compact-row"><strong>Withdraw Pending</strong><span>{formatCurrency(state.reports.totals.withdrawsPending)}</span></div>
              <div className="compact-row"><strong>Withdraw Rejected</strong><span>{formatCurrency(state.reports.totals.withdrawsRejected)}</span></div>
              <div className="compact-row"><strong>Total Bet Amount</strong><span>{formatCurrency(state.reports.totals.betsAmount)}</span></div>
              <div className="compact-row"><strong>Total Payout Amount</strong><span>{formatCurrency(state.reports.totals.payoutAmount)}</span></div>
              <div className="compact-row"><strong>Collection vs Payout</strong><span>{formatCurrency(state.reports.totals.collectionVsPayoutDelta)}</span></div>
            </div>
          </div>
        </div>
      </section>
      <section className="panel">
        <div className="subpanel">
          <div className="panel-head">
            <h2>Live Market Exposure</h2>
            <p>Aaj ke bids me kis market par kitna pressure hai, aur kaunse digit ya panna par sabse zyada points lage hain.</p>
          </div>
          <div className="compact-list">
            {marketExposure.length ? marketExposure.map((item) => (
              <div className="empty-card" key={item.market}>
                <div className="compact-row"><strong>{item.market}</strong><span>{formatCurrency(item.totalPoints)}</span></div>
                <div className="compact-row"><strong>Total Bets</strong><span>{item.betsCount}</span></div>
                <div className="compact-row"><strong>Top Digits</strong><span>{formatExposureList(item.topDigits)}</span></div>
                <div className="compact-row"><strong>Top Pannas</strong><span>{formatExposureList(item.topPannas)}</span></div>
              </div>
            )) : <div className="empty-card">Aaj ke live market bids abhi available nahi hain.</div>}
          </div>
        </div>
      </section>
      <section className="panel">
        <div className="dashboard-grid">
          <div className="subpanel">
            <h3>Request Mix</h3>
            <div className="meter-list">
              {requestMix.map((item) => (
                <div className="meter-row" key={item.label}>
                  <div className="meter-row-head">
                    <strong>{item.label}</strong>
                    <span>{item.value}</span>
                  </div>
                  <div className="meter-track">
                    <div
                      className={`meter-fill ${item.tone}`}
                      style={{ width: `${Math.min(100, (Number(item.value || 0) / Math.max(1, state.summary.totals.pendingWalletRequests || 1)) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="subpanel">
            <h3>High Risk Markets</h3>
            <div className="compact-list">
              {riskMarkets.length ? riskMarkets.map((item) => (
                <div className="compact-row" key={item.market}>
                  <strong>{item.market}</strong>
                  <span>{formatCurrency(item.betsAmount)} / {formatCurrency(item.payoutAmount)} ({Math.round(item.ratio * 100)}%)</span>
                </div>
              )) : <div className="empty-card">No market payout pressure right now.</div>}
            </div>
          </div>
        </div>
      </section>
      <section className="panel">
        <div className="panel-head"><h2>Live Alerts</h2><p>Critical operator items from reports and user state.</p></div>
        <div className="compact-list">
          {[...alerts, ...(state.monitoring?.alerts || [])].length ? [...alerts, ...(state.monitoring?.alerts || [])].map((item, index) => (
            <div className={`alert-row ${item.level}`} key={`${item.title}-${index}`}>
              <div><strong>{item.title}</strong><span>{item.body}</span></div>
              <span className={`risk-chip ${item.level}`}>{item.level}</span>
            </div>
          )) : <div className="empty-card">No operator alerts right now.</div>}
        </div>
      </section>
      <section className="panel">
        <div className="dashboard-grid">
          <div className="subpanel">
            <h3>Backend Health</h3>
            <div className="compact-list">
              <div className="compact-row"><strong>Status</strong><span>{state.health?.status || "unknown"}</span></div>
              <div className="compact-row"><strong>Database</strong><span>{state.health?.checks?.database?.status || "-"}</span></div>
              <div className="compact-row"><strong>Env</strong><span>{state.health?.checks?.env?.status || "-"}</span></div>
              <div className="compact-row"><strong>Manifest</strong><span>{state.health?.checks?.manifest?.status || "-"}</span></div>
              <div className="compact-row"><strong>Uptime</strong><span>{state.health?.uptimeSeconds ?? 0}s</span></div>
              <div className="compact-row"><strong>Request ID</strong><span>{state.health?.requestId || "-"}</span></div>
            </div>
          </div>
          <div className="subpanel">
            <h3>Monitoring Snapshot</h3>
            <div className="compact-list">
              <div className="compact-row"><strong>Blocked Users</strong><span>{state.monitoring?.summary?.blockedUsers ?? 0}</span></div>
              <div className="compact-row"><strong>Deactivated Users</strong><span>{state.monitoring?.summary?.deactivatedUsers ?? 0}</span></div>
              <div className="compact-row"><strong>Pending Deposits</strong><span>{state.monitoring?.summary?.pendingDeposits ?? 0}</span></div>
              <div className="compact-row"><strong>Placeholder Results</strong><span>{state.monitoring?.summary?.placeholderResults ?? 0}</span></div>
            </div>
          </div>
          <div className="subpanel">
            <h3>Recent Audit Flags</h3>
            <div className="compact-list">
              {state.monitoring?.recentAuditFlags?.length ? state.monitoring.recentAuditFlags.map((item) => (
                <div className="compact-row" key={item.id}><strong>{item.action}</strong><span>{formatDate(item.createdAt)}</span></div>
              )) : <div className="empty-card">No recent flagged audit events.</div>}
            </div>
          </div>
        </div>
      </section>
      <section className="panel">
        <div className="dashboard-grid">
          <div className="subpanel">
            <h3>Recent Requests</h3>
            <div className="compact-list">
              {state.summary.recentRequests.map((item) => (
                <div className="compact-row" key={item.id}><strong>{item.userName}</strong><span>{item.type} - {formatCurrency(item.amount)}</span></div>
              ))}
            </div>
          </div>
          <div className="subpanel">
            <h3>Payout Watch</h3>
            <div className="compact-list">
              {state.reports.marketReports.slice(0, 6).map((item) => (
                <div className="compact-row" key={item.market}><strong>{item.market}</strong><span>{formatCurrency(item.betsAmount)} / {formatCurrency(item.payoutAmount)}</span></div>
              ))}
            </div>
          </div>
        </div>
      </section>
      <section className="panel">
        <div className="dashboard-grid">
          <div className="subpanel">
            <h3>Top Users</h3>
            <div className="compact-list">
              {state.summary.topUsers.map((item) => (
                <div className="compact-row" key={item.id}><strong>{item.name}</strong><span>{item.phone} / {formatCurrency(item.balance)}</span></div>
              ))}
            </div>
          </div>
          <div className="subpanel">
            <h3>Recent Bids</h3>
            <div className="compact-list">
              {state.summary.recentBids.map((item) => (
                <div className="compact-row" key={item.id}><strong>{item.userName} - {item.market}</strong><span>{item.boardLabel} / {item.digit} / {formatCurrency(item.points)}</span></div>
              ))}
            </div>
          </div>
        </div>
      </section>
      <section className="panel">
        <div className="subpanel">
          <h3>Daily Trend</h3>
          <div className="compact-list">
            {state.reports.dailySeries.slice(-10).map((item) => (
              <div className="compact-row" key={item.date}><strong>{item.date}</strong><span>{formatCurrency(item.collection)} / {formatCurrency(item.payout)}</span></div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}

function UsersPage({ apiBase, token, me }) {
  const [state, setState] = useState({ loading: true, error: "", users: [] });
  const [query, setQuery] = useState("");
  const [approval, setApproval] = useState("all");
  const [lifecycle, setLifecycle] = useState("all");
  const [message, setMessage] = useState("");
  const [busyId, setBusyId] = useState("");
  const [ledgerState, setLedgerState] = useState({ open: false, loading: false, error: "", detail: null });
  const [adjustmentDraft, setAdjustmentDraft] = useState({ userId: "", mode: "credit", amount: "", note: "" });

  useEffect(() => {
    void loadUsers();
  }, [apiBase, token]);

  if (state.loading) return <PageState title="Users" subtitle="Loading users..." />;
  if (state.error) return <PageState title="Users" subtitle={state.error} tone="error" />;

  const filtered = state.users.filter((user) => {
    const matchesQuery = !query || user.name.toLowerCase().includes(query.toLowerCase()) || user.phone.includes(query);
    const matchesApproval = approval === "all" || user.approvalStatus === approval;
    const matchesLifecycle =
      lifecycle === "all" ||
      (lifecycle === "blocked" && Boolean(user.blockedAt)) ||
      (lifecycle === "deactivated" && Boolean(user.deactivatedAt)) ||
      (lifecycle === "live" && !user.blockedAt && !user.deactivatedAt);
    return matchesQuery && matchesApproval && matchesLifecycle;
  });
  return (
    <>
      <PageHeader title="Users" subtitle="Search, review balances, and track account state." />
      <section className="panel">
        <div className="mini-stats">
          {[
            miniStat("Visible Users", filtered.length),
            miniStat("Approved", filtered.filter((user) => user.approvalStatus === "Approved").length),
            miniStat("Pending", filtered.filter((user) => user.approvalStatus === "Pending").length),
            miniStat("Wallet Total", formatCurrency(filtered.reduce((sum, user) => sum + Number(user.walletBalance || 0), 0))),
            miniStat("Signup Bonus Users", filtered.filter((user) => user.signupBonusGranted).length),
            miniStat("First Deposit Bonus Users", filtered.filter((user) => user.firstDepositBonusGranted).length)
          ]}
        </div>
      </section>
      <section className="panel">
        <div className="form-grid">
          <label className="wide"><span>Search</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name or phone" /></label>
          <label><span>Approval</span><select value={approval} onChange={(event) => setApproval(event.target.value)}><option value="all">All</option><option value="Approved">Approved</option><option value="Pending">Pending</option><option value="Rejected">Rejected</option></select></label>
          <label><span>Lifecycle</span><select value={lifecycle} onChange={(event) => setLifecycle(event.target.value)}><option value="all">All</option><option value="live">Live</option><option value="blocked">Blocked</option><option value="deactivated">Deactivated</option></select></label>
          <div className="actions wide">
            <button className="secondary" onClick={() => void exportAdminData(apiBase, token, "users")}>Export Users CSV</button>
            <button className="secondary" disabled={me?.role !== "admin"} onClick={() => window.location.hash = "#/audit"}>Open Audit Trail</button>
          </div>
        </div>
      </section>
      <section className="panel">
        <div className="table-head"><span>User</span><span>Status</span><span>Wallet</span></div>
        {message ? <p className={`message ${message.toLowerCase().includes("fail") || message.toLowerCase().includes("error") ? "error" : "success"}`}>{message}</p> : null}
        <div className="table-list">
          {filtered.length ? filtered.map((user) => (
            <div className="data-row" key={user.id}>
              <div className="row-main">
                <strong>{user.name}</strong>
                <span>{user.phone} - {user.referralCode}</span>
                <span>{user.blockedAt ? "Blocked" : user.deactivatedAt ? "Deactivated" : "Live"}</span>
              </div>
              <div className="row-main">
                <strong>{user.activityState}</strong>
                <span>{user.approvalStatus}</span>
              </div>
              <div className="row-main">
                <strong>{formatCurrency(user.walletBalance)}</strong>
                <span>Bids {user.bidCount}</span>
                <span>
                  {user.signupBonusGranted ? "Signup bonus done" : "Signup bonus pending"} |{" "}
                  {user.firstDepositBonusGranted ? "First deposit bonus done" : "First deposit bonus pending"}
                </span>
                <span>{user.statusNote || "No status note"}</span>
              </div>
              <div className="row-actions">
                <button className="secondary" disabled={busyId === user.id} onClick={() => void openLedger(user.id)}>Open Ledger</button>
                <button
                  className="secondary"
                  disabled={busyId === user.id}
                  onClick={() =>
                    setAdjustmentDraft((current) => ({
                      userId: current.userId === user.id ? "" : user.id,
                      mode: "credit",
                      amount: "",
                      note: current.userId === user.id ? "" : `Manual wallet credit for ${user.name}`
                    }))
                  }
                >
                  {adjustmentDraft.userId === user.id ? "Close Wallet Tool" : "Wallet Tool"}
                </button>
                {user.approvalStatus === "Pending" ? (
                  <>
                    <button className="primary" disabled={busyId === user.id} onClick={() => void submitApproval(user.id, "approve")}>Approve</button>
                    <button className="secondary danger" disabled={busyId === user.id} onClick={() => void submitApproval(user.id, "reject")}>Reject</button>
                  </>
                ) : null}
                {user.blockedAt ? (
                  <button className="secondary" disabled={busyId === user.id} onClick={() => void submitLifecycle(user.id, "unblock")}>Unblock</button>
                ) : (
                  <button className="secondary danger" disabled={busyId === user.id} onClick={() => void submitLifecycle(user.id, "block")}>Block</button>
                )}
                {user.deactivatedAt ? (
                  <button className="secondary" disabled={busyId === user.id} onClick={() => void submitLifecycle(user.id, "activate")}>Activate</button>
                ) : (
                  <button className="secondary" disabled={busyId === user.id} onClick={() => void submitLifecycle(user.id, "deactivate")}>Deactivate</button>
                )}
                <button className="secondary danger" disabled={busyId === user.id || me?.role !== "admin"} onClick={() => void submitUserDelete(user)}>
                  Delete User
                </button>
              </div>
              {adjustmentDraft.userId === user.id ? (
                <div className="panel" style={{ gridColumn: "1 / -1", marginTop: 12, background: "#fffaf5" }}>
                  <div className="panel-head">
                    <h3>Wallet Credit / Debit / Referral</h3>
                    <p>{user.name} ({user.phone}) ka wallet yahin se adjust karo.</p>
                  </div>
                  <div className="form-grid">
                    <label>
                      <span>Mode</span>
                      <select
                        value={adjustmentDraft.mode}
                        onChange={(event) => setAdjustmentDraft((current) => ({ ...current, mode: event.target.value }))}
                      >
                        <option value="credit">Credit</option>
                        <option value="debit">Debit</option>
                        <option value="referral">Referral</option>
                      </select>
                    </label>
                    <label>
                      <span>Amount</span>
                      <input
                        value={adjustmentDraft.amount}
                        onChange={(event) => setAdjustmentDraft((current) => ({ ...current, amount: event.target.value }))}
                        placeholder="1000"
                        inputMode="decimal"
                      />
                    </label>
                    <label className="wide">
                      <span>Operator Note</span>
                      <input
                        value={adjustmentDraft.note}
                        onChange={(event) => setAdjustmentDraft((current) => ({ ...current, note: event.target.value }))}
                        placeholder="Why are you adjusting this wallet?"
                      />
                    </label>
                    <div className="actions wide">
                      <button
                        className="primary"
                        disabled={busyId === user.id || !Number(adjustmentDraft.amount || 0)}
                        onClick={() => void submitWalletAdjustment(user)}
                      >
                        {adjustmentDraft.mode === "debit" ? "Debit Wallet" : adjustmentDraft.mode === "referral" ? "Credit Referral" : "Credit Wallet"}
                      </button>
                      <button
                        className="secondary"
                        disabled={busyId === user.id}
                        onClick={() => setAdjustmentDraft({ userId: "", mode: "credit", amount: "", note: "" })}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          )) : <div className="empty-card">No users match current filters.</div>}
        </div>
      </section>
      {ledgerState.open ? <UserLedgerModal state={ledgerState} onClose={closeLedger} /> : null}
    </>
  );

  async function loadUsers() {
    fetchApi(apiBase, "/api/admin/users", token)
      .then((users) => setState({ loading: false, error: "", users }))
      .catch((error) => setState({ loading: false, error: formatApiError(error, "Users load failed"), users: [] }));
  }

  async function submitApproval(userId, action) {
    setBusyId(userId);
    setMessage("");
    try {
      await fetchApi(apiBase, "/api/admin/user-approval", token, {
        method: "POST",
        body: { userId, action }
      });
      await loadUsers();
      setMessage(action === "approve" ? "User approved successfully." : "User rejected successfully.");
    } catch (error) {
      setMessage(formatApiError(error, "User approval action failed."));
    } finally {
      setBusyId("");
    }
  }

  async function submitLifecycle(userId, action) {
    setBusyId(userId);
    setMessage("");
    try {
      await fetchApi(apiBase, "/api/admin/user-status", token, {
        method: "POST",
        body: { userId, action, note: "" }
      });
      await loadUsers();
      setMessage(`User ${action} action saved.`);
    } catch (error) {
      setMessage(formatApiError(error, "User lifecycle update failed."));
    } finally {
      setBusyId("");
    }
  }

  async function submitUserDelete(user) {
    const confirmed = window.confirm(
      `Delete ${user.name} (${user.phone})?\n\nIsse user account, wallet history, bids, bank details, sessions, notifications aur payment records delete ho jayenge. Ye action undo nahi hoga.`
    );
    if (!confirmed) return;

    setBusyId(user.id);
    setMessage("");
    try {
      await fetchApi(apiBase, "/api/admin/user-delete", token, {
        method: "POST",
        body: { userId: user.id }
      });
      await loadUsers();
      setMessage(`${user.name} deleted successfully.`);
    } catch (error) {
      setMessage(formatApiError(error, "User delete failed."));
    } finally {
      setBusyId("");
    }
  }

  async function openLedger(userId) {
    setLedgerState({ open: true, loading: true, error: "", detail: null });
    try {
      const detail = await fetchApi(apiBase, `/api/admin/user-detail?userId=${encodeURIComponent(userId)}`, token);
      setLedgerState({ open: true, loading: false, error: "", detail });
    } catch (error) {
      setLedgerState({ open: true, loading: false, error: formatApiError(error, "Unable to load ledger."), detail: null });
    }
  }

  function closeLedger() {
    setLedgerState({ open: false, loading: false, error: "", detail: null });
  }

  async function submitWalletAdjustment(user) {
    setBusyId(user.id);
    setMessage("");
    try {
      await fetchApi(apiBase, "/api/admin/wallet-adjustment", token, {
        method: "POST",
        body: {
          userId: user.id,
          mode: adjustmentDraft.mode,
          amount: Number(adjustmentDraft.amount || 0),
          note: adjustmentDraft.note
        }
      });
      await loadUsers();
      if (ledgerState.open && ledgerState.detail?.user?.id === user.id) {
        const detail = await fetchApi(apiBase, `/api/admin/user-detail?userId=${encodeURIComponent(user.id)}`, token);
        setLedgerState({ open: true, loading: false, error: "", detail });
      }
      setAdjustmentDraft({ userId: "", mode: "credit", amount: "", note: "" });
      setMessage(
        adjustmentDraft.mode === "debit"
          ? `Rs ${adjustmentDraft.amount} debited from ${user.name}.`
          : adjustmentDraft.mode === "referral"
            ? `Rs ${adjustmentDraft.amount} referral credited to ${user.name}.`
            : `Rs ${adjustmentDraft.amount} credited to ${user.name}.`
      );
    } catch (error) {
      setMessage(formatApiError(error, "Wallet adjustment failed."));
    } finally {
      setBusyId("");
    }
  }
}

function RequestsPage({
  apiBase,
  token,
  initialRequestType = "all",
  lockedRequestType = "",
  pageTitle = "Wallet Requests",
  pageSubtitle = "Loading deposit and withdraw history..."
}) {
  const todayInput = toDateInputValue(new Date());
  const [state, setState] = useState({ loading: true, error: "", items: [], pending: [], reconciliation: null });
  const [proof, setProof] = useState(null);
  const [query, setQuery] = useState("");
  const [requestType, setRequestType] = useState(initialRequestType);
  const [status, setStatus] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [message, setMessage] = useState("");
  const [busyId, setBusyId] = useState("");
  const [actionDraft, setActionDraft] = useState(null);

  useEffect(() => {
    void load();
  }, [apiBase, token]);

  useEffect(() => {
    setRequestType(initialRequestType);
  }, [initialRequestType]);

  const effectiveRequestType = lockedRequestType || requestType;
  const isDepositOnly = effectiveRequestType === "DEPOSIT";
  const isWithdrawOnly = effectiveRequestType === "WITHDRAW";
  const isDailyHistoryView = Boolean(lockedRequestType);

  useEffect(() => {
    if (isDailyHistoryView) {
      setFromDate(todayInput);
      setToDate(todayInput);
      return;
    }
    if (!lockedRequestType) {
      setFromDate("");
      setToDate("");
    }
  }, [isDailyHistoryView, lockedRequestType, todayInput]);

  const historyItems = effectiveRequestType === "all" ? state.items : state.items.filter((item) => item.type === effectiveRequestType);
  const sortedHistoryItems = useMemo(
    () => [...historyItems].sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()),
    [historyItems]
  );
  const pendingItems = effectiveRequestType === "all" ? state.pending : state.pending.filter((item) => item.type === effectiveRequestType);

  const filteredItems = sortedHistoryItems.filter((item) => {
    const matchesQuery =
      !query ||
      item.user?.name?.toLowerCase().includes(query.toLowerCase()) ||
      item.user?.phone?.includes(query) ||
      String(item.referenceId || "").toLowerCase().includes(query.toLowerCase());
    const matchesStatus = status === "all" || item.status === status;
    const matchesDate = isWithinDateRange(item.createdAt, fromDate, toDate);
    return matchesQuery && matchesStatus && matchesDate;
  });
  const prioritizedPending = useMemo(
    () =>
      [...pendingItems].sort((left, right) => {
        const leftPriority = getWalletQueuePriority(left);
        const rightPriority = getWalletQueuePriority(right);
        if (leftPriority !== rightPriority) return rightPriority - leftPriority;
        return new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
      }),
    [pendingItems]
  );
  const pendingWithdraws = state.pending.filter((item) => item.type === "WITHDRAW").length;
  const pendingDeposits = state.pending.filter((item) => item.type === "DEPOSIT").length;
  const successfulDeposits = state.items.filter((item) => item.type === "DEPOSIT" && item.status === "SUCCESS").length;
  const rejectedDeposits = state.items.filter((item) => item.type === "DEPOSIT" && ["FAILED", "CANCELLED", "REJECTED"].includes(item.status)).length;
  const pendingDepositAmount = prioritizedPending.filter((item) => item.type === "DEPOSIT").reduce((total, item) => total + Number(item.amount || 0), 0);
  const processingWithdraws = state.items.filter((item) => item.type === "WITHDRAW" && item.status === "BACKOFFICE").length;
  const rejectedWithdraws = state.items.filter((item) => item.type === "WITHDRAW" && item.status === "REJECTED").length;
  const paidWithdraws = state.items.filter((item) => item.type === "WITHDRAW" && item.status === "SUCCESS").length;
  const staleWithdraws = prioritizedPending.filter((item) => isOlderThanMinutes(item.createdAt, 24 * 60)).length;
  const urgentPendingCount = prioritizedPending.filter((item) => getWalletQueuePriority(item) >= 3).length;
  const oldestPending = prioritizedPending[0] || null;
  const rangeLabel = fromDate && toDate ? fromDate === toDate ? "Today only" : `${fromDate} to ${toDate}` : "All history";
  const canShiftDay = Boolean(fromDate && toDate && fromDate === toDate);
  const setSingleDay = (value) => {
    if (!value) return;
    setFromDate(value);
    setToDate(value);
  };
  const shiftSingleDay = (diff) => {
    if (!canShiftDay) return;
    const current = new Date(`${fromDate}T00:00:00`);
    if (Number.isNaN(current.getTime())) return;
    current.setDate(current.getDate() + diff);
    setSingleDay(toDateInputValue(current));
  };
  const metricStats = isDepositOnly
      ? [
        miniStat("Pending Deposits", pendingDeposits),
        miniStat("Paid Deposits", successfulDeposits),
        miniStat("Failed Deposits", rejectedDeposits),
        miniStat("Stale Pending", staleWithdraws),
        miniStat("Pending Amount", formatCurrency(pendingDepositAmount)),
        miniStat("Total Paid", formatCurrency(state.reconciliation?.summary?.depositSuccessAmount ?? 0))
      ]
    : isWithdrawOnly
      ? [
          miniStat("Pending Withdraws", pendingWithdraws),
          miniStat("Processing Withdraws", processingWithdraws),
          miniStat("Stale Pending", staleWithdraws),
          miniStat("Urgent Queue", urgentPendingCount),
          miniStat("Rejected", rejectedWithdraws),
          miniStat("Paid", paidWithdraws),
          miniStat("Withdraw Paid", formatCurrency(state.reconciliation?.summary?.withdrawSuccessAmount ?? 0))
        ]
      : [
          miniStat("Pending Deposits", pendingDeposits),
          miniStat("Pending Withdraws", pendingWithdraws),
          miniStat("Processing Withdraws", processingWithdraws),
          miniStat("Stale Pending", staleWithdraws),
          miniStat("Urgent Queue", urgentPendingCount),
          miniStat("Rejected", rejectedWithdraws),
          miniStat("Paid", paidWithdraws),
          miniStat("Withdraw Paid", formatCurrency(state.reconciliation?.summary?.withdrawSuccessAmount ?? 0))
        ];
  const pendingEmptyCopy = isDepositOnly
    ? "No pending deposit requests right now."
    : isWithdrawOnly
      ? "No pending withdraw requests right now."
      : "No pending wallet requests right now.";
  const historyEmptyCopy = isDepositOnly
    ? "No deposit requests match current filters."
    : isWithdrawOnly
      ? "No withdraw requests match current filters."
      : "No wallet requests match current filters.";

  if (state.loading) return <PageState title={pageTitle} subtitle={pageSubtitle} />;
  if (state.error) return <PageState title={pageTitle} subtitle={state.error} tone="error" />;

  return (
    <>
      <section className="panel hero-panel">
        <div className="compact-metric-strip">
          {metricStats}
        </div>
      </section>
      <section className="panel">
        <div className="toolbar-grid toolbar-grid-requests">
          {isDailyHistoryView ? (
            <div className="toolbar-field wide">
              <span>History Range</span>
              <div className="inline-actions">
                <strong className="muted">{rangeLabel}</strong>
                <button className="secondary" type="button" onClick={() => shiftSingleDay(-1)} disabled={!canShiftDay}>Previous Day</button>
                <button className="secondary" type="button" onClick={() => setSingleDay(todayInput)}>Today</button>
                <button className="secondary" type="button" onClick={() => shiftSingleDay(1)} disabled={!canShiftDay || fromDate === todayInput}>Next Day</button>
                <button className="secondary" type="button" onClick={() => { setFromDate(""); setToDate(""); }}>All History</button>
              </div>
            </div>
          ) : null}
          <label className="toolbar-field toolbar-field-search">
            <span>Search</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="User, phone, reference ID" />
          </label>
          {!lockedRequestType ? (
            <label className="toolbar-field">
              <span>Type</span>
              <select value={requestType} onChange={(event) => setRequestType(event.target.value)}>
                <option value="all">All</option>
                <option value="DEPOSIT">Deposit</option>
                <option value="WITHDRAW">Withdraw</option>
              </select>
            </label>
          ) : null}
          <label className="toolbar-field">
            <span>Status</span>
            <select value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="all">All</option>
              <option value="INITIATED">Pending</option>
              <option value="BACKOFFICE">Processing</option>
              <option value="SUCCESS">Paid</option>
              <option value="FAILED">Failed</option>
              <option value="CANCELLED">Cancelled</option>
              <option value="REJECTED">Rejected</option>
            </select>
          </label>
          <label className="toolbar-field">
            <span>From</span>
            <input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} max={toDate || undefined} />
          </label>
          <label className="toolbar-field">
            <span>To</span>
            <input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} min={fromDate || undefined} max={toDateInputValue(new Date().toISOString())} />
          </label>
          <div className="toolbar-actions">
            <button className="secondary" onClick={() => void exportAdminData(apiBase, token, "requests")}>Export CSV</button>
            <button className="secondary" onClick={() => { setQuery(""); setRequestType(initialRequestType); setStatus("all"); setFromDate(isDailyHistoryView ? todayInput : ""); setToDate(isDailyHistoryView ? todayInput : ""); }}>Reset</button>
          </div>
        </div>
        {message ? <p className={`message ${message.toLowerCase().includes("fail") || message.toLowerCase().includes("error") ? "error" : "success"}`}>{message}</p> : null}
        {!isDepositOnly ? <div className="request-highlight-grid">
          {prioritizedPending.length ? prioritizedPending.slice(0, 3).map((item) => (
            <div className={`request-highlight-card ${item.type === "WITHDRAW" ? "withdraw" : "deposit"}`} key={`highlight-${item.id}`}>
              <span className="request-highlight-type">{item.type}</span>
              <strong>{formatCurrency(item.amount)}</strong>
              <p>{item.user?.name || "Unknown user"} Â· {item.user?.phone || "No phone"}</p>
              <small>{getWalletQueueSummary(item)}</small>
            </div>
          )) : <div className="empty-card">No highlighted pending requests right now.</div>}
        </div> : null}
        {!isDepositOnly ? <div className="table-list">
          {prioritizedPending.length ? prioritizedPending.map((item) => (
            <div className={`data-row payout-row${getWalletQueuePriority(item) >= 3 ? " urgent" : ""}`} key={item.id}>
              <div className="row-main">
                <strong>{item.type} - {formatCurrency(item.amount)}</strong>
                <span>{item.user?.name} ({item.user?.phone})</span>
                <span>{formatDate(item.createdAt)}</span>
                <span>Before {formatCurrency(item.beforeBalance)} / Live {formatCurrency(item.liveBalance)} / Age {formatRelativeAge(item.createdAt)}</span>
              </div>
              <div className="row-main">
                <strong>{getWalletRequestMetaTitle(item)}</strong>
                <span>{getWalletRequestMetaLine(item)}</span>
                <span>{getWalletRequestReferenceLine(item)}</span>
                {item.proofUrl ? <button className="secondary" onClick={() => setProof(item)}>Open Proof</button> : <span>No proof URL</span>}
              </div>
              <div className="row-main">
                <strong>{getPayoutStatusLabel(item.status, item.type)}</strong>
                <span>{getWalletRequestStatusHint(item)}</span>
                {getWalletRequestNoteLine(item) ? <span>{getWalletRequestNoteLine(item)}</span> : null}
              </div>
              <div className="row-actions">
                <button className="secondary" type="button" onClick={() => openAction(item, "annotate")}>Add Note</button>
                {item.status === "INITIATED" ? (
                  <>
                    <button className="primary" disabled={busyId === item.id} type="button" onClick={() => openAction(item, "approve")}>{getWalletApproveLabel(item)}</button>
                    <button className="secondary danger" disabled={busyId === item.id} type="button" onClick={() => openAction(item, "reject")}>Reject</button>
                  </>
                ) : null}
                {canCompleteWalletRequest(item) ? (
                  <>
                    <button className="primary" disabled={busyId === item.id} type="button" onClick={() => openAction(item, "complete")}>{getWalletCompleteLabel(item)}</button>
                    <button className="secondary danger" disabled={busyId === item.id} type="button" onClick={() => openAction(item, "reject")}>Reject</button>
                  </>
                ) : null}
              </div>
            </div>
          )) : <div className="empty-card">{pendingEmptyCopy}</div>}
        </div> : null}
      </section>
      <section className="panel">
        <div className="table-head"><span>Request</span><span>{isDepositOnly ? "Payment / Proof" : "Bank / Proof"}</span><span>Status</span></div>
        <div className="table-list">
          {filteredItems.length ? filteredItems.map((item) => (
            <div className="data-row" key={item.id}>
              <div className="row-main">
                <strong>{item.type} - {formatCurrency(item.amount)}</strong>
                <span>{item.user?.name} ({item.user?.phone})</span>
                <span>{formatDate(item.createdAt)}</span>
              </div>
              <div className="row-main">
                <strong>{getWalletRequestMetaTitle(item)}</strong>
                <span>{getWalletRequestMetaLine(item)}</span>
                <span>{getWalletRequestReferenceLine(item)}</span>
                {item.proofUrl ? <button className="secondary" onClick={() => setProof(item)}>Open Proof</button> : <span>No proof URL</span>}
              </div>
              <div className="row-main">
                <strong>{getPayoutStatusLabel(item.status, item.type)}</strong>
                <span>After Balance {formatCurrency(item.afterBalance)}</span>
                <span>Live Balance {formatCurrency(item.liveBalance)}</span>
                {getWalletRequestNoteLine(item) ? <span>{getWalletRequestNoteLine(item)}</span> : null}
              </div>
              <div className="row-actions">
                <button className="secondary" type="button" onClick={() => openAction(item, "annotate")}>Add Note</button>
                {canCompleteWalletRequest(item) ? (
                  <>
                    <button className="primary" disabled={busyId === item.id} type="button" onClick={() => openAction(item, "complete")}>{getWalletCompleteLabel(item)}</button>
                    <button className="secondary danger" disabled={busyId === item.id} type="button" onClick={() => openAction(item, "reject")}>Reject</button>
                  </>
                ) : null}
                {item.status === "INITIATED" ? (
                  <>
                    <button className="primary" disabled={busyId === item.id} type="button" onClick={() => openAction(item, "approve")}>{getWalletApproveLabel(item)}</button>
                    <button className="secondary danger" disabled={busyId === item.id} type="button" onClick={() => openAction(item, "reject")}>Reject</button>
                  </>
                ) : null}
              </div>
            </div>
          )) : <div className="empty-card">{historyEmptyCopy}</div>}
        </div>
      </section>
      {actionDraft ? (
        <div className="modal-shell" onClick={(event) => { if (event.target === event.currentTarget) setActionDraft(null); }}>
          <div className="modal-card modal-card-narrow">
            <div className="modal-head">
              <h3>{getPayoutActionTitle(actionDraft.action, actionDraft.item.type)}</h3>
              <button className="secondary" onClick={() => setActionDraft(null)}>Close</button>
            </div>
            <div className="form-grid">
              <label className="wide"><span>User</span><input readOnly value={`${actionDraft.item.user?.name || "Unknown"} (${actionDraft.item.user?.phone || "n/a"})`} /></label>
              <label><span>Type</span><input readOnly value={actionDraft.item.type} /></label>
              <label><span>Amount</span><input readOnly value={formatCurrency(actionDraft.item.amount)} /></label>
              <div className="inline-note wide">
                <strong>{getPayoutActionTitle(actionDraft.action, actionDraft.item.type)}</strong>
                <span>{getWalletActionChecklist(actionDraft.item, actionDraft.action)}</span>
              </div>
              <label><span>Reference ID</span><input value={actionDraft.referenceId} onChange={(event) => setActionDraft((current) => ({ ...current, referenceId: event.target.value }))} placeholder="UTR / bank ref / cash note" /></label>
              <label><span>Proof URL</span><input value={actionDraft.proofUrl} onChange={(event) => setActionDraft((current) => ({ ...current, proofUrl: event.target.value }))} placeholder="Optional proof link" /></label>
              <label className="wide"><span>Operator Note</span><textarea rows={4} value={actionDraft.note} onChange={(event) => setActionDraft((current) => ({ ...current, note: event.target.value }))} placeholder="Manual payout note, rejection reason, or processing remark" /></label>
            </div>
            <div className="actions">
              <button className="primary" disabled={busyId === actionDraft.item.id} onClick={() => void submitAction()}>{busyId === actionDraft.item.id ? "Saving..." : getPayoutActionButton(actionDraft.action, actionDraft.item.type)}</button>
            </div>
          </div>
        </div>
      ) : null}
      {proof ? <ProofModal item={proof} onClose={() => setProof(null)} /> : null}
    </>
  );

  async function load() {
    return Promise.all([
      fetchApi(apiBase, "/api/admin/wallet-request-history", token),
      fetchApi(apiBase, "/api/admin/wallet-requests", token),
      fetchApi(apiBase, "/api/admin/reconciliation-summary", token)
    ])
      .then(([items, pending, reconciliation]) => setState({ loading: false, error: "", items, pending, reconciliation }))
      .catch((error) => setState({ loading: false, error: formatApiError(error, "Wallet requests load failed"), items: [], pending: [], reconciliation: null }));
  }

  function openAction(item, action) {
    setActionDraft({
      item,
      action,
      note: item.note || "",
      referenceId: item.referenceId || "",
      proofUrl: item.proofUrl || ""
    });
  }

  async function submitAction() {
    if (!actionDraft) return;
    setBusyId(actionDraft.item.id);
    setMessage("");
    try {
      await fetchApi(apiBase, "/api/admin/wallet-request-action", token, {
        method: "POST",
        body: {
          requestId: actionDraft.item.id,
          action: actionDraft.action,
          note: actionDraft.note,
          referenceId: actionDraft.referenceId,
          proofUrl: actionDraft.proofUrl
        }
      });
      setActionDraft(null);
      await load();
      setMessage(getPayoutSuccessMessage(actionDraft.action, actionDraft.item.type));
    } catch (error) {
      setMessage(formatApiError(error, `${actionDraft.item.type === "DEPOSIT" ? "Deposit" : "Payout"} action failed.`));
    } finally {
      setBusyId("");
    }
  }
}

function LegacyResultsPage({ apiBase, token, mode = "results" }) {
  const [state, setState] = useState({ loading: true, error: "", markets: [], auditLogs: [] });
  const [selectedSlug, setSelectedSlug] = useState("");
  const [chartType, setChartType] = useState("jodi");
  const [savedRows, setSavedRows] = useState([]);
  const [chartDraftRows, setChartDraftRows] = useState([]);
  const [marketForm, setMarketForm] = useState({ result: "", status: "Active", action: "Open", open: "", close: "", category: "games" });
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");
  const [lastSettlement, setLastSettlement] = useState(null);
  const [preview, setPreview] = useState(null);
  const [exposure, setExposure] = useState(null);
  const [marketResultDrafts, setMarketResultDrafts] = useState({});
  const [currentMinutes, setCurrentMinutes] = useState(() => getAdminCurrentMinutes());
  const [showFullChart, setShowFullChart] = useState(false);
  const [editorWeekLabel, setEditorWeekLabel] = useState("");
  const [editorDayIndex, setEditorDayIndex] = useState(0);
  const [editorJodiValue, setEditorJodiValue] = useState("");
  const [editorOpenValue, setEditorOpenValue] = useState("");
  const [editorCloseValue, setEditorCloseValue] = useState("");
  const resultInputRefs = useRef([]);
  const marketResultInputRefs = useRef({});
  const isChartsMode = mode === "charts";
  const marketStorageKey = isChartsMode ? "realmatka_admin_all_chart_market" : "realmatka_admin_result_market";

  useEffect(() => {
    let cancelled = false;

    fetchApi(apiBase, "/api/markets/list", token)
      .then((markets) => {
        if (cancelled) {
          return;
        }
        setState((current) => ({ ...current, loading: false, error: "", markets }));
        const savedSlug = typeof window !== "undefined" ? window.localStorage.getItem(marketStorageKey) : "";
        const matchingSavedMarket = savedSlug ? markets.find((market) => market.slug === savedSlug) : null;
        if (matchingSavedMarket) {
          setSelectedSlug(matchingSavedMarket.slug);
        } else if (markets[0]) {
          setSelectedSlug(markets[0].slug);
        }
        fetchApi(apiBase, "/api/admin/audit-logs", token)
          .then((auditLogs) => {
            if (!cancelled) {
              setState((current) => ({ ...current, auditLogs }));
            }
          })
          .catch(() => {});
      })
      .catch((error) => {
        if (!cancelled) {
          setState({ loading: false, error: formatApiError(error, "Result engine load failed"), markets: [], auditLogs: [] });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [apiBase, token, marketStorageKey]);

  useEffect(() => {
    if (!selectedSlug || typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(marketStorageKey, selectedSlug);
  }, [marketStorageKey, selectedSlug]);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentMinutes(getAdminCurrentMinutes());
    }, 60_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    setMarketResultDrafts((current) => {
      const next = { ...current };
      for (const market of state.markets) {
        if (!Object.hasOwn(next, market.slug)) {
          next[market.slug] = market.result || "";
        }
      }
      return next;
    });
  }, [state.markets]);

  useEffect(() => {
    const market = state.markets.find((item) => item.slug === selectedSlug);
    if (!market) {
      return;
    }
    setMarketForm({
      result: market.result || "",
      status: market.status || "Active",
      action: market.action || "Open",
      open: market.open || "",
      close: market.close || "",
      category: market.category || "games"
    });
    setMessage("");
    setLastSettlement(null);
  }, [selectedSlug, state.markets]);

  useEffect(() => {
    if (!selectedSlug) return;
    fetchApi(apiBase, `/api/charts/${selectedSlug}?type=${chartType}`, token).then((chart) => {
      const rows = chart.rows || [];
      setSavedRows(rows);
      const normalizedRows = normalizeChartEditorRows(chartType, rows);
      setChartDraftRows(normalizedRows);
      setEditorWeekLabel(normalizedRows[normalizedRows.length - 1]?.[0] || "");
      setEditorDayIndex(0);
      setEditorJodiValue("");
      setEditorOpenValue("");
      setEditorCloseValue("");
    });
  }, [apiBase, token, selectedSlug, chartType]);

  useEffect(() => {
    if (!selectedSlug) return;
    fetchApi(apiBase, `/api/admin/settlement-preview?slug=${selectedSlug}`, token)
      .then(setPreview)
      .catch(() => setPreview(null));
  }, [apiBase, token, selectedSlug, marketForm.result]);

  useEffect(() => {
    if (!selectedSlug) return;
    fetchApi(apiBase, `/api/admin/market-exposure?slug=${selectedSlug}`, token)
      .then(setExposure)
      .catch(() => setExposure(null));
  }, [apiBase, token, selectedSlug]);

  useEffect(() => {
    if (isChartsMode && chartType !== "panna") {
      setChartType("panna");
    }
  }, [isChartsMode, chartType]);

  if (state.loading) return <PageState title="Result Engine" subtitle="Loading results..." />;
  if (state.error) return <PageState title="Result Engine" subtitle={state.error} tone="error" />;

  const editableRows = chartDraftRows;
  const rowsForSave = serializeChartRows(chartType, editableRows);
  const comparableSavedRows = serializeChartRows(chartType, normalizeChartEditorRows(chartType, savedRows));
  const diff = diffRows(comparableSavedRows, rowsForSave);
  const history = state.auditLogs.filter((item) => item.action === "CHART_UPDATE" && item.entityId === `${selectedSlug}:${chartType}`).slice(0, 6);
  const selectedMarket = state.markets.find((item) => item.slug === selectedSlug);
  const sortedMarketsForResultEngine = isChartsMode ? state.markets : sortAdminMarketsByTime(state.markets, currentMinutes);
  const resultSlots = toResultSlots(marketForm.result);
  const resultStage = getResultStage(marketForm.result);
  const chartHeaders = getChartPreviewHeaders(chartType);
  const previewRows = chartType === "panna" ? buildAdminPannaPreviewRows(editableRows) : buildAdminJodiPreviewRows(editableRows);
  const weekOptions = editableRows.map((row) => String(row[0] || "")).filter(Boolean);
  const selectedEditorRow = editableRows.find((row) => String(row[0] || "") === editorWeekLabel) || null;
  const selectedEditorCell = selectedEditorRow ? selectedEditorRow[editorDayIndex + 1] || "" : "";
  const recentPreviewRows = previewRows.slice(-3);
  const selectedEditorDateLabel = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][editorDayIndex] || "-";
  const marketTiming = selectedMarket ? `${selectedMarket.open || "-"} - ${selectedMarket.close || "-"}` : "-";
  const resultSummaryCards = !isChartsMode
    ? [
        miniStat("Stage", resultStage),
        miniStat("Action", marketForm.action || "-"),
        miniStat("Status", marketForm.status || "-"),
        miniStat("Preview Payout", formatCurrency(preview?.summary?.payout ?? 0)),
        miniStat("Eligible", preview?.summary?.eligible ?? 0),
        miniStat("Wins / Losses", `${preview?.summary?.wins ?? 0} / ${preview?.summary?.losses ?? 0}`)
      ]
    : [];

  return (
    <>
      <PageHeader
        title={isChartsMode ? "All Chart" : "Result Engine"}
        subtitle={isChartsMode ? "Chart preview, bracket mark, missed-date correction, and save controls." : ""}
      />
      {!isChartsMode ? (
        <AdminMarketPublishList
        busy={busy}
        currentMinutes={currentMinutes}
        marketResultDrafts={marketResultDrafts}
        marketResultInputRefs={marketResultInputRefs}
        markets={sortedMarketsForResultEngine}
        onDraftChange={handleQuickResultSlotChange}
        onDraftKeyDown={handleQuickResultSlotKeyDown}
        onQuickPublish={quickPublishMarket}
        onSelectMarket={setSelectedSlug}
        selectedSlug={selectedSlug}
        />
      ) : null}
      <ResultPublishSettlementSection
        busy={busy}
        exposure={exposure}
        formatCurrency={formatCurrency}
        handleResultSlotChange={handleResultSlotChange}
        handleResultSlotKeyDown={handleResultSlotKeyDown}
        isChartsMode={isChartsMode}
        lastSettlement={lastSettlement}
        marketForm={marketForm}
        marketTiming={marketTiming}
        markets={sortedMarketsForResultEngine}
        message={message}
        preview={preview}
        publishResult={publishResult}
        resultInputRefs={resultInputRefs}
        resultSlots={resultSlots}
        resultStage={resultStage}
        resultSummaryCards={resultSummaryCards}
        selectedMarket={selectedMarket}
        selectedSlug={selectedSlug}
        setMarketForm={setMarketForm}
        setSelectedSlug={setSelectedSlug}
      />
      <ChartEditorPreviewSection
        applyBracketMark={applyBracketMark}
        applyEditorToChart={applyEditorToChart}
        busy={busy}
        chartHeaders={chartHeaders}
        chartType={chartType}
        clearSelectedCell={clearSelectedCell}
        diff={diff}
        diffRows={diffRows}
        editorCloseValue={editorCloseValue}
        editorDayIndex={editorDayIndex}
        editorJodiValue={editorJodiValue}
        editorOpenValue={editorOpenValue}
        editorWeekLabel={editorWeekLabel}
        fillEditorFromSelectedCell={fillEditorFromSelectedCell}
        formatDate={formatDate}
        formatPannaDisplayValue={formatPannaDisplayValue}
        handleChartTypeChange={(event) => setChartType(event.target.value)}
        highlightPreviewValue={highlightPreviewValue}
        history={history}
        isChartsMode={isChartsMode}
        message={message}
        parsePannaEditorCell={parsePannaEditorCell}
        previewRows={previewRows}
        recentPreviewRows={recentPreviewRows}
        safeParse={safeParse}
        saveChart={saveChart}
        selectedEditorCell={selectedEditorCell}
        selectedEditorDateLabel={selectedEditorDateLabel}
        selectedMarket={selectedMarket}
        selectedSlug={selectedSlug}
        setEditorCloseValue={setEditorCloseValue}
        setEditorDayIndex={setEditorDayIndex}
        setEditorJodiValue={setEditorJodiValue}
        setEditorOpenValue={setEditorOpenValue}
        setEditorWeekLabel={setEditorWeekLabel}
        setSelectedSlug={setSelectedSlug}
        setShowFullChart={setShowFullChart}
        showFullChart={showFullChart}
        state={state}
        weekOptions={weekOptions}
      />
    </>
  );

  async function publishResult() {
    if (!selectedSlug) {
      return;
    }
    setBusy("publish");
    setMessage("");
    try {
      const result = await publishMarketResult({
        apiBase,
        chartType,
        fetchApi,
        fetchChartAfterPublish: true,
        marketForm,
        normalizeChartEditorRows,
        previousResult: selectedMarket?.result || "",
        selectedSlug,
        token
      });
      const latestExposure = await fetchApi(apiBase, `/api/admin/market-exposure?slug=${selectedSlug}`, token).catch(() => null);
      setState((current) => ({ ...current, markets: result.markets }));
      setExposure(latestExposure);
      setSavedRows(result.rows);
      if (result.normalizedRows.length) {
        const normalizedRows = result.normalizedRows;
        setChartDraftRows(normalizedRows);
        setEditorWeekLabel(normalizedRows[normalizedRows.length - 1]?.[0] || "");
      }
      setLastSettlement(result.lastSettlement);
      fetchApi(apiBase, "/api/admin/audit-logs", token)
        .then((auditLogs) => {
          setState((current) => ({ ...current, auditLogs }));
        })
        .catch(() => {});
      if (result.didCorrectOpenResult) {
        setMessage("Open result correction publish ho gaya. Sirf open-side eligible bets dobara settle hui.");
      } else if (result.didCorrectFullResult) {
        setMessage("Final result correction publish ho gaya. Sirf close/full-game bets dobara settle hui.");
      } else if (result.didPublishOpenResult) {
        setMessage(result.previousResult && /^[0-9]{3}-[0-9]{2}-[0-9]{3}$/.test(result.previousResult) ? "Half result restore ho gaya. Ab sirf pending close-side bets full result tak wait karengi." : "Open result publish ho gaya. Open-side eligible bets settle ho gayi.");
      } else if (!result.didSettle) {
        setMessage("Placeholder result reset ho gaya. Settled bids pending me wapas aa gayi.");
      } else {
        setMessage("Final result publish ho gaya. Pending close/full-game bets settle ho gayi.");
      }
    } catch (error) {
      setMessage(formatApiError(error, "Result publish failed."));
    } finally {
      setBusy("");
    }
  }

  async function quickPublishMarket(market) {
    setBusy(`quick-${market.slug}`);
    setMessage("");
    try {
      const result = await publishMarketResult({
        apiBase,
        chartType,
        fetchApi,
        fetchChartAfterPublish: false,
        marketForm: {
          result: String(marketResultDrafts[market.slug] ?? market.result ?? "").trim(),
          status: market.status,
          action: market.action,
          open: market.open,
          close: market.close,
          category: market.category
        },
        normalizeChartEditorRows,
        previousResult: market.result || "",
        selectedSlug: market.slug,
        token
      });
      const latestExposure = selectedSlug === market.slug ? await fetchApi(apiBase, `/api/admin/market-exposure?slug=${market.slug}`, token).catch(() => null) : exposure;
      setState((current) => ({ ...current, markets: result.markets }));
      setExposure(latestExposure);
      setMarketResultDrafts((current) => ({ ...current, [market.slug]: String(marketResultDrafts[market.slug] ?? "").trim() }));
      fetchApi(apiBase, "/api/admin/audit-logs", token)
        .then((auditLogs) => {
          setState((current) => ({ ...current, auditLogs }));
        })
        .catch(() => {});
      if (selectedSlug === market.slug) {
        const selectedMarket = result.markets.find((item) => item.slug === market.slug);
        if (selectedMarket) {
          setMarketForm({
            result: selectedMarket.result || "",
            status: selectedMarket.status || "Active",
            action: selectedMarket.action || "Open",
            open: selectedMarket.open || "",
            close: selectedMarket.close || "",
            category: selectedMarket.category || "games"
          });
        }
      }
      if (result.didCorrectOpenResult) {
        setMessage(`${market.name}: open result correction publish ho gaya.`);
      } else if (result.didCorrectFullResult) {
        setMessage(`${market.name}: final result correction publish ho gaya.`);
      } else if (result.didPublishOpenResult) {
        setMessage(result.previousResult && /^[0-9]{3}-[0-9]{2}-[0-9]{3}$/.test(result.previousResult) ? `${market.name}: full se half correction ho gaya.` : `${market.name}: open result publish ho gaya.`);
      } else if (!result.didSettle) {
        setMessage(`${market.name}: placeholder reset ho gaya, settled bids pending me aa gayi.`);
      } else {
        setMessage(`${market.name}: final result publish ho gaya aur pending bets settle ho gayi.`);
      }
    } catch (error) {
      setMessage(formatApiError(error, `${market.name}: publish failed.`));
    } finally {
      setBusy("");
    }
  }

  function handleQuickResultSlotChange(slug, index, rawValue) {
    const currentDraft = String(marketResultDrafts[slug] ?? state.markets.find((market) => market.slug === slug)?.result ?? "");
    const currentSlots = toResultSlots(currentDraft);
    const { value, nextResult } = buildNextResultFromSlotChange(index, rawValue, currentSlots, fromResultSlots);
    setMarketResultDrafts((current) => ({ ...current, [slug]: nextResult }));
    if (value && index < 7) {
      marketResultInputRefs.current?.[slug]?.[index + 1]?.focus?.();
      marketResultInputRefs.current?.[slug]?.[index + 1]?.select?.();
    }
  }

  function handleQuickResultSlotKeyDown(slug, index, event) {
    const currentDraft = String(marketResultDrafts[slug] ?? state.markets.find((market) => market.slug === slug)?.result ?? "");
    const currentSlots = toResultSlots(currentDraft);
    const nextTarget = getResultSlotNavigationTarget(index, event.key, currentSlots, 8);
    if (!nextTarget) {
      return;
    }
    if (nextTarget.preventDefault) {
      event.preventDefault();
    }
    marketResultInputRefs.current?.[slug]?.[nextTarget.targetIndex]?.focus?.();
  }

  async function saveChart() {
    if (!selectedSlug) {
      return;
    }
    setBusy("chart");
    setMessage("");
    try {
      const result = await saveMarketChart({
        apiBase,
        applyEditorValuesToRows,
        chartDraftRows,
        chartType,
        editorCloseValue,
        editorDayIndex,
        editorJodiValue,
        editorOpenValue,
        editorWeekLabel,
        fetchApi,
        formatPannaEditorCellValue,
        normalizeChartEditorRows,
        sanitizeJodiEditorInput,
        selectedSlug,
        serializeChartRows,
        token
      });
      setSavedRows(result.rows);
      const normalizedRows = result.normalizedRows;
      setChartDraftRows(normalizedRows);
      setEditorWeekLabel(normalizedRows[normalizedRows.length - 1]?.[0] || "");
      setState((current) => ({ ...current, auditLogs: result.auditLogs }));
      setMessage("Chart saved successfully.");
    } catch (error) {
      setMessage(formatApiError(error, "Chart save failed."));
    } finally {
      setBusy("");
    }
  }

  function handleResultSlotChange(index, rawValue) {
    const { value, nextResult } = buildNextResultFromSlotChange(index, rawValue, resultSlots, fromResultSlots);
    setMarketForm((current) => ({ ...current, result: nextResult }));
    if (value && index < resultInputRefs.current.length - 1) {
      resultInputRefs.current[index + 1]?.focus();
      resultInputRefs.current[index + 1]?.select?.();
    }
  }

  function handleResultSlotKeyDown(index, event) {
    const nextTarget = getResultSlotNavigationTarget(index, event.key, resultSlots, resultInputRefs.current.length);
    if (!nextTarget) {
      return;
    }
    if (nextTarget.preventDefault) {
      event.preventDefault();
    }
    resultInputRefs.current[nextTarget.targetIndex]?.focus();
  }

  function fillEditorFromSelectedCell() {
    const nextValues = getEditorValuesFromSelectedCell(chartType, selectedEditorCell, parsePannaEditorCell, normalizeJodiPreviewCell);
    if (Object.hasOwn(nextValues, "jodi")) {
      setEditorJodiValue(nextValues.jodi);
      return;
    }
    setEditorOpenValue(nextValues.open);
    setEditorCloseValue(nextValues.close);
  }

  function applyBracketMark() {
    const nextValues = getBracketMarkEditorValues(chartType);
    if (Object.hasOwn(nextValues, "jodi")) {
      setEditorJodiValue(nextValues.jodi);
      return;
    }
    setEditorOpenValue(nextValues.open);
    setEditorCloseValue(nextValues.close);
  }

  function clearSelectedCell() {
    const nextValues = getClearedEditorValues(chartType);
    if (Object.hasOwn(nextValues, "jodi")) {
      setEditorJodiValue(nextValues.jodi);
      return;
    }
    setEditorOpenValue(nextValues.open);
    setEditorCloseValue(nextValues.close);
  }

  function applyEditorToChart() {
    const label = String(editorWeekLabel || "").trim();
    if (!label) {
      setMessage("Week row label is required.");
      return;
    }

    setChartDraftRows((current) => applyEditorValuesToRows(current, chartType, label, editorDayIndex, editorJodiValue, editorOpenValue, editorCloseValue));
    setMessage("Chart cell updated locally. Save Chart to publish it everywhere.");
  }
}

function ReferralsPage({ apiBase, token }) {
  const [state, setState] = useState({ loading: true, error: "", report: null });
  const [query, setQuery] = useState("");

  useEffect(() => {
    let active = true;
    setState((current) => ({ ...current, loading: true, error: "" }));
    fetchApi(apiBase, "/api/admin/referrals?limit=500", token)
      .then((report) => {
        if (active) setState({ loading: false, error: "", report });
      })
      .catch((error) => {
        if (active) setState({ loading: false, error: formatApiError(error, "Referral report load nahi hua."), report: null });
      });
    return () => {
      active = false;
    };
  }, [apiBase, token]);

  if (state.loading) return <PageState title="Referrals" subtitle="Referral report load ho raha hai..." />;
  if (state.error) return <PageState title="Referrals" subtitle={state.error} tone="error" />;

  const report = state.report || { totals: {}, referrers: [], relationships: [] };
  const normalizedQuery = query.trim().toLowerCase();
  const referrers = (report.referrers || []).filter((item) => {
    if (!normalizedQuery) return true;
    return [item.name, item.phone, item.referralCode].some((value) => String(value || "").toLowerCase().includes(normalizedQuery));
  });
  const relationships = (report.relationships || []).filter((item) => {
    if (!normalizedQuery) return true;
    return [
      item.referrer?.name,
      item.referrer?.phone,
      item.referrer?.referralCode,
      item.referred?.name,
      item.referred?.phone,
      item.referred?.referralCode
    ].some((value) => String(value || "").toLowerCase().includes(normalizedQuery));
  });

  return (
    <>
      <PageHeader title="Referrals" subtitle="Kis user ne kis user ko refer kiya aur referral income/carry kitna hai." />
      <section className="panel">
        <div className="mini-stats">
          {[
            miniStat("Referrers", report.totals?.referrers ?? 0),
            miniStat("Referred Users", report.totals?.referredUsers ?? 0),
            miniStat("Wallet Credited", formatCurrency(report.totals?.walletCredited ?? 0)),
            miniStat("Pending Carry", formatCurrency(report.totals?.pendingCarry ?? 0)),
            miniStat("Recorded Referral", formatCurrency(report.totals?.recordedCommission ?? 0))
          ]}
        </div>
      </section>
      <section className="panel">
        <div className="form-grid">
          <label className="wide">
            <span>Search</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name, phone, referral code" />
          </label>
        </div>
      </section>
      <section className="panel">
        <div className="panel-head">
          <h2>Referral Balance By User</h2>
          <p>Wallet credited amount referrer ke account me add hua referral income hai. Pending carry next threshold tak hold me rahega.</p>
        </div>
        <div className="table-head"><span>Referrer</span><span>Referral Balance</span><span>Network</span></div>
        <div className="table-list">
          {referrers.length ? referrers.map((item) => (
            <div className="data-row" key={item.id}>
              <div className="row-main">
                <strong>{item.name || "-"}</strong>
                <span>{item.phone || "-"} - {item.referralCode || "-"}</span>
              </div>
              <div className="row-main">
                <strong>{formatCurrency(item.walletCredited)}</strong>
                <span>Pending carry {formatCurrency(item.pendingCarry)}</span>
                <span>Recorded {formatCurrency(item.recordedCommission)}</span>
              </div>
              <div className="row-main">
                <strong>{item.referredCount} referred</strong>
                <span>{item.recordedCount} referral records</span>
              </div>
            </div>
          )) : <div className="empty-card">Referral balance abhi available nahi hai.</div>}
        </div>
      </section>
      <section className="panel">
        <div className="panel-head">
          <h2>Who Referred Whom</h2>
          <p>Yahan direct referral relation aur us pair se recorded commission dikhega.</p>
        </div>
        <div className="table-head"><span>Referrer</span><span>Referred User</span><span>Commission</span></div>
        <div className="table-list">
          {relationships.length ? relationships.map((item) => (
            <div className="data-row" key={`${item.referrer?.id}-${item.referred?.id}`}>
              <div className="row-main">
                <strong>{item.referrer?.name || "-"}</strong>
                <span>{item.referrer?.phone || "-"} - {item.referrer?.referralCode || "-"}</span>
              </div>
              <div className="row-main">
                <strong>{item.referred?.name || "-"}</strong>
                <span>{item.referred?.phone || "-"} - {item.referred?.referralCode || "-"}</span>
                <span>Joined {formatDate(item.referred?.joinedAt)}</span>
              </div>
              <div className="row-main">
                <strong>{formatCurrency(item.pairCommission)}</strong>
                <span>{item.pairCount} records</span>
              </div>
            </div>
          )) : <div className="empty-card">Abhi kisi user ne referral code se signup nahi kiya.</div>}
        </div>
      </section>
    </>
  );
}

function ReportsPage({ apiBase, token }) {
  const [state, setState] = useState({ loading: true, error: "", report: null });
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  useEffect(() => {
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    fetchApi(apiBase, `/api/admin/reports-summary${params.toString() ? `?${params.toString()}` : ""}`, token)
      .then((report) => setState({ loading: false, error: "", report }))
      .catch((error) => setState({ loading: false, error: formatApiError(error, "Reports load failed"), report: null }));
  }, [apiBase, token, from, to]);

  if (state.loading) return <PageState title="Reports" subtitle="Loading reports..." />;
  if (state.error) return <PageState title="Reports" subtitle={state.error} tone="error" />;

  return (
    <>
      <PageHeader title="Reports" subtitle="Daily money flow, user reports, and market reports." />
      <section className="panel">
        <div className="form-grid">
          <label><span>From ISO</span><input value={from} onChange={(event) => setFrom(event.target.value)} placeholder="2026-04-01T00:00:00.000Z" /></label>
          <label><span>To ISO</span><input value={to} onChange={(event) => setTo(event.target.value)} placeholder="2026-04-03T23:59:59.999Z" /></label>
          <div className="actions">
            <button className="secondary" onClick={() => void exportAdminData(apiBase, token, "bids")}>Export Bid CSV</button>
          </div>
        </div>
      </section>
      <section className="panel"><div className="stats">{[
        statCard("Deposit Success", formatCurrency(state.report.totals.depositsSuccess)),
        statCard("Withdraw Success", formatCurrency(state.report.totals.withdrawsSuccess)),
        statCard("Bet Amount", formatCurrency(state.report.totals.betsAmount)),
        statCard("Payout Amount", formatCurrency(state.report.totals.payoutAmount))
      ]}</div></section>
      <section className="panel">
        <div className="dashboard-grid">
          <div className="subpanel">
            <h3>User Wise</h3>
            <div className="compact-list">
              {state.report.userReports.slice(0, 12).map((item) => (
                <div className="compact-row" key={item.userId}><strong>{item.userName}</strong><span>{formatCurrency(item.betAmount)} / {formatCurrency(item.payoutAmount)}</span></div>
              ))}
            </div>
          </div>
          <div className="subpanel">
            <h3>Market Wise</h3>
            <div className="compact-list">
              {state.report.marketReports.slice(0, 12).map((item) => (
                <div className="compact-row" key={item.market}><strong>{item.market}</strong><span>{formatCurrency(item.betsAmount)} / {formatCurrency(item.payoutAmount)}</span></div>
              ))}
            </div>
          </div>
        </div>
      </section>
      <section className="panel">
        <div className="subpanel">
          <h3>Daily Series</h3>
          <div className="compact-list">
            {state.report.dailySeries.map((item) => (
              <div className="compact-row" key={item.date}><strong>{item.date}</strong><span>{formatCurrency(item.collection)} / {formatCurrency(item.payout)}</span></div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}

function BidsPage({ apiBase, token }) {
  const PAGE_SIZE = 50;
  const todayInput = toDateInputValue(new Date());
  const [state, setState] = useState({
    loading: true,
    error: "",
    bids: [],
    pagination: { limit: PAGE_SIZE, offset: 0, total: 0, hasMore: false }
  });
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [pageOffset, setPageOffset] = useState(0);
  const [fromDate, setFromDate] = useState(todayInput);
  const [toDate, setToDate] = useState(todayInput);

  useEffect(() => {
    setState((current) => ({
      ...current,
      loading: true,
      error: ""
    }));
    const searchParams = new URLSearchParams({
      limit: String(PAGE_SIZE),
      offset: String(pageOffset),
      search: query,
      status,
      from: fromDate,
      to: toDate
    });
    fetchApi(apiBase, `/api/admin/bids?${searchParams.toString()}`, token)
      .then((data) =>
        setState({
          loading: false,
          error: "",
          bids: data.items || [],
          pagination: data.pagination || { limit: PAGE_SIZE, offset: pageOffset, total: (data.items || []).length, hasMore: false }
        })
      )
      .catch((error) =>
        setState({
          loading: false,
          error: formatApiError(error, "Bids load failed"),
          bids: [],
          pagination: { limit: PAGE_SIZE, offset: pageOffset, total: 0, hasMore: false }
        })
      );
  }, [apiBase, token, pageOffset, query, status, fromDate, toDate]);

  useEffect(() => {
    setPageOffset(0);
  }, [query, status, fromDate, toDate]);

  if (state.loading) return <PageState title="All Bids" subtitle="Loading bids..." />;
  if (state.error) return <PageState title="All Bids" subtitle={state.error} tone="error" />;

  const filtered = state.bids;
  const visibleBetAmount = filtered.reduce((sum, bid) => sum + Number(bid.points || 0), 0);
  const visibleWinAmount = filtered.reduce((sum, bid) => sum + Number(bid.payout || 0), 0);
  const pendingCount = filtered.filter((bid) => bid.status === "Pending").length;
  const wonCount = filtered.filter((bid) => bid.status === "Won").length;
  const lostCount = filtered.filter((bid) => bid.status === "Lost").length;
  const pageStart = state.pagination.total ? state.pagination.offset + 1 : 0;
  const pageEnd = state.pagination.offset + filtered.length;
  const rangeLabel = fromDate && toDate ? fromDate === toDate ? "Today only" : `${fromDate} to ${toDate}` : "All history";

  return (
    <>
      <PageHeader title="All Bids" subtitle="" />
      <section className="panel">
        <div className="section-head">
          <div>
            <h3>All Bids</h3>
            <p className="muted">{rangeLabel}</p>
          </div>
          <div className="inline-actions">
            <label><span>From</span><input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} /></label>
            <label><span>To</span><input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} /></label>
            <button className="secondary" type="button" onClick={() => { setFromDate(todayInput); setToDate(todayInput); }}>Today</button>
          </div>
        </div>
        <div className="form-grid">
          <label className="wide"><span>Search</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="User, phone, market, digit, bid ID" /></label>
          <label><span>Status</span><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">All</option><option value="Pending">Pending</option><option value="Won">Won</option><option value="Lost">Lost</option></select></label>
          <div className="actions">
              <button className="secondary" onClick={() => void exportAdminData(apiBase, token, "bids")}>Export CSV</button>
          </div>
        </div>
      </section>
      <section className="panel">
        <div className="mini-stats bid-summary-strip">
          {[
            miniStat("Visible Bids", filtered.length),
            miniStat("Bet Amount", formatCurrency(visibleBetAmount)),
            miniStat("Win Amount", formatCurrency(visibleWinAmount)),
              miniStat("Pending", pendingCount),
              miniStat("Won", wonCount),
              miniStat("Lost", lostCount)
            ]}
          </div>
        </section>
        <section className="panel">
          <div className="pagination">
            <span className="pagination-info">
              {pageStart}-{pageEnd} of {state.pagination.total} bids
            </span>
            <button
              className="secondary"
              disabled={state.pagination.offset <= 0}
              onClick={() => setPageOffset((current) => Math.max(0, current - PAGE_SIZE))}
            >
              Previous
            </button>
            <button
              className="secondary"
              disabled={!state.pagination.hasMore}
              onClick={() => setPageOffset((current) => current + PAGE_SIZE)}
            >
              Next
            </button>
          </div>
          <div className="table-list">
            {!filtered.length ? <div className="empty-card">Is filter ke andar koi bid nahi mili.</div> : null}
            {filtered.map((bid) => (
              <div className="data-row bid-row" key={bid.id}>
                <div className="row-main bid-row-main">
                  <div className="bid-row-head">
                    <strong>{bid.user?.name || "Unknown"} ({bid.user?.phone || "n/a"})</strong>
                    <span>{bid.settledAt ? `Settled ${formatDate(bid.settledAt)}` : `Placed ${formatDate(bid.createdAt)}`}</span>
                  </div>
                  <div className="bid-row-market">
                    <strong>{bid.market}</strong>
                    <span>{bid.boardLabel}</span>
                  </div>
                  <div className="bid-row-meta">
                    <span>Placed: {formatDate(bid.createdAt)}</span>
                    <span>Settled: {bid.settledAt ? formatDate(bid.settledAt) : "Pending"}</span>
                  </div>
                  <div className="bid-row-meta">
                    <span>Game: {bid.gameType || bid.boardLabel || "-"}</span>
                    <span>Session: {getBidDisplaySession(bid)}</span>
                    <span>Digit: {bid.digit || "-"}</span>
                  </div>
                  <div className="bid-row-meta muted">
                    <span>Bid ID: {bid.id}</span>
                    <span>Settled Result: {bid.settledResult || "-"}</span>
                  </div>
                </div>
              <div className="bid-row-side">
                <div className="bid-metric-card">
                  <span>Bet Amount</span>
                  <strong>{formatCurrency(bid.points)}</strong>
                </div>
                <div className="bid-metric-card">
                  <span>Win Amount</span>
                  <strong>{formatCurrency(bid.payout)}</strong>
                </div>
                <span className={`risk-chip ${getBidStatusTone(bid.status)}`}>{bid.status}</span>
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

function UserLedgerModal({ state, onClose }) {
  const detail = state.detail;
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const todayInput = toDateInputValue(new Date());
  const walletEntries = detail?.walletEntries || [];
  const bids = detail?.bids || [];

  useEffect(() => {
    if (!detail) return;
    setFromDate(todayInput);
    setToDate(todayInput);
  }, [detail?.user?.id, todayInput]);

  const walletTimeline = walletEntries
    .slice()
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
  const bidTimeline = bids
    .slice()
    .sort((left, right) => getBidTimelineStamp(right) - getBidTimelineStamp(left));
  const filteredWalletTimeline = walletTimeline.filter((entry) => isWithinDateRange(entry.createdAt, fromDate, toDate));
  const filteredBidTimeline = bidTimeline.filter((bid) => isWithinDateRange(bid.settledAt || bid.createdAt, fromDate, toDate));
  const filteredWalletSummary = buildFilteredWalletSummary(filteredWalletTimeline);
  const filteredBidSummary = buildFilteredBidSummary(filteredBidTimeline);
  const lossDays = buildBidLossDays(filteredBidTimeline);
  const winningDays = buildBidWinningDays(filteredBidTimeline);
  const rangeLabel = fromDate && toDate ? fromDate === toDate ? "Today only" : `${fromDate} to ${toDate}` : "All history";
  const walletVisibleLabel = `${filteredWalletTimeline.length} of ${walletTimeline.length}`;
  const bidVisibleLabel = `${filteredBidTimeline.length} of ${bidTimeline.length}`;
  const canShiftDay = Boolean(fromDate && toDate && fromDate === toDate);

  const setSingleDay = (value) => {
    if (!value) return;
    setFromDate(value);
    setToDate(value);
  };

  const shiftSingleDay = (diff) => {
    if (!canShiftDay) return;
    const current = new Date(`${fromDate}T00:00:00`);
    if (Number.isNaN(current.getTime())) return;
    current.setDate(current.getDate() + diff);
    const nextValue = toDateInputValue(current);
    setSingleDay(nextValue);
  };

  return (
    <div className="modal-shell" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="modal-card">
        <div className="modal-head">
          <h3>User Ledger</h3>
          <button className="secondary" onClick={onClose}>Close</button>
        </div>
        {state.loading ? <div className="empty-card">Loading user ledger...</div> : null}
        {state.error ? <p className="message error">{state.error}</p> : null}
          {detail ? (
            <div className="compact-list">
              <div className="mini-stats">
                {[
                miniStat("Wallet", formatCurrency(detail.summary?.walletBalance ?? 0)),
                miniStat("Deposits", formatCurrency(detail.summary?.deposits ?? 0)),
                miniStat("Withdraws", formatCurrency(detail.summary?.withdraws ?? 0)),
                miniStat("Bid Placed", formatCurrency(detail.summary?.bidPlaced ?? 0)),
                miniStat("Bid Wins", formatCurrency(detail.summary?.bidWins ?? 0)),
                miniStat("Pending Bids", detail.summary?.pendingBids ?? 0),
                miniStat("Won Bids", detail.summary?.wonBids ?? 0),
                miniStat("Lost Bids", detail.summary?.lostBids ?? 0),
                  miniStat("Referral Income", formatCurrency(detail.summary?.referralIncome ?? 0))
                ]}
              </div>
              <div className="subpanel">
                <div className="section-head">
                  <div>
                    <h3>History Range</h3>
                    <p className="muted">{rangeLabel}</p>
                  </div>
                  <div className="inline-actions">
                    <button className="secondary" type="button" onClick={() => shiftSingleDay(-1)} disabled={!canShiftDay}>Previous Day</button>
                    <button className="secondary" type="button" onClick={() => setSingleDay(todayInput)}>Today</button>
                    <button className="secondary" type="button" onClick={() => shiftSingleDay(1)} disabled={!canShiftDay || fromDate === todayInput}>Next Day</button>
                    <button className="secondary" type="button" onClick={() => { setFromDate(""); setToDate(""); }}>All History</button>
                  </div>
                </div>
                <div className="mini-stats">
                  {[
                    miniStat("Wallet Rows", walletVisibleLabel),
                    miniStat("Credits", formatCurrency(filteredWalletSummary.credits)),
                    miniStat("Debits", formatCurrency(filteredWalletSummary.debits)),
                    miniStat("Visible Bids", bidVisibleLabel),
                    miniStat("Bet Amount", formatCurrency(filteredBidSummary.betAmount)),
                    miniStat("Win Amount", formatCurrency(filteredBidSummary.winAmount))
                  ]}
                </div>
              </div>
              <div className="dashboard-grid">
                <div className="subpanel">
                  <h3>{detail.user.name} ({detail.user.phone})</h3>
                <div className="compact-list">
                  <div className="compact-row"><strong>Referral</strong><span>{detail.user.referralCode || "-"}</span></div>
                  <div className="compact-row"><strong>Approval</strong><span>{detail.user.approvalStatus || "-"}</span></div>
                  <div className="compact-row"><strong>Joined</strong><span>{formatDate(detail.user.joinedAt)}</span></div>
                  <div className="compact-row"><strong>Status</strong><span>{detail.user.blockedAt ? "Blocked" : detail.user.deactivatedAt ? "Deactivated" : "Live"}</span></div>
                  <div className="compact-row"><strong>Signup Bonus Flag</strong><span>{detail.user.signupBonusGranted ? "Granted" : "Pending"}</span></div>
                  <div className="compact-row"><strong>First Deposit Bonus Flag</strong><span>{detail.user.firstDepositBonusGranted ? "Granted" : "Pending"}</span></div>
                  <div className="compact-row"><strong>Status Note</strong><span>{detail.user.statusNote || "-"}</span></div>
                </div>
              </div>
              <div className="subpanel">
                <h3>Bonus Visibility</h3>
                <div className="compact-list">
                  <div className="compact-row"><strong>Signup Bonus Total</strong><span>{formatCurrency(detail.summary?.signupBonus ?? 0)}</span></div>
                  <div className="compact-row"><strong>First Deposit Bonus Total</strong><span>{formatCurrency(detail.summary?.firstDepositBonus ?? 0)}</span></div>
                  <div className="compact-row"><strong>Referral Income</strong><span>{formatCurrency(detail.summary?.referralIncome ?? 0)}</span></div>
                  <div className="compact-row"><strong>Manual Credits</strong><span>{formatCurrency(detail.summary?.adminCredits ?? 0)}</span></div>
                  <div className="compact-row"><strong>Manual Debits</strong><span>{formatCurrency(detail.summary?.adminDebits ?? 0)}</span></div>
                </div>
              </div>
              <div className="subpanel">
                <h3>Bank Accounts</h3>
                <div className="compact-list">
                  {detail.bankAccounts?.length ? detail.bankAccounts.map((account) => (
                    <div className="compact-row" key={account.id}>
                      <strong>{account.holderName}</strong>
                      <span>{account.accountNumber} / {account.ifsc}</span>
                    </div>
                  )) : <div className="empty-card">No bank accounts added.</div>}
                </div>
              </div>
            </div>
            <div className="dashboard-grid">
              <div className="subpanel">
                <h3>Day Wise Loss Summary</h3>
                <div className="compact-list">
                  {lossDays.length ? lossDays.map((day) => (
                    <div className="compact-row" key={day.label}>
                      <strong>{day.label}</strong>
                      <span>{day.lossCount} loss bids / {formatCurrency(day.lossAmount)}</span>
                    </div>
                  )) : <div className="empty-card">Is user ki loss history abhi available nahi hai.</div>}
                </div>
              </div>
              <div className="subpanel">
                <h3>Day Wise Winning Summary</h3>
                <div className="compact-list">
                  {winningDays.length ? winningDays.map((day) => (
                    <div className="compact-row" key={day.label}>
                      <strong>{day.label}</strong>
                      <span>{day.winCount} win bids / {formatCurrency(day.winAmount)}</span>
                    </div>
                  )) : <div className="empty-card">Is user ki winning history abhi available nahi hai.</div>}
                </div>
              </div>
            </div>
            <div className="dashboard-grid">
                <div className="subpanel">
                  <div className="section-head">
                    <div>
                      <h3>Wallet Timeline</h3>
                      <p className="muted">{rangeLabel} | {walletVisibleLabel} entries</p>
                    </div>
                  </div>
                  <div className="ledger-toolbar">
                    <div className="ledger-toolbar-copy">
                      <strong>{rangeLabel}</strong>
                      <span>Wallet entries ko date wise yahin se change karo.</span>
                    </div>
                    <div className="ledger-toolbar-actions">
                      <button className="secondary" type="button" onClick={() => shiftSingleDay(-1)} disabled={!canShiftDay}>Previous Day</button>
                      <button className="secondary" type="button" onClick={() => setSingleDay(todayInput)}>Today</button>
                      <button className="secondary" type="button" onClick={() => shiftSingleDay(1)} disabled={!canShiftDay || fromDate === todayInput}>Next Day</button>
                      <label><span>From</span><input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} /></label>
                      <label><span>To</span><input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} /></label>
                      <button className="secondary" type="button" onClick={() => { setFromDate(""); setToDate(""); }}>All History</button>
                    </div>
                  </div>
                  <div className="ledger-feed">
                    {filteredWalletTimeline.length ? filteredWalletTimeline.map((entry) => (
                      <div className="ledger-row" key={entry.id}>
                        <div className="history-card-top">
                          <span className="history-date">{formatDate(entry.createdAt)}</span>
                          <span className={`history-status ${getWalletEntryTone(entry)}`}>{formatWalletEntryStatus(entry.status)}</span>
                        </div>
                        <div className="history-passbook-grid">
                          <div className="history-passbook-cell">
                            <span>Before</span>
                            <strong>{Number(entry.beforeBalance || 0).toFixed(2)}</strong>
                          </div>
                          <div className="history-passbook-cell">
                            <span>Amount</span>
                            <strong>{Number(entry.amount || 0).toFixed(2)}</strong>
                          </div>
                          <div className="history-passbook-cell last">
                            <span>After</span>
                            <strong>{Number(entry.afterBalance || 0).toFixed(2)}</strong>
                          </div>
                        </div>
                        <div className="history-meta-copy">
                          <span>Request Type</span>
                          <strong>{formatWalletEntryTitle(entry.type)}</strong>
                        </div>
                      </div>
                    )) : <div className="empty-card">Is selected date range me wallet entries available nahi hain.</div>}
                  </div>
                </div>
                  <div className="subpanel">
                    <div className="section-head">
                      <div>
                        <h3>Bid Timeline</h3>
                        <p className="muted">{rangeLabel} | {bidVisibleLabel} bids</p>
                      </div>
                    </div>
                    <div className="ledger-toolbar">
                      <div className="ledger-toolbar-copy">
                        <strong>{rangeLabel}</strong>
                        <span>Bid history ko previous ya selected date se dekho.</span>
                      </div>
                      <div className="ledger-toolbar-actions">
                        <button className="secondary" type="button" onClick={() => shiftSingleDay(-1)} disabled={!canShiftDay}>Previous Day</button>
                        <button className="secondary" type="button" onClick={() => setSingleDay(todayInput)}>Today</button>
                        <button className="secondary" type="button" onClick={() => shiftSingleDay(1)} disabled={!canShiftDay || fromDate === todayInput}>Next Day</button>
                        <label><span>From</span><input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} /></label>
                        <label><span>To</span><input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} /></label>
                        <button className="secondary" type="button" onClick={() => { setFromDate(""); setToDate(""); }}>All History</button>
                      </div>
                    </div>
                    <div className="ledger-feed">
                      {filteredBidTimeline.length ? filteredBidTimeline.map((bid) => (
                        <div className="ledger-row" key={bid.id}>
                          <div className="history-card-top">
                            <span className="history-date">{formatDate(bid.createdAt)}</span>
                            <span className="history-kind">MATKA</span>
                          </div>
                          <div className="history-info-stack">
                            <div className="history-info-row">
                              <div className="history-meta-copy">
                                <span>Game Name</span>
                                <strong>{bid.market}</strong>
                              </div>
                            </div>
                            <div className="history-info-row">
                              <div className="history-meta-copy">
                                <span>Bet Type</span>
                                <strong>{bid.gameType || bid.boardLabel || "-"}</strong>
                              </div>
                            </div>
                            <div className="history-info-row">
                              <div className="history-meta-copy">
                                <span>Game Session</span>
                                <strong>{bid.sessionType || "-"}</strong>
                              </div>
                            </div>
                            <div className="history-info-row">
                              <div className="history-meta-copy">
                                <span>Digit</span>
                                <strong>{bid.digit || "-"}</strong>
                              </div>
                            </div>
                            <div className="history-info-row">
                              <div className="history-meta-copy">
                                <span>Bet Amount</span>
                                <strong>{formatCurrency(bid.points)}</strong>
                              </div>
                              <div className="history-meta-copy align-end">
                                <span className={`history-status ${getBidStatusTone(bid.status)}`}>{bid.status}</span>
                                <strong>{bid.settledResult || "-"}</strong>
                              </div>
                            </div>
                          </div>
                        </div>
                      )) : <div className="empty-card">Is selected date range me bids available nahi hain.</div>}
                  </div>
                </div>
              </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function buildBidLossDays(bids) {
  const grouped = new Map();
  for (const bid of bids) {
    if (bid.status !== "Lost") continue;
    const timelineStamp = getBidTimelineStamp(bid);
    const key = getDateGroupLabel(bid.settledAt || bid.createdAt);
    const current = grouped.get(key) || { label: key, lossCount: 0, lossAmount: 0, stamp: timelineStamp };
    current.lossCount += 1;
    current.lossAmount += Number(bid.points || 0);
    current.stamp = Math.max(current.stamp, timelineStamp);
    grouped.set(key, current);
  }
  return [...grouped.values()].sort((left, right) => right.stamp - left.stamp);
}

function buildBidWinningDays(bids) {
  const grouped = new Map();
  for (const bid of bids) {
    if (bid.status !== "Won") continue;
    const timelineStamp = getBidTimelineStamp(bid);
    const key = getDateGroupLabel(bid.settledAt || bid.createdAt);
    const current = grouped.get(key) || { label: key, winCount: 0, winAmount: 0, stamp: timelineStamp };
    current.winCount += 1;
    current.winAmount += Number(bid.payout || 0);
    current.stamp = Math.max(current.stamp, timelineStamp);
    grouped.set(key, current);
  }
  return [...grouped.values()].sort((left, right) => right.stamp - left.stamp);
}

function getBidTimelineStamp(bid) {
  const settledStamp = bid?.settledAt ? new Date(bid.settledAt).getTime() : Number.NaN;
  if (Number.isFinite(settledStamp)) {
    return settledStamp;
  }
  const createdStamp = bid?.createdAt ? new Date(bid.createdAt).getTime() : Number.NaN;
  return Number.isFinite(createdStamp) ? createdStamp : 0;
}

function buildFilteredWalletSummary(entries) {
  return entries.reduce(
    (summary, entry) => {
      const type = String(entry?.type || "").toUpperCase();
      const amount = Number(entry?.amount || 0);
      if (["DEPOSIT", "REFERRAL_COMMISSION", "BID_WIN", "SIGNUP_BONUS", "FIRST_DEPOSIT_BONUS", "SPECIAL_DEPOSIT_BONUS", "ADMIN_CREDIT"].includes(type)) {
        summary.credits += amount;
      }
      if (["WITHDRAW", "BID_PLACED", "BID_WIN_REVERSAL", "ADMIN_DEBIT"].includes(type)) {
        summary.debits += amount;
      }
      return summary;
    },
    { credits: 0, debits: 0 }
  );
}

function buildFilteredBidSummary(bids) {
  return bids.reduce(
    (summary, bid) => {
      summary.betAmount += Number(bid?.points || 0);
      summary.winAmount += Number(bid?.payout || 0);
      return summary;
    },
    { betAmount: 0, winAmount: 0 }
  );
}

function getDateGroupLabel(value) {
  const key = getAdminBusinessDateKey(value);
  if (!key) return "-";
  return new Date(`${key}T00:00:00Z`).toLocaleDateString("en-IN", {
    timeZone: "UTC",
    year: "numeric",
    month: "short",
    day: "2-digit",
    weekday: "short"
  });
}

function getWalletEntryTone(entry) {
  const type = String(entry?.type || "").toUpperCase();
  const status = String(entry?.status || "").toUpperCase();
  if (status === "REJECTED" || status === "FAILED") return "high";
  if (type === "DEPOSIT" || type === "BID_WIN" || type === "ADMIN_CREDIT" || type === "SIGNUP_BONUS" || type === "FIRST_DEPOSIT_BONUS" || type === "SPECIAL_DEPOSIT_BONUS" || type === "REFERRAL_COMMISSION") {
    return "low";
  }
  if (type === "WITHDRAW" || type === "BID_PLACED" || type === "ADMIN_DEBIT") {
    return "medium";
  }
  return "low";
}

function ProofModal({ item, onClose }) {
  const [zoomed, setZoomed] = useState(false);
  const image = isImageUrl(item.proofUrl);
  return (
    <div className="modal-shell" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="modal-card modal-card-narrow">
        <div className="modal-head">
          <h3>Proof Preview</h3>
          <button className="secondary" onClick={onClose}>Close</button>
        </div>
        <div className="compact-list">
          {item.referenceId ? <div className="compact-row"><strong>Reference ID</strong><span>{item.referenceId}</span></div> : null}
          {image ? <img className={`proof-preview-image${zoomed ? " zoomed" : ""}`} src={item.proofUrl} alt="Proof" onClick={() => setZoomed((value) => !value)} /> : <div className="empty-card">Preview unavailable for this proof type.</div>}
          <div className="proof-toolbar">
            <button className="secondary" onClick={() => setZoomed((value) => !value)}>Zoom</button>
            <a className="primary" href={item.proofUrl} target="_blank" rel="noreferrer">Open in New Tab</a>
            <a className="secondary" href={item.proofUrl} download>Download</a>
          </div>
        </div>
      </div>
    </div>
  );
}

function PageHeader({ title, subtitle }) {
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>{title}</h2>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
    </section>
  );
}

function PageState({ title, subtitle, tone = "" }) {
  return (
    <>
      <PageHeader title={title} subtitle={subtitle} />
      <section className="panel"><p className={`message ${tone}`}>{subtitle}</p></section>
    </>
  );
}

function statCard(label, value) {
  return <div className="stat-card" key={label}><h3>{label}</h3><strong>{value}</strong></div>;
}

function miniStat(label, value) {
  return <div className="mini-stat" key={label}><span>{label}</span><strong>{value}</strong></div>;
}

function getBidStatusTone(status) {
  if (status === "Won") return "high";
  if (status === "Lost") return "medium";
  return "low";
}

function formatWalletEntryTitle(type) {
  const normalized = String(type || "").replace(/_/g, " ").trim().toUpperCase();
  if (normalized.includes("DEPOSIT")) return "Deposit";
  if (normalized.includes("WITHDRAW")) return "Withdraw";
  if (normalized.includes("BONUS")) return "Bonus";
  if (normalized.includes("REFERRAL")) return "Referral";
  if (normalized.includes("BID WIN REVERSAL")) return "Bid Win Reversal";
  if (normalized.includes("BID PLACED")) return "Bid Placed";
  if (normalized.includes("BID WIN")) return "Bid Win";
  if (normalized.includes("ADMIN CREDIT")) return "Admin Credit";
  if (normalized.includes("ADMIN DEBIT")) return "Admin Debit";
  return String(type || "").replace(/_/g, " ").trim() || "-";
}

function formatWalletEntryStatus(status) {
  if (status === "SUCCESS") return "SUCCESS";
  if (status === "BACKOFFICE") return "PROCESSING";
  if (status === "REJECTED") return "REJECTED";
  if (status === "FAILED") return "FAILED";
  if (status === "CANCELLED") return "CANCELLED";
  return "PENDING";
}

function getPayoutActionTitle(action, requestType = "WITHDRAW") {
  if (requestType === "DEPOSIT") {
    if (action === "approve") return "Approve & Credit Deposit";
    if (action === "complete") return "Close Deposit Review";
    if (action === "reject") return "Reject Deposit";
    return "Update Deposit Note";
  }
  if (action === "approve") return "Move To Processing";
  if (action === "complete") return "Mark Manual Payout Complete";
  if (action === "reject") return "Reject / Mark Failed";
  return "Update Request Note";
}

function getPayoutActionButton(action, requestType = "WITHDRAW") {
  if (requestType === "DEPOSIT") {
    if (action === "approve") return "Credit Deposit";
    if (action === "complete") return "Close Review";
    if (action === "reject") return "Reject Deposit";
    return "Save Note";
  }
  if (action === "approve") return "Move To Processing";
  if (action === "complete") return "Mark Paid";
  if (action === "reject") return "Reject Request";
  return "Save Note";
}

function getPayoutSuccessMessage(action, requestType = "WITHDRAW") {
  if (requestType === "DEPOSIT") {
    if (action === "approve") return "Deposit paid successfully.";
    if (action === "complete") return "Deposit review closed successfully.";
    if (action === "reject") return "Deposit rejected successfully.";
    return "Deposit note updated successfully.";
  }
  if (action === "approve") return "Request moved to manual processing.";
  if (action === "complete") return "Request marked paid successfully.";
  if (action === "reject") return "Request rejected successfully.";
  return "Request note updated successfully.";
}

function getPayoutStatusLabel(status, requestType = "WITHDRAW") {
  if (status === "INITIATED") return "Pending";
  if (status === "BACKOFFICE") return "Processing";
  if (status === "SUCCESS") return "Paid";
  if (status === "FAILED") return "Failed";
  if (status === "CANCELLED") return "Cancelled";
  if (status === "REJECTED") return "Rejected";
  return status || "-";
}

function parseWalletRequestNote(note) {
  return String(note || "")
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((accumulator, part) => {
      const separatorIndex = part.indexOf(":");
      if (separatorIndex === -1) {
        return accumulator;
      }
      const key = part.slice(0, separatorIndex).trim().toLowerCase();
      const value = part.slice(separatorIndex + 1).trim();
      if (key && value) {
        accumulator[key] = value;
      }
      return accumulator;
    }, {});
}

function getWalletRequestMetaTitle(item) {
  if (item.type === "DEPOSIT") {
    const parsed = parseWalletRequestNote(item.note);
    return parsed["upi app"] ? `UPI: ${parsed["upi app"]}` : "Direct UPI Deposit";
  }
  return item.primaryBankAccount ? item.primaryBankAccount.holderName : "No bank details";
}

function getWalletRequestMetaLine(item) {
  if (item.type === "DEPOSIT") {
    const parsed = parseWalletRequestNote(item.note);
    if (parsed["client status"]) {
      return `Client Status: ${parsed["client status"]}`;
    }
    return "Processor flow deposit request";
  }
  return item.primaryBankAccount ? `${item.primaryBankAccount.accountNumber} / ${item.primaryBankAccount.ifsc}` : "Bank account missing";
}

function getWalletRequestReferenceLine(item) {
  const parsed = parseWalletRequestNote(item.note);
  if (parsed.utr) {
    return `UTR: ${parsed.utr}`;
  }
  return item.referenceId || "No reference ID";
}

function getWalletRequestStatusHint(item) {
  if (item.type === "DEPOSIT") {
    return item.status === "BACKOFFICE"
      ? "Legacy deposit review only. Credit action is disabled to prevent duplicate wallet credit."
      : "Review UPI payment details before crediting wallet.";
  }
  return "Verify bank transfer state before closing request.";
}

function getWalletRequestNoteLine(item) {
  const note = typeof item.note === "string" ? item.note.trim() : "";
  return note || null;
}

function getWalletApproveLabel(item) {
  return item.type === "DEPOSIT" ? "Approve & Credit" : "Move to Processing";
}

function getWalletCompleteLabel(item) {
  return item.type === "DEPOSIT" ? "Close Deposit" : "Mark Paid";
}

function canCompleteWalletRequest(item) {
  return item?.status === "BACKOFFICE" && item?.type !== "DEPOSIT";
}

async function exportAdminData(apiBase, token, type) {
  const data = await fetchApi(apiBase, `/api/admin/export?type=${encodeURIComponent(type)}`, token);
  downloadTextFile(data.filename, data.content, data.mimeType || "text/plain");
}

function downloadTextFile(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType || "text/plain" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function getResultStage(result) {
  const value = String(result || "").trim();
  if (value === "***-**-***") return "Reset / Placeholder";
  if (/^[0-9]{3}-[0-9]\*-\*{3}$/.test(value)) return "Open Stage Published";
  if (/^[0-9]{3}-[0-9]{2}-[0-9]{3}$/.test(value)) return "Full Close Stage Published";
  return "Custom / Incomplete";
}

function clearSession() {
  clearAdminSession();
}

function getHashRoute() {
  const match = window.location.hash.match(/^#\/([^?]+)/);
  return match?.[1] || "dashboard";
}

function formatCurrency(value) {
  return `Rs ${Number(value || 0)}`;
}

function formatExposureList(items) {
  if (!Array.isArray(items) || !items.length) {
    return "-";
  }
  return items.map((item) => `${item.label} (${formatCurrency(item.points)})`).join(", ");
}

function formatDate(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString("en-IN", { year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function getBidDisplaySession(bid) {
  const session = String(bid?.sessionType || "").trim();
  if (bid?.boardLabel === "SP DP TP" && (!session || session === "NA")) return "Open";
  return session || "-";
}

function formatRelativeAge(value) {
  if (!value) return "-";
  const diffMs = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(diffMs)) return "-";
  const diffMinutes = Math.max(0, Math.floor(diffMs / 60000));
  if (diffMinutes < 1) return "just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

function isOlderThanMinutes(value, minutes) {
  if (!value) return false;
  const diffMs = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(diffMs)) return false;
  return diffMs >= minutes * 60000;
}

function getWalletQueuePriority(item) {
  let score = 0;
  if (item.status === "BACKOFFICE") score += 2;
  if (item.type === "WITHDRAW") score += 1;
  if (isOlderThanMinutes(item.createdAt, 60)) score += 2;
  else if (isOlderThanMinutes(item.createdAt, 20)) score += 1;
  return score;
}

function getWalletQueueLabel(item) {
  if (item.type === "WITHDRAW" && item.status === "BACKOFFICE") return "Close processing withdraw";
  if (item.type === "WITHDRAW") return "Review withdraw request";
  return "Review deposit proof";
}

function getWalletQueueSummary(item) {
  const age = formatRelativeAge(item.createdAt);
  if (item.type === "WITHDRAW" && item.status === "BACKOFFICE") {
    return `Withdraw already processing since ${age}. 3 hour se zyada ya next day tak unpaid raha to auto reject ho jayega.`;
  }
  if (item.type === "WITHDRAW") {
    return `Withdraw request in queue since ${age}. Bank details aur operator note verify karo.`;
  }
  return `Deposit request received ${age}. Proof aur reference verify karke wallet credit karo.`;
}

function getWalletActionChecklist(item, action) {
  if (action === "approve" && item.type === "DEPOSIT") {
    return "Proof, reference, amount, aur client-reported payment detail cross-check karke hi wallet credit karo.";
  }
  if (action === "approve" && item.type === "WITHDRAW") {
    return "Bank details verify karke request ko processing me bhejo. Is step par wallet se amount debit/block ho jayega. Actual payout ke baad complete mark karo.";
  }
  if (action === "complete") {
    return "Sirf tab complete karo jab payout/credit final ho chuka ho aur operator reference save ho.";
  }
  if (action === "reject") {
    if (item.type === "WITHDRAW" && item.status === "BACKOFFICE") {
      return "Agar bank payout fail ho gaya ya transfer complete nahi hua, to yahin se reject karo. Is path me blocked withdraw amount wallet me wapas restore ho jayega.";
    }
    return "Reject reason clear note me likho taaki audit aur support dono side context rahe.";
  }
  return "Operator note aur reference ko audit-friendly format me save karo.";
}

function toDateInputValue(value) {
  return getAdminBusinessDateKey(value);
}

function isWithinDateRange(value, from, to) {
  const dateKey = getAdminBusinessDateKey(value);
  if (!dateKey) return false;
  if (from && dateKey < from) return false;
  if (to && dateKey > to) return false;
  return true;
}

function getAdminBusinessDateKey(value = new Date()) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Date(date.getTime() + ADMIN_BUSINESS_DAY_OFFSET_MS).toISOString().slice(0, 10);
}

function parseRowsText(raw) {
  return String(raw || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split("|").map((cell) => cell.trim()));
}

function toResultSlots(result) {
  const normalized = String(result || "").toUpperCase().replace(/[^0-9*]/g, "");
  const slots = new Array(8).fill("");
  for (let index = 0; index < Math.min(normalized.length, 8); index += 1) {
    slots[index] = normalized[index];
  }
  return slots;
}

function fromResultSlots(slots) {
  return `${slots.slice(0, 3).join("")}-${slots.slice(3, 5).join("")}-${slots.slice(5, 8).join("")}`;
}

function isPlaceholderMarketResult(result) {
  return !String(result || "").trim() || String(result || "").trim() === "***-**-***";
}

function getCurrentWeekStart() {
  const value = new Date();
  const day = value.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  value.setDate(value.getDate() + diff);
  value.setHours(0, 0, 0, 0);
  return value;
}

function getCurrentWeekLabel() {
  const start = getCurrentWeekStart();
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const formatPart = (date) => {
    const month = date.toLocaleDateString("en-US", { month: "short" });
    const day = String(date.getDate()).padStart(2, "0");
    return `${month} ${day}`;
  };
  return `${start.getFullYear()} ${formatPart(start)} to ${formatPart(end)}`;
}

function normalizeWeekLabelForCompare(label) {
  return String(label || "").trim().replace(/\s+/g, " ");
}

function getCurrentWeekdayIndex() {
  const day = new Date().getDay();
  return day === 0 ? 6 : day - 1;
}

function getCurrentWeekChartRow(rows) {
  const currentWeekLabel = normalizeWeekLabelForCompare(getCurrentWeekLabel());
  return (rows || []).find((row) => normalizeWeekLabelForCompare(row?.[0]) === currentWeekLabel) || null;
}

function deriveResultFromChartRows(jodiRows, pannaRows) {
  const dayIndex = getCurrentWeekdayIndex();
  const jodiRow = getCurrentWeekChartRow(jodiRows);
  const pannaRow = getCurrentWeekChartRow(pannaRows);
  if (!jodiRow || !pannaRow) {
    return "";
  }

  const normalizedJodi = normalizeJodiPreviewCell(jodiRow[dayIndex + 1]);
  let open = "---";
  let close = "---";
  let jodi = normalizedJodi;

  if (pannaRow.length === 8) {
    const parsed = parsePannaEditorCell(pannaRow[dayIndex + 1]);
    open = parsed.open;
    close = parsed.close;
    if (!/^[0-9]{2}$/.test(jodi) && /^[0-9]{2}$/.test(parsed.jodi)) {
      jodi = parsed.jodi;
    }
  } else {
    open = String(pannaRow[1 + dayIndex * 2] || "").trim() || "---";
    close = String(pannaRow[2 + dayIndex * 2] || "").trim() || "---";
  }

  if (/^[0-9]{3}$/.test(open) && /^[0-9]{2}$/.test(jodi) && /^[0-9]{3}$/.test(close)) {
    return `${open}-${jodi}-${close}`;
  }
  if (/^[0-9]{3}$/.test(open) && /^[0-9]\*$/.test(jodi)) {
    return `${open}-${jodi}-***`;
  }

  return "";
}

function diffRows(savedRows, currentRows) {
  const savedMap = new Map(savedRows.map((row) => [row.join("|"), row]));
  const currentMap = new Map(currentRows.map((row) => [row.join("|"), row]));
  const savedByLabel = new Map(savedRows.map((row) => [String(row[0] || ""), row.slice(1).join("|")]));
  const changedLabels = currentRows
    .filter((row) => savedByLabel.has(String(row[0] || "")) && savedByLabel.get(String(row[0] || "")) !== row.slice(1).join("|"))
    .map((row) => String(row[0] || ""));

  return {
    savedCount: savedRows.length,
    currentCount: currentRows.length,
    addedCount: currentRows.filter((row) => !savedMap.has(row.join("|"))).length,
    removedCount: savedRows.filter((row) => !currentMap.has(row.join("|"))).length,
    changedCount: changedLabels.length,
    changedLabels
  };
}

function getChartPreviewHeaders(chartType, length) {
  return ["Date", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
}

function createEmptyChartRow(chartType) {
  return new Array(chartType === "panna" ? 8 : 8).fill("");
}

function getChartCellPlaceholder(chartType, cellIndex) {
  if (cellIndex === 0) {
    return chartType === "panna" ? "2021 Dec 27 to Jan 02" : "Week Label";
  }
  return chartType === "panna" ? "459/280" : "80";
}

function normalizeChartEditorRows(chartType, rows) {
  if (!rows.length) {
    return [createEmptyChartRow(chartType)];
  }

  return rows.map((row, rowIndex) => {
    if (chartType === "panna") {
      return normalizePannaEditorRow(row, rowIndex);
    }
    return normalizeJodiEditorRow(row, rowIndex);
  });
}

function normalizeJodiEditorRow(row, rowIndex) {
  const nextRow = createEmptyChartRow("jodi");
  const normalized = Array.isArray(row) ? row.map((cell) => String(cell ?? "").trim()) : [];
  if (normalized.length >= 8) {
    return normalized.slice(0, 8);
  }
  nextRow[0] = normalized[0] || `Week ${rowIndex + 1}`;
  const values = normalized.length > 1 ? normalized.slice(1) : normalized;
  for (let index = 0; index < Math.min(7, values.length); index += 1) {
    nextRow[index + 1] = values[index] || "";
  }
  return nextRow;
}

function normalizePannaEditorRow(row, rowIndex) {
  const nextRow = createEmptyChartRow("panna");
  const normalized = Array.isArray(row) ? row.map((cell) => String(cell ?? "").trim()) : [];
  nextRow[0] = normalized[0] || `Week ${rowIndex + 1}`;

  if (normalized.length === 8 && normalized.slice(1).some((cell) => cell.includes("/") || cell.includes("-"))) {
    for (let index = 1; index < 8; index += 1) {
      nextRow[index] = normalized[index] || "";
    }
    return nextRow;
  }

  const values = normalized.slice(1).filter(Boolean);
  for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
    const pairOpen = values[dayIndex * 2];
    const pairClose = values[dayIndex * 2 + 1];
    if (pairOpen || pairClose) {
      nextRow[dayIndex + 1] = [pairOpen, pairClose].filter(Boolean).join("/");
      continue;
    }
    if (values[dayIndex]) {
      nextRow[dayIndex + 1] = values[dayIndex];
    }
  }

  return nextRow;
}

function serializeChartRows(chartType, rows) {
  const normalizedRows = (rows || []).map((row, rowIndex) => chartType === "panna" ? normalizePannaEditorRow(row, rowIndex) : normalizeJodiEditorRow(row, rowIndex));
  const serialized = normalizedRows.map((row) => {
    if (chartType !== "panna") {
      return trimTrailingEmptyCells(row);
    }

    const nextRow = [String(row[0] || "").trim()];
    for (let dayIndex = 1; dayIndex < row.length; dayIndex += 1) {
      const parsed = parsePannaEditorCell(row[dayIndex]);
      if (parsed.open || parsed.close) {
        nextRow.push(parsed.open, parsed.close);
      } else {
        nextRow.push("", "");
      }
    }
    return trimTrailingEmptyCells(nextRow);
  });

  return serialized.filter((row) => row.some((cell) => String(cell || "").trim()));
}

function trimTrailingEmptyCells(row) {
  const nextRow = [...row];
  while (nextRow.length > 1 && !String(nextRow[nextRow.length - 1] || "").trim()) {
    nextRow.pop();
  }
  return nextRow;
}

function parsePannaEditorCell(rawValue) {
  const value = String(rawValue || "").trim();
  if (!value) {
    return { open: "---", jodi: "--", close: "---" };
  }

  const full = value.match(/^([0-9]{3})[-\s/]([0-9]{2})[-\s/]([0-9]{3})$/);
  if (full) {
    return { open: full[1], jodi: full[2], close: full[3] };
  }

  const pair = value.match(/^([0-9]{3})[\/\s-]([0-9]{3})$/);
  if (pair) {
    return { open: pair[1], jodi: derivePannaJodi(pair[1], pair[2]), close: pair[2] };
  }

  const partial = value.match(/^([0-9]{3})[\/\s-]([0-9])\*\*$/);
  if (partial) {
    return { open: partial[1], jodi: `${partial[2]}*`, close: "***" };
  }

  const single = value.match(/^([0-9]{3})$/);
  if (single) {
    return { open: single[1], jodi: "--", close: "---" };
  }

  return { open: value.slice(0, 3) || "---", jodi: "--", close: "---" };
}

function sanitizeJodiEditorInput(value) {
  const cleaned = String(value || "").trim().replace(/[^0-9*]/g, "");
  if (!cleaned) return "--";
  if (cleaned === "*" || cleaned === "**") return "**";
  return cleaned.padStart(2, "0").slice(0, 2);
}

function formatPannaEditorCellValue(openValue, closeValue) {
  const open = normalizePannaSegment(openValue);
  const close = normalizePannaSegment(closeValue);
  if (open === "---" && close === "---") {
    return "";
  }
  return `${open}/${close}`;
}

function normalizePannaSegment(value) {
  const cleaned = String(value || "").trim().replace(/[^0-9-]/g, "");
  if (!cleaned || cleaned === "---") return "---";
  return cleaned.padStart(3, "0").slice(0, 3);
}

function formatPannaDisplayValue(value) {
  const parsed = parsePannaEditorCell(value);
  return `${parsed.open} / ${parsed.close}`;
}

function applyEditorValuesToRows(rows, chartType, label, editorDayIndex, editorJodiValue, editorOpenValue, editorCloseValue) {
  const nextRows = (rows || []).map((row) => [...row]);
  let rowIndex = nextRows.findIndex((row) => String(row[0] || "").trim() === label);
  if (rowIndex === -1) {
    nextRows.push(createEmptyChartRow(chartType));
    rowIndex = nextRows.length - 1;
    nextRows[rowIndex][0] = label;
  }

  const cellIndex = editorDayIndex + 1;
  if (chartType === "jodi") {
    nextRows[rowIndex][cellIndex] = sanitizeJodiEditorInput(editorJodiValue);
  } else {
    nextRows[rowIndex][cellIndex] = formatPannaEditorCellValue(editorOpenValue, editorCloseValue);
  }

  return nextRows;
}

function buildAdminJodiPreviewRows(rows) {
  return rows
    .filter((row) => row.some((cell) => String(cell || "").trim()))
    .map((row, index) => ({
      date: buildChartDateBlock(String(row[0] || `Week ${index + 1}`)),
      cells: row.slice(1, 8).map((cell) => normalizeJodiPreviewCell(cell))
    }));
}

function buildAdminPannaPreviewRows(rows) {
  return rows
    .filter((row) => row.some((cell) => String(cell || "").trim()))
    .map((row, index) => ({
      date: buildChartDateBlock(String(row[0] || `Week ${index + 1}`)),
      cells: row.slice(1, 8).map((cell) => parsePannaEditorCell(cell))
    }));
}

function normalizeJodiPreviewCell(value) {
  const cleaned = String(value || "").trim();
  if (/^[0-9]{2}$/.test(cleaned)) return cleaned;
  if (/^[0-9]{3}$/.test(cleaned)) return cleaned.slice(-2);
  if (/^[0-9]\*$/.test(cleaned)) return cleaned;
  return cleaned || "--";
}

function derivePannaJodi(open, close) {
  if (!/^[0-9]{3}$/.test(open) || !/^[0-9]{3}$/.test(close)) {
    if (/^[0-9]\*\*$/.test(close)) {
      return `${close[0]}*`;
    }
    return "--";
  }
  return `${sumDigitString(open) % 10}${sumDigitString(close) % 10}`;
}

function sumDigitString(value) {
  return value.split("").reduce((total, digit) => total + Number(digit), 0);
}

function buildChartDateBlock(label) {
  const cleaned = String(label || "").trim();
  const weekMatch = cleaned.match(/^(\d{4})\s+([A-Za-z]{3}\s+\d{1,2})\s+to\s+([A-Za-z]{3}\s+\d{1,2})$/i);
  if (weekMatch) {
    return {
      year: weekMatch[1],
      start: weekMatch[2],
      middle: "to",
      end: weekMatch[3]
    };
  }

  const compactWeekMatch = cleaned.match(/^(\d{4})\s*[\r\n]+([A-Za-z]{3}\s+\d{1,2})\s*[\r\n]+to\s*[\r\n]+([A-Za-z]{3}\s+\d{1,2})$/i);
  if (compactWeekMatch) {
    return {
      year: compactWeekMatch[1],
      start: compactWeekMatch[2],
      middle: "to",
      end: compactWeekMatch[3]
    };
  }

  const dayMonthMatch = cleaned.match(/^(\d{2})-([A-Za-z]{3})$/);
  if (dayMonthMatch) {
    return {
      year: String(new Date().getFullYear()),
      start: `${dayMonthMatch[2]} ${dayMonthMatch[1]}`,
      middle: "to",
      end: "--"
    };
  }

  return {
    year: "Week",
    start: cleaned || "--",
    middle: "to",
    end: "--"
  };
}

function highlightPreviewValue(value) {
  return /^[0-9]{2}$/.test(String(value || "").trim());
}

function isImageUrl(value) {
  return /\.(png|jpe?g|gif|webp|bmp|svg)(\?.*)?$/i.test(String(value || ""));
}

function safeParse(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

