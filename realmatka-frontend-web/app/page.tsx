import Image from "next/image";
import Link from "next/link";
import { MarketsSection, type MarketCard } from "./markets-section";
import { buildMetadata } from "@/lib/seo";
import { SeoFaq } from "@/components/SeoFaq";

export const revalidate = 60;

export const metadata = buildMetadata({
  title: "Real Matka - Game Rates, Market Results, Jodi & Panna Charts",
  description:
    "Check Real Matka game rates, live market results, online play matka app access, APK download, market timings, jodi charts, and panna charts.",
  path: "/",
  keywords: [
    "real matka live",
    "real matka market",
    "game rate",
    "live result",
    "online play matka app",
    "online satta matka",
    "matka app download",
    "satta matka apk"
  ]
});

const webAppBaseUrl = "https://play.realmatka.in";
const loginUrl = `${webAppBaseUrl}/auth/login`;
const registerUrl = `${webAppBaseUrl}/auth/register`;
const telegramChannelUrl = "https://t.me/realmatka";

const rates = [
  { name: "Single Digit", rate: "10" },
  { name: "Jodi Digit", rate: "100" },
  { name: "Red Bracket", rate: "100" },
  { name: "Single Pana", rate: "160" },
  { name: "Double Pana", rate: "320" },
  { name: "Triple Pana", rate: "1000" },
  { name: "Half Sangam", rate: "1000" },
  { name: "Full Sangam", rate: "10000" }
] as const;

const MARKET_TIME_CHANGE_EFFECTIVE_DATE = "2026-04-27";
const MARKET_TIME_CHANGE_OVERRIDES: Record<string, Pick<MarketCard, "open" | "close">> = {
  "kalyan": { open: "03:20 PM", close: "05:20 PM" },
  "time-bazar": { open: "12:55 PM", close: "01:55 PM" },
  "milan-day": { open: "02:55 PM", close: "04:55 PM" },
  "milan-night": { open: "08:55 PM", close: "10:55 PM" }
};

function getIndiaDateKey() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

function getMarketCatalog(): MarketCard[] {
  const baseMarketCatalog: MarketCard[] = [
  { slug: "ntr-morning", name: "NTR Morning", open: "09:00 AM", close: "10:00 AM", tag: "Games" },
  { slug: "sita-morning", name: "Sita Morning", open: "09:40 AM", close: "10:40 AM", tag: "Games" },
  { slug: "karnataka-day", name: "Karnataka Day", open: "09:55 AM", close: "10:55 AM", tag: "Games" },
  { slug: "star-tara-morning", name: "Star Tara Morning", open: "10:05 AM", close: "11:05 AM", tag: "Games" },
  { slug: "milan-morning", name: "Milan Morning", open: "10:10 AM", close: "11:10 AM", tag: "Games" },
  { slug: "maya-bazar", name: "Maya Bazar", open: "10:15 AM", close: "11:15 AM", tag: "Games" },
  { slug: "andhra-morning", name: "Andhra Morning", open: "10:35 AM", close: "11:35 AM", tag: "Games" },
  { slug: "sridevi", name: "Sridevi", open: "11:25 AM", close: "12:25 PM", tag: "Games" },
  { slug: "mahadevi-morning", name: "Mahadevi Morning", open: "11:40 AM", close: "12:40 PM", tag: "Games" },
  { slug: "time-bazar", name: "Time Bazar", open: "12:55 PM", close: "01:55 PM", tag: "Games" },
  { slug: "madhur-day", name: "Madhur Day", open: "01:20 PM", close: "02:20 PM", tag: "Games" },
  { slug: "sita-day", name: "Sita Day", open: "01:40 PM", close: "02:40 PM", tag: "Games" },
  { slug: "star-tara-day", name: "Star Tara Day", open: "02:15 PM", close: "03:15 PM", tag: "Games" },
  { slug: "milan-day", name: "Milan Day", open: "02:55 PM", close: "04:55 PM", tag: "Games" },
  { slug: "rajdhani-day", name: "Rajdhani Day", open: "03:00 PM", close: "05:00 PM", tag: "Games" },
  { slug: "andhra-day", name: "Andhra Day", open: "03:30 PM", close: "05:30 PM", tag: "Games" },
  { slug: "kalyan", name: "Kalyan", open: "03:20 PM", close: "05:20 PM", tag: "Games" },
  { slug: "mahadevi", name: "Mahadevi", open: "04:25 PM", close: "06:25 PM", tag: "Games" },
  { slug: "ntr-day", name: "NTR Day", open: "04:50 PM", close: "06:50 PM", tag: "Games" },
  { slug: "sita-night", name: "Sita Night", open: "06:40 PM", close: "07:40 PM", tag: "Games" },
  { slug: "sridevi-night", name: "Sridevi Night", open: "07:05 PM", close: "08:05 PM", tag: "Games" },
  { slug: "star-tara-night", name: "Star Tara Night", open: "07:15 PM", close: "08:15 PM", tag: "Games" },
  { slug: "mahadevi-night", name: "Mahadevi Night", open: "07:45 PM", close: "08:45 PM", tag: "Games" },
  { slug: "madhur-night", name: "Madhur Night", open: "08:20 PM", close: "10:20 PM", tag: "Games" },
  { slug: "supreme-night", name: "Supreme Night", open: "08:35 PM", close: "10:35 PM", tag: "Games" },
  { slug: "andhra-night", name: "Andhra Night", open: "08:40 PM", close: "10:40 PM", tag: "Games" },
  { slug: "ntr-night", name: "NTR Night", open: "08:50 PM", close: "10:50 PM", tag: "Games" },
  { slug: "milan-night", name: "Milan Night", open: "08:55 PM", close: "10:55 PM", tag: "Games" },
  { slug: "kalyan-night", name: "Kalyan Night", open: "09:25 PM", close: "11:25 PM", tag: "Games" },
  { slug: "rajdhani-night", name: "Rajdhani Night", open: "09:30 PM", close: "11:40 PM", tag: "Games" },
  { slug: "main-bazar", name: "Main Bazar", open: "09:45 PM", close: "11:55 PM", tag: "Games" },
  { slug: "mangal-bazar", name: "Mangal Bazar", open: "10:05 PM", close: "11:05 PM", tag: "Games" }
  ];

  if (getIndiaDateKey() < MARKET_TIME_CHANGE_EFFECTIVE_DATE) {
    return baseMarketCatalog;
  }

  return baseMarketCatalog.map((market) => {
    const override = MARKET_TIME_CHANGE_OVERRIDES[market.slug];
    return override ? { ...market, ...override } : market;
  });
}

const games = [
  "Single Digit",
  "Jodi Digit",
  "Single Pana",
  "Double Pana",
  "Triple Pana",
  "Half Sangam",
  "Full Sangam",
  "Red Bracket",
  "Odd Even",
  "SP Motor",
  "DP Motor",
  "Single Ank",
  "Panel Group",
  "Cycle Pana",
  "Choice Pana"
] as const;

const seoPageLinks = [
  {
    href: "/satta-matka",
    title: "Satta Matka",
    body: "Satta Matka overview, market timing, game rate, result access aur charts ek jagah dekho."
  },
  {
    href: "/matka-result",
    title: "Matka Result",
    body: "Aaj ke major market results, open close update aur live result access clear format me dekho."
  },
  {
    href: "/online-play-satta-matka",
    title: "Online Play Satta Matka",
    body: "Register, login, download APK aur live web app access ke saath online play flow samjho."
  },
  {
    href: "/matka-chart",
    title: "Matka Chart",
    body: "Jodi chart, panna chart, old chart aur market-wise chart usage details ek jagah pao."
  },
  {
    href: "/ai-matka-guessing",
    title: "AI Matka Guessing",
    body: "AI jodi guessing, final ank guessing aur open close chart analysis ko simple format me samjho."
  },
  {
    href: "/jodi-chart",
    title: "Jodi Chart",
    body: "Daily jodi records aur market-wise jodi movement ko clear chart page par dekho."
  },
  {
    href: "/panna-chart",
    title: "Panna Chart",
    body: "Open close panna records aur weekly chart understanding ke liye ek clear page."
  },
  {
    href: "/kalyan-matka-result",
    title: "Kalyan Matka Result",
    body: "Kalyan market result, timing aur chart details ek jagah dekho."
  },
  {
    href: "/main-bazar-result",
    title: "Main Bazar Result",
    body: "Main Bazar result, timing aur chart details ko ek alag page par dekho."
  },
  {
    href: "/rajdhani-night-result",
    title: "Rajdhani Night Result",
    body: "Rajdhani Night result, timing aur chart details clear format me dekho."
  },
  {
    href: "/game-rates",
    title: "Game Rates",
    body: "Single Digit se Full Sangam tak saare popular matka game rates ek jagah dekho."
  }
] as const;

const structuredData = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "Real Matka",
  url: "https://realmatka.in",
  description:
    "Real Matka provides game rates, live market results, jodi charts, panna charts, market timings, and secure access to the Real Matka web app.",
  publisher: {
    "@type": "Organization",
    name: "Real Matka",
    url: "https://realmatka.in",
    logo: "https://realmatka.in/app-icon.jpg"
  },
  inLanguage: "en-IN"
};

const homeFaqItems = [
  {
    question: "Real Matka par kya dekh sakte hain?",
    answer: "Yahan game rates, all market list, live result updates, jodi chart, panna chart aur APK download access dekh sakte ho."
  },
  {
    question: "Jodi Chart aur Panna Chart kahan milta hai?",
    answer: "Har market card ke niche Jodi Chart aur Panna Chart links diye gaye hain. Unpar click karke market-wise history open hoti hai."
  },
  {
    question: "Real Matka web aur APK dono available hain kya?",
    answer: "Haan, aap play web app use kar sakte ho aur download page se latest APK bhi le sakte ho."
  },
  {
    question: "Online satta matka kaise khele?",
    answer: "Online play ke liye register karo, login karo, market timing aur game rate check karo, phir web app ya Android APK se play access lo."
  },
  {
    question: "Game rate list kis section me hai?",
    answer: "Homepage ke Game Rate section me Single Digit se Full Sangam tak saare popular game rates diye gaye hain."
  }
] as const;

export default function HomePage() {
  const marketCatalog = getMarketCatalog();

  return (
    <div className="min-h-screen text-white">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <main className="mx-auto flex w-full max-w-[1620px] flex-col gap-6 px-3 py-6 sm:px-5 sm:py-8 xl:px-6">
        <section className="section-shell relative overflow-hidden px-5 py-8 sm:px-8 sm:py-10 xl:px-10 xl:py-12">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(249,115,22,0.2),transparent_25%),radial-gradient(circle_at_bottom_right,rgba(14,165,233,0.16),transparent_28%)]" />
          <div className="relative">
            <a
              href={telegramChannelUrl}
              target="_blank"
              rel="noreferrer"
              className="block overflow-hidden rounded-[24px] border border-white/10 bg-white/5 shadow-[0_20px_60px_-32px_rgba(14,165,233,0.35)] transition hover:border-sky-300/50 hover:bg-white/[0.06]"
            >
              <Image
                src="/realmatkabanner.jpg"
                alt="Join Real Matka Telegram Channel"
                width={1600}
                height={600}
                priority
                sizes="(max-width: 640px) 100vw, (max-width: 1280px) 92vw, 1600px"
                className="h-auto w-full object-cover"
              />
            </a>
            <div className="hero-actions-row mt-6">
              <a href="#rates" className="action-primary hero-action-button">Check Game Rate</a>
              <a href="/download" className="action-secondary hero-action-button">Download APK</a>
              <a href="/online-play-satta-matka" className="action-secondary hero-action-button">How To Play Online</a>
            </div>
          </div>
        </section>

        <section id="rates" className="section-shell px-4 py-6 sm:px-6 sm:py-8 xl:px-8">
          <div className="mb-5">
            <div className="text-2xl font-extrabold sm:text-3xl">Game Rate</div>
          </div>

          <div className="rates-grid-mobile grid grid-cols-2 gap-3 xl:grid-cols-4">
            {rates.map((rate) => (
              <div key={rate.name} className="glass-card rate-card p-4 sm:p-5">
                <div className="text-lg font-extrabold sm:text-xl">{rate.name}</div>
                <div className="mt-4 text-2xl font-extrabold text-orange-200">Rs {rate.rate}</div>
              </div>
            ))}
          </div>
        </section>

        <section id="games" className="section-shell px-4 py-6 sm:px-6 sm:py-8 xl:px-8">
          <div className="mb-5">
            <div className="text-sm font-semibold uppercase tracking-[0.22em] text-slate-400">Available Games</div>
            <h2 className="mt-2 text-2xl font-extrabold sm:text-3xl">Har popular game board ek hi place par</h2>
          </div>
          <div className="popular-games-grid-mobile grid grid-cols-3 gap-3 md:grid-cols-3 xl:grid-cols-5">
            {games.map((game) => (
              <div key={game} className="glass-card p-4 text-sm font-semibold text-slate-100">{game}</div>
            ))}
          </div>
        </section>

        <section id="markets" className="section-shell px-4 py-6 sm:px-6 sm:py-8 xl:px-8">
          <MarketsSection initialMarkets={marketCatalog} loginUrl={loginUrl} registerUrl={registerUrl} />
        </section>

        <section className="section-shell px-4 py-6 sm:px-6 sm:py-8 xl:px-8">
          <div className="mb-5">
            <div className="text-sm font-semibold uppercase tracking-[0.22em] text-slate-400">Explore More</div>
            <h2 className="mt-2 text-2xl font-extrabold sm:text-3xl">Popular pages aur quick links</h2>
            <p className="mt-3 max-w-4xl text-sm leading-7 text-slate-300 sm:text-base">
              Result, charts, game rates aur market-specific pages ko yahan se direct open kar sakte ho.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {seoPageLinks.map((item) => (
              <Link
                className="glass-card rounded-[28px] p-5 transition hover:border-orange-300/50 hover:bg-white/[0.06]"
                href={item.href}
                key={item.href}
              >
                <div className="text-lg font-extrabold text-slate-100">{item.title}</div>
                <p className="mt-3 text-sm leading-7 text-slate-300">{item.body}</p>
                <div className="mt-4 text-sm font-semibold text-orange-200">View Page</div>
              </Link>
            ))}
          </div>
        </section>

        <SeoFaq title="Real Matka FAQ" items={[...homeFaqItems]} />
      </main>
    </div>
  );
}
