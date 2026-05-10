import { randomBytes } from "node:crypto";
import { createAdminSession, createSession, findAdminById, findAdminByPhone, findUserByPhone, getAppSettings, requireAdminByToken, requireUserSnapshotByToken, updateAdminTwoFactorSecret, verifyUserPassword } from "../stores/auth-store.mjs";
import { buildTotpSetupPayload, generateTotpSecret, verifyTotpCode } from "./totp-service.mjs";

const adminTwoFactorChallenges = new Map();
const ADMIN_TOTP_ISSUER = "Real Matka Admin";
const ADMIN_TWO_FACTOR_CHALLENGE_TTL_MS = 10 * 60 * 1000;
const ADMIN_PANEL_ROLES = new Set(["admin", "super_admin", "operator", "result_operator", "result_only_operator", "support_operator"]);

function sanitizeSessionUser(user) {
  return {
    id: user.id,
    phone: user.phone,
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

function cleanupExpiredAdminTwoFactorChallenges() {
  const now = Date.now();
  for (const [challengeId, challenge] of adminTwoFactorChallenges.entries()) {
    if (new Date(challenge.expiresAt).getTime() <= now) {
      adminTwoFactorChallenges.delete(challengeId);
    }
  }
}

export async function isAdminTwoFactorEnabled() {
  const settings = await getAppSettings();
  const match = settings.find((item) => item.key === "admin_two_factor_enabled");
  return String(match?.value ?? "true").trim().toLowerCase() !== "false";
}

export async function loginWithPassword(phone, password) {
  const adminAccount = await findAdminByPhone(phone);
  if (adminAccount && verifyUserPassword(password, adminAccount.passwordHash)) {
    try {
      assertApprovedActiveUser(adminAccount);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Login failed";
      return { ok: false, status: 403, error: message };
    }

    if (await isAdminTwoFactorEnabled() && adminAccount.adminTwoFactorEnabled !== false) {
      cleanupExpiredAdminTwoFactorChallenges();
      let adminTwoFactorSecret = String(adminAccount.adminTwoFactorSecret || "").trim();
      let setupRequired = false;
      if (!adminTwoFactorSecret) {
        adminTwoFactorSecret = generateTotpSecret();
        const updatedAdmin = await updateAdminTwoFactorSecret(adminAccount.adminId || adminAccount.id, adminTwoFactorSecret);
        adminTwoFactorSecret = String(updatedAdmin?.adminTwoFactorSecret || adminTwoFactorSecret).trim();
        setupRequired = true;
      }
      const setup = buildTotpSetupPayload({
        secret: adminTwoFactorSecret,
        issuer: ADMIN_TOTP_ISSUER,
        accountName: adminAccount.adminPhone || adminAccount.phone
      });

      const expiresAt = new Date(Date.now() + ADMIN_TWO_FACTOR_CHALLENGE_TTL_MS).toISOString();
      const challengeId = `admin_2fa_${randomBytes(12).toString("hex")}`;
      adminTwoFactorChallenges.set(challengeId, {
        adminId: adminAccount.adminId || adminAccount.id,
        expiresAt
      });

      return {
        ok: true,
        data: {
          requiresTwoFactor: true,
          challengeId,
          expiresAt,
          provider: "authenticator",
          setupRequired,
          setup,
          user: {
            id: adminAccount.adminId || adminAccount.id,
            adminId: adminAccount.adminId || adminAccount.id,
            phone: adminAccount.adminPhone || adminAccount.phone,
            name: adminAccount.adminDisplayName || adminAccount.name,
            role: adminAccount.role
          }
        }
      };
    }

    const { rawToken } = await createAdminSession(adminAccount.adminId || adminAccount.id);
    return {
      ok: true,
      data: {
        token: rawToken,
        user: sanitizeSessionUser({
          ...adminAccount,
          id: adminAccount.adminId || adminAccount.id,
          phone: adminAccount.adminPhone || adminAccount.phone,
          name: adminAccount.adminDisplayName || adminAccount.name
        })
      }
    };
  }

  const user = await findUserByPhone(phone);
  if (!user || !verifyUserPassword(password, user.passwordHash)) {
    return { ok: false, status: 401, error: "Invalid phone or password" };
  }

  try {
    assertApprovedActiveUser(user);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Login failed";
    return { ok: false, status: message.includes("pending admin approval") ? 403 : 403, error: message };
  }
  const { rawToken } = await createSession(user.id);
  return {
    ok: true,
    data: {
      token: rawToken,
      user: sanitizeSessionUser(user)
    }
  };
}

export async function verifyAdminTwoFactorLogin(challengeId, otp) {
  cleanupExpiredAdminTwoFactorChallenges();

  const challenge = adminTwoFactorChallenges.get(challengeId);
  if (!challenge) {
    return { ok: false, status: 400, error: "2FA challenge expired. Login again." };
  }
  if (new Date(challenge.expiresAt).getTime() < Date.now()) {
    adminTwoFactorChallenges.delete(challengeId);
    return { ok: false, status: 400, error: "2FA challenge expired. Login again." };
  }

  const user = await findAdminById(challenge.adminId);
  if (!user || !user.adminTwoFactorSecret) {
    adminTwoFactorChallenges.delete(challengeId);
    return { ok: false, status: 400, error: "Authenticator setup required. Login again." };
  }

  const valid = verifyTotpCode(user.adminTwoFactorSecret, otp);
  if (!valid) {
    return { ok: false, status: 400, error: "Invalid authenticator code" };
  }

  adminTwoFactorChallenges.delete(challengeId);

  if (!user || user.adminId !== challenge.adminId || !ADMIN_PANEL_ROLES.has(String(user.role || "").trim().toLowerCase())) {
    return { ok: false, status: 403, error: "Admin account not available for 2FA completion" };
  }
  if (user.deactivatedAt) {
    return { ok: false, status: 403, error: "Your account is deactivated. Contact support." };
  }
  if (user.blockedAt) {
    return { ok: false, status: 403, error: "Your account is blocked. Contact support." };
  }
  if (user.approvalStatus !== "Approved") {
    return { ok: false, status: 403, error: "Your account is not approved for admin access." };
  }

  const { rawToken } = await createAdminSession(user.adminId);
  return {
    ok: true,
    data: {
      token: rawToken,
      user: sanitizeSessionUser({
        ...user,
        id: user.adminId,
        phone: user.adminPhone || user.phone,
        name: user.adminDisplayName || user.name
      })
    }
  };
}

export async function getCurrentSessionUser(token) {
  const admin = await requireAdminByToken(token);
  if (admin) {
    return {
      id: admin.adminId,
      phone: admin.adminPhone || admin.phone,
      name: admin.adminDisplayName || admin.name,
      role: admin.role,
      hasMpin: false,
      referralCode: "",
      joinedAt: admin.joinedAt,
      walletBalance: 0
    };
  }

  const user = await requireUserSnapshotByToken(token);
  if (!user) {
    return null;
  }

  return {
    id: user.id,
    phone: user.phone,
    name: user.name,
    role: user.role,
    hasMpin: user.hasMpin,
    referralCode: user.referralCode,
    joinedAt: user.joinedAt,
    walletBalance: Number(user.walletBalance ?? 0)
  };
}
