import type { Metadata } from "next";
import "./globals.css";
import { site } from "@/lib/site";
import { Providers } from "@/components/Providers";

export const metadata: Metadata = {
  title: `${site.name} (${site.ticker}) — ${site.tagline}`,
  description:
    "Drip is a fair-launch token on Robinhood Chain. Run a mining node, earn hash rate from your holdings, tasks and referrals, and claim rewards in tokenized stock.",
  openGraph: {
    title: `${site.name} (${site.ticker})`,
    description: site.tagline,
    type: "website",
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
