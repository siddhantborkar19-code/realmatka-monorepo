import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://novabytetech.in"),
  title: {
    default: "NovaByte Technologies | Software, Web, App & Digital Services",
    template: "%s | NovaByte Technologies"
  },
  description:
    "NovaByte Technologies provides software development, website development, mobile app development, cloud support, digital operations, and IT enabled services.",
  keywords: [
    "NovaByte Technologies",
    "software development India",
    "website development",
    "mobile app development",
    "digital services",
    "IT services",
    "cloud support"
  ],
  openGraph: {
    type: "website",
    url: "https://novabytetech.in",
    siteName: "NovaByte Technologies",
    title: "NovaByte Technologies | Software, Web, App & Digital Services",
    description:
      "Software development, websites, mobile applications, cloud support, digital operations, and IT enabled services.",
    images: [
      {
        url: "/og-image.svg",
        width: 1200,
        height: 630,
        alt: "NovaByte Technologies"
      }
    ]
  },
  twitter: {
    card: "summary_large_image",
    title: "NovaByte Technologies | Software, Web, App & Digital Services",
    description:
      "Software development, websites, mobile applications, cloud support, digital operations, and IT enabled services.",
    images: ["/og-image.svg"]
  },
  icons: {
    icon: "/icon.svg",
    shortcut: "/icon.svg",
    apple: "/apple-icon.svg"
  },
  robots: {
    index: true,
    follow: true
  }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN">
      <body>{children}</body>
    </html>
  );
}
