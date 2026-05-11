import { useEffect, useState } from "react";
import { Link, router, useLocalSearchParams } from "expo-router";
import { ActivityIndicator, Image, Linking, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { AppScreen, SurfaceCard } from "@/components/ui";
import { useAppState } from "@/lib/app-state";
import { api, formatApiError } from "@/lib/api";
import { requestGoogleAccessToken } from "@/lib/google-auth";
import { isMsg91NativeOtpAvailable, sendMsg91NativeOtp, verifyMsg91NativeOtp } from "@/lib/msg91-otp";
import { clearStoredReferralCode, normalizeReferralCode, readStoredReferralCode, writeStoredReferralCode } from "@/lib/referral-storage";
import { colors } from "@/theme/colors";

export default function RegisterScreen() {
  const OTP_RESEND_SECONDS = 30;
  const { register, googleLogin, googleRegister } = useAppState();
  const params = useLocalSearchParams<{
    ref?: string;
    referenceCode?: string;
    referralCode?: string;
    msg91Token?: string;
    phone?: string;
    googleRegistrationToken?: string;
    googleEmail?: string;
    googleName?: string;
    googleGivenName?: string;
    googleFamilyName?: string;
  }>();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [referenceCode, setReferenceCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [registered, setRegistered] = useState(false);
  const [verifiedAccessToken, setVerifiedAccessToken] = useState("");
  const [sdkReqId, setSdkReqId] = useState("");
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [googleRegistrationToken, setGoogleRegistrationToken] = useState("");
  const [googleEmail, setGoogleEmail] = useState("");
  const incomingReferralCode = normalizeReferralCode(params.ref ?? params.referenceCode ?? params.referralCode);
  const downloadUrl = String(process.env.EXPO_PUBLIC_DOWNLOAD_URL || process.env.EXPO_PUBLIC_APP_DOWNLOAD_URL || "").trim();
  const normalizedPhone = phone.replace(/[^0-9]/g, "");
  const normalizedOtp = otp.replace(/[^0-9]/g, "");
  const normalizedFirstName = firstName.trim();
  const normalizedLastName = lastName.trim();
  const hasValidFirstName = normalizedFirstName.length >= 2;
  const hasValidLastName = normalizedLastName.length >= 2;
  const hasValidPhone = normalizedPhone.length === 10;
  const hasValidOtp = normalizedOtp.length === 6;
  const hasValidPassword = password.trim().length >= 8;
  const passwordsMatch = password === confirmPassword && confirmPassword.length > 0;
  const isGoogleRegistration = Boolean(googleRegistrationToken && googleEmail);
  const canCreateAccount =
    !registered &&
    !submitting &&
    hasValidFirstName &&
    hasValidLastName &&
    hasValidPhone &&
    (isGoogleRegistration || verifiedAccessToken || hasValidOtp) &&
    hasValidPassword &&
    passwordsMatch;

  useEffect(() => {
    if (cooldownSeconds <= 0) {
      return;
    }
    const timer = setInterval(() => {
      setCooldownSeconds((current) => (current > 0 ? current - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldownSeconds]);

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
    const callbackPhone = String(params.phone || "").replace(/[^0-9]/g, "");
    const token = String(params.msg91Token || "").trim();
    if (callbackPhone) {
      setPhone(callbackPhone);
    }
    if (token) {
      setVerifiedAccessToken(token);
      setSuccess("Mobile number verified successfully.");
      setError("");
    }
  }, [params.msg91Token, params.phone]);

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
    if (!firstName) {
      setFirstName(givenName || fullName.split(/\s+/)[0] || "");
    }
    if (!lastName) {
      setLastName(familyName || fullName.split(/\s+/).slice(1).join(" ") || "User");
    }
    setVerifiedAccessToken("");
    setOtp("");
    setSuccess(`Google verified: ${email}. Ab phone aur password dalke account create karo.`);
    setError("");
  }, [firstName, lastName, params.googleEmail, params.googleFamilyName, params.googleGivenName, params.googleName, params.googleRegistrationToken]);

  return (
    <View style={styles.page}>
      <LinearGradient colors={[colors.gradientStart, colors.gradientEnd]} end={{ x: 1, y: 1 }} start={{ x: 0, y: 0 }} style={styles.hero}>
        <Image source={require("../../assets/images/adaptive-icon.png")} style={styles.logo} resizeMode="contain" />
        <Text style={styles.tagline}>Register with mobile number and password. OTP verification required hai.</Text>
      </LinearGradient>

      <AppScreen padded={false} showPromo={false}>
        <View style={styles.content}>
          <SurfaceCard style={styles.formCard}>
            <Text style={styles.title}>Create Account</Text>
            <Text style={styles.subtitle}>Pehle Google se verify karo. Agar Google nahi use karna hai to mobile OTP option bhi available hai.</Text>
            <Pressable
              onPress={async () => {
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
                  setOtp("");
                  setVerifiedAccessToken("");
                  setSuccess(`Google verified: ${response.profile.email}. Ab phone aur password dalke account create karo.`);
                } catch (googleError) {
                  setError(formatApiError(googleError, "Google login failed"));
                } finally {
                  setGoogleSubmitting(false);
                }
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
            {isGoogleRegistration ? (
              <View style={styles.googleVerifiedCard}>
                <Text style={styles.googleVerifiedTitle}>Google verified</Text>
                <Text style={styles.googleVerifiedEmail}>{googleEmail}</Text>
              </View>
            ) : (
              <View style={styles.dividerRow}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>or mobile OTP</Text>
                <View style={styles.dividerLine} />
              </View>
            )}
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

            {!isGoogleRegistration ? <Pressable
              onPress={async () => {
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
                try {
                  setSendingOtp(true);
                  setError("");
                  setSuccess("");
                  setVerifiedAccessToken("");
                  setSdkReqId("");
                  const response = await api.requestOtp(normalizedPhone, "register");
                  if (response.mode === "widget" && response.widgetUrl && isMsg91NativeOtpAvailable()) {
                    const sdkResponse = await sendMsg91NativeOtp(normalizedPhone);
                    if (sdkResponse.accessToken) {
                      setVerifiedAccessToken(sdkResponse.accessToken);
                      setSuccess("Mobile number verified successfully.");
                    } else {
                      setSdkReqId(sdkResponse.reqId);
                      setSuccess("Registration OTP SMS successfully sent.");
                    }
                    setCooldownSeconds(OTP_RESEND_SECONDS);
                    return;
                  }
                  if (response.mode === "widget" && response.widgetUrl) {
                    setSuccess("Verification window open ho rahi hai...");
                    setCooldownSeconds(OTP_RESEND_SECONDS);
                    await Linking.openURL(response.widgetUrl);
                  } else {
                    setSuccess(response.provider === "local" ? "Registration OTP generated successfully." : "Registration OTP SMS successfully sent.");
                    setCooldownSeconds(OTP_RESEND_SECONDS);
                  }
                } catch (otpError) {
                  setError(formatApiError(otpError, "Unable to send registration OTP"));
                } finally {
                  setSendingOtp(false);
                }
              }}
              disabled={sendingOtp || cooldownSeconds > 0 || !hasValidFirstName || !hasValidLastName || !hasValidPhone}
              style={[styles.secondaryButton, (sendingOtp || cooldownSeconds > 0 || !hasValidFirstName || !hasValidLastName || !hasValidPhone) && styles.disabled]}
            >
              {sendingOtp ? (
                <ActivityIndicator color="#111827" />
              ) : (
                <Text style={styles.secondaryText}>
                  {cooldownSeconds > 0 ? `Wait ${cooldownSeconds}s` : success ? "Resend OTP" : "Send OTP"}
                </Text>
              )}
            </Pressable> : null}

            {!isGoogleRegistration && !verifiedAccessToken ? (
              <View style={styles.fieldWrap}>
                <Text style={styles.label}>OTP</Text>
                <TextInput
                  keyboardType="number-pad"
                  maxLength={6}
                  onChangeText={(value) => {
                    setOtp(value.replace(/[^0-9]/g, ""));
                    setError("");
                  }}
                  placeholder="Enter 6 digit OTP"
                  placeholderTextColor="#94a3b8"
                  style={styles.input}
                  value={otp}
                />
              </View>
            ) : !isGoogleRegistration ? (
              <Text style={styles.autoReferralHint}>Mobile verification complete. Ab account create kar sakte ho.</Text>
            ) : null}

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
              <Text style={styles.helperText}>Minimum 8 characters or more required.</Text>
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

            {error ? <Text style={styles.error}>{error}</Text> : null}
            {success ? <Text style={styles.success}>{success}</Text> : null}
            {registered ? (
              <View style={styles.nextStepsWrap}>
                <Pressable onPress={() => router.push("/auth/login")} style={styles.primaryButton}>
                  <Text style={styles.primaryText}>Go to Login</Text>
                </Pressable>
                {downloadUrl ? (
                  <Pressable
                    onPress={() => {
                      void Linking.openURL(downloadUrl);
                    }}
                    style={styles.secondaryButton}
                  >
                    <Text style={styles.secondaryText}>Download App</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}

            <Pressable
              onPress={async () => {
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
                if (!isGoogleRegistration && !verifiedAccessToken && !hasValidOtp) {
                  setError("Valid 6 digit OTP dalo.");
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
                  if (isGoogleRegistration) {
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
                    router.replace("/(tabs)");
                    return;
                  }
                  let accessToken = verifiedAccessToken;
                  if (!accessToken && sdkReqId) {
                    setSuccess("OTP verify ho raha hai...");
                    const verified = await verifyMsg91NativeOtp(sdkReqId, normalizedOtp);
                    accessToken = verified.accessToken;
                    setVerifiedAccessToken(accessToken);
                  }
                  await register(normalizedFirstName, normalizedLastName, normalizedPhone, accessToken ? "" : normalizedOtp, password.trim(), confirmPassword.trim(), referenceCode, accessToken);
                  setError("");
                  await clearStoredReferralCode();
                  setRegistered(true);
                  setSuccess("Phone verified. Account created successfully. Ab aap direct login kar sakte ho.");
                  setFirstName("");
                  setLastName("");
                  setPhone("");
                  setOtp("");
                  setPassword("");
                  setConfirmPassword("");
                  setReferenceCode("");
                  setVerifiedAccessToken("");
                } catch (registrationError) {
                  setError(formatApiError(registrationError, "Registration failed"));
                } finally {
                  setSubmitting(false);
                }
              }}
              style={[styles.primaryButton, !canCreateAccount && styles.disabled]}
              disabled={!canCreateAccount}
            >
              {submitting ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.primaryText}>{isGoogleRegistration ? "Create Google Account" : "Create Account"}</Text>}
            </Pressable>

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
  autoReferralHint: {
    color: "#15803d",
    fontWeight: "700",
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
  secondaryButton: {
    minHeight: 48,
    borderRadius: 999,
    backgroundColor: "#fff7ed",
    borderWidth: 1,
    borderColor: "#fdba74",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#fb923c",
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2
  },
  secondaryText: {
    color: "#111827",
    fontWeight: "800",
    fontSize: 15
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
  nextStepsWrap: {
    gap: 10
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
