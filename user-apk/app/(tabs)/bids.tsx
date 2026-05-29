import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { DateRangeSheet } from "@/components/date-range-sheet";
import { AppHeader, AppScreen, SurfaceCard } from "@/components/ui";
import { useAppState } from "@/lib/app-state";
import { colors } from "@/theme/colors";

const PAGE_SIZE = 25;

function currentDateInput() {
  const now = new Date();
  const year = now.getFullYear();
  const month = `${now.getMonth() + 1}`.padStart(2, "0");
  const day = `${now.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isToday(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return false;
  }

  const now = new Date();
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
}

function parseDateInput(value: string, endOfDay = false) {
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return null;
  }

  const suffix = endOfDay ? "T23:59:59.999" : "T00:00:00.000";
  const date = new Date(`${trimmed}${suffix}`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isWithinRange(value: string, from: string, to: string) {
  const createdAt = new Date(value);
  if (Number.isNaN(createdAt.getTime())) {
    return false;
  }

  const fromDate = parseDateInput(from, false);
  const toDate = parseDateInput(to, true);
  if (!fromDate || !toDate) {
    return false;
  }

  return createdAt >= fromDate && createdAt <= toDate;
}

function formatBidDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-IN", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function formatMarketLine(market: string, value: string) {
  return market.toUpperCase();
}

function formatBoardLabel(label: string) {
  return label.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatCricketSelection(selection: string) {
  if (selection === "team_a") return "Team A";
  if (selection === "team_b") return "Team B";
  if (selection === "cancel") return "Refund";
  return String(selection || "").replace(/_/g, "-").replace("-plus", "+");
}

function formatStatus(status: "Pending" | "Won" | "Lost" | "Refunded") {
  if (status === "Won") return "WIN";
  if (status === "Lost") return "LOSS";
  if (status === "Refunded") return "REFUND";
  return "BET";
}

function formatSessionDigit(sessionType: "Open" | "Close" | "NA", digit: string) {
  return sessionType === "NA" ? digit : `${sessionType.toUpperCase()}: ${digit}`;
}

function formatBoardAndDigit(boardLine: string, sessionType: "Open" | "Close" | "NA", digit: string) {
  return `${boardLine} ${formatSessionDigit(sessionType, digit)}`;
}

function compareBidsByHistoryOrder(left: { id: string; createdAt: string }, right: { id: string; createdAt: string }) {
  const leftTime = new Date(left.createdAt).getTime();
  const rightTime = new Date(right.createdAt).getTime();

  if (leftTime !== rightTime) {
    return rightTime - leftTime;
  }

  return right.id.localeCompare(left.id);
}

export default function BidsScreen() {
  const { bids, cricketBets, loadBidHistory, loadCricketHistory } = useAppState();
  const [isFilterOpen, setFilterOpen] = useState(false);
  const [page, setPage] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [activeRange, setActiveRange] = useState<{ from: string; to: string } | null>(null);
  const [bidMode, setBidMode] = useState<"matka" | "cricket">("matka");
  const [pendingFromDate, setPendingFromDate] = useState("");
  const [pendingToDate, setPendingToDate] = useState(currentDateInput);

  const refreshData = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([loadBidHistory({ force: true }), loadCricketHistory({ force: true })]);
    } finally {
      setRefreshing(false);
    }
  }, [loadBidHistory, loadCricketHistory]);

  useFocusEffect(
    useCallback(() => {
      void Promise.all([loadBidHistory(), loadCricketHistory()]);
    }, [loadBidHistory, loadCricketHistory])
  );

  const filteredMatkaItems = useMemo(() => {
    return (activeRange
      ? bids.filter((bid) => isWithinRange(bid.createdAt, activeRange.from, activeRange.to))
      : bids.filter((bid) => isToday(bid.createdAt))
    )
      .slice()
      .sort(compareBidsByHistoryOrder)
      .map((bid) => ({
        ...bid,
        marketLine: formatMarketLine(bid.market, bid.createdAt),
        boardLine: formatBoardLabel(bid.boardLabel).toUpperCase()
      }));
  }, [activeRange, bids]);

  const filteredCricketItems = useMemo(() => {
    return (activeRange
      ? cricketBets.filter((bid) => isWithinRange(bid.createdAt, activeRange.from, activeRange.to))
      : cricketBets.filter((bid) => isToday(bid.createdAt))
    )
      .slice()
      .sort(compareBidsByHistoryOrder)
      .map((bid) => ({
        id: bid.id,
        createdAt: bid.createdAt,
        status: bid.status,
        payout: Number(bid.payout || 0),
        sessionType: "NA" as const,
        digit: formatCricketSelection(bid.selection),
        points: Number(bid.amount || 0),
        marketLine: String(bid.matchTitle || "Cricket Match").toUpperCase(),
        boardLine: `CRICKET ${formatBoardLabel(String(bid.marketType || ""))}`.toUpperCase()
      }));
  }, [activeRange, cricketBets]);

  const filteredItems = bidMode === "cricket" ? filteredCricketItems : filteredMatkaItems;

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const pageStart = safePage * PAGE_SIZE;
  const pageEnd = Math.min(pageStart + PAGE_SIZE, filteredItems.length);
  const pageItems = filteredItems.slice(pageStart, pageEnd);
  const hasValidPendingRange = Boolean(parseDateInput(pendingFromDate) && parseDateInput(pendingToDate, true));
  const applyRange = () => {
    if (!hasValidPendingRange) {
      return;
    }
    setActiveRange({ from: pendingFromDate.trim(), to: pendingToDate.trim() });
    setPage(0);
    setFilterOpen(false);
  };

  const clearRange = () => {
    setActiveRange(null);
    setPendingFromDate("");
    setPendingToDate(currentDateInput());
    setPage(0);
    setFilterOpen(false);
  };

  return (
    <View style={styles.page}>
      <AppHeader title="All Bids" subtitle={undefined} />
      <AppScreen onRefresh={() => void refreshData()} refreshing={refreshing}>
        <View style={styles.toolbar}>
          <Text style={styles.toolbarValue}>{activeRange ? `${activeRange.from} to ${activeRange.to}` : "Today only"}</Text>
          <Pressable onPress={() => setFilterOpen(true)} style={styles.calendarButton}>
            <Ionicons color={colors.surface} name="calendar-outline" size={18} />
          </Pressable>
        </View>

        <View style={styles.bidModeSwitch}>
          <Pressable onPress={() => { setBidMode("matka"); setPage(0); }} style={[styles.bidModeButton, bidMode === "matka" && styles.bidModeActive]}>
            <Text style={[styles.bidModeText, bidMode === "matka" && styles.bidModeTextActive]}>Matka</Text>
          </Pressable>
          <Pressable onPress={() => { setBidMode("cricket"); setPage(0); }} style={[styles.bidModeButton, bidMode === "cricket" && styles.bidModeActive]}>
            <Text style={[styles.bidModeText, bidMode === "cricket" && styles.bidModeTextActive]}>Cricket</Text>
          </Pressable>
        </View>

        <View style={styles.paginationRow}>
          <Text style={styles.paginationLabel}>
            {filteredItems.length === 0 ? "0 bets" : `${pageStart + 1}-${pageEnd} of ${filteredItems.length} bets`}
          </Text>
          <View style={styles.paginationActions}>
            <Pressable disabled={safePage === 0} onPress={() => setPage((current) => Math.max(0, current - 1))} style={[styles.pageButton, safePage === 0 && styles.pageButtonDisabled]}>
              <Ionicons color={safePage === 0 ? "#98a2b3" : colors.primaryDark} name="chevron-back" size={18} />
            </Pressable>
            <Pressable
              disabled={safePage >= totalPages - 1 || filteredItems.length === 0}
              onPress={() => setPage((current) => Math.min(totalPages - 1, current + 1))}
              style={[styles.pageButton, (safePage >= totalPages - 1 || filteredItems.length === 0) && styles.pageButtonDisabled]}
            >
              <Ionicons color={safePage >= totalPages - 1 || filteredItems.length === 0 ? "#98a2b3" : colors.primaryDark} name="chevron-forward" size={18} />
            </Pressable>
          </View>
        </View>

        {pageItems.length === 0 ? (
          <SurfaceCard>
            <Text style={styles.emptyTitle}>No bids found</Text>
            <Text style={styles.emptySubtitle}>
              {activeRange ? "Selected date range me bids available nahi hain." : "Sirf aaj ki bids yahan dikhengi."}
            </Text>
          </SurfaceCard>
        ) : (
          <View style={styles.listStack}>
            {pageItems.map((bid) => (
              <SurfaceCard key={bid.id} style={styles.betCard}>
                <View style={styles.cardTopRow}>
                  <Text style={styles.dateText}>{formatBidDate(bid.createdAt)}</Text>
                  <Text style={[styles.statusText, bid.status === "Won" ? styles.wonText : bid.status === "Lost" ? styles.lostText : styles.pendingText]}>
                    {formatStatus(bid.status)}
                  </Text>
                </View>
                <Text style={styles.bidMarket}>{bid.marketLine}</Text>
                <View style={styles.cardBottomRow}>
                  <View style={styles.cardLeft}>
                    <Text style={styles.bidBoard}>{formatBoardAndDigit(bid.boardLine, bid.sessionType, bid.digit)}</Text>
                    <Text style={styles.amountText}>Bet Amount Rs {bid.points}</Text>
                  </View>
                  <View style={styles.cardRight}>
                    {bid.payout > 0 ? <Text style={styles.winText}>Rs {bid.payout}</Text> : null}
                  </View>
                </View>
              </SurfaceCard>
            ))}
          </View>
        )}

        <DateRangeSheet
          canApply={hasValidPendingRange}
          fromDate={pendingFromDate}
          onApply={applyRange}
          onChangeFrom={setPendingFromDate}
          onChangeTo={setPendingToDate}
          onClear={clearRange}
          onClose={() => setFilterOpen(false)}
          open={isFilterOpen}
          subtitle="Jis date se all bids dekhni hai, wahi range yahan select karo."
          title="Select your date range"
          toDate={pendingToDate}
        />
      </AppScreen>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  toolbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  toolbarValue: { color: "#475467", fontSize: 14, fontWeight: "800" },
  calendarButton: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: colors.primary },
  bidModeSwitch: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden"
  },
  bidModeButton: {
    flex: 1,
    minHeight: 42,
    alignItems: "center",
    justifyContent: "center"
  },
  bidModeActive: { backgroundColor: colors.primary },
  bidModeText: { color: colors.textSecondary, fontSize: 13, fontWeight: "900" },
  bidModeTextActive: { color: colors.surface },
  paginationRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  paginationLabel: { color: "#344054", fontSize: 13, fontWeight: "700" },
  paginationActions: { flexDirection: "row", gap: 8 },
  pageButton: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: "#d0d5dd", alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
  pageButtonDisabled: { opacity: 0.45 },
  emptyTitle: { color: "#111827", fontSize: 17, fontWeight: "800" },
  emptySubtitle: { color: "#667085", fontSize: 13, lineHeight: 20 },
  listStack: { gap: 8 },
  betCard: { borderRadius: 18, gap: 10, padding: 14 },
  cardTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  cardBottomRow: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  cardLeft: { flex: 1, gap: 2, paddingRight: 8 },
  cardRight: { minWidth: 112, alignItems: "flex-end", justifyContent: "flex-end", gap: 4 },
  bidMarket: { color: "#111827", fontSize: 14, fontWeight: "700" },
  bidBoard: { color: "#111827", fontSize: 13, fontWeight: "400", lineHeight: 18 },
  statusText: { fontSize: 13, fontWeight: "500" },
  pendingText: { color: "#0ea5e9" },
  wonText: { color: "#15803d" },
  lostText: { color: "#dc2626" },
  dateText: { color: "#475467", fontSize: 11, fontWeight: "400" },
  amountText: { color: "#111827", fontSize: 12, fontWeight: "400" },
  winText: { color: "#15803d", fontSize: 15, fontWeight: "500", textAlign: "right" }
});
