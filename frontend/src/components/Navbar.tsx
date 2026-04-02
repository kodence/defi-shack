"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Navbar() {
  const pathname = usePathname();

  return (
    <nav className="navbar is-dark" role="navigation" aria-label="main navigation">
      <div className="navbar-brand">
        <Link className="navbar-item has-text-weight-bold" href="/">
          LPSim
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
        </div>
      </div>
    </nav>
  );
}
