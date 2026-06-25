import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, AppState, Linking, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import QRCode from "qrcode-terminal/vendor/QRCode";
import QRErrorCorrectLevel from "qrcode-terminal/vendor/QRCode/QRErrorCorrectLevel";
import { AppScreen, BackHeader, SurfaceCard } from "@/components/ui";
import { api, formatApiError, type DepositConfig, type PaymentOrder, type WalletEntry } from "@/lib/api";
import { useAppState } from "@/lib/app-state";
import { readWalletBoolean, readWalletText, useWalletRemoteSettings } from "@/lib/wallet-remote-config";
import { colors } from "@/theme/colors";

const MIN_DEPOSIT_AMOUNT = 200;
const DEPOSIT_AMOUNT_MULTIPLE = 100;
const PAYMENT_VERIFICATION_TIMEOUT_SECONDS = 15 * 60;
const PAYMENT_STATUS_POLL_INTERVAL_MS = 5000;
const DEFAULT_DEPOSIT_CONFIG: DepositConfig = {
  version: 1,
  enabled: true,
  mode: "manual_qr",
  minAmount: MIN_DEPOSIT_AMOUNT,
  upiId: (process.env.EXPO_PUBLIC_DIRECT_UPI_ID || "s7568539842258141@slc").trim(),
  upiName: (process.env.EXPO_PUBLIC_DIRECT_UPI_NAME || "NovaByte Technologies").trim(),
  whatsappNumber: (process.env.EXPO_PUBLIC_PAYMENT_WHATSAPP_PHONE || "8446012081").replace(/\D/g, ""),
  razorpayPlatform: "web",
  title: "Add Fund",
  message: "Payment gateway abhi hold par hai. Amount enter karke QR generate karein, payment complete karein, aur screenshot WhatsApp par bhejein.",
  maintenanceTitle: "Deposit temporarily manual",
  maintenanceMessage: "Technical update ke kaaran deposit flow temporarily manual hai. Kripya latest APK use karein.",
  updatedAt: ""
};

function buildUpiUrl(amount: number | null, config: DepositConfig) {
  const params = new URLSearchParams({
    pa: config.upiId,
    pn: config.upiName || "NovaByte Technologies",
    mc: "0000",
    cu: "INR"
  });

  if (amount && Number.isFinite(amount) && amount >= config.minAmount) {
    params.set("am", amount.toFixed(2));
  }

  return `upi://pay?${params.toString()}`;
}

function createManualDepositReference() {
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `RM${Date.now()}${random}`;
}

function buildQrMatrix(value: string) {
  const qr = new QRCode(-1, QRErrorCorrectLevel.M);
  qr.addData(value);
  qr.make();

  const count = qr.getModuleCount();
  return Array.from({ length: count }, (_, row) =>
    Array.from({ length: count }, (_, col) => qr.isDark(row, col))
  );
}

export default function AddFundScreen() {
  const walletSettings = useWalletRemoteSettings();
  const { currentUser, sessionToken, walletBalance, reloadSessionData, loadWalletHistory } = useAppState();
  const [depositConfig, setDepositConfig] = useState<DepositConfig>(DEFAULT_DEPOSIT_CONFIG);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [amount, setAmount] = useState("");
  const [generatedAmount, setGeneratedAmount] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [checkingPayment, setCheckingPayment] = useState(false);
  const [pendingGatewayOrder, setPendingGatewayOrder] = useState<PaymentOrder | null>(null);
  const [pendingManualDeposit, setPendingManualDeposit] = useState<WalletEntry | null>(null);
  const [paymentVerificationEndsAt, setPaymentVerificationEndsAt] = useState<number | null>(null);
  const [paymentVerificationSecondsLeft, setPaymentVerificationSecondsLeft] = useState(0);
  const statusCheckInFlightRef = useRef(false);

  const numericAmount = Number(amount || 0);
  const minAmount = Math.max(MIN_DEPOSIT_AMOUNT, Number(depositConfig.minAmount || MIN_DEPOSIT_AMOUNT));
  const isValidDepositMultiple = Number.isInteger(numericAmount / DEPOSIT_AMOUNT_MULTIPLE);
  const hasValidAmount = Number.isFinite(numericAmount) && numericAmount >= minAmount && isValidDepositMultiple;
  const hasGeneratedQr = generatedAmount !== null;
  const isManualMode = depositConfig.enabled && (depositConfig.mode === "manual_qr" || depositConfig.mode === "upi_intent");
  const isRazorpayMode = depositConfig.enabled && (depositConfig.mode === "razorpay" || depositConfig.mode === "cashfree");
  const isMaintenanceMode = !depositConfig.enabled || depositConfig.mode === "maintenance";
  const addFundTitle = readWalletText(walletSettings, "wallet_add_fund_title", "Add Fund");
  const amountLabel = readWalletText(walletSettings, "wallet_add_fund_amount_label", "Deposit Amount");
  const payButtonLabel = isManualMode ? "Generate QR" : readWalletText(walletSettings, "wallet_add_fund_button_label", "Pay Now");
  const historyVisible = readWalletBoolean(walletSettings, "wallet_add_fund_history_visible", true);
  const historyLabel = readWalletText(walletSettings, "wallet_add_fund_history_label", "View Wallet History");
  const howItWorksVisible = readWalletBoolean(walletSettings, "wallet_add_fund_how_it_works_visible", true);
  const manualQrVisible = isManualMode ? true : readWalletBoolean(walletSettings, "wallet_add_fund_manual_qr_visible", true);
  const whatsappVisible = readWalletBoolean(walletSettings, "wallet_add_fund_whatsapp_visible", true);
  const upiUrl = useMemo(() => buildUpiUrl(generatedAmount, depositConfig), [depositConfig, generatedAmount]);
  const qrMatrix = useMemo(() => buildQrMatrix(upiUrl), [upiUrl]);
  const moduleSize = Math.max(3, Math.floor(232 / qrMatrix.length));
  const qrSize = qrMatrix.length * moduleSize;
  const isGatewayVerificationActive = Boolean(pendingGatewayOrder?.reference && paymentVerificationEndsAt);

  useEffect(() => {
    let active = true;
    async function loadDepositConfig() {
      try {
        setLoadingConfig(true);
        const nextConfig = await api.getDepositConfig();
        if (active) {
          const resolvedConfig = { ...DEFAULT_DEPOSIT_CONFIG, ...nextConfig };
          if (resolvedConfig.mode === "cashfree" || resolvedConfig.mode === "razorpay") {
            resolvedConfig.mode = "manual_qr";
          }
          setDepositConfig(resolvedConfig);
        }
      } catch (configError) {
        if (active) {
          // If the backend has not been redeployed yet, keep Add Fund usable with the built-in manual QR fallback.
          setDepositConfig(DEFAULT_DEPOSIT_CONFIG);
          setError("");
        }
      } finally {
        if (active) {
          setLoadingConfig(false);
        }
      }
    }

    void loadDepositConfig();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!pendingGatewayOrder?.reference || !sessionToken) {
      return;
    }

    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        void checkGatewayPaymentStatus(false);
      }
    });

    return () => {
      subscription.remove();
    };
  }, [pendingGatewayOrder?.reference, sessionToken]);

  useEffect(() => {
    if (!pendingGatewayOrder?.reference || !sessionToken || !paymentVerificationEndsAt) {
      return;
    }

    const updateCountdown = () => {
      const secondsLeft = Math.max(0, Math.ceil((paymentVerificationEndsAt - Date.now()) / 1000));
      setPaymentVerificationSecondsLeft(secondsLeft);
      if (secondsLeft <= 0) {
        setPendingGatewayOrder(null);
        setPaymentVerificationEndsAt(null);
        setError("Payment verification time out ho gaya. Agar amount debit hua hai to wallet history check karo ya support se contact karo.");
      }
    };

    updateCountdown();
    const countdownTimer = setInterval(updateCountdown, 1000);
    const statusTimer = setInterval(() => {
      if (Date.now() < paymentVerificationEndsAt) {
        void checkGatewayPaymentStatus(false);
      }
    }, PAYMENT_STATUS_POLL_INTERVAL_MS);

    return () => {
      clearInterval(countdownTimer);
      clearInterval(statusTimer);
    };
  }, [pendingGatewayOrder?.reference, paymentVerificationEndsAt, sessionToken]);

  return (
    <View style={styles.page}>
      <BackHeader title={addFundTitle} subtitle={undefined} />
      <AppScreen showPromo={false}>
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
          <Text style={styles.sectionTitle}>{amountLabel}</Text>
          <View style={styles.inputRow}>
            <Text style={styles.currencyPrefix}>Rs</Text>
            <TextInput
              keyboardType="numeric"
              onChangeText={(value) => {
                setAmount(value.replace(/[^0-9]/g, ""));
                setGeneratedAmount(null);
                setPendingManualDeposit(null);
                setMessage("");
              }}
              placeholder={`Enter amount min ${minAmount}`}
              placeholderTextColor={colors.textMuted}
              style={styles.amountInput}
              value={amount}
            />
          </View>
          {amount && numericAmount < minAmount ? <Text style={styles.errorText}>Minimum deposit Rs {minAmount} hai.</Text> : null}
          {amount && numericAmount >= minAmount && !isValidDepositMultiple ? (
            <Text style={styles.errorText}>Deposit amount Rs {DEPOSIT_AMOUNT_MULTIPLE} ke multiple me hona chahiye, jaise 200, 300, 400.</Text>
          ) : null}
          {loadingConfig ? (
            <View style={styles.configLoadingRow}>
              <ActivityIndicator color={colors.primary} size="small" />
              <Text style={styles.configLoadingText}>Deposit settings load ho rahi hain...</Text>
            </View>
          ) : null}
          {!loadingConfig && isManualMode ? (
            <Pressable
              disabled={!hasValidAmount || submitting || !sessionToken}
              onPress={() => void generateManualQr()}
              style={[styles.generateButton, (!hasValidAmount || submitting || !sessionToken) && styles.disabledButton]}
            >
              {submitting ? <ActivityIndicator color={colors.surface} size="small" /> : <Ionicons color={colors.surface} name="qr-code-outline" size={18} />}
              <Text style={styles.generateButtonText}>{payButtonLabel}</Text>
            </Pressable>
          ) : null}
          {!loadingConfig && isRazorpayMode ? (
            <Pressable
              disabled={!hasValidAmount || submitting || checkingPayment || isGatewayVerificationActive || !sessionToken}
              onPress={() => void startGatewayPayment()}
              style={[styles.generateButton, (!hasValidAmount || submitting || checkingPayment || isGatewayVerificationActive || !sessionToken) && styles.disabledButton]}
            >
              {submitting || checkingPayment || isGatewayVerificationActive ? <ActivityIndicator color={colors.surface} size="small" /> : <Ionicons color={colors.surface} name="card-outline" size={18} />}
              <Text style={styles.generateButtonText}>{payButtonLabel}</Text>
            </Pressable>
          ) : null}
        </SurfaceCard>

        {isGatewayVerificationActive ? (
          <SurfaceCard style={styles.gatewayStatusCard}>
            <View style={styles.verificationHeader}>
              <ActivityIndicator color={colors.primary} size="small" />
              <Text style={styles.verificationTitle}>Payment verification chal rahi hai</Text>
            </View>
            <Text style={styles.statusLine}>Payment complete hone ke baad wallet automatic update hoga. App open rakho ya payment ke baad wapas aao.</Text>
            <Text style={styles.verificationMetaText}>Reference: {pendingGatewayOrder?.reference}</Text>
            <Text style={styles.verificationMetaText}>Time left: {formatCountdown(paymentVerificationSecondsLeft)}</Text>
          </SurfaceCard>
        ) : null}

        {!loadingConfig && isMaintenanceMode ? (
          <SurfaceCard style={styles.placeholderCard}>
            <Ionicons color={colors.warning} name="alert-circle-outline" size={34} />
            <Text style={styles.placeholderTitle}>{depositConfig.maintenanceTitle}</Text>
            <Text style={styles.placeholderText}>{depositConfig.maintenanceMessage}</Text>
          </SurfaceCard>
        ) : null}

        {!loadingConfig && isManualMode && manualQrVisible && hasGeneratedQr ? (
          <SurfaceCard style={styles.qrCard}>
            <View style={styles.qrHeader}>
              <View>
                <Text style={styles.sectionTitle}>Scan QR & Pay</Text>
                <Text style={styles.qrSubText}>Rs {generatedAmount} ka QR generated hai.</Text>
              </View>
              <View style={styles.manualBadge}>
                <Text style={styles.manualBadgeText}>Manual</Text>
              </View>
            </View>

            <View style={styles.amountPill}>
              <Text style={styles.amountPillLabel}>Pay Amount</Text>
              <Text style={styles.amountPillValue}>Rs {generatedAmount}</Text>
            </View>
            {pendingManualDeposit?.referenceId ? (
              <View style={styles.referenceBox}>
                <Text style={styles.upiLabel}>Deposit Reference</Text>
                <Text selectable style={styles.referenceValue}>
                  {pendingManualDeposit.referenceId}
                </Text>
              </View>
            ) : null}

            <View style={styles.qrFrame}>
              <View style={[styles.qrGrid, { height: qrSize, width: qrSize }]}>
                {qrMatrix.map((row, rowIndex) => (
                  <View key={`row-${rowIndex}`} style={styles.qrRow}>
                    {row.map((dark, colIndex) => (
                      <View
                        key={`cell-${rowIndex}-${colIndex}`}
                        style={[
                          styles.qrCell,
                          {
                            backgroundColor: dark ? "#000000" : "#ffffff",
                            height: moduleSize,
                            width: moduleSize
                          }
                        ]}
                      />
                    ))}
                  </View>
                ))}
              </View>
            </View>

            <View style={styles.upiInfo}>
              <Text style={styles.upiLabel}>UPI ID</Text>
              <Text selectable style={styles.upiValue}>
                {depositConfig.upiId}
              </Text>
            </View>
            <Text style={styles.qrHint}>QR scan karke payment complete karo. Payment ke baad screenshot lo, phir WhatsApp par proof bhejo. Admin verify karke wallet credit karega.</Text>
          </SurfaceCard>
        ) : !loadingConfig && isManualMode && manualQrVisible ? (
          <SurfaceCard style={styles.placeholderCard}>
            <Ionicons color={colors.textMuted} name="qr-code-outline" size={34} />
            <Text style={styles.placeholderTitle}>QR abhi generate nahi hua</Text>
            <Text style={styles.placeholderText}>Amount enter karke Generate QR dabao. Uske baad QR scan karke payment karo aur payment screenshot WhatsApp par bhejna.</Text>
          </SurfaceCard>
        ) : null}

        {message && !isRazorpayMode ? (
          <SurfaceCard style={styles.messageCard}>
            <Text style={styles.successText}>{message}</Text>
          </SurfaceCard>
        ) : null}

        {error ? (
          <SurfaceCard style={styles.messageCard}>
            <Text style={styles.errorText}>{error}</Text>
          </SurfaceCard>
        ) : null}

        {!isRazorpayMode && howItWorksVisible ? <SurfaceCard>
          <Text style={styles.sectionTitle}>How It Works</Text>
          <View style={styles.steps}>
            <Text style={styles.stepText}>1. Amount enter karo.</Text>
            <Text style={styles.stepText}>2. Generate QR dabao.</Text>
            <Text style={styles.stepText}>3. QR scan karke UPI app se payment complete karo.</Text>
            <Text style={styles.stepText}>4. WhatsApp par payment screenshot bhejo.</Text>
            <Text style={styles.stepText}>5. Admin verify karke wallet balance add karega.</Text>
          </View>
        </SurfaceCard> : null}

        <View style={styles.footerActions}>
          {isManualMode && whatsappVisible ? (
            <Pressable
              disabled={!hasGeneratedQr}
              onPress={() => void sendWhatsAppProof()}
              style={[styles.whatsappButton, !hasGeneratedQr && styles.disabledButton]}
            >
              <Ionicons color={colors.surface} name="logo-whatsapp" size={19} />
              <Text style={styles.whatsappButtonText}>Send WhatsApp Proof</Text>
            </Pressable>
          ) : null}

          {historyVisible ? (
            <Pressable onPress={() => router.push("/wallet/history")} style={styles.historyButton}>
              <Text style={styles.historyButtonText}>{historyLabel}</Text>
            </Pressable>
          ) : null}
        </View>
      </AppScreen>
    </View>
  );

  async function sendWhatsAppProof() {
    if (!generatedAmount) {
      setMessage("Pehle amount enter karke QR generate karo.");
      return;
    }

    const userLine = currentUser
      ? `User: ${currentUser.name || "User"}${currentUser.phone ? ` (${currentUser.phone})` : ""}`
      : "User: App user";
    const text = [
      "Wallet deposit payment proof",
      `Amount: Rs ${generatedAmount}`,
      pendingManualDeposit?.referenceId ? `Reference: ${pendingManualDeposit.referenceId}` : "",
      `UPI ID: ${depositConfig.upiId}`,
      userLine,
      "",
      "Payment screenshot attached. Please verify and credit my wallet."
    ]
      .filter(Boolean)
      .join("\n");
    const cleanPhone = String(depositConfig.whatsappNumber || DEFAULT_DEPOSIT_CONFIG.whatsappNumber).replace(/\D/g, "");
    const phone = cleanPhone.startsWith("91") ? cleanPhone : `91${cleanPhone}`;
    const whatsappUrl = `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;

    try {
      await Linking.openURL(whatsappUrl);
      setMessage("WhatsApp open ho gaya. Ab payment screenshot attach karke send karo.");
    } catch {
      setMessage("WhatsApp open nahi hua. Screenshot manually WhatsApp par bhejo.");
    }
  }

  async function generateManualQr() {
    if (!sessionToken) {
      setError("Login required");
      return;
    }
    if (!hasValidAmount) {
      setError(`Deposit amount Rs ${minAmount} se kam nahi hona chahiye aur Rs ${DEPOSIT_AMOUNT_MULTIPLE} ke multiple me hona chahiye.`);
      return;
    }

    try {
      setSubmitting(true);
      setError("");
      setMessage("");
      setPendingManualDeposit(null);
      const referenceId = createManualDepositReference();
      let entry: WalletEntry;
      try {
        entry = await api.startUpiDeposit(sessionToken, numericAmount, "Manual QR Deposit", referenceId);
      } catch {
        entry = await api.deposit(sessionToken, numericAmount, referenceId, "", "Manual QR deposit request");
      }
      setPendingManualDeposit(entry);
      setGeneratedAmount(numericAmount);
      setMessage(`Rs ${numericAmount} ka deposit request admin panel me create ho gaya. Reference ${entry.referenceId || referenceId}. Ab QR scan karke payment karo aur screenshot WhatsApp par bhejo.`);
      await loadWalletHistory({ force: true });
    } catch (manualError) {
      setGeneratedAmount(null);
      setPendingManualDeposit(null);
      setError(formatApiError(manualError, "Deposit request create nahi hua."));
    } finally {
      setSubmitting(false);
    }
  }

  async function startGatewayPayment() {
    if (!sessionToken) {
      setError("Login required");
      return;
    }
    if (!hasValidAmount) {
      setError(`Deposit amount Rs ${minAmount} se kam nahi hona chahiye aur Rs ${DEPOSIT_AMOUNT_MULTIPLE} ke multiple me hona chahiye.`);
      return;
    }

    try {
      setSubmitting(true);
      setError("");
      setMessage("");
      const order = await api.createPaymentOrder(sessionToken, numericAmount, depositConfig.razorpayPlatform || "web");
      if (!order.redirectUrl) {
        setError("Payment link create nahi hua. Thodi der baad retry karo.");
        return;
      }
      setPendingGatewayOrder(order);
      setPaymentVerificationEndsAt(Date.now() + PAYMENT_VERIFICATION_TIMEOUT_SECONDS * 1000);
      setPaymentVerificationSecondsLeft(PAYMENT_VERIFICATION_TIMEOUT_SECONDS);
      await Linking.openURL(order.redirectUrl);
    } catch (paymentError) {
      setError(formatApiError(paymentError, "Payment start nahi hua."));
    } finally {
      setSubmitting(false);
    }
  }

  async function checkGatewayPaymentStatus(showPendingMessage: boolean) {
    if (!sessionToken || !pendingGatewayOrder?.reference) {
      return;
    }
    if (statusCheckInFlightRef.current) {
      return;
    }

    try {
      statusCheckInFlightRef.current = true;
      setCheckingPayment(true);
      setError("");
      const next = await api.getPaymentOrderStatus(sessionToken, pendingGatewayOrder.reference);
      setPendingGatewayOrder(next);
      const normalized = String(next.remoteStatus || next.status || "")
        .trim()
        .toUpperCase();

      if (normalized === "SUCCESS" || normalized === "PAID") {
        setPaymentVerificationEndsAt(null);
        setPaymentVerificationSecondsLeft(0);
        await reloadSessionData({ force: true });
        await loadWalletHistory({ force: true });
        router.replace({
          pathname: "/wallet/history",
          params: { payment: "success", reference: next.reference, amount: String(next.amount) }
        } as never);
        return;
      }

      if (normalized === "FAILED" || normalized === "CANCELLED" || normalized === "EXPIRED") {
        setPendingGatewayOrder(null);
        setPaymentVerificationEndsAt(null);
        setPaymentVerificationSecondsLeft(0);
        setError(`Payment ${normalized.toLowerCase()} ho gaya. Dobara try karo.`);
        return;
      }

      if (showPendingMessage) {
        setMessage("");
      }
    } catch (statusError) {
      setError(formatApiError(statusError, "Payment status check nahi hua."));
    } finally {
      statusCheckInFlightRef.current = false;
      setCheckingPayment(false);
    }
  }
}

function formatCountdown(totalSeconds: number) {
  const safeSeconds = Math.max(0, totalSeconds);
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
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
  generateButton: {
    minHeight: 50,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    backgroundColor: colors.primary,
    paddingHorizontal: 16,
    marginTop: 12
  },
  generateButtonText: {
    color: colors.surface,
    fontSize: 14,
    fontWeight: "900"
  },
  configLoadingRow: {
    minHeight: 48,
    borderRadius: 16,
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: 14,
    marginTop: 12
  },
  configLoadingText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: "800"
  },
  qrCard: {
    alignItems: "stretch"
  },
  qrHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12
  },
  qrSubText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "700",
    marginTop: 4
  },
  manualBadge: {
    borderRadius: 999,
    backgroundColor: colors.accentSoft,
    paddingHorizontal: 12,
    paddingVertical: 6
  },
  manualBadgeText: {
    color: colors.accentDark,
    fontSize: 11,
    fontWeight: "900"
  },
  amountPill: {
    alignSelf: "center",
    alignItems: "center",
    borderRadius: 18,
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 22,
    paddingVertical: 10
  },
  amountPillLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase"
  },
  amountPillValue: {
    color: colors.primaryDark,
    fontSize: 24,
    fontWeight: "900"
  },
  referenceBox: {
    alignSelf: "stretch",
    alignItems: "center",
    borderRadius: 16,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: 14,
    paddingVertical: 10
  },
  referenceValue: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: "900",
    marginTop: 2
  },
  qrFrame: {
    alignSelf: "center",
    borderRadius: 28,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    padding: 18,
    marginTop: 4
  },
  qrGrid: {
    backgroundColor: "#ffffff"
  },
  qrRow: {
    flexDirection: "row"
  },
  qrCell: {
    flexShrink: 0
  },
  upiInfo: {
    alignItems: "center",
    gap: 4
  },
  upiLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "800"
  },
  upiValue: {
    color: colors.textPrimary,
    fontSize: 17,
    fontWeight: "900"
  },
  qrHint: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 20,
    textAlign: "center"
  },
  placeholderCard: {
    alignItems: "center",
    paddingVertical: 26
  },
  placeholderTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: "900"
  },
  placeholderText: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 20,
    textAlign: "center"
  },
  messageCard: {
    gap: 0
  },
  gatewayStatusCard: {
    gap: 10
  },
  verificationHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  verificationTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: "900"
  },
  verificationMetaText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "800"
  },
  statusLine: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: "700"
  },
  secondaryActionButton: {
    minHeight: 48,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    paddingHorizontal: 16
  },
  secondaryActionText: {
    color: colors.primaryDark,
    fontSize: 14,
    fontWeight: "900"
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
    lineHeight: 19,
    marginTop: 6
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
  whatsappButton: {
    minHeight: 52,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    backgroundColor: "#16a34a",
    paddingHorizontal: 16
  },
  whatsappButtonText: {
    color: colors.surface,
    fontSize: 14,
    fontWeight: "900"
  },
  disabledButton: {
    opacity: 0.6
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
