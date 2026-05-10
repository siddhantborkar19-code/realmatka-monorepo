import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, AppState, AppStateStatus, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import RazorpayCheckout from "react-native-razorpay";
import { AppScreen, BackHeader, SurfaceCard } from "@/components/ui";
import { api, formatApiError, type PaymentOrder } from "@/lib/api";
import { useAppState } from "@/lib/app-state";
import { getAddFundUnsupportedMessage, isSupportedAddFundPlatform } from "@/lib/payment-platform";
import { buildGenericUpiUrl, isSafeUpiId } from "@/lib/payment-processor";
import { colors } from "@/theme/colors";

const MIN_DEPOSIT_AMOUNT = 100;
const PAYMENT_STATUS_REFRESH_MS = 10_000;
const PAYMENT_RETURN_RETRY_ATTEMPTS = 3;
const PAYMENT_RETURN_RETRY_DELAY_MS = 3_000;
const DIRECT_UPI_TEST_VPA = String(Constants.expoConfig?.extra?.directUpiTestVpa || "").trim();

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
  const [submitting, setSubmitting] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [pendingOrder, setPendingOrder] = useState<PaymentOrder | null>(null);
  const awaitingCheckoutReturnRef = useRef(false);

  const numericAmount = Number(amount || 0);
  const hasValidAmount = Number.isFinite(numericAmount) && numericAmount >= MIN_DEPOSIT_AMOUNT;
  const isMultipleOfHundred = Number.isFinite(numericAmount) && numericAmount % 100 === 0;
  const displayStatus = useMemo(() => pendingOrder?.remoteStatus || pendingOrder?.status || "", [pendingOrder]);
  const directUpiTestEnabled = isSafeUpiId(DIRECT_UPI_TEST_VPA);

  const pollPaymentStatus = useCallback(
    async (referenceId: string, { silent = false } = {}) => {
      if (!sessionToken) {
        return null;
      }

      try {
        if (!silent) {
          setCheckingStatus(true);
        }
        const next = await api.getPaymentOrderStatus(sessionToken, referenceId);
        setPendingOrder(next);

        const normalized = String(next.remoteStatus || next.status || "")
          .trim()
          .toUpperCase();

        if (normalized === "SUCCESS" || normalized === "PAID") {
          await reloadSessionData({ force: true });
          await Promise.allSettled([
            loadWalletHistory({ force: true }),
            loadBidHistory({ force: true })
          ]);
          setSuccessMessage(`Deposit successful. Reference ${next.reference} wallet history me aa gaya hai.`);
          router.replace({
            pathname: "/wallet/history",
            params: { payment: "success", reference: next.reference }
          } as never);
        } else if (normalized === "FAILED" || normalized === "CANCELLED" || normalized === "EXPIRED") {
          setError(`Payment ${normalized.toLowerCase()} ho gaya. Zarurat ho to dobara try karo.`);
          router.replace({
            pathname: "/wallet/history",
            params: {
              payment: "failed",
              reference: next.reference,
              status: normalized.toLowerCase(),
              amount: String(next.amount ?? "")
            }
          } as never);
        }

        return next;
      } catch (statusError) {
        setError(formatApiError(statusError, "Payment status check nahi hua."));
        return null;
      } finally {
        if (!silent) {
          setCheckingStatus(false);
        }
      }
    },
    [loadBidHistory, loadWalletHistory, reloadSessionData, sessionToken]
  );

  const markReturnedPaymentAsIncomplete = useCallback(
    (order: PaymentOrder | null) => {
      if (!order?.reference) {
        return;
      }

      setError("Payment complete nahi hua. Wrong PIN ya insufficient balance ho to dobara try karo.");
      router.replace({
        pathname: "/wallet/history",
        params: {
          payment: "failed",
          reference: order.reference,
          status: "not_completed",
          amount: String(order.amount ?? "")
        }
      } as never);
    },
    []
  );

  const resolveReturnedPaymentStatus = useCallback(
    async (referenceId: string) => {
      let latest: PaymentOrder | null = null;

      for (let attempt = 0; attempt < PAYMENT_RETURN_RETRY_ATTEMPTS; attempt += 1) {
        latest = await pollPaymentStatus(referenceId, { silent: true });
        const normalized = String(latest?.remoteStatus || latest?.status || "")
          .trim()
          .toUpperCase();

        if (normalized === "SUCCESS" || normalized === "PAID" || normalized === "FAILED" || normalized === "CANCELLED" || normalized === "EXPIRED") {
          return;
        }

        if (attempt < PAYMENT_RETURN_RETRY_ATTEMPTS - 1) {
          await new Promise((resolve) => setTimeout(resolve, PAYMENT_RETURN_RETRY_DELAY_MS));
        }
      }

      markReturnedPaymentAsIncomplete(latest ?? pendingOrder);
    },
    [markReturnedPaymentAsIncomplete, pendingOrder, pollPaymentStatus]
  );

  useFocusEffect(
    useCallback(() => {
      if (!pendingOrder?.reference || submitting) {
        return;
      }

      let active = true;
      void pollPaymentStatus(pendingOrder.reference, { silent: true });

      const interval = setInterval(() => {
        if (active) {
          void pollPaymentStatus(pendingOrder.reference, { silent: true });
        }
      }, PAYMENT_STATUS_REFRESH_MS);

      return () => {
        active = false;
        clearInterval(interval);
      };
    }, [pendingOrder?.reference, pollPaymentStatus, submitting])
  );

  useEffect(() => {
    if (!pendingOrder?.reference) {
      return;
    }

    const handleAppState = (nextState: AppStateStatus) => {
      if (submitting) {
        return;
      }
      if (nextState === "active") {
        if (awaitingCheckoutReturnRef.current) {
          awaitingCheckoutReturnRef.current = false;
          void resolveReturnedPaymentStatus(pendingOrder.reference);
          return;
        }
        void pollPaymentStatus(pendingOrder.reference, { silent: true });
      }
    };

    const subscription = AppState.addEventListener("change", handleAppState);
    return () => {
      subscription.remove();
    };
  }, [pendingOrder?.reference, pollPaymentStatus, resolveReturnedPaymentStatus, submitting]);

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

        {pendingOrder ? (
            <SurfaceCard style={styles.statusCard}>
              <View style={styles.statusHeader}>
                <Text style={styles.sectionTitle}>Pending Payment</Text>
                <Text style={[styles.statusBadge, statusTone(displayStatus)]}>{displayStatus || "PENDING"}</Text>
              </View>
              <View style={styles.statusMeta}>
                <Text style={styles.statusLine}>Reference: {pendingOrder.reference}</Text>
                <Text style={styles.statusLine}>Amount: Rs {pendingOrder.amount.toFixed(2)}</Text>
                <Text style={styles.statusHint}>Payment complete karke app me wapas aao. Status auto verify ho jayega.</Text>
              </View>
            {Platform.OS === "web" && pendingOrder.redirectUrl ? (
              <View style={styles.statusActions}>
                <Pressable
                  onPress={() => {
                    void Linking.openURL(pendingOrder.redirectUrl as string).catch(() => {
                      setError("Checkout link browser me open nahi hua.");
                    });
                  }}
                  style={[styles.primaryButton, checkingStatus && styles.disabledButton]}
                >
                  {checkingStatus ? <ActivityIndicator color={colors.surface} size="small" /> : <Text style={styles.primaryButtonText}>Open Checkout</Text>}
                </Pressable>
              </View>
            ) : null}
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
            <Text style={styles.stepText}>1. Amount enter karo aur checkout start karo.</Text>
            <Text style={styles.stepText}>2. Razorpay/UPI app me payment complete karo.</Text>
            <Text style={styles.stepText}>3. App me wapas aate hi status automatically verify ho jayega.</Text>
          </View>
        </SurfaceCard>

        <View style={styles.footerActions}>
          <Pressable
            disabled={!hasValidAmount || !isMultipleOfHundred || submitting || !sessionToken}
            onPress={() => void startDeposit()}
            style={[styles.primaryButton, (!hasValidAmount || !isMultipleOfHundred || submitting || !sessionToken) && styles.disabledButton]}
          >
            {submitting ? <ActivityIndicator color={colors.surface} size="small" /> : <Text style={styles.primaryButtonText}>Pay Now</Text>}
          </Pressable>

          {directUpiTestEnabled ? (
            <>
              <Pressable
                disabled={!hasValidAmount || !isMultipleOfHundred}
                onPress={() => void startDirectUpiTest()}
                style={[styles.directUpiButton, (!hasValidAmount || !isMultipleOfHundred) && styles.disabledOutlineButton]}
              >
                <Text style={styles.directUpiButtonText}>Test Direct UPI ID</Text>
              </Pressable>
              <Text style={styles.directUpiHint}>Testing only. Isse wallet auto-credit nahi hoga.</Text>
            </>
          ) : null}

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
    if (!isMultipleOfHundred) {
      setError("Deposit amount Rs 100 ke multiple me hona chahiye.");
      return;
    }
      try {
        setSubmitting(true);
      setError("");
      setSuccessMessage("");

      const order = await api.createPaymentOrder(sessionToken, numericAmount, Platform.OS === "web" ? "web" : "native");
      setPendingOrder(order);

      if (Platform.OS !== "web" && order.checkoutMode === "native") {
        await openNativeRazorpayCheckout(order);
        return;
      }

      if (!order.redirectUrl) {
        throw new Error("Checkout link unavailable.");
      }

      awaitingCheckoutReturnRef.current = true;
      await Linking.openURL(order.redirectUrl);
    } catch (startError) {
      awaitingCheckoutReturnRef.current = false;
      setError(formatApiError(startError, "Payment start nahi hua."));
    } finally {
      setSubmitting(false);
    }
  }

  async function openNativeRazorpayCheckout(order: PaymentOrder) {
    const key = String(order.keyId || "").trim();
    const orderId = String(order.gatewayOrderId || "").trim();
    if (!key || !orderId) {
      throw new Error("Native checkout details unavailable.");
    }

    let checkoutResult: {
      razorpay_payment_id: string;
      razorpay_order_id: string;
      razorpay_signature: string;
    };

    try {
      checkoutResult = await RazorpayCheckout.open({
        key,
        amount: Math.round(Number(order.amount || 0) * 100),
        currency: "INR",
        name: order.displayName || "Real Matka",
        description: order.description || "Wallet Top Up",
        order_id: orderId,
        prefill: {
          contact: currentUser?.phone ? `+91${currentUser.phone}` : undefined,
          name: currentUser?.name || undefined
        },
        notes: {
          reference: order.reference,
          payment_order_id: order.id
        },
        theme: {
          color: colors.primary
        }
      });
    } catch {
      setError("Payment complete nahi hua. Wrong PIN, insufficient balance, ya cancel hua ho to dobara try karo.");
      await pollPaymentStatus(order.reference, { silent: true });
      router.replace({
        pathname: "/wallet/history",
        params: {
          payment: "failed",
          reference: order.reference,
          status: "not_completed",
          amount: String(order.amount ?? "")
        }
      } as never);
      return;
    }

    try {
      const confirmed = await api.confirmPaymentOrder(sessionToken, order.reference, {
        razorpayPaymentId: checkoutResult.razorpay_payment_id,
        razorpayOrderId: checkoutResult.razorpay_order_id,
        razorpaySignature: checkoutResult.razorpay_signature
      });

      setPendingOrder(confirmed);
      await reloadSessionData({ force: true });
      await Promise.allSettled([
        loadWalletHistory({ force: true }),
        loadBidHistory({ force: true })
      ]);
      setSuccessMessage(`Deposit successful. Reference ${confirmed.reference} wallet history me aa gaya hai.`);
      router.replace({
        pathname: "/wallet/history",
        params: { payment: "success", reference: confirmed.reference }
      } as never);
    } catch (confirmError) {
      setError(formatApiError(confirmError, "Payment hua ho sakta hai, lekin verify nahi hua. Status check ho raha hai."));
      await pollPaymentStatus(order.reference);
    }
  }

  async function startDirectUpiTest() {
    if (!Number.isFinite(numericAmount) || numericAmount < MIN_DEPOSIT_AMOUNT) {
      setError(`Minimum deposit is Rs ${MIN_DEPOSIT_AMOUNT}.`);
      return;
    }
    if (!isMultipleOfHundred) {
      setError("Deposit amount Rs 100 ke multiple me hona chahiye.");
      return;
    }

    const referenceId = pendingOrder?.reference || `RMTEST${Date.now().toString().slice(-10)}`;
    const launchUrl = buildGenericUpiUrl({
      amount: numericAmount,
      upiId: DIRECT_UPI_TEST_VPA,
      referenceId,
      payerLabel: "Real Matka",
      note: `Real Matka test ${referenceId}`
    });

    try {
      setError("");
      await Linking.openURL(launchUrl);
    } catch {
      setError("Direct UPI app open nahi hua. UPI app install hai ya nahi check karo.");
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
    gap: 10
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
  },
  directUpiButton: {
    minHeight: 50,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.primary,
    paddingHorizontal: 16
  },
  disabledOutlineButton: {
    opacity: 0.45
  },
  directUpiButtonText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: "900"
  },
  directUpiHint: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 17,
    textAlign: "center",
    marginTop: -2
  }
});
