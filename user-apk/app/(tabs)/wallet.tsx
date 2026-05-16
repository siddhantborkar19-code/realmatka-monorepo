import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { AppHeader, AppScreen, SurfaceCard } from "@/components/ui";
import { useAppState } from "@/lib/app-state";
import { getAddFundUnsupportedMessage, isSupportedAddFundPlatform } from "@/lib/payment-platform";
import { readWalletBoolean, readWalletText, useWalletRemoteSettings } from "@/lib/wallet-remote-config";
import { colors } from "@/theme/colors";

const walletActions = [
  { id: "add_fund", title: "Add Fund", href: "/wallet/add-fund", icon: "wallet-outline", tone: "#ec4899" },
  { id: "withdraw", title: "Withdraw Fund", href: "/wallet/withdraw", icon: "cash-outline", tone: "#9333ea" },
  { id: "history", title: "Deposit & Withdraw History", href: "/wallet/history", icon: "time-outline", tone: "#d97706" },
  { id: "add_bank", title: "Add Bank Details", href: "/wallet/add-bank-details", icon: "business-outline", tone: "#22c55e" }
] as const;

export default function WalletScreen() {
  const { walletBalance } = useAppState();
  const addFundSupported = isSupportedAddFundPlatform();
  const walletSettings = useWalletRemoteSettings();
  const configuredActions = useMemo(
    () =>
      walletActions
        .map((item) => {
          const prefix = `wallet_${item.id}`;
          const visible = readWalletBoolean(walletSettings, `${prefix}_visible`, true);
          const enabled = readWalletBoolean(walletSettings, `${prefix}_enabled`, true);
          const title = readWalletText(walletSettings, `${prefix}_label`, item.title);
          const message = readWalletText(walletSettings, `${prefix}_message`, "");
          return { ...item, title, visible, enabled, message };
        })
        .filter((item) => item.visible),
    [walletSettings]
  );

  return (
    <View style={styles.page}>
      <AppHeader title="Wallet" subtitle={undefined} rightLabel={`Rs ${walletBalance}`} />
      <AppScreen showPromo={false}>
        <SurfaceCard style={styles.heroCard}>
          <View style={styles.heroIcon}>
            <Ionicons color={colors.surface} name="wallet-outline" size={22} />
          </View>
          <View style={styles.heroCopy}>
            <Text style={styles.heroValue}>Rs {walletBalance}</Text>
            <Text style={styles.heroLabel}>Available wallet balance</Text>
          </View>
        </SurfaceCard>
        <View style={styles.list}>
          {configuredActions.map((item) => {
            const isAddFund = item.href === "/wallet/add-fund";
            const disabled = !item.enabled || (isAddFund && !addFundSupported);
            const disabledMessage = item.message || (isAddFund && !addFundSupported ? getAddFundUnsupportedMessage() : "");

            return (
            <Pressable
              key={item.id}
              disabled={disabled}
              onPress={() => {
                if (disabled) {
                  return;
                }
                router.push(item.href as never);
              }}
            >
              <SurfaceCard style={styles.actionCard}>
                <View style={[styles.actionRow, disabled && styles.actionRowDisabled]}>
                  <View style={[styles.actionIconWrap, { borderColor: item.tone }]}>
                    <View style={[styles.actionIcon, { backgroundColor: item.tone }]}>
                      <Ionicons color={colors.surface} name={item.icon} size={20} />
                    </View>
                  </View>
                  <View style={styles.actionCopy}>
                    <Text style={styles.actionText}>{item.title}</Text>
                    {disabled && disabledMessage ? <Text style={styles.actionHint}>{disabledMessage}</Text> : null}
                  </View>
                  <Ionicons color="#98a2b3" name="chevron-forward" size={18} />
                </View>
              </SurfaceCard>
            </Pressable>
          );
          })}
        </View>
      </AppScreen>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: colors.background
  },
  list: {
    gap: 12
  },
  heroCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 18,
    borderRadius: 22,
    backgroundColor: colors.surface,
    borderColor: colors.borderStrong
  },
  heroIcon: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: colors.accentDark,
    alignItems: "center",
    justifyContent: "center"
  },
  heroCopy: {
    flex: 1,
    gap: 4
  },
  heroValue: {
    color: colors.primaryDark,
    fontSize: 28,
    fontWeight: "900"
  },
  heroLabel: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: "700"
  },
  actionCard: {
    paddingVertical: 16,
    borderRadius: 20
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14
  },
  actionRowDisabled: {
    opacity: 0.55
  },
  actionCopy: {
    flex: 1
  },
  actionIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ffffff"
  },
  actionIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center"
  },
  actionText: {
    color: "#111827",
    fontSize: 17,
    fontWeight: "800"
  },
  actionHint: {
    marginTop: 4,
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: "700",
    lineHeight: 15
  }
});
