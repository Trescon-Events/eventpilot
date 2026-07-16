import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";
import ReviewWidget from "@/app/components/ReviewWidget";
import RealtimeNotifications from "@/app/components/RealtimeNotifications";
import AuthedShellGate from "@/app/components/AuthedShellGate";

const manrope = Manrope({ subsets: ["latin"], variable: "--font-manrope", display: "swap" });

export const metadata: Metadata = {
  // Resolves relative og:image/twitter:image URLs below. Missing this was
  // the recurring "1 Issue" Next.js dev-tools warning on every page — not
  // hideable via devIndicators (Next always surfaces real build/runtime
  // issues regardless of that setting), so fixed at the source instead.
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: "EventPilot",
  description: "AI-Powered event management platform for Trescon.",
  icons: {
    icon: [
      { url: "/favicon.png",     sizes: "32x32",   type: "image/png" },
      { url: "/favicon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    title:       "EventPilot",
    description: "AI-Powered event management platform for Trescon.",
    siteName:    "EventPilot",
    images: [{ url: "/og-image.png", width: 1024, height: 600 }],
    type: "website",
  },
  twitter: {
    card:        "summary_large_image",
    title:       "EventPilot",
    description: "AI-Powered event management platform for Trescon.",
    images:      ["/og-image.png"],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${manrope.variable} h-full antialiased`}>
      <body className="min-h-full">
        <AuthedShellGate>{children}</AuthedShellGate>
        <ReviewWidget />
        <RealtimeNotifications />
      </body>
    </html>
  );
}
