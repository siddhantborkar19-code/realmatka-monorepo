import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { PinVerificationModal } from "@/components/pin-verification-modal";
import { AppScreen, BackHeader, SurfaceCard } from "@/components/ui";
import { useAppState } from "@/lib/app-state";
import { formatApiError } from "@/lib/api";
import { readWalletBoolean, readWalletText, useWalletRemoteSettings } from "@/lib/wallet-remote-config";
import { colors } from "@/theme/colors";

export default function AddBankDetailsScreen() {
  const walletSettings = useWalletRemoteSettings();
  const { addBankAccount, bankAccounts, currentUser, loadBankAccounts } = useAppState();
  const latestBank = useMemo(() => bankAccounts[0] ?? null, [bankAccounts]);
  const [accountNumber, setAccountNumber] = useState(latestBank?.accountNumber ?? "");
  const [holderName, setHolderName] = useState(latestBank?.holderName ?? "");
  const [ifsc, setIfsc] = useState(latestBank?.ifsc ?? "");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [pinModalVisible, setPinModalVisible] = useState(false);
  const addBankEnabled = readWalletBoolean(walletSettings, "wallet_add_bank_enabled", true);
  const addBankDisabledMessage = readWalletText(walletSettings, "wallet_add_bank_message", "Bank details update temporarily unavailable.");
  const addBankTitle = readWalletText(walletSettings, "wallet_add_bank_title", "Add Bank Details");
  const addBankSubtitle = readWalletText(walletSettings, "wallet_add_bank_subtitle", "Withdraw ke liye account details yahan safely save karo.");
  const addBankFormTitle = readWalletText(walletSettings, "wallet_add_bank_form_title", "Bank Account Details");
  const addBankHelper = readWalletText(walletSettings, "wallet_add_bank_helper", "Naam, account number aur IFSC ko bilkul sahi fill karo.");
  const accountPlaceholder = readWalletText(walletSettings, "wallet_add_bank_account_placeholder", "Enter account number");
  const holderPlaceholder = readWalletText(walletSettings, "wallet_add_bank_holder_placeholder", "Enter holder name");
  const ifscPlaceholder = readWalletText(walletSettings, "wallet_add_bank_ifsc_placeholder", "Enter IFSC code");
  const addBankButtonLabel = readWalletText(walletSettings, "wallet_add_bank_button_label", "Save Bank Details");
  const addBankPinMessage = readWalletText(walletSettings, "wallet_add_bank_pin_message", "Bank details save karne ke liye PIN verify karo.");
  const addBankSuccessMessage = readWalletText(walletSettings, "wallet_add_bank_success_message", "Bank details saved successfully.");

  useEffect(() => {
    void loadBankAccounts();
  }, [loadBankAccounts]);

  useEffect(() => {
    if (!latestBank) {
      return;
    }

    setAccountNumber((current) => current || latestBank.accountNumber || "");
    setHolderName((current) => current || latestBank.holderName || "");
    setIfsc((current) => current || latestBank.ifsc || "");
  }, [latestBank]);

  return (
    <View style={styles.page}>
      <BackHeader title={addBankTitle} subtitle={undefined} />
      <AppScreen showPromo={false}>
        <SurfaceCard style={styles.heroCard}>
          <View style={styles.heroIcon}>
            <Ionicons color={colors.surface} name="business-outline" size={20} />
          </View>
          <View style={styles.heroCopy}>
            <Text style={styles.heroTitle}>Bank account setup</Text>
            <Text style={styles.heroSubtitle}>{addBankSubtitle}</Text>
          </View>
        </SurfaceCard>
        <SurfaceCard style={styles.formCard}>
          <Text style={styles.title}>{addBankFormTitle}</Text>
          <Text style={styles.helper}>{addBankHelper}</Text>
          <TextInput keyboardType="number-pad" onChangeText={setAccountNumber} placeholder={accountPlaceholder} placeholderTextColor="#98a2b3" style={styles.input} value={accountNumber} />
          <TextInput autoCapitalize="words" onChangeText={setHolderName} placeholder={holderPlaceholder} placeholderTextColor="#98a2b3" style={styles.input} value={holderName} />
          <TextInput autoCapitalize="characters" onChangeText={setIfsc} placeholder={ifscPlaceholder} placeholderTextColor="#98a2b3" style={styles.input} value={ifsc} />

          {error ? <Text style={styles.error}>{error}</Text> : null}
          {message ? <Text style={styles.success}>{message}</Text> : null}
          {!addBankEnabled ? <Text style={styles.error}>{addBankDisabledMessage}</Text> : null}

          <Pressable disabled={!addBankEnabled || submitting} onPress={() => requestPinBeforeSubmit()} style={[styles.primary, (!addBankEnabled || submitting) && styles.disabled]}>
            {submitting ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.primaryText}>{addBankButtonLabel}</Text>}
          </Pressable>
        </SurfaceCard>
      </AppScreen>
      <PinVerificationModal
        visible={pinModalVisible}
        title="Verify PIN"
        message={addBankPinMessage}
        setupRequired
        onCancel={() => setPinModalVisible(false)}
        onVerified={async (pin) => {
          setPinModalVisible(false);
          await submit(pin);
        }}
      />
    </View>
  );

  function requestPinBeforeSubmit() {
    if (!addBankEnabled) {
      setError(addBankDisabledMessage);
      return;
    }

    if (!currentUser?.hasMpin) {
      setError("Bank details save karne se pehle 4 digit PIN setup karo.");
      router.push("/security/update-pin");
      return;
    }
    setPinModalVisible(true);
  }

  async function submit(pin: string) {
    try {
      setSubmitting(true);
      setError("");
      setMessage("");
      await addBankAccount(accountNumber, holderName, ifsc, pin);
      setMessage(addBankSuccessMessage);
    } catch (saveError) {
      setError(formatApiError(saveError, "Unable to save bank details"));
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
    gap: 14,
    borderRadius: 22,
    borderColor: colors.borderStrong
  },
  heroIcon: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.accentDark,
    alignItems: "center",
    justifyContent: "center"
  },
  heroCopy: {
    flex: 1,
    gap: 3
  },
  heroTitle: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: "900"
  },
  heroSubtitle: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 18
  },
  formCard: {
    gap: 12,
    borderRadius: 22
  },
  title: {
    textAlign: "center",
    color: "#111827",
    fontSize: 20,
    fontWeight: "900"
  },
  helper: {
    textAlign: "center",
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 18
  },
  input: {
    minHeight: 54,
    borderRadius: 18,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: "#dbe1ea",
    paddingHorizontal: 14,
    color: "#374151"
  },
  primary: {
    minHeight: 50,
    borderRadius: 999,
    backgroundColor: "#273caa",
    alignItems: "center",
    justifyContent: "center"
  },
  disabled: {
    opacity: 0.7
  },
  primaryText: {
    color: colors.surface,
    fontWeight: "800"
  },
  error: {
    color: "#dc2626",
    fontWeight: "600"
  },
  success: {
    color: "#16a34a",
    fontWeight: "600"
  }
});
