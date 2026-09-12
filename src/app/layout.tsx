import type { Metadata, Viewport } from "next";
import { Nunito } from "next/font/google";
import { siteDescription, siteName, siteUrl } from "@/lib/seo/site";
import { ServiceWorkerRegistrar } from "@/components/pwa/service-worker-registrar";
import "./globals.css";
// KaTeX markup is unreadable without its stylesheet -- fractions collapse onto
// one line and radicals lose their bar. The dependency was already installed
// and used by formula flashcards, but the CSS had never been imported
// anywhere, so every formula in the app was rendering unstyled.
import "katex/dist/katex.min.css";

const nunito = Nunito({
  subsets: ["latin"],
  variable: "--font-nunito",
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "PrepWell NG — Ace Your WAEC, JAMB & NECO",
    template: "%s | PrepWell NG",
  },
  description: siteDescription,
  applicationName: siteName,
  keywords: [
    "WAEC", "JAMB", "NECO", "past questions", "Nigeria education",
    "secondary school", "SS1", "SS2", "SS3", "UTME", "CBT practice",
  ],
  openGraph: {
    type: "website",
    siteName,
    locale: "en_NG",
    url: siteUrl,
  },
  twitter: { card: "summary_large_image" },
};

// themeColor must live here, not in `metadata` — the metadata key has been
// deprecated since Next.js 14 and is ignored.
//
// The media-array form, because globals.css defines a full dark palette keyed
// on data-theme: a single #ffffff paints a white status bar and title bar
// around a #070d1f app on every dark-mode device. Values are the light and
// dark --app-background tokens verbatim.
export function generateViewport(): Viewport {
  return {
    width: "device-width",
    initialScale: 1,
    themeColor: [
      { media: "(prefers-color-scheme: light)", color: "#f8fafc" },
      { media: "(prefers-color-scheme: dark)", color: "#070d1f" },
    ],
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${nunito.variable} h-full`}>
      <body className="h-full">
        {children}
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
