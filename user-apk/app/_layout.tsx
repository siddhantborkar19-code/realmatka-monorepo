import { Stack, usePathname, useRouter } from "expo-router";
import { Component, ReactNode, useEffect, useRef, useState } from "react";
import { StatusBar } from "expo-status-bar";
import Constants from "expo-constants";
import * as Linking from "expo-linking";
import { AppState as NativeAppState, Modal, Platform, Pressable, Text, View } from "react-native";
import { AppChromeProvider } from "@/components/ui";
import { PinVerificationModal } from "@/components/pin-verification-modal";
import { UniversalBottomTabs } from "@/components/universal-bottom-tabs";
import { api } from "@/lib/api";
import { AppStateProvider, useAppState } from "@/lib/app-state";
import {
  getNotificationTargetUrl,
  initializeNotificationBehavior,
  isExpoGoEnvironment,
  logPushError,
  registerDeviceForPushNotifications
} from "@/lib/push-notifications";
import { colors } from "@/theme/colors";

const WEB_ACTIVE_WINDOW_KEY = "realmatka.active-web-window";
const WEB_WINDOW_HEARTBEAT_MS = 3000;
const WEB_WINDOW_STALE_MS = 9000;
const UPDATE_DOWNLOAD_PAGE_URL = "https://realmatka.in/download";
const PIN_IDLE_LOCK_MS = 10 * 60 * 1000;

export default function RootLayout() {
  return (
    <RootErrorBoundary>
      <AppStateProvider>
        <AppChromeProvider>
          <RootNavigator />
        </AppChromeProvider>
      </AppStateProvider>
    </RootErrorBoundary>
  );
}

function RootNavigator() {
  const router = useRouter();
  const pathname = usePathname();
  const { currentUser, loading, logout, sessionToken } = useAppState();
  const isAuthRoute = pathname.startsWith("/auth");
  const isPinSetupRoute = pathname.startsWith("/security/update-pin");
  const isAuthenticated = Boolean(sessionToken && currentUser);
  const [appUpdatePrompt, setAppUpdatePrompt] = useState<{
    latestVersion: string;
    apkUrl: string;
    required: boolean;
    title: string;
    message: string;
  } | null>(null);
  const [windowGuardBlocked, setWindowGuardBlocked] = useState(false);
  const [windowGuardCloseHint, setWindowGuardCloseHint] = useState(false);
  const [pinLockVisible, setPinLockVisible] = useState(false);
  const [pinSetupPromptVisible, setPinSetupPromptVisible] = useState(false);
  const registeredPushSessionTokenRef = useRef("");
  const updateCheckCompletedRef = useRef(false);
  const webWindowIdRef = useRef(`web_${Math.random().toString(36).slice(2, 10)}`);
  const unlockedSessionTokenRef = useRef("");
  const pinPromptDismissedSessionRef = useRef("");
  const lastActivityAtRef = useRef(Date.now());
  const wasBackgroundedRef = useRef(false);

  function markUserActivity() {
    lastActivityAtRef.current = Date.now();
  }

  useEffect(() => {
    if (loading) {
      return;
    }

    if (!isAuthenticated && !isAuthRoute) {
      router.replace("/auth/login");
      return;
    }

    if (isAuthenticated && isAuthRoute) {
      router.replace("/(tabs)");
    }
  }, [currentUser, isAuthRoute, isAuthenticated, loading, router, sessionToken]);

  useEffect(() => {
    if (!sessionToken || !currentUser) {
      unlockedSessionTokenRef.current = "";
      pinPromptDismissedSessionRef.current = "";
      setPinLockVisible(false);
      setPinSetupPromptVisible(false);
      return;
    }

    if (loading || isAuthRoute) {
      return;
    }

    if (isPinSetupRoute) {
      unlockedSessionTokenRef.current = sessionToken;
      setPinLockVisible(false);
      setPinSetupPromptVisible(false);
      return;
    }

    if (currentUser.hasMpin) {
      setPinSetupPromptVisible(false);
      if (unlockedSessionTokenRef.current !== sessionToken) {
        setPinLockVisible(true);
      }
      return;
    }

    if (pinPromptDismissedSessionRef.current !== sessionToken) {
      setPinSetupPromptVisible(true);
    }
  }, [currentUser, isAuthRoute, isPinSetupRoute, loading, sessionToken]);

  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") {
      return;
    }

    const events = ["pointerdown", "keydown", "scroll", "touchstart", "mousemove"];
    events.forEach((eventName) => window.addEventListener(eventName, markUserActivity, { passive: true }));
    return () => {
      events.forEach((eventName) => window.removeEventListener(eventName, markUserActivity));
    };
  }, []);

  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") {
      return;
    }

    const handleVisibilityChange = () => {
      if (document.hidden) {
        wasBackgroundedRef.current = true;
        return;
      }

      markUserActivity();
      if (wasBackgroundedRef.current && sessionToken && currentUser && !isAuthRoute && !isPinSetupRoute) {
        if (currentUser.hasMpin) {
          setPinLockVisible(true);
        } else if (pinPromptDismissedSessionRef.current !== sessionToken) {
          setPinSetupPromptVisible(true);
        }
      }
      wasBackgroundedRef.current = false;
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [currentUser, isAuthRoute, isPinSetupRoute, sessionToken]);

  useEffect(() => {
    const subscription = NativeAppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        markUserActivity();
        if (wasBackgroundedRef.current && sessionToken && currentUser && !isAuthRoute && !isPinSetupRoute) {
          if (currentUser.hasMpin) {
            setPinLockVisible(true);
          } else if (pinPromptDismissedSessionRef.current !== sessionToken) {
            setPinSetupPromptVisible(true);
          }
        }
        wasBackgroundedRef.current = false;
        return;
      }

      if (nextState === "background" || nextState === "inactive") {
        wasBackgroundedRef.current = true;
      }
    });

    return () => {
      subscription.remove();
    };
  }, [currentUser, isAuthRoute, isPinSetupRoute, sessionToken]);

  useEffect(() => {
    if (!isAuthenticated || !currentUser?.hasMpin) {
      return;
    }

    const timer = setInterval(() => {
      if (pinLockVisible || isAuthRoute || isPinSetupRoute) {
        return;
      }

      if (Date.now() - lastActivityAtRef.current >= PIN_IDLE_LOCK_MS) {
        setPinLockVisible(true);
      }
    }, 30_000);

    return () => {
      clearInterval(timer);
    };
  }, [currentUser?.hasMpin, isAuthRoute, isAuthenticated, isPinSetupRoute, pinLockVisible]);

  useEffect(() => {
    if (isExpoGoEnvironment()) {
      return;
    }

    const navigateFromNotification = (data: unknown) => {
      const nextUrl = getNotificationTargetUrl(data);
      if (nextUrl) {
        router.push(nextUrl);
      }
    };

    let responseSubscription: { remove: () => void } | null = null;

    void (async () => {
      const Notifications = await initializeNotificationBehavior();
      if (!Notifications) {
        return;
      }

      responseSubscription = Notifications.addNotificationResponseReceivedListener((response) => {
        navigateFromNotification(response.notification.request.content.data);
      });

      const response = await Notifications.getLastNotificationResponseAsync();
      if (response) {
        navigateFromNotification(response.notification.request.content.data);
      }
    })();

    return () => {
      responseSubscription?.remove();
    };
  }, [router]);

  useEffect(() => {
    if (!sessionToken || !currentUser || isExpoGoEnvironment()) {
      if (!sessionToken) {
        registeredPushSessionTokenRef.current = "";
      }
      return;
    }

    if (registeredPushSessionTokenRef.current === sessionToken) {
      return;
    }

    let active = true;

    void registerDeviceForPushNotifications(sessionToken)
      .then(() => {
        if (active) {
          registeredPushSessionTokenRef.current = sessionToken;
        }
      })
      .catch((error) => {
        logPushError(error);
      });

    return () => {
      active = false;
    };
  }, [currentUser, sessionToken]);

  useEffect(() => {
    if (Platform.OS === "web" || loading || updateCheckCompletedRef.current) {
      return;
    }

    let active = true;
    updateCheckCompletedRef.current = true;

    void api
      .getSettings()
      .then((settings) => {
        if (!active) {
          return;
        }

        const settingsMap = new Map((Array.isArray(settings) ? settings : []).map((item) => [String(item.key || "").trim(), String(item.value || "").trim()]));
        const latestVersion = settingsMap.get("latest_app_version") || "";
        const apkUrl = settingsMap.get("latest_app_apk_url") || "";
        const required = ["true", "1", "yes"].includes((settingsMap.get("latest_app_update_required") || "").toLowerCase());
        const title = settingsMap.get("latest_app_update_title") || "New update available";
        const message = settingsMap.get("latest_app_update_message") || "Please download the latest APK to continue with the newest fixes and features.";

        if (!latestVersion || !apkUrl) {
          return;
        }

        const currentVersion = getInstalledAppVersion();
        if (compareAppVersions(latestVersion, currentVersion) <= 0) {
          return;
        }

        setAppUpdatePrompt({
          latestVersion,
          apkUrl,
          required,
          title,
          message
        });
      })
      .catch(() => {
        // Ignore update-check failures and continue app flow.
      });

    return () => {
      active = false;
    };
  }, [loading]);

  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") {
      return;
    }

    const windowId = webWindowIdRef.current;
    const storage = window.localStorage;

    const readOwner = () => {
      try {
        const raw = storage.getItem(WEB_ACTIVE_WINDOW_KEY);
        if (!raw) {
          return null;
        }

        const parsed = JSON.parse(raw) as {
          sessionToken?: string;
          tabId?: string;
          updatedAt?: number;
          userId?: string;
        };

        if (!parsed?.tabId || !parsed?.userId || typeof parsed.updatedAt !== "number") {
          return null;
        }

        return parsed;
      } catch {
        return null;
      }
    };

    const writeOwner = () => {
      if (!sessionToken || !currentUser) {
        return;
      }

      storage.setItem(
        WEB_ACTIVE_WINDOW_KEY,
        JSON.stringify({
          tabId: windowId,
          userId: currentUser.id,
          sessionToken,
          updatedAt: Date.now()
        })
      );
    };

    const clearOwner = () => {
      const existing = readOwner();
      if (existing?.tabId === windowId) {
        storage.removeItem(WEB_ACTIVE_WINDOW_KEY);
      }
    };

    const attemptClaim = () => {
      if (!sessionToken || !currentUser) {
        setWindowGuardBlocked(false);
        clearOwner();
        return true;
      }

      const existing = readOwner();
      const sameUserOtherWindow =
        existing &&
        existing.userId === currentUser.id &&
        existing.tabId !== windowId &&
        typeof existing.updatedAt === "number" &&
        Date.now() - existing.updatedAt < WEB_WINDOW_STALE_MS;

      if (sameUserOtherWindow) {
        setWindowGuardBlocked(true);
        return false;
      }

      setWindowGuardBlocked(false);
      writeOwner();
      return true;
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== WEB_ACTIVE_WINDOW_KEY) {
        return;
      }

      if (!sessionToken || !currentUser) {
        return;
      }

      const nextOwner = readOwner();
      if (
        nextOwner &&
        nextOwner.userId === currentUser.id &&
        nextOwner.tabId !== windowId &&
        typeof nextOwner.updatedAt === "number" &&
        Date.now() - nextOwner.updatedAt < WEB_WINDOW_STALE_MS
      ) {
        setWindowGuardBlocked(true);
        return;
      }

      if (!windowGuardBlocked) {
        writeOwner();
      } else {
        attemptClaim();
      }
    };

    const handleBeforeUnload = () => {
      clearOwner();
    };

    const heartbeat = window.setInterval(() => {
      attemptClaim();
    }, WEB_WINDOW_HEARTBEAT_MS);

    attemptClaim();
    window.addEventListener("storage", handleStorage);
    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("pagehide", handleBeforeUnload);

    return () => {
      window.clearInterval(heartbeat);
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("pagehide", handleBeforeUnload);
      clearOwner();
    };
  }, [currentUser, sessionToken, windowGuardBlocked]);

  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined" || !windowGuardBlocked) {
      setWindowGuardCloseHint(false);
      return;
    }

    const timer = window.setTimeout(() => {
      try {
        window.close();
      } catch {
        // Ignore close errors on browsers that block script-based close.
      }
      setWindowGuardCloseHint(true);
    }, 900);

    return () => {
      window.clearTimeout(timer);
    };
  }, [windowGuardBlocked]);

  return (
    <View
      onStartShouldSetResponderCapture={() => {
        markUserActivity();
        return false;
      }}
      style={{ flex: 1 }}
    >
      {windowGuardBlocked ? (
        <View style={{ flex: 1, backgroundColor: colors.background, alignItems: "center", justifyContent: "center", padding: 24 }}>
          <StatusBar style="dark" />
          <View style={{ width: "100%", maxWidth: 380, borderRadius: 24, backgroundColor: colors.surface, padding: 22, gap: 14 }}>
            <Text style={{ color: "#111827", fontSize: 24, fontWeight: "900", textAlign: "center" }}>Window Already Active</Text>
            <Text style={{ color: "#64748b", textAlign: "center", lineHeight: 20 }}>
              There is an active browser tab, this page will auto close.
            </Text>
            {windowGuardCloseHint ? (
              <Text style={{ color: "#64748b", textAlign: "center", fontSize: 13 }}>
                Browser ne auto-close block kiya ho to is tab ko manually close kar do.
              </Text>
            ) : null}
          </View>
        </View>
      ) : (
        <>
            <StatusBar style="auto" />
          <Stack screenOptions={{ headerShown: false }} />
          <UniversalBottomTabs />
          <Modal animationType="fade" transparent visible={Boolean(appUpdatePrompt)}>
            <View style={{ flex: 1, backgroundColor: colors.overlay, alignItems: "center", justifyContent: "center", padding: 24 }}>
              <View style={{ width: "100%", maxWidth: 392, borderRadius: 28, backgroundColor: colors.surface, padding: 22, gap: 14 }}>
                <View style={{ gap: 6 }}>
                  <Text style={{ color: colors.textPrimary, fontSize: 24, fontWeight: "900", textAlign: "center" }}>
                    {appUpdatePrompt?.title || "New update available"}
                  </Text>
                </View>
                <View style={{ flexDirection: "row", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
                  <View style={{ borderRadius: 999, backgroundColor: colors.surfaceMuted, paddingHorizontal: 14, paddingVertical: 8 }}>
                    <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: "800" }}>
                      Installed: {getInstalledAppVersion()}
                    </Text>
                  </View>
                  <View style={{ borderRadius: 999, backgroundColor: colors.primarySoft, paddingHorizontal: 14, paddingVertical: 8 }}>
                    <Text style={{ color: colors.primaryDark, fontSize: 12, fontWeight: "900" }}>
                      Latest: {appUpdatePrompt?.latestVersion || "-"}
                    </Text>
                  </View>
                </View>
                <Text style={{ color: colors.textSecondary, textAlign: "center", lineHeight: 21 }}>
                  {appUpdatePrompt?.message || "Please download the latest APK to continue with the newest fixes and features."}
                </Text>
                <View style={{ borderRadius: 20, backgroundColor: appUpdatePrompt?.required ? colors.warningSoft : colors.infoSoft, padding: 14, gap: 4 }}>
                  <Text style={{ color: colors.textPrimary, fontSize: 13, fontWeight: "900" }}>
                    {appUpdatePrompt?.required ? "Update required" : "Recommended update"}
                  </Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 19 }}>
                    {appUpdatePrompt?.required
                      ? "App continue karne se pehle latest APK install karna zaroori hai."
                      : "Abhi download karoge to latest fixes aur smoother app experience milega."}
                  </Text>
                </View>
                <Pressable
                  onPress={() => {
                    if (appUpdatePrompt?.apkUrl) {
                      void downloadUpdateApk(appUpdatePrompt.apkUrl);
                    }
                  }}
                  style={{ minHeight: 48, borderRadius: 999, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center", paddingHorizontal: 20 }}
                >
                  <Text style={{ color: colors.surface, fontSize: 15, fontWeight: "900" }}>
                    {appUpdatePrompt?.required ? "Update Now" : "Download Now"}
                  </Text>
                </Pressable>
                {!appUpdatePrompt?.required ? (
                  <Pressable
                    onPress={() => setAppUpdatePrompt(null)}
                    style={{ minHeight: 44, borderRadius: 999, borderWidth: 1, borderColor: colors.borderStrong, alignItems: "center", justifyContent: "center", paddingHorizontal: 18 }}
                  >
                    <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: "800" }}>Remind Me Later</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          </Modal>
          <PinVerificationModal
            visible={pinLockVisible && Boolean(currentUser?.hasMpin)}
            title="Enter PIN"
            message="App unlock karne ke liye 4 digit PIN enter karo."
            cancelLabel="Logout"
            onCancel={() => {
              void logout();
            }}
            onVerified={() => {
              unlockedSessionTokenRef.current = sessionToken;
              markUserActivity();
              setPinLockVisible(false);
            }}
          />
          <PinVerificationModal
            visible={pinSetupPromptVisible && Boolean(currentUser) && !currentUser?.hasMpin}
            title="Set PIN"
            message="Account security ke liye 4 digit PIN setup karo."
            cancelLabel="Later"
            onCancel={() => {
              pinPromptDismissedSessionRef.current = sessionToken;
              unlockedSessionTokenRef.current = sessionToken;
              setPinSetupPromptVisible(false);
            }}
          />
        </>
      )}
    </View>
  );
}

function getInstalledAppVersion() {
  return String(
    Constants.expoConfig?.version ||
      Constants.manifest2?.extra?.expoClient?.version ||
      Constants.manifest?.version ||
      "0.0.0"
  ).trim();
}

function compareAppVersions(left: string, right: string) {
  const leftParts = String(left || "")
    .split(".")
    .map((part) => Number.parseInt(part, 10) || 0);
  const rightParts = String(right || "")
    .split(".")
    .map((part) => Number.parseInt(part, 10) || 0);
  const size = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < size; index += 1) {
    const leftValue = leftParts[index] ?? 0;
    const rightValue = rightParts[index] ?? 0;
    if (leftValue > rightValue) {
      return 1;
    }
    if (leftValue < rightValue) {
      return -1;
    }
  }

  return 0;
}

async function downloadUpdateApk(apkUrl: string) {
  if (Platform.OS === "android") {
    await Linking.openURL(UPDATE_DOWNLOAD_PAGE_URL);
    return;
  }

  await Linking.openURL(apkUrl);
}

class RootErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error("Root runtime error", error);
  }

  render() {
    if (!this.state.error) {
      return this.props.children;
    }

    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background, padding: 24, gap: 12 }}>
        <StatusBar style="dark" />
        <Text style={{ color: "#111827", fontSize: 22, fontWeight: "800", textAlign: "center" }}>App Runtime Error</Text>
        <Text style={{ color: "#475467", textAlign: "center", lineHeight: 20 }}>
          {this.state.error.message || "Something went wrong while opening the app."}
        </Text>
        <Pressable
          onPress={() => this.setState({ error: null })}
          style={{ minHeight: 46, borderRadius: 999, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center", paddingHorizontal: 18 }}
        >
          <Text style={{ color: colors.surface, fontWeight: "800" }}>Try Again</Text>
        </Pressable>
      </View>
    );
  }
}
