import type { MetadataRoute } from "next";

const siteUrl = "https://novabytetech.in";

const routes = [
  "",
  "/about",
  "/portfolio",
  "/products/picstur",
  "/pricing",
  "/login",
  "/account",
  "/account/add-fund",
  "/billing",
  "/checkout",
  "/pay",
  "/contact",
  "/industries",
  "/tech-stack",
  "/case-studies",
  "/support-plans",
  "/faq",
  "/careers",
  "/company-registration",
  "/privacy",
  "/terms",
  "/refund-policy",
  "/delivery-policy"
];

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  return routes.map((route) => ({
    url: `${siteUrl}${route}`,
    lastModified,
    changeFrequency: route === "" ? "weekly" : "monthly",
    priority: route === "" ? 1 : 0.75
  }));
}
