import { useEffect, useRef, useState } from "react";
import { Link, router, useLocalSearchParams } from "expo-router";
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import * as Linking from "expo-linking";
import { AppScreen, SurfaceCard } from "@/components/ui";
import { useAppState } from "@/lib/app-state";
import { api, formatApiError } from "@/lib/api";
import { isMsg91NativeOtpAvailable, sendMsg91NativeOtp, verifyMsg91NativeOtp } from "@/lib/msg91-otp";
import { colors } from "@/theme/colors";

export default function OtpLoginScreen() {
  const OTP_RESEND_SECONDS = 30;
  const { otpLogin, isAuthenticated, loading } = useAppState();
  const params = useLocalSearchParams<{ msg91Token?: string; phone?: string }>();
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [sendingOtp, setSendingOtp] = useState(false);
  const [loggingIn, setLoggingIn] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [sdkReqId, setSdkReqId] = useState("");
  const [sdkAccessToken, setSdkAccessToken] = useState("");
  const handledTokenRef = useRef("");
  const normalizedPhone = phone.replace(/[^0-9]/g, "");
  const normalizedOtp = otp.replace(/[^0-9]/g, "");
  const hasValidPhone = normalizedPhone.length === 10;
  const hasValidOtp = normalizedOtp.length === 6;
  const verifiedAccessToken = sdkAccessToken || String(params.msg91Token || "").trim();

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
    if (callbackPhone && callbackPhone !== phone) {
      setPhone(callbackPhone);
    }
  }, [params.phone, phone]);

  useEffect(() => {
    if (!loading && isAuthenticated) {
      router.replace("/(tabs)");
    }
  }, [loading, isAuthenticated]);

  useEffect(() => {
    const token = String(params.msg91Token || "").trim();
    const callbackPhone = String(params.phone || "").replace(/[^0-9]/g, "");
    if (!token || !callbackPhone || handledTokenRef.current === token) {
      return;
    }

    handledTokenRef.current = token;
    void (async () => {
      try {
        setLoggingIn(true);
        setError("");
        setMessage("Mobile verified. Logging in...");
        await otpLogin(callbackPhone, "", token);
        router.replace("/(tabs)");
      } catch (loginError) {
        handledTokenRef.current = "";
        setError(formatApiError(loginError, "OTP login failed"));
      } finally {
        setLoggingIn(false);
      }
    })();
  }, [otpLogin, params.msg91Token, params.phone]);

  return (
    <View style={styles.page}>
      <LinearGradient colors={[colors.gradientStart, colors.gradientEnd]} end={{ x: 1, y: 1 }} start={{ x: 0, y: 0 }} style={styles.hero}>
        <Image source={require("../../assets/images/adaptive-icon.png")} style={styles.logo} resizeMode="contain" />
        <Text style={styles.tagline}>OTP se fast login karo. Phone number verify hone ke baad direct access mil jayega.</Text>
      </LinearGradient>

      <AppScreen padded={false} showPromo={false}>
        <View style={styles.content}>
          <SurfaceCard style={styles.formCard}>
            <Text style={styles.title}>OTP Login</Text>
            <Text style={styles.subtitle}>Phone number dalo, OTP lo, phir login karo.</Text>
            <Text style={styles.label}>Phone Number</Text>
            <TextInput
              keyboardType="phone-pad"
              maxLength={10}
              onChangeText={(value) => {
                setPhone(value.replace(/[^0-9]/g, ""));
                setError("");
                setMessage("");
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
                if (!hasValidPhone) {
                  setError("Valid 10 digit phone number dalo.");
                  return;
                }
                try {
                  setSendingOtp(true);
                  setError("");
                  setMessage("");
                  setSdkAccessToken("");
                  setSdkReqId("");
                  const response = await api.requestOtp(normalizedPhone, "login");
                  if (response.mode === "widget" && response.widgetUrl && isMsg91NativeOtpAvailable()) {
                    const sdkResponse = await sendMsg91NativeOtp(normalizedPhone);
                    if (sdkResponse.accessToken) {
                      setSdkAccessToken(sdkResponse.accessToken);
                      setMessage("Mobile verified. Login continue karo.");
                    } else {
                      setSdkReqId(sdkResponse.reqId);
                      setMessage("OTP SMS successfully sent.");
                    }
                    setCooldownSeconds(OTP_RESEND_SECONDS);
                    return;
                  }
                  if (response.mode === "widget" && response.widgetUrl) {
                    setMessage("Verification window open ho rahi hai...");
                    setCooldownSeconds(OTP_RESEND_SECONDS);
                    await Linking.openURL(response.widgetUrl);
                  } else {
                    setMessage(response.provider === "local" ? "OTP generated successfully." : "OTP SMS successfully sent.");
                    setCooldownSeconds(OTP_RESEND_SECONDS);
                  }
                } catch (otpError) {
                  setError(formatApiError(otpError, "Unable to send OTP"));
                } finally {
                  setSendingOtp(false);
                }
              }}
            >
              {sendingOtp ? (
                <ActivityIndicator color="#111827" />
              ) : (
                <Text style={styles.secondaryText}>
                  {cooldownSeconds > 0 ? `Wait ${cooldownSeconds}s` : message ? "Resend OTP" : "Send OTP"}
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
            ) : null}

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
              try {
                setLoggingIn(true);
                setError("");
                let accessToken = verifiedAccessToken;
                if (!accessToken && sdkReqId) {
                  setMessage("OTP verify ho raha hai...");
                  const verified = await verifyMsg91NativeOtp(sdkReqId, normalizedOtp);
                  accessToken = verified.accessToken;
                  setSdkAccessToken(accessToken);
                }
                await otpLogin(normalizedPhone, accessToken ? "" : normalizedOtp, accessToken);
                router.replace("/(tabs)");
              } catch (loginError) {
                setError(formatApiError(loginError, "OTP login failed"));
              } finally {
                setLoggingIn(false);
                }
              }}
              disabled={loggingIn || sendingOtp || !hasValidPhone || (!verifiedAccessToken && !hasValidOtp)}
              style={[styles.primaryButton, (loggingIn || sendingOtp || !hasValidPhone || (!verifiedAccessToken && !hasValidOtp)) && styles.disabled]}
            >
              {loggingIn ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.primaryText}>Login with OTP</Text>}
            </Pressable>

            <View style={styles.linkGroup}>
              <Link href="/auth/login" style={styles.link}>
                Back to password login
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
