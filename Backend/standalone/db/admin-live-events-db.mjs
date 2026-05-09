import { __internalGetReadyPgPool, __internalGetSqlite, __internalToIso } from "../db.mjs";

function normalizeLimit(value) {
  const limit = Number(value || 30);
  if (!Number.isFinite(limit)) return 30;
  return Math.min(Math.max(Math.trunc(limit), 5), 80);
}

function summarizeText(value) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= 90) return text;
  return `${text.slice(0, 87)}...`;
}

function buildEvent(type, row) {
  const userName = row.user_name || row.name || "Unknown user";
  const userPhone = row.user_phone || row.phone || "";
  const createdAt = __internalToIso(row.created_at || row.joined_at);
  const amount = Number(row.amount ?? row.points ?? 0);

  if (type === "bid") {
    return {
      id: `bid:${row.id}`,
      type,
      title: "New bet placed",
      message: `${userName}${userPhone ? ` (${userPhone})` : ""} placed Rs ${amount} on ${row.market || "market"}.`,
      amount,
      createdAt,
      href: "#/bids",
      meta: {
        market: row.market || "",
        digit: row.digit || "",
        boardLabel: row.board_label || ""
      }
    };
  }

  if (type === "deposit") {
    return {
      id: `deposit:${row.id}`,
      type,
      title: row.status === "INITIATED" ? "New deposit request" : "Deposit updated",
      message: `${userName}${userPhone ? ` (${userPhone})` : ""} deposit Rs ${amount} ${String(row.status || "").toLowerCase()}.`,
      amount,
      createdAt,
      href: "#/deposits",
      meta: { status: row.status || "" }
    };
  }

  if (type === "withdraw") {
    return {
      id: `withdraw:${row.id}`,
      type,
      title: row.status === "INITIATED" ? "New withdraw request" : "Withdraw updated",
      message: `${userName}${userPhone ? ` (${userPhone})` : ""} withdraw Rs ${amount} ${String(row.status || "").toLowerCase()}.`,
      amount,
      createdAt,
      href: "#/requests",
      meta: { status: row.status || "" }
    };
  }

  if (type === "support") {
    return {
      id: `support:${row.id}`,
      type,
      title: "New support message",
      message: `${userName}${userPhone ? ` (${userPhone})` : ""}${row.text ? `: ${summarizeText(row.text)}` : " sent a message."}`,
      amount: 0,
      createdAt,
      href: "#/support",
      meta: { conversationId: row.conversation_id || "" }
    };
  }

  return {
    id: `user:${row.id}`,
    type: "user",
    title: "New user registered",
    message: `${userName}${userPhone ? ` (${userPhone})` : ""} joined the app.`,
    amount: 0,
    createdAt,
    href: "#/users",
    meta: { approvalStatus: row.approval_status || "" }
  };
}

function sortEvents(events, limit) {
  return events
    .filter((event) => event.createdAt)
    .sort((a, b) => {
      const dateDiff = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      if (dateDiff !== 0) return dateDiff;
      return String(b.id).localeCompare(String(a.id));
    })
    .slice(0, limit);
}

export async function getAdminLiveEvents({ limit } = {}) {
  const safeLimit = normalizeLimit(limit);
  try {
    const pool = await __internalGetReadyPgPool();
    const [bidsResult, walletResult, usersResult, supportResult] = await Promise.all([
      pool.query(
        `SELECT b.id, b.market, b.board_label, b.digit, b.points, b.created_at, u.name AS user_name, u.phone AS user_phone
         FROM bids b
         LEFT JOIN users u ON u.id = b.user_id
         ORDER BY b.created_at DESC, b.id DESC
         LIMIT $1`,
        [safeLimit]
      ),
      pool.query(
        `SELECT we.id, we.type, we.status, we.amount, we.created_at, u.name AS user_name, u.phone AS user_phone
         FROM wallet_entries we
         LEFT JOIN users u ON u.id = we.user_id
         WHERE we.type IN ('DEPOSIT', 'WITHDRAW')
         ORDER BY we.created_at DESC, we.id DESC
         LIMIT $1`,
        [safeLimit]
      ),
      pool.query(
        `SELECT id, name, phone, approval_status, joined_at
         FROM users
         WHERE role = 'user'
         ORDER BY joined_at DESC, id DESC
         LIMIT $1`,
        [safeLimit]
      ),
      pool.query(
        `SELECT cm.id, cm.conversation_id, cm.text, cm.created_at, u.name AS user_name, u.phone AS user_phone
         FROM chat_messages cm
         LEFT JOIN chat_conversations cc ON cc.id = cm.conversation_id
         LEFT JOIN users u ON u.id = cc.user_id
         WHERE cm.sender_role = 'user'
         ORDER BY cm.created_at DESC, cm.id DESC
         LIMIT $1`,
        [safeLimit]
      )
    ]);

    return sortEvents(
      [
        ...bidsResult.rows.map((row) => buildEvent("bid", row)),
        ...walletResult.rows.map((row) => buildEvent(row.type === "WITHDRAW" ? "withdraw" : "deposit", row)),
        ...usersResult.rows.map((row) => buildEvent("user", row)),
        ...supportResult.rows.map((row) => buildEvent("support", row))
      ],
      safeLimit
    );
  } catch {
    const sqlite = __internalGetSqlite();
    const bids = sqlite
      .prepare(
        `SELECT b.id, b.market, b.board_label, b.digit, b.points, b.created_at, u.name AS user_name, u.phone AS user_phone
         FROM bids b
         LEFT JOIN users u ON u.id = b.user_id
         ORDER BY b.created_at DESC, b.id DESC
         LIMIT ?`
      )
      .all(safeLimit);
    const wallet = sqlite
      .prepare(
        `SELECT we.id, we.type, we.status, we.amount, we.created_at, u.name AS user_name, u.phone AS user_phone
         FROM wallet_entries we
         LEFT JOIN users u ON u.id = we.user_id
         WHERE we.type IN ('DEPOSIT', 'WITHDRAW')
         ORDER BY we.created_at DESC, we.id DESC
         LIMIT ?`
      )
      .all(safeLimit);
    const users = sqlite
      .prepare(
        `SELECT id, name, phone, approval_status, joined_at
         FROM users
         WHERE role = 'user'
         ORDER BY joined_at DESC, id DESC
         LIMIT ?`
      )
      .all(safeLimit);
    const support = sqlite
      .prepare(
        `SELECT cm.id, cm.conversation_id, cm.text, cm.created_at, u.name AS user_name, u.phone AS user_phone
         FROM chat_messages cm
         LEFT JOIN chat_conversations cc ON cc.id = cm.conversation_id
         LEFT JOIN users u ON u.id = cc.user_id
         WHERE cm.sender_role = 'user'
         ORDER BY cm.created_at DESC, cm.id DESC
         LIMIT ?`
      )
      .all(safeLimit);

    return sortEvents(
      [
        ...bids.map((row) => buildEvent("bid", row)),
        ...wallet.map((row) => buildEvent(row.type === "WITHDRAW" ? "withdraw" : "deposit", row)),
        ...users.map((row) => buildEvent("user", row)),
        ...support.map((row) => buildEvent("support", row))
      ],
      safeLimit
    );
  }
}
