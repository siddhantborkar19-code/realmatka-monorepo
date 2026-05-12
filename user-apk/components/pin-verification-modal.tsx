import { useState } from "react";
import { router } from "expo-router";
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useAppState } from "@/lib/app-state";
import { formatApiError } from "@/lib/api";
import { colors } from "@/theme/colors";

type PinVerificationModalProps = {
  visible: boolean;
  title?: string;
  message?: string;
  onCancel?: () => void;
  onVerified?: (pin: string) => Promise<void> | void;
  cancelLabel?: string;
  setupRequired?: boolean;
};

export function PinVerificationModal({
  visible,
  title = "Verify PIN",
  message = "Continue karne ke liye 4 digit PIN enter karo.",
  onCancel,
  onVerified,
  cancelLabel = "Cancel",
  setupRequired = false
}: PinVerificationModalProps) {
  const { currentUser, verifyMpin } = useAppState();
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const hasMpin = Boolean(currentUser?.hasMpin);

  function resetAndCancel() {
    setPin("");
    setError("");
    onCancel?.();
  }

  function appendDigit(digit: string) {
    if (pin.length < 4) {
      setPin((current) => `${current}${digit}`);
      setError("");
    }
  }

  async function submitPin(nextPin = pin) {
    if (submitting) {
      return;
    }
    if (!/^[0-9]{4}$/.test(nextPin)) {
      setError("4 digit PIN dalo.");
      return;
    }
    try {
      setSubmitting(true);
      setError("");
      await verifyMpin(nextPin);
      setPin("");
      await onVerified?.(nextPin);
    } catch (verifyError) {
      setError(formatApiError(verifyError, "Wrong PIN. Try again."));
    } finally {
      setSubmitting(false);
    }
  }

  function handleDigit(key: string) {
    if (key === "X") {
      setPin("");
      setError("");
      return;
    }
    if (key === "DEL") {
      setPin((current) => current.slice(0, -1));
      setError("");
      return;
    }
    const nextPin = `${pin}${key}`.slice(0, 4);
    setPin(nextPin);
    setError("");
    if (nextPin.length === 4) {
      void submitPin(nextPin);
    }
  }

  return (
    <Modal animationType="fade" transparent visible={visible}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          {hasMpin ? (
            <>
              <Text style={styles.title}>{title}</Text>
              <Text style={styles.message}>{message}</Text>
              <View style={styles.pinWrap}>
                {[0, 1, 2, 3].map((index) => (
                  <View key={index} style={[styles.pinDot, pin[index] && styles.pinDotFilled]} />
                ))}
              </View>
              <View style={styles.keypad}>
                {["1", "2", "3", "4", "5", "6", "7", "8", "9", "X", "0", "DEL"].map((key) => (
                  <Pressable
                    key={key}
                    disabled={submitting}
                    onPress={() => handleDigit(key)}
                    style={({ pressed }) => [styles.key, pressed && styles.keyPressed]}
                  >
                    <Text style={styles.keyText}>{key}</Text>
                  </Pressable>
                ))}
              </View>
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <View style={styles.actions}>
                <Pressable onPress={resetAndCancel} style={styles.secondaryButton}>
                  <Text style={styles.secondaryText}>{cancelLabel}</Text>
                </Pressable>
                <Pressable disabled={submitting || pin.length !== 4} onPress={() => void submitPin()} style={[styles.primaryButton, (submitting || pin.length !== 4) && styles.disabled]}>
                  {submitting ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.primaryText}>Verify</Text>}
                </Pressable>
              </View>
            </>
          ) : (
            <>
              <Text style={styles.title}>Set PIN Required</Text>
              <Text style={styles.message}>Is action ke liye pehle 4 digit PIN setup karo.</Text>
              <Pressable
                onPress={() => {
                  resetAndCancel();
                  router.push("/security/update-pin");
                }}
                style={styles.primaryButton}
              >
                <Text style={styles.primaryText}>Set PIN</Text>
              </Pressable>
              {!setupRequired ? (
                <Pressable onPress={resetAndCancel} style={styles.secondaryButton}>
                  <Text style={styles.secondaryText}>{cancelLabel}</Text>
                </Pressable>
              ) : null}
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.62)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20
  },
  card: {
    width: "100%",
    maxWidth: 380,
    borderRadius: 26,
    backgroundColor: colors.surface,
    padding: 22,
    gap: 14
  },
  title: {
    color: "#111827",
    fontSize: 22,
    fontWeight: "900",
    textAlign: "center"
  },
  message: {
    color: "#64748b",
    lineHeight: 20,
    textAlign: "center",
    fontWeight: "600"
  },
  pinWrap: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 12,
    paddingVertical: 4
  },
  pinDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: "#94a3b8",
    backgroundColor: "#f8fafc"
  },
  pinDotFilled: {
    borderColor: colors.primary,
    backgroundColor: colors.primary
  },
  keypad: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 10
  },
  key: {
    width: "30%",
    minHeight: 46,
    borderRadius: 999,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    alignItems: "center",
    justifyContent: "center"
  },
  keyPressed: {
    backgroundColor: "#e0f2fe"
  },
  keyText: {
    color: "#111827",
    fontSize: 17,
    fontWeight: "900"
  },
  actions: {
    flexDirection: "row",
    gap: 10
  },
  primaryButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 999,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14
  },
  secondaryButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14
  },
  primaryText: {
    color: colors.surface,
    fontWeight: "900"
  },
  secondaryText: {
    color: "#111827",
    fontWeight: "900"
  },
  disabled: {
    opacity: 0.65
  },
  error: {
    color: colors.danger,
    fontWeight: "700",
    textAlign: "center"
  }
});
