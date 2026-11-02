import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Poster render",
  // This service is reachable only inside the compose network, but say it
  // anyway in case it is ever exposed by accident.
  robots: { index: false, follow: false },
};

/**
 * Deliberately bare. No navigation, no auth, no providers.
 *
 * Playwright fetches a URL here and screenshots what comes back. Anything that
 * could redirect, gate, or defer paint is a way for a render to silently become
 * a picture of a login page.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
