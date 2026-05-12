import { notFound } from "next/navigation";
import { ChartRecordPage, getChartMarket, getChartMarketLabel } from "@/components/ChartRecordPage";
import { buildMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";
export const revalidate = 60;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const market = getChartMarket(slug);
  if (!market) {
    return buildMetadata({
      title: "Jodi Chart Record",
      description: "Market-wise jodi chart record and old satta matka history.",
      path: `/jodi-chart-record/${slug}`
    });
  }

  const label = getChartMarketLabel(slug);
  const upperLabel = label.toUpperCase();
  return buildMetadata({
    title: `${upperLabel} JODI CHART RECORD | OLD ${upperLabel} JODI RESULT CHART`,
    description: `${label} Jodi Chart record old history, daily jodi result, open close chart, final ank, bracket aur old ${label} matka jodi records ko Real Matka par mobile-friendly format me dekho.`,
    path: `/jodi-chart-record/${slug}`,
    keywords: [
      `${label} jodi chart`,
      `${label} jodi chart record`,
      `${label} matka jodi chart`,
      `${label} old jodi chart`,
      `${label} jodi result`,
      `${label} jodi record`,
      `${label} jodi chart 2015`,
      `${label} jodi chart 2012`,
      `${label} jodi chart 2012 to 2026`,
      `${label} final ank`,
      `${label} jodi chart matka`,
      `${label} jodi chart book`,
      `dpboss ${label} jodi chart`,
      `dpboss ${label} jodi record`,
      `dpboss ${label} jodi result`,
      `${label} open close jodi chart`,
      `${label} old jodi result chart`,
      `matka jodi chart ${label}`,
      `matka ${label} chart`,
      `satta ${label} chart jodi`,
      `${label} chart result`,
      `${label} satta chart`,
      `${label} matka chart`,
      "satta matka jodi chart record",
      "matka jodi chart",
      "डीपी बॉस",
      "सट्टा चार्ट",
      "सट्टा मटका जॉडी चार्ट",
      "मटका जोड़ी चार्ट",
      `${upperLabel} JODI CHART RECORDS`
    ]
  });
}

export default async function JodiChartRecordPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!getChartMarket(slug)) {
    notFound();
  }
  return <ChartRecordPage slug={slug} chartType="jodi" />;
}
