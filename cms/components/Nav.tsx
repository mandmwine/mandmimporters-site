"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/", label: "Dashboard" },
  { href: "/wines", label: "Wines" },
  { href: "/catalogs", label: "Catalogs" },
  { href: "/producers", label: "Producers" },
  { href: "/assets", label: "Assets" },
  { href: "/dropbox", label: "Dropbox" },
  { href: "/data", label: "Data" },
  { href: "/maps", label: "Maps" },
  { href: "/theme", label: "Theme" },
  { href: "/review", label: "Review queue" },
];

export default function Nav({ isAdmin }: { isAdmin: boolean }) {
  const path = usePathname();
  const items = isAdmin ? [...ITEMS, { href: "/users", label: "Users" }] : ITEMS;
  return (
    <nav className="nav">
      {items.map((i) => {
        const active = i.href === "/" ? path === "/" : path.startsWith(i.href);
        return (
          <Link key={i.href} href={i.href} className={active ? "active" : undefined}>
            {i.label}
          </Link>
        );
      })}
    </nav>
  );
}
