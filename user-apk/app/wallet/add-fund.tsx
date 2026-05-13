import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, AppState, AppStateStatus, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { AppScreen, BackHeader, SurfaceCard } from "@/components/ui";
import { api, formatApiError, type WalletEntry } from "@/lib/api";
import { useAppState } from "@/lib/app-state";
import { getAddFundUnsupportedMessage, isSupportedAddFundPlatform } from "@/lib/payment-platform";
import { buildReferenceId, createDepositSession, type PreferredUpiTarget } from "@/lib/payment-processor";
import { colors } from "@/theme/colors";

const MIN_DEPOSIT_AMOUNT = 100;
const PAYMENT_STATUS_REFRESH_MS = 10_000;
const DIRECT_UPI_ID = (process.env.EXPO_PUBLIC_DIRECT_UPI_ID || "9309782081@okbizaxis").trim();
const DIRECT_UPI_NAME = (process.env.EXPO_PUBLIC_DIRECT_UPI_NAME || "Real Matka").trim();

const UPI_TARGETS: Array<{ label: string; appName: string; target: PreferredUpiTarget }> = [
  { label: "Google Pay", appName: "GOOGLE_PAY", target: "googlePay" },
  { label: "PhonePe", appName: "PHONEPE", target: "phonePe" },
  { label: "Paytm", appName: "PAYTM", target: "paytm" },
  { label: "Other UPI", appName: "UPI", target: "generic" }
];

function statusTone(status: string) {
  const normalized = status.trim().toUpperCase();
  if (normalized === "SUCCESS" || normalized === "PAID") {
    return styles.statusSuccess;
  }
  if (normalized === "FAILED" || normalized === "CANCELLED" || normalized === "EXPIRED") {
    return styles.statusDanger;
  }
  return styles.statusPending;
}

export default function AddFundScreen() {
  const { currentUser, sessionToken, walletBalance, reloadSessionData, loadWalletHistory, loadBidHistory } = useAppState();
  const addFundSupported = isSupportedAddFundPlatform();
  const [amount, setAmount] = useState("");
  const [utr, setUtr] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [pendingDeposit, setPendingDeposit] = useState<WalletEntry | null>(null);
  const activeUpiAppRef = useRef("UPI");

  const numericAmount = Number(amount || 0);
  const hasValidAmount = Number.isFinite(numericAmount) && numericAmount >= MIN_DEPOSIT_AMOUNT;
  const displayStatus = useMemo(() => pendingDeposit?.status || "", [pendingDeposit]);

  const pollDepositStatus = useCallback(
    async (referenceId: string, { silent = false } = {}) => {
      if (!sessionToken) {
        return null;
      }

      try {
        if (!silent) {
          setCheckingStatus(true);
        }
        const next = await api.getUpiDepositStatus(sessionToken, referenceId);
        setPendingDeposit(next);

        const normalized = String(next.status || "")
          .trim()
          .toUpperCase();

        if (normalized === "SUCCESS" || normalized === "PAID") {
          await reloadSessionData({ force: true });
          await Promise.allSettled([
            loadWalletHistory({ force: true }),
            loadBidHistory({ force: true })
          ]);
          setSuccessMessage(`Deposit approved. Reference ${next.referenceId || referenceId} wallet history me aa gaya hai.`);
          router.replace({
            pathname: "/wallet/history",
            params: { payment: "success", reference: next.referenceId || referenceId }
          } as never);
        } else if (normalized === "FAILED" || normalized === "CANCELLED" || normalized === "REJECTED") {
          setError(`Deposit ${normalized.toLowerCase()} ho gaya. Zarurat ho to dobara try karo.`);
          router.replace({
            pathname: "/wallet/history",
            params: {
              payment: "failed",
              reference: next.referenceId || referenceId,
              status: normalized.toLowerCase(),
              amount: String(next.amount ?? "")
            }
          } as never);
        }

        return next;
      } catch (statusError) {
        setError(formatApiError(statusError, "Deposit status check nahi hua."));
        return null;
      } finally {
        if (!silent) {
          setCheckingStatus(false);
        }
      }
    },
    [loadBidHistory, loadWalletHistory, reloadSessionData, sessionToken]
  );

  useFocusEffect(
    useCallback(() => {
      if (!pendingDeposit?.referenceId || submitting) {
        return;
      }

      let active = true;
      void pollDepositStatus(pendingDeposit.referenceId, { silent: true });

      const interval = setInterval(() => {
        if (active) {
          void pollDepositStatus(pendingDeposit.referenceId ?? "", { silent: true });
        }
      }, PAYMENT_STATUS_REFRESH_MS);

      return () => {
        active = false;
        clearInterval(interval);
      };
    }, [pendingDeposit?.referenceId, pollDepositStatus, submitting])
  );

  useEffect(() => {
    if (!pendingDeposit?.referenceId) {
      return;
    }

    const handleAppState = (nextState: AppStateStatus) => {
      if (submitting) {
        return;
      }
      if (nextState === "active") {
        void pollDepositStatus(pendingDeposit.referenceId ?? "", { silent: true });
      }
    };

    const subscription = AppState.addEventListener("change", handleAppState);
    return () => {
      subscription.remove();
    };
  }, [pendingDeposit?.referenceId, pollDepositStatus, submitting]);

  return (
    <View style={styles.page}>
      <BackHeader title="Add Fund" subtitle={undefined} />
      <AppScreen showPromo={false}>
        {!addFundSupported ? (
          <SurfaceCard style={styles.unsupportedCard}>
            <Ionicons color={colors.warning} name="alert-circle-outline" size={22} />
            <Text style={styles.unsupportedTitle}>Add Fund unavailable</Text>
            <Text style={styles.unsupportedText}>{getAddFundUnsupportedMessage()}</Text>
            <Pressable onPress={() => router.replace("/(tabs)/wallet" as never)} style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>Back to Wallet</Text>
            </Pressable>
          </SurfaceCard>
        ) : (
          <>
        <SurfaceCard style={styles.heroCard}>
          <View style={styles.heroIcon}>
            <Ionicons color={colors.surface} name="wallet-outline" size={22} />
          </View>
          <View style={styles.heroCopy}>
            <Text style={styles.heroValue}>Rs {walletBalance}</Text>
            <Text style={styles.heroLabel}>Current wallet balance</Text>
          </View>
        </SurfaceCard>

        <SurfaceCard>
          <Text style={styles.sectionTitle}>Deposit Amount</Text>
          <View style={styles.inputRow}>
            <Text style={styles.currencyPrefix}>Rs</Text>
            <TextInput
              keyboardType="numeric"
              onChangeText={(value) => {
                setAmount(value.replace(/[^0-9]/g, ""));
                setError("");
                setSuccessMessage("");
              }}
              placeholder="Enter amount min 100"
              placeholderTextColor={colors.textMuted}
              style={styles.amountInput}
              value={amount}
            />
          </View>

        </SurfaceCard>

        {pendingDeposit ? (
            <SurfaceCard style={styles.statusCard}>
              <View style={styles.statusHeader}>
                <Text style={styles.sectionTitle}>Pending UPI Deposit</Text>
                <Text style={[styles.statusBadge, statusTone(displayStatus)]}>{displayStatus || "PENDING"}</Text>
              </View>
              <View style={styles.statusMeta}>
                <Text style={styles.statusLine}>Reference: {pendingDeposit.referenceId}</Text>
                <Text style={styles.statusLine}>UPI ID: {DIRECT_UPI_ID}</Text>
                <Text style={styles.statusLine}>Amount: Rs {pendingDeposit.amount.toFixed(2)}</Text>
                <Text style={styles.statusHint}>Payment ke baad UTR submit karo. Admin verify karke wallet credit karega.</Text>
              </View>

              <View style={styles.statusActions}>
                {UPI_TARGETS.map((item) => (
                  <Pressable key={item.appName} onPress={() => void openUpiApp(item.target, item.appName)} style={styles.upiButton}>
                    <Text style={styles.upiButtonText}>{item.label}</Text>
                  </Pressable>
                ))}
              </View>

              <View style={styles.inputRow}>
                <Ionicons color={colors.textMuted} name="receipt-outline" size={18} />
                <TextInput
                  autoCapitalize="characters"
                  onChangeText={(value) => {
                    setUtr(value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase());
                    setError("");
                    setSuccessMessage("");
                  }}
                  placeholder="Enter UTR / transaction ID"
                  placeholderTextColor={colors.textMuted}
                  style={styles.amountInput}
                  value={utr}
                />
              </View>

              <Pressable
                disabled={!utr.trim() || submitting || !sessionToken}
                onPress={() => void submitUtr()}
                style={[styles.primaryButton, (!utr.trim() || submitting || !sessionToken) && styles.disabledButton]}
              >
                {submitting ? <ActivityIndicator color={colors.surface} size="small" /> : <Text style={styles.primaryButtonText}>Submit UTR</Text>}
              </Pressable>
          </SurfaceCard>
        ) : null}

        {successMessage ? (
          <SurfaceCard style={styles.messageCard}>
            <Text style={styles.successText}>{successMessage}</Text>
          </SurfaceCard>
        ) : null}

        {error ? (
          <SurfaceCard style={styles.messageCard}>
            <Text style={styles.errorText}>{error}</Text>
          </SurfaceCard>
        ) : null}

        <SurfaceCard>
          <Text style={styles.sectionTitle}>How It Works</Text>
          <View style={styles.steps}>
            <Text style={styles.stepText}>1. Amount enter karo aur UPI request start karo.</Text>
            <Text style={styles.stepText}>2. Google Pay, PhonePe, Paytm ya kisi bhi UPI app se payment complete karo.</Text>
            <Text style={styles.stepText}>3. UTR submit karo. Verification ke baad wallet credit hoga.</Text>
          </View>
        </SurfaceCard>

        <View style={styles.footerActions}>
          <Pressable
            disabled={!hasValidAmount || submitting || !sessionToken}
            onPress={() => void startDeposit()}
            style={[styles.primaryButton, (!hasValidAmount || submitting || !sessionToken) && styles.disabledButton]}
          >
            {submitting ? <ActivityIndicator color={colors.surface} size="small" /> : <Text style={styles.primaryButtonText}>Start UPI Deposit</Text>}
          </Pressable>

          <Pressable onPress={() => router.push("/wallet/history")} style={styles.historyButton}>
            <Text style={styles.historyButtonText}>View Wallet History</Text>
          </Pressable>
        </View>
          </>
        )}
      </AppScreen>
    </View>
  );

  async function startDeposit() {
    if (!sessionToken) {
      setError("Login required");
      return;
    }

    if (!Number.isFinite(numericAmount) || numericAmount < MIN_DEPOSIT_AMOUNT) {
      setError(`Minimum deposit is Rs ${MIN_DEPOSIT_AMOUNT}.`);
      return;
    }
      try {
        setSubmitting(true);
      setError("");
      setSuccessMessage("");

      const referenceId = pendingDeposit?.referenceId || buildReferenceId();
      const deposit = await api.startUpiDeposit(sessionToken, numericAmount, "UPI", referenceId);
      setPendingDeposit(deposit);
      setSuccessMessage("UPI request ready hai. Payment app choose karke pay karo, phir UTR submit karo.");
    } catch (startError) {
      setError(formatApiError(startError, "Payment start nahi hua."));
    } finally {
      setSubmitting(false);
    }
  }

  async function openUpiApp(target: PreferredUpiTarget, appName: string) {
    if (!pendingDeposit?.referenceId) {
      setError("Pehle UPI deposit request start karo.");
      return;
    }
    try {
      activeUpiAppRef.current = appName;
      const session = createDepositSession({
        amount: pendingDeposit.amount,
        upiId: DIRECT_UPI_ID,
        referenceId: pendingDeposit.referenceId,
        payerLabel: DIRECT_UPI_NAME,
        note: pendingDeposit.referenceId,
        preferredTarget: target
      });
      await Linking.openURL(session.launchUrl);
    } catch {
      setError("UPI app open nahi hua. Other UPI option try karo.");
    }
  }

  async function submitUtr() {
    if (!sessionToken || !pendingDeposit?.referenceId) {
      setError("Deposit request missing hai. Dobara start karo.");
      return;
    }
    const cleanUtr = utr.trim().toUpperCase();
    if (!cleanUtr) {
      setError("UTR / transaction ID required hai.");
      return;
    }
    try {
      setSubmitting(true);
      setError("");
      const updated = await api.reportUpiDeposit(sessionToken, {
        referenceId: pendingDeposit.referenceId,
        appName: activeUpiAppRef.current || "UPI",
        utr: cleanUtr,
        appReportedStatus: "SUBMITTED",
        rawResponse: "user_submitted_utr"
      });
      setPendingDeposit(updated);
      setSuccessMessage("UTR submit ho gaya. Admin verify karte hi wallet credit ho jayega.");
      await loadWalletHistory({ force: true });
    } catch (submitError) {
      setError(formatApiError(submitError, "UTR submit nahi hua."));
    } finally {
      setSubmitting(false);
    }
  }

}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: colors.background
  },
  heroCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12
  },
  unsupportedCard: {
    alignItems: "center",
    gap: 12,
    paddingVertical: 28
  },
  unsupportedTitle: {
    color: colors.textPrimary,
    fontSize: 20,
    fontWeight: "900"
  },
  unsupportedText: {
    color: colors.textSecondary,
    textAlign: "center",
    lineHeight: 21
  },
  heroIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary
  },
  heroCopy: {
    flex: 1
  },
  heroValue: {
    color: colors.primaryDark,
    fontSize: 26,
    fontWeight: "900"
  },
  heroLabel: {
    color: colors.textSecondary,
    fontWeight: "700"
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: 17,
    fontWeight: "800"
  },
  inputRow: {
    minHeight: 58,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    gap: 8
  },
  currencyPrefix: {
    color: colors.primaryDark,
    fontSize: 18,
    fontWeight: "900"
  },
  amountInput: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 20,
    fontWeight: "900"
  },
  helperText: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18
  },
  statusCard: {
    gap: 14
  },
  statusHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12
  },
  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    fontSize: 11,
    fontWeight: "900",
    overflow: "hidden"
  },
  statusPending: {
    backgroundColor: colors.warningSoft,
    color: colors.warning
  },
  statusSuccess: {
    backgroundColor: colors.successSoft,
    color: colors.success
  },
  statusDanger: {
    backgroundColor: colors.dangerSoft,
    color: colors.danger
  },
  statusMeta: {
    gap: 5
  },
  statusLine: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: "600"
  },
  statusHint: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "600"
  },
  statusActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10
  },
  upiButton: {
    minHeight: 42,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    paddingHorizontal: 14
  },
  upiButtonText: {
    color: colors.primaryDark,
    fontSize: 13,
    fontWeight: "800"
  },
  primaryButton: {
    flex: 1,
    minHeight: 50,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary,
    paddingHorizontal: 16
  },
  primaryButtonText: {
    color: colors.surface,
    fontSize: 14,
    fontWeight: "800"
  },
  secondaryButton: {
    flex: 1,
    minHeight: 50,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface
  },
  secondaryButtonText: {
    color: colors.primaryDark,
    fontSize: 14,
    fontWeight: "800"
  },
  disabledButton: {
    opacity: 0.6
  },
  messageCard: {
    gap: 0
  },
  successText: {
    color: colors.success,
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 19
  },
  errorText: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 19
  },
  steps: {
    gap: 8
  },
  stepText: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 19
  },
  footerActions: {
    gap: 10
  },
  historyButton: {
    minHeight: 48,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border
  },
  historyButtonText: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: "800"
  }
});
