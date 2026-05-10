const readEnv = (name, fallback = "") => {
  const value = process.env[name];
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
};

export const standaloneConfig = {
  port: Number(process.env.PORT || 3000),
  databaseProvider: readEnv("DATABASE_PROVIDER", "sqlite"),
  databaseUrl: readEnv("DATABASE_URL"),
  sessionTtlHours: Number(readEnv("SESSION_TTL_HOURS", "168")),
  supportChatResolvedRetentionDays: Number(readEnv("SUPPORT_CHAT_RESOLVED_RETENTION_DAYS", "10")),
  appUrl: readEnv("EXPO_PUBLIC_APP_URL", "http://localhost:8081"),
  apiUrl: readEnv("EXPO_PUBLIC_API_BASE_URL", "http://localhost:3000"),
  adminDomain: readEnv("ADMIN_DOMAIN", "http://localhost:5500"),
  paymentDisplayName: readEnv("PAYMENT_DISPLAY_NAME", "SDT Wedding"),
  paymentDescription: readEnv("PAYMENT_DESCRIPTION", "Wallet Top Up"),
  allowDefaultAdminSeed: readEnv("ALLOW_DEFAULT_ADMIN_SEED", process.env.NODE_ENV === "production" ? "false" : "true") === "true",
  envAdminPhone: readEnv("ADMIN_PHONE"),
  envAdminPassword: readEnv("ADMIN_PASSWORD"),
  envAdminName: readEnv("ADMIN_NAME", "Admin User"),
  defaultAdminPhone: readEnv("DEFAULT_ADMIN_PHONE"),
  defaultAdminPassword: readEnv("DEFAULT_ADMIN_PASSWORD"),
  defaultAdminMpin: readEnv("DEFAULT_ADMIN_MPIN"),
  defaultAdminName: readEnv("DEFAULT_ADMIN_NAME", "Admin User"),
  defaultAdminReferralCode: readEnv("DEFAULT_ADMIN_REFERRAL_CODE", "621356")
};

export function isStandalonePostgresEnabled() {
  return standaloneConfig.databaseProvider === "postgres" && Boolean(standaloneConfig.databaseUrl);
}
