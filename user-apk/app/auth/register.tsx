import { useEffect, useRef, useState } from "react";
import { Link, router, useLocalSearchParams } from "expo-router";
import { ActivityIndicator, Image, Linking, Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { AppScreen, SurfaceCard } from "@/components/ui";
import { useAppState } from "@/lib/app-state";
import { api, formatApiError } from "@/lib/api";
import { verifyMsg91NativeOtp } from "@/lib/msg91-otp";
import { clearStoredReferralCode, normalizeReferralCode, readStoredReferralCode, writeStoredReferralCode } from "@/lib/referral-storage";
import { colors } from "@/theme/colors";

const APK_DOWNLOAD_URL = "https://realmatka.in/download";

export default function RegisterScreen() {
  const { register } = useAppState();
  const params = useLocalSearchParams<{
    ref?: string;
    referenceCode?: string;
    referralCode?: string;
    msg91Token?: string;
    phone?: string;
    purpose?: string;
  }>();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [referenceCode, setReferenceCode] = useState("");
  const [verifiedAccessToken, setVerifiedAccessToken] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [otpSubmitting, setOtpSubmitting] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [sdkReqId, setSdkReqId] = useState("");
  const [otpMode, setOtpMode] = useState<"otp" | "widget">("otp");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [successModalVisible, setSuccessModalVisible] = useState(false);
  const sendingOtpRef = useRef(false);
  const incomingReferralCode = normalizeReferralCode(params.ref ?? params.referenceCode ?? params.referralCode);
  const normalizedPhone = phone.replace(/[^0-9]/g, "").slice(-10);
  const normalizedFirstName = firstName.trim();
  const normalizedLastName = lastName.trim();
  const hasValidFirstName = normalizedFirstName.length >= 2;
  const hasValidLastName = normalizedLastName.length >= 2;
  const hasValidPhone = normalizedPhone.length === 10;
  const hasValidPassword = password.trim().length >= 8;
  const passwordsMatch = password === confirmPassword && confirmPassword.length > 0;
  const isPhoneVerified = Boolean(verifiedAccessToken) || (otpMode !== "widget" && /^[0-9]{6}$/.test(otp));
  const canCreateAccount =
    !submitting &&
    hasValidFirstName &&
    hasValidLastName &&
    hasValidPhone &&
    hasValidPassword &&
    passwordsMatch &&
    isPhoneVerified;

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
    const token = String(params.msg91Token || "").trim();
    const callbackPhone = String(params.phone || "").replace(/[^0-9]/g, "").slice(-10);
    const purpose = String(params.purpose || "").trim();
    if (!token || purpose !== "register") {
      return;
    }

    setVerifiedAccessToken(token);
    if (callbackPhone) {
      setPhone(callbackPhone);
    }
    setOtp("");
    setOtpSent(true);
    setSuccess("Mobile verification complete. Ab account details fill karke Create Account dabao.");
    setError("");
  }, [params.msg91Token, params.phone, params.purpose]);

  async function sendRegisterOtp() {
    if (sendingOtpRef.current) {
      return;
    }
    if (!hasValidPhone) {
      setError("Valid 10 digit phone number dalo.");
      return;
    }

    try {
      sendingOtpRef.current = true;
      setOtpSubmitting(true);
      setError("");
      setSuccess("");
      setVerifiedAccessToken("");
      setSdkReqId("");
      setOtpMode("otp");
      setOtp("");
      const response = await api.requestOtp(normalizedPhone, "register");
      setOtpMode(response.mode === "widget" ? "widget" : "otp");
      if (response.mode === "widget" && response.widgetUrl) {
        setSuccess("Verification page open ho raha hai. OTP verify karke wapas aao.");
        await Linking.openURL(response.widgetUrl);
        return;
      }
      if (response.mode === "widget") {
        throw new Error("OTP verification link nahi mila. Backend widget env check karo.");
      }
      setOtpSent(true);
      setSuccess("OTP sent. 6 digit OTP enter karo.");
    } catch (otpError) {
      setError(formatApiError(otpError, "Unable to send OTP"));
    } finally {
      sendingOtpRef.current = false;
      setOtpSubmitting(false);
    }
  }

  async function verifyRegisterOtp() {
    const normalizedOtp = otp.replace(/[^0-9]/g, "");
    if (!sdkReqId) {
      setError("Pehle OTP send karo.");
      return;
    }
    if (!/^[0-9]{6}$/.test(normalizedOtp)) {
      setError("Valid 6 digit OTP dalo.");
      return;
    }

    try {
      setOtpVerifying(true);
      setError("");
      setSuccess("OTP verify ho raha hai...");
      const verified = await verifyMsg91NativeOtp(sdkReqId, normalizedOtp);
      setVerifiedAccessToken(verified.accessToken);
      setOtp("");
      setSuccess("Mobile verification complete. Ab account details fill karke Create Account dabao.");
    } catch (verifyError) {
      setError(formatApiError(verifyError, "OTP verify nahi hua"));
      setSuccess("");
    } finally {
      setOtpVerifying(false);
    }
  }

  async function submitRegistration() {
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
    if (!isPhoneVerified) {
      setError("Pehle mobile OTP verify karo.");
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
      await register(
        normalizedFirstName,
        normalizedLastName,
        normalizedPhone,
        verifiedAccessToken ? "" : otp.trim(),
        password.trim(),
        confirmPassword.trim(),
        referenceCode,
        verifiedAccessToken
      );
      await clearStoredReferralCode();
      setSuccess("Account created successfully. Ab login karo.");
      setSuccessModalVisible(true);
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
        <Text style={styles.tagline}>Mobile OTP verify karo, phir account details complete karo.</Text>
      </LinearGradient>

      <AppScreen padded={false} showPromo={false}>
        <View style={styles.content}>
          <SurfaceCard style={styles.formCard}>
            <Text style={styles.title}>Create Account</Text>
            <Text style={styles.subtitle}>Phone number par OTP verify hoga. Verification ke baad account create hoga.</Text>

            <View style={styles.fieldWrap}>
              <Text style={styles.label}>Phone Number</Text>
              <View style={styles.phoneRow}>
                <TextInput
                  keyboardType="phone-pad"
                  maxLength={10}
                  onChangeText={(value) => {
                    setPhone(value.replace(/[^0-9]/g, ""));
                    setVerifiedAccessToken("");
                    setSdkReqId("");
                    setOtpMode("otp");
                    setOtpSent(false);
                    setOtp("");
                    setError("");
                  }}
                  placeholder="Enter phone number"
                  placeholderTextColor="#94a3b8"
                  style={[styles.input, styles.phoneInput]}
                  value={phone}
                />
                <Pressable disabled={!hasValidPhone || otpSubmitting} onPress={() => void sendRegisterOtp()} style={[styles.otpButton, (!hasValidPhone || otpSubmitting) && styles.disabled]}>
                  {otpSubmitting ? <ActivityIndicator color="#111827" size="small" /> : <Text style={styles.otpButtonText}>{verifiedAccessToken ? "Verified" : "Send OTP"}</Text>}
                </Pressable>
              </View>
            </View>

            {otpSent && !verifiedAccessToken ? (
              <View style={styles.fieldWrap}>
                <Text style={styles.label}>OTP</Text>
                <View style={styles.phoneRow}>
                  <TextInput
                    keyboardType="number-pad"
                    maxLength={6}
                    onChangeText={(value) => {
                      setOtp(value.replace(/[^0-9]/g, ""));
                      setError("");
                    }}
                    placeholder="Enter 6 digit OTP"
                    placeholderTextColor="#94a3b8"
                    style={[styles.input, styles.phoneInput]}
                    value={otp}
                  />
                  {otpMode === "widget" ? (
                    <Pressable
                      disabled={!/^[0-9]{6}$/.test(otp) || otpVerifying}
                      onPress={() => void verifyRegisterOtp()}
                      style={[styles.otpButton, (!/^[0-9]{6}$/.test(otp) || otpVerifying) && styles.disabled]}
                    >
                      {otpVerifying ? <ActivityIndicator color="#111827" size="small" /> : <Text style={styles.otpButtonText}>Verify</Text>}
                    </Pressable>
                  ) : null}
                </View>
              </View>
            ) : null}

            {verifiedAccessToken ? (
              <View style={styles.verifiedCard}>
                <Text style={styles.verifiedTitle}>Mobile verified</Text>
                <Text style={styles.verifiedText}>+91 {normalizedPhone}</Text>
              </View>
            ) : null}

            <View style={styles.fieldWrap}>
              <Text style={styles.label}>First Name</Text>
              <TextInput onChangeText={setFirstName} placeholder="Enter first name" placeholderTextColor="#94a3b8" style={styles.input} value={firstName} />
            </View>

            <View style={styles.fieldWrap}>
              <Text style={styles.label}>Last Name</Text>
              <TextInput onChangeText={setLastName} placeholder="Enter last name" placeholderTextColor="#94a3b8" style={styles.input} value={lastName} />
            </View>

            <View style={styles.fieldWrap}>
              <Text style={styles.label}>Password</Text>
              <TextInput onChangeText={setPassword} placeholder="Enter password" placeholderTextColor="#94a3b8" secureTextEntry style={styles.input} value={password} />
              <Text style={styles.helperText}>Minimum 8 characters required.</Text>
            </View>

            <View style={styles.fieldWrap}>
              <Text style={styles.label}>Confirm Password</Text>
              <TextInput onChangeText={setConfirmPassword} placeholder="Confirm password" placeholderTextColor="#94a3b8" secureTextEntry style={styles.input} value={confirmPassword} />
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

            <Pressable
              onPress={() => {
                void submitRegistration();
              }}
              style={[styles.primaryButton, !canCreateAccount && styles.disabled]}
              disabled={!canCreateAccount}
            >
              {submitting ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.primaryText}>Create Account</Text>}
            </Pressable>

            <View style={styles.linkGroup}>
              <Link href="/auth/login" style={styles.link}>
                Already have an account? Login
              </Link>
            </View>
          </SurfaceCard>
        </View>
      </AppScreen>
      <Modal animationType="fade" transparent visible={successModalVisible} onRequestClose={() => setSuccessModalVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.successModal}>
            <LinearGradient colors={[colors.gradientStart, colors.gradientEnd]} end={{ x: 1, y: 0 }} start={{ x: 0, y: 0 }} style={styles.modalHeader}>
              <View style={styles.modalLogoWrap}>
                <Image source={require("../../assets/images/adaptive-icon.png")} style={styles.modalLogo} resizeMode="contain" />
              </View>
              <Text style={styles.modalHeaderText}>Real Matka</Text>
            </LinearGradient>
            <Text style={styles.modalTitle}>Account Created Successfully</Text>
            <Text style={styles.modalText}>
              Aapka account create ho gaya hai. Ab login page par jaakar login karo, ya latest APK download karke app me continue karo.
            </Text>
            <Pressable
              style={styles.modalPrimaryButton}
              onPress={() => {
                setSuccessModalVisible(false);
                router.replace("/auth/login");
              }}
            >
              <Text style={styles.modalPrimaryText}>Go to Login Page</Text>
            </Pressable>
            <Pressable style={styles.modalSecondaryButton} onPress={() => void Linking.openURL(APK_DOWNLOAD_URL)}>
              <Text style={styles.modalSecondaryText}>Open Download Page</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
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
  phoneRow: {
    flexDirection: "row",
    gap: 8
  },
  phoneInput: {
    flex: 1
  },
  otpButton: {
    minHeight: 50,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#dbe1ea",
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14
  },
  otpButtonText: {
    color: "#111827",
    fontWeight: "900",
    fontSize: 13
  },
  verifiedCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#bbf7d0",
    backgroundColor: "#f0fdf4",
    padding: 12,
    gap: 3
  },
  verifiedTitle: {
    color: "#15803d",
    fontWeight: "900"
  },
  verifiedText: {
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
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.62)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20
  },
  successModal: {
    width: "100%",
    maxWidth: 380,
    borderRadius: 12,
    backgroundColor: "#ffffff",
    padding: 18,
    alignItems: "center",
    gap: 14,
    shadowColor: "#000000",
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 8
  },
  modalHeader: {
    width: "100%",
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 14,
    alignItems: "center",
    gap: 8
  },
  modalLogoWrap: {
    width: 78,
    height: 78,
    borderRadius: 18,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.65)"
  },
  modalLogo: {
    width: 68,
    height: 68
  },
  modalHeaderText: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "900",
    letterSpacing: 0.2
  },
  modalTitle: {
    color: "#111827",
    fontSize: 22,
    fontWeight: "900",
    textAlign: "center"
  },
  modalText: {
    color: "#475569",
    fontSize: 14,
    lineHeight: 21,
    textAlign: "center"
  },
  modalPrimaryButton: {
    width: "100%",
    minHeight: 48,
    borderRadius: 999,
    backgroundColor: "#111827",
    alignItems: "center",
    justifyContent: "center"
  },
  modalPrimaryText: {
    color: "#ffffff",
    fontWeight: "900"
  },
  modalSecondaryButton: {
    width: "100%",
    minHeight: 48,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#fed7aa",
    backgroundColor: "#fff7ed",
    alignItems: "center",
    justifyContent: "center"
  },
  modalSecondaryText: {
    color: "#c2410c",
    fontWeight: "900"
  }
});
