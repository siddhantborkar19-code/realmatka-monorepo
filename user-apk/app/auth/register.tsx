import { useEffect, useState } from "react";
import { Link, router, useLocalSearchParams } from "expo-router";
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { AppScreen, SurfaceCard } from "@/components/ui";
import { useAppState } from "@/lib/app-state";
import { formatApiError } from "@/lib/api";
import { requestGoogleAccessToken } from "@/lib/google-auth";
import { clearStoredReferralCode, normalizeReferralCode, readStoredReferralCode, writeStoredReferralCode } from "@/lib/referral-storage";
import { colors } from "@/theme/colors";

export default function RegisterScreen() {
  const { googleLogin, googleRegister } = useAppState();
  const params = useLocalSearchParams<{
    ref?: string;
    referenceCode?: string;
    referralCode?: string;
    googleRegistrationToken?: string;
    googleEmail?: string;
    googleName?: string;
    googleGivenName?: string;
    googleFamilyName?: string;
  }>();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [referenceCode, setReferenceCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [googleRegistrationToken, setGoogleRegistrationToken] = useState("");
  const [googleEmail, setGoogleEmail] = useState("");
  const incomingReferralCode = normalizeReferralCode(params.ref ?? params.referenceCode ?? params.referralCode);
  const normalizedPhone = phone.replace(/[^0-9]/g, "");
  const normalizedFirstName = firstName.trim();
  const normalizedLastName = lastName.trim();
  const hasValidFirstName = normalizedFirstName.length >= 2;
  const hasValidLastName = normalizedLastName.length >= 2;
  const hasValidPhone = normalizedPhone.length === 10;
  const hasValidPassword = password.trim().length >= 8;
  const passwordsMatch = password === confirmPassword && confirmPassword.length > 0;
  const isGoogleRegistration = Boolean(googleRegistrationToken && googleEmail);
  const canCreateAccount =
    isGoogleRegistration &&
    !submitting &&
    hasValidFirstName &&
    hasValidLastName &&
    hasValidPhone &&
    hasValidPassword &&
    passwordsMatch;

  useEffect(() => {
    let active = true;

    void (async () => {
      if (incomingReferralCode) {
        setReferenceCode(incomingReferralCode);
        await writeStoredReferralCode(incomingReferralCode);
        return;
      }

      const storedCode = await readStoredReferralCode();
      if (active && storedCode && !referenceCode) {
        setReferenceCode(storedCode);
      }
    })();

    return () => {
      active = false;
    };
  }, [incomingReferralCode, referenceCode]);

  useEffect(() => {
    const token = String(params.googleRegistrationToken || "").trim();
    const email = String(params.googleEmail || "").trim().toLowerCase();
    const givenName = String(params.googleGivenName || "").trim();
    const familyName = String(params.googleFamilyName || "").trim();
    const fullName = String(params.googleName || "").trim();
    if (!token || !email) {
      return;
    }
    setGoogleRegistrationToken(token);
    setGoogleEmail(email);
    setFirstName((current) => current || givenName || fullName.split(/\s+/)[0] || "");
    setLastName((current) => current || familyName || fullName.split(/\s+/).slice(1).join(" ") || "User");
    setSuccess(`Google verified: ${email}. Ab account details fill karo.`);
    setError("");
  }, [params.googleEmail, params.googleFamilyName, params.googleGivenName, params.googleName, params.googleRegistrationToken]);

  async function startGoogleRegistration() {
    if (googleSubmitting) {
      return;
    }
    try {
      setGoogleSubmitting(true);
      setError("");
      setSuccess("");
      const accessToken = await requestGoogleAccessToken();
      const response = await googleLogin(accessToken);
      if (!response.needsRegistration) {
        router.replace("/(tabs)");
        return;
      }
      if (!response.registrationToken || !response.profile?.email) {
        setError("Google registration token receive nahi hua. Dobara try karo.");
        return;
      }
      setGoogleRegistrationToken(response.registrationToken);
      setGoogleEmail(response.profile.email);
      setFirstName(response.profile.givenName || response.profile.name.split(/\s+/)[0] || "");
      setLastName(response.profile.familyName || response.profile.name.split(/\s+/).slice(1).join(" ") || "User");
      setSuccess(`Google verified: ${response.profile.email}. Ab account details fill karo.`);
    } catch (googleError) {
      setError(formatApiError(googleError, "Google login failed"));
    } finally {
      setGoogleSubmitting(false);
    }
  }

  async function submitRegistration() {
    if (!isGoogleRegistration) {
      setError("Pehle Google se continue karo.");
      return;
    }
    if (!hasValidFirstName) {
      setError("Valid first name dalo.");
      return;
    }
    if (!hasValidLastName) {
      setError("Valid last name dalo.");
      return;
    }
    if (!hasValidPhone) {
      setError("Valid 10 digit phone number dalo.");
      return;
    }
    if (!hasValidPassword) {
      setError("Password kam se kam 8 characters ka hona chahiye.");
      return;
    }
    if (!passwordsMatch) {
      setError("Password aur confirm password same dalo.");
      return;
    }
    try {
      setSubmitting(true);
      setError("");
      setSuccess("");
      await googleRegister({
        registrationToken: googleRegistrationToken,
        firstName: normalizedFirstName,
        lastName: normalizedLastName,
        phone: normalizedPhone,
        password: password.trim(),
        confirmPassword: confirmPassword.trim(),
        referenceCode
      });
      await clearStoredReferralCode();
      router.replace("/security/update-pin");
    } catch (registrationError) {
      setError(formatApiError(registrationError, "Registration failed"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={styles.page}>
      <LinearGradient colors={[colors.gradientStart, colors.gradientEnd]} end={{ x: 1, y: 1 }} start={{ x: 0, y: 0 }} style={styles.hero}>
        <Image source={require("../../assets/images/adaptive-icon.png")} style={styles.logo} resizeMode="contain" />
        <Text style={styles.tagline}>Google verify ke baad account details fill karo. Registration me OTP ki zaroorat nahi.</Text>
      </LinearGradient>

      <AppScreen padded={false} showPromo={false}>
        <View style={styles.content}>
          <SurfaceCard style={styles.formCard}>
            <Text style={styles.title}>Create Account</Text>
            <Text style={styles.subtitle}>Pehle Gmail se verify karo, phir name, mobile aur password details complete karo.</Text>

            <Pressable
              onPress={() => {
                void startGoogleRegistration();
              }}
              disabled={googleSubmitting}
              style={[styles.googleButton, googleSubmitting && styles.disabled]}
            >
              {googleSubmitting ? (
                <ActivityIndicator color="#111827" />
              ) : (
                <>
                  <Text style={styles.googleMark}>G</Text>
                  <Text style={styles.googleText}>{isGoogleRegistration ? "Change Google Account" : "Continue with Google"}</Text>
                </>
              )}
            </Pressable>

            {isGoogleRegistration ? (
              <View style={styles.googleVerifiedCard}>
                <Text style={styles.googleVerifiedTitle}>Google verified</Text>
                <Text style={styles.googleVerifiedEmail}>{googleEmail}</Text>
              </View>
            ) : null}

            {isGoogleRegistration ? (
              <>
                <View style={styles.fieldWrap}>
                  <Text style={styles.label}>First Name</Text>
                  <TextInput
                    onChangeText={(value) => {
                      setFirstName(value);
                      setError("");
                    }}
                    placeholder="Enter first name"
                    placeholderTextColor="#94a3b8"
                    style={styles.input}
                    value={firstName}
                  />
                </View>

                <View style={styles.fieldWrap}>
                  <Text style={styles.label}>Last Name</Text>
                  <TextInput
                    onChangeText={(value) => {
                      setLastName(value);
                      setError("");
                    }}
                    placeholder="Enter last name"
                    placeholderTextColor="#94a3b8"
                    style={styles.input}
                    value={lastName}
                  />
                </View>

                <View style={styles.fieldWrap}>
                  <Text style={styles.label}>Phone Number</Text>
                  <TextInput
                    keyboardType="phone-pad"
                    maxLength={10}
                    onChangeText={(value) => {
                      setPhone(value.replace(/[^0-9]/g, ""));
                      setError("");
                    }}
                    placeholder="Enter phone number"
                    placeholderTextColor="#94a3b8"
                    style={styles.input}
                    value={phone}
                  />
                </View>

                <View style={styles.fieldWrap}>
                  <Text style={styles.label}>Password</Text>
                  <TextInput
                    onChangeText={setPassword}
                    placeholder="Enter password"
                    placeholderTextColor="#94a3b8"
                    secureTextEntry
                    style={styles.input}
                    value={password}
                  />
                  <Text style={styles.helperText}>Minimum 8 characters required.</Text>
                </View>

                <View style={styles.fieldWrap}>
                  <Text style={styles.label}>Confirm Password</Text>
                  <TextInput
                    onChangeText={setConfirmPassword}
                    placeholder="Confirm password"
                    placeholderTextColor="#94a3b8"
                    secureTextEntry
                    style={styles.input}
                    value={confirmPassword}
                  />
                </View>

                <View style={styles.fieldWrap}>
                  <Text style={styles.label}>Reference Code (Optional)</Text>
                  <TextInput
                    autoCapitalize="characters"
                    onChangeText={(value) => {
                      const normalized = normalizeReferralCode(value);
                      setReferenceCode(normalized);
                      void writeStoredReferralCode(normalized);
                    }}
                    placeholder="Enter reference code if you have one"
                    placeholderTextColor="#94a3b8"
                    style={styles.input}
                    value={referenceCode}
                  />
                </View>
              </>
            ) : null}

            {error ? <Text style={styles.error}>{error}</Text> : null}
            {success ? <Text style={styles.success}>{success}</Text> : null}

            {isGoogleRegistration ? (
              <Pressable
                onPress={() => {
                  void submitRegistration();
                }}
                style={[styles.primaryButton, !canCreateAccount && styles.disabled]}
                disabled={!canCreateAccount}
              >
                {submitting ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.primaryText}>Create Account</Text>}
              </Pressable>
            ) : null}

            <View style={styles.linkGroup}>
              <Link href="/auth/login" style={styles.link}>
                Already have an account? Login
              </Link>
            </View>
          </SurfaceCard>
        </View>
      </AppScreen>
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
    maxWidth: 330,
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
  helperText: {
    color: "#64748b",
    fontSize: 12,
    lineHeight: 18
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
  googleVerifiedCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#bbf7d0",
    backgroundColor: "#f0fdf4",
    padding: 12,
    gap: 3
  },
  googleVerifiedTitle: {
    color: "#15803d",
    fontWeight: "900"
  },
  googleVerifiedEmail: {
    color: "#166534",
    fontWeight: "700"
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
  success: {
    color: "#15803d",
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
