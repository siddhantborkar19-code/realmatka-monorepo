"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";

const apiBaseUrl = (process.env.NEXT_PUBLIC_API_BASE_URL || "https://api.realmatka.in").replace(/\/$/, "");

type ChartPayload = {
  marketSlug: string;
  chartType: "jodi" | "panna";
  rows: string[][];
};

type LiveMarket = {
  slug: string;
  name?: string;
  result?: string;
  open?: string;
  close?: string;
};

type PannaCell = {
  open: string;
  jodi: string;
  close: string;
};

type PannaRow = {
  label: string;
  cells: PannaCell[];
};

const WEEK_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

function ChartPageContent() {
  const routeParams = useParams<{ slug: string | string[] }>();
  const searchParams = useSearchParams();
  const slug = typeof routeParams.slug === "string" ? routeParams.slug : Array.isArray(routeParams.slug) ? routeParams.slug[0] ?? "" : "";
  const chartType = searchParams.get("type") === "panna" ? "panna" : "jodi";
  const label =
    searchParams.get("label") ??
    slug.split("-").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
  const upperLabel = label.toUpperCase();
  const seoTagText = buildSeoTagText(label, chartType);
  const [chart, setChart] = useState<ChartPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [marketResult, setMarketResult] = useState("***-**-***");
  const [marketTiming, setMarketTiming] = useState("--:-- - --:--");
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadPageData(showLoading = true) {
      if (!slug) {
        if (active) {
          setError("Invalid chart link");
          setLoading(false);
        }
        return;
      }
      try {
        if (showLoading) {
          setLoading(true);
        } else {
          setRefreshing(true);
        }
        setError("");

        const [chartResponse, marketResponse] = await Promise.all([
          fetch(`/api/charts/${encodeURIComponent(slug)}?type=${chartType}`, {
            cache: "no-store"
          }),
          fetch(`${apiBaseUrl}/api/markets/list`, {
            cache: "no-store"
          })
        ]);

        const chartPayload = await chartResponse.json();
        if (!chartResponse.ok || !chartPayload?.ok) {
          throw new Error(chartPayload?.error ?? "Unable to load chart");
        }

        const marketPayload = (await marketResponse.json()) as { data?: LiveMarket[] };
        const market = Array.isArray(marketPayload?.data) ? marketPayload.data.find((item) => item.slug === slug) : null;

        if (!active) {
          return;
        }

        setChart(chartPayload.data as ChartPayload);
        if (market) {
          setMarketResult(String(market.result || "***-**-***").trim() || "***-**-***");
          setMarketTiming(`${String(market.open || "--:--").trim()} - ${String(market.close || "--:--").trim()}`);
        }
      } catch (loadError) {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : "Unable to load chart");
        }
      } finally {
        if (active) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    }

    void loadPageData(true);
    return () => {
      active = false;
    };
  }, [slug, chartType]);

  const jodiRows = useMemo(() => normalizeJodiRows(chart?.rows ?? []), [chart]);
  const pannaRows = useMemo(() => normalizePannaRows(chart?.rows ?? []), [chart]);
  const hasRows = hasRenderableChartRows(chart?.rows);

  async function refreshChartAndResult() {
    if (!slug) return;
    try {
      setRefreshing(true);
      setError("");
      const [chartResponse, marketResponse] = await Promise.all([
        fetch(`/api/charts/${encodeURIComponent(slug)}?type=${chartType}`, {
          cache: "no-store"
        }),
        fetch(`${apiBaseUrl}/api/markets/list`, {
          cache: "no-store"
        })
      ]);

      const chartPayload = await chartResponse.json();
      if (!chartResponse.ok || !chartPayload?.ok) {
        throw new Error(chartPayload?.error ?? "Unable to refresh chart");
      }

      const marketPayload = (await marketResponse.json()) as { data?: LiveMarket[] };
      const market = Array.isArray(marketPayload?.data) ? marketPayload.data.find((item) => item.slug === slug) : null;

      setChart(chartPayload.data as ChartPayload);
      if (market) {
        setMarketResult(String(market.result || "***-**-***").trim() || "***-**-***");
        setMarketTiming(`${String(market.open || "--:--").trim()} - ${String(market.close || "--:--").trim()}`);
      }
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : "Unable to refresh chart");
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#07101d_0%,#08111f_36%,#060a14_100%)] text-white">
      <main className="mx-auto flex w-full max-w-[1800px] flex-col gap-5 px-2 py-4 sm:px-4 sm:py-6 xl:px-5">
        <section className="px-2 py-3 sm:px-3 sm:py-4">
          <div className="flex flex-col items-center gap-4 text-center">
            <img src="/header-logo.png" alt="Real Matka" className="h-12 w-auto object-contain sm:h-16" />
            <div>
              <div className="text-sm font-semibold uppercase tracking-[0.28em] text-slate-400">
                {chartType === "panna" ? "Panna Chart" : "Jodi Chart"}
              </div>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300 sm:text-base">
                {upperLabel} chart history, market timing aur weekly records yahan clear format me dekh sakte ho.
              </p>
              <div className="mt-3 text-xs font-semibold uppercase tracking-[0.22em] text-orange-200 sm:text-sm">
                #RealMatka #MatkaChart #JodiChart #PannaChart
              </div>
            </div>
            <div className="flex flex-wrap justify-center gap-3">
              <Link href={`/charts/${slug}?type=jodi&label=${encodeURIComponent(label)}`} className={chartType === "jodi" ? "action-primary" : "action-secondary"}>
                Jodi Chart
              </Link>
              <Link href={`/charts/${slug}?type=panna&label=${encodeURIComponent(label)}`} className={chartType === "panna" ? "action-primary" : "action-secondary"}>
                Panna Chart
              </Link>
              <Link href="/#markets" className="action-secondary">
                Back to Markets
              </Link>
            </div>
          </div>
        </section>

        <section className="overflow-hidden px-1 py-2 sm:px-2 sm:py-3">
          <div className="mb-5 flex justify-center">
            <div className="flex flex-col items-center gap-3">
              <button
                type="button"
                onClick={() => window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" })}
                className="action-secondary"
              >
                Go to Bottom
              </button>
              <div className="rounded-[16px] border border-white/10 bg-white/[0.04] px-4 py-2 text-center">
                <div className="text-sm font-extrabold uppercase tracking-[0.16em] text-slate-300 sm:text-lg">{upperLabel}</div>
                <div className="mt-1 text-lg font-extrabold text-orange-200">{marketResult}</div>
              </div>
              <button
                type="button"
                onClick={() => {
                  void refreshChartAndResult();
                }}
                className="action-secondary"
                disabled={refreshing}
              >
                {refreshing ? "Refreshing..." : "Refresh Result"}
              </button>
            </div>
          </div>
          {loading ? <div className="py-12 text-center text-slate-300">Loading chart...</div> : null}
          {!loading && error ? <div className="py-12 text-center font-semibold text-rose-300">{error}</div> : null}
          {!loading && !error && !hasRows ? (
            <div className="py-12 text-center text-slate-300">Chart data abhi available nahi hai. Thoda baad retry karo.</div>
          ) : null}

          {!loading && !error && hasRows && chartType === "jodi" ? (
            <div className="overflow-hidden">
              <table className="w-full table-fixed border-collapse text-center">
                <thead>
                  <tr>
                    {WEEK_DAYS.map((day) => (
                      <th key={day} className="border border-white/10 bg-white/5 px-1 py-2 text-[10px] font-extrabold text-slate-100 sm:px-3 sm:py-3 sm:text-[13px]">
                        {day}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {jodiRows.map((row, rowIndex) => (
                    <tr key={`jodi-${rowIndex}`}>
                      {row.map((cell, cellIndex) => (
                        <td key={`jodi-${rowIndex}-${cellIndex}`} className="border border-white/10 px-1 py-2 text-[11px] font-extrabold leading-none text-slate-100 sm:px-3 sm:py-3 sm:text-[14px]">
                          <span className={highlightCell(cell) ? "text-rose-300" : undefined}>{cell}</span>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          {!loading && !error && hasRows && chartType === "panna" ? (
            <div className="overflow-hidden">
              <table className="w-full table-fixed border-collapse text-center">
                <thead>
                  <tr>
                    <th className="w-[72px] border border-white/10 bg-white/5 px-1 py-2 text-[10px] font-extrabold text-slate-100 sm:w-auto sm:px-3 sm:py-3 sm:text-[13px]">Date</th>
                    {WEEK_DAYS.map((day) => (
                      <th key={day} className="border border-white/10 bg-white/5 px-1 py-2 text-[9px] font-extrabold text-slate-100 sm:px-3 sm:py-3 sm:text-[13px]">
                        {day}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pannaRows.map((row, rowIndex) => {
                    const dateBlock = buildDateBlock(row.label);
                    return (
                      <tr key={`panna-${rowIndex}`}>
                        <td className="border border-white/10 bg-white/[0.04] px-1 py-2 text-slate-200 sm:px-3 sm:py-3">
                          <div className="text-[9px] font-bold leading-tight text-slate-400 sm:text-[12px]">{compactDateBlock(dateBlock.year)}</div>
                          <div className="text-[10px] font-bold leading-tight text-slate-100 sm:text-[13px]">{compactDateBlock(dateBlock.start)}</div>
                          <div className="text-[10px] font-bold leading-tight text-slate-100 sm:text-[13px]">{compactDateBlock(dateBlock.end)}</div>
                        </td>
                        {row.cells.map((cell, cellIndex) => (
                          <td key={`panna-${rowIndex}-${cellIndex}`} className="border border-white/10 px-1 py-2 sm:px-3 sm:py-3">
                            <div className={`text-[8px] font-bold leading-tight ${highlightCell(cell.jodi) ? "text-rose-300" : "text-slate-400"} sm:text-[12px]`}>{cell.open}</div>
                            <div className={`text-[11px] font-extrabold leading-none ${highlightCell(cell.jodi) ? "text-rose-300" : "text-slate-100"} sm:text-[14px]`}>{cell.jodi}</div>
                            <div className={`text-[8px] font-bold leading-tight ${highlightCell(cell.jodi) ? "text-rose-300" : "text-slate-400"} sm:text-[12px]`}>{cell.close}</div>
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}

          {!loading && !error && hasRows ? (
            <div className="mt-5 flex flex-col items-center gap-4">
              <div className="w-full rounded-[16px] border border-white/10 bg-white/[0.04] px-4 py-3 text-center">
                <div className="text-sm font-extrabold uppercase tracking-[0.16em] text-slate-300 sm:text-lg">{upperLabel}</div>
                <div className="mt-1 text-lg font-extrabold text-orange-200">{marketResult}</div>
              </div>
              <button
                type="button"
                onClick={() => {
                  void refreshChartAndResult();
                }}
                className="action-secondary"
                disabled={refreshing}
              >
                {refreshing ? "Refreshing..." : "Refresh Result"}
              </button>
              <button
                type="button"
                onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
                className="action-secondary"
              >
                Go to Top
              </button>
              <div className="max-w-6xl text-center text-[11px] font-medium leading-6 text-slate-400 sm:text-xs sm:leading-7">
                {seoTagText}
              </div>
            </div>
          ) : null}
        </section>
      </main>
    </div>
  );
}

export default function PublicChartPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[linear-gradient(180deg,#07101d_0%,#08111f_36%,#060a14_100%)] text-white">
          <main className="mx-auto flex w-full max-w-[1620px] flex-col gap-6 px-3 py-6 sm:px-5 sm:py-8 xl:px-6">
            <div className="section-shell px-5 py-12 text-center text-slate-300">Loading chart...</div>
          </main>
        </div>
      }
    >
      <ChartPageContent />
    </Suspense>
  );
}

function hasRenderableChartRows(rows: string[][] | undefined | null) {
  return Array.isArray(rows) && rows.some((row) => Array.isArray(row) && row.length > 1 && String(row[0] ?? "").trim());
}

function normalizeJodiRows(rows: string[][]) {
  return rows.map((row) => {
    const values = row.length >= 8 ? row.slice(1) : row;
    const trimmed = values.slice(0, 7).map((value) => normalizeJodiValue(value));
    while (trimmed.length < 7) {
      trimmed.push("--");
    }
    return trimmed;
  });
}

function normalizePannaRows(rows: string[][]): PannaRow[] {
  return rows.map((row, index) => {
    const label = String(row[0] ?? `Week ${index + 1}`);
    const rawCells = row.slice(1).map((value) => String(value ?? "").trim());
    const hasPackedCells = rawCells.length >= 7 && rawCells.slice(0, 7).some((value) => value.includes("/") || /^[0-9]{3}[-\s/][0-9]{2}[-\s/][0-9]{3}$/.test(value));
    const cells: PannaCell[] = [];

    if (hasPackedCells) {
      for (let cellIndex = 0; cellIndex < 7; cellIndex += 1) {
        cells.push(parsePannaCellValue(rawCells[cellIndex]));
      }
      return { label, cells };
    }

    const values = rawCells.filter(Boolean);
    for (let cellIndex = 0; cellIndex < 7; cellIndex += 1) {
      const open = normalizePannaValue(values[cellIndex * 2]);
      const rawClose = String(values[cellIndex * 2 + 1] ?? "").trim();
      const close = normalizePannaValue(rawClose);
      cells.push({
        open,
        jodi: deriveJodi(open, rawClose || close),
        close: /^[0-9]\*\*$/.test(rawClose) ? "***" : close
      });
    }

    return { label, cells };
  });
}

function normalizeJodiValue(value: string) {
  const cleaned = String(value ?? "").trim();
  if (/^[0-9]{2,3}$/.test(cleaned)) return cleaned.slice(-2);
  if (/^[0-9]\*$/.test(cleaned)) return cleaned;
  return "--";
}

function normalizePannaValue(value: string | undefined) {
  const cleaned = String(value ?? "").trim();
  return /^[0-9]{3}$/.test(cleaned) ? cleaned : "---";
}

function deriveOpenStageJodi(close: string) {
  return /^[0-9]\*\*$/.test(close) ? `${close[0]}*` : "--";
}

function deriveJodi(open: string, close: string) {
  if (!/^[0-9]{3}$/.test(open) || !/^[0-9]{3}$/.test(close)) {
    return deriveOpenStageJodi(close);
  }
  return `${sumDigits(open) % 10}${sumDigits(close) % 10}`;
}

function parsePannaCellValue(value: string | undefined): PannaCell {
  const cleaned = String(value ?? "").trim();
  const full = cleaned.match(/^([0-9]{3})[-\s/]([0-9]{2})[-\s/]([0-9]{3})$/);
  if (full) {
    return { open: full[1], jodi: full[2], close: full[3] };
  }

  const pair = cleaned.match(/^([0-9]{3})[\/\s-]([0-9]{3})$/);
  if (pair) {
    const open = normalizePannaValue(pair[1]);
    const close = normalizePannaValue(pair[2]);
    return { open, jodi: deriveJodi(open, close), close };
  }

  const partial = cleaned.match(/^([0-9]{3})[\/\s-]([0-9])\*\*$/);
  if (partial) {
    return { open: partial[1], jodi: `${partial[2]}*`, close: "***" };
  }

  if (cleaned === "***") {
    return { open: "---", jodi: "--", close: "---" };
  }

  const single = normalizePannaValue(cleaned);
  return { open: single, jodi: "--", close: "---" };
}

function sumDigits(value: string) {
  return value.split("").reduce((total, digit) => total + Number(digit), 0);
}

function buildDateBlock(label: string) {
  const weekMatch = label.trim().match(/^(\d{4})\s+([A-Za-z]{3}\s+\d{2})\s+to\s+([A-Za-z]{3}\s+\d{2})$/);
  if (weekMatch) {
    return {
      year: weekMatch[1],
      start: weekMatch[2],
      end: weekMatch[3]
    };
  }

  const shortMatch = label.trim().match(/^(\d{2})-([A-Za-z]{3})$/);
  if (shortMatch) {
    return {
      year: String(new Date().getFullYear()),
      start: `${shortMatch[2]} ${shortMatch[1]}`,
      end: "--"
    };
  }

  return {
    year: "",
    start: label,
    end: "--"
  };
}

function compactDateBlock(value: string) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .replace("Aug", "AUG")
    .replace("Sep", "SEP")
    .replace("Oct", "OCT")
    .replace("Nov", "NOV")
    .replace("Dec", "DEC")
    .replace("Jan", "JAN")
    .replace("Feb", "FEB")
    .replace("Mar", "MAR")
    .replace("Apr", "APR")
    .replace("May", "MAY")
    .replace("Jun", "JUN")
    .replace("Jul", "JUL")
    .trim();
}

function highlightCell(value: string) {
  return ["77", "88", "72", "05", "00", "49", "***", "**", "16", "50"].some((token) => value.includes(token));
}

function buildSeoTagText(marketLabel: string, chartType: "jodi" | "panna") {
  const upperLabel = String(marketLabel ?? "").trim().toUpperCase();
  const englishTags =
    chartType === "panna"
      ? [
          `${upperLabel} PANEL CHART RECORDS`,
          `dpboss ${upperLabel} panel chart`,
          `dpboss ${upperLabel} pana patti chart`,
          `dpboss ${upperLabel} panel record`,
          `${upperLabel} panel chart`,
          `old ${upperLabel} panel chart`,
          `${upperLabel} pana patti chart`,
          `${upperLabel} panel record`,
          `${upperLabel} panel result chart`,
          `${upperLabel} panel guessing chart`,
          `${upperLabel} panel chart 2015`,
          `${upperLabel} panel chart 2012`,
          `${upperLabel} panel chart 2012 to 2026`,
          `${upperLabel} final ank`,
          `${upperLabel} panel chart matka`,
          `${upperLabel} matka chart`,
          `matka panel chart ${upperLabel}`,
          `satta ${upperLabel} chart panel`,
          `${upperLabel} chart result`,
          `${upperLabel} open close panel chart`,
          `${upperLabel} old panel patti chart`
        ]
      : [
          `${upperLabel} JODI CHART RECORDS`,
          `dpboss ${upperLabel} jodi chart`,
          `dpboss ${upperLabel} jodi record`,
          `dpboss ${upperLabel} jodi result`,
          `${upperLabel} jodi chart`,
          `old ${upperLabel} jodi chart`,
          `${upperLabel} jodi record`,
          `${upperLabel} jodi result chart`,
          `${upperLabel} jodi guessing chart`,
          `${upperLabel} jodi chart 2015`,
          `${upperLabel} jodi chart 2012`,
          `${upperLabel} jodi chart 2012 to 2026`,
          `${upperLabel} final ank`,
          `${upperLabel} jodi chart matka`,
          `${upperLabel} matka chart`,
          `matka jodi chart ${upperLabel}`,
          `satta ${upperLabel} chart jodi`,
          `${upperLabel} chart result`,
          `${upperLabel} open close jodi chart`,
          `${upperLabel} old jodi result chart`
        ];

  const hindiTags = [
    "डीपी बॉस",
    "सट्टा चार्ट",
    chartType === "panna" ? "सट्टा मटका पैनल चार्ट" : "सट्टा मटका जॉडी चार्ट",
    chartType === "panna" ? "मटका पाना पत्ती चार्ट" : "मटका जोड़ी चार्ट",
    `${marketLabel} मटका चार्ट`,
    `${marketLabel} सट्टा चार्ट`,
    chartType === "panna" ? `${marketLabel} पैनल चार्ट` : `${marketLabel} जोड़ी चार्ट`
  ];

  return [...englishTags, ...hindiTags].map((tag) => `#${tag.replace(/\s+/g, " ").trim()}`).join(" ");
}
