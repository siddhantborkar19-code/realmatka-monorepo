import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Link, router } from "expo-router";
import { createContext, ReactNode, useContext, useState } from "react";
import { Image, Modal, Platform, Pressable, RefreshControl, ScrollView, StyleProp, StyleSheet, Switch, Text, TextInput, View, ViewStyle, useWindowDimensions } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppState } from "@/lib/app-state";
import { colors } from "@/theme/colors";
import { spacing } from "@/theme/spacing";
import { drawerItems, profile } from "../data/mock";

const DrawerContext = createContext<{ openDrawer: () => void; closeDrawer: () => void } | null>(null);

export function AppChromeProvider({ children }: { children: ReactNode }) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <DrawerContext.Provider value={{ openDrawer: () => setDrawerOpen(true), closeDrawer: () => setDrawerOpen(false) }}>
      {children}
      <DrawerSheet onClose={() => setDrawerOpen(false)} open={drawerOpen} />
    </DrawerContext.Provider>
  );
}

export function useAppChrome() {
  return useContext(DrawerContext);
}

export function AppScreen({
  children,
  scroll = true,
  padded = true,
  showPromo = true,
  bottomInsetOffset,
  bottomInsetMinPadding,
  footer,
  scrollContentStyle,
  refreshing = false,
  onRefresh
}: {
  children: ReactNode;
  scroll?: boolean;
  padded?: boolean;
  showPromo?: boolean;
  bottomInsetOffset?: number;
  bottomInsetMinPadding?: number;
  footer?: ReactNode;
  scrollContentStyle?: StyleProp<ViewStyle>;
  refreshing?: boolean;
  onRefresh?: (() => void) | undefined;
}) {
  const insets = useSafeAreaInsets();
  const bottomOverlayOffset = bottomInsetOffset ?? (showPromo ? 18 : 92);
  const minBottomPadding = bottomInsetMinPadding ?? (footer ? spacing.xl * 7 : spacing.xl * 4);
  const bottomContentPadding = Math.max(insets.bottom + bottomOverlayOffset, minBottomPadding);

  const content = scroll ? (
    <ScrollView
      contentContainerStyle={[styles.scroll, { paddingBottom: bottomContentPadding }, padded && styles.padded, scrollContentStyle]}
      keyboardShouldPersistTaps="handled"
      refreshControl={onRefresh ? <RefreshControl onRefresh={onRefresh} refreshing={refreshing} tintColor={colors.primary} /> : undefined}
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.fill, { paddingBottom: bottomContentPadding }, padded && styles.padded]}>{children}</View>
  );

  return (
    <SafeAreaView edges={["left", "right", "bottom"]} style={styles.safe}>
      {content}
      {footer ? <View style={[styles.fixedFooter, { paddingBottom: Math.max(insets.bottom + spacing.sm, spacing.lg) }]}>{footer}</View> : null}
      {showPromo ? <PromoStrip /> : null}
    </SafeAreaView>
  );
}

export function AppHeader({
  title,
  subtitle,
  onMenuPress,
  onBackPress,
  rightLabel,
  showRightMeta = true
}: {
  title: string;
  subtitle?: string;
  onMenuPress?: () => void;
  onBackPress?: () => void;
  rightLabel?: string;
  showRightMeta?: boolean;
}) {
  const { currentUser, walletBalance } = useAppState();
  const { width } = useWindowDimensions();
  const chrome = useAppChrome();
  const handleLeftPress = onBackPress ?? onMenuPress ?? chrome?.openDrawer;
  const showHeaderLogo = title === "Real Matka" && !onBackPress;
  const isNarrowScreen = width < 390;
  const isVeryNarrowScreen = width < 360;
  const headerLogoStyle = showHeaderLogo
    ? [
        styles.headerLogo,
        isNarrowScreen && styles.headerLogoNarrow,
        isVeryNarrowScreen && styles.headerLogoVeryNarrow
      ]
    : null;
  const headerBalanceValueStyle = [
    styles.headerBalanceValue,
    isNarrowScreen && styles.headerBalanceValueNarrow,
    isVeryNarrowScreen && styles.headerBalanceValueVeryNarrow
  ];
  const headerBalanceLabelStyle = [
    styles.headerBalanceLabel,
    isVeryNarrowScreen && styles.headerBalanceLabelVeryNarrow
  ];
  const headerBadgeStyle = [styles.headerBadge, isVeryNarrowScreen && styles.headerBadgeNarrow];

  return (
    <SafeAreaView edges={["top"]} style={styles.headerSafeArea}>
      <LinearGradient
        colors={[colors.gradientStart, colors.gradientEnd]}
        end={{ x: 1, y: 1 }}
        start={{ x: 0, y: 0 }}
        style={styles.header}
      >
        <View style={styles.headerRow}>
          {showHeaderLogo ? (
            <View style={styles.headerBrandRow}>
              <Pressable disabled={!handleLeftPress} hitSlop={10} onPress={handleLeftPress} style={styles.headerIcon}>
                <Ionicons color={colors.surface} name={onBackPress ? "arrow-back" : "menu"} size={22} />
              </Pressable>
              <Image source={require("../assets/images/adaptive-icon.png")} style={headerLogoStyle} resizeMode="contain" />
            </View>
          ) : (
            <>
              <Pressable disabled={!handleLeftPress} hitSlop={10} onPress={handleLeftPress} style={styles.headerIcon}>
                <Ionicons color={colors.surface} name={onBackPress ? "arrow-back" : "menu"} size={22} />
              </Pressable>
              <View style={styles.headerTextWrap}>
                <Text style={styles.headerTitle}>{title}</Text>
                {subtitle ? <Text style={styles.headerSubtitle}>{subtitle}</Text> : null}
              </View>
            </>
          )}
          {showRightMeta ? (
            <>
              <View style={styles.headerBalance}>
                <Text numberOfLines={1} style={headerBalanceValueStyle}>{rightLabel ?? `${walletBalance}`}</Text>
                <Text style={headerBalanceLabelStyle}>Wallet</Text>
              </View>
              <View style={headerBadgeStyle}>
                <Ionicons color={colors.surface} name="wallet-outline" size={16} />
              </View>
            </>
          ) : null}
        </View>
        {subtitle ? null : showHeaderLogo ? null : currentUser ? <Text style={styles.headerSubtitle}>Welcome {currentUser.name}</Text> : null}
      </LinearGradient>
    </SafeAreaView>
  );
}

export function BackHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return <AppHeader onBackPress={() => router.back()} showRightMeta={false} subtitle={subtitle} title={title} />;
}

export function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={styles.sectionTitleWrap}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
    </View>
  );
}

export function SurfaceCard({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function StatPill({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string }) {
  return (
    <View style={styles.statPill}>
      <View style={styles.statIcon}>
        <Ionicons color={colors.primary} name={icon} size={18} />
      </View>
      <View>
        <Text style={styles.statValue}>{value}</Text>
        <Text style={styles.statLabel}>{label}</Text>
      </View>
    </View>
  );
}

export function PrimaryButton({ label, icon, onPress }: { label: string; icon?: keyof typeof Ionicons.glyphMap; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.primaryButton}>
      {icon ? <Ionicons color={colors.surface} name={icon} size={18} /> : null}
      <Text style={styles.primaryButtonText}>{label}</Text>
    </Pressable>
  );
}

export function Field({ placeholder, secureTextEntry }: { placeholder: string; secureTextEntry?: boolean }) {
  return <TextInput placeholder={placeholder} placeholderTextColor={colors.textMuted} secureTextEntry={secureTextEntry} style={styles.field} />;
}

export function DrawerSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { currentUser, logout } = useAppState();
  const [loggingOut, setLoggingOut] = useState(false);

  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={open}>
      <View style={styles.drawerOverlay}>
        <View style={styles.drawerPanel}>
          <View style={styles.drawerTop}>
            <View style={styles.avatar}>
              <Ionicons color={colors.surface} name="person-outline" size={28} />
            </View>
            <View style={styles.fill}>
              <Text style={styles.drawerName}>{currentUser?.name ?? profile.name}</Text>
              <Text style={styles.drawerPhone}>{currentUser?.phone ?? profile.phone}</Text>
            </View>
            <Pressable onPress={onClose}>
              <Ionicons color={colors.textPrimary} name="close" size={24} />
            </Pressable>
          </View>
          <ScrollView showsVerticalScrollIndicator={false}>
            {drawerItems.map((item) => (
              <Link asChild href={item.href} key={item.label} onPress={onClose}>
                <Pressable style={styles.drawerItem}>
                  <View style={styles.drawerItemIcon}>
                    <Ionicons color={colors.surface} name={item.icon} size={20} />
                  </View>
                  <Text style={styles.drawerItemText}>{item.label}</Text>
                </Pressable>
              </Link>
            ))}

            <Pressable
              disabled={loggingOut}
              onPress={async () => {
                if (loggingOut) {
                  return;
                }

                try {
                  setLoggingOut(true);
                  onClose();
                  await logout();
                  router.replace("/auth/login");
                } finally {
                  setLoggingOut(false);
                }
              }}
              style={[styles.drawerItem, loggingOut && styles.drawerItemDisabled]}
            >
              <View style={[styles.drawerItemIcon, styles.drawerLogoutIcon]}>
                <Ionicons color={colors.surface} name="log-out-outline" size={20} />
              </View>
              <Text style={styles.drawerItemText}>{loggingOut ? "Logging out..." : "Logout"}</Text>
            </Pressable>
          </ScrollView>
        </View>
        <Pressable onPress={onClose} style={styles.drawerBackdrop} />
      </View>
    </Modal>
  );
}

export function PromoStrip() {
  const { width } = useWindowDimensions();
  const [dismissed, setDismissed] = useState(false);

  if (Platform.OS !== "web" || width < 1024 || dismissed) {
    return null;
  }

  return (
    <View style={styles.promoStrip}>
      <Pressable style={styles.downloadButton}>
        <Ionicons color={colors.primary} name="download-outline" size={16} />
        <Text style={styles.downloadText}>Download</Text>
      </Pressable>
      <Text style={styles.promoText}>Download the app now!</Text>
      <Pressable onPress={() => setDismissed(true)} style={styles.closePromo}>
        <Ionicons color={colors.surface} name="close" size={12} />
      </Pressable>
    </View>
  );
}

export function ToggleCard({ title, subtitle, value }: { title: string; subtitle: string; value: boolean }) {
  return (
    <View style={styles.card}>
      <View style={styles.toggleRow}>
        <View style={styles.fill}>
          <Text style={styles.toggleTitle}>{title}</Text>
          <Text style={styles.toggleSubtitle}>{subtitle}</Text>
        </View>
        <Switch thumbColor={colors.surface} trackColor={{ false: colors.border, true: colors.success }} value={value} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background
  },
  scroll: {
    flexGrow: 1,
    gap: spacing.lg
  },
  fill: {
    flex: 1
  },
  padded: {
    padding: spacing.lg
  },
  fixedFooter: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    backgroundColor: "transparent"
  },
  headerSafeArea: {
    backgroundColor: colors.background
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: 6,
    paddingBottom: 6
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm
  },
  headerBrandRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    minWidth: 0,
    gap: 6
  },
  headerIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.whiteOverlaySoft
  },
  headerTextWrap: {
    flex: 1
  },
  headerLogo: {
    width: 238,
    height: 54,
    flexShrink: 1,
    marginLeft: 0,
    marginBottom: 0
  },
  headerLogoNarrow: {
    width: 196,
    height: 48
  },
  headerLogoVeryNarrow: {
    width: 168,
    height: 42
  },
  headerTitle: {
    color: colors.surface,
    fontSize: 18,
    fontWeight: "800"
  },
  headerSubtitle: {
    marginTop: 2,
    color: colors.whiteOverlayText,
    fontSize: 11
  },
  headerBalance: {
    minWidth: 54,
    maxWidth: 72,
    alignItems: "flex-end",
    flexShrink: 0
  },
  headerBalanceValue: {
    color: colors.surface,
    fontSize: 13,
    fontWeight: "800"
  },
  headerBalanceValueNarrow: {
    fontSize: 12
  },
  headerBalanceValueVeryNarrow: {
    fontSize: 11
  },
  headerBalanceLabel: {
    color: colors.whiteOverlayTextStrong,
    fontSize: 10
  },
  headerBalanceLabelVeryNarrow: {
    fontSize: 9
  },
  headerBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.whiteOverlayBorder,
    alignItems: "center",
    justifyContent: "center"
  },
  headerBadgeNarrow: {
    width: 26,
    height: 26,
    borderRadius: 13
  },
  sectionTitleWrap: {
    gap: 4
  },
  sectionTitle: {
    fontSize: 24,
    color: colors.textPrimary,
    fontWeight: "800"
  },
  sectionSubtitle: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 22,
    padding: spacing.lg,
    shadowColor: colors.shadow,
    shadowOpacity: 0.1,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border
  },
  statPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: 18,
    padding: spacing.md,
    flex: 1,
    minWidth: 150
  },
  statIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center"
  },
  statValue: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: "800"
  },
  statLabel: {
    color: colors.textMuted,
    fontSize: 12
  },
  primaryButton: {
    minHeight: 48,
    borderRadius: 999,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: spacing.lg
  },
  primaryButtonText: {
    color: colors.surface,
    fontSize: 15,
    fontWeight: "800"
  },
  field: {
    minHeight: 54,
    borderRadius: 999,
    backgroundColor: colors.surface,
    paddingHorizontal: 18,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: colors.shadow,
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3
  },
  drawerOverlay: {
    flex: 1,
    flexDirection: "row"
  },
  drawerBackdrop: {
    flex: 1,
    backgroundColor: colors.overlay
  },
  drawerPanel: {
    width: "82%",
    maxWidth: 360,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    paddingTop: 44,
    paddingBottom: spacing.lg
  },
  drawerTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginBottom: spacing.lg
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary
  },
  drawerName: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: "800"
  },
  drawerPhone: {
    color: colors.textMuted,
    marginTop: 2
  },
  drawerWalletCard: {
    backgroundColor: colors.accentSoft,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  drawerWalletLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase"
  },
  drawerWalletValue: {
    marginTop: 2,
    color: colors.textPrimary,
    fontSize: 22,
    fontWeight: "900"
  },
  drawerWalletBadge: {
    borderRadius: 999,
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  drawerWalletBadgeText: {
    color: colors.primaryDark,
    fontSize: 11,
    fontWeight: "800"
  },
  drawerItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: 11
  },
  drawerItemDisabled: {
    opacity: 0.65
  },
  drawerItemIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center"
  },
  drawerLogoutIcon: {
    backgroundColor: colors.danger
  },
  drawerItemText: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: "600"
  },
  promoStrip: {
    position: "absolute",
    left: 24,
    right: 24,
    bottom: 0,
    backgroundColor: colors.surface,
    borderRadius: 16,
    minHeight: 48,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 10,
    gap: 8,
    shadowColor: colors.shadow,
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
    borderWidth: 1,
    borderColor: colors.border
  },
  downloadButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  downloadText: {
    color: colors.primary,
    fontWeight: "700"
  },
  promoText: {
    flex: 1,
    textAlign: "center",
    color: colors.textMuted,
    fontWeight: "500"
  },
  closePromo: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.danger,
    alignItems: "center",
    justifyContent: "center"
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12
  },
  toggleTitle: {
    color: colors.textPrimary,
    fontSize: 17,
    fontWeight: "800"
  },
  toggleSubtitle: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 2
  }
});
