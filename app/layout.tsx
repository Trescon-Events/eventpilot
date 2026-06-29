import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";
import ReviewWidget from "@/app/components/ReviewWidget";
import RealtimeNotifications from "@/app/components/RealtimeNotifications";

const manrope = Manrope({ subsets: ["latin"], variable: "--font-manrope", display: "swap" });

export const metadata: Metadata = {
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
        {children}
        <ReviewWidget />
        <RealtimeNotifications />
      </body>
    </html>
  );
}
