import {
  addWalletEntry,
  clearWalletEntriesForUser,
  completeWalletRequest,
  deleteUserAccount,
  findUserById,
  findUserByPhone,
  getBankAccountsForUser,
  getBidsForUser,
  getUserAdminSummaries,
  getUserBalance,
  getWalletAdminRequestItems,
  getWalletEntriesForUser,
  listAllBids,
  listBidsPage,
  rejectWalletRequest,
  resolveWalletApprovalRequest,
  updateUserAccountStatus,
  updateUserApprovalStatus,
  updateWalletEntryAdmin
} from "../stores/admin-store.mjs";
function roundAmount(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

async function sendWalletActionNotification(entry, action, settlementEntry = null) {
  const userId = String(entry?.userId ?? settlementEntry?.userId ?? "").trim();
  if (!userId) {
    return;
  }

  const type = String(entry?.type ?? settlementEntry?.type ?? "").toUpperCase();
  if (type === "DEPOSIT" || type === "WITHDRAW") {
    return;
  }
}

function buildUserLedgerSummary(walletEntries, bids, walletBalance) {
  const totals = {
    deposits: 0,
    withdraws: 0,
    bidPlaced: 0,
    bidWins: 0,
    adminCredits: 0,
    adminDebits: 0,
    signupBonus: 0,
    firstDepositBonus: 0,
    referralIncome: 0
  };

  for (const entry of walletEntries) {
    const amount = Number(entry.amount || 0);
    const type = String(entry.type || "").toUpperCase();
    if (type === "DEPOSIT" && entry.status === "SUCCESS") totals.deposits += amount;
    if (type === "WITHDRAW" && entry.status === "SUCCESS") totals.withdraws += amount;
    if (type === "BID_PLACED" && entry.status === "SUCCESS") totals.bidPlaced += amount;
    if (type === "BID_WIN" && entry.status === "SUCCESS") totals.bidWins += amount;
    if (type === "ADMIN_CREDIT" && entry.status === "SUCCESS") totals.adminCredits += amount;
    if (type === "ADMIN_DEBIT" && entry.status === "SUCCESS") totals.adminDebits += amount;
    if (type === "SIGNUP_BONUS" && entry.status === "SUCCESS") totals.signupBonus += amount;
    if (type === "FIRST_DEPOSIT_BONUS" && entry.status === "SUCCESS") totals.firstDepositBonus += amount;
    if (type === "REFERRAL_COMMISSION" && entry.status === "SUCCESS") totals.referralIncome += amount;
  }

  return {
    walletBalance: roundAmount(walletBalance),
    deposits: roundAmount(totals.deposits),
    withdraws: roundAmount(totals.withdraws),
    bidPlaced: roundAmount(totals.bidPlaced),
    bidWins: roundAmount(totals.bidWins),
    adminCredits: roundAmount(totals.adminCredits),
    adminDebits: roundAmount(totals.adminDebits),
    signupBonus: roundAmount(totals.signupBonus),
    firstDepositBonus: roundAmount(totals.firstDepositBonus),
    referralIncome: roundAmount(totals.referralIncome),
    totalBids: bids.length,
    wonBids: bids.filter((bid) => bid.status === "Won").length,
    lostBids: bids.filter((bid) => bid.status === "Lost").length,
    pendingBids: bids.filter((bid) => bid.status === "Pending").length
  };
}

export async function listAdminUsers() {
  const usersList = await getUserAdminSummaries();
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  return usersList.map((user) => ({
    ...user,
    activityState: user.lastActivity && new Date(user.lastActivity).getTime() >= sevenDaysAgo ? "Active" : "Inactive"
  }));
}

export async function getAdminUserDetail(userId) {
  const user = await findUserById(userId);
  if (!user) {
    return null;
  }

  const [walletEntries, bids, bankAccounts, walletBalance] = await Promise.all([
    getWalletEntriesForUser(userId, 1000),
    getBidsForUser(userId, 1000),
    getBankAccountsForUser(userId),
    getUserBalance(userId)
  ]);

  return {
    user: {
      id: user.id,
      name: user.name,
      phone: user.phone,
      role: user.role,
      referralCode: user.referralCode,
      joinedAt: user.joinedAt,
      approvalStatus: user.approvalStatus,
      approvedAt: user.approvedAt,
      rejectedAt: user.rejectedAt,
      blockedAt: user.blockedAt,
      deactivatedAt: user.deactivatedAt,
      statusNote: user.statusNote,
      signupBonusGranted: user.signupBonusGranted,
      firstDepositBonusGranted: user.firstDepositBonusGranted,
      walletBalance,
      referredByUserId: user.referredByUserId
    },
    summary: buildUserLedgerSummary(walletEntries, bids, walletBalance),
    bids,
    walletEntries,
    bankAccounts
  };
}

export async function updateAdminUserApproval(userId, action) {
  const nextStatus = action === "approve" ? "Approved" : action === "reject" ? "Rejected" : null;
  if (!nextStatus) {
    return { ok: false, status: 400, error: "userId and valid action are required" };
  }

  const updatedUser = await updateUserApprovalStatus(userId, nextStatus);
  if (!updatedUser) {
    return { ok: false, status: 404, error: "User not found" };
  }

  return { ok: true, user: updatedUser, nextStatus };
}

export async function listWalletRequests(history) {
  return getWalletAdminRequestItems({ history });
}

export async function processWalletRequestAction({ requestId, action, note, referenceId, proofUrl }) {
  if (!requestId || !["approve", "reject", "complete", "annotate"].includes(action)) {
    return { ok: false, status: 400, error: "requestId and valid action are required" };
  }

  try {
    if (action === "complete" || action === "annotate") {
      const baseUpdated =
        action === "complete"
          ? await completeWalletRequest(requestId)
          : await updateWalletEntryAdmin(requestId, { note, referenceId, proofUrl });
      const updated = baseUpdated ? await updateWalletEntryAdmin(baseUpdated.id, { note, referenceId, proofUrl }) : null;
      if (!updated) {
        return { ok: false, status: 404, error: "Wallet request not found" };
      }
      return {
        ok: true,
        request: updated,
        settlementEntry: null,
        auditAction: action === "complete" ? "WALLET_REQUEST_COMPLETED" : "WALLET_REQUEST_ANNOTATED",
        auditDetails: {
          type: updated.type,
          amount: updated.amount,
          status: updated.status,
          referenceId: updated.referenceId || null,
          proofUrl: updated.proofUrl || null,
          note: updated.note || null
        }
      };
    }

    if (action === "reject") {
      const baseRejected = await rejectWalletRequest(requestId);
      const updated = baseRejected ? await updateWalletEntryAdmin(baseRejected.id, { note, referenceId, proofUrl }) : null;
      if (!updated) {
        return { ok: false, status: 404, error: "Wallet request not found" };
      }
      await sendWalletActionNotification(updated, "reject");
      return {
        ok: true,
        request: updated,
        settlementEntry: null,
        auditAction: "WALLET_REQUEST_REJECTED",
        auditDetails: {
          type: updated.type,
          amount: updated.amount,
          status: updated.status,
          referenceId: updated.referenceId || null,
          proofUrl: updated.proofUrl || null,
          note: updated.note || null
        }
      };
    }

    const resolved = await resolveWalletApprovalRequest(requestId, action);
    if (!resolved?.request) {
      return { ok: false, status: 404, error: "Wallet request not found" };
    }
    const patchedRequest = await updateWalletEntryAdmin(resolved.request.id, { note, referenceId, proofUrl });
    await sendWalletActionNotification(patchedRequest || resolved.request, action, resolved.settlementEntry);
    return {
      ok: true,
      request: patchedRequest || resolved.request,
      settlementEntry: resolved.settlementEntry,
      auditAction: action === "approve" ? "WALLET_REQUEST_APPROVED" : "WALLET_REQUEST_REJECTED",
      auditDetails: {
        type: resolved.request.type,
        amount: resolved.request.amount,
        settlementEntryId: resolved.settlementEntry?.id ?? null,
        referenceId: referenceId || null,
        proofUrl: proofUrl || null,
        note: note || null
      }
    };
  } catch (error) {
    return { ok: false, status: 400, error: error instanceof Error ? error.message : "Unable to process wallet request" };
  }
}

export async function updateAdminUserStatus(userId, action, note) {
  return updateUserAccountStatus(userId, action, note);
}

export async function deleteAdminUserAccount(userId) {
  return deleteUserAccount(userId);
}

export async function createWalletAdjustment({ userId, mode, amount, note = "" }) {
  const user = await findUserById(userId);
  if (!user) {
    return { ok: false, status: 404, error: "User not found" };
  }

  const beforeBalance = await getUserBalance(userId);
  if (mode === "debit" && amount > beforeBalance) {
    return { ok: false, status: 400, error: "Insufficient user balance for debit" };
  }

  const entryType = mode === "debit" ? "ADMIN_DEBIT" : mode === "referral" ? "REFERRAL_COMMISSION" : "ADMIN_CREDIT";
  const isDebit = mode === "debit";
  const entry = await addWalletEntry({
    userId,
    type: entryType,
    status: "SUCCESS",
    amount,
    beforeBalance,
    afterBalance: isDebit ? beforeBalance - amount : beforeBalance + amount,
    note: String(note || "").trim() || null
  });

  return { ok: true, entry };
}

export async function cleanupWalletData({ userId, phone, types }) {
  const targetUser = userId ? await findUserById(userId) : phone ? await findUserByPhone(phone) : null;
  if (!targetUser) {
    return { ok: false, status: 404, error: "Target user not found" };
  }

  const result = await clearWalletEntriesForUser(targetUser.id, types);
  return { ok: true, targetUser, result };
}

export async function listAdminBids() {
  const bids = await listAllBids();
  return Promise.all(
    bids.map(async (bid) => {
      const user = await findUserById(bid.userId);
      return {
        ...bid,
        user: user ? { id: user.id, name: user.name, phone: user.phone } : null
      };
    })
  );
}

function doesAdminBidMatchFilter(bid, search, status) {
  const normalizedSearch = String(search || "").trim().toLowerCase();
  const normalizedStatus = String(status || "all").trim();
  const matchesStatus = normalizedStatus === "all" || bid.status === normalizedStatus;
  if (!matchesStatus) {
    return false;
  }
  if (!normalizedSearch) {
    return true;
  }

  return [
    bid.user?.name,
    bid.user?.phone,
    bid.market,
    bid.boardLabel,
    bid.gameType,
    bid.sessionType,
    bid.digit,
    bid.id,
    bid.settledResult
  ]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(normalizedSearch));
}

function getAdminBusinessDateKey(value) {
  const date = new Date(value || "");
  if (Number.isNaN(date.getTime())) return "";
  return new Date(date.getTime() + 5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function matchesAdminBidDateRange(bid, from, to) {
  if (!from && !to) return true;
  const dateKey = getAdminBusinessDateKey(bid?.createdAt || "");
  if (!dateKey) return false;
  if (from && dateKey < from) return false;
  if (to && dateKey > to) return false;
  return true;
}

export async function listAdminBidsPage({ limit = 50, offset = 0, search = "", status = "all", from = "", to = "" } = {}) {
  const normalizedLimit = Math.max(1, Math.min(200, Number(limit) || 50));
  const normalizedOffset = Math.max(0, Number(offset) || 0);
  const normalizedSearch = String(search || "").trim();
  const normalizedStatus = String(status || "all").trim();
  const normalizedFrom = String(from || "").trim();
  const normalizedTo = String(to || "").trim();
  const users = await getUserAdminSummaries();
  const usersById = new Map(users.map((user) => [user.id, user]));

  const mapBidWithUser = (bid) => {
    const user = usersById.get(bid.userId) ?? null;
    return {
      ...bid,
      user: user ? { id: user.id, name: user.name, phone: user.phone } : null
    };
  };

  const batchSize = 500;
  let sourceOffset = 0;
  let matchedCount = 0;
  const matchedItems = [];
  let hasMore = true;

  while (hasMore) {
    const page = await listBidsPage({ limit: batchSize, offset: sourceOffset });
    const mappedItems = page.items.map(mapBidWithUser);

    for (const bid of mappedItems) {
      if (!matchesAdminBidDateRange(bid, normalizedFrom, normalizedTo)) {
        continue;
      }
      if (!doesAdminBidMatchFilter(bid, normalizedSearch, normalizedStatus)) {
        continue;
      }
      if (matchedCount >= normalizedOffset && matchedItems.length < normalizedLimit) {
        matchedItems.push(bid);
      }
      matchedCount += 1;
    }

    hasMore = Boolean(page.pagination?.hasMore);
    sourceOffset += page.items.length;
    if (!hasMore || (matchedItems.length >= normalizedLimit && matchedCount >= normalizedOffset + normalizedLimit)) {
      break;
    }
  }

  return {
    items: matchedItems,
    pagination: {
      limit: normalizedLimit,
      offset: normalizedOffset,
      total: matchedCount,
      hasMore: normalizedOffset + matchedItems.length < matchedCount
    }
  };
}
