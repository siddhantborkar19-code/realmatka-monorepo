import { router, useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { AppScreen, BackHeader, SurfaceCard } from "@/components/ui";
import { api, formatApiError } from "@/lib/api";
import { useAppState } from "@/lib/app-state";
import { getCachedNotifications, hydrateCachedNotifications, setCachedNotifications } from "@/lib/content-cache";
import { colors } from "@/theme/colors";

type NotificationEntry = {
  id: string;
  title: string;
  body: string;
  channel: string;
  read: boolean;
  createdAt: string;
};

const NOTIFICATIONS_REFRESH_INTERVAL_MS = 60_000;
const NOTIFICATIONS_WINDOW_SIZE = 50;

export default function NotificationsScreen() {
  const { sessionToken } = useAppState();
  const sessionCacheKey = sessionToken || "guest";
  const [items, setItems] = useState<NotificationEntry[]>(() => (sessionToken ? getCachedNotifications(sessionToken) ?? [] : []));
  const [loading, setLoading] = useState(() => !(sessionToken && getCachedNotifications(sessionToken)?.length));
  const [refreshing, setRefreshing] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const [allNotificationsEnabled, setAllNotificationsEnabled] = useState(true);
  const [error, setError] = useState("");
  const inFlightRef = useRef<Promise<void> | null>(null);
  const visibleItems = items;

  useFocusEffect(
    useCallback(() => {
      if (!sessionToken) {
        setItems([]);
        setLoading(false);
        return;
      }

      let active = true;

      void (async () => {
        const cached = await hydrateCachedNotifications(sessionToken);
        if (active && cached?.length) {
          setItems(cached);
          setLoading(false);
        }
      })();

      const load = async (mode: "load" | "refresh") => {
        if (inFlightRef.current) {
          return inFlightRef.current;
        }

        inFlightRef.current = (async () => {
          try {
            if (mode === "load" && !items.length) {
              setLoading(true);
            } else if (mode === "refresh") {
              setRefreshing(true);
            }
            const response = await api.notificationHistory(sessionToken, NOTIFICATIONS_WINDOW_SIZE);
            if (!active) {
              return;
            }
            setItems(response);
            setCachedNotifications(sessionToken, response);
            setError("");
          } catch (loadError) {
            if (!active) {
              return;
            }
            setError(formatApiError(loadError, "Notifications load nahi hui."));
          } finally {
            inFlightRef.current = null;
            if (!active) {
              return;
            }
            setLoading(false);
            setRefreshing(false);
          }
        })();

        return inFlightRef.current;
      };

      void load("load");
      const interval = setInterval(() => {
        void load("refresh");
      }, NOTIFICATIONS_REFRESH_INTERVAL_MS);

      return () => {
        active = false;
        clearInterval(interval);
      };
    }, [items.length, sessionToken])
  );

  return (
    <View style={styles.page}>
      <BackHeader title="Notifications" subtitle="Result aur important updates yahan milenge." />
      <AppScreen onRefresh={sessionToken ? () => void refreshNow() : undefined} refreshing={refreshing} showPromo={false}>
        <View style={styles.hero}>
          <Text style={styles.heading}>Notification Center</Text>
          <Text style={styles.subheading}>Result aur important notifications yahan history me save rahengi.</Text>
          {!loading && visibleItems.some((item) => !item.read) ? (
            <Pressable disabled={markingAll} onPress={() => void markAllAsRead()} style={[styles.markAllButton, markingAll && styles.markAllButtonDisabled]}>
              <Text style={styles.markAllText}>{markingAll ? "Updating..." : "Mark all as read"}</Text>
            </Pressable>
          ) : null}
        </View>

        <SurfaceCard style={styles.settingsCard}>
          <View style={styles.settingsRow}>
            <View style={styles.settingsTextWrap}>
              <Text style={styles.settingsTitle}>All Notifications</Text>
              <Text style={styles.settingsSubtitle}>Receive all notifications.</Text>
            </View>
            <Switch
              onValueChange={setAllNotificationsEnabled}
              thumbColor={colors.surface}
              trackColor={{ false: colors.border, true: colors.success }}
              value={allNotificationsEnabled}
            />
          </View>
        </SurfaceCard>

        {loading ? (
          <SurfaceCard style={styles.stateCard}>
            <ActivityIndicator color={colors.primary} size="small" />
            <Text style={styles.stateText}>Notifications load ho rahi hain...</Text>
          </SurfaceCard>
        ) : null}

        {!loading && error ? (
          <SurfaceCard style={styles.stateCard}>
            <Text style={[styles.stateText, styles.errorText]}>{error}</Text>
            <Pressable onPress={() => void refreshNow()} style={styles.retryButton}>
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          </SurfaceCard>
        ) : null}

        {!loading && !error && !visibleItems.length ? (
          <SurfaceCard style={styles.stateCard}>
            <Text style={styles.stateText}>Abhi koi notification nahi aayi hai.</Text>
          </SurfaceCard>
        ) : null}

        {!loading && !error
          ? visibleItems.map((item) => (
              <Pressable key={item.id} onPress={() => void openNotification(item)}>
                <SurfaceCard style={[styles.itemCard, !item.read && styles.itemCardUnread]}>
                <View style={styles.badgeRow}>
                  <View style={styles.channelBadge}>
                    <Text style={styles.channelText}>{item.channel || "general"}</Text>
                  </View>
                  <View style={styles.badgeMeta}>
                    {!item.read ? <View style={styles.unreadDot} /> : null}
                    <Text style={styles.timeText}>{formatDate(item.createdAt)}</Text>
                  </View>
                </View>
                <Text style={styles.title}>{item.title}</Text>
                <Text style={styles.body}>{item.body}</Text>
                </SurfaceCard>
              </Pressable>
            ))
          : null}
      </AppScreen>
    </View>
  );

  async function refreshNow() {
    if (!sessionToken) {
      return;
    }

    if (inFlightRef.current) {
      return inFlightRef.current;
    }

    try {
      setRefreshing(true);
      const request = api.notificationHistory(sessionToken, NOTIFICATIONS_WINDOW_SIZE)
        .then((response) => {
          setItems(response);
          setCachedNotifications(sessionToken, response);
          setError("");
        })
        .finally(() => {
          inFlightRef.current = null;
        });
      inFlightRef.current = request.then(() => undefined);
      await request;
    } catch (refreshError) {
      setError(formatApiError(refreshError, "Notifications refresh nahi hui."));
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }

  async function openNotification(item: NotificationEntry) {
    if (sessionToken && !item.read) {
      try {
        await api.markNotificationsRead(sessionToken, item.id);
      } catch {
        // Ignore read-state failures and still navigate.
      }

      const nextItems = items.map((entry) => (entry.id === item.id ? { ...entry, read: true } : entry));
      setItems(nextItems);
      setCachedNotifications(sessionCacheKey, nextItems);
    }

    router.push(getNotificationRoute(item));
  }

  async function markAllAsRead() {
    if (!sessionToken) {
      return;
    }

    try {
      setMarkingAll(true);
      await api.markNotificationsRead(sessionToken);
      const nextItems = items.map((item) => ({ ...item, read: true }));
      setItems(nextItems);
      setCachedNotifications(sessionCacheKey, nextItems);
      setError("");
    } catch (markError) {
      setError(formatApiError(markError, "Notifications read state update nahi hui."));
    } finally {
      setMarkingAll(false);
    }
  }
}

function getNotificationRoute(item: NotificationEntry) {
  const channel = String(item.channel || "").trim().toLowerCase();
  if (channel === "wallet") {
    return "/wallet/history";
  }
  if (channel === "support") {
    return "/chat";
  }
  if (channel === "result") {
    return "/(tabs)";
  }
  if (channel === "security") {
    return "/profile";
  }
  return "/notifications";
}

function formatDate(value: string) {
  if (!value) {
    return "-";
  }

  return new Date(value).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  });
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: colors.background
  },
  hero: {
    gap: 6,
    marginBottom: 6
  },
  markAllButton: {
    alignSelf: "center",
    marginTop: 6,
    minHeight: 38,
    paddingHorizontal: 16,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.infoSoft
  },
  markAllButtonDisabled: {
    opacity: 0.6
  },
  markAllText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: "800"
  },
  heading: {
    color: colors.textPrimary,
    fontSize: 24,
    fontWeight: "900",
    textAlign: "center"
  },
  subheading: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center"
  },
  settingsCard: {
    paddingVertical: 14
  },
  settingsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16
  },
  settingsTextWrap: {
    flex: 1,
    gap: 4
  },
  settingsTitle: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: "800"
  },
  settingsSubtitle: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18
  },
  stateCard: {
    alignItems: "center",
    gap: 10,
    paddingVertical: 22
  },
  stateText: {
    color: colors.textSecondary,
    fontSize: 14,
    textAlign: "center"
  },
  errorText: {
    color: colors.danger
  },
  retryButton: {
    minHeight: 42,
    paddingHorizontal: 18,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary
  },
  retryText: {
    color: colors.surface,
    fontSize: 14,
    fontWeight: "800"
  },
  itemCard: {
    gap: 10
  },
  itemCardUnread: {
    borderWidth: 1,
    borderColor: "#c7d7fe",
    backgroundColor: "#f8fbff"
  },
  badgeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12
  },
  badgeMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  channelBadge: {
    borderRadius: 999,
    backgroundColor: colors.infoSoft,
    paddingHorizontal: 10,
    paddingVertical: 5
  },
  channelText: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase"
  },
  unreadDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
    backgroundColor: "#2563eb"
  },
  timeText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "700"
  },
  title: {
    color: colors.textPrimary,
    fontSize: 17,
    fontWeight: "800"
  },
  body: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 21
  }
});
