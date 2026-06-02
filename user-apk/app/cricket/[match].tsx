import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BackHeader, SurfaceCard } from "@/components/ui";
import { api, formatApiError, type CricketMatch, type CricketMatchesPayload } from "@/lib/api";
import { useAppState } from "@/lib/app-state";
import { getCricketTeamFlag } from "@/lib/cricket-team-flags";
import { colors } from "@/theme/colors";

const MARKET_ORDER = ["toss_winner", "match_winner", "first_over_runs", "first_2_over_runs", "first_3_over_runs"] as const;
const MIN_CRICKET_BET = 10;
const MAX_CRICKET_BET = 2000;

const MARKET_COPY: Record<string, { title: string; subtitle: string; icon: keyof typeof Ionicons.glyphMap }> = {
  toss_winner: {
    title: "Toss Winner",
    subtitle: "Toss market match start se pehle close hogi.",
    icon: "disc-outline"
  },
  match_winner: {
    title: "Match Winner",
    subtitle: "Final winner par simple cricket bet.",
    icon: "trophy-outline"
  },
  first_over_runs: {
    title: "First Over Runs",
    subtitle: "1st over total runs range choose karo.",
    icon: "speedometer-outline"
  },
  first_2_over_runs: {
    title: "First 2 Overs Runs",
    subtitle: "First 2 overs ka total runs range choose karo.",
    icon: "stats-chart-outline"
  },
  first_3_over_runs: {
    title: "First 3 Overs Runs",
    subtitle: "First 3 overs ka total runs range choose karo.",
    icon: "bar-chart-outline"
  }
};

export default function CricketMatchScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ match?: string; title?: string }>();
  const { sessionToken, reloadSessionData, loadCricketHistory } = useAppState();
  const [data, setData] = useState<CricketMatchesPayload>({ rates: {}, matches: [] });
  const [amount, setAmount] = useState("100");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [selectedBet, setSelectedBet] = useState<{ marketType: string; selection: string } | null>(null);

  const match = useMemo(
    () => data.matches.find((item) => item.id === params.match) || null,
    [data.matches, params.match]
  );

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setMessage("");
      setData(await api.cricketMatches());
    } catch (error) {
      setMessage(formatApiError(error, "Cricket match load nahi hua."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function placeBet(targetMatch: CricketMatch, marketType: string, selection: string) {
    if (!sessionToken) {
      setMessage("Login required.");
      return;
    }
    const betAmount = Number(amount || 0);
    if (!Number.isFinite(betAmount) || betAmount < MIN_CRICKET_BET || betAmount > MAX_CRICKET_BET) {
      setMessage(`Cricket bet amount Rs ${MIN_CRICKET_BET} se Rs ${MAX_CRICKET_BET} ke beech hona chahiye.`);
      return;
    }
    try {
      setMessage("");
      await api.placeCricketBet(sessionToken, { matchId: targetMatch.id, marketType, selection, amount: betAmount });
      setMessage(`${formatSelectionLabel(targetMatch, selection)} bet placed successfully.`);
      setSelectedBet(null);
      await Promise.allSettled([reloadSessionData({ force: true }), loadCricketHistory({ force: true }), load()]);
    } catch (error) {
      setMessage(formatApiError(error, "Cricket bet place nahi hui."));
    }
  }

  return (
    <View style={styles.page}>
      <BackHeader subtitle="Cricket markets" title={String(params.title || match?.title || "Play Cricket").toUpperCase()} />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom + 112, 132) }]} showsVerticalScrollIndicator={false}>
        {loading ? (
          <SurfaceCard>
            <ActivityIndicator color={colors.primary} size="large" />
            <Text style={styles.stateText}>Cricket match load ho raha hai...</Text>
          </SurfaceCard>
        ) : match ? (
          <>
            <View style={styles.matchHero}>
              <View style={styles.matchHeroCopy}>
                <View style={styles.matchLogoRow}>
                  <CricketTeamLogo name={match.teamA} url={match.teamALogoUrl} />
                  <Text style={styles.matchVs}>VS</Text>
                  <CricketTeamLogo name={match.teamB} url={match.teamBLogoUrl} />
                </View>
                <Text style={styles.matchTitle}>{match.teamA} vs {match.teamB}</Text>
                <Text style={styles.matchSub}>{formatMatchType(match.matchType)} | {match.title}</Text>
                <Text style={styles.matchOver}>{formatStart(match.startAt)}</Text>
              </View>
              <View style={styles.ratePill}>
                <Text style={styles.ratePillText}>Scheduled</Text>
              </View>
            </View>

            {message ? <Text style={message.includes("success") || message.includes("placed") ? styles.successMessage : styles.errorMessage}>{message}</Text> : null}

            {MARKET_ORDER.map((marketType) => (
              <CricketMarketGroup
                key={marketType}
                amount={amount}
                match={match}
                marketType={marketType}
                onAmountChange={setAmount}
                onPlaceBet={placeBet}
                onSelect={(selection) => {
                  setMessage("");
                  setSelectedBet({ marketType, selection });
                }}
                selectedSelection={selectedBet?.marketType === marketType ? selectedBet.selection : ""}
              />
            ))}
          </>
        ) : (
          <SurfaceCard>
            <Text style={styles.emptyTitle}>Match available nahi hai</Text>
            <Text style={styles.emptySub}>Admin panel se cricket match open karo.</Text>
          </SurfaceCard>
        )}
      </ScrollView>
    </View>
  );
}

function CricketMarketGroup({
  amount,
  match,
  marketType,
  onAmountChange,
  onPlaceBet,
  onSelect,
  selectedSelection
}: {
  amount: string;
  match: CricketMatch;
  marketType: string;
  onAmountChange: (value: string) => void;
  onPlaceBet: (match: CricketMatch, marketType: string, selection: string) => void;
  onSelect: (selection: string) => void;
  selectedSelection: string;
}) {
  const market = match.markets?.[marketType];
  const isOpen = Boolean(market?.open);
  const winner = market?.winner || (marketType === "toss_winner" ? match.tossWinner : marketType === "match_winner" ? match.matchWinner : null);
  const copy = MARKET_COPY[marketType] || { title: market?.label || "Cricket Market", subtitle: "Selection choose karo.", icon: "baseball-outline" as const };
  const rates = market?.rates || {};
  const options = Object.entries(rates);
  return (
    <View style={styles.boardCard}>
      <View style={styles.boardHeader}>
        <View style={styles.boardIcon}>
          <Ionicons color={colors.surface} name={copy.icon} size={18} />
        </View>
        <View style={styles.boardCopy}>
          <Text style={styles.boardTitle}>{copy.title}</Text>
          <Text style={styles.boardSubtitle}>{winner ? `Result: ${formatSelectionLabel(match, winner)}` : isOpen ? `Close: ${formatStart(market?.closeAt || null)}` : "Betting closed"}</Text>
        </View>
        <View style={[styles.statusPill, isOpen ? styles.statusLive : styles.statusClosed]}>
          <Text style={styles.statusText}>{isOpen ? "OPEN" : "CLOSED"}</Text>
        </View>
      </View>
      <Text style={styles.helperText}>{copy.subtitle}</Text>
      <View style={styles.options}>
        {options.map(([selection, rate]) => (
          <Pressable
            key={selection}
            disabled={!isOpen}
            onPress={() => onSelect(selection)}
            style={[styles.optionButton, selectedSelection === selection && styles.optionSelected, !isOpen && styles.optionDisabled]}
          >
            <Text style={styles.optionText}>{formatSelectionLabel(match, selection, marketType)}</Text>
            <Text style={styles.rateText}>{rate}x</Text>
          </Pressable>
        ))}
      </View>
      {selectedSelection ? (
        <View style={styles.betPanel}>
          <View style={styles.betPanelCopy}>
            <Text style={styles.betPanelTitle}>{formatSelectionLabel(match, selectedSelection, marketType)}</Text>
            <Text style={styles.betPanelHint}>Min Rs {MIN_CRICKET_BET} | Max Rs {MAX_CRICKET_BET}</Text>
          </View>
          <View style={styles.betActionRow}>
            <TextInput
              keyboardType="numeric"
              onChangeText={(value) => onAmountChange(value.replace(/[^0-9]/g, ""))}
              placeholder="100"
              style={styles.amountInput}
              value={amount}
            />
            <Pressable onPress={() => onPlaceBet(match, marketType, selectedSelection)} style={styles.placeButton}>
              <Text style={styles.placeButtonText}>Place Bet</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

function CricketTeamLogo({ name, url }: { name: string; url?: string }) {
  const safeUrl = String(url || "").trim();
  const flag = getCricketTeamFlag(name);
  const showLooseFlag = Boolean(flag && !safeUrl);
  return (
    <View style={[styles.matchLogoBadge, showLooseFlag && styles.matchLogoFlagOnly]}>
      {safeUrl ? (
        <Image resizeMode="cover" source={{ uri: safeUrl }} style={styles.matchLogoImage} />
      ) : flag ? (
        <Text style={styles.matchFlagText}>{flag}</Text>
      ) : (
        <Text style={styles.matchLogoText}>{getTeamInitials(name)}</Text>
      )}
    </View>
  );
}

function getTeamInitials(name: string) {
  return String(name || "?").trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "?";
}

function formatMatchType(value?: string) {
  const raw = String(value || "T20").trim();
  return raw.toUpperCase() === "ODI" ? "ODI" : raw;
}

function formatSelectionLabel(match: CricketMatch, selection: string, marketType = "") {
  if (selection === "team_a") return marketType ? `${match.teamA} Win` : match.teamA;
  if (selection === "team_b") return marketType ? `${match.teamB} Win` : match.teamB;
  if (selection === "cancel") return "Refund";
  return selection.replace(/_/g, "-").replace("-plus", "+");
}

function formatStart(value: string | null) {
  if (!value) return "Time not set";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Time not set";
  return date.toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: 14, paddingVertical: 16, gap: 14 },
  stateText: { color: colors.textMuted, textAlign: "center", fontWeight: "700" },
  matchHero: {
    borderRadius: 20,
    backgroundColor: "#064e3b",
    borderWidth: 1,
    borderColor: "#10b981",
    padding: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12
  },
  matchHeroCopy: { flex: 1 },
  matchLogoRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
  matchLogoBadge: {
    width: 46,
    height: 46,
    borderRadius: 15,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#dcfce7",
    borderWidth: 1,
    borderColor: "#86efac"
  },
  matchLogoImage: { width: "100%", height: "100%" },
  matchLogoText: { color: "#065f46", fontSize: 13, fontWeight: "900" },
  matchLogoFlagOnly: {
    width: 36,
    height: 36,
    borderRadius: 0,
    borderWidth: 0,
    backgroundColor: "transparent"
  },
  matchFlagText: { fontSize: 30 },
  matchVs: { color: "#a7f3d0", fontSize: 11, fontWeight: "900" },
  matchTitle: { color: colors.surface, fontSize: 24, fontWeight: "900" },
  matchSub: { color: "#d1fae5", fontSize: 13, fontWeight: "800", marginTop: 4 },
  matchOver: { color: "#a7f3d0", fontSize: 13, fontWeight: "900", marginTop: 8 },
  ratePill: { alignSelf: "flex-start", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: "#dcfce7" },
  ratePillText: { color: "#166534", fontSize: 14, fontWeight: "900" },
  statusPill: { alignSelf: "flex-start", borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5 },
  statusLive: { backgroundColor: "#dcfce7" },
  statusClosed: { backgroundColor: colors.dangerSoft },
  statusText: { color: "#166534", fontSize: 10, fontWeight: "900" },
  amountInput: {
    width: 110,
    minHeight: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    paddingHorizontal: 12,
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: "900",
    textAlign: "right"
  },
  successMessage: { color: colors.success, fontSize: 13, fontWeight: "900" },
  errorMessage: { color: colors.danger, fontSize: 13, fontWeight: "900" },
  boardCard: {
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    gap: 12
  },
  boardHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  boardIcon: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: colors.accent },
  boardCopy: { flex: 1, gap: 2 },
  boardTitle: { color: colors.textPrimary, fontSize: 17, fontWeight: "900" },
  boardSubtitle: { color: colors.textSecondary, fontSize: 11, fontWeight: "800" },
  helperText: { color: colors.textMuted, fontSize: 12, fontWeight: "700", lineHeight: 17 },
  options: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  optionButton: {
    width: "47%",
    minHeight: 74,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ecfdf5",
    borderWidth: 1,
    borderColor: "#bbf7d0",
    paddingHorizontal: 8
  },
  optionDisabled: { opacity: 0.45 },
  optionSelected: {
    backgroundColor: "#d1fae5",
    borderColor: "#10b981",
    borderWidth: 2
  },
  optionText: { color: "#064e3b", fontSize: 15, fontWeight: "900", textAlign: "center" },
  rateText: { color: "#059669", fontSize: 14, fontWeight: "900", marginTop: 4 },
  betPanel: {
    borderRadius: 14,
    backgroundColor: "#fff7ed",
    borderWidth: 1,
    borderColor: "#fed7aa",
    padding: 12,
    gap: 10
  },
  betPanelCopy: { gap: 2 },
  betPanelTitle: { color: colors.textPrimary, fontSize: 14, fontWeight: "900" },
  betPanelHint: { color: colors.textMuted, fontSize: 11, fontWeight: "800" },
  betActionRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  placeButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary
  },
  placeButtonText: { color: colors.surface, fontSize: 13, fontWeight: "900" },
  emptyTitle: { color: colors.textPrimary, fontSize: 18, fontWeight: "900" },
  emptySub: { color: colors.danger, fontSize: 14, fontWeight: "700", marginTop: 8 }
});
