"use client";
// Phase C — plain-language navigation.
//
// Audit section 24: ordinary office users should see only the five everyday
// destinations in the main nav. The rest (Producers, Dropbox connection,
// Data imports, Maps, Theme, Users) stay reachable from a "Settings" group
// at the bottom of the sidebar instead of competing with the daily workflow.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

type Item = { href: string; label: string };

const EVERYDAY: Item[] = [
  { href: "/", label: "Home" },
  { href: "/wines", label: "Wines" },
  { href: "/catalogs", label: "Catalogs" },
  { href: "/assets", label: "Images" },
  { href: "/review", label: "Review" },
];

const ADVANCED: Item[] = [
  { href: "/producers", label: "Producers" },
  { href: "/dropbox", label: "Dropbox" },
  { href: "/data", label: "Data" },
  { href: "/maps", label: "Maps" },
  { href: "/theme", label: "Theme" },
  // Phase 31 — UX acceptance tests (audit §44). Hidden under Settings so
  // it doesn't crowd the everyday nav; the people running the tests
  // typically open it once per build.
  { href: "/tests", label: "UX tests" },
  // Phase 33 (Sprint 1) — operational panels.
  { href: "/settings/environment", label: "Environment" },
  { href: "/settings/backups", label: "Backups" },
  // Phase 34 (Sprint 1) — captured errors + overall roll-up.
  { href: "/settings/system", label: "System" },
];

export default function Nav({ isAdmin }: { isAdmin: boolean }) {
  const path = usePathname();
  // Open the Settings group when the user is already on one of its pages, or
  // when they've opened it manually before.
  const onAdvanced = ADVANCED.some((i) => i.href === "/" ? path === "/" : path.startsWith(i.href));
  const [open, setOpen] = useState<boolean>(onAdvanced);

  const advancedWithUsers = isAdmin ? [...ADVANCED, { href: "/users", label: "Users" }] : ADVANCED;

  function activeClass(i: Item) {
    const active = i.href === "/" ? path === "/" : path.startsWith(i.href);
    return active ? "active" : undefined;
  }

  return (
    <>
      <nav className="nav" aria-label="Main navigation">
        {EVERYDAY.map((i) => (
          <Link key={i.href} href={i.href} className={activeClass(i)}>
            {i.label}
          </Link>
        ))}
      </nav>

      <div className="nav-advanced">
        <button
          type="button"
          className={`nav-advanced__toggle ${open ? "open" : ""}`}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <span>Settings</span>
          <span className="nav-advanced__chev" aria-hidden="true">{open ? "–" : "+"}</span>
        </button>
        {open && (
          <nav className="nav nav--advanced" aria-label="Settings">
            {advancedWithUsers.map((i) => (
              <Link key={i.href} href={i.href} className={activeClass(i)}>
                {i.label}
              </Link>
            ))}
          </nav>
        )}
      </div>
    </>
  );
}
