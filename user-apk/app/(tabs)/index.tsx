import { Ionicons } from "@expo/vector-icons";
import { Link, router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Image, Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { AppHeader, AppScreen, SurfaceCard } from "@/components/ui";
import { marketCatalog } from "../../data/mock";
import { api, formatApiError, type CricketMatch, type CricketMatchesPayload } from "@/lib/api";
import { useAppState } from "@/lib/app-state";
import {
  getCachedChart,
  getCachedMarkets,
  hydrateCachedMarkets,
  setCachedChart,
  setCachedMarkets
} from "@/lib/content-cache";
import { colors } from "@/theme/colors";

type MarketItem = {
  id: string;
  slug: string;
  name: string;
  result: string;
  phase?: "open-running" | "close-running" | "closed" | "upcoming";
  label?: string;
  canPlaceBet?: boolean;
  blockedBoardLabels?: string[];
  status: string;
  action: string;
  open: string;
  close: string;
  category: "starline" | "games" | "jackpot";
};

const HOME_SOFT_REFRESH_INTERVAL_MS = 60_000;
const FALLBACK_MARKETS: MarketItem[] = marketCatalog.map((fallback) => ({
  id: fallback.slug,
  slug: fallback.slug,
  name: fallback.name,
  result: "",
  status: "Active",
  action: "Open",
  open: fallback.open,
  close: fallback.close,
  category: fallback.category
}));

function isMarketForcedClosed(market: Pick<MarketItem, "status" | "action">) {
  const status = String(market.status ?? "").toLowerCase();
  const action = String(market.action ?? "").toLowerCase();
  return status.includes("weekly off") || status.includes("closed for today") || action === "closed";
}

function getPhaseDisplayLabel(phase: MarketItem["phase"], isClosed: boolean) {
  if (phase === "close-running") {
    return "Betting is Running for Close";
  }
  if (phase === "closed" || isClosed) {
    return "Betting is Closed for Today";
  }
  return "Betting Running Now";
}

function getMarketDisplayMeta(market: Pick<MarketItem, "status" | "action" | "phase" | "label">) {
  const isClosed = isMarketForcedClosed(market);
  const normalizedLabel = String(market.label ?? "").trim();
  const normalizedAction = String(market.action ?? "").trim();
  const normalizedPhase = String(market.phase ?? "").trim().toLowerCase();
  const canPlaceBetFromBackend = typeof (market as MarketItem).canPlaceBet === "boolean" ? (market as MarketItem).canPlaceBet : null;
  const resolvedPhase =
    normalizedPhase === "open-running" || normalizedPhase === "close-running" || normalizedPhase === "upcoming" || normalizedPhase === "closed"
      ? normalizedPhase
      : isClosed
        ? "closed"
        : "open-running";

  return {
    label: normalizedLabel || getPhaseDisplayLabel(resolvedPhase as MarketItem["phase"], isClosed),
    isClosed,
    canPlaceBet: canPlaceBetFromBackend ?? (!isClosed && normalizedAction.toLowerCase() !== "closed"),
    phase: resolvedPhase
  } as const;
}

export default function HomeScreen() {
  const { walletBalance } = useAppState();
  const { height } = useWindowDimensions();
  const [markets, setMarkets] = useState<MarketItem[]>(() => getCachedMarkets() ?? FALLBACK_MARKETS);
  const lastGoodMarketsRef = useRef<MarketItem[]>([]);
  const lastSoftRefreshAtRef = useRef(0);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [selectedChartMarket, setSelectedChartMarket] = useState<Pick<MarketItem, "slug" | "name"> | null>(null);
  const [homeMode, setHomeMode] = useState<"matka" | "cricket">("matka");
  const [cricketData, setCricketData] = useState<CricketMatchesPayload>({ rates: {}, matches: [] });
  const [cricketLoading, setCricketLoading] = useState(false);
  const [cricketError, setCricketError] = useState("");
  useEffect(() => {
    const cachedMarkets = getCachedMarkets();
    const initialMarkets = cachedMarkets?.length ? cachedMarkets : FALLBACK_MARKETS;
    lastGoodMarketsRef.current = initialMarkets;
    setMarkets(initialMarkets);

    void (async () => {
      const persistedMarkets = await hydrateCachedMarkets();
      if (persistedMarkets?.length) {
        lastGoodMarketsRef.current = persistedMarkets;
        setMarkets(persistedMarkets);
      }

      await Promise.allSettled([loadMarkets(false), loadCricket(false)]);
    })();
  }, []);

  useFocusEffect(
    useCallback(() => {
      let active = true;

      if (Date.now() - lastSoftRefreshAtRef.current >= HOME_SOFT_REFRESH_INTERVAL_MS) {
        lastSoftRefreshAtRef.current = Date.now();
        void refreshScreen(false);
      }

      const interval = setInterval(() => {
        if (!active) {
          return;
        }
        lastSoftRefreshAtRef.current = Date.now();
        void refreshScreen(false);
      }, HOME_SOFT_REFRESH_INTERVAL_MS);

      return () => {
        active = false;
        clearInterval(interval);
      };
    }, [])
  );

  const listedMarkets = markets;
  const isCompactScreen = height < 760;
  const showHardError = listedMarkets.length === 0 && Boolean(error);
  useEffect(() => {
    if (!listedMarkets.length) {
      return;
    }
    void prefetchChartPreview(listedMarkets.slice(0, 4));
  }, [listedMarkets]);

  return (
    <View style={styles.page}>
      <AppHeader
        title="Real Matka"
        rightLabel={`Rs ${walletBalance}`}
      />
      <View style={styles.stickyModeWrap}>
        <View style={styles.modeSwitch}>
          <Pressable onPress={() => setHomeMode("matka")} style={[styles.modeButton, homeMode === "matka" && styles.modeButtonActive]}>
            <Ionicons color={homeMode === "matka" ? colors.primary : colors.textSecondary} name="apps-outline" size={17} />
            <Text style={[styles.modeButtonText, homeMode === "matka" && styles.modeButtonTextActive]}>Matka</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              setHomeMode("cricket");
              void loadCricket(false);
            }}
            style={[styles.modeButton, homeMode === "cricket" && styles.modeButtonActive]}
          >
            <Ionicons color={homeMode === "cricket" ? colors.primary : colors.textSecondary} name="baseball-outline" size={17} />
            <Text style={[styles.modeButtonText, homeMode === "cricket" && styles.modeButtonTextActive]}>Play Cricket</Text>
          </Pressable>
        </View>
      </View>

      <AppScreen
        padded={false}
        scrollContentStyle={isCompactScreen ? styles.homeScrollCompact : styles.homeScroll}
        showPromo={false}
      >
        <View style={styles.contentWrap}>
        {homeMode === "matka" ? (
          <View style={styles.heroBannerCard}>
            <Image
              resizeMode="stretch"
              source={require("../../assets/images/realmatkabanner.jpg")}
              style={styles.heroBannerImage}
            />
          </View>
        ) : null}
        {homeMode === "cricket" ? (
          <CricketHomeSection
            data={cricketData}
            error={cricketError}
            loading={cricketLoading}
          />
        ) : loading && !listedMarkets.length ? (
          <SurfaceCard>
            <ActivityIndicator color={colors.primary} size="large" />
            <Text style={styles.stateText}>Markets load ho rahe hain...</Text>
          </SurfaceCard>
        ) : showHardError ? (
          <SurfaceCard>
            <Text style={styles.errorTitle}>Markets load nahi hue</Text>
            <Text style={styles.errorText}>{error}</Text>
            <Pressable onPress={() => void loadMarkets()} style={styles.retryButton}>
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          </SurfaceCard>
        ) : (
          <View style={styles.marketList}>
            {error ? (
              <View style={styles.softErrorStrip}>
                <Text style={styles.softErrorText}>Server abhi respond nahi kar raha. Cached market list dikh rahi hai.</Text>
              </View>
            ) : null}
            {listedMarkets.map((market) => {
              const phaseMeta = getMarketDisplayMeta(market);
              const isClosed = phaseMeta.isClosed;
              const hasResult = Boolean(market.result?.trim());
              const canPlaceBet = phaseMeta.canPlaceBet;
                return (
                  <View
                    key={market.slug}
                    style={[
                      styles.marketGradient,
                      isClosed ? styles.marketGradientClosed : styles.marketGradientOpen,
                      canPlaceBet ? styles.marketGradientWithAction : styles.marketGradientStatic
                    ]}
                  >
                    <View style={styles.marketHeaderRow}>
                      <View style={styles.marketIdentity}>
                        <View style={styles.marketTitleRow}>
                          <Text style={styles.marketName}>{market.name}</Text>
                        </View>
                      </View>
                      <View style={[styles.resultBadge, isClosed ? styles.resultBadgeClosed : styles.resultBadgeOpen, !hasResult && styles.resultBadgePending]}>
                        <Text style={[styles.resultValue, !hasResult && styles.resultPending]}>{hasResult ? market.result : "***-**-***"}</Text>
                      </View>
                    </View>

                    <View style={styles.middleRow}>
                      <View style={styles.marketStatusWrap}>
                        <Text style={[styles.marketState, isClosed ? styles.marketStateClosed : styles.marketStateOpen]}>
                          {phaseMeta.label}
                        </Text>
                        <Text style={styles.timeInlineText}>
                          Open {market.open} | Close {market.close}
                        </Text>
                      </View>
                      <View style={styles.chartWrap}>
                        <Pressable
                          onPress={() => setSelectedChartMarket({ slug: market.slug, name: market.name })}
                          style={[styles.chartIconButton, isClosed ? styles.chartIconButtonClosed : styles.chartIconButtonOpen]}
                        >
                          <Ionicons color={colors.surface} name="stats-chart-outline" size={18} />
                        </Pressable>
                      </View>
                    </View>

                    {canPlaceBet ? (
                      <View style={styles.bottomRow}>
                        <Link
                          asChild
                          href={{
                            pathname: "/place-bid/[market]",
                            params: {
                              market: market.slug,
                              label: market.name,
                              marketPhase: phaseMeta.phase,
                              blockedBoards: (market.blockedBoardLabels ?? []).join("||")
                            }
                          }}
                        >
                          <Pressable style={styles.openButton}>
                            <Text style={styles.openButtonText}>Place Bet Now</Text>
                          </Pressable>
                        </Link>
                      </View>
                    ) : null}
                </View>
              );
            })}
          </View>
        )}
        </View>
      </AppScreen>

      <Modal animationType="fade" onRequestClose={() => setSelectedChartMarket(null)} transparent visible={Boolean(selectedChartMarket)}>
        <View style={styles.modalOverlay}>
          <Pressable onPress={() => setSelectedChartMarket(null)} style={styles.modalBackdrop} />
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{selectedChartMarket?.name?.toUpperCase()} Charts</Text>
              <Pressable onPress={() => setSelectedChartMarket(null)} style={styles.modalClose}>
                <Ionicons color={colors.textSecondary} name="close" size={18} />
              </Pressable>
            </View>

            <Pressable
              onPress={() => {
                if (!selectedChartMarket) return;
                setSelectedChartMarket(null);
                router.push({
                  pathname: "/charts/[slug]",
                  params: { slug: selectedChartMarket.slug, label: selectedChartMarket.name, chartType: "jodi" }
                });
              }}
              style={[styles.optionButton, styles.optionJodi]}
            >
              <Ionicons color={colors.surface} name="grid-outline" size={18} />
              <Text style={styles.optionButtonText}>Jodi Chart</Text>
            </Pressable>

            <Pressable
              onPress={() => {
                if (!selectedChartMarket) return;
                setSelectedChartMarket(null);
                router.push({
                  pathname: "/charts/[slug]",
                  params: { slug: selectedChartMarket.slug, label: selectedChartMarket.name, chartType: "panna" }
                });
              }}
              style={[styles.optionButton, styles.optionPanna]}
            >
              <Ionicons color={colors.surface} name="albums-outline" size={18} />
              <Text style={styles.optionButtonText}>Panna Chart</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );

  async function refreshScreen(showPullRefresh = true) {
    try {
      if (showPullRefresh) {
        setRefreshing(true);
      }
      await Promise.allSettled([loadMarkets(false), loadCricket(false)]);
    } finally {
      if (showPullRefresh) {
        setRefreshing(false);
      }
    }
  }

  async function loadMarkets(showLoader = true) {
    try {
      if (showLoader) {
        setLoading(true);
      }
      setError("");
      const liveMarkets = await api.listMarkets();
      const fallbackEntries = marketCatalog.map((item) => [item.slug, item] as const);
      const fallbackMap = new Map<string, (typeof marketCatalog)[number]>(fallbackEntries);
      const liveSlugs = new Set(liveMarkets.map((item) => item.slug));

      const mappedLiveMarkets = liveMarkets.map((live) => {
        const fallback = fallbackMap.get(live.slug);
        return {
          id: live.id ?? live.slug,
          slug: live.slug,
          name: live.name ?? fallback?.name ?? live.slug,
          result: live.result ?? "",
          phase: live.phase,
          label: live.label ?? "",
          canPlaceBet: live.canPlaceBet,
          blockedBoardLabels: Array.isArray(live.blockedBoardLabels) ? live.blockedBoardLabels : [],
          status: live.status ?? "Active",
          action: live.action ?? "Open",
          open: live.open ?? fallback?.open ?? "--:--",
          close: live.close ?? fallback?.close ?? "--:--",
          category: live.category ?? fallback?.category ?? "games"
        } satisfies MarketItem;
      });

      const fallbackOnlyMarkets = marketCatalog
        .filter((fallback) => !liveSlugs.has(fallback.slug))
        .map((fallback) => ({
          id: fallback.slug,
          slug: fallback.slug,
          name: fallback.name,
          result: "",
          phase: "open-running",
          label: "",
          canPlaceBet: true,
          blockedBoardLabels: [],
          status: "Active",
          action: "Open",
          open: fallback.open,
          close: fallback.close,
          category: fallback.category
        }) satisfies MarketItem);

      const nextMarkets = [...mappedLiveMarkets, ...fallbackOnlyMarkets];
      setMarkets(nextMarkets);
      lastGoodMarketsRef.current = nextMarkets;
      setCachedMarkets(nextMarkets);
      void prefetchChartPreview(nextMarkets.slice(0, 4));
    } catch (loadError) {
      setError(formatApiError(loadError, "Unable to load markets"));
      if (lastGoodMarketsRef.current.length > 0) {
        setMarkets(lastGoodMarketsRef.current);
      } else {
        setMarkets(FALLBACK_MARKETS);
      }
    } finally {
      if (showLoader) {
        setLoading(false);
      }
    }
  }

  async function loadCricket(showLoader = true) {
    try {
      if (showLoader) {
        setCricketLoading(true);
      }
      setCricketError("");
      const data = await api.cricketMatches();
      setCricketData(data);
    } catch (loadError) {
      setCricketError(formatApiError(loadError, "Cricket games load nahi hue"));
    } finally {
      if (showLoader) {
        setCricketLoading(false);
      }
    }
  }

  async function prefetchChartPreview(items: MarketItem[]) {
    const uncachedMarkets = items.filter(
      (item) => !getCachedChart(item.slug, "jodi", 15 * 60_000) || !getCachedChart(item.slug, "panna", 15 * 60_000)
    );
    if (!uncachedMarkets.length) {
      return;
    }

    try {
      const payload = await api.getChartBatch(
        uncachedMarkets.map((item) => item.slug),
        ["jodi", "panna"]
      );
      for (const chart of payload.items) {
        setCachedChart(chart.marketSlug, chart.chartType, chart);
      }
    } catch {
      // Ignore prefetch failures to keep home responsive.
    }
  }

}

function CricketHomeSection({
  data,
  error,
  loading
}: {
  data: CricketMatchesPayload;
  error: string;
  loading: boolean;
}) {
  const [, setClockTick] = useState(0);
  const matches = data.matches || [];
  useEffect(() => {
    const timer = setInterval(() => setClockTick((tick) => tick + 1), 30_000);
    return () => clearInterval(timer);
  }, []);
  return (
    <View style={styles.cricketWrap}>
      {error ? <Text style={styles.cricketError}>{error}</Text> : null}

      {loading && !matches.length ? (
        <SurfaceCard>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={styles.stateText}>Cricket games load ho rahe hain...</Text>
        </SurfaceCard>
      ) : matches.length ? (
        matches.map((match) => (
          <Pressable
            key={match.id}
            onPress={() => {
              router.push({
                pathname: "/cricket/[match]",
                params: { match: match.id, title: match.title }
              });
            }}
            style={styles.cricketPosterCard}
          >
            <View style={styles.cricketPosterContent}>
              <View style={styles.cricketPosterIcon}>
                <Ionicons color={colors.surface} name="baseball" size={24} />
              </View>
              <View style={styles.cricketPosterText}>
                <Text style={styles.cricketPosterTitle}>{match.teamA} vs {match.teamB}</Text>
                <Text style={styles.cricketPosterSubtitle}>{match.title}</Text>
                <Text style={styles.cricketPosterMeta}>{formatCricketCountdown(match)}</Text>
              </View>
            </View>
            <View style={[styles.cricketStatusPill, match.matchBettingOpen || match.tossBettingOpen ? styles.cricketStatusLive : styles.cricketStatusClosed]}>
              <Text style={styles.cricketStatusText}>{match.matchBettingOpen || match.tossBettingOpen ? "OPEN" : "CLOSED"}</Text>
            </View>
          </Pressable>
        ))
      ) : (
        <SurfaceCard>
          <Text style={styles.errorTitle}>Cricket match available nahi hai</Text>
          <Text style={styles.errorText}>Admin panel se pehla cricket match create karo.</Text>
        </SurfaceCard>
      )}
    </View>
  );
}

function formatCricketStart(value: string | null) {
  if (!value) return "Winner markets";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Winner markets";
  return date.toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function formatCricketCountdown(match: CricketMatch) {
  const closeAt = match.markets?.match_winner?.closeAt || match.matchCloseAt || match.startAt;
  if (!closeAt) return "Betting time not set";
  const closeTime = new Date(closeAt).getTime();
  if (Number.isNaN(closeTime)) return formatCricketStart(match.startAt);
  const remaining = closeTime - Date.now();
  if (remaining <= 0) return "Betting closed";
  const totalSeconds = Math.floor(remaining / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `Betting closes in ${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: colors.background
  },
  stateText: {
    color: colors.textMuted,
    textAlign: "center",
    fontWeight: "600"
  },
  softErrorStrip: {
    borderRadius: 12,
    backgroundColor: "#fff7ed",
    borderWidth: 1,
    borderColor: "#fed7aa",
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  softErrorText: {
    color: "#9a3412",
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 16
  },
  contentWrap: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 0
  },
  homeScroll: {
    paddingBottom: 84
  },
  homeScrollCompact: {
    paddingBottom: 76
  },
  heroBannerCard: {
      borderRadius: 6,
      overflow: "hidden",
      borderWidth: 1,
      borderColor: colors.borderStrong,
      backgroundColor: "#ffffff",
      marginBottom: 10,
      shadowColor: "#000",
      shadowOpacity: 0.12,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 8 },
      elevation: 4
    },
  heroBannerImage: {
      width: "100%",
      height: 144,
      backgroundColor: "#ffffff"
    },
  stickyModeWrap: {
    backgroundColor: colors.surface,
    paddingHorizontal: 0,
    paddingTop: 8,
    paddingBottom: 0,
    borderBottomWidth: 1,
    borderColor: colors.border
  },
  modeSwitch: {
    flexDirection: "row",
    gap: 0,
    borderRadius: 0,
    backgroundColor: colors.surface,
    borderWidth: 0,
    padding: 0
  },
  modeButton: {
    flex: 1,
    minHeight: 38,
    borderRadius: 0,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 7,
    borderRightWidth: 1,
    borderRightColor: colors.border
  },
  modeButtonActive: {
    backgroundColor: colors.surface,
    borderBottomWidth: 2,
    borderBottomColor: colors.primary
  },
  modeButtonText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: "900"
  },
  modeButtonTextActive: {
    color: colors.primary
  },
  cricketWrap: {
    gap: 14,
    paddingBottom: 8
  },
  cricketMessage: {
    color: colors.success,
    fontSize: 12,
    fontWeight: "800"
  },
  cricketError: {
    color: colors.danger,
    fontSize: 12,
    fontWeight: "800"
  },
  cricketPosterCard: {
    minHeight: 118,
    borderRadius: 18,
    backgroundColor: "#064e3b",
    borderWidth: 1,
    borderColor: "#10b981",
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    shadowColor: colors.shadow,
    shadowOpacity: 0.1,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4
  },
  cricketPosterContent: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12
  },
  cricketPosterIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#10b981"
  },
  cricketPosterText: {
    flex: 1,
    gap: 3
  },
  cricketPosterTitle: {
    color: colors.surface,
    fontSize: 19,
    fontWeight: "900"
  },
  cricketPosterSubtitle: {
    color: "#d1fae5",
    fontSize: 12,
    fontWeight: "800"
  },
  cricketPosterMeta: {
    color: "#a7f3d0",
    fontSize: 12,
    fontWeight: "900"
  },
  cricketStatusPill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  cricketStatusLive: {
    backgroundColor: "#dcfce7"
  },
  cricketStatusClosed: {
    backgroundColor: colors.dangerSoft
  },
  cricketStatusText: {
    color: "#166534",
    fontSize: 11,
    fontWeight: "900"
  },
  errorTitle: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: "800"
  },
  errorText: {
    color: colors.danger,
    lineHeight: 20
  },
  retryButton: {
    minHeight: 44,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary
  },
  retryText: {
    color: colors.surface,
    fontWeight: "800"
  },
  modalOverlay: {
    flex: 1,
    justifyContent: "center",
    padding: 18,
    backgroundColor: colors.overlay
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject
  },
  modalCard: {
    borderRadius: 20,
    backgroundColor: colors.surface,
    padding: 18,
    gap: 14,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: colors.shadow,
    shadowOpacity: 0.14,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12
  },
  modalTitle: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 20,
    fontWeight: "900",
    textAlign: "center"
  },
  modalClose: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceMuted
  },
  optionButton: {
    minHeight: 48,
    borderRadius: 10,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  optionJodi: {
    backgroundColor: colors.accentDark
  },
  optionPanna: {
    backgroundColor: colors.primary
  },
  optionButtonText: {
    color: colors.surface,
    fontSize: 15,
    fontWeight: "800"
  },
  marketList: {
    gap: 14,
    paddingBottom: 8
  },
  marketGradient: {
      borderRadius: 22,
      paddingHorizontal: 16,
      paddingVertical: 15,
      gap: 10,
      borderWidth: 1,
      minHeight: 154,
      shadowColor: colors.shadow,
      shadowOpacity: 0.1,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 10 },
      elevation: 5
    },
  marketGradientWithAction: {
      justifyContent: "flex-start"
    },
  marketGradientStatic: {
      justifyContent: "space-between",
      paddingBottom: 18
    },
  marketGradientOpen: {
      backgroundColor: colors.cardTint,
      borderColor: colors.border
    },
  marketGradientClosed: {
      backgroundColor: colors.dangerSoft,
      borderColor: colors.dangerBorder,
      shadowOpacity: 0.08
    },
  marketHeaderRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "flex-start",
        gap: 12,
        marginBottom: 0
      },
  marketIdentity: {
      flex: 1,
      justifyContent: "center"
    },
  marketTitleRow: {
      justifyContent: "center"
    },
  marketName: {
      color: colors.textPrimary,
      fontSize: 17,
      fontWeight: "900",
      textTransform: "uppercase",
      lineHeight: 22
    },
  resultBadge: {
      minWidth: 122,
      borderRadius: 18,
      paddingHorizontal: 14,
      paddingVertical: 11,
      borderWidth: 1,
      alignItems: "flex-end",
      justifyContent: "center"
    },
  resultBadgeOpen: {
      backgroundColor: colors.surface,
      borderColor: colors.borderStrong
    },
  resultBadgeClosed: {
      backgroundColor: "#fffaf8",
      borderColor: colors.dangerBorder
    },
  resultBadgePending: {
    backgroundColor: colors.surfaceAlt
  },
  marketState: {
      fontSize: 14,
      fontWeight: "800",
      lineHeight: 18
    },
  marketStateOpen: {
    color: colors.success
  },
  marketStateClosed: {
    color: colors.danger
  },
  middleRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
        marginTop: 0
      },
  marketStatusWrap: {
        flex: 1,
        gap: 2,
        justifyContent: "center",
        minHeight: 44
      },
     timeInlineText: {
        color: colors.textSecondary,
        fontSize: 12,
        fontWeight: "600",
        lineHeight: 17
      },
  chartWrap: {
      width: 48,
      alignItems: "flex-end",
      justifyContent: "center"
    },
  chartIconButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: "center",
      justifyContent: "center"
    },
  chartIconButtonOpen: {
      backgroundColor: colors.accent
    },
  chartIconButtonClosed: {
      backgroundColor: "#20b7a8"
    },
  resultCard: {
    display: "none"
  },
  resultLabel: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0.6
  },
  resultValue: {
      color: colors.primaryDark,
      fontSize: 19,
      fontWeight: "900",
      lineHeight: 24
    },
  resultCardValue: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: "900"
  },
  resultPending: {
    color: colors.accent
  },
  bottomRow: {
      marginTop: 6
    },
  openButton: {
      width: "100%",
      minHeight: 46,
      borderRadius: 15,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.accentSoft,
      borderWidth: 1,
      borderColor: "#c7f0ea"
    },
    openButtonText: {
      color: colors.accent,
      fontSize: 13,
      fontWeight: "800"
    }
});
