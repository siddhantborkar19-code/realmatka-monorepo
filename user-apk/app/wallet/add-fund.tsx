import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { Linking, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import QRCode from "qrcode-terminal/vendor/QRCode";
import QRErrorCorrectLevel from "qrcode-terminal/vendor/QRCode/QRErrorCorrectLevel";
import { AppScreen, BackHeader, SurfaceCard } from "@/components/ui";
import { useAppState } from "@/lib/app-state";
import { colors } from "@/theme/colors";

const MIN_DEPOSIT_AMOUNT = 100;
const MANUAL_UPI_ID = (process.env.EXPO_PUBLIC_DIRECT_UPI_ID || "s7568539842258141@slc").trim();
const MANUAL_UPI_NAME = (process.env.EXPO_PUBLIC_DIRECT_UPI_NAME || "slice").trim();
const PAYMENT_WHATSAPP_PHONE = (process.env.EXPO_PUBLIC_PAYMENT_WHATSAPP_PHONE || "9309782081").replace(/\D/g, "");

function buildUpiUrl(amount: number | null) {
  const params = new URLSearchParams({
    pa: MANUAL_UPI_ID,
    pn: MANUAL_UPI_NAME,
    cu: "INR",
    tn: "Wallet Deposit"
  });

  if (amount && Number.isFinite(amount) && amount >= MIN_DEPOSIT_AMOUNT) {
    params.set("am", amount.toFixed(2));
  }

  return `upi://pay?${params.toString()}`;
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
  const { currentUser, walletBalance } = useAppState();
  const [amount, setAmount] = useState("");
  const [message, setMessage] = useState("");

  const numericAmount = Number(amount || 0);
  const hasValidAmount = Number.isFinite(numericAmount) && numericAmount >= MIN_DEPOSIT_AMOUNT;
  const upiUrl = useMemo(() => buildUpiUrl(hasValidAmount ? numericAmount : null), [hasValidAmount, numericAmount]);
  const qrMatrix = useMemo(() => buildQrMatrix(upiUrl), [upiUrl]);
  const moduleSize = Math.max(3, Math.floor(232 / qrMatrix.length));
  const qrSize = qrMatrix.length * moduleSize;

  return (
    <View style={styles.page}>
      <BackHeader title="Add Fund" subtitle={undefined} />
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
          <Text style={styles.sectionTitle}>Deposit Amount</Text>
          <View style={styles.inputRow}>
            <Text style={styles.currencyPrefix}>Rs</Text>
            <TextInput
              keyboardType="numeric"
              onChangeText={(value) => {
                setAmount(value.replace(/[^0-9]/g, ""));
                setMessage("");
              }}
              placeholder="Enter amount min 100"
              placeholderTextColor={colors.textMuted}
              style={styles.amountInput}
              value={amount}
            />
          </View>
          {!hasValidAmount && amount ? <Text style={styles.errorText}>Minimum deposit Rs {MIN_DEPOSIT_AMOUNT} hai.</Text> : null}
        </SurfaceCard>

        <SurfaceCard style={styles.qrCard}>
          <View style={styles.qrHeader}>
            <View>
              <Text style={styles.sectionTitle}>Scan QR & Pay</Text>
              <Text style={styles.qrSubText}>Screenshot lo, kisi bhi UPI app se payment karo.</Text>
            </View>
            <View style={styles.manualBadge}>
              <Text style={styles.manualBadgeText}>Manual</Text>
            </View>
          </View>

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
              {MANUAL_UPI_ID}
            </Text>
          </View>
          <Text style={styles.qrHint}>
            Payment ke baad WhatsApp button dabao aur payment screenshot attach karke bhejo. Admin verify karke wallet credit karega.
          </Text>
        </SurfaceCard>

        {message ? (
          <SurfaceCard style={styles.messageCard}>
            <Text style={styles.successText}>{message}</Text>
          </SurfaceCard>
        ) : null}

        <SurfaceCard>
          <Text style={styles.sectionTitle}>How It Works</Text>
          <View style={styles.steps}>
            <Text style={styles.stepText}>1. Amount enter karo.</Text>
            <Text style={styles.stepText}>2. QR ka screenshot lo aur UPI app se payment complete karo.</Text>
            <Text style={styles.stepText}>3. WhatsApp par payment screenshot bhejo.</Text>
            <Text style={styles.stepText}>4. Admin verify karke wallet balance add karega.</Text>
          </View>
        </SurfaceCard>

        <View style={styles.footerActions}>
          <Pressable
            disabled={!hasValidAmount}
            onPress={() => void sendWhatsAppProof()}
            style={[styles.whatsappButton, !hasValidAmount && styles.disabledButton]}
          >
            <Ionicons color={colors.surface} name="logo-whatsapp" size={19} />
            <Text style={styles.whatsappButtonText}>Send WhatsApp Proof</Text>
          </Pressable>

          <Pressable onPress={() => router.push("/wallet/history")} style={styles.historyButton}>
            <Text style={styles.historyButtonText}>View Wallet History</Text>
          </Pressable>
        </View>
      </AppScreen>
    </View>
  );

  async function sendWhatsAppProof() {
    if (!hasValidAmount) {
      setMessage(`Minimum deposit Rs ${MIN_DEPOSIT_AMOUNT} hai.`);
      return;
    }

    const userLine = currentUser
      ? `User: ${currentUser.name || "User"}${currentUser.phone ? ` (${currentUser.phone})` : ""}`
      : "User: App user";
    const text = [
      "Wallet deposit payment proof",
      `Amount: Rs ${numericAmount}`,
      `UPI ID: ${MANUAL_UPI_ID}`,
      userLine,
      "",
      "Payment screenshot attached. Please verify and credit my wallet."
    ].join("\n");
    const phone = PAYMENT_WHATSAPP_PHONE.startsWith("91") ? PAYMENT_WHATSAPP_PHONE : `91${PAYMENT_WHATSAPP_PHONE}`;
    const whatsappUrl = `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;

    try {
      await Linking.openURL(whatsappUrl);
      setMessage("WhatsApp open ho gaya. Ab payment screenshot attach karke send karo.");
    } catch {
      setMessage("WhatsApp open nahi hua. Screenshot manually WhatsApp par bhejo.");
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
