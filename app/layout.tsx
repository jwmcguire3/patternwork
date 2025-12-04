// app/layout.tsx
import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Patternwork",
  description:
    "Patternwork is a method for understanding the patterns that shape your states, reactions, and identity — and learning how to work with them.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        {/* NAVBAR (global) */}
        <nav className="navbar">
          <div className="container navbar-inner">
            <Link href="/" className="nav-brand">Patternwork</Link>
            <div className="nav-links">
              <Link href="/#what">What it does</Link>
              <Link href="/method">Method</Link>
              <Link href="/assessment">Assessment</Link>
              <Link href="/companion">Companion</Link>
            </div>
          </div>
        </nav>

        {/* PAGE CONTENT */}
        {children}

        {/* FOOTER (global) */}
        <footer>
          <div className="container">
            <p>
              <strong>Patternwork</strong>
            </p>
            <p className="muted">Patterns form us. Patternwork reshapes them.</p>
          </div>
        </footer>
      </body>
    </html>
  );
}

