import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { PinVerificationModal } from "@/components/pin-verification-modal";
import { AppScreen, BackHeader, SurfaceCard } from "@/components/ui";
import { useAppState } from "@/lib/app-state";
import { formatApiError } from "@/lib/api";
import { colors } from "@/theme/colors";

export default function AddBankDetailsScreen() {
  const { addBankAccount, bankAccounts, currentUser, loadBankAccounts } = useAppState();
  const latestBank = useMemo(() => bankAccounts[0] ?? null, [bankAccounts]);
  const [accountNumber, setAccountNumber] = useState(latestBank?.accountNumber ?? "");
  const [holderName, setHolderName] = useState(latestBank?.holderName ?? "");
  const [ifsc, setIfsc] = useState(latestBank?.ifsc ?? "");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [pinModalVisible, setPinModalVisible] = useState(false);

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
      <BackHeader title="Add Bank Details" subtitle={undefined} />
      <AppScreen showPromo={false}>
        <SurfaceCard style={styles.heroCard}>
          <View style={styles.heroIcon}>
            <Ionicons color={colors.surface} name="business-outline" size={20} />
          </View>
          <View style={styles.heroCopy}>
            <Text style={styles.heroTitle}>Bank account setup</Text>
            <Text style={styles.heroSubtitle}>Withdraw ke liye account details yahan safely save karo.</Text>
          </View>
        </SurfaceCard>
        <SurfaceCard style={styles.formCard}>
          <Text style={styles.title}>Bank Account Details</Text>
          <Text style={styles.helper}>Naam, account number aur IFSC ko bilkul sahi fill karo.</Text>
          <TextInput keyboardType="number-pad" onChangeText={setAccountNumber} placeholder="Enter account number" placeholderTextColor="#98a2b3" style={styles.input} value={accountNumber} />
          <TextInput autoCapitalize="words" onChangeText={setHolderName} placeholder="Enter holder name" placeholderTextColor="#98a2b3" style={styles.input} value={holderName} />
          <TextInput autoCapitalize="characters" onChangeText={setIfsc} placeholder="Enter IFSC code" placeholderTextColor="#98a2b3" style={styles.input} value={ifsc} />

          {error ? <Text style={styles.error}>{error}</Text> : null}
          {message ? <Text style={styles.success}>{message}</Text> : null}

          <Pressable onPress={() => requestPinBeforeSubmit()} style={[styles.primary, submitting && styles.disabled]}>
            {submitting ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.primaryText}>Save Bank Details</Text>}
          </Pressable>
        </SurfaceCard>
      </AppScreen>
      <PinVerificationModal
        visible={pinModalVisible}
        title="Verify PIN"
        message="Bank details save karne ke liye PIN verify karo."
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
      setMessage("Bank details saved successfully.");
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
