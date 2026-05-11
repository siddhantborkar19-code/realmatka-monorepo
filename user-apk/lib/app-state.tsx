import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AppState, AppStateStatus, Platform } from "react-native";
import { ApiError, api, setAuthFailureListener, type BankAccount, type BidEntry, type GoogleAuthResponse, type OtpRequestResponse, type SessionUser, type WalletEntry } from "@/lib/api";
import { readStoredMpinConfigured, writeStoredMpinValue, writeStoredMpinConfigured } from "@/lib/security-storage";
import {
  getCachedBidHistory,
  getCachedWalletHistory,
  hydrateCachedBidHistory,
  hydrateCachedWalletHistory,
  setCachedBidHistory,
  setCachedWalletHistory
} from "@/lib/content-cache";
import {
  clearStoredSessionSnapshot,
  clearStoredSessionToken,
  readStoredSessionSnapshot,
  readStoredSessionToken,
  writeStoredSessionSnapshot,
  writeStoredSessionToken
} from "@/lib/session-storage";

type DraftBid = {
  market: string;
  boardLabel: string;
  sessionType: "Open" | "Close" | "NA";
  items: Array<{ digit: string; points: number; gameType: string }>;
};

type AppStateValue = {
  currentUser: SessionUser | null;
  loading: boolean;
  isAuthenticated: boolean;
  sessionToken: string;
  walletBalance: number;
  walletEntries: WalletEntry[];
  bids: BidEntry[];
  bankAccounts: BankAccount[];
  draftBid: DraftBid | null;
  login: (phone: string, password: string) => Promise<void>;
  googleLogin: (accessToken: string) => Promise<GoogleAuthResponse>;
  googleRegister: (payload: {
    registrationToken: string;
    firstName: string;
    lastName: string;
    phone: string;
    password: string;
    confirmPassword: string;
    referenceCode?: string;
  }) => Promise<void>;
  otpLogin: (phone: string, otp: string, accessToken?: string) => Promise<void>;
  register: (firstName: string, lastName: string, phone: string, otp: string, password: string, confirmPassword: string, referenceCode?: string, accessToken?: string) => Promise<void>;
  logout: () => Promise<void>;
  reloadSessionData: (options?: { force?: boolean }) => Promise<void>;
  loadWalletHistory: (options?: { force?: boolean }) => Promise<void>;
  loadBidHistory: (options?: { force?: boolean }) => Promise<void>;
  loadBankAccounts: (options?: { force?: boolean }) => Promise<void>;
  updatePassword: (currentPassword: string, password: string, confirmPassword: string) => Promise<void>;
  updateMpin: (pin: string, confirmPin: string) => Promise<void>;
  verifyMpin: (pin: string) => Promise<void>;
  addBankAccount: (accountNumber: string, holderName: string, ifsc: string) => Promise<void>;
  requestWithdrawOtp: (amount: number) => Promise<OtpRequestResponse>;
  confirmWithdraw: (amount: number, otp: string, accessToken?: string) => Promise<void>;
  setDraftBid: (draft: DraftBid | null) => void;
  submitDraftBid: () => Promise<void>;
};

const AppStateContext = createContext<AppStateValue | null>(null);
const SESSION_REFRESH_STALE_MS = 60_000;
const COLLECTION_REFRESH_STALE_MS = 120_000;
const LIVE_WALLET_SYNC_INTERVAL_MS = 60_000;

function ensureMessage(value: unknown, fallback: string) {
  return value instanceof Error ? value.message : fallback;
}

function createBidRequestId() {
  return `bidreq_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function mergeUser(baseUser: SessionUser | null, nextUser: SessionUser | null, walletBalance: number) {
  if (!nextUser) {
    return null;
  }

  return {
    ...baseUser,
    ...nextUser,
    walletBalance
  };
}

function isAuthFailure(error: unknown) {
  if (error instanceof ApiError) {
    return error.isAuthError;
  }

  return String(ensureMessage(error, "")).toLowerCase().includes("unauthorized");
}

function getResolvedWalletBalance(user: Pick<SessionUser, "walletBalance"> | null | undefined) {
  return typeof user?.walletBalance === "number" ? user.walletBalance : 0;
}

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [sessionToken, setSessionToken] = useState("");
  const [currentUser, setCurrentUser] = useState<SessionUser | null>(null);
  const [walletBalance, setWalletBalance] = useState(0);
  const [walletEntries, setWalletEntries] = useState<WalletEntry[]>([]);
  const [bids, setBids] = useState<BidEntry[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [draftBid, setDraftBid] = useState<DraftBid | null>(null);
  const activeSessionTokenRef = useRef("");
  const lastSessionReloadAtRef = useRef(0);
  const lastWalletReloadAtRef = useRef(0);
  const lastBidReloadAtRef = useRef(0);
  const lastBankReloadAtRef = useRef(0);
  const sessionReloadPromiseRef = useRef<Promise<void> | null>(null);
  const walletReloadPromiseRef = useRef<Promise<void> | null>(null);
  const bidReloadPromiseRef = useRef<Promise<void> | null>(null);
  const bankReloadPromiseRef = useRef<Promise<void> | null>(null);

  const applySessionUser = useCallback((token: string, user: SessionUser | null) => {
    const resolvedBalance = getResolvedWalletBalance(user);
    activeSessionTokenRef.current = token;
    setSessionToken(token);
    setCurrentUser(user ? { ...user, walletBalance: resolvedBalance } : null);
    setWalletBalance(resolvedBalance);
    lastSessionReloadAtRef.current = Date.now();
  }, []);

  const persistSessionSnapshot = useCallback(async (user: SessionUser, balance: number) => {
    await writeStoredSessionSnapshot({
      user: {
        id: user.id,
        phone: user.phone,
        email: user.email,
        name: user.name,
        role: user.role,
        hasMpin: Boolean(user.hasMpin),
        referralCode: user.referralCode,
        joinedAt: user.joinedAt,
        walletBalance: balance
      },
      savedAt: new Date().toISOString()
    });
  }, []);

  const clearSession = useCallback(async () => {
    activeSessionTokenRef.current = "";
    setSessionToken("");
    setCurrentUser(null);
    setWalletBalance(0);
    setWalletEntries([]);
    setBids([]);
    setBankAccounts([]);
    setDraftBid(null);
    lastSessionReloadAtRef.current = 0;
    lastWalletReloadAtRef.current = 0;
    lastBidReloadAtRef.current = 0;
    lastBankReloadAtRef.current = 0;
    sessionReloadPromiseRef.current = null;
    walletReloadPromiseRef.current = null;
    bidReloadPromiseRef.current = null;
    bankReloadPromiseRef.current = null;
    await clearStoredSessionToken();
    await clearStoredSessionSnapshot();
  }, []);

  const hydrateSession = useCallback(async (token: string) => {
    try {
      const me = await api.me(token);
      const mpinConfigured = await readStoredMpinConfigured(me.id);
      const resolvedBalance = typeof me.walletBalance === "number" ? me.walletBalance : 0;
      const mergedUser = {
        ...me,
        hasMpin: Boolean(me.hasMpin || mpinConfigured),
        walletBalance: resolvedBalance
      };

      applySessionUser(token, mergedUser);
      await persistSessionSnapshot(mergedUser, resolvedBalance);
      return;
    } catch (error) {
      if (isAuthFailure(error)) {
        throw error;
      }

      const snapshot = await readStoredSessionSnapshot();
      if (!snapshot?.user?.id) {
        throw error;
      }

      applySessionUser(token, snapshot.user);
      lastSessionReloadAtRef.current = 0;
    }
  }, [applySessionUser, persistSessionSnapshot]);

  useEffect(() => {
    let active = true;

    void (async () => {
      try {
        const [storedToken, snapshot] = await Promise.all([readStoredSessionToken(), readStoredSessionSnapshot()]);
        if (!active) {
          return;
        }

        if (!storedToken) {
          setLoading(false);
          return;
        }

        if (snapshot?.user?.id) {
          applySessionUser(storedToken, snapshot.user);
          setLoading(false);
          void hydrateSession(storedToken).catch(async (error) => {
            if (active && isAuthFailure(error)) {
              await clearSession();
            }
          });
          return;
        }

        await hydrateSession(storedToken);
      } catch (error) {
        if (active && isAuthFailure(error)) {
          await clearSession();
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [applySessionUser, clearSession, hydrateSession]);

  useEffect(() => {
    let active = true;

    if (!sessionToken) {
      return () => {
        active = false;
      };
    }

    const cachedWallet = getCachedWalletHistory(sessionToken, 30 * 60_000);
    if (cachedWallet?.length) {
      setWalletEntries(cachedWallet);
    }

    const cachedBids = getCachedBidHistory(sessionToken, 30 * 60_000);
    if (cachedBids?.length) {
      setBids(cachedBids);
    }

    void (async () => {
      const [walletHistory, bidHistory] = await Promise.all([
        hydrateCachedWalletHistory(sessionToken),
        hydrateCachedBidHistory(sessionToken)
      ]);

      if (!active) {
        return;
      }

      if (walletHistory?.length) {
        setWalletEntries(walletHistory);
      }

      if (bidHistory?.length) {
        setBids(bidHistory);
      }
    })();

    return () => {
      active = false;
    };
  }, [sessionToken]);

  useEffect(() => {
    let clearing = false;

    setAuthFailureListener((failedToken) => {
      if (clearing) {
        return;
      }

      if (!failedToken || activeSessionTokenRef.current !== failedToken) {
        return;
      }

      clearing = true;
      void clearSession().finally(() => {
        clearing = false;
      });
    });

    return () => {
      setAuthFailureListener(null);
    };
  }, [clearSession]);

  const login = useCallback(async (phone: string, password: string) => {
    const response = await api.login(phone, password);
    await writeStoredSessionToken(response.token);
    applySessionUser(response.token, response.user);
    await persistSessionSnapshot(response.user, getResolvedWalletBalance(response.user));
    void hydrateSession(response.token).catch(async (error) => {
      if (isAuthFailure(error)) {
        await clearSession();
      }
    });
  }, [applySessionUser, clearSession, hydrateSession, persistSessionSnapshot]);

  const googleLogin = useCallback(async (accessToken: string) => {
    const response = await api.googleLogin({ accessToken });
    if (!response.needsRegistration && response.token && response.user) {
      await writeStoredSessionToken(response.token);
      applySessionUser(response.token, response.user);
      await persistSessionSnapshot(response.user, getResolvedWalletBalance(response.user));
      void hydrateSession(response.token).catch(async (error) => {
        if (isAuthFailure(error)) {
          await clearSession();
        }
      });
    }
    return response;
  }, [applySessionUser, clearSession, hydrateSession, persistSessionSnapshot]);

  const googleRegister = useCallback(async (payload: {
    registrationToken: string;
    firstName: string;
    lastName: string;
    phone: string;
    password: string;
    confirmPassword: string;
    referenceCode?: string;
  }) => {
    const response = await api.googleRegister(payload);
    await writeStoredSessionToken(response.token);
    applySessionUser(response.token, response.user);
    await persistSessionSnapshot(response.user, getResolvedWalletBalance(response.user));
    void hydrateSession(response.token).catch(async (error) => {
      if (isAuthFailure(error)) {
        await clearSession();
      }
    });
  }, [applySessionUser, clearSession, hydrateSession, persistSessionSnapshot]);

  const otpLogin = useCallback(async (phone: string, otp: string, accessToken = "") => {
    const response = await api.otpLogin(phone, otp, accessToken);
    await writeStoredSessionToken(response.token);
    applySessionUser(response.token, response.user);
    await persistSessionSnapshot(response.user, getResolvedWalletBalance(response.user));
    void hydrateSession(response.token).catch(async (error) => {
      if (isAuthFailure(error)) {
        await clearSession();
      }
    });
  }, [applySessionUser, clearSession, hydrateSession, persistSessionSnapshot]);

  const register = useCallback(async (firstName: string, lastName: string, phone: string, otp: string, password: string, confirmPassword: string, referenceCode = "", accessToken = "") => {
    await api.register(firstName, lastName, phone, otp, password, confirmPassword, referenceCode, accessToken);
  }, []);

  const logout = useCallback(async () => {
    try {
      if (sessionToken) {
        await api.logout(sessionToken);
      }
    } catch {
      // Ignore logout network failure and clear local session anyway.
    } finally {
      await clearSession();
    }
  }, [clearSession, sessionToken]);

  const reloadSessionData = useCallback(async (options?: { force?: boolean }) => {
    if (!sessionToken) {
      return;
    }

    const force = Boolean(options?.force);
    if (!force && Date.now() - lastSessionReloadAtRef.current < SESSION_REFRESH_STALE_MS) {
      return;
    }

    if (sessionReloadPromiseRef.current) {
      return sessionReloadPromiseRef.current;
    }

    sessionReloadPromiseRef.current = (async () => {
      try {
        const me = await api.me(sessionToken);
        const resolvedBalance = typeof me.walletBalance === "number" ? me.walletBalance : walletBalance;
        const nextUser = mergeUser(currentUser, me, resolvedBalance);
        setCurrentUser(nextUser);
        setWalletBalance(resolvedBalance);
        lastSessionReloadAtRef.current = Date.now();
        if (nextUser) {
          await persistSessionSnapshot(nextUser, resolvedBalance);
        }
      } catch (error) {
        if (isAuthFailure(error)) {
          await clearSession();
        }
        throw error;
      } finally {
        sessionReloadPromiseRef.current = null;
      }
    })();

    return sessionReloadPromiseRef.current;
  }, [clearSession, currentUser, persistSessionSnapshot, sessionToken, walletBalance]);

  const loadWalletHistory = useCallback(async (options?: { force?: boolean }) => {
    if (!sessionToken) {
      return;
    }

    const force = Boolean(options?.force);
    if (!force && Date.now() - lastWalletReloadAtRef.current < COLLECTION_REFRESH_STALE_MS) {
      return;
    }

    if (walletReloadPromiseRef.current) {
      return walletReloadPromiseRef.current;
    }

    walletReloadPromiseRef.current = (async () => {
      try {
        const walletHistory = await api.walletHistory(sessionToken);
        setWalletEntries(walletHistory);
        setCachedWalletHistory(sessionToken, walletHistory);
        lastWalletReloadAtRef.current = Date.now();
      } catch (error) {
        if (isAuthFailure(error)) {
          await clearSession();
        }
        throw error;
      } finally {
        walletReloadPromiseRef.current = null;
      }
    })();

    return walletReloadPromiseRef.current;
  }, [clearSession, sessionToken]);

  const loadBidHistory = useCallback(async (options?: { force?: boolean }) => {
    if (!sessionToken) {
      return;
    }

    const force = Boolean(options?.force);
    if (!force && Date.now() - lastBidReloadAtRef.current < COLLECTION_REFRESH_STALE_MS) {
      return;
    }

    if (bidReloadPromiseRef.current) {
      return bidReloadPromiseRef.current;
    }

    bidReloadPromiseRef.current = (async () => {
      try {
        const bidHistory = await api.bidHistory(sessionToken);
        setBids(bidHistory);
        setCachedBidHistory(sessionToken, bidHistory);
        lastBidReloadAtRef.current = Date.now();
      } catch (error) {
        if (isAuthFailure(error)) {
          await clearSession();
        }
        throw error;
      } finally {
        bidReloadPromiseRef.current = null;
      }
    })();

    return bidReloadPromiseRef.current;
  }, [clearSession, sessionToken]);

  const refreshLiveUserState = useCallback(async (options?: { force?: boolean; includeHistory?: boolean }) => {
    if (!sessionToken) {
      return;
    }

    await reloadSessionData({ force: options?.force });

    if (!options?.includeHistory) {
      return;
    }

    await Promise.allSettled([
      loadWalletHistory({ force: true }),
      loadBidHistory({ force: true })
    ]);
  }, [loadBidHistory, loadWalletHistory, reloadSessionData, sessionToken]);

  useEffect(() => {
    if (!sessionToken) {
      return;
    }

    let active = true;
    let appState = AppState.currentState;

    const triggerRefresh = (force = false) => {
      if (!active || appState !== "active") {
        return;
      }

      void refreshLiveUserState({ force, includeHistory: false });
    };

    const appStateSubscription = AppState.addEventListener("change", (nextState: AppStateStatus) => {
      const wasBackgrounded = appState !== "active" && nextState === "active";
      appState = nextState;
      if (wasBackgrounded) {
        triggerRefresh(true);
      }
    });

    let webFocusHandler: (() => void) | null = null;
    let webVisibilityHandler: (() => void) | null = null;

    if (Platform.OS === "web" && typeof window !== "undefined") {
      webFocusHandler = () => triggerRefresh(true);
      webVisibilityHandler = () => {
        if (document.visibilityState === "visible") {
          triggerRefresh(true);
        }
      };

      window.addEventListener("focus", webFocusHandler);
      document.addEventListener("visibilitychange", webVisibilityHandler);
    }

    const interval = setInterval(() => {
      if (Platform.OS === "web" && typeof document !== "undefined" && document.visibilityState !== "visible") {
        return;
      }
      triggerRefresh(true);
    }, LIVE_WALLET_SYNC_INTERVAL_MS);

    return () => {
      active = false;
      clearInterval(interval);
      appStateSubscription.remove();
      if (Platform.OS === "web" && typeof window !== "undefined") {
        if (webFocusHandler) {
          window.removeEventListener("focus", webFocusHandler);
        }
        if (webVisibilityHandler) {
          document.removeEventListener("visibilitychange", webVisibilityHandler);
        }
      }
    };
  }, [refreshLiveUserState, sessionToken]);

  const loadBankAccounts = useCallback(async (options?: { force?: boolean }) => {
    if (!sessionToken) {
      return;
    }

    const force = Boolean(options?.force);
    if (!force && Date.now() - lastBankReloadAtRef.current < COLLECTION_REFRESH_STALE_MS) {
      return;
    }

    if (bankReloadPromiseRef.current) {
      return bankReloadPromiseRef.current;
    }

    bankReloadPromiseRef.current = (async () => {
      try {
        const bankList = await api.listBankAccounts(sessionToken);
        setBankAccounts(bankList);
        lastBankReloadAtRef.current = Date.now();
      } catch (error) {
        if (isAuthFailure(error)) {
          await clearSession();
        }
        throw error;
      } finally {
        bankReloadPromiseRef.current = null;
      }
    })();

    return bankReloadPromiseRef.current;
  }, [clearSession, sessionToken]);

  const updatePassword = useCallback(async (currentPassword: string, password: string, confirmPassword: string) => {
    if (!sessionToken) {
      throw new Error("Login required");
    }
    try {
      await api.updatePassword(sessionToken, currentPassword, password, confirmPassword);
    } catch (error) {
      if (isAuthFailure(error)) {
        await clearSession();
      }
      throw error;
    }
  }, [clearSession, sessionToken]);

  const updateMpin = useCallback(async (pin: string, confirmPin: string) => {
    if (!sessionToken || !currentUser) {
      throw new Error("Login required");
    }

    try {
      await api.updateMpin(sessionToken, pin, confirmPin);
    } catch (error) {
      if (isAuthFailure(error)) {
        await clearSession();
      }
      throw error;
    }
    await writeStoredMpinConfigured(currentUser.id, true);
    await writeStoredMpinValue(currentUser.id, pin);
    setCurrentUser((existing) => (existing ? { ...existing, hasMpin: true } : existing));
  }, [clearSession, currentUser, sessionToken]);

  const verifyMpin = useCallback(async (pin: string) => {
    if (!sessionToken) {
      throw new Error("Login required");
    }

    try {
      await api.verifyMpin(sessionToken, pin);
    } catch (error) {
      if (isAuthFailure(error)) {
        await clearSession();
      }
      throw error;
    }
    if (currentUser?.id) {
      await writeStoredMpinValue(currentUser.id, pin);
    }
  }, [clearSession, currentUser?.id, sessionToken]);

  const addBankAccount = useCallback(async (accountNumber: string, holderName: string, ifsc: string) => {
    if (!sessionToken) {
      throw new Error("Login required");
    }

    let account: BankAccount;
    try {
      account = await api.addBankAccount(sessionToken, accountNumber, holderName, ifsc);
    } catch (error) {
      if (isAuthFailure(error)) {
        await clearSession();
      }
      throw error;
    }
    setBankAccounts((existing) => [account, ...existing.filter((item) => item.id !== account.id)]);
    lastBankReloadAtRef.current = Date.now();
  }, [clearSession, sessionToken]);

  const requestWithdrawOtp = useCallback(async (amount: number) => {
    if (!sessionToken) {
      throw new Error("Login required");
    }

    try {
      return await api.requestWithdrawOtp(sessionToken, amount);
    } catch (error) {
      if (isAuthFailure(error)) {
        await clearSession();
      }
      throw error;
    }
  }, [clearSession, sessionToken]);

  const confirmWithdraw = useCallback(async (amount: number, otp: string, accessToken = "") => {
    if (!sessionToken) {
      throw new Error("Login required");
    }

    let entry: WalletEntry;
    try {
      entry = await api.confirmWithdraw(sessionToken, amount, otp, "", "", "", accessToken);
    } catch (error) {
      if (isAuthFailure(error)) {
        await clearSession();
      }
      throw error;
    }
    setWalletEntries((existing) => [entry, ...existing]);
    setCachedWalletHistory(sessionToken, [entry, ...walletEntries]);
    lastWalletReloadAtRef.current = Date.now();
    await reloadSessionData({ force: true });
  }, [clearSession, reloadSessionData, sessionToken, walletEntries]);

  const submitDraftBid = useCallback(async () => {
    if (!sessionToken) {
      throw new Error("Login required");
    }
    if (!draftBid || !draftBid.items.length) {
      throw new Error("No bid selected");
    }

    const totalPoints = draftBid.items.reduce((sum, item) => sum + Number(item.points || 0), 0);
    const requestId = createBidRequestId();
    let createdBids: BidEntry[];
    try {
      createdBids = await api.placeBids(sessionToken, {
        ...draftBid,
        requestId
      });
    } catch (error) {
      if (isAuthFailure(error)) {
        await clearSession();
      }
      throw error;
    }

    const nextWalletBalance = Math.max(walletBalance - totalPoints, 0);
    setWalletBalance(nextWalletBalance);
    setCurrentUser((existing) => (existing ? { ...existing, walletBalance: nextWalletBalance } : existing));
    setBids((existing) => [...createdBids, ...existing]);
    setCachedBidHistory(sessionToken, [...createdBids, ...bids]);
    lastBidReloadAtRef.current = Date.now();

    setDraftBid(null);
    void reloadSessionData({ force: true });
    void loadBidHistory({ force: true });
  }, [bids, clearSession, draftBid, loadBidHistory, reloadSessionData, sessionToken, walletBalance]);

  const value = useMemo<AppStateValue>(() => ({
    currentUser,
    loading,
    isAuthenticated: Boolean(sessionToken && currentUser),
    sessionToken,
    walletBalance,
    walletEntries,
    bids,
    bankAccounts,
    draftBid,
    login,
    googleLogin,
    googleRegister,
    otpLogin,
    register,
    logout,
    reloadSessionData,
    loadWalletHistory,
    loadBidHistory,
    loadBankAccounts,
    updatePassword,
    updateMpin,
    verifyMpin,
    addBankAccount,
    requestWithdrawOtp,
    confirmWithdraw,
    setDraftBid,
    submitDraftBid
  }), [
    addBankAccount,
    bankAccounts,
    bids,
    confirmWithdraw,
    currentUser,
    draftBid,
    loadBankAccounts,
    loadBidHistory,
    loadWalletHistory,
    loading,
    login,
    googleLogin,
    googleRegister,
    logout,
    otpLogin,
    register,
    reloadSessionData,
    requestWithdrawOtp,
    sessionToken,
    submitDraftBid,
    updateMpin,
    updatePassword,
    verifyMpin,
    walletBalance,
    walletEntries
  ]);

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState() {
  const context = useContext(AppStateContext);
  if (!context) {
    throw new Error("useAppState must be used inside AppStateProvider");
  }
  return context;
}
