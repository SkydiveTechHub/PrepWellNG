import type { Metadata } from "next";
import { Nunito } from "next/font/google";
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
  title: "PrepWell NG — Ace Your WAEC, JAMB & NECO",
  description:
    "Nigeria's learning platform for secondary school students. Structured lessons, past questions, mock exams, and performance tracking for WAEC, JAMB UTME, and NECO.",
  keywords: [
    "WAEC", "JAMB", "NECO", "past questions", "Nigeria education",
    "secondary school", "SS1", "SS2", "SS3", "UTME", "CBT practice",
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${nunito.variable} h-full`}>
      <body className="h-full">{children}</body>
    </html>
  );
}
