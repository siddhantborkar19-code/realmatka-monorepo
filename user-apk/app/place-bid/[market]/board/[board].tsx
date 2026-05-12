import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { AppScreen, BackHeader } from "@/components/ui";
import { useAppState } from "@/lib/app-state";
import { api } from "@/lib/api";
import { colors } from "@/theme/colors";

const redBracketOptions = ["00", "05", "11", "16", "22", "27", "33", "38", "44", "49", "50", "55", "61", "66", "72", "77", "83", "88", "94", "99"];
const singlePanaChartByDigit: Record<string, string[]> = {
  "1": ["128", "137", "146", "236", "245", "290", "380", "470", "489", "560", "678", "579"],
  "2": ["129", "138", "147", "156", "237", "246", "345", "390", "480", "570", "679", "589"],
  "3": ["120", "139", "148", "157", "238", "247", "256", "346", "490", "580", "670", "689"],
  "4": ["130", "149", "158", "167", "239", "248", "257", "347", "356", "590", "680", "789"],
  "5": ["140", "159", "168", "230", "249", "258", "267", "348", "357", "456", "690", "780"],
  "6": ["123", "150", "169", "178", "240", "259", "268", "349", "358", "457", "367", "790"],
  "7": ["124", "160", "179", "250", "269", "278", "340", "359", "368", "458", "467", "890"],
  "8": ["125", "134", "170", "189", "260", "279", "350", "369", "378", "459", "567", "468"],
  "9": ["126", "135", "180", "234", "270", "289", "360", "379", "450", "469", "478", "568"],
  "0": ["127", "136", "145", "190", "235", "280", "370", "389", "460", "479", "569", "578"]
};
const doublePanaChartByDigit: Record<string, string[]> = {
  "1": ["119", "155", "227", "335", "344", "399", "588", "669", "100"],
  "2": ["110", "228", "255", "336", "499", "660", "688", "778", "200"],
  "3": ["166", "229", "337", "355", "445", "599", "779", "788", "300"],
  "4": ["112", "220", "266", "338", "446", "455", "699", "770", "400"],
  "5": ["113", "122", "177", "339", "366", "447", "799", "889", "500"],
  "6": ["114", "277", "330", "448", "466", "556", "880", "899", "600"],
  "7": ["115", "133", "188", "223", "377", "449", "557", "566", "700"],
  "8": ["116", "224", "233", "288", "440", "477", "558", "990", "800"],
  "9": ["117", "144", "199", "225", "388", "559", "577", "667", "900"],
  "0": ["118", "226", "244", "299", "334", "488", "668", "677", "550"]
};
const triplePanaByDigit: Record<string, string> = {
  "1": "777",
  "2": "444",
  "3": "111",
  "4": "888",
  "5": "555",
  "6": "222",
  "7": "999",
  "8": "666",
  "9": "333",
  "0": "000"
};
const allSinglePanaOptions = Object.values(singlePanaChartByDigit).flat();
const allDoublePanaOptions = Object.values(doublePanaChartByDigit).flat();
const allSinglePanaOptionSet = new Set(allSinglePanaOptions);
const allDoublePanaOptionSet = new Set(allDoublePanaOptions);
type BoardHelperData = {
  options: string[];
  suggestions: string[];
  validationMessage: string;
  sangam: { valid: boolean; value: string; message: string };
};

type MarketPhase = "open-running" | "close-running" | "closed" | "upcoming";
const MIN_BID_POINTS = 5;
const MAX_BID_POINTS = 99999;

const emptyBoardHelper: BoardHelperData = {
  options: [],
  suggestions: [],
  validationMessage: "",
  sangam: { valid: false, value: "", message: "" }
};
const boardHelperCache = new Map<string, BoardHelperData>();
const BOARD_HELPER_DEBOUNCE_MS = 180;

function useBoardHelper(
  boardLabel: string,
  query = "",
  sessionType?: "Open" | "Close",
  first = "",
  second = ""
) {
  const [data, setData] = useState<BoardHelperData>(emptyBoardHelper);

  useEffect(() => {
    let mounted = true;
    const cacheKey = JSON.stringify([boardLabel, query, sessionType, first, second]);
    const cached = boardHelperCache.get(cacheKey);
    if (cached) {
      setData(cached);
      return () => {
        mounted = false;
      };
    }

    const timer = setTimeout(() => {
      api
        .boardHelper(boardLabel, query, sessionType, first, second)
        .then((response) => {
          boardHelperCache.set(cacheKey, response);
          if (mounted) {
            setData(response);
          }
        })
        .catch(() => {
          if (mounted) {
            setData(emptyBoardHelper);
          }
        });
    }, BOARD_HELPER_DEBOUNCE_MS);

    return () => {
      mounted = false;
      clearTimeout(timer);
    };
  }, [boardLabel, first, query, second, sessionType]);

  return data;
}

export default function BettingBoardScreen() {
  const params = useLocalSearchParams<{ label?: string; boardLabel?: string; market?: string; marketPhase?: string; blockedBoards?: string | string[] }>();
  const marketLabel = params.label ?? "MANGAL BAZAR";
  const boardLabel = params.boardLabel ?? "Single Digit";
  const marketPhase = normalizeMarketPhase(params.marketPhase);
  const blockedBoards = parseBlockedBoards(params.blockedBoards);

  if (marketPhase === "closed" || blockedBoards.has(boardLabel) || isBoardBlockedForPhase(boardLabel, marketPhase)) {
    return <BlockedBoardState boardLabel={boardLabel} marketLabel={marketLabel} marketPhase={marketPhase} />;
  }

  if (boardLabel === "Jodi Digit") {
    return <JodiDigitBoard boardLabel={boardLabel} marketLabel={marketLabel} />;
  }

  if (boardLabel === "Jodi Digit Bulk") {
    return <JodiDigitBulkBoard boardLabel={boardLabel} marketLabel={marketLabel} />;
  }

  if (boardLabel === "Single Pana Bulk") {
    return <SinglePanaBulkBoard boardLabel={boardLabel} marketLabel={marketLabel} marketPhase={marketPhase} />;
  }

  if (boardLabel === "Double Pana") {
    return <DoublePanaBoard boardLabel={boardLabel} marketLabel={marketLabel} marketPhase={marketPhase} />;
  }

  if (boardLabel === "Double Pana Bulk") {
    return <DoublePanaBulkBoard boardLabel={boardLabel} marketLabel={marketLabel} marketPhase={marketPhase} />;
  }

  if (boardLabel === "SP Motor" || boardLabel === "DP Motor") {
    return <MotorBoard boardLabel={boardLabel} marketLabel={marketLabel} marketPhase={marketPhase} />;
  }

  if (boardLabel === "SP DP TP") {
    return <SpDpTpBoard boardLabel={boardLabel} marketLabel={marketLabel} marketPhase={marketPhase} />;
  }

  if (boardLabel === "Red Bracket") {
    return <RedBracketBoard boardLabel={boardLabel} marketLabel={marketLabel} />;
  }

  if (boardLabel === "Digit Based Jodi") {
    return <DigitBasedJodiBoard boardLabel={boardLabel} marketLabel={marketLabel} />;
  }

  if (boardLabel === "Half Sangam" || boardLabel === "Full Sangam") {
    return <SangamBoard boardLabel={boardLabel} marketLabel={marketLabel} marketPhase={marketPhase} />;
  }

  if (boardLabel === "Triple Pana") {
    return <AdvancedPanaBoard boardLabel={boardLabel} marketLabel={marketLabel} marketPhase={marketPhase} />;
  }

  if (boardLabel.includes("Bulk")) {
    return <BulkBoard boardLabel={boardLabel} marketLabel={marketLabel} marketPhase={marketPhase} />;
  }

  if (boardLabel.includes("Pana")) {
    return <PanaBoard boardLabel={boardLabel} marketLabel={marketLabel} marketPhase={marketPhase} />;
  }

  return <DigitBoard boardLabel={boardLabel} marketLabel={marketLabel} marketPhase={marketPhase} />;
}

function normalizeMarketPhase(value?: string): MarketPhase {
  if (value === "close-running" || value === "closed" || value === "upcoming") {
    return value;
  }
  return "open-running";
}

function parseBlockedBoards(value?: string | string[]) {
  const source = Array.isArray(value) ? value.join("||") : String(value ?? "");
  return new Set(
    source
      .split("||")
      .map((item) => item.trim())
      .filter(Boolean)
  );
}

function isOpenCutoffOnlyBoard(boardLabel: string) {
  return [
    "Jodi Digit",
    "Jodi Digit Bulk",
    "Red Bracket",
    "Digit Based Jodi",
    "Half Sangam",
    "Full Sangam"
  ].includes(boardLabel);
}

function isBoardBlockedForPhase(boardLabel: string, marketPhase: MarketPhase) {
  if (marketPhase === "closed") {
    return true;
  }
  if (marketPhase === "close-running" && isOpenCutoffOnlyBoard(boardLabel)) {
    return true;
  }
  return false;
}

function getLockedSessionType(marketPhase: MarketPhase): "Open" | "Close" | null {
  if (marketPhase === "close-running") {
    return "Close";
  }
  return null;
}

function getDefaultSessionType(marketPhase: MarketPhase) {
  if (marketPhase === "close-running") {
    return "Close";
  }
  return "Open";
}

function isBidPointsValid(points: number) {
  return points >= MIN_BID_POINTS && points <= MAX_BID_POINTS;
}

function getBidPointsValidationMessage(points: number) {
  if (points < MIN_BID_POINTS) {
    return `Minimum bid amount ${MIN_BID_POINTS} honi chahiye.`;
  }
  if (points > MAX_BID_POINTS) {
    return `Maximum bid amount ${MAX_BID_POINTS} honi chahiye.`;
  }
  return "";
}

function useBoardSessionType(marketPhase: MarketPhase) {
  const lockedSessionType = useMemo(() => getLockedSessionType(marketPhase), [marketPhase]);
  const [sessionType, setSessionTypeState] = useState<"Open" | "Close">(() => getDefaultSessionType(marketPhase));

  useEffect(() => {
    if (lockedSessionType) {
      setSessionTypeState(lockedSessionType);
    }
  }, [lockedSessionType]);

  const setSessionType: Dispatch<SetStateAction<"Open" | "Close">> = (value) => {
    setSessionTypeState((current) => {
      if (lockedSessionType) {
        return lockedSessionType;
      }
      return typeof value === "function" ? value(current) : value;
    });
  };

  return { sessionType, setSessionType, lockedSessionType };
}

function BlockedBoardState({
  marketLabel,
  boardLabel,
  marketPhase
}: {
  marketLabel: string;
  boardLabel: string;
  marketPhase: MarketPhase;
}) {
  const title =
    marketPhase === "closed"
      ? "Betting is closed for today."
      : "Is board ki betting open cutoff ke baad band ho jati hai.";

  const subtitle =
    marketPhase === "closed"
      ? "Market close ho chuka hai. Aaj ke liye is board par koi bet accept nahi hogi."
      : "Yeh board sirf open time tak valid hai. Open time ke baad is board par bet nahi lag sakti.";

  return (
    <View style={styles.page}>
      <BackHeader title={`${marketLabel.toUpperCase()} - ${boardLabel} Board`} />
      <AppScreen showPromo={false}>
        <EmptyBidState subtitle={subtitle} title={title} />
      </AppScreen>
    </View>
  );
}

function isSessionlessBoard(boardLabel: string) {
  return [
    "Jodi Digit",
    "Jodi Digit Bulk",
    "SP DP TP",
    "Red Bracket",
    "Digit Based Jodi",
    "Full Sangam"
  ].includes(boardLabel);
}

function JodiDigitBoard({ marketLabel, boardLabel }: { marketLabel: string; boardLabel: string }) {
  const { setDraftBid } = useAppState();
  const [jodiValue, setJodiValue] = useState("");
  const [points, setPoints] = useState("");
  const [entries, setEntries] = useState<Array<{ digit: string; points: number; gameType: string }>>([]);
  const currentPoints = Number(points || 0);
  const canAdd = /^[0-9]{2}$/.test(jodiValue.trim()) && isBidPointsValid(currentPoints);

  return (
    <View style={styles.page}>
      <BackHeader title={`${marketLabel.toUpperCase()} - ${boardLabel} Board`} />
      <AppScreen
        footer={
          <BottomContinue
            bidCount={entries.length}
            onContinue={() => continueToSlip(setDraftBid, marketLabel, boardLabel, "NA", entries)}
            points={entries.reduce((sum, item) => sum + item.points, 0)}
          />
        }
        showPromo={false}
      >
        <BoardDateOnly />
        <Text style={styles.fieldHintText}>2 digit jodi complete hote hi woh automatically list me add ho jayegi.</Text>
        <View style={styles.formRow}>
          <View style={styles.labeledFieldWrap}>
            <Text style={styles.fieldLabel}>Jodi</Text>
            <TextInput
              keyboardType="numeric"
              maxLength={2}
              onChangeText={setJodiValue}
              placeholder="Jodi"
              placeholderTextColor="#98a2b3"
              style={styles.field}
              value={jodiValue}
            />
          </View>
          <View style={styles.labeledFieldWrap}>
            <Text style={styles.fieldLabel}>Enter Points</Text>
            <TextInput
              keyboardType="numeric"
              onChangeText={setPoints}
              placeholder="Enter points"
              placeholderTextColor="#98a2b3"
              style={styles.field}
              value={points}
            />
          </View>
        </View>
        <View style={styles.addBidWrap}>
          <Pressable
            disabled={!canAdd}
            onPress={() => {
              if (!canAdd) {
                return;
              }
              setEntries((current) => [...current, { digit: jodiValue.trim(), points: currentPoints, gameType: boardLabel }]);
              setJodiValue("");
              setPoints("");
            }}
            style={[styles.addBidButton, !canAdd && styles.continueDisabled]}
          >
            <Text style={styles.addBidText}>ADD BID</Text>
          </Pressable>
        </View>
        {jodiValue.length > 0 && jodiValue.length < 2 ? <Text style={styles.helperText}>Jodi me sirf 2 digit allow hai.</Text> : null}
        <SelectedBidList
          emptySubtitle="Bid add karne ke liye upar digit aur points fill karke ADD BID dabao."
          emptyTitle="No bids added yet"
          items={entries}
          onRemove={(index) => setEntries((current) => current.filter((_, currentIndex) => currentIndex !== index))}
        />
      </AppScreen>
    </View>
  );
}

function JodiDigitBulkBoard({ marketLabel, boardLabel }: { marketLabel: string; boardLabel: string }) {
  const { setDraftBid } = useAppState();
  const [jodiValue, setJodiValue] = useState("");
  const [points, setPoints] = useState("");
  const [entries, setEntries] = useState<Array<{ digit: string; points: number; gameType: string }>>([]);
  const [duplicateMessage, setDuplicateMessage] = useState("");
  const lastAutoAddedRef = useRef("");
  const currentPoints = Number(points || 0);

  useEffect(() => {
    const normalizedJodi = jodiValue.trim();
    const canAutoAdd = /^[0-9]{2}$/.test(normalizedJodi) && isBidPointsValid(currentPoints);

    if (!canAutoAdd) {
      if (normalizedJodi.length < 2) {
        lastAutoAddedRef.current = "";
      }
      return;
    }

    const nextKey = `${normalizedJodi}:${currentPoints}`;
    if (lastAutoAddedRef.current === nextKey) {
      return;
    }

    const alreadyExists = entries.some((item) => item.digit === normalizedJodi);
    if (alreadyExists) {
      setDuplicateMessage(`${normalizedJodi} already added hai.`);
      lastAutoAddedRef.current = nextKey;
      setJodiValue("");
      return;
    }

    setDuplicateMessage("");
    setEntries((current) => [...current, { digit: normalizedJodi, points: currentPoints, gameType: boardLabel }]);
    lastAutoAddedRef.current = nextKey;
    setJodiValue("");
  }, [boardLabel, currentPoints, entries, jodiValue]);

  return (
    <View style={styles.page}>
      <BackHeader title={`${marketLabel.toUpperCase()} - ${boardLabel} Board`} />
      <AppScreen
        footer={
          <BottomContinue
            bidCount={entries.length}
            onContinue={() => continueToSlip(setDraftBid, marketLabel, boardLabel, "NA", entries)}
            points={entries.reduce((sum, item) => sum + item.points, 0)}
          />
        }
        showPromo={false}
      >
        <BoardDateOnly />
        <View style={styles.formRow}>
          <View style={styles.labeledFieldWrap}>
            <Text style={styles.fieldLabel}>Jodi</Text>
            <TextInput
              keyboardType="numeric"
              maxLength={2}
              onChangeText={setJodiValue}
              placeholder="Enter jodi"
              placeholderTextColor={colors.textMuted}
              style={styles.field}
              value={jodiValue}
            />
          </View>
          <View style={styles.labeledFieldWrap}>
            <Text style={styles.fieldLabel}>Enter Points</Text>
            <TextInput
              keyboardType="numeric"
              onChangeText={(value) => {
                setPoints(value);
                if (duplicateMessage) {
                  setDuplicateMessage("");
                }
              }}
              placeholder="Enter points"
              placeholderTextColor={colors.textMuted}
              style={styles.field}
              value={points}
            />
          </View>
        </View>
        {jodiValue.length > 0 && jodiValue.length < 2 ? <Text style={styles.validationError}>2 digit complete karo, phir jodi auto add ho jayegi.</Text> : null}
        {duplicateMessage ? <Text style={styles.validationError}>{duplicateMessage}</Text> : null}
        <SelectedBidList
          emptySubtitle="Jodi aur shared points enter karke ADD JODI karo. Saari added jodi yahan dikhegi."
          emptyTitle="No bulk jodi added yet"
          items={entries}
          onRemove={(index) => setEntries((current) => current.filter((_, currentIndex) => currentIndex !== index))}
        />
      </AppScreen>
    </View>
  );
}

function SinglePanaBulkBoard({ marketLabel, boardLabel, marketPhase }: { marketLabel: string; boardLabel: string; marketPhase: MarketPhase }) {
  const { setDraftBid } = useAppState();
  const { sessionType, setSessionType, lockedSessionType } = useBoardSessionType(marketPhase);
  const [points, setPoints] = useState("");
  const [entries, setEntries] = useState<Array<{ digit: string; points: number; gameType: string; sourceDigit: string }>>([]);
  const [selectedDigits, setSelectedDigits] = useState<string[]>([]);
  const [helperMessage, setHelperMessage] = useState("");
  const currentPoints = Number(points || 0);
  const items = entries.map(({ digit, points: itemPoints, gameType }) => ({ digit, points: itemPoints, gameType }));

  return (
    <View style={styles.page}>
      <BackHeader title={`${marketLabel.toUpperCase()} - ${boardLabel} Board`} />
      <AppScreen
        footer={
          <BottomContinue
            bidCount={items.length}
            onContinue={() => continueToSlip(setDraftBid, marketLabel, boardLabel, sessionType, items)}
            points={items.reduce((sum, item) => sum + item.points, 0)}
          />
        }
        showPromo={false}
      >
        <BoardMetaFields allowedSessionType={lockedSessionType} sessionType={sessionType} setSessionType={setSessionType} />
        <Text style={styles.fieldHintText}>Points ek baar dalo. Fir niche digit choose karte hi us digit ke saare single panna add ho jayenge.</Text>
        <Text style={styles.fieldLabel}>Enter Points</Text>
        <TextInput
          keyboardType="numeric"
          onChangeText={(value) => {
            setPoints(value);
            if (helperMessage) {
              setHelperMessage("");
            }
          }}
          placeholder="Enter points"
          placeholderTextColor={colors.textMuted}
          style={styles.fullField}
          value={points}
        />
        <View style={styles.bulkGrid}>
          {["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"].map((digit) => {
            const active = selectedDigits.includes(digit);
            const sourceEntry = entries.find((entry) => entry.sourceDigit === digit);
            return (
              <Pressable
                key={digit}
                onPress={() => {
                  if (!isBidPointsValid(currentPoints)) {
                    setHelperMessage(getBidPointsValidationMessage(currentPoints));
                    return;
                  }

                  if (active) {
                    setHelperMessage("");
                    setSelectedDigits((current) => current.filter((item) => item !== digit));
                    setEntries((current) => current.filter((entry) => entry.sourceDigit !== digit));
                    return;
                  }

                  const pannas = singlePanaChartByDigit[digit] ?? [];
                  if (!pannas.length) {
                    return;
                  }

                  setHelperMessage("");
                  setSelectedDigits((current) => [...current, digit]);
                  setEntries((current) => [
                    ...current,
                    ...pannas.map((panna) => ({ digit: panna, points: currentPoints, gameType: boardLabel, sourceDigit: digit }))
                  ]);
                }}
                style={[styles.bulkTile, active && styles.bulkTileActive]}
              >
                {active && sourceEntry ? (
                  <View style={[styles.bulkAmountBadge, active && styles.bulkAmountBadgeActive]}>
                    <Text style={[styles.bulkAmountText, active && styles.bulkAmountTextActive]}>{`Rs ${sourceEntry.points}`}</Text>
                  </View>
                ) : null}
                <Text style={[styles.bulkText, active && styles.bulkTextActive]}>{digit}</Text>
              </Pressable>
            );
          })}
        </View>
        {helperMessage ? <Text style={styles.validationError}>{helperMessage}</Text> : null}
        <SelectedBidList
          emptySubtitle="Points enter karke koi bhi digit select karo. Us digit ke saare single panna yahan auto add honge."
          emptyTitle="No single panna bulk entries yet"
          items={items}
          onRemove={(index) =>
            setEntries((current) => {
              const target = current[index];
              const next = current.filter((_, currentIndex) => currentIndex !== index);
              if (target) {
                const stillHasDigit = next.some((entry) => entry.sourceDigit === target.sourceDigit);
                if (!stillHasDigit) {
                  setSelectedDigits((currentDigits) => currentDigits.filter((digit) => digit !== target.sourceDigit));
                }
              }
              return next;
            })
          }
        />
      </AppScreen>
    </View>
  );
}

function DoublePanaBoard({ marketLabel, boardLabel, marketPhase }: { marketLabel: string; boardLabel: string; marketPhase: MarketPhase }) {
  const { setDraftBid } = useAppState();
  const { sessionType, setSessionType, lockedSessionType } = useBoardSessionType(marketPhase);
  const [panaValue, setPanaValue] = useState("");
  const [points, setPoints] = useState("");
  const [entries, setEntries] = useState<Array<{ digit: string; points: number; gameType: string }>>([]);
  const [validationMessage, setValidationMessage] = useState("");
  const currentPoints = Number(points || 0);
  const canAdd = /^[0-9]{3}$/.test(panaValue.trim()) && isBidPointsValid(currentPoints) && !validationMessage;

  return (
    <View style={styles.page}>
      <BackHeader title={`${marketLabel.toUpperCase()} - ${boardLabel} Board`} />
      <AppScreen
        footer={
          <BottomContinue
            bidCount={entries.length}
            onContinue={() => continueToSlip(setDraftBid, marketLabel, boardLabel, sessionType, entries)}
            points={entries.reduce((sum, item) => sum + item.points, 0)}
          />
        }
        showPromo={false}
      >
        <BoardMetaFields allowedSessionType={lockedSessionType} sessionType={sessionType} setSessionType={setSessionType} />
        <View style={styles.formRowWrap}>
          <View style={styles.formRow}>
            <View style={styles.labeledFieldWrap}>
              <Text style={styles.fieldLabel}>Double Pana</Text>
              <PannaAutocompleteField
                boardLabel={boardLabel}
                onChangeText={setPanaValue}
                onValidationChange={setValidationMessage}
                placeholder="Double Pana"
                value={panaValue}
              />
            </View>
            <View style={styles.labeledFieldWrap}>
              <Text style={styles.fieldLabel}>Enter Points</Text>
              <TextInput
                keyboardType="numeric"
                onChangeText={setPoints}
                placeholder="Enter points"
                placeholderTextColor="#98a2b3"
                style={styles.field}
                value={points}
              />
            </View>
          </View>
        </View>
        <View style={styles.addBidWrap}>
          <Pressable
            disabled={!canAdd}
            onPress={() => {
              if (!canAdd) {
                return;
              }
              setEntries((current) => [...current, { digit: panaValue.trim(), points: currentPoints, gameType: boardLabel }]);
              setPanaValue("");
              setPoints("");
            }}
            style={[styles.addBidButton, !canAdd && styles.continueDisabled]}
          >
            <Text style={styles.addBidText}>ADD BID</Text>
          </Pressable>
        </View>
        {validationMessage ? <Text style={styles.validationError}>Enter valid Double Pana only.</Text> : null}
        {!validationMessage ? <Text style={styles.helperText}>Double Pana select hone ke baad points daalo aur `ADD BID` karo.</Text> : null}
        <SelectedBidList
          emptySubtitle="Double Pana select karke points dalo aur ADD BID karo. Added entries yahan dikhenge."
          emptyTitle="No double pana entries yet"
          items={entries}
          onRemove={(index) => setEntries((current) => current.filter((_, currentIndex) => currentIndex !== index))}
        />
      </AppScreen>
    </View>
  );
}

function DoublePanaBulkBoard({ marketLabel, boardLabel, marketPhase }: { marketLabel: string; boardLabel: string; marketPhase: MarketPhase }) {
  const { setDraftBid } = useAppState();
  const { sessionType, setSessionType, lockedSessionType } = useBoardSessionType(marketPhase);
  const [points, setPoints] = useState("");
  const [entries, setEntries] = useState<Array<{ digit: string; points: number; gameType: string; sourceDigit: string }>>([]);
  const [selectedDigits, setSelectedDigits] = useState<string[]>([]);
  const [helperMessage, setHelperMessage] = useState("");
  const currentPoints = Number(points || 0);
  const items = entries.map(({ digit, points: itemPoints, gameType }) => ({ digit, points: itemPoints, gameType }));

  return (
    <View style={styles.page}>
      <BackHeader title={`${marketLabel.toUpperCase()} - ${boardLabel} Board`} />
      <AppScreen
        footer={
          <BottomContinue
            bidCount={items.length}
            onContinue={() => continueToSlip(setDraftBid, marketLabel, boardLabel, sessionType, items)}
            points={items.reduce((sum, item) => sum + item.points, 0)}
          />
        }
        showPromo={false}
      >
        <BoardMetaFields allowedSessionType={lockedSessionType} sessionType={sessionType} setSessionType={setSessionType} />
        <Text style={styles.fieldHintText}>Points ek baar dalo. Fir niche digit choose karte hi us digit ke saare double panna add ho jayenge.</Text>
        <Text style={styles.fieldLabel}>Enter Points</Text>
        <TextInput
          keyboardType="numeric"
          onChangeText={(value) => {
            setPoints(value);
            if (helperMessage) {
              setHelperMessage("");
            }
          }}
          placeholder="Enter points"
          placeholderTextColor={colors.textMuted}
          style={styles.fullField}
          value={points}
        />
        <View style={styles.bulkGrid}>
          {["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"].map((digit) => {
            const active = selectedDigits.includes(digit);
            const sourceEntry = entries.find((entry) => entry.sourceDigit === digit);
            return (
              <Pressable
                key={digit}
                onPress={() => {
                  if (!isBidPointsValid(currentPoints)) {
                    setHelperMessage(getBidPointsValidationMessage(currentPoints));
                    return;
                  }

                  if (active) {
                    setHelperMessage("");
                    setSelectedDigits((current) => current.filter((item) => item !== digit));
                    setEntries((current) => current.filter((entry) => entry.sourceDigit !== digit));
                    return;
                  }

                  const pannas = doublePanaChartByDigit[digit] ?? [];
                  if (!pannas.length) {
                    return;
                  }

                  setHelperMessage("");
                  setSelectedDigits((current) => [...current, digit]);
                  setEntries((current) => [
                    ...current,
                    ...pannas.map((panna) => ({ digit: panna, points: currentPoints, gameType: boardLabel, sourceDigit: digit }))
                  ]);
                }}
                style={[styles.bulkTile, active && styles.bulkTileActive]}
              >
                {active && sourceEntry ? (
                  <View style={[styles.bulkAmountBadge, active && styles.bulkAmountBadgeActive]}>
                    <Text style={[styles.bulkAmountText, active && styles.bulkAmountTextActive]}>{`Rs ${sourceEntry.points}`}</Text>
                  </View>
                ) : null}
                <Text style={[styles.bulkText, active && styles.bulkTextActive]}>{digit}</Text>
              </Pressable>
            );
          })}
        </View>
        {helperMessage ? <Text style={styles.validationError}>{helperMessage}</Text> : null}
        <SelectedBidList
          emptySubtitle="Points enter karke koi bhi digit select karo. Us digit ke saare double panna yahan auto add honge."
          emptyTitle="No double panna bulk entries yet"
          items={items}
          onRemove={(index) =>
            setEntries((current) => {
              const target = current[index];
              const next = current.filter((_, currentIndex) => currentIndex !== index);
              if (target) {
                const stillHasDigit = next.some((entry) => entry.sourceDigit === target.sourceDigit);
                if (!stillHasDigit) {
                  setSelectedDigits((currentDigits) => currentDigits.filter((digit) => digit !== target.sourceDigit));
                }
              }
              return next;
            })
          }
        />
      </AppScreen>
    </View>
  );
}

function MotorBoard({ marketLabel, boardLabel, marketPhase }: { marketLabel: string; boardLabel: string; marketPhase: MarketPhase }) {
  const { setDraftBid } = useAppState();
  const { sessionType, setSessionType, lockedSessionType } = useBoardSessionType(marketPhase);
  const [editDigits, setEditDigits] = useState("");
  const [points, setPoints] = useState("");
  const [entries, setEntries] = useState<Array<{ digit: string; points: number; gameType: string }>>([]);
  const [helperMessage, setHelperMessage] = useState("");
  const items = entries;
  const isSingleMotor = boardLabel === "SP Motor";
  const generatedTitle = isSingleMotor ? "Single Pana" : "Double Pana";
  const emptyTitle = isSingleMotor ? "No SP motor entries yet" : "No DP motor entries yet";
  const emptySubtitle = isSingleMotor
    ? "Edit digit aur points enter karke ADD MOTOR dabao. Saare possible Single Pana yahan auto add honge."
    : "Edit digit aur points enter karke ADD MOTOR dabao. Saare possible Double Pana yahan auto add honge.";

  return (
    <View style={styles.page}>
      <BackHeader title={`${marketLabel.toUpperCase()} - ${boardLabel} Board`} />
      <AppScreen
        footer={
          <BottomContinue
            bidCount={items.length}
            onContinue={() => continueToSlip(setDraftBid, marketLabel, boardLabel, sessionType, items)}
            points={items.reduce((sum, item) => sum + item.points, 0)}
          />
        }
        showPromo={false}
      >
        <Text style={styles.fieldLabel}>Select Session</Text>
        <BoardMetaFields allowedSessionType={lockedSessionType} sessionType={sessionType} setSessionType={setSessionType} />
        <View style={styles.formRow}>
          <View style={styles.labeledFieldWrap}>
            <Text style={styles.fieldLabel}>Enter Digit (Min 4)</Text>
            <TextInput
              keyboardType="numeric"
              maxLength={10}
              onChangeText={(value) => {
                setEditDigits(value.replace(/[^0-9]/g, ""));
                if (helperMessage) {
                  setHelperMessage("");
                }
              }}
              placeholder="Enter digit"
              placeholderTextColor="#98a2b3"
              style={styles.field}
              value={editDigits}
            />
            <Text style={styles.fieldSubtext}>0123456789</Text>
          </View>
          <View style={styles.labeledFieldWrap}>
            <Text style={styles.fieldLabel}>Enter Points</Text>
            <TextInput
              keyboardType="numeric"
              onChangeText={(value) => {
                setPoints(value);
                if (helperMessage) {
                  setHelperMessage("");
                }
              }}
              placeholder="Enter points"
              placeholderTextColor="#98a2b3"
              style={styles.field}
              value={points}
            />
          </View>
        </View>
        <View style={styles.addBidWrap}>
          <Pressable
            onPress={() => {
              const generated = isSingleMotor ? buildSinglePanaMotorEntries(editDigits) : buildDoublePanaMotorEntries(editDigits);
              const currentPoints = Number(points || 0);

              if (generated.error) {
                setHelperMessage(generated.error);
                return;
              }
              if (!isBidPointsValid(currentPoints)) {
                setHelperMessage(getBidPointsValidationMessage(currentPoints));
                return;
              }

              setHelperMessage("");
              setEntries((current) => {
                const existingDigits = new Set(current.map((item) => item.digit));
                const nextItems = generated.pannas
                  .filter((digit) => !existingDigits.has(digit))
                  .map((digit) => ({ digit, points: currentPoints, gameType: boardLabel }));
                return [...current, ...nextItems];
              });
              setEditDigits("");
            }}
            style={styles.addBidButton}
          >
            <Text style={styles.addBidText}>ADD MOTOR</Text>
          </Pressable>
        </View>
        {helperMessage ? <Text style={styles.validationError}>{helperMessage}</Text> : null}
        <SelectedBidList
          emptySubtitle={emptySubtitle}
          emptyTitle={emptyTitle}
          items={entries}
          onRemove={(index) => setEntries((current) => current.filter((_, currentIndex) => currentIndex !== index))}
        />
      </AppScreen>
    </View>
  );
}

function GroupJodiBoard({ marketLabel, boardLabel }: { marketLabel: string; boardLabel: string }) {
  return <PresetSelectionBoard boardLabel={boardLabel} marketLabel={marketLabel} options={["12-21", "34-43", "56-65", "78-87", "90-09", "11-22"]} />;
}

function SpDpTpBoard({ marketLabel, boardLabel, marketPhase }: { marketLabel: string; boardLabel: string; marketPhase: MarketPhase }) {
  const { setDraftBid } = useAppState();
  const { sessionType, setSessionType, lockedSessionType } = useBoardSessionType(marketPhase);
  const [points, setPoints] = useState("");
  const [digitValue, setDigitValue] = useState("");
  const [selectedTypes, setSelectedTypes] = useState<Array<"SP" | "DP" | "TP">>([]);
  const [entries, setEntries] = useState<Array<{ digit: string; points: number; gameType: string; sourceDigit: string }>>([]);
  const [helperMessage, setHelperMessage] = useState("");
  const currentPoints = Number(points || 0);
  const items = entries.map(({ digit, points: itemPoints, gameType }) => ({ digit, points: itemPoints, gameType }));

  return (
    <View style={styles.page}>
      <BackHeader title={`${marketLabel.toUpperCase()} - ${boardLabel} Board`} />
      <AppScreen
        footer={
          <BottomContinue
            bidCount={items.length}
            onContinue={() => continueToSlip(setDraftBid, marketLabel, boardLabel, sessionType, items)}
            points={items.reduce((sum, item) => sum + item.points, 0)}
          />
        }
        showPromo={false}
      >
        <BoardMetaFields allowedSessionType={lockedSessionType} sessionType={sessionType} setSessionType={setSessionType} />
        <Text style={styles.fieldLabel}>Select Bet Type</Text>
        <View style={styles.typeSelectionRow}>
          {(["SP", "DP", "TP"] as const).map((type) => {
            const active = selectedTypes.includes(type);
            return (
              <Pressable
                key={type}
                onPress={() => {
                  setHelperMessage("");
                  setSelectedTypes((current) => (current.includes(type) ? current.filter((item) => item !== type) : [...current, type]));
                }}
                style={[styles.typeChip, active && styles.typeChipActive]}
              >
                <Text style={[styles.typeChipText, active && styles.typeChipTextActive]}>{type}</Text>
              </Pressable>
            );
          })}
        </View>
        <View style={styles.formRow}>
          <View style={styles.labeledFieldWrap}>
            <Text style={styles.fieldLabel}>Enter Digit</Text>
            <TextInput
              keyboardType="numeric"
              maxLength={1}
              onChangeText={(value) => {
                setDigitValue(value.replace(/[^0-9]/g, ""));
                if (helperMessage) {
                  setHelperMessage("");
                }
              }}
              placeholder="Enter digit"
              placeholderTextColor="#98a2b3"
              style={styles.field}
              value={digitValue}
            />
          </View>
          <View style={styles.labeledFieldWrap}>
            <Text style={styles.fieldLabel}>Enter Points</Text>
            <TextInput
              keyboardType="numeric"
              onChangeText={(value) => {
                setPoints(value);
                if (helperMessage) {
                  setHelperMessage("");
                }
              }}
              placeholder="Enter points"
              placeholderTextColor="#98a2b3"
              style={styles.field}
              value={points}
            />
          </View>
        </View>
        <View style={styles.addBidWrap}>
          <Pressable
            onPress={() => {
              const digit = digitValue.trim();

              if (!selectedTypes.length) {
                setHelperMessage("Pehle bet type select karo.");
                return;
              }
              if (!/^[0-9]$/.test(digit)) {
                setHelperMessage("1 single digit enter karo.");
                return;
              }
              if (!isBidPointsValid(currentPoints)) {
                setHelperMessage(getBidPointsValidationMessage(currentPoints));
                return;
              }

              const nextEntries: Array<{ digit: string; points: number; gameType: string; sourceDigit: string }> = [];

              if (selectedTypes.includes("SP")) {
                for (const panna of singlePanaChartByDigit[digit] ?? []) {
                  nextEntries.push({ digit: panna, points: currentPoints, gameType: "SP", sourceDigit: digit });
                }
              }
              if (selectedTypes.includes("DP")) {
                for (const panna of doublePanaChartByDigit[digit] ?? []) {
                  nextEntries.push({ digit: panna, points: currentPoints, gameType: "DP", sourceDigit: digit });
                }
              }
              if (selectedTypes.includes("TP")) {
                const panna = triplePanaByDigit[digit];
                if (panna) {
                  nextEntries.push({ digit: panna, points: currentPoints, gameType: "TP", sourceDigit: digit });
                }
              }

              setHelperMessage("");
              setEntries((current) => {
                const existing = new Set(current.map((item) => `${item.digit}-${item.gameType}`));
                const filtered = nextEntries.filter((item) => !existing.has(`${item.digit}-${item.gameType}`));
                return [...current, ...filtered];
              });
              setDigitValue("");
            }}
            style={styles.addBidButton}
          >
            <Text style={styles.addBidText}>ADD BID</Text>
          </Pressable>
        </View>
        {helperMessage ? <Text style={styles.validationError}>{helperMessage}</Text> : null}
        <SelectedBidList
          emptySubtitle="Bet type select karo, points dalo, phir digit press karo. Selected types ke hisab se saare panna auto add honge."
          emptyTitle="No SP DP TP entries yet"
          items={entries}
          onRemove={(index) => setEntries((current) => current.filter((_, currentIndex) => currentIndex !== index))}
        />
      </AppScreen>
    </View>
  );
}

function OddEvenBoard({ marketLabel, boardLabel }: { marketLabel: string; boardLabel: string }) {
  return <PresetSelectionBoard boardLabel={boardLabel} marketLabel={marketLabel} options={["Odd", "Even", "Odd-Odd", "Even-Even", "Odd-Even", "Even-Odd"]} />;
}

function RedBracketBoard({ marketLabel, boardLabel }: { marketLabel: string; boardLabel: string }) {
  const { setDraftBid } = useAppState();
  const [bracketValue, setBracketValue] = useState("");
  const [points, setPoints] = useState("");
  const [entries, setEntries] = useState<Array<{ digit: string; points: number; gameType: string }>>([]);
  const [helperMessage, setHelperMessage] = useState("");
  const [addAllBrackets, setAddAllBrackets] = useState(false);
  const currentPoints = Number(points || 0);
  const items = entries;

  return (
    <View style={styles.page}>
      <BackHeader title={`${marketLabel.toUpperCase()} - ${boardLabel} Board`} />
      <AppScreen
        footer={
          <BottomContinue
            bidCount={items.length}
            onContinue={() => continueToSlip(setDraftBid, marketLabel, boardLabel, "NA", items)}
            points={items.reduce((sum, item) => sum + item.points, 0)}
          />
        }
        showPromo={false}
      >
        <BoardDateOnly />
        <View style={styles.toggleRow}>
          <Pressable
            onPress={() => {
              setAddAllBrackets((current) => !current);
              if (helperMessage) {
                setHelperMessage("");
              }
            }}
            style={[styles.checkboxWrap, addAllBrackets && styles.checkboxWrapActive]}
          >
            <Text style={[styles.checkboxTick, addAllBrackets && styles.checkboxTickActive]}>{addAllBrackets ? "✓" : ""}</Text>
          </Pressable>
          <Text style={styles.fieldLabel}>Add All Brackets</Text>
        </View>
        <View style={styles.formRow}>
          <View style={[styles.labeledFieldWrap, styles.redBracketFieldWrap]}>
            <Text style={styles.fieldLabel}>Enter Red Bracket</Text>
            {addAllBrackets ? (
              <View style={[styles.field, styles.selectField, styles.selectFieldDisabled]}>
                <Text style={styles.selectFieldText}>All brackets selected</Text>
              </View>
            ) : (
              <RedBracketAutocompleteField
                onChangeText={(value) => {
                  setBracketValue(value);
                  if (helperMessage) {
                    setHelperMessage("");
                  }
                }}
                value={bracketValue}
              />
            )}
          </View>
          <View style={styles.labeledFieldWrap}>
            <Text style={styles.fieldLabel}>Enter Points</Text>
            <TextInput
              keyboardType="numeric"
              onChangeText={(value) => {
                setPoints(value);
                if (helperMessage) {
                  setHelperMessage("");
                }
              }}
              placeholder="Enter points"
              placeholderTextColor="#98a2b3"
              style={styles.field}
              value={points}
            />
          </View>
        </View>
        <View style={styles.addBidWrap}>
          <Pressable
            onPress={() => {
              if (!isBidPointsValid(currentPoints)) {
                setHelperMessage(getBidPointsValidationMessage(currentPoints));
                return;
              }

              if (addAllBrackets) {
                setHelperMessage("");
                setEntries((current) => {
                  const existing = new Set(current.map((item) => item.digit));
                  const nextItems = redBracketOptions
                    .filter((digit) => !existing.has(digit))
                    .map((digit) => ({ digit, points: currentPoints, gameType: boardLabel }));
                  return [...current, ...nextItems];
                });
                return;
              }

              const digit = bracketValue.trim();
              if (!redBracketOptions.includes(digit)) {
                setHelperMessage("Sirf valid 20 Red Bracket jodi allowed hain.");
                return;
              }

              setHelperMessage("");
              setEntries((current) => {
                if (current.some((item) => item.digit === digit)) {
                  return current;
                }
                return [...current, { digit, points: currentPoints, gameType: boardLabel }];
              });
              setBracketValue("");
            }}
            style={styles.addBidButton}
          >
            <Text style={styles.addBidText}>ADD BID</Text>
          </Pressable>
        </View>
        {helperMessage ? <Text style={styles.validationError}>{helperMessage}</Text> : null}
        <SelectedBidList
          emptySubtitle="All brackets par ek saath bid laga sakte ho, ya valid 20 me se koi ek Red Bracket jodi add kar sakte ho."
          emptyTitle="No red bracket bids yet"
          items={entries}
          onRemove={(index) => setEntries((current) => current.filter((_, currentIndex) => currentIndex !== index))}
        />
      </AppScreen>
    </View>
  );
}

function DigitBasedJodiBoard({ marketLabel, boardLabel }: { marketLabel: string; boardLabel: string }) {
  const { setDraftBid } = useAppState();
  const [leftDigit, setLeftDigit] = useState("");
  const [rightDigit, setRightDigit] = useState("");
  const [points, setPoints] = useState("");
  const [entries, setEntries] = useState<Array<{ digit: string; points: number; gameType: string }>>([]);
  const [helperMessage, setHelperMessage] = useState("");
  const currentPoints = Number(points || 0);
  const items = entries;

  return (
    <View style={styles.page}>
      <BackHeader title={`${marketLabel.toUpperCase()} - ${boardLabel} Board`} />
      <AppScreen
        footer={
          <BottomContinue
            bidCount={items.length}
            onContinue={() => continueToSlip(setDraftBid, marketLabel, boardLabel, "NA", items)}
            points={items.reduce((sum, item) => sum + item.points, 0)}
          />
        }
        showPromo={false}
      >
        <BoardDateOnly />
        <View style={styles.formRow}>
          <View style={styles.labeledFieldWrap}>
            <Text style={styles.fieldLabel}>Left Digit</Text>
            <TextInput
              editable={!rightDigit}
              keyboardType="numeric"
              maxLength={1}
              onChangeText={(value) => {
                setLeftDigit(value.replace(/[^0-9]/g, ""));
                if (value.replace(/[^0-9]/g, "")) {
                  setRightDigit("");
                }
                if (helperMessage) {
                  setHelperMessage("");
                }
              }}
              placeholder="Left"
              placeholderTextColor="#98a2b3"
              style={[styles.field, rightDigit && styles.disabledField]}
              value={leftDigit}
            />
          </View>
          <View style={styles.labeledFieldWrap}>
            <Text style={styles.fieldLabel}>Right Digit</Text>
            <TextInput
              editable={!leftDigit}
              keyboardType="numeric"
              maxLength={1}
              onChangeText={(value) => {
                setRightDigit(value.replace(/[^0-9]/g, ""));
                if (value.replace(/[^0-9]/g, "")) {
                  setLeftDigit("");
                }
                if (helperMessage) {
                  setHelperMessage("");
                }
              }}
              placeholder="Right"
              placeholderTextColor="#98a2b3"
              style={[styles.field, leftDigit && styles.disabledField]}
              value={rightDigit}
            />
          </View>
          <View style={styles.labeledFieldWrap}>
            <Text style={styles.fieldLabel}>Enter Points</Text>
            <TextInput
              keyboardType="numeric"
              onChangeText={(value) => {
                setPoints(value);
                if (helperMessage) {
                  setHelperMessage("");
                }
              }}
              placeholder="Points"
              placeholderTextColor="#98a2b3"
              style={styles.field}
              value={points}
            />
          </View>
        </View>
        <View style={styles.addBidWrap}>
          <Pressable
            onPress={() => {
              if (!isBidPointsValid(currentPoints)) {
                setHelperMessage(getBidPointsValidationMessage(currentPoints));
                return;
              }
              if (!leftDigit && !rightDigit) {
                setHelperMessage("Left ya Right me se ek digit enter karo.");
                return;
              }
              if (leftDigit && rightDigit) {
                setHelperMessage("Ek time par sirf Left ya Right digit use kar sakte ho.");
                return;
              }

              const generated = new Set<string>();
              if (/^[0-9]$/.test(leftDigit)) {
                for (let index = 0; index <= 9; index += 1) {
                  generated.add(`${leftDigit}${index}`);
                }
              }
              if (/^[0-9]$/.test(rightDigit)) {
                for (let index = 0; index <= 9; index += 1) {
                  generated.add(`${index}${rightDigit}`);
                }
              }

              const nextJodis = Array.from(generated);
              setHelperMessage("");
              setEntries((current) => {
                const existing = new Set(current.map((item) => item.digit));
                const nextItems = nextJodis
                  .filter((digit) => !existing.has(digit))
                  .map((digit) => ({ digit, points: currentPoints, gameType: boardLabel }));
                return [...current, ...nextItems];
              });
              setLeftDigit("");
              setRightDigit("");
            }}
            style={styles.addBidButton}
          >
            <Text style={styles.addBidText}>ADD BID</Text>
          </Pressable>
        </View>
        {helperMessage ? <Text style={styles.validationError}>{helperMessage}</Text> : null}
        <SelectedBidList
          emptySubtitle="Left digit se start hone wali ya right digit par end hone wali saari jodi auto add hongi."
          emptyTitle="No digit based jodi entries yet"
          items={entries}
          onRemove={(index) => setEntries((current) => current.filter((_, currentIndex) => currentIndex !== index))}
        />
      </AppScreen>
    </View>
  );
}

function ChoicePanaBoard({ marketLabel, boardLabel }: { marketLabel: string; boardLabel: string }) {
  return <PanaBoard boardLabel={boardLabel} marketLabel={marketLabel} marketPhase="open-running" />;
}

function PanelGroupBoard({ marketLabel, boardLabel }: { marketLabel: string; boardLabel: string }) {
  const { options } = useBoardHelper(boardLabel);

  return <PresetSelectionBoard boardLabel={boardLabel} marketLabel={marketLabel} options={options} />;
}

function TwoDigitPanelBoard({ marketLabel, boardLabel }: { marketLabel: string; boardLabel: string }) {
  return <PresetSelectionBoard boardLabel={boardLabel} marketLabel={marketLabel} options={["12", "23", "34", "45", "56", "67", "78", "89", "90", "01"]} />;
}

function AdvancedPanaBoard({ marketLabel, boardLabel, marketPhase }: { marketLabel: string; boardLabel: string; marketPhase: MarketPhase }) {
  const { setDraftBid } = useAppState();
  const { sessionType, setSessionType, lockedSessionType } = useBoardSessionType(marketPhase);
  const [panaValue, setPanaValue] = useState("");
  const [points, setPoints] = useState("");
  const [entries, setEntries] = useState<Array<{ digit: string; points: number; gameType: string }>>([]);
  const [validationMessage, setValidationMessage] = useState("");
  const currentPoints = Number(points || 0);
  const canAdd = /^[0-9]{3}$/.test(panaValue.trim()) && isBidPointsValid(currentPoints) && !validationMessage;

  return (
    <View style={styles.page}>
      <BackHeader title={`${marketLabel.toUpperCase()} - ${boardLabel} Board`} />
      <AppScreen showPromo={false}>
        <BoardMetaFields allowedSessionType={lockedSessionType} sessionType={sessionType} setSessionType={setSessionType} />
        <View style={styles.formRowWrap}>
          <View style={styles.formRow}>
            <View style={styles.labeledFieldWrap}>
              <Text style={styles.fieldLabel}>Triple Pana</Text>
              <PannaAutocompleteField
                boardLabel={boardLabel}
                onChangeText={setPanaValue}
                onValidationChange={setValidationMessage}
                placeholder="Triple Pana"
                value={panaValue}
              />
            </View>
            <View style={styles.labeledFieldWrap}>
              <Text style={styles.fieldLabel}>Enter Points</Text>
              <TextInput
                keyboardType="numeric"
                onChangeText={setPoints}
                placeholder="Enter points"
                placeholderTextColor="#98a2b3"
                style={styles.field}
                value={points}
              />
            </View>
          </View>
        </View>
        <View style={styles.addBidWrap}>
          <Pressable
            disabled={!canAdd}
            onPress={() => {
              if (!canAdd) {
                return;
              }
              setEntries((current) => [...current, { digit: panaValue.trim(), points: currentPoints, gameType: boardLabel }]);
              setPanaValue("");
              setPoints("");
            }}
            style={[styles.addBidButton, !canAdd && styles.continueDisabled]}
          >
            <Text style={styles.addBidText}>ADD BID</Text>
          </Pressable>
        </View>
        {validationMessage ? <Text style={styles.validationError}>Enter valid Triple Pana only.</Text> : null}
        {!validationMessage ? <Text style={styles.helperText}>Triple Pana select hone ke baad points daalo aur `ADD BID` karo.</Text> : null}
        <SelectedBidList
          emptySubtitle="Triple Pana select karke points daalo, fir `ADD BID` se entry niche list me aayegi."
          emptyTitle="No triple pana entries yet"
          items={entries}
          onRemove={(index) => setEntries((current) => current.filter((_, currentIndex) => currentIndex !== index))}
        />
        <BottomContinue
          bidCount={entries.length}
          onContinue={() => continueToSlip(setDraftBid, marketLabel, boardLabel, sessionType, entries)}
          points={entries.reduce((sum, item) => sum + item.points, 0)}
        />
      </AppScreen>
    </View>
  );
}

function SangamBoard({ marketLabel, boardLabel, marketPhase }: { marketLabel: string; boardLabel: string; marketPhase: MarketPhase }) {
  const { setDraftBid } = useAppState();
  const { sessionType, setSessionType, lockedSessionType } = useBoardSessionType(marketPhase);
  const sessionlessSangam = boardLabel === "Half Sangam" || boardLabel === "Full Sangam";
  const [firstValue, setFirstValue] = useState("");
  const [secondValue, setSecondValue] = useState("");
  const [points, setPoints] = useState("");
  const [entries, setEntries] = useState<Array<{ digit: string; points: number; gameType: string }>>([]);
  const [hasActiveDropdown, setHasActiveDropdown] = useState(false);
  const sangamState = useBoardHelper(boardLabel, "", sessionType, firstValue, secondValue).sangam;
  const currentPoints = Number(points || 0);
  const canAdd = sangamState.valid && isBidPointsValid(currentPoints);

  return (
    <View style={styles.page}>
      <BackHeader title={`${marketLabel.toUpperCase()} - ${boardLabel} Board`} />
      <AppScreen
        footer={
          <BottomContinue
            bidCount={entries.length}
            onContinue={() => continueToSlip(setDraftBid, marketLabel, boardLabel, sessionlessSangam ? "NA" : sessionType, entries)}
            points={entries.reduce((sum, item) => sum + item.points, 0)}
          />
        }
        showPromo={false}
      >
        {sessionlessSangam ? (
          <BoardDateOnly />
        ) : (
          <BoardMetaFields allowedSessionType={lockedSessionType} sessionType={sessionType} setSessionType={setSessionType} />
        )}
        <View style={[styles.formRowWrap, hasActiveDropdown && styles.formRowWrapFocused]}>
          <DualFieldLabels
            left="Open Pana"
            right={boardLabel === "Half Sangam" ? "Close Ank" : "Close Pana"}
          />
          <View style={[styles.formRow, hasActiveDropdown && styles.formRowFocused]}>
            <View style={styles.labeledFieldWrap}>
              <PannaAutocompleteField
                boardLabel="Choice Pana"
                onChangeText={setFirstValue}
                onDropdownVisibilityChange={setHasActiveDropdown}
                placeholder="Open Pana"
                value={firstValue}
              />
            </View>
            <View style={styles.labeledFieldWrap}>
              {boardLabel === "Half Sangam" ? (
                <TextInput
                  keyboardType="numeric"
                  maxLength={1}
                  onChangeText={setSecondValue}
                  placeholder="Close Ank"
                  placeholderTextColor="#98a2b3"
                  style={styles.field}
                  value={secondValue}
                />
              ) : (
                <PannaAutocompleteField
                  boardLabel="Choice Pana"
                  onChangeText={setSecondValue}
                  onDropdownVisibilityChange={setHasActiveDropdown}
                  placeholder="Close Pana"
                  value={secondValue}
                />
              )}
            </View>
          </View>
          <View style={styles.sangamPointsWrap}>
            <Text style={styles.fieldLabel}>Enter Points</Text>
            <TextInput
              keyboardType="numeric"
              onChangeText={setPoints}
              placeholder="Enter points"
              placeholderTextColor="#98a2b3"
              style={styles.fullField}
              value={points}
            />
          </View>
          {sangamState.message ? <Text style={styles.validationError}>{sangamState.message}</Text> : null}
        </View>
        <View style={styles.addBidWrap}>
          <Pressable
            disabled={!canAdd}
            onPress={() => {
              if (!canAdd) {
                return;
              }
              setEntries((current) => [...current, { digit: sangamState.value, points: currentPoints, gameType: boardLabel }]);
              setFirstValue("");
              setSecondValue("");
              setPoints("");
            }}
            style={[styles.addBidButton, !canAdd && styles.continueDisabled]}
          >
            <Text style={styles.addBidText}>ADD BID</Text>
          </Pressable>
        </View>
        {!sangamState.message ? (
          <Text style={styles.helperText}>
            {boardLabel === "Half Sangam"
              ? "Open Pana aur Close Ank enter karke `ADD BID` karo."
              : "Open Pana aur Close Pana select karke `ADD BID` karo."}
          </Text>
        ) : null}
        <SelectedBidList
          emptySubtitle={
            boardLabel === "Half Sangam"
              ? "Example: 457-1 aur points add karke entry niche list me aayegi."
              : "Open Pana aur Close Pana select karke entry niche list me aayegi."
          }
          emptyTitle={boardLabel === "Half Sangam" ? "No half sangam entries yet" : "No full sangam entries yet"}
          items={entries}
          onRemove={(index) => setEntries((current) => current.filter((_, currentIndex) => currentIndex !== index))}
        />
      </AppScreen>
    </View>
  );
}

function PresetSelectionBoard({
  marketLabel,
  boardLabel,
  options,
  marketPhase = "open-running"
}: {
  marketLabel: string;
  boardLabel: string;
  options: string[];
  marketPhase?: MarketPhase;
  }) {
  const { setDraftBid } = useAppState();
  const sessionless = isSessionlessBoard(boardLabel);
  const { sessionType, setSessionType, lockedSessionType } = useBoardSessionType(marketPhase);
  const [entries, setEntries] = useState<Array<{ digit: string; points: number; gameType: string }>>([]);
  const [points, setPoints] = useState("");
  const currentPoints = Number(points || 0);
  const items = entries;

  return (
    <View style={styles.page}>
      <BackHeader title={`${marketLabel.toUpperCase()} - ${boardLabel} Board`} />
        <AppScreen
          footer={
            <BottomContinue
              bidCount={items.length}
              onContinue={() => continueToSlip(setDraftBid, marketLabel, boardLabel, sessionless ? "NA" : sessionType, items)}
              points={items.reduce((sum, item) => sum + item.points, 0)}
            />
          }
          showPromo={false}
        >
          {sessionless ? <BoardDateOnly /> : <BoardMetaFields allowedSessionType={lockedSessionType} sessionType={sessionType} setSessionType={setSessionType} />}
        <Text style={styles.fieldLabel}>Enter Points</Text>
        <TextInput keyboardType="numeric" onChangeText={setPoints} placeholder="Enter points" placeholderTextColor="#98a2b3" style={styles.fullField} value={points} />
        <View style={styles.presetGrid}>
          {options.map((option) => {
            const existingEntry = items.find((item) => item.digit === option);
            const active = Boolean(existingEntry);
            return (
              <Pressable
                key={option}
                onPress={() => {
                  if (active) {
                    setEntries((current) => current.filter((item) => item.digit !== option));
                    return;
                  }
                  if (!isBidPointsValid(currentPoints)) {
                    return;
                  }
                  setEntries((current) => [...current, { digit: option, points: currentPoints, gameType: boardLabel }]);
                }}
                style={[styles.presetTile, active && styles.bulkTileActive]}
              >
                {active && existingEntry ? (
                  <View style={[styles.bulkAmountBadge, active && styles.bulkAmountBadgeActive]}>
                    <Text style={[styles.bulkAmountText, active && styles.bulkAmountTextActive]}>{`Rs ${existingEntry.points}`}</Text>
                  </View>
                ) : null}
                <Text style={[styles.presetText, active && styles.bulkTextActive]}>{option}</Text>
              </Pressable>
            );
          })}
        </View>
        <SelectedBidList
          emptySubtitle="Points dalo aur options select karo. Selected entries niche list me dikhengi."
          emptyTitle="No preset entries yet"
          items={items}
          onRemove={(index) => setEntries((current) => current.filter((_, currentIndex) => currentIndex !== index))}
        />
      </AppScreen>
    </View>
  );
}

function DigitBoard({ marketLabel, boardLabel, marketPhase }: { marketLabel: string; boardLabel: string; marketPhase: MarketPhase }) {
  const { setDraftBid } = useAppState();
  const { sessionType, setSessionType, lockedSessionType } = useBoardSessionType(marketPhase);
  const [points, setPoints] = useState<Record<string, string>>({});
  const hasInvalidEnteredPoints = useMemo(
    () =>
      Object.values(points).some((value) => {
        if (!value.trim()) {
          return false;
        }
        return !isBidPointsValid(Number(value));
      }),
    [points]
  );

  const items = useMemo(
    () =>
      Object.entries(points)
        .filter(([, value]) => value.trim() && isBidPointsValid(Number(value)))
        .map(([digit, value]) => ({ digit, points: Number(value), gameType: boardLabel })),
    [points, boardLabel]
  );

  return (
    <View style={styles.page}>
      <BackHeader title={`${marketLabel.toUpperCase()} - ${boardLabel} Board`} />
      <AppScreen
        footer={
          <BottomContinue
            bidCount={items.length}
            disabled={hasInvalidEnteredPoints}
            onContinue={() => {
              setDraftBid({ market: marketLabel, boardLabel, sessionType, items });
              router.push({
                pathname: "/place-bid/[market]/slip",
                params: { market: slugify(marketLabel) }
              });
            }}
            points={items.reduce((sum, item) => sum + item.points, 0)}
          />
        }
        showPromo={false}
      >
        <BoardMetaFields allowedSessionType={lockedSessionType} sessionType={sessionType} setSessionType={setSessionType} />
        <Text style={styles.fieldLabel}>Enter Points</Text>
        <View style={styles.gridFields}>
          {["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"].map((digit) => (
            <View key={digit} style={styles.pointFieldWrap}>
              <Text style={styles.fieldPrefix}>{digit}</Text>
              <TextInput
                keyboardType="numeric"
                onChangeText={(value) => setPoints((current) => ({ ...current, [digit]: value }))}
                placeholder="Enter points"
                placeholderTextColor="#98a2b3"
                style={styles.pointField}
                value={points[digit] ?? ""}
              />
            </View>
          ))}
        </View>
        {hasInvalidEnteredPoints ? <Text style={styles.helperWarning}>{`Har bid amount ${MIN_BID_POINTS} se ${MAX_BID_POINTS} ke beech hona chahiye.`}</Text> : null}
      </AppScreen>
    </View>
  );
}

function BulkBoard({ marketLabel, boardLabel, marketPhase }: { marketLabel: string; boardLabel: string; marketPhase: MarketPhase }) {
  const { setDraftBid } = useAppState();
  const { sessionType, setSessionType, lockedSessionType } = useBoardSessionType(marketPhase);
  const [entries, setEntries] = useState<Array<{ digit: string; points: number; gameType: string }>>([]);
  const [points, setPoints] = useState("");
  const currentPoints = Number(points || 0);
  const items = entries;

  return (
    <View style={styles.page}>
      <BackHeader title={`${marketLabel.toUpperCase()} - ${boardLabel} Board`} />
      <AppScreen
        footer={
          <BottomContinue
            bidCount={items.length}
            onContinue={() => {
              setDraftBid({ market: marketLabel, boardLabel, sessionType, items });
              router.push({ pathname: "/place-bid/[market]/slip", params: { market: slugify(marketLabel) } });
            }}
            points={items.reduce((sum, item) => sum + item.points, 0)}
          />
        }
        showPromo={false}
      >
        <BoardMetaFields allowedSessionType={lockedSessionType} sessionType={sessionType} setSessionType={setSessionType} />
        <Text style={styles.fieldLabel}>Enter Points</Text>
        <TextInput
          keyboardType="numeric"
          onChangeText={setPoints}
          placeholder="Enter points"
          placeholderTextColor="#98a2b3"
          style={styles.fullField}
          value={points}
        />
        <View style={styles.bulkGrid}>
          {["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"].map((digit) => {
            const existingEntry = items.find((item) => item.digit === digit);
            const active = Boolean(existingEntry);
            return (
              <Pressable
                key={digit}
                onPress={() => {
                  if (active) {
                    setEntries((current) => current.filter((item) => item.digit !== digit));
                    return;
                  }
                  if (!isBidPointsValid(currentPoints)) {
                    return;
                  }
                  setEntries((current) => [...current, { digit, points: currentPoints, gameType: boardLabel }]);
                }}
                style={[styles.bulkTile, active && styles.bulkTileActive]}
              >
                {active && existingEntry ? (
                  <View style={[styles.bulkAmountBadge, active && styles.bulkAmountBadgeActive]}>
                    <Text style={[styles.bulkAmountText, active && styles.bulkAmountTextActive]}>{`Rs ${existingEntry.points}`}</Text>
                  </View>
                ) : null}
                <Text style={[styles.bulkText, active && styles.bulkTextActive]}>{digit}</Text>
              </Pressable>
            );
          })}
        </View>
        {items.length ? (
          <View style={styles.bulkSelectionList}>
            {items.map((item) => (
              <View key={item.digit} style={styles.bulkSelectionRow}>
                <View style={styles.bulkSelectionDigitBadge}>
                  <Text style={styles.bulkSelectionDigitText}>{item.digit}</Text>
                </View>
                <Text style={styles.bulkSelectionPointsText}>{`Rs ${item.points}`}</Text>
                <Pressable
                  onPress={() => setEntries((current) => current.filter((entry) => entry.digit !== item.digit))}
                  style={styles.bulkSelectionRemoveButton}
                >
                  <Text style={styles.bulkSelectionRemoveText}>x</Text>
                </Pressable>
              </View>
            ))}
          </View>
        ) : (
          <EmptyBidState
            subtitle="Points dalo, phir digits select karo. Har selected digit us waqt ke points ke saath niche add hogi."
            title="No bulk digit entries yet"
          />
        )}
      </AppScreen>
    </View>
  );
}

function PanaBoard({ marketLabel, boardLabel, marketPhase }: { marketLabel: string; boardLabel: string; marketPhase: MarketPhase }) {
  const { setDraftBid } = useAppState();
  const { sessionType, setSessionType, lockedSessionType } = useBoardSessionType(marketPhase);
  const [panaValue, setPanaValue] = useState("");
  const [points, setPoints] = useState("");
  const [entries, setEntries] = useState<Array<{ digit: string; points: number; gameType: string }>>([]);
  const [validationMessage, setValidationMessage] = useState("");
  const currentPoints = Number(points || 0);
  const canAdd = /^[0-9]{3}$/.test(panaValue.trim()) && isBidPointsValid(currentPoints) && !validationMessage;

  return (
    <View style={styles.page}>
      <BackHeader title={`${marketLabel.toUpperCase()} - ${boardLabel} Board`} />
      <AppScreen
        footer={
          <BottomContinue
            bidCount={entries.length}
            onContinue={() => {
              setDraftBid({ market: marketLabel, boardLabel, sessionType, items: entries });
              router.push({ pathname: "/place-bid/[market]/slip", params: { market: slugify(marketLabel) } });
            }}
            points={entries.reduce((sum, item) => sum + item.points, 0)}
          />
        }
        showPromo={false}
      >
        <BoardMetaFields allowedSessionType={lockedSessionType} sessionType={sessionType} setSessionType={setSessionType} />
        <View style={styles.formRowWrap}>
          <View style={styles.formRow}>
          <View style={styles.labeledFieldWrap}>
            <Text style={styles.fieldLabel}>{boardLabel}</Text>
            <PannaAutocompleteField boardLabel={boardLabel} onChangeText={setPanaValue} onValidationChange={setValidationMessage} value={panaValue} />
          </View>
          <View style={styles.labeledFieldWrap}>
            <Text style={styles.fieldLabel}>Enter Points</Text>
            <TextInput
              keyboardType="numeric"
              onChangeText={setPoints}
              placeholder="Enter points"
              placeholderTextColor="#98a2b3"
              style={styles.field}
              value={points}
            />
          </View>
          </View>
        </View>
        {validationMessage ? <Text style={styles.validationError}>{validationMessage}</Text> : null}
        {!validationMessage ? <Text style={styles.helperText}>Panna select hone ke baad points daalo aur `ADD BID` karo.</Text> : null}
        <View style={styles.addBidWrap}>
          <Pressable
            disabled={!canAdd}
            onPress={() => {
              if (!canAdd) {
                return;
              }
              setEntries((current) => [...current, { digit: panaValue.trim(), points: currentPoints, gameType: boardLabel }]);
              setPanaValue("");
              setPoints("");
            }}
            style={[styles.addBidButton, !canAdd && styles.continueDisabled]}
          >
            <Text style={styles.addBidText}>ADD BID</Text>
          </Pressable>
        </View>
        <SelectedBidList
          emptySubtitle="Pana select karke points dalo aur ADD BID karo. Added entries yahan dikhenge."
          emptyTitle="No bids added yet"
          items={entries}
          onRemove={(index) => setEntries((current) => current.filter((_, currentIndex) => currentIndex !== index))}
        />
      </AppScreen>
    </View>
  );
}

function BottomContinue({
  bidCount,
  points,
  onContinue,
  disabled: disabledProp = false
}: {
  bidCount: number;
  points: number;
  onContinue: () => void;
  disabled?: boolean;
}) {
  const disabled = disabledProp || bidCount === 0 || points === 0;

  return (
    <View style={styles.bottomBar}>
      <View style={styles.bottomStat}>
        <Text style={styles.bottomValue}>{bidCount}</Text>
        <Text style={styles.bottomLabel}>Bids</Text>
      </View>
      <View style={styles.bottomStat}>
        <Text style={styles.bottomValue}>{points}</Text>
        <Text style={styles.bottomLabel}>Points</Text>
      </View>
      <Pressable disabled={disabled} onPress={onContinue} style={[styles.continueButton, disabled && styles.continueDisabled]}>
        <Text style={styles.continueText}>Place Bet</Text>
      </Pressable>
    </View>
  );
}

function continueToSlip(
  setDraftBid: (draft: { market: string; boardLabel: string; sessionType: "Open" | "Close" | "NA"; items: Array<{ digit: string; points: number; gameType: string }> } | null) => void,
  marketLabel: string,
  boardLabel: string,
  sessionType: "Open" | "Close" | "NA",
  items: Array<{ digit: string; points: number; gameType: string }>
) {
  setDraftBid({ market: marketLabel, boardLabel, sessionType, items });
  router.push({ pathname: "/place-bid/[market]/slip", params: { market: slugify(marketLabel) } });
}

function SelectedBidList({
  items,
  emptyTitle,
  emptySubtitle,
  onRemove
}: {
  items: Array<{ digit: string; points: number; gameType: string }>;
  emptyTitle: string;
  emptySubtitle: string;
  onRemove: (index: number) => void;
}) {
  if (!items.length) {
    return <EmptyBidState subtitle={emptySubtitle} title={emptyTitle} />;
  }

  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  return (
    <View style={styles.bulkSelectionList}>
      {items.map((item, index) => (
        <View key={`${item.digit}-${item.points}-${item.gameType}-${index}`} style={styles.bulkSelectionRow}>
          <View style={styles.bulkSelectionDigitBadge}>
            <Text style={styles.bulkSelectionDigitText}>{item.digit}</Text>
          </View>
          <Text style={styles.bulkSelectionPointsText}>{`Rs ${item.points}`}</Text>
          <Pressable
            onPress={() => onRemove(index)}
            onHoverIn={() => setHoveredIndex(index)}
            onHoverOut={() => setHoveredIndex((current) => (current === index ? null : current))}
            style={({ pressed }) => [
              styles.bulkSelectionRemoveButton,
              (hoveredIndex === index || pressed) && styles.bulkSelectionRemoveButtonActive
            ]}
          >
            <Text style={styles.bulkSelectionRemoveText}>x</Text>
          </Pressable>
        </View>
      ))}
    </View>
  );
}

function DualFieldLabels({ left, right }: { left: string; right: string }) {
  return (
    <View style={styles.formRow}>
      <View style={styles.labeledFieldWrap}>
        <Text style={styles.fieldLabel}>{left}</Text>
      </View>
      <View style={styles.labeledFieldWrap}>
        <Text style={styles.fieldLabel}>{right}</Text>
      </View>
    </View>
  );
}

function BoardMetaFields({
  allowedSessionType,
  sessionType,
  setSessionType
}: {
  allowedSessionType?: "Open" | "Close" | null;
  sessionType: "Open" | "Close";
  setSessionType: Dispatch<SetStateAction<"Open" | "Close">>;
}) {
  const today = new Date().toLocaleDateString("en-GB");

  return (
    <View style={styles.formRow}>
      <View style={styles.metaFieldWrap}>
        <Text style={styles.fieldLabel}>Date</Text>
        <TextInput editable={false} style={[styles.field, styles.readOnlyField]} value={today} />
      </View>
      <View style={styles.metaFieldWrap}>
        <Text style={styles.fieldLabel}>Session</Text>
        <View style={styles.sessionSelector}>
          {(["Open", "Close"] as const).map((item) => (
            <Pressable
              key={item}
              onPress={() => {
                if (allowedSessionType && allowedSessionType !== item) {
                  return;
                }
                setSessionType(item);
              }}
              style={[
                styles.sessionChip,
                sessionType === item && styles.sessionChipActive,
                allowedSessionType && allowedSessionType !== item && styles.sessionChipDisabled
              ]}
            >
              <Text
                style={[
                  styles.sessionChipText,
                  sessionType === item && styles.sessionChipTextActive,
                  allowedSessionType && allowedSessionType !== item && styles.sessionChipTextDisabled
                ]}
              >
                {item}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
    </View>
  );
}

function EmptyBidState({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <View style={styles.emptyStateCard}>
      <View style={styles.emptyStateIconWrap}>
        <Text style={styles.emptyStateIcon}>+</Text>
      </View>
      <View style={styles.emptyStateTextWrap}>
        <Text style={styles.emptyStateTitle}>{title}</Text>
        <Text style={styles.emptyStateSubtitle}>{subtitle}</Text>
      </View>
    </View>
  );
}

function BoardDateOnly() {
  const today = new Date().toLocaleDateString("en-GB");

  return (
    <View style={styles.formRow}>
      <TextInput editable={false} style={[styles.fullField, styles.readOnlyField]} value={today} />
    </View>
  );
}

function updateRow<T extends Record<string, string>>(
  setter: Dispatch<SetStateAction<T[]>>,
  rows: T[],
  index: number,
  key: keyof T,
  value: string
) {
  const next = [...rows];
  next[index] = { ...next[index], [key]: value };
  setter(next);
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function buildSinglePanaMotorEntries(rawDigits: string) {
  const normalizedDigits = Array.from(new Set(rawDigits.replace(/[^0-9]/g, "").split("")));

  if (normalizedDigits.length < 4) {
    return { pannas: [] as string[], error: "SP Motor me minimum 4 alag digit chahiye." };
  }

  const pannas = new Set<string>();

  for (let first = 0; first < normalizedDigits.length - 2; first += 1) {
    for (let second = first + 1; second < normalizedDigits.length - 1; second += 1) {
      for (let third = second + 1; third < normalizedDigits.length; third += 1) {
        const combo = [normalizedDigits[first], normalizedDigits[second], normalizedDigits[third]];
        const sorted = [...combo].sort((left, right) => {
          if (left === "0" && right !== "0") {
            return 1;
          }
          if (right === "0" && left !== "0") {
            return -1;
          }
          return Number(left) - Number(right);
        });
        const panna = sorted.join("");

        if (allSinglePanaOptionSet.has(panna)) {
          pannas.add(panna);
        }
      }
    }
  }

  const result = Array.from(pannas);
  if (!result.length) {
    return { pannas: [] as string[], error: "In digits se valid Single Pana nahi bana." };
  }

  return { pannas: result, error: "" };
}

function buildDoublePanaMotorEntries(rawDigits: string) {
  const normalizedDigits = Array.from(new Set(rawDigits.replace(/[^0-9]/g, "").split("")));

  if (normalizedDigits.length < 4) {
    return { pannas: [] as string[], error: "DP Motor me minimum 4 alag digit chahiye." };
  }

  const allowedDigits = new Set(normalizedDigits);
  const pannas = allDoublePanaOptions.filter((panna) => panna.split("").every((digit) => allowedDigits.has(digit)));
  const uniquePannas = Array.from(new Set(pannas)).filter((panna) => allDoublePanaOptionSet.has(panna));

  if (!uniquePannas.length) {
    return { pannas: [] as string[], error: "In digits se valid Double Pana nahi bana." };
  }

  return { pannas: uniquePannas, error: "" };
}

function RedBracketAutocompleteField({
  value,
  onChangeText
}: {
  value: string;
  onChangeText: (value: string) => void;
}) {
  const [isFocused, setIsFocused] = useState(false);
  const normalized = value.trim();
  const suggestions = (normalized ? redBracketOptions.filter((item) => item.startsWith(normalized)) : redBracketOptions).slice(0, 20);
  const showDropdown = isFocused && suggestions.length > 0;

  return (
    <View style={[styles.autoFieldWrap, isFocused && styles.autoFieldWrapFocused]}>
      <TextInput
        blurOnSubmit={false}
        keyboardType="numeric"
        maxLength={2}
        onBlur={() => setTimeout(() => setIsFocused(false), 120)}
        onChangeText={(next) => onChangeText(next.replace(/[^0-9]/g, ""))}
        onFocus={() => setIsFocused(true)}
        placeholder="Enter red bracket"
        placeholderTextColor="#98a2b3"
        style={styles.field}
        value={value}
      />
      {showDropdown ? (
        <View style={styles.dropdown}>
          <ScrollView keyboardShouldPersistTaps="handled" nestedScrollEnabled style={styles.dropdownScroll}>
            {suggestions.map((item) => (
              <Pressable
                key={item}
                onPress={() => {
                  onChangeText(item);
                  setIsFocused(false);
                }}
                style={styles.dropdownItem}
              >
                <Text style={styles.dropdownText}>{item}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

function PannaAutocompleteField({
  value,
  onChangeText,
  boardLabel,
  placeholder,
  onValidationChange,
  onDropdownVisibilityChange
}: {
  value: string;
  onChangeText: (value: string) => void;
  boardLabel: string;
  placeholder?: string;
  onValidationChange?: (message: string) => void;
  onDropdownVisibilityChange?: (visible: boolean) => void;
}) {
  const [isFocused, setIsFocused] = useState(false);
  const { suggestions, validationMessage } = useBoardHelper(boardLabel, value);
  const normalizedSuggestions = useMemo(
    () => suggestions.filter((item) => item !== value.trim()),
    [suggestions, value]
  );
  const showDropdown = isFocused && normalizedSuggestions.length > 0;

  useEffect(() => {
    onValidationChange?.(validationMessage);
  }, [onValidationChange, validationMessage]);

  useEffect(() => {
    onDropdownVisibilityChange?.(showDropdown);
  }, [onDropdownVisibilityChange, showDropdown]);

  return (
    <View style={[styles.autoFieldWrap, showDropdown && styles.autoFieldWrapFocused]}>
      <TextInput
        autoCapitalize="none"
        blurOnSubmit={false}
        onBlur={() => setTimeout(() => setIsFocused(false), 120)}
        keyboardType="numeric"
        maxLength={3}
        onFocus={() => setIsFocused(true)}
        onChangeText={onChangeText}
        placeholder={placeholder ?? "Enter Pana"}
        placeholderTextColor="#98a2b3"
        style={styles.field}
        value={value}
      />
      {showDropdown ? (
        <View style={styles.dropdown}>
          <ScrollView keyboardShouldPersistTaps="handled" nestedScrollEnabled style={styles.dropdownScroll}>
            {normalizedSuggestions.map((item) => (
              <Pressable
                key={item}
                onPress={() => {
                  onChangeText(item);
                  setIsFocused(false);
                }}
                style={styles.dropdownItem}
              >
                <Text style={styles.dropdownText}>{item}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: colors.background
  },
  formRow: {
    flexDirection: "row",
    gap: 10,
    alignItems: "stretch",
    position: "relative",
    zIndex: 1
  },
  formRowFocused: {
    zIndex: 80
  },
  labeledFieldWrap: {
    flex: 1,
    minWidth: 0,
    gap: 6,
    justifyContent: "flex-start",
    position: "relative",
    zIndex: 1
  },
  metaFieldWrap: {
    flex: 1,
    minWidth: 0,
    gap: 6
  },
  redBracketFieldWrap: {
    zIndex: 5
  },
  formRowWrap: {
    position: "relative",
    zIndex: 2
  },
  formRowWrapFocused: {
    zIndex: 60
  },
  fieldLabel: {
    color: colors.textPrimary,
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 16,
    marginBottom: 0,
    paddingHorizontal: 4
  },
  field: {
    flexGrow: 0,
    flexShrink: 1,
    width: "100%",
    alignSelf: "stretch",
    minHeight: 46,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    paddingHorizontal: 12
  },
  disabledField: {
    backgroundColor: "#f5f5f5",
    opacity: 0.7
  },
  fieldSubtext: {
    color: "#667085",
    fontSize: 11,
    marginTop: 6,
    letterSpacing: 1.2,
    paddingHorizontal: 4
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 12
  },
  checkboxWrap: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#d0d5dd",
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center"
  },
  checkboxWrapActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary
  },
  checkboxTick: {
    color: "transparent",
    fontWeight: "800"
  },
  checkboxTickActive: {
    color: colors.surface
  },
  selectField: {
    justifyContent: "center"
  },
  selectFieldDisabled: {
    opacity: 0.7
  },
  selectFieldText: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: "600"
  },
  selectFieldPlaceholder: {
    color: "#98a2b3",
    fontWeight: "500"
  },
  typeSelectionRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 12
  },
  typeChip: {
    flex: 1,
    minHeight: 44,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center"
  },
  typeChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary
  },
  typeChipText: {
    color: colors.textPrimary,
    fontWeight: "700"
  },
  typeChipTextActive: {
    color: colors.surface
  },
  readOnlyField: {
    color: "#344054"
  },
  autoFieldWrap: {
    flex: 1,
    minWidth: 0,
    width: "100%",
    zIndex: 3,
    position: "relative"
  },
  autoFieldWrapFocused: {
    zIndex: 70
  },
  sangamPointsWrap: {
    gap: 6,
    marginTop: 10,
    position: "relative",
    zIndex: 0
  },
  fullField: {
    minHeight: 46,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    paddingHorizontal: 12
  },
  validationError: {
    color: "#d92d20",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 8
  },
  helperText: {
    color: "#667085",
    fontSize: 12,
    marginTop: 8
  },
  helperWarning: {
    color: colors.danger,
    fontSize: 12,
    fontWeight: "700",
    marginTop: 8
  },
  fieldHintText: {
    color: "#667085",
    fontSize: 12,
    marginBottom: 8
  },
  dropdown: {
    position: "absolute",
    top: 50,
    left: 0,
    right: 0,
    borderRadius: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: "#d0d5dd",
    maxHeight: 180,
    overflow: "hidden",
    shadowColor: "#101828",
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
    zIndex: 50
  },
  dropdownScroll: {
    maxHeight: 180
  },
  dropdownItem: {
    minHeight: 40,
    justifyContent: "center",
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f2f4f7"
  },
  dropdownText: {
    color: "#101828",
    fontSize: 14,
    fontWeight: "600"
  },
  sessionSelector: {
    width: "100%",
    minHeight: 46,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    padding: 4,
    flexDirection: "row",
    gap: 4,
    alignItems: "stretch"
  },
  sessionChip: {
    flex: 1,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center"
  },
  sessionChipActive: {
    backgroundColor: colors.primary
  },
  sessionChipDisabled: {
    backgroundColor: colors.surfaceMuted,
    opacity: 0.55
  },
  sessionChipText: {
    color: "#475467",
    fontWeight: "700"
  },
  sessionChipTextActive: {
    color: colors.surface
  },
  sessionChipTextDisabled: {
    color: colors.textMuted
  },
  sessionHelperText: {
    marginTop: 6,
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: "600"
  },
  gridFields: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10
  },
  pointFieldWrap: {
    width: "47%",
    minHeight: 46,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    flexDirection: "row",
    alignItems: "center",
    overflow: "hidden"
  },
  fieldPrefix: {
    width: 32,
    textAlign: "center",
    color: "#6b7280",
    fontWeight: "700"
  },
  pointField: {
    flex: 1,
    minHeight: 46,
    paddingHorizontal: 6
  },
  bulkGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 24
  },
  pairGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10
  },
  bulkTile: {
    width: "31%",
    minHeight: 54,
    borderRadius: 10,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#0f172a",
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
    position: "relative"
  },
  bulkTileActive: {
    backgroundColor: colors.primary
  },
  bulkAmountBadge: {
    position: "absolute",
    top: 6,
    right: 6,
    minWidth: 30,
    height: 18,
    paddingHorizontal: 6,
    borderRadius: 4,
    backgroundColor: "#fff7ed",
    borderWidth: 1,
    borderColor: "#fdba74",
    alignItems: "center",
    justifyContent: "center"
  },
  bulkAmountBadgeActive: {
    backgroundColor: "rgba(255,255,255,0.18)",
    borderColor: "rgba(255,255,255,0.4)"
  },
  bulkAmountText: {
    color: "#9a3412",
    fontSize: 10,
    fontWeight: "800"
  },
  bulkAmountTextActive: {
    color: colors.surface
  },
  bulkText: {
    color: "#374151",
    fontSize: 18,
    fontWeight: "700"
  },
  bulkTextActive: {
    color: colors.surface
  },
  bulkSelectionList: {
    gap: 10,
    marginTop: 16
  },
  bulkSelectionRow: {
    minHeight: 54,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: "#eaecf0",
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12
  },
  bulkSelectionDigitBadge: {
    minWidth: 26,
    height: 26,
    paddingHorizontal: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center"
  },
  bulkSelectionDigitText: {
    color: colors.surface,
    fontSize: 13,
    fontWeight: "800"
  },
  bulkSelectionPointsText: {
    flex: 1,
    color: "#111827",
    fontSize: 14,
    fontWeight: "700"
  },
  bulkSelectionRemoveButton: {
    width: 28,
    height: 28,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center"
  },
  bulkSelectionRemoveButtonActive: {
    backgroundColor: "#fee4e2"
  },
  bulkSelectionRemoveText: {
    color: "#d92d20",
    fontSize: 22,
    lineHeight: 22
  },
  pairTile: {
    width: "30%",
    minHeight: 46,
    borderRadius: 10,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#e5e7eb"
  },
  presetGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10
  },
  presetTile: {
    width: "47%",
    minHeight: 52,
    borderRadius: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8
  },
  presetText: {
    color: "#374151",
    fontSize: 15,
    fontWeight: "700",
    textAlign: "center"
  },
  addBidWrap: {
    alignItems: "flex-end"
  },
  addBidButton: {
    minWidth: 118,
    minHeight: 42,
    borderRadius: 999,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16
  },
  addBidText: {
    color: colors.surface,
    fontWeight: "700"
  },
  tableHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 8,
    marginTop: 8
  },
  tableHeadText: {
    width: "31%",
    color: "#111827",
    fontWeight: "700"
  },
  tableRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 8,
    paddingVertical: 10
  },
  bidList: {
    gap: 12,
    marginTop: 8
  },
  bidCard: {
    minHeight: 54,
    borderRadius: 12,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    shadowColor: "#101828",
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3
  },
  tableCell: {
    flex: 1,
    color: "#374151",
    fontWeight: "600"
  },
  removeBidButton: {
    width: 32,
    height: 32,
    borderRadius: 999,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center"
  },
  removeBidText: {
    color: colors.surface,
    fontSize: 16,
    fontWeight: "800"
  },
  emptyStateCard: {
    marginTop: "auto",
    minHeight: 84,
    borderRadius: 18,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 14
  },
  emptyStateIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center"
  },
  emptyStateIcon: {
    color: colors.primary,
    fontSize: 22,
    fontWeight: "800",
    lineHeight: 24
  },
  emptyStateTextWrap: {
    flex: 1,
    gap: 2
  },
  emptyStateTitle: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: "800"
  },
  emptyStateSubtitle: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 18
  },
  motorList: {
    gap: 10
  },
  motorItem: {
    minHeight: 46,
    borderRadius: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    alignItems: "center",
    justifyContent: "center"
  },
  motorText: {
    color: "#374151",
    fontSize: 16,
    fontWeight: "700"
  },
  bottomBar: {
    marginTop: "auto",
    flexDirection: "row",
    alignItems: "center",
    gap: 18,
    paddingTop: 14,
    paddingBottom: 22,
    paddingHorizontal: 14,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: 24,
    shadowColor: colors.shadow,
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3
  },
  bottomStat: {
    alignItems: "center",
    minWidth: 54
  },
  bottomValue: {
    color: colors.primary,
    fontSize: 20,
    fontWeight: "800"
  },
  bottomLabel: {
    color: colors.textMuted,
    fontWeight: "600"
  },
  continueButton: {
    marginLeft: "auto",
    minWidth: 148,
    minHeight: 50,
    borderRadius: 999,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 22,
    shadowColor: colors.primaryDark,
    shadowOpacity: 0.22,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4
  },
  continueDisabled: {
    opacity: 0.45
  },
  continueText: {
    color: colors.surface,
    fontSize: 15,
    fontWeight: "800"
  }
});
