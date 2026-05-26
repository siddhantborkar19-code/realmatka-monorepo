"use client";

import { useEffect, useMemo, useState } from "react";

const apiBaseUrl = (process.env.NEXT_PUBLIC_API_BASE_URL || "https://api.realmatka.in").replace(/\/$/, "");
const REFRESH_INTERVAL_MS = 60_000;

type LiveMarket = {
  slug: string;
  name?: string;
  result?: string;
  open?: string;
  close?: string;
};

export type MarketCard = {
  slug: string;
  name: string;
  result?: string;
  open: string;
  close: string;
  tag: string;
};

type MarketsSectionProps = {
  initialMarkets: MarketCard[];
  loginUrl: string;
  registerUrl: string;
};

function slugifyMarket(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function mergeMarkets(initialMarkets: MarketCard[], liveMarkets: LiveMarket[]) {
  const liveMap = new Map(liveMarkets.map((market) => [market.slug, market] as const));

  const mergedLiveMarkets = liveMarkets.map((live) => {
    const fallback = initialMarkets.find((item) => item.slug === live.slug);
    return {
      slug: live.slug,
      name: live.name?.trim() || fallback?.name || live.slug,
      result: live.result?.trim() || "***-**-***",
      open: live.open?.trim() || fallback?.open || "--:--",
      close: live.close?.trim() || fallback?.close || "--:--",
      tag: fallback?.tag || "Games"
    };
  });

  const missingFallbackMarkets = initialMarkets
    .filter((fallback) => !liveMap.has(fallback.slug))
    .map((fallback) => ({
      ...fallback,
      result: fallback.result || "***-**-***"
    }));

  return [...mergedLiveMarkets, ...missingFallbackMarkets];
}

function areMarketsEqual(currentMarkets: MarketCard[], nextMarkets: MarketCard[]) {
  if (currentMarkets.length !== nextMarkets.length) {
    return false;
  }

  for (let index = 0; index < currentMarkets.length; index += 1) {
    const current = currentMarkets[index];
    const next = nextMarkets[index];
    if (
      current.slug !== next.slug ||
      current.name !== next.name ||
      current.result !== next.result ||
      current.open !== next.open ||
      current.close !== next.close ||
      current.tag !== next.tag
    ) {
      return false;
    }
  }

  return true;
}

export function MarketsSection({ initialMarkets, loginUrl, registerUrl }: MarketsSectionProps) {
  const [markets, setMarkets] = useState<MarketCard[]>(() =>
    initialMarkets.map((market) => ({
      ...market,
      result: market.result || "***-**-***"
    }))
  );

  useEffect(() => {
    let cancelled = false;

    async function loadMarkets() {
      try {
        const response = await fetch(`${apiBaseUrl}/api/markets/list`, {
          cache: "no-store"
        });
        if (!response.ok) {
          throw new Error(`Markets request failed: ${response.status}`);
        }

        const payload = (await response.json()) as { ok?: boolean; data?: LiveMarket[] };
        const liveMarkets = Array.isArray(payload?.data) ? payload.data : [];
        if (cancelled) {
          return;
        }

        const mergedMarkets = mergeMarkets(initialMarkets, liveMarkets);
        setMarkets((current) => (areMarketsEqual(current, mergedMarkets) ? current : mergedMarkets));
      } catch {
        if (!cancelled) {
          setMarkets((current) => current);
        }
      }
    }

    void loadMarkets();
    const interval = window.setInterval(() => {
      void loadMarkets();
    }, REFRESH_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [initialMarkets]);
  return (
    <>
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="text-sm font-semibold uppercase tracking-[0.22em] text-slate-400">All Markets</div>
        </div>
        <a href={registerUrl} className="action-secondary w-full justify-center sm:w-auto">Register Now</a>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {markets.map((market) => (
          <div key={market.slug} className="glass-card market-card market-card-mobile p-5">
            <div className="market-card-layout">
              <div className="market-card-copy">
                <h3 className="market-name-text font-extrabold uppercase text-white">{market.name}</h3>
                <p className={`market-result-text mt-3 font-extrabold text-orange-200 ${(market.result || "").startsWith("*") ? "market-result-pending" : ""}`}>
                  {market.result || "***-**-***"}
                </p>
                <div className="market-time-row mt-3">
                  <span>Open {market.open}</span>
                  <span>Close {market.close}</span>
                </div>
                <div className="market-links-stack mt-4">
                  <a href={`/jodi-chart-record/${slugifyMarket(market.name)}`} className="market-chart-text-link">Jodi Chart</a>
                  <a href={`/panel-chart-record/${slugifyMarket(market.name)}`} className="market-chart-text-link">Panel Chart</a>
                </div>
              </div>
              <div className="market-play-wrap">
                <a href={loginUrl} target="_blank" rel="noreferrer" className="action-primary market-button-mobile market-play-mobile text-center">Play Now</a>
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
