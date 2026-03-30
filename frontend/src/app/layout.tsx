import type { Metadata } from "next";
import "bulma/css/bulma.min.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "LPSim — LP Discovery",
  description: "Discover DeFi liquidity pool opportunities",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <section className="section">
          <div className="container is-fluid">{children}</div>
        </section>
      </body>
    </html>
  );
}
