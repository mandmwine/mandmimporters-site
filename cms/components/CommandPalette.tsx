"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Item = {
  id: string;
  title: string;
  subtitle?: string;
  href: string;
  group: string;
};

const STATIC_ITEMS: Item[] = [
  { id: "nav-dash", title: "Dashboard", href: "/", group: "Navigate" },
  { id: "nav-wines", title: "Wines", href: "/wines", group: "Navigate" },
  { id: "nav-catalogs", title: "Catalogs", href: "/catalogs", group: "Navigate" },
  { id: "nav-producers", title: "Producers", href: "/producers", group: "Navigate" },
  { id: "nav-assets", title: "Assets", href: "/assets", group: "Navigate" },
  { id: "nav-maps", title: "Maps", href: "/maps", group: "Navigate" },
  { id: "nav-theme", title: "Theme", href: "/theme", group: "Navigate" },
  { id: "nav-review", title: "Review queue", href: "/review", group: "Navigate" },
  { id: "jump-missing-vintage", title: "Wines missing vintage", href: "/wines?missing=vintage", group: "Jump to" },
  { id: "jump-missing-bottle", title: "Wines missing bottle image", href: "/wines?missing=bottle", group: "Jump to" },
  { id: "jump-missing-tasting", title: "Wines missing tasting note", href: "/wines?missing=tasting", group: "Jump to" },
  { id: "jump-needs-map", title: "Locations needing a map", href: "/maps?status=needs_map", group: "Jump to" },
  { id: "jump-unused-assets", title: "Unused assets", href: "/assets?filter=unused", group: "Jump to" },
];

type SearchHit = { id: string; vintage_id: string; label: string; sub: string; kind: "wine" | "producer" };

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const router = useRouter();

  // Open with Cmd/Ctrl+K or "/" (unless already in an input).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const inField = (() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el) return false;
        return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable;
      })();
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
      } else if (e.key === "/" && !inField && !open) {
        e.preventDefault();
        setOpen(true);
      } else if (e.key === "Escape" && open) {
        e.preventDefault();
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 10);
    if (!open) { setQ(""); setHits([]); setCursor(0); }
  }, [open]);

  // Server-side quick search for wines + producers, debounced.
  useEffect(() => {
    if (!open) return;
    const term = q.trim();
    if (!term) { setHits([]); return; }
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/catalog-admin/api/search?q=${encodeURIComponent(term)}`);
        if (!res.ok) return;
        const body = (await res.json()) as { hits: SearchHit[] };
        setHits(body.hits ?? []);
        setCursor(0);
      } catch { /* ignore */ }
    }, 180);
    return () => clearTimeout(t);
  }, [q, open]);

  const trimmed = q.trim().toLowerCase();
  const filteredStatic = trimmed
    ? STATIC_ITEMS.filter((i) =>
        i.title.toLowerCase().includes(trimmed) || i.group.toLowerCase().includes(trimmed))
    : STATIC_ITEMS;

  const allItems: Item[] = [
    ...hits.map((h) => ({
      id: h.id,
      title: h.label,
      subtitle: h.sub,
      href: h.kind === "wine" ? `/wines/${h.vintage_id}` : `/producers/${h.vintage_id}`,
      group: h.kind === "wine" ? "Wines" : "Producers",
    })),
    ...filteredStatic,
  ];

  function pick(item: Item) {
    setOpen(false);
    // next/navigation router.push applies basePath automatically.
    router.push(item.href);
  }

  function onKeyNav(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => Math.min(c + 1, allItems.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => Math.max(c - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = allItems[cursor];
      if (item) pick(item);
    }
  }

  if (!open) return null;

  // Group items for display.
  const groups = new Map<string, { item: Item; idx: number }[]>();
  allItems.forEach((item, idx) => {
    const list = groups.get(item.group) ?? [];
    list.push({ item, idx });
    groups.set(item.group, list);
  });

  return (
    <div className="cmd-palette" onClick={() => setOpen(false)}>
      <div className="cmd-palette__dialog" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="cmd-palette__input"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKeyNav}
          placeholder="Jump to anything — wines, producers, pages…"
          aria-label="Command palette"
        />
        <div className="cmd-palette__results">
          {allItems.length === 0 && (
            <p className="muted small cmd-palette__empty">No matches.</p>
          )}
          {[...groups.entries()].map(([group, items]) => (
            <div key={group} className="cmd-palette__group">
              <div className="cmd-palette__group-label">{group}</div>
              {items.map(({ item, idx }) => (
                <button
                  key={item.id}
                  type="button"
                  className={`cmd-palette__item${idx === cursor ? " active" : ""}`}
                  onClick={() => pick(item)}
                  onMouseEnter={() => setCursor(idx)}
                >
                  <span className="cmd-palette__item-title">{item.title}</span>
                  {item.subtitle && <span className="cmd-palette__item-sub muted small">{item.subtitle}</span>}
                </button>
              ))}
            </div>
          ))}
        </div>
        <div className="cmd-palette__footer small muted">
          ↑↓ to move · Enter to open · Esc to close
        </div>
      </div>
    </div>
  );
}
