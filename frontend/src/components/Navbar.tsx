"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Navbar() {
  const pathname = usePathname();

  return (
    <nav className="navbar is-dark" role="navigation" aria-label="main navigation">
      <div className="navbar-brand">
        <Link className="navbar-item has-text-weight-bold" href="/">
          DeFi Shack
        </Link>
      </div>
      <div className="navbar-menu is-active">
        <div className="navbar-start">
          <Link
            className={`navbar-item${pathname === "/" ? " is-active has-text-weight-semibold" : ""}`}
            href="/"
          >
            Discovery
          </Link>
          <Link
            className={`navbar-item${pathname === "/simulator" ? " is-active has-text-weight-semibold" : ""}`}
            href="/simulator"
          >
            Simulator
          </Link>
          <Link
            className={`navbar-item${pathname === "/portfolio" ? " is-active has-text-weight-semibold" : ""}`}
            href="/portfolio"
          >
            Portfolio
          </Link>
          <Link
            className={`navbar-item${pathname === "/track" ? " is-active has-text-weight-semibold" : ""}`}
            href="/track"
          >
            Track
          </Link>
        </div>
        <div className="navbar-end">
          {/* Static file in public/, so a plain anchor — not the Next router.
              Opens in a new tab to preserve simulator state while you read. */}
          <a
            className="navbar-item"
            href="/user-guide.html"
            target="_blank"
            rel="noopener noreferrer"
            title="Open the DeFi Shack field guide in a new tab"
          >
            Guide <span aria-hidden="true" style={{ marginLeft: "0.3em", opacity: 0.7 }}>&#8599;</span>
          </a>
        </div>
      </div>
    </nav>
  );
}
