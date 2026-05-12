import Link from "next/link";
import { buildMetadata } from "@/lib/seo";
import { chartMarkets } from "@/lib/market-links";
import { SeoFaq } from "@/components/SeoFaq";

export const metadata = buildMetadata({
  title: "Matka Chart | Jodi Chart And Panna Chart",
  description:
    "Matka Chart page par jodi chart, panna chart, old chart access aur market-wise chart usage details clearly dekho.",
  path: "/matka-chart",
  keywords: [
    "matka chart",
    "jodi chart",
    "panna chart",
    "old matka chart",
    "ai jodi chart",
    "matka guessing chart",
    "final ank guessing"
  ]
});

const chartBlocks = [
  {
    title: "Jodi Chart",
    body: "Daily jodi records aur market-wise jodi movement ko quickly review karne ke liye."
  },
  {
    title: "Panna Chart",
    body: "Open panna aur close panna pattern ko market history ke saath dekhne ke liye."
  },
  {
    title: "Old Chart Reference",
    body: "Historical rows aur old weekly chart review ko simple reference format me dekhne ke liye."
  }
];

const faqItems = [
  {
    question: "Matka Chart page par kya milta hai?",
    answer: "Yahan all market chart links, Jodi Chart, Panna Chart aur old history access ek jagah milta hai."
  },
  {
    question: "Kisi market ka direct chart kaise open karein?",
    answer: "Choose market chart section me market select karke Jodi Chart ya Panna Chart button par click karo."
  },
  {
    question: "Kya market-wise history direct dekh sakte hain?",
    answer: "Haan, har market card se us market ki direct chart history khulti hai."
  }
] as const;

export default function MatkaChartPage() {
  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#07101d_0%,#08111f_36%,#060a14_100%)] text-white">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-10">
        <section className="section-shell px-6 py-8 sm:px-8">
          <div className="metric-pill">Matka Chart</div>
          <h1 className="mt-4 text-3xl font-extrabold sm:text-5xl">Matka chart, jodi chart aur panna chart access</h1>
          <p className="mt-4 max-w-4xl text-sm leading-7 text-slate-300 sm:text-base">
            Is page se jodi chart, panna chart aur old chart records ko ek jagah se dekhna aur compare karna easy ho jata hai.
          </p>
        </section>

        <section className="section-shell px-6 py-6 sm:px-8">
          <div className="grid gap-4 md:grid-cols-3">
            {chartBlocks.map((item) => (
              <article key={item.title} className="rounded-[24px] border border-white/10 bg-white/[0.03] px-5 py-5">
                <h2 className="text-xl font-extrabold text-slate-100">{item.title}</h2>
                <p className="mt-3 text-sm leading-7 text-slate-300 sm:text-base">{item.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="section-shell px-6 py-6 sm:px-8">
          <h2 className="text-2xl font-extrabold">Related pages</h2>
          <p className="mt-3 text-sm leading-7 text-slate-300 sm:text-base">
            Result ya online play section par jana ho to neeche ke quick links use kar sakte ho.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link href="/matka-result" className="action-primary">
              Result Page
            </Link>
            <Link href="/satta-matka" className="action-secondary">
              Satta Matka Page
            </Link>
            <Link href="/online-play-satta-matka" className="action-secondary">
              Online Play Page
            </Link>
            <Link href="/ai-matka-guessing" className="action-secondary">
              AI Guessing Page
            </Link>
          </div>
        </section>

        <section className="section-shell px-6 py-6 sm:px-8">
          <h2 className="text-2xl font-extrabold">Choose market chart</h2>
          <p className="mt-3 text-sm leading-7 text-slate-300 sm:text-base">
            Kisi bhi market ka jodi chart ya panna chart direct open karne ke liye neeche se market select karo.
          </p>
          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {chartMarkets.map((market) => (
              <article key={market.slug} className="rounded-[24px] border border-white/10 bg-white/[0.03] px-5 py-5">
                <div className="text-lg font-extrabold text-slate-100">{market.label}</div>
                <div className="mt-2 text-sm text-slate-400">
                  {market.open} - {market.close}
                </div>
                <div className="mt-4 flex flex-wrap gap-3">
                  <Link href={`/jodi-chart-record/${market.slug}`} className="action-primary">
                    Jodi Record
                  </Link>
                  <Link href={`/panel-chart-record/${market.slug}`} className="action-secondary">
                    Panel Record
                  </Link>
                  <Link href={`/charts/${market.slug}?type=jodi&label=${encodeURIComponent(market.label)}`} className="action-secondary">
                    Live Chart
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </section>

        <SeoFaq title="Matka Chart FAQ" items={[...faqItems]} />
      </div>
    </main>
  );
}
