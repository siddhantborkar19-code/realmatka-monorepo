import { getAppSettings, upsertAppSetting } from "../stores/admin-store.mjs";

const allowedPublicSettingKeys = new Set([
  "notice_text",
  "support_phone",
  "support_hours",
  "bonus_enabled",
  "bonus_text",
  "first_deposit_bonus_enabled",
  "first_deposit_bonus_minimum",
  "first_deposit_bonus_amount",
  "first_deposit_bonus_upper_minimum",
  "first_deposit_bonus_upper_amount",
  "special_deposit_bonus_enabled",
  "special_deposit_bonus_date",
  "special_deposit_bonus_minimum",
  "special_deposit_bonus_amount",
  "special_deposit_bonus_upper_minimum",
  "special_deposit_bonus_upper_amount",
  "special_deposit_bonus_text",
  "referral_deposit_bonus_rate",
  "referral_deposit_bonus_max_times",
  "referral_deposit_bonus_max_per_deposit",
  "latest_app_version",
  "latest_app_apk_url",
  "latest_app_update_required",
  "latest_app_update_title",
  "latest_app_update_message",
  "wallet_add_fund_visible",
  "wallet_add_fund_enabled",
  "wallet_add_fund_label",
  "wallet_add_fund_message",
  "wallet_withdraw_visible",
  "wallet_withdraw_enabled",
  "wallet_withdraw_label",
  "wallet_withdraw_message",
  "wallet_history_visible",
  "wallet_history_enabled",
  "wallet_history_label",
  "wallet_history_message",
  "wallet_add_bank_visible",
  "wallet_add_bank_enabled",
  "wallet_add_bank_label",
  "wallet_add_bank_message",
  "wallet_add_fund_title",
  "wallet_add_fund_amount_label",
  "wallet_add_fund_button_label",
  "wallet_add_fund_history_visible",
  "wallet_add_fund_history_label",
  "wallet_add_fund_how_it_works_visible",
  "wallet_add_fund_manual_qr_visible",
  "wallet_add_fund_whatsapp_visible",
  "wallet_withdraw_title",
  "wallet_withdraw_subtitle",
  "wallet_withdraw_min_amount",
  "wallet_withdraw_max_amount",
  "wallet_withdraw_multiple",
  "wallet_withdraw_start_time",
  "wallet_withdraw_end_time",
  "wallet_withdraw_weekend_closed",
  "wallet_withdraw_weekend_message",
  "wallet_withdraw_time_message",
  "wallet_withdraw_button_label",
  "wallet_withdraw_info_visible",
  "wallet_withdraw_pin_message",
  "wallet_add_bank_title",
  "wallet_add_bank_subtitle",
  "wallet_add_bank_form_title",
  "wallet_add_bank_helper",
  "wallet_add_bank_account_placeholder",
  "wallet_add_bank_holder_placeholder",
  "wallet_add_bank_ifsc_placeholder",
  "wallet_add_bank_button_label",
  "wallet_add_bank_pin_message",
  "wallet_add_bank_success_message"
]);

export async function getAdminSettings() {
  return getAppSettings();
}

export async function getPublicSettings() {
  const settings = await getAppSettings();
  return settings.filter((item) => allowedPublicSettingKeys.has(item.key));
}

export async function updateAdminSettings(body) {
  const entries = Object.entries(body || {}).filter(([key]) => typeof key === "string" && key.trim());
  if (!entries.length) {
    return { ok: false, status: 400, error: "At least one setting is required" };
  }

  const updated = [];
  for (const [key, value] of entries) {
    updated.push(await upsertAppSetting(key, String(value ?? "")));
  }

  return { ok: true, data: updated };
}
