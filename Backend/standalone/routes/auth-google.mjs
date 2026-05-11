import { randomBytes } from "node:crypto";
import { corsPreflight, fail, getJsonBody, normalizeIndianPhone, ok } from "../http.mjs";
import { createSession, createUserAccount, findUserByEmail, hashCredential } from "../db.mjs";

const googleRegistrationTokens = new Map();
const GOOGLE_REGISTRATION_TOKEN_TTL_MS = 15 * 60 * 1000;

function cleanEnvValue(value) {
  return String(value || "").replace(/\u00a0/g, " ").trim().replace(/['"]/g, "").trim();
}

function getAllowedGoogleClientIds() {
  return [
    process.env.GOOGLE_CLIENT_IDS,
    process.env.GOOGLE_WEB_CLIENT_ID,
    process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    process.env.GOOGLE_ANDROID_CLIENT_ID,
    process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID
  ]
    .flatMap((value) => cleanEnvValue(value).split(","))
    .map((value) => value.trim())
    .filter(Boolean);
}

function sanitizeGoogleProfile(profile) {
  return {
    email: String(profile.email || "").trim().toLowerCase(),
    name: String(profile.name || "").trim(),
    givenName: String(profile.given_name || profile.givenName || "").trim(),
    familyName: String(profile.family_name || profile.familyName || "").trim(),
    picture: String(profile.picture || "").trim()
  };
}

function sanitizeSessionUser(user) {
  return {
    id: user.id,
    phone: user.phone,
    email: user.email || "",
    name: user.name,
    role: user.role,
    hasMpin: user.hasMpin,
    referralCode: user.referralCode,
    joinedAt: user.joinedAt
  };
}

function assertApprovedActiveUser(user) {
  if (user.deactivatedAt) {
    throw new Error("Your account is deactivated. Contact support.");
  }
  if (user.blockedAt) {
    throw new Error("Your account is blocked. Contact support.");
  }
  if (user.approvalStatus !== "Approved") {
    throw new Error(
      user.approvalStatus === "Rejected"
        ? "Your account registration was rejected. Contact support."
        : "Your account is pending admin approval."
    );
  }
}

async function fetchJson(url, init = {}) {
  const response = await fetch(url, init);
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error_description || payload?.error || payload?.message || `Google request failed with status ${response.status}`);
  }
  return payload;
}

function assertAudience(audience) {
  const allowedClientIds = getAllowedGoogleClientIds();
  if (!allowedClientIds.length) {
    throw new Error("Google login is not configured. GOOGLE_WEB_CLIENT_ID env missing hai.");
  }
  if (audience && !allowedClientIds.includes(String(audience))) {
    throw new Error("Google login client mismatch. Google client ID env check karo.");
  }
}

async function verifyGoogleCredential({ idToken = "", accessToken = "" }) {
  const normalizedIdToken = String(idToken || "").trim();
  const normalizedAccessToken = String(accessToken || "").trim();

  if (normalizedIdToken) {
    const payload = await fetchJson(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(normalizedIdToken)}`);
    assertAudience(payload.aud);
    if (String(payload.email_verified || "").toLowerCase() !== "true" && payload.email_verified !== true) {
      throw new Error("Google email verified nahi hai.");
    }
    return {
      sub: String(payload.sub || "").trim(),
      ...sanitizeGoogleProfile(payload)
    };
  }

  if (!normalizedAccessToken) {
    throw new Error("Google access token missing hai.");
  }

  const tokenInfo = await fetchJson(`https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(normalizedAccessToken)}`);
  assertAudience(tokenInfo.audience || tokenInfo.aud);
  const userInfo = await fetchJson("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: {
      Authorization: `Bearer ${normalizedAccessToken}`
    }
  });
  if (String(userInfo.email_verified || "").toLowerCase() !== "true" && userInfo.email_verified !== true) {
    throw new Error("Google email verified nahi hai.");
  }
  return {
    sub: String(userInfo.sub || tokenInfo.user_id || "").trim(),
    ...sanitizeGoogleProfile(userInfo)
  };
}

function cleanupExpiredGoogleRegistrationTokens() {
  const now = Date.now();
  for (const [token, entry] of googleRegistrationTokens.entries()) {
    if (entry.expiresAt <= now) {
      googleRegistrationTokens.delete(token);
    }
  }
}

function createGoogleRegistrationToken(profile) {
  cleanupExpiredGoogleRegistrationTokens();
  const token = `greg_${randomBytes(24).toString("hex")}`;
  googleRegistrationTokens.set(token, {
    profile,
    expiresAt: Date.now() + GOOGLE_REGISTRATION_TOKEN_TTL_MS
  });
  return token;
}

function readGoogleRegistrationToken(token) {
  cleanupExpiredGoogleRegistrationTokens();
  const entry = googleRegistrationTokens.get(String(token || "").trim());
  if (!entry) {
    return null;
  }
  return entry;
}

export function options(request) {
  return corsPreflight(request);
}

export async function login(request) {
  try {
    const body = await getJsonBody(request);
    const profile = await verifyGoogleCredential({
      idToken: body.idToken,
      accessToken: body.accessToken
    });

    if (!profile.email || !profile.sub) {
      return fail("Google profile me verified email nahi mila.", 400, request);
    }

    const user = await findUserByEmail(profile.email);
    if (!user) {
      const registrationToken = createGoogleRegistrationToken(profile);
      return ok(
        {
          needsRegistration: true,
          registrationToken,
          profile: sanitizeGoogleProfile(profile)
        },
        request
      );
    }

    assertApprovedActiveUser(user);
    const { rawToken } = await createSession(user.id);
    return ok(
      {
        needsRegistration: false,
        token: rawToken,
        user: sanitizeSessionUser(user)
      },
      request
    );
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Google login failed", 400, request);
  }
}

export async function register(request) {
  try {
    const body = await getJsonBody(request);
    const registrationToken = String(body.registrationToken || "").trim();
    const entry = readGoogleRegistrationToken(registrationToken);
    if (!entry) {
      return fail("Google registration session expired. Dobara Google login karo.", 400, request);
    }

    const firstName = String(body.firstName || entry.profile.givenName || "").trim();
    const lastName = String(body.lastName || entry.profile.familyName || "").trim();
    const phone = normalizeIndianPhone(String(body.phone ?? "")) ?? String(body.phone ?? "").trim();
    const password = String(body.password || "");
    const confirmPassword = String(body.confirmPassword || "");
    const referenceCode = String(body.referenceCode || "").trim();

    if (!firstName || !lastName || !phone || !password || !confirmPassword) {
      return fail("Name, phone number, password, and confirm password required hai.", 400, request);
    }
    if (password.length < 8) {
      return fail("Password must be at least 8 characters", 400, request);
    }
    if (password !== confirmPassword) {
      return fail("Password and confirm password must match", 400, request);
    }

    const created = await createUserAccount({
      firstName,
      lastName,
      phone,
      passwordHash: hashCredential(password),
      referenceCode,
      email: entry.profile.email,
      googleSub: entry.profile.sub,
      authProvider: "google"
    });

    if (!created.user) {
      return fail(created.error, 400, request);
    }

    googleRegistrationTokens.delete(registrationToken);
    const { rawToken } = await createSession(created.user.id);
    return ok(
      {
        token: rawToken,
        user: sanitizeSessionUser(created.user)
      },
      request
    );
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Google registration failed", 400, request);
  }
}
