export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  const rawPath = String(path || "").trim();
  const normalized = rawPath.replace(/^\/+/, "");

  try {
    const parsed = new URL(rawPath);
    const routeSegments = [
      parsed.protocol === "realmatka:" ? parsed.host : "",
      ...parsed.pathname.split("/").filter(Boolean)
    ].filter(Boolean);
    const appRoute = routeSegments.join("/");
    const allowedCallbackRoutes = new Set(["auth/otp-login", "auth/register", "auth/forgot-password", "wallet/withdraw"]);
    if (allowedCallbackRoutes.has(appRoute)) {
      return `/${appRoute}${parsed.search}`;
    }

    const referralCode =
      parsed.searchParams.get("ref") ??
      parsed.searchParams.get("referenceCode") ??
      parsed.searchParams.get("referralCode") ??
      "";
    const cleanRef = String(referralCode).trim().replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
    const pathname = parsed.pathname.replace(/^\/+/, "");

    if (cleanRef && (!pathname || pathname === "register" || pathname === "auth/register" || pathname === "signup" || pathname === "referral")) {
      return `/auth/register?ref=${encodeURIComponent(cleanRef)}`;
    }

    if (!pathname && cleanRef) {
      return `/auth/register?ref=${encodeURIComponent(cleanRef)}`;
    }
  } catch {
    const referralMatch = rawPath.match(/[?&](?:ref|referenceCode|referralCode)=([^&#]+)/i);
    if (referralMatch?.[1]) {
      const cleanRef = String(referralMatch[1]).trim().replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
      if (cleanRef) {
        return `/auth/register?ref=${encodeURIComponent(cleanRef)}`;
      }
    }
  }

  if (!normalized || normalized === "." || normalized === "index" || normalized === "--") {
    return "/";
  }

  if (normalized === "sitemap" || normalized === "_sitemap") {
    return "/";
  }

  return path;
}
