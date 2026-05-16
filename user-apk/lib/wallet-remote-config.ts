import { useEffect, useMemo, useState } from "react";
import { api, type SettingItem } from "@/lib/api";

export type WalletSettingsMap = Map<string, string>;

export function settingsMapFrom(items: SettingItem[]) {
  return new Map(items.map((item) => [String(item.key || "").trim(), String(item.value || "").trim()]));
}

export function readWalletText(settings: WalletSettingsMap, key: string, fallback: string) {
  const value = String(settings.get(key) ?? "").trim();
  return value || fallback;
}

export function readWalletBoolean(settings: WalletSettingsMap, key: string, fallback: boolean) {
  const raw = String(settings.get(key) ?? "").trim().toLowerCase();
  if (!raw) {
    return fallback;
  }
  return !["0", "false", "no", "off", "disabled", "hide", "hidden"].includes(raw);
}

export function readWalletNumber(settings: WalletSettingsMap, key: string, fallback: number) {
  const raw = Number(String(settings.get(key) ?? "").trim());
  return Number.isFinite(raw) && raw >= 0 ? raw : fallback;
}

export function useWalletRemoteSettings() {
  const [settings, setSettings] = useState<SettingItem[]>([]);

  useEffect(() => {
    let active = true;
    api
      .getSettings()
      .then((items) => {
        if (active) {
          setSettings(Array.isArray(items) ? items : []);
        }
      })
      .catch(() => {
        if (active) {
          setSettings([]);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  return useMemo(() => settingsMapFrom(settings), [settings]);
}
