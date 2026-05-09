import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { DateRangeSheet } from "@/components/date-range-sheet";
import { AppHeader, AppScreen, SurfaceCard } from "@/components/ui";
import { useAppState } from "@/lib/app-state";
import { getCachedMarkets } from "@/lib/content-cache";
import { colors } from "@/theme/colors";

const PAGE_SIZE = 25;
const BET_RATE_MAP: Record<string, number> = {
  "Single Digit": 10,
  "Single Digit Bulk": 10,
  "Jodi Digit": 100,
  "Jodi Digit Bulk": 100,
  "Red Bracket": 100,
  "Digit Based Jodi": 100,
  "Single Pana": 160,
  "Single Pana Bulk": 160,
  "SP Motor": 160,
  "Double Pana": 320,
  "Double Pana Bulk": 320,
  "DP Motor": 320,
  "Triple Pana": 1000,
  "Half Sangam": 1000,
  "Full Sangam": 10000,
  "SP DP TP": 320
};

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

function formatWalletStatus(status: "SUCCESS" | "INITIATED" | "BACKOFFICE" | "REJECTED" | "FAILED" | "CANCELLED") {
  if (status === "SUCCESS") return "SUCCESS";
  if (status === "BACKOFFICE") return "PROCESSING";
  if (status === "REJECTED") return "REJECTED";
  if (status === "FAILED") return "FAILED";
  if (status === "CANCELLED") return "CANCELLED";
  return "PENDING";
}

function formatSessionDigit(sessionType: "Open" | "Close" | "NA", digit: string) {
  return sessionType === "NA" ? digit : `${sessionType.toUpperCase()}: ${digit}`;
}

function formatBoardAndDigit(boardLine: string, sessionType: "Open" | "Close" | "NA", digit: string) {
  return `${boardLine} ${formatSessionDigit(sessionType, digit)}`;
}

function formatBoardName(label: string) {
  return label.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatSessionLabel(sessionType: "Open" | "Close" | "NA") {
  return sessionType === "NA" ? "NA" : sessionType.toUpperCase();
}

function formatRate(gameType: string) {
  const rate = BET_RATE_MAP[gameType] ?? BET_RATE_MAP[formatBoardName(gameType)] ?? 0;
  return rate > 0 ? String(rate) : "-";
}

function toBidGroupKey(bid: {
  market: string;
  gameType: string;
  sessionType: "Open" | "Close" | "NA";
  createdAt: string;
}) {
  const date = new Date(bid.createdAt);
  if (Number.isNaN(date.getTime())) {
    return `${bid.market}|${bid.gameType}|${bid.sessionType}|${bid.createdAt}`;
  }
  const secondBucket = new Date(date);
  secondBucket.setMilliseconds(0);
  return `${bid.market}|${bid.gameType}|${bid.sessionType}|${secondBucket.toISOString()}`;
}

function formatWalletTitle(type: string) {
  const normalized = type.replace(/_/g, " ").trim().toUpperCase();
  if (normalized.includes("DEPOSIT")) return "Deposit";
  if (normalized.includes("WITHDRAW")) return "Withdraw";
  if (normalized.includes("BONUS")) return "Bonus";
  if (normalized.includes("REFERRAL")) return "Referral";
  if (normalized.includes("BID WIN REVERSAL")) return "Bid Win Reversal";
  if (normalized.includes("BID PLACED")) return "Bid Placed";
  if (normalized.includes("BID WIN")) return "Bid Win";
  if (normalized.includes("ADMIN CREDIT")) return "System Credit";
  if (normalized.includes("ADMIN DEBIT")) return "System Debit";
  return type.replace(/_/g, " ");
}

export default function HistoryScreen() {
  const params = useLocalSearchParams<{ payment?: string; reference?: string; amount?: string; status?: string }>();
  const { bids, walletEntries, loadBidHistory, loadWalletHistory } = useAppState();
  const [isFilterOpen, setFilterOpen] = useState(false);
  const [page, setPage] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedBetId, setSelectedBetId] = useState<string | null>(null);
  const [activeRange, setActiveRange] = useState<{ from: string; to: string } | null>(null);
  const [pendingFromDate, setPendingFromDate] = useState("");
  const [pendingToDate, setPendingToDate] = useState(currentDateInput);
  const marketMap = useMemo(() => {
    const markets = getCachedMarkets(24 * 60 * 60 * 1000) ?? [];
    return new Map(markets.map((market) => [String(market.name || "").toUpperCase(), market]));
  }, []);
  const paymentBanner = useMemo(() => {
    if (params.payment === "success") {
      return {
        tone: "success" as const,
        text: `Payment successful${params.reference ? ` - Ref ${params.reference}` : ""}${params.amount ? ` - Rs ${params.amount}` : ""}`
      };
    }

    if (params.payment === "failed") {
      const statusLabel = String(params.status || "failed").trim().toUpperCase();
      return {
        tone: "failed" as const,
        text: `Payment ${statusLabel}${params.reference ? ` - Ref ${params.reference}` : ""}${params.amount ? ` - Rs ${params.amount}` : ""}`
      };
    }

    return null;
  }, [params.amount, params.payment, params.reference, params.status]);

  const refreshData = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([loadBidHistory({ force: true }), loadWalletHistory({ force: true })]);
    } finally {
      setRefreshing(false);
    }
  }, [loadBidHistory, loadWalletHistory]);

  useFocusEffect(
    useCallback(() => {
      void Promise.all([loadBidHistory(), loadWalletHistory()]);
    }, [loadBidHistory, loadWalletHistory])
  );

  const filteredBidItems = useMemo(() => {
    const filtered = activeRange
      ? bids.filter((bid) => isWithinRange(bid.createdAt, activeRange.from, activeRange.to))
      : bids.filter((bid) => isToday(bid.createdAt));
    const groups = new Map<
      string,
      {
        id: string;
        title: string;
        subtitle: string;
        sessionType: "Open" | "Close" | "NA";
        payout: number;
        gameType: string;
        gameTime: string;
        createdAt: string;
        items: Array<{ digit: string; points: number }>;
      }
    >();

    for (const bid of filtered) {
      const gameType = formatBoardName(bid.gameType || bid.boardLabel);
      const key = toBidGroupKey({
        market: bid.market,
        gameType,
        sessionType: bid.sessionType,
        createdAt: bid.createdAt
      });
      const existing = groups.get(key);
      if (existing) {
        existing.payout += Number(bid.payout || 0);
        existing.items.push({ digit: bid.digit, points: bid.points });
        continue;
      }

      groups.set(key, {
        id: key,
        title: formatMarketLine(bid.market, bid.createdAt),
        subtitle: formatBoardLabel(bid.boardLabel).toUpperCase(),
        sessionType: bid.sessionType,
        payout: Number(bid.payout || 0),
        gameType,
        gameTime: marketMap.get(String(bid.market || "").toUpperCase())?.open || "-",
        createdAt: bid.createdAt,
        items: [{ digit: bid.digit, points: bid.points }]
      });
    }

    return Array.from(groups.values()).map((group) => ({
      ...group,
      digit: group.items.map((item) => item.digit).join(", "),
      points: group.items.reduce((sum, item) => sum + Number(item.points || 0), 0)
    }));
  }, [activeRange, bids, marketMap]);

  const filteredWalletItems = useMemo(() => {
    const filtered = activeRange
      ? walletEntries.filter((entry) => isWithinRange(entry.createdAt, activeRange.from, activeRange.to))
      : walletEntries.filter((entry) => isToday(entry.createdAt));

    return filtered.map((entry) => ({
      id: entry.id,
      title: formatWalletTitle(entry.type),
      status: entry.status,
      amount: entry.amount,
      kind: entry.kind,
      beforeBalance: entry.beforeBalance,
      afterBalance: entry.afterBalance,
      createdAt: entry.createdAt
    }));
  }, [activeRange, walletEntries]);

  const filteredItems = useMemo(
    () =>
      [...filteredWalletItems.map((item) => ({ ...item, historyType: "wallet" as const })), ...filteredBidItems.map((item) => ({ ...item, historyType: "bet" as const }))]
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [filteredBidItems, filteredWalletItems]
  );

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const pageStart = safePage * PAGE_SIZE;
  const pageEnd = Math.min(pageStart + PAGE_SIZE, filteredItems.length);
  const pageItems = filteredItems.slice(pageStart, pageEnd);
  const selectedBet = useMemo(
    () =>
      pageItems.find(
        (
          item
        ): item is Extract<(typeof pageItems)[number], { historyType: "bet" }> => item.historyType === "bet" && item.id === selectedBetId
      ) || null,
    [pageItems, selectedBetId]
  );
  const hasValidPendingRange = Boolean(parseDateInput(pendingFromDate) && parseDateInput(pendingToDate, true));
  const applyRange = () => {
    if (!hasValidPendingRange) {
      return;
    }
    setActiveRange({ from: pendingFromDate.trim(), to: pendingToDate.trim() });
    setPage(0);
    setSelectedBetId(null);
    setFilterOpen(false);
  };

  const clearRange = () => {
    setActiveRange(null);
    setPendingFromDate("");
    setPendingToDate(currentDateInput());
    setPage(0);
    setSelectedBetId(null);
    setFilterOpen(false);
  };

  return (
    <View style={styles.page}>
      <AppHeader title="History" subtitle={undefined} />
      <AppScreen onRefresh={() => void refreshData()} refreshing={refreshing}>
        {paymentBanner ? (
          <SurfaceCard style={[styles.paymentBanner, paymentBanner.tone === "failed" && styles.paymentBannerFailed]}>
            <Text style={[styles.paymentBannerText, paymentBanner.tone === "failed" && styles.paymentBannerFailedText]}>{paymentBanner.text}</Text>
          </SurfaceCard>
        ) : null}

        <View style={styles.toolbar}>
          <Text style={styles.toolbarValue}>{activeRange ? `${activeRange.from} to ${activeRange.to}` : "Today only"}</Text>
          <Pressable onPress={() => setFilterOpen(true)} style={styles.calendarButton}>
            <Ionicons color={colors.surface} name="calendar-outline" size={18} />
          </Pressable>
        </View>

        <View style={styles.paginationRow}>
          <Text style={styles.paginationLabel}>
            {filteredItems.length === 0 ? "0 entries" : `${pageStart + 1}-${pageEnd} of ${filteredItems.length} entries`}
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
            <Text style={styles.emptyTitle}>No history found</Text>
            <Text style={styles.emptySubtitle}>
              {activeRange ? "Selected date range me history available nahi hai." : "Sirf aaj ki history yahan dikhegi."}
            </Text>
          </SurfaceCard>
        ) : (
          <View style={styles.listStack}>
            {pageItems.map((item) => (
                <SurfaceCard key={item.id} style={styles.betCard}>
                  {item.historyType === "wallet" ? (
                    <>
                      <View style={styles.cardTopRow}>
                        <Text style={styles.dateText}>{formatBidDate(item.createdAt)}</Text>
                        <Text
                          style={[
                            styles.statusText,
                            item.status === "SUCCESS"
                              ? styles.statusWonText
                              : item.status === "FAILED" || item.status === "CANCELLED" || item.status === "REJECTED"
                                ? styles.statusLostText
                                : styles.statusPendingText
                          ]}
                        >
                          {formatWalletStatus(item.status)}
                        </Text>
                      </View>
                      <View style={styles.passbookGrid}>
                        <View style={styles.passbookCell}>
                          <Text style={styles.passbookLabel}>Before</Text>
                          <Text style={styles.passbookValue}>{Number(item.beforeBalance || 0).toFixed(2)}</Text>
                        </View>
                        <View style={styles.passbookCell}>
                          <Text style={styles.passbookLabel}>Amount</Text>
                          <Text style={styles.passbookValue}>{Number(item.amount || 0).toFixed(2)}</Text>
                        </View>
                        <View style={styles.passbookCellLast}>
                          <Text style={styles.passbookLabel}>After</Text>
                          <Text style={styles.passbookValue}>{Number(item.afterBalance || 0).toFixed(2)}</Text>
                        </View>
                      </View>
                      <View style={styles.walletMetaRow}>
                        <View style={styles.walletIconBox}>
                          <Ionicons color={colors.primaryDark} name="wallet-outline" size={18} />
                        </View>
                        <View style={styles.walletMetaCopy}>
                          <Text style={styles.passbookRequestLabel}>Request Type</Text>
                          <Text style={styles.itemTitle}>{item.title}</Text>
                        </View>
                      </View>
                    </>
                  ) : (
                    <>
                  <View style={styles.cardTopRow}>
                    <Text style={styles.dateText}>{formatBidDate(item.createdAt)}</Text>
                    <Text style={styles.betKindText}>MATKA</Text>
                  </View>
                      <View style={styles.betInfoStack}>
                        <View style={styles.betInfoRow}>
                          <View style={styles.betInfoCopy}>
                            <Text style={styles.betInfoLabel}>Game Name</Text>
                            <Text style={styles.itemTitle}>{item.title}</Text>
                          </View>
                          <Pressable hitSlop={10} onPress={() => setSelectedBetId(item.id)} style={styles.arrowButton}>
                            <Ionicons color={colors.primaryDark} name="arrow-forward" size={16} />
                          </Pressable>
                        </View>
                        <View style={styles.betInfoRow}>
                          <View style={styles.betInfoCopy}>
                            <Text style={styles.betInfoLabel}>Bet Type</Text>
                            <Text style={styles.itemSubtitle}>{item.gameType}</Text>
                          </View>
                        </View>
                        <View style={styles.betInfoRow}>
                          <View style={styles.betInfoCopy}>
                            <Text style={styles.betInfoLabel}>Game Time</Text>
                            <Text style={styles.itemSubtitle}>{item.gameTime}</Text>
                          </View>
                        </View>
                        <View style={styles.betInfoRow}>
                          <View style={styles.betInfoCopy}>
                            <Text style={styles.betInfoLabel}>Game Session</Text>
                            <Text style={styles.itemSubtitle}>{formatSessionLabel(item.sessionType)}</Text>
                          </View>
                        </View>
                        <View style={styles.betInfoRow}>
                          <View style={styles.betInfoCopy}>
                            <Text style={styles.betInfoLabel}>Bet Amount</Text>
                            <Text style={styles.itemSubtitle}>Rs {item.points}</Text>
                          </View>
                        </View>
                      </View>
                    </>
                  )}
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
          subtitle="Jis date se history dekhni hai, wahi range yahan select karo."
          title="Select your date range"
          toDate={pendingToDate}
        />

        <Modal animationType="fade" onRequestClose={() => setSelectedBetId(null)} transparent visible={Boolean(selectedBet)}>
          <View style={styles.modalOverlay}>
            <Pressable onPress={() => setSelectedBetId(null)} style={styles.backdrop} />
            <View style={styles.modalCard}>
              <View style={styles.modalHead}>
                <Text style={styles.modalTitle}>{selectedBet?.gameType || "-"}</Text>
                <View style={styles.modalHeadRight}>
                  <Text style={styles.modalBadge}>BET</Text>
                  <Pressable onPress={() => setSelectedBetId(null)} style={styles.closeButton}>
                    <Ionicons color="#667085" name="close" size={18} />
                  </Pressable>
                </View>
              </View>
              {selectedBet ? (
                <>
                  {selectedBet.items.map((betItem, index) => (
                    <View key={`${selectedBet.id}-${betItem.digit}-${index}`} style={[styles.detailTable, index > 0 && styles.detailTableGap]}>
                      <View style={styles.detailCol}>
                        <Text style={styles.detailHead}>Digit</Text>
                        <Text style={styles.detailCell}>{betItem.digit}</Text>
                      </View>
                      <View style={styles.detailCol}>
                        <Text style={styles.detailHead}>Amount</Text>
                        <Text style={styles.detailCell}>Rs {betItem.points}</Text>
                      </View>
                      <View style={styles.detailColLast}>
                        <Text style={styles.detailHead}>Rate</Text>
                        <Text style={styles.detailCell}>{formatRate(selectedBet.gameType)}</Text>
                      </View>
                    </View>
                  ))}
                </>
              ) : null}
            </View>
          </View>
        </Modal>
      </AppScreen>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  paymentBanner: {
    backgroundColor: colors.successSoft,
    borderColor: "#b7ebc6"
  },
  paymentBannerFailed: {
    backgroundColor: colors.dangerSoft,
    borderColor: "#f3b4b4"
  },
  paymentBannerText: {
    color: colors.success,
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 18
  },
  paymentBannerFailedText: {
    color: colors.danger
  },
  toolbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  toolbarValue: { color: "#475467", fontSize: 14, fontWeight: "800" },
  calendarButton: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: colors.primary },
  paginationRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  paginationLabel: { color: "#344054", fontSize: 13, fontWeight: "700" },
  paginationActions: { flexDirection: "row", gap: 8 },
  pageButton: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: "#d0d5dd", alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
  pageButtonDisabled: { opacity: 0.45 },
  emptyTitle: { color: "#111827", fontSize: 17, fontWeight: "800" },
  emptySubtitle: { color: "#667085", fontSize: 13, lineHeight: 20 },
  listStack: { gap: 4 },
  betCard: { borderRadius: 10, gap: 8, padding: 12 },
  cardTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  passbookGrid: { flexDirection: "row", borderWidth: 1, borderColor: "#eef2f7", borderRadius: 12, overflow: "hidden" },
  passbookCell: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 10, borderRightWidth: 1, borderRightColor: "#eef2f7", gap: 4 },
  passbookCellLast: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 10, gap: 4 },
  passbookLabel: { color: "#667085", fontSize: 11, fontWeight: "600" },
  passbookValue: { color: "#111827", fontSize: 15, fontWeight: "700" },
  walletMetaRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingTop: 2 },
  walletIconBox: { width: 34, height: 34, borderRadius: 12, backgroundColor: "#eef2ff", alignItems: "center", justifyContent: "center" },
  walletMetaCopy: { flex: 1, gap: 2 },
  passbookRequestLabel: { color: "#667085", fontSize: 11, fontWeight: "600" },
  betInfoStack: { gap: 10 },
  betInfoRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  betInfoCopy: { flex: 1, gap: 2 },
  betInfoLabel: { color: "#667085", fontSize: 11, fontWeight: "600" },
  arrowButton: { width: 30, height: 30, borderRadius: 15, backgroundColor: "#eef2ff", alignItems: "center", justifyContent: "center" },
  betKindText: { color: "#06b6d4", fontSize: 12, fontWeight: "700" },
  itemTitle: { color: "#111827", fontSize: 14, fontWeight: "700" },
  itemSubtitle: { color: "#344054", fontSize: 13, fontWeight: "400", lineHeight: 18 },
  statusText: { fontSize: 12, fontWeight: "700" },
  statusWonText: { color: "#15803d" },
  statusLostText: { color: "#dc2626" },
  statusPendingText: { color: "#2563eb" },
  dateText: { color: "#475467", fontSize: 11, fontWeight: "600" },
  amountText: { color: "#344054", fontSize: 12, fontWeight: "400" },
  modalOverlay: { flex: 1, justifyContent: "flex-start", backgroundColor: "rgba(15,23,42,0.35)" },
  backdrop: { ...StyleSheet.absoluteFillObject },
  modalCard: { marginTop: 120, marginHorizontal: 14, backgroundColor: colors.surface, borderRadius: 18, padding: 14, gap: 14 },
  modalHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  modalHeadRight: { flexDirection: "row", alignItems: "center", gap: 10 },
  modalTitle: { color: "#111827", fontSize: 18, fontWeight: "700", flex: 1 },
  modalBadge: { color: "#06b6d4", fontSize: 12, fontWeight: "700" },
  closeButton: { width: 28, height: 28, borderRadius: 8, borderWidth: 1, borderColor: "#d0d5dd", alignItems: "center", justifyContent: "center" },
  detailTable: { flexDirection: "row", borderWidth: 1, borderColor: "#eef2f7", borderRadius: 14, overflow: "hidden" },
  detailTableGap: { marginTop: 10 },
  detailCol: { flex: 1, alignItems: "center", paddingVertical: 12, gap: 6, borderRightWidth: 1, borderRightColor: "#eef2f7" },
  detailColLast: { flex: 1, alignItems: "center", paddingVertical: 12, gap: 6 },
  detailHead: { color: "#667085", fontSize: 12, fontWeight: "600" },
  detailCell: { color: "#111827", fontSize: 16, fontWeight: "700" }
});
