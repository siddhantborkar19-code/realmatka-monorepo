import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

function getCashfreeSecret() {
  return process.env.CASHFREE_SECRET_KEY?.trim() || process.env.CASHFREE_CLIENT_SECRET?.trim() || "";
}

function verifyCashfreeSignature(rawBody: string, signature: string, timestamp: string) {
  const secret = getCashfreeSecret();
  if (!secret || !signature || !timestamp) {
    return false;
  }

  const expected = createHmac("sha256", secret).update(`${timestamp}${rawBody}`).digest("base64");
  const expectedBuffer = Buffer.from(expected);
  const signatureBuffer = Buffer.from(signature);
  return expectedBuffer.length === signatureBuffer.length && timingSafeEqual(expectedBuffer, signatureBuffer);
}

async function forwardVerifiedWebhook(rawBody: string, signature: string, timestamp: string) {
  const internalWebhookUrl = process.env.ACCOUNT_CREDIT_INTERNAL_WEBHOOK_URL?.trim() || "";
  if (!internalWebhookUrl) {
    return { forwarded: false, status: 200, message: "Verified by NovaByte. Internal webhook URL not configured." };
  }

  const response = await fetch(internalWebhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-webhook-signature": signature,
      "x-webhook-timestamp": timestamp,
      ...(process.env.ACCOUNT_CREDIT_INTERNAL_WEBHOOK_SECRET
        ? { "x-novabyte-webhook-secret": process.env.ACCOUNT_CREDIT_INTERNAL_WEBHOOK_SECRET }
        : {})
    },
    body: rawBody
  });

  const text = await response.text().catch(() => "");
  return {
    forwarded: true,
    status: response.status,
    message: text || response.statusText
  };
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-webhook-signature")?.trim() || "";
  const timestamp = request.headers.get("x-webhook-timestamp")?.trim() || "";

  if (!verifyCashfreeSignature(rawBody, signature, timestamp)) {
    return NextResponse.json({ ok: false, error: "Invalid Cashfree webhook signature" }, { status: 400 });
  }

  let payload: unknown = {};
  try {
    payload = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid Cashfree webhook payload" }, { status: 400 });
  }

  const forwardResult = await forwardVerifiedWebhook(rawBody, signature, timestamp);
  if (forwardResult.forwarded && forwardResult.status >= 400) {
    return NextResponse.json(
      { ok: false, verified: true, forwarded: true, upstreamStatus: forwardResult.status, upstreamMessage: forwardResult.message },
      { status: 502 }
    );
  }

  return NextResponse.json({
    ok: true,
    verified: true,
    forwarded: forwardResult.forwarded,
    payloadType: typeof payload === "object" && payload && "type" in payload ? String((payload as { type?: unknown }).type || "") : ""
  });
}
