import type { Metadata } from "next";
import type { ReactNode } from "react";
import localFont from "next/font/local";

import { motionCssVariables } from "@/lib/motion/tokens";
import { ThemeProvider } from "@/components/theme-provider";

import "./globals.css";

const inter = localFont({
  src: "./fonts/inter-latin.woff2",
  weight: "400 600",
  variable: "--font-inter",
  display: "swap",
  fallback: ["Arial", "Helvetica", "sans-serif"],
});
const jakarta = localFont({
  src: "./fonts/plus-jakarta-sans-latin.woff2",
  weight: "500",
  variable: "--font-jakarta",
  display: "swap",
  fallback: ["Arial", "Helvetica", "sans-serif"],
});

export const metadata: Metadata = {
  title: "GemuKore",
  description: "A home for your physical video game collection.",
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${jakarta.variable}`}
      suppressHydrationWarning
    >
      <body style={motionCssVariables}>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
