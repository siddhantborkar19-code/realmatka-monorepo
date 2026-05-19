import {
  __internalGetPgPool,
  __internalGetSqlite,
  __internalNowIso
} from "../db.mjs";

const CREDIT_WALLET_ENTRY_TYPES_SQL = "'DEPOSIT', 'REFERRAL_COMMISSION', 'BID_WIN', 'SIGNUP_BONUS', 'FIRST_DEPOSIT_BONUS', 'SPECIAL_DEPOSIT_BONUS', 'ADMIN_CREDIT'";
const DEBIT_WALLET_ENTRY_TYPES_SQL = "'WITHDRAW', 'BID_PLACED', 'BID_WIN_REVERSAL', 'ADMIN_DEBIT'";

function getWalletBalanceDeltaSql(columnPrefix = "") {
  return `CASE
    WHEN ${columnPrefix}status = 'SUCCESS' AND ${columnPrefix}type IN (${CREDIT_WALLET_ENTRY_TYPES_SQL}) THEN COALESCE(${columnPrefix}amount, 0)
    WHEN ((${columnPrefix}status = 'SUCCESS' AND ${columnPrefix}type IN (${DEBIT_WALLET_ENTRY_TYPES_SQL}))
       OR (${columnPrefix}status = 'BACKOFFICE' AND ${columnPrefix}type = 'WITHDRAW')) THEN -COALESCE(${columnPrefix}amount, 0)
    ELSE 0
  END`;
}

async function getAccurateUserBalanceFromPg(executor, userId) {
  const result = await executor.query(
    `SELECT COALESCE(SUM(${getWalletBalanceDeltaSql()}), 0) AS balance
     FROM wallet_entries
     WHERE user_id = $1`,
    [userId]
  );
  return Number(result.rows[0]?.balance ?? 0);
}

function getAccurateUserBalanceFromSqlite(db, userId) {
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(${getWalletBalanceDeltaSql()}), 0) AS balance
       FROM wallet_entries
       WHERE user_id = ?`
    )
    .get(userId);
  return Number(row?.balance ?? 0);
}

function mapPaymentOrderRow(row) {
  return row
    ? {
        id: row.id,
        userId: row.user_id,
        provider: row.provider,
        amount: Number(row.amount),
        status: row.status,
        reference: row.reference,
        checkoutToken: row.checkout_token ?? null,
        gatewayOrderId: row.gateway_order_id ?? null,
        gatewayPaymentId: row.gateway_payment_id ?? null,
        gatewaySignature: row.gateway_signature ?? null,
        verifiedAt: row.verified_at ? String(row.verified_at) : null,
        redirectUrl: row.redirect_url ?? null,
        createdAt: row.created_at ? String(row.created_at) : null,
        updatedAt: row.updated_at ? String(row.updated_at) : null
      }
    : null;
}

async function findPaymentOrderById(paymentOrderId) {
  const pool = __internalGetPgPool();
  if (pool) {
    const result = await pool.query(
      `SELECT id, user_id, provider, amount, status, reference, checkout_token, gateway_order_id, gateway_payment_id, gateway_signature, verified_at, redirect_url, created_at, updated_at
       FROM payment_orders
       WHERE id = $1
       LIMIT 1`,
      [paymentOrderId]
    );
    return mapPaymentOrderRow(result.rows[0]);
  }

  return mapPaymentOrderRow(
    __internalGetSqlite()
      .prepare(
        `SELECT id, user_id, provider, amount, status, reference, checkout_token, gateway_order_id, gateway_payment_id, gateway_signature, verified_at, redirect_url, created_at, updated_at
         FROM payment_orders
         WHERE id = ?
         LIMIT 1`
      )
      .get(paymentOrderId)
  );
}

async function findPaymentOrderByReference(reference) {
  if (!reference) {
    return null;
  }

  const pool = __internalGetPgPool();
  if (pool) {
    const result = await pool.query(
      `SELECT id, user_id, provider, amount, status, reference, checkout_token, gateway_order_id, gateway_payment_id, gateway_signature, verified_at, redirect_url, created_at, updated_at
       FROM payment_orders
       WHERE reference = $1
       LIMIT 1`,
      [reference]
    );
    return mapPaymentOrderRow(result.rows[0]);
  }

  return mapPaymentOrderRow(
    __internalGetSqlite()
      .prepare(
        `SELECT id, user_id, provider, amount, status, reference, checkout_token, gateway_order_id, gateway_payment_id, gateway_signature, verified_at, redirect_url, created_at, updated_at
         FROM payment_orders
         WHERE reference = ?
         LIMIT 1`
      )
      .get(reference)
  );
}

async function findPaymentOrderByGatewayOrderId(gatewayOrderId) {
  if (!gatewayOrderId) {
    return null;
  }

  const pool = __internalGetPgPool();
  if (pool) {
    const result = await pool.query(
      `SELECT id, user_id, provider, amount, status, reference, checkout_token, gateway_order_id, gateway_payment_id, gateway_signature, verified_at, redirect_url, created_at, updated_at
       FROM payment_orders
       WHERE gateway_order_id = $1
       LIMIT 1`,
      [gatewayOrderId]
    );
    return mapPaymentOrderRow(result.rows[0]);
  }

  return mapPaymentOrderRow(
    __internalGetSqlite()
      .prepare(
        `SELECT id, user_id, provider, amount, status, reference, checkout_token, gateway_order_id, gateway_payment_id, gateway_signature, verified_at, redirect_url, created_at, updated_at
         FROM payment_orders
         WHERE gateway_order_id = ?
         LIMIT 1`
      )
      .get(gatewayOrderId)
  );
}

export async function findPaymentOrderByReferenceForUser(userId, reference) {
  const order = await findPaymentOrderByReference(reference);
  if (!order || order.userId !== userId) {
    return null;
  }
  return order;
}

export async function findPendingPaymentOrdersForUser(userId, limit = 5) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 5, 20));
  const pool = __internalGetPgPool();
  if (pool) {
    const result = await pool.query(
      `SELECT id, user_id, provider, amount, status, reference, checkout_token, gateway_order_id, gateway_payment_id, gateway_signature, verified_at, redirect_url, created_at, updated_at
       FROM payment_orders
       WHERE user_id = $1 AND status = 'PENDING'
       ORDER BY created_at DESC, id DESC
       LIMIT $2`,
      [userId, safeLimit]
    );
    return result.rows.map(mapPaymentOrderRow).filter(Boolean);
  }

  return __internalGetSqlite()
    .prepare(
      `SELECT id, user_id, provider, amount, status, reference, checkout_token, gateway_order_id, gateway_payment_id, gateway_signature, verified_at, redirect_url, created_at, updated_at
       FROM payment_orders
       WHERE user_id = ? AND status = 'PENDING'
       ORDER BY created_at DESC, id DESC
       LIMIT ?`
    )
    .all(userId, safeLimit)
    .map(mapPaymentOrderRow)
    .filter(Boolean);
}

export async function findPaymentOrderForCheckout(paymentOrderId, checkoutToken) {
  const order = await findPaymentOrderById(paymentOrderId);
  if (!order || !checkoutToken || order.checkoutToken !== checkoutToken) {
    return null;
  }
  return order;
}

export async function createPaymentOrder({
  id = `payment_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
  userId,
  amount,
  provider = "manual",
  reference = `RM${Date.now()}`,
  checkoutToken = null,
  gatewayOrderId = null,
  redirectUrl = null
}) {
  const createdAt = __internalNowIso();
  const status = "PENDING";
  const pool = __internalGetPgPool();

  if (pool) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const currentBalance = await getAccurateUserBalanceFromPg(client, userId);
      await client.query(
        `INSERT INTO payment_orders (id, user_id, provider, amount, status, reference, checkout_token, gateway_order_id, redirect_url, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10)`,
        [id, userId, provider, amount, status, reference, checkoutToken, gatewayOrderId, redirectUrl, createdAt]
      );

      await client.query(
        `INSERT INTO wallet_entries (id, user_id, type, status, amount, before_balance, after_balance, reference_id, note, created_at)
         VALUES ($1, $2, 'DEPOSIT', 'INITIATED', $3, $4, $4, $5, $6, $7)`,
        [
          `wallet_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          userId,
          amount,
          currentBalance,
          reference,
          "Processor flow deposit request",
          createdAt
        ]
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } else {
    const db = __internalGetSqlite();
    db.exec("BEGIN");
    try {
      const currentBalance = getAccurateUserBalanceFromSqlite(db, userId);
      db.prepare(
        `INSERT INTO payment_orders (id, user_id, provider, amount, status, reference, checkout_token, gateway_order_id, redirect_url, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(id, userId, provider, amount, status, reference, checkoutToken, gatewayOrderId, redirectUrl, createdAt, createdAt);

      db.prepare(
        `INSERT INTO wallet_entries (id, user_id, type, status, amount, before_balance, after_balance, reference_id, note, created_at)
         VALUES (?, ?, 'DEPOSIT', 'INITIATED', ?, ?, ?, ?, ?, ?)`
      ).run(
        `wallet_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        userId,
        amount,
        currentBalance,
        currentBalance,
        reference,
        "Processor flow deposit request",
        createdAt
      );
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }

  return findPaymentOrderById(id);
}

export async function completePaymentOrder({ paymentOrderId, gatewayOrderId, gatewayPaymentId, gatewaySignature }) {
  const verifiedAt = __internalNowIso();
  let bonusPayload = null;
  const pool = __internalGetPgPool();

  if (pool) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const existingResult = await client.query(
        `SELECT id, user_id, provider, amount, status, reference, checkout_token, gateway_order_id, gateway_payment_id, gateway_signature, verified_at, redirect_url, created_at, updated_at
         FROM payment_orders
         WHERE id = $1
         FOR UPDATE`,
        [paymentOrderId]
      );
      const existing = existingResult.rows[0];
      if (!existing) {
        await client.query("ROLLBACK");
        return null;
      }
      if (existing.gateway_order_id && existing.gateway_order_id !== gatewayOrderId) {
        throw new Error("Gateway order mismatch");
      }
      if (existing.status !== "SUCCESS") {
        const currentBalance = await getAccurateUserBalanceFromPg(client, existing.user_id);
        const nextBalance = currentBalance + Number(existing.amount);
        await client.query(
          `UPDATE payment_orders
           SET status = 'SUCCESS',
               gateway_order_id = $2,
               gateway_payment_id = $3,
               gateway_signature = $4,
               verified_at = $5,
               updated_at = $5
           WHERE id = $1`,
          [paymentOrderId, gatewayOrderId, gatewayPaymentId, gatewaySignature, verifiedAt]
        );
        const initiatedResult = await client.query(
          `SELECT id
           FROM wallet_entries
           WHERE user_id = $1 AND type = 'DEPOSIT' AND status = 'INITIATED' AND reference_id = $2
           ORDER BY created_at DESC, id DESC
           LIMIT 1
           FOR UPDATE`,
          [existing.user_id, existing.reference]
        );
        const initiatedEntryId = initiatedResult.rows[0]?.id ? String(initiatedResult.rows[0].id) : "";
        if (initiatedEntryId) {
          await client.query(
            `UPDATE wallet_entries
             SET status = 'SUCCESS',
                 amount = $2,
                 before_balance = $3,
                 after_balance = $4,
                 reference_id = $5,
                 note = $6
             WHERE id = $1`,
            [initiatedEntryId, Number(existing.amount), currentBalance, nextBalance, gatewayPaymentId, `Razorpay payment ${gatewayPaymentId}`]
          );
        } else {
          await client.query(
            `INSERT INTO wallet_entries (id, user_id, type, status, amount, before_balance, after_balance, reference_id, note, created_at)
             VALUES ($1, $2, 'DEPOSIT', 'SUCCESS', $3, $4, $5, $6, $7, $8)`,
            [
              `wallet_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
              existing.user_id,
              Number(existing.amount),
              currentBalance,
              nextBalance,
              gatewayPaymentId,
              `Razorpay payment ${gatewayPaymentId}`,
              verifiedAt
            ]
          );
        }
        bonusPayload = {
          userId: existing.user_id,
          depositAmount: Number(existing.amount),
          depositEntryId: gatewayPaymentId
        };
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    if (bonusPayload) {
      const { applyFirstDepositBonusIfEligible, applyReferralDepositBonusIfEligible, applySpecialDepositBonusIfEligible } = await import("../db.mjs");
      await applyFirstDepositBonusIfEligible(bonusPayload);
      await applySpecialDepositBonusIfEligible(bonusPayload);
      await applyReferralDepositBonusIfEligible(bonusPayload);
    }

    return findPaymentOrderById(paymentOrderId);
  }

  const db = __internalGetSqlite();
  db.exec("BEGIN");
  try {
    const existing = db
      .prepare(
        `SELECT id, user_id, provider, amount, status, reference, checkout_token, gateway_order_id, gateway_payment_id, gateway_signature, verified_at, redirect_url, created_at, updated_at
         FROM payment_orders
         WHERE id = ?
         LIMIT 1`
      )
      .get(paymentOrderId);
    if (!existing) {
      db.exec("ROLLBACK");
      return null;
    }
    if (existing.gateway_order_id && existing.gateway_order_id !== gatewayOrderId) {
      throw new Error("Gateway order mismatch");
    }
    if (existing.status !== "SUCCESS") {
      const currentBalance = getAccurateUserBalanceFromSqlite(db, existing.user_id);
      const nextBalance = currentBalance + Number(existing.amount);
      db.prepare(
        `UPDATE payment_orders
         SET status = 'SUCCESS',
             gateway_order_id = ?,
             gateway_payment_id = ?,
             gateway_signature = ?,
             verified_at = ?,
             updated_at = ?
         WHERE id = ?`
      ).run(gatewayOrderId, gatewayPaymentId, gatewaySignature, verifiedAt, verifiedAt, paymentOrderId);
      const initiatedEntry = db
        .prepare(
          `SELECT id
           FROM wallet_entries
           WHERE user_id = ? AND type = 'DEPOSIT' AND status = 'INITIATED' AND reference_id = ?
           ORDER BY created_at DESC, id DESC
           LIMIT 1`
        )
        .get(existing.user_id, existing.reference);
      if (initiatedEntry?.id) {
        db.prepare(
          `UPDATE wallet_entries
           SET status = 'SUCCESS',
               amount = ?,
               before_balance = ?,
               after_balance = ?,
               reference_id = ?,
               note = ?
           WHERE id = ?`
        ).run(Number(existing.amount), currentBalance, nextBalance, gatewayPaymentId, `Razorpay payment ${gatewayPaymentId}`, initiatedEntry.id);
      } else {
        db.prepare(
          `INSERT INTO wallet_entries (id, user_id, type, status, amount, before_balance, after_balance, reference_id, note, created_at)
           VALUES (?, ?, 'DEPOSIT', 'SUCCESS', ?, ?, ?, ?, ?, ?)`
        ).run(
          `wallet_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          existing.user_id,
          Number(existing.amount),
          currentBalance,
          nextBalance,
          gatewayPaymentId,
          `Razorpay payment ${gatewayPaymentId}`,
          verifiedAt
        );
      }
      bonusPayload = {
        userId: existing.user_id,
        depositAmount: Number(existing.amount),
        depositEntryId: gatewayPaymentId
      };
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  if (bonusPayload) {
    const { applyFirstDepositBonusIfEligible, applyReferralDepositBonusIfEligible, applySpecialDepositBonusIfEligible } = await import("../db.mjs");
    await applyFirstDepositBonusIfEligible(bonusPayload);
    await applySpecialDepositBonusIfEligible(bonusPayload);
    await applyReferralDepositBonusIfEligible(bonusPayload);
  }

  return findPaymentOrderById(paymentOrderId);
}

export async function completePaymentLinkOrder({ reference, gatewayOrderId, gatewayPaymentId, gatewaySignature = "payment_link_webhook" }) {
  if (!reference) {
    return null;
  }

  const existingOrder = await findPaymentOrderByReference(reference);
  if (!existingOrder) {
    return null;
  }

  return completePaymentOrder({
    paymentOrderId: existingOrder.id,
    gatewayOrderId: gatewayOrderId || existingOrder.gatewayOrderId || `plink_${reference}`,
    gatewayPaymentId: gatewayPaymentId || existingOrder.gatewayPaymentId || `plinkpay_${reference}`,
    gatewaySignature
  });
}

export async function handlePaymentWebhook(referenceOrLookup, statusArg) {
  const lookup =
    typeof referenceOrLookup === "object" && referenceOrLookup !== null
      ? referenceOrLookup
      : { reference: referenceOrLookup, status: statusArg };
  const nextStatus = String(lookup.status || statusArg || "").trim().toUpperCase();
  const paymentOrderId = String(lookup.paymentOrderId || "").trim();
  const reference = String(lookup.reference || "").trim();
  const gatewayOrderId = String(lookup.gatewayOrderId || "").trim();

  if (!nextStatus) {
    return null;
  }

  let targetOrder = null;
  if (paymentOrderId) {
    targetOrder = await findPaymentOrderById(paymentOrderId);
  }
  if (!targetOrder && reference) {
    targetOrder = await findPaymentOrderByReference(reference);
  }
  if (!targetOrder && gatewayOrderId) {
    targetOrder = await findPaymentOrderByGatewayOrderId(gatewayOrderId);
  }
  if (!targetOrder) {
    return null;
  }

  const updatedAt = __internalNowIso();
  const pool = __internalGetPgPool();

  if (pool) {
    await pool.query(
      `UPDATE wallet_entries
       SET status = $2, note = COALESCE(note, 'Processor flow deposit request')
       WHERE user_id = $1 AND type = 'DEPOSIT' AND status = 'INITIATED' AND reference_id = $3`,
      [targetOrder.userId, nextStatus, targetOrder.reference]
    );
    const result = await pool.query(
      `UPDATE payment_orders
       SET status = $2, updated_at = $3
       WHERE id = $1
       RETURNING id, user_id, provider, amount, status, reference, checkout_token, gateway_order_id, gateway_payment_id, gateway_signature, verified_at, redirect_url, created_at, updated_at`,
      [targetOrder.id, nextStatus, updatedAt]
    );
    return mapPaymentOrderRow(result.rows[0]);
  }

  const db = __internalGetSqlite();
  db.prepare(
    `UPDATE wallet_entries
     SET status = ?, note = COALESCE(note, 'Processor flow deposit request')
     WHERE user_id = ? AND type = 'DEPOSIT' AND status = 'INITIATED' AND reference_id = ?`
  ).run(nextStatus, targetOrder.userId, targetOrder.reference);
  db.prepare(`UPDATE payment_orders SET status = ?, updated_at = ? WHERE id = ?`).run(nextStatus, updatedAt, targetOrder.id);
  return mapPaymentOrderRow(
    db
      .prepare(
        `SELECT id, user_id, provider, amount, status, reference, checkout_token, gateway_order_id, gateway_payment_id, gateway_signature, verified_at, redirect_url, created_at, updated_at
         FROM payment_orders
         WHERE id = ?
         LIMIT 1`
      )
      .get(targetOrder.id)
  );
}
