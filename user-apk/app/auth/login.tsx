import { useEffect, useRef, useState } from "react";
import { Link, router } from "expo-router";
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SurfaceCard } from "@/components/ui";
import { useAppState } from "@/lib/app-state";
import { formatApiError } from "@/lib/api";
import { colors } from "@/theme/colors";

export default function LoginScreen() {
  const { login, isAuthenticated, loading } = useAppState();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const passwordInputRef = useRef<TextInput | null>(null);
  const normalizedPhone = phone.replace(/[^0-9]/g, "");
  const hasValidPhone = normalizedPhone.length === 10;
  const hasPassword = password.trim().length > 0;

  async function submitLogin() {
    if (submitting) {
      return;
    }
    if (!hasValidPhone) {
      setError("Valid 10 digit phone number dalo.");
      return;
    }
    if (!hasPassword) {
      setError("Password dalo.");
      return;
    }
    try {
      setSubmitting(true);
      setError("");
      await login(normalizedPhone, password.trim());
      router.replace("/(tabs)");
    } catch (loginError) {
      setError(formatApiError(loginError, "Login failed"));
    } finally {
      setSubmitting(false);
    }
  }

  useEffect(() => {
    if (!loading && isAuthenticated) {
      router.replace("/(tabs)");
    }
  }, [loading, isAuthenticated]);

  return (
    <View style={styles.page}>
      <LinearGradient colors={[colors.gradientStart, colors.gradientEnd]} end={{ x: 1, y: 1 }} start={{ x: 0, y: 0 }} style={styles.hero}>
        <Image source={require("../../assets/images/adaptive-icon.png")} style={styles.logo} resizeMode="contain" />
        <Text style={styles.tagline}>Secure login for wallet, bids, charts, and market play.</Text>
      </LinearGradient>

      <View style={styles.content}>
        <SurfaceCard style={styles.formCard}>
          <Text style={styles.title}>Login</Text>
          <Text style={styles.subtitle}>Use your registered phone number and password to continue.</Text>
          <View style={styles.fieldWrap}>
            <Text style={styles.label}>Phone Number</Text>
            <TextInput
              keyboardType="phone-pad"
              maxLength={10}
              onChangeText={(value) => {
                setPhone(value.replace(/[^0-9]/g, ""));
                setError("");
              }}
              onSubmitEditing={() => {
                passwordInputRef.current?.focus();
              }}
              placeholder="Enter phone number"
              placeholderTextColor="#94a3b8"
              returnKeyType="next"
              style={styles.input}
              value={phone}
            />
          </View>

          <View style={styles.fieldWrap}>
            <Text style={styles.label}>Password</Text>
            <TextInput
              onChangeText={setPassword}
              onFocus={() => setError("")}
              onSubmitEditing={() => {
                void submitLogin();
              }}
              placeholder="Enter password"
              placeholderTextColor="#94a3b8"
              ref={passwordInputRef}
              returnKeyType="go"
              secureTextEntry
              submitBehavior="submit"
              style={styles.input}
              value={password}
            />
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable
            onPress={() => {
              void submitLogin();
            }}
            disabled={submitting || !hasValidPhone || !hasPassword}
            style={[styles.primaryButton, (submitting || !hasValidPhone || !hasPassword) && styles.disabled]}
          >
            {submitting ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.primaryText}>Continue</Text>}
          </Pressable>

          <View style={styles.linkGroup}>
            <Link href="/auth/register" style={styles.link}>
              Create new account
            </Link>

            <Link href="/auth/otp-login" style={styles.link}>
              Login with OTP
            </Link>

            <Link href="/auth/forgot-password" style={styles.link}>
              Forgot password
            </Link>
          </View>
        </SurfaceCard>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: colors.background
  },
  hero: {
    paddingTop: 52,
    paddingBottom: 48,
    paddingHorizontal: 22,
    backgroundColor: colors.gradientStart,
    alignItems: "center"
  },
  logo: {
    width: "78%",
    maxWidth: 280,
    height: 110,
    marginTop: 20,
    marginBottom: 0
  },
  tagline: {
    maxWidth: 320,
    color: colors.whiteOverlayTextStrong,
    lineHeight: 20,
    marginTop: -14,
    textAlign: "center"
  },
  content: {
    width: "100%",
    maxWidth: 480,
    marginTop: 0,
    paddingHorizontal: 16,
    paddingBottom: 32,
    alignSelf: "center"
  },
  formCard: {
    width: "100%",
    borderRadius: 24
  },
  title: {
    color: "#111827",
    fontSize: 24,
    fontWeight: "800"
  },
  subtitle: {
    color: "#64748b",
    lineHeight: 20
  },
  fieldWrap: {
    gap: 8
  },
  label: {
    color: "#0f172a",
    fontWeight: "700"
  },
  input: {
    minHeight: 50,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#dbe1ea",
    paddingHorizontal: 14,
    color: "#111827",
    backgroundColor: "#f8fafc"
  },
  primaryButton: {
    minHeight: 48,
    borderRadius: 999,
    backgroundColor: "#111827",
    alignItems: "center",
    justifyContent: "center"
  },
  disabled: {
    opacity: 0.7
  },
  primaryText: {
    color: "#ffffff",
    fontWeight: "800",
    fontSize: 15
  },
  error: {
    color: "#dc2626",
    fontWeight: "600"
  },
  linkGroup: {
    gap: 12,
    paddingTop: 4
  },
  link: {
    color: "#111827",
    fontWeight: "700",
    textAlign: "center"
  }
});
