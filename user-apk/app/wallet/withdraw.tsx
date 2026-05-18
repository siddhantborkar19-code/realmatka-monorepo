import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PinVerificationModal } from "@/components/pin-verification-modal";
import { useAppState } from "@/lib/app-state";
import { formatApiError } from "@/lib/api";
import { readWalletBoolean, readWalletNumber, readWalletText, useWalletRemoteSettings } from "@/lib/wallet-remote-config";
import { colors } from "@/theme/colors";

const MIN_WITHDRAW_AMOUNT = 500;
const MAX_WITHDRAW_AMOUNT = 99999;
const WITHDRAW_MULTIPLE = 100;
const WEEKEND_WITHDRAW_CLOSED_MESSAGE = "Saturday aur Sunday ko withdraw service band rahegi.";
const TIME_WITHDRAW_CLOSED_MESSAGE = "Withdraw request timing 11:00 AM se 11:00 PM tak hi available hai.";

function getIndiaWeekday(date = new Date()) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    weekday: "long"
  }).format(date);
}

function getIndiaMinutes(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);
  return hour * 60 + minute;
}

function parseTimeToMinutes(value: string, fallback: number) {
  const match = String(value || "").trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  if (!match) {
    return fallback;
  }
  let hour = Number(match[1]);
  const minute = Number(match[2] ?? 0);
  const meridiem = String(match[3] || "").toUpperCase();
  if (!Number.isFinite(hour) || !Number.isFinite(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return fallback;
  }
  if (meridiem === "PM" && hour < 12) hour += 12;
  if (meridiem === "AM" && hour === 12) hour = 0;
  return hour * 60 + minute;
}

export default function WithdrawScreen() {
  const insets = useSafeAreaInsets();
  const walletSettings = useWalletRemoteSettings();
  const { currentUser, walletBalance, confirmWithdraw, bankAccounts, walletEntries, loadBankAccounts, loadWalletHistory } = useAppState();
  const latestBank = useMemo(() => bankAccounts[0] ?? null, [bankAccounts]);
  const pendingWithdraw = useMemo(
    () => walletEntries.find((entry) => entry.type === "WITHDRAW" && (entry.status === "INITIATED" || entry.status === "BACKOFFICE")) ?? null,
    [walletEntries]
  );
  const [amount, setAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [pinModalVisible, setPinModalVisible] = useState(false);
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const withdrawEnabled = readWalletBoolean(walletSettings, "wallet_withdraw_enabled", true);
  const withdrawTitle = readWalletText(walletSettings, "wallet_withdraw_title", "Withdraw Fund");
  const withdrawSubtitle = readWalletText(walletSettings, "wallet_withdraw_subtitle", "Secure request flow ke saath bank account par withdraw bhejo.");
  const withdrawDisabledMessage = readWalletText(walletSettings, "wallet_withdraw_message", "Withdraw service temporarily unavailable.");
  const minWithdrawAmount = Math.max(1, readWalletNumber(walletSettings, "wallet_withdraw_min_amount", MIN_WITHDRAW_AMOUNT));
  const maxWithdrawAmount = Math.max(minWithdrawAmount, readWalletNumber(walletSettings, "wallet_withdraw_max_amount", MAX_WITHDRAW_AMOUNT));
  const withdrawMultiple = Math.max(1, readWalletNumber(walletSettings, "wallet_withdraw_multiple", WITHDRAW_MULTIPLE));
  const withdrawStartLabel = readWalletText(walletSettings, "wallet_withdraw_start_time", "11:00 AM");
  const withdrawEndLabel = readWalletText(walletSettings, "wallet_withdraw_end_time", "11:00 PM");
  const withdrawWeekendClosed = readWalletBoolean(walletSettings, "wallet_withdraw_weekend_closed", true);
  const withdrawWeekendMessage = readWalletText(walletSettings, "wallet_withdraw_weekend_message", WEEKEND_WITHDRAW_CLOSED_MESSAGE);
  const withdrawTimeMessage = readWalletText(walletSettings, "wallet_withdraw_time_message", TIME_WITHDRAW_CLOSED_MESSAGE);
  const withdrawButtonLabel = readWalletText(walletSettings, "wallet_withdraw_button_label", "Verify PIN & Withdraw");
  const withdrawInfoVisible = readWalletBoolean(walletSettings, "wallet_withdraw_info_visible", true);
  const withdrawPinMessage = readWalletText(walletSettings, "wallet_withdraw_pin_message", "Withdraw request submit karne ke liye PIN verify karo.");
  const withdrawStartMinutes = parseTimeToMinutes(withdrawStartLabel, 11 * 60);
  const withdrawEndMinutes = parseTimeToMinutes(withdrawEndLabel, 23 * 60);
  const isWeekendWithdrawClosed = useMemo(() => {
    const weekday = getIndiaWeekday();
    return withdrawWeekendClosed && (weekday === "Saturday" || weekday === "Sunday");
  }, [withdrawWeekendClosed]);
  const isTimeWithdrawClosed = useMemo(() => {
    const currentMinutes = getIndiaMinutes();
    return currentMinutes < withdrawStartMinutes || currentMinutes >= withdrawEndMinutes;
  }, [withdrawStartMinutes, withdrawEndMinutes]);

  const withdrawAmount = Number(amount || 0);
  const hasEnoughWalletBalanceForWithdraw = walletBalance >= minWithdrawAmount;
  const isMultipleOfHundred = Number.isFinite(withdrawAmount) && withdrawAmount % withdrawMultiple === 0;

  useEffect(() => {
    void Promise.all([loadBankAccounts(), loadWalletHistory()]);
  }, [loadBankAccounts, loadWalletHistory]);

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const showSubscription = Keyboard.addListener(showEvent, (event) => {
      setKeyboardHeight(event.endCoordinates?.height ?? 0);
    });
    const hideSubscription = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  useEffect(
    () => () => {
      if (feedbackTimerRef.current) {
        clearTimeout(feedbackTimerRef.current);
      }
    },
    []
  );

  return (
    <View style={styles.overlay}>
      <Pressable onPress={() => router.back()} style={styles.backdrop} />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={Platform.OS === "ios" ? 24 : 0} style={styles.keyboardWrap}>
        <View
          style={[
            styles.sheet,
            {
              paddingBottom: Math.max(insets.bottom + 116, 130),
              marginBottom: keyboardHeight > 0 ? Math.max(keyboardHeight - insets.bottom, 0) : 0
            }
          ]}
        >
          <ScrollView bounces={false} contentContainerStyle={styles.sheetContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={styles.handle} />
            <Text style={styles.title}>{withdrawTitle}</Text>
            <Text style={styles.subtitle}>{withdrawSubtitle}</Text>

            <View style={styles.balanceCard}>
              <View style={styles.balanceIcon}>
                <Ionicons color={colors.primary} name="wallet-outline" size={18} />
              </View>
              <View style={styles.balanceMeta}>
                <Text style={styles.balanceValue}>Rs {walletBalance}</Text>
                <Text style={styles.balanceLabel}>Total Wallet Balance</Text>
              </View>
            </View>

            {latestBank ? (
              <View style={styles.bankCard}>
                <View style={styles.bankIconWrap}>
                  <Ionicons color={colors.surface} name="card-outline" size={18} />
                </View>
                <View style={styles.bankMeta}>
                  <Text numberOfLines={1} style={styles.bankTitle}>
                    {latestBank.holderName}
                  </Text>
                  <Text style={styles.bankInfo}>A/C ending {latestBank.accountNumber.slice(-4)}</Text>
                  <Text style={styles.bankInfo}>{latestBank.ifsc}</Text>
                </View>
              </View>
            ) : (
              <Pressable onPress={() => router.push("/wallet/add-bank-details")} style={styles.emptyBankCard}>
                <Ionicons color={colors.warning} name="alert-circle-outline" size={18} />
                <Text style={styles.emptyBankText}>Withdraw request se pehle bank account add karo</Text>
              </Pressable>
            )}

            <View style={styles.infoStrip}>
              <View style={styles.infoPill}>
                <Text style={styles.infoPillLabel}>Minimum</Text>
                <Text style={styles.infoPillValue}>Rs {minWithdrawAmount}</Text>
              </View>
              <View style={styles.infoPill}>
                <Text style={styles.infoPillLabel}>Multiple</Text>
                <Text style={styles.infoPillValue}>Rs {withdrawMultiple}</Text>
              </View>
              <View style={styles.infoPillAccent}>
                <Text style={styles.infoPillLabelAccent}>Timing</Text>
                <Text style={styles.infoPillValueAccent}>{withdrawStartLabel} - {withdrawEndLabel}</Text>
              </View>
            </View>

            <Text style={styles.fieldLabel}>Amount</Text>
            <View style={styles.inputRow}>
                <TextInput
                  keyboardType="numeric"
                  onChangeText={(value) => {
                    setAmount(value.replace(/[^0-9]/g, ""));
                  }}
                placeholder={`Enter amount min ${minWithdrawAmount}`}
                placeholderTextColor="rgba(100, 116, 139, 0.5)"
                style={styles.input}
                value={amount}
              />
              <Ionicons color={colors.primary} name="cash-outline" size={18} />
            </View>

            <Pressable
              disabled={submitting || !withdrawEnabled || isWeekendWithdrawClosed || isTimeWithdrawClosed}
              onPress={() => requestPinBeforeWithdraw()}
              style={[styles.primaryButton, (submitting || !withdrawEnabled || isWeekendWithdrawClosed || isTimeWithdrawClosed) && styles.disabledButton]}
            >
              {submitting ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.primaryButtonText}>{withdrawButtonLabel}</Text>}
            </Pressable>
            {!withdrawEnabled ? (
              <View style={styles.feedbackCardError}>
                <Text style={styles.feedbackTextError}>{withdrawDisabledMessage}</Text>
              </View>
            ) : null}
            {isWeekendWithdrawClosed ? (
              <View style={styles.feedbackCardError}>
                <Text style={styles.feedbackTextError}>{withdrawWeekendMessage}</Text>
              </View>
            ) : null}
            {isTimeWithdrawClosed ? (
              <View style={styles.feedbackCardError}>
                <Text style={styles.feedbackTextError}>{withdrawTimeMessage}</Text>
              </View>
            ) : null}
            {successMessage ? (
              <View style={styles.feedbackCardSuccess}>
                <Text style={styles.feedbackTextSuccess}>{successMessage}</Text>
              </View>
            ) : null}
            {error ? (
              <View style={styles.feedbackCardError}>
                <Text style={styles.feedbackTextError}>{error}</Text>
              </View>
            ) : null}

            {withdrawInfoVisible ? (
              <>
                <Text style={styles.simpleInfoText}>Withdrawal limit is {minWithdrawAmount} to {maxWithdrawAmount}.</Text>
                <Text style={styles.simpleInfoText}>Withdraw request timing is {withdrawStartLabel} to {withdrawEndLabel}.</Text>
              </>
            ) : null}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
      <PinVerificationModal
        visible={pinModalVisible}
        title="Verify PIN"
        message={withdrawPinMessage}
        setupRequired
        onCancel={() => setPinModalVisible(false)}
        onVerified={async (pin) => {
          setPinModalVisible(false);
          await submitWithdraw(pin);
        }}
      />
    </View>
  );

  function requestPinBeforeWithdraw() {
    if (!withdrawEnabled) {
      showTransientMessage("error", withdrawDisabledMessage);
      return;
    }

    if (isWeekendWithdrawClosed) {
      showTransientMessage("error", withdrawWeekendMessage);
      return;
    }

    if (isTimeWithdrawClosed) {
      showTransientMessage("error", withdrawTimeMessage);
      return;
    }

    if (pendingWithdraw) {
      showTransientMessage("error", "Already one withdraw request is pending.");
      return;
    }

    if (!latestBank) {
      showTransientMessage("error", "Bank account add karo, tabhi withdraw request jayegi.");
      return;
    }

    if (!hasEnoughWalletBalanceForWithdraw) {
      showTransientMessage("error", `Insufficient balance. Minimum withdraw ke liye wallet me kam se kam Rs ${minWithdrawAmount} hona chahiye.`);
      return;
    }

    if (!Number.isFinite(withdrawAmount) || withdrawAmount <= 0) {
      showTransientMessage("error", "Valid withdraw amount enter karo.");
      return;
    }

    if (withdrawAmount < minWithdrawAmount) {
      showTransientMessage("error", `Minimum withdraw Rs ${minWithdrawAmount} hai.`);
      return;
    }
    if (withdrawAmount > maxWithdrawAmount) {
      showTransientMessage("error", `Maximum withdraw Rs ${maxWithdrawAmount} hai.`);
      return;
    }
    if (!isMultipleOfHundred) {
      showTransientMessage("error", `Withdraw amount ${withdrawMultiple} ke multiple me enter karo.`);
      return;
    }

    if (withdrawAmount > walletBalance) {
      showTransientMessage("error", "Insufficient balance for this withdraw amount.");
      return;
    }

    if (!currentUser?.hasMpin) {
      showTransientMessage("error", "Withdraw se pehle 4 digit PIN setup karo.");
      router.push("/security/update-pin");
      return;
    }

    setPinModalVisible(true);
  }

  async function submitWithdraw(pin: string) {
    if (!withdrawEnabled) {
      showTransientMessage("error", withdrawDisabledMessage);
      return;
    }

    if (isWeekendWithdrawClosed) {
      showTransientMessage("error", withdrawWeekendMessage);
      return;
    }

    if (isTimeWithdrawClosed) {
      showTransientMessage("error", withdrawTimeMessage);
      return;
    }

    if (pendingWithdraw) {
      showTransientMessage("error", "Already one withdraw request is pending.");
      return;
    }

    if (!latestBank) {
      showTransientMessage("error", "Bank account add karo, tabhi withdraw request jayegi.");
      return;
    }

    if (!Number.isFinite(withdrawAmount) || withdrawAmount < minWithdrawAmount) {
      showTransientMessage("error", `Minimum withdraw Rs ${minWithdrawAmount} hai.`);
      return;
    }
    if (withdrawAmount > maxWithdrawAmount) {
      showTransientMessage("error", `Maximum withdraw Rs ${maxWithdrawAmount} hai.`);
      return;
    }
    if (!isMultipleOfHundred) {
      showTransientMessage("error", `Withdraw amount ${withdrawMultiple} ke multiple me enter karo.`);
      return;
    }

    if (withdrawAmount > walletBalance) {
      showTransientMessage("error", "Insufficient balance for this withdraw amount.");
      return;
    }

    if (!/^[0-9]{4}$/.test(pin)) {
      showTransientMessage("error", "Valid 4 digit PIN required hai.");
      return;
    }

    try {
      setSubmitting(true);
      setError("");
      await confirmWithdraw(withdrawAmount, pin);
      setSuccessMessage("PIN verify hone ke baad withdraw request submit ho gayi.");
      setTimeout(() => {
        router.replace("/wallet/history");
      }, 700);
    } catch (submitError) {
      showTransientMessage("error", formatApiError(submitError, "Withdraw request submit nahi hui."));
    } finally {
      setSubmitting(false);
    }
  }

  function showTransientMessage(kind: "error" | "success", text: string) {
    if (feedbackTimerRef.current) {
      clearTimeout(feedbackTimerRef.current);
    }

    if (kind === "error") {
      setSuccessMessage("");
      setError(text);
    } else {
      setError("");
      setSuccessMessage(text);
    }

    feedbackTimerRef.current = setTimeout(() => {
      if (kind === "error") {
        setError("");
      } else {
        setSuccessMessage("");
      }
      feedbackTimerRef.current = null;
    }, 3500);
  }
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: colors.overlay
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject
  },
  keyboardWrap: {
    justifyContent: "flex-end",
    alignItems: "center"
  },
  sheet: {
    width: "100%",
    maxWidth: 540,
    backgroundColor: colors.surface,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 16,
    paddingTop: 10
  },
  sheetContent: {
    gap: 16
  },
  handle: {
    alignSelf: "center",
    width: 58,
    height: 6,
    borderRadius: 999,
    backgroundColor: colors.border
  },
  title: {
    textAlign: "center",
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: "900"
  },
  subtitle: {
    textAlign: "center",
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 18
  },
  balanceCard: {
    minHeight: 76,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14
  },
  balanceIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center"
  },
  balanceMeta: {
    flex: 1
  },
  balanceValue: {
    color: colors.primaryDark,
    fontSize: 26,
    fontWeight: "900"
  },
  balanceLabel: {
    color: colors.textSecondary,
    fontWeight: "700"
  },
  bankCard: {
    minHeight: 78,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14
  },
  bankIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accent
  },
  bankMeta: {
    flex: 1
  },
  bankTitle: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: "800"
  },
  bankInfo: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "600"
  },
  emptyBankCard: {
    minHeight: 56,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.warningSoft,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14
  },
  emptyBankText: {
    flex: 1,
    color: colors.warning,
    fontSize: 13,
    fontWeight: "700"
  },
  infoStrip: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10
  },
  infoPill: {
    flex: 1,
    minWidth: 88,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 3
  },
  infoPillAccent: {
    flex: 1.15,
    minWidth: 112,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: colors.accentDark,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 3
  },
  infoPillLabel: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.7
  },
  infoPillValue: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: "900"
  },
  infoPillLabelAccent: {
    color: colors.whiteOverlayTextStrong,
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.7
  },
  infoPillValueAccent: {
    color: colors.surface,
    fontSize: 13,
    fontWeight: "900"
  },
  fieldLabel: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: "700"
  },
  inputRow: {
    minHeight: 52,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    gap: 8
  },
  input: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: "700"
  },
  infoText: {
    color: colors.primaryDark,
    fontSize: 12,
    fontWeight: "700"
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
  primaryButton: {
    minHeight: 50,
    borderRadius: 999,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center"
  },
  disabledButton: {
    opacity: 0.55
  },
  primaryButtonText: {
    color: colors.surface,
    fontWeight: "800"
  },
  simpleInfoText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 18
  },
  feedbackCardSuccess: {
    borderRadius: 14,
    backgroundColor: colors.successSoft,
    borderWidth: 1,
    borderColor: "#b9ebc8",
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  feedbackCardError: {
    borderRadius: 14,
    backgroundColor: colors.dangerSoft,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  feedbackTextSuccess: {
    color: colors.success,
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 17
  },
  feedbackTextError: {
    color: colors.danger,
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 17
  }
});
