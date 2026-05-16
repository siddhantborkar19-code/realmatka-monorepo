import { useEffect, useRef, useState } from "react";
import { Link, router } from "expo-router";
import { ActivityIndicator, Image, Linking, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SurfaceCard } from "@/components/ui";
import { useAppState } from "@/lib/app-state";
import { formatApiError } from "@/lib/api";
import { requestGoogleAccessToken } from "@/lib/google-auth";
import { colors } from "@/theme/colors";

const webAuthBaseUrl = String(process.env.EXPO_PUBLIC_WEB_AUTH_BASE_URL || "https://play.realmatka.in").replace(/\/+$/, "");

export default function LoginScreen() {
  const { login, googleLogin, isAuthenticated, loading } = useAppState();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);
  const [error, setError] = useState("");
  const passwordInputRef = useRef<TextInput | null>(null);
  const normalizedPhone = phone.replace(/[^0-9]/g, "");
  const hasValidPhone = normalizedPhone.length === 10;
  const hasPassword = password.trim().length > 0;
  const isNativeApp = Platform.OS !== "web";

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

  async function submitGoogleLogin() {
    if (googleSubmitting) {
      return;
    }
    try {
      setGoogleSubmitting(true);
      setError("");
      const accessToken = await requestGoogleAccessToken();
      const response = await googleLogin(accessToken);
      if (response.needsRegistration && response.registrationToken) {
        router.push({
          pathname: "/auth/register",
          params: {
            googleRegistrationToken: response.registrationToken,
            googleEmail: response.profile?.email || "",
            googleName: response.profile?.name || "",
            googleGivenName: response.profile?.givenName || "",
            googleFamilyName: response.profile?.familyName || ""
          }
        });
        return;
      }
      router.replace("/(tabs)");
    } catch (googleError) {
      setError(formatApiError(googleError, "Google login failed"));
    } finally {
      setGoogleSubmitting(false);
    }
  }

  async function openWebAuth(path: "/auth/register" | "/auth/forgot-password") {
    await Linking.openURL(`${webAuthBaseUrl}${path}`);
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
          {!isNativeApp ? (
            <>
              <Pressable
                onPress={() => {
                  void submitGoogleLogin();
                }}
                disabled={googleSubmitting}
                style={[styles.googleButton, googleSubmitting && styles.disabled]}
              >
                {googleSubmitting ? (
                  <ActivityIndicator color="#111827" />
                ) : (
                  <>
                    <Text style={styles.googleMark}>G</Text>
                    <Text style={styles.googleText}>Continue with Google</Text>
                  </>
                )}
              </Pressable>
              <View style={styles.dividerRow}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>or phone login</Text>
                <View style={styles.dividerLine} />
              </View>
            </>
          ) : null}
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
            {isNativeApp ? (
              <>
                <Pressable
                  onPress={() => {
                    void openWebAuth("/auth/register");
                  }}
                >
                  <Text style={styles.link}>Create new account</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    router.push("/auth/otp-login");
                  }}
                >
                  <Text style={styles.link}>Login with OTP</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    void openWebAuth("/auth/forgot-password");
                  }}
                >
                  <Text style={styles.link}>Forgot password</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Link href="/auth/register" style={styles.link}>
                  Create new account
                </Link>

                <Link href="/auth/otp-login" style={styles.link}>
                  Login with OTP
                </Link>

                <Link href="/auth/forgot-password" style={styles.link}>
                  Forgot password
                </Link>
              </>
            )}
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
  googleButton: {
    minHeight: 50,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#dbe1ea",
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 10
  },
  googleMark: {
    color: "#ea4335",
    fontSize: 18,
    fontWeight: "900"
  },
  googleText: {
    color: "#111827",
    fontWeight: "900",
    fontSize: 15
  },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: "#e2e8f0"
  },
  dividerText: {
    color: "#64748b",
    fontSize: 12,
    fontWeight: "800"
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
