import React, { useEffect, useMemo, useRef, useState } from "react";

const LIVE_EVENT_POLL_MS = 10_000;
const LIVE_EVENT_TOAST_MS = 9_000;
const LIVE_EVENT_SEEN_KEY = "realmatka-admin-live-event-seen";

export function AdminShell({ apiBase, route, setRoute, me, navItems, routeMeta, onLogout, pageFactory, token, fetchApi, navBadges = {} }) {
  const [refreshKey, setRefreshKey] = useState(0);
  const currentMeta = routeMeta[route] || routeMeta.dashboard;
  const hideTopbar = route === "requests";

  const page = useMemo(() => pageFactory(refreshKey, () => setRefreshKey((value) => value + 1)), [pageFactory, refreshKey]);

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-badge">Admin Suite</span>
          <h1>Real Matka</h1>
          <p>Structured operator workspace with React core pages and legacy fallbacks.</p>
        </div>
        <div className="operator-card">
          <strong>{me.name}</strong>
          <span>{me.phone}</span>
          <small>Session active</small>
        </div>
        <nav className="nav">
          {navItems.map((item) => (
            <a
              key={item.key}
              className={`nav-link${route === item.key ? " active" : ""}`}
              href={`#/${item.key}`}
              onClick={() => setRoute(item.key)}
            >
              <span className="nav-link-row">
                <span className="nav-link-title">{item.label}</span>
                {Number(navBadges[item.key] || 0) > 0 ? <span className="nav-badge">{formatNavBadge(navBadges[item.key])}</span> : null}
              </span>
              <span className="nav-link-caption">{routeMeta[item.key]?.eyebrow || "Section"}</span>
            </a>
          ))}
        </nav>
        <button className="secondary sidebar-logout" onClick={onLogout}>Logout</button>
      </aside>
      <main className="main">
        {hideTopbar ? null : (
          <section className="topbar">
            <div className="topbar-copy">
              {currentMeta.eyebrow ? <span className="topbar-eyebrow">{currentMeta.eyebrow}</span> : null}
              <h2>{currentMeta.title}</h2>
              <p>{currentMeta.subtitle}</p>
            </div>
            <div className="topbar-actions">
              <div className="topbar-chip">
                <span>API</span>
                <strong>{apiBase.replace(/^https?:\/\//, "")}</strong>
              </div>
              <div className="topbar-chip">
                <span>Operator</span>
                <strong>{me.name}</strong>
              </div>
              <button className="secondary" onClick={() => setRefreshKey((value) => value + 1)}>Refresh View</button>
            </div>
          </section>
        )}
        {page}
      </main>
      <LiveEventToasts apiBase={apiBase} fetchApi={fetchApi} token={token} />
    </div>
  );
}

function formatNavBadge(value) {
  const count = Number(value || 0);
  if (count > 99) {
    return "99+";
  }
  return String(count);
}

function LiveEventToasts({ apiBase, token, fetchApi }) {
  const [toasts, setToasts] = useState([]);
  const initializedRef = useRef(false);
  const seenRef = useRef(loadSeenEventIds());

  useEffect(() => {
    if (!apiBase || !token || typeof fetchApi !== "function") {
      return undefined;
    }

    let active = true;

    async function pollLiveEvents() {
      try {
        const data = await fetchApi(apiBase, "/api/admin/live-events?limit=24", token);
        const events = Array.isArray(data?.events) ? data.events : [];
        const newestFirst = events.filter((event) => event?.id);

        if (!initializedRef.current) {
          newestFirst.forEach((event) => seenRef.current.add(event.id));
          persistSeenEventIds(seenRef.current);
          initializedRef.current = true;
          return;
        }

        const unseen = newestFirst
          .filter((event) => !seenRef.current.has(event.id))
          .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

        if (!unseen.length || !active) {
          return;
        }

        unseen.forEach((event) => seenRef.current.add(event.id));
        persistSeenEventIds(seenRef.current);
        setToasts((current) => [
          ...unseen.map((event) => ({ ...event, toastId: `${event.id}:${Date.now()}` })),
          ...current
        ].slice(0, 5));
      } catch {
        // Keep global notifications quiet on transient network/auth errors.
      }
    }

    void pollLiveEvents();
    const timer = window.setInterval(() => {
      void pollLiveEvents();
    }, LIVE_EVENT_POLL_MS);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [apiBase, fetchApi, token]);

  useEffect(() => {
    if (!toasts.length) return undefined;
    const timers = toasts.map((toast) =>
      window.setTimeout(() => {
        setToasts((current) => current.filter((item) => item.toastId !== toast.toastId));
      }, LIVE_EVENT_TOAST_MS)
    );
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [toasts]);

  if (!toasts.length) {
    return null;
  }

  return (
    <div className="live-event-stack" aria-live="polite" aria-label="Live admin notifications">
      {toasts.map((toast) => (
        <div
          key={toast.toastId}
          className={`live-event-toast ${toast.type || "event"}`}
          role="button"
          tabIndex={0}
          onClick={() => {
            if (toast.href) {
              window.location.hash = toast.href.replace(/^#/, "");
            }
            setToasts((current) => current.filter((item) => item.toastId !== toast.toastId));
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              if (toast.href) {
                window.location.hash = toast.href.replace(/^#/, "");
              }
              setToasts((current) => current.filter((item) => item.toastId !== toast.toastId));
            }
          }}
        >
          <span className="live-event-icon">{getLiveEventIcon(toast.type)}</span>
          <span className="live-event-copy">
            <strong>{toast.title || "New activity"}</strong>
            <span>{toast.message || "Admin activity updated."}</span>
            <small>{formatLiveEventTime(toast.createdAt)}</small>
          </span>
          <button
            className="live-event-close"
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              setToasts((current) => current.filter((item) => item.toastId !== toast.toastId));
            }}
            aria-label="Dismiss notification"
          >
            x
          </button>
        </div>
      ))}
    </div>
  );
}

function loadSeenEventIds() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(LIVE_EVENT_SEEN_KEY) || "[]");
    return new Set(Array.isArray(parsed) ? parsed.slice(0, 200) : []);
  } catch {
    return new Set();
  }
}

function persistSeenEventIds(ids) {
  try {
    window.localStorage.setItem(LIVE_EVENT_SEEN_KEY, JSON.stringify(Array.from(ids).slice(-200)));
  } catch {
    // Local storage can be unavailable in private mode; notifications still work for this session.
  }
}

function getLiveEventIcon(type) {
  if (type === "bid") return "BET";
  if (type === "deposit") return "IN";
  if (type === "withdraw") return "OUT";
  if (type === "user") return "NEW";
  return "LIVE";
}

function formatLiveEventTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Just now";
  const diffMs = Date.now() - date.getTime();
  if (diffMs < 60_000) return "Just now";
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 60) return `${minutes}m ago`;
  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  });
}
