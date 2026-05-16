import { useEffect, useRef, useState } from "react";
import { Link, useLocalSearchParams } from "expo-router";
import { ActivityIndicator, Image, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import * as Linking from "expo-linking";
import { AppScreen, SurfaceCard } from "@/components/ui";
import { api, formatApiError } from "@/lib/api";
import { isMsg91NativeOtpAvailable, sendMsg91NativeOtp, verifyMsg91NativeOtp } from "@/lib/msg91-otp";
import { colors } from "@/theme/colors";

export default function ForgotPasswordScreen() {
  const OTP_RESEND_SECONDS = 30;
  const params = useLocalSearchParams<{ msg91Token?: string; phone?: string }>();
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [sendingOtp, setSendingOtp] = useState(false);
  const [resettingPassword, setResettingPassword] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [verifiedAccessToken, setVerifiedAccessToken] = useState("");
  const [sdkReqId, setSdkReqId] = useState("");
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const sendingOtpRef = useRef(false);
  const normalizedPhone = phone.replace(/[^0-9]/g, "");
  const normalizedOtp = otp.replace(/[^0-9]/g, "");
  const hasValidPhone = normalizedPhone.length === 10;
  const hasValidOtp = normalizedOtp.length === 6;
  const hasValidPassword = password.trim().length >= 8;
  const passwordsMatch = password === confirmPassword && confirmPassword.length > 0;

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
    const callbackPhone = String(params.phone || "").replace(/[^0-9]/g, "");
    const token = String(params.msg91Token || "").trim();
    if (callbackPhone) {
      setPhone(callbackPhone);
    }
    if (token) {
      setVerifiedAccessToken(token);
      setMessage("Mobile number verified successfully. Ab naya password set karo.");
      setError("");
    }
  }, [params.msg91Token, params.phone]);

  return (
    <View style={styles.page}>
      <LinearGradient colors={[colors.gradientStart, colors.gradientEnd]} end={{ x: 1, y: 1 }} start={{ x: 0, y: 0 }} style={styles.hero}>
        <Image source={require("../../assets/images/adaptive-icon.png")} style={styles.logo} resizeMode="contain" />
        <Text style={styles.tagline}>Password reset ke liye OTP verify karke naya password set karo.</Text>
      </LinearGradient>

      <AppScreen padded={false} showPromo={false}>
        <View style={styles.content}>
          <SurfaceCard style={styles.formCard}>
            <Text style={styles.title}>Forgot Password</Text>
            <Text style={styles.subtitle}>Phone number par OTP lo, phir new password set karo.</Text>
            <Text style={styles.label}>Phone Number</Text>
            <TextInput
              keyboardType="phone-pad"
              maxLength={10}
              onChangeText={(value) => {
                setPhone(value.replace(/[^0-9]/g, ""));
                setError("");
              }}
              style={styles.input}
              value={phone}
              placeholder="Enter phone number"
              placeholderTextColor="#94a3b8"
            />

            <Pressable
              disabled={sendingOtp || cooldownSeconds > 0 || !hasValidPhone}
              style={[styles.secondaryButton, (sendingOtp || cooldownSeconds > 0 || !hasValidPhone) && styles.disabled]}
              onPress={async () => {
                if (sendingOtpRef.current) {
                  return;
                }
                if (!hasValidPhone) {
                  setError("Valid 10 digit phone number dalo.");
                  return;
                }
                try {
                  sendingOtpRef.current = true;
                  setSendingOtp(true);
                  setError("");
                  setMessage("");
                  setVerifiedAccessToken("");
                  setSdkReqId("");
                  const response = await api.requestOtp(normalizedPhone, "password_reset");
                  if (response.mode === "widget" && isMsg91NativeOtpAvailable()) {
                    try {
                      const sdkResponse = await sendMsg91NativeOtp(normalizedPhone);
                      if (sdkResponse.accessToken) {
                        setVerifiedAccessToken(sdkResponse.accessToken);
                        setMessage("Mobile number verified successfully. Ab naya password set karo.");
                      } else {
                        setSdkReqId(sdkResponse.reqId);
                        setMessage("Password reset OTP SMS successfully sent.");
                      }
                      setCooldownSeconds(OTP_RESEND_SECONDS);
                      return;
                    } catch {
                      if (Platform.OS !== "web" && response.widgetUrl) {
                        setMessage("Verification window open ho rahi hai...");
                        setCooldownSeconds(OTP_RESEND_SECONDS);
                        await Linking.openURL(response.widgetUrl);
                        return;
                      }
                      throw new Error("MSG91 OTP method available nahi hai.");
                    }
                  }
                  if (response.mode === "widget" && response.widgetUrl) {
                    setMessage("Verification window open ho rahi hai...");
                    setCooldownSeconds(OTP_RESEND_SECONDS);
                    await Linking.openURL(response.widgetUrl);
                  } else {
                    setMessage(response.provider === "local" ? "Password reset OTP generated." : "Password reset OTP SMS successfully sent.");
                    setCooldownSeconds(OTP_RESEND_SECONDS);
                  }
                } catch (otpError) {
                  setError(formatApiError(otpError, "Unable to send OTP"));
                } finally {
                  sendingOtpRef.current = false;
                  setSendingOtp(false);
                }
              }}
            >
              {sendingOtp ? (
                <ActivityIndicator color="#111827" />
              ) : (
                <Text style={styles.secondaryText}>
                  {cooldownSeconds > 0 ? `Wait ${cooldownSeconds}s` : message ? "Resend OTP" : "Send Reset OTP"}
                </Text>
              )}
            </Pressable>

            {!verifiedAccessToken ? (
              <>
                <Text style={styles.label}>OTP</Text>
                <TextInput
                  keyboardType="number-pad"
                  maxLength={6}
                  onChangeText={(value) => {
                    setOtp(value.replace(/[^0-9]/g, ""));
                    setError("");
                  }}
                  style={styles.input}
                  value={otp}
                  placeholder="Enter 6 digit OTP"
                  placeholderTextColor="#94a3b8"
                />
              </>
            ) : (
              <Text style={styles.success}>Mobile verification complete. OTP manually daalne ki zaroorat nahi hai.</Text>
            )}

            <Text style={styles.label}>New Password</Text>
            <TextInput secureTextEntry onChangeText={setPassword} style={styles.input} value={password} placeholder="Enter new password" placeholderTextColor="#94a3b8" />
            <Text style={styles.helperText}>Minimum 8 characters or more required.</Text>

            <Text style={styles.label}>Confirm Password</Text>
            <TextInput secureTextEntry onChangeText={setConfirmPassword} style={styles.input} value={confirmPassword} placeholder="Confirm new password" placeholderTextColor="#94a3b8" />

            {message ? <Text style={styles.success}>{message}</Text> : null}
            {error ? <Text style={styles.error}>{error}</Text> : null}

            <Pressable
              onPress={async () => {
                if (!hasValidPhone) {
                  setError("Valid 10 digit phone number dalo.");
                  return;
                }
                if (!verifiedAccessToken && !hasValidOtp) {
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
                  setResettingPassword(true);
                  setError("");
                  setMessage("");
                  let accessToken = verifiedAccessToken;
                  if (!accessToken && (sdkReqId || Platform.OS === "web")) {
                    setMessage("OTP verify ho raha hai...");
                    const verified = await verifyMsg91NativeOtp(sdkReqId, normalizedOtp);
                    accessToken = verified.accessToken;
                    setVerifiedAccessToken(accessToken);
                  }
                  await api.forgotPassword(normalizedPhone, accessToken ? "" : normalizedOtp, password.trim(), confirmPassword.trim(), accessToken);
                  setMessage("Password reset successful. Ab login karo.");
                  setOtp("");
                  setPassword("");
                  setConfirmPassword("");
                  setVerifiedAccessToken("");
                } catch (resetError) {
                  setError(formatApiError(resetError, "Unable to reset password"));
                } finally {
                  setResettingPassword(false);
                }
              }}
              disabled={resettingPassword || sendingOtp || !hasValidPhone || (!verifiedAccessToken && !hasValidOtp) || !hasValidPassword || !passwordsMatch}
              style={[styles.primaryButton, (resettingPassword || sendingOtp || !hasValidPhone || (!verifiedAccessToken && !hasValidOtp) || !hasValidPassword || !passwordsMatch) && styles.disabled]}
            >
              {resettingPassword ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.primaryText}>Reset Password</Text>}
            </Pressable>

            <View style={styles.linkGroup}>
              <Link href="/auth/login" style={styles.link}>
                Back to login
              </Link>
            </View>
          </SurfaceCard>
        </View>
      </AppScreen>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  hero: { paddingTop: 52, paddingBottom: 48, paddingHorizontal: 22, backgroundColor: colors.gradientStart, alignItems: "center" },
  logo: { width: "78%", maxWidth: 280, height: 110, marginTop: 20, marginBottom: 0 },
  tagline: { maxWidth: 320, color: colors.whiteOverlayTextStrong, lineHeight: 20, marginTop: -14, textAlign: "center" },
  content: { width: "100%", maxWidth: 480, marginTop: 0, paddingHorizontal: 16, paddingBottom: 32, alignSelf: "center" },
  formCard: { width: "100%", borderRadius: 24 },
  title: { color: "#111827", fontSize: 24, fontWeight: "800" },
  subtitle: { color: "#64748b", lineHeight: 20 },
  label: { color: "#0f172a", fontWeight: "700" },
  helperText: { color: "#64748b", fontSize: 12, lineHeight: 18 },
  input: { minHeight: 50, borderRadius: 14, borderWidth: 1, borderColor: "#dbe1ea", paddingHorizontal: 14, color: "#111827", backgroundColor: "#f8fafc" },
  primaryButton: { minHeight: 48, borderRadius: 999, backgroundColor: "#111827", alignItems: "center", justifyContent: "center" },
  secondaryButton: { minHeight: 48, borderRadius: 999, backgroundColor: "#fff7ed", borderWidth: 1, borderColor: "#fdba74", alignItems: "center", justifyContent: "center", shadowColor: "#fb923c", shadowOpacity: 0.12, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 2 },
  primaryText: { color: "#ffffff", fontWeight: "800", fontSize: 15 },
  secondaryText: { color: "#111827", fontWeight: "800" },
  disabled: { opacity: 0.7 },
  error: { color: "#dc2626", fontWeight: "600" },
  success: { color: "#16a34a", fontWeight: "600" },
  linkGroup: { gap: 12, paddingTop: 4 },
  link: { color: "#111827", fontWeight: "700", textAlign: "center" }
});
