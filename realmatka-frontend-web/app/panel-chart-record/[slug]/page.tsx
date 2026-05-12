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
      title: "Panel Chart Record",
      description: "Market-wise panel chart record and old satta matka history.",
      path: `/panel-chart-record/${slug}`
    });
  }

  const label = getChartMarketLabel(slug);
  const upperLabel = label.toUpperCase();
  return buildMetadata({
    title: `${upperLabel} PANEL CHART RECORD | OLD ${upperLabel} PANNA PATTI CHART`,
    description: `${label} Panel Chart record old history, panna patti chart, daily panel result, open close chart, final ank aur old ${label} matka panel records ko Real Matka par clear mobile-friendly format me dekho.`,
    path: `/panel-chart-record/${slug}`,
    keywords: [
      `${label} panel chart`,
      `${label} panel chart record`,
      `${label} panna chart`,
      `${label} panna chart record`,
      `${label} old panel chart`,
      `${label} panel result`,
      `${label} pana patti chart`,
      `${label} panel record`,
      `${label} panel chart 2015`,
      `${label} panel chart 2012`,
      `${label} panel chart 2012 to 2026`,
      `${label} final ank`,
      `${label} panel chart matka`,
      `${label} panel chart book`,
      `dpboss ${label} panel chart`,
      `dpboss ${label} pana patti chart`,
      `dpboss ${label} panel record`,
      `${label} open close panel chart`,
      `${label} old panel patti chart`,
      `matka panel chart ${label}`,
      `matka ${label} chart`,
      `satta ${label} chart panel`,
      `${label} chart result`,
      `${label} satta chart`,
      `${label} matka chart`,
      "satta matka panel chart record",
      "satta matka panna chart record",
      "डीपी बॉस",
      "सट्टा चार्ट",
      "सट्टा मटका पैनल चार्ट",
      "मटका पाना पत्ती चार्ट",
      `${upperLabel} PANEL CHART RECORDS`
    ]
  });
}

export default async function PanelChartRecordPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!getChartMarket(slug)) {
    notFound();
  }
  return <ChartRecordPage slug={slug} chartType="panna" />;
}
