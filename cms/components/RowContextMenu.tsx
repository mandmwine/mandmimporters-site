"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export type MenuAction = {
  label: string;
  onPick: () => void;
  danger?: boolean;
};

// Lightweight right-click menu for list rows. Wrap your row with this via a
// render-prop; call `openAt(e)` from the row's onContextMenu.
export default function useRowContextMenu(actions: MenuAction[]): {
  openAt: (e: React.MouseEvent) => void;
  Menu: () => React.ReactNode;
} {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!pos) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setPos(null);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setPos(null);
    }
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [pos]);

  function openAt(e: React.MouseEvent) {
    e.preventDefault();
    // Clamp so the menu stays onscreen.
    const x = Math.min(e.clientX, window.innerWidth - 220);
    const y = Math.min(e.clientY, window.innerHeight - actions.length * 36 - 20);
    setPos({ x, y });
  }

  function Menu() {
    if (!pos) return null;
    return (
      <div
        ref={ref}
        className="row-menu"
        style={{ left: pos.x, top: pos.y }}
        role="menu"
      >
        {actions.map((a) => (
          <button
            key={a.label}
            type="button"
            role="menuitem"
            className={`row-menu__item${a.danger ? " row-menu__item--danger" : ""}`}
            onClick={() => { a.onPick(); setPos(null); }}
          >
            {a.label}
          </button>
        ))}
      </div>
    );
  }

  return { openAt, Menu };
}

// Simple drop-in wrapper for the wines list — adds "Open in new tab", "Copy
// link", "Export CSV (this row)" to each row. Used by the client-side
// WineRowMenu wrapper below.
export function WineRowMenu({ vintageId }: { vintageId: string }) {
  const router = useRouter();
  const basePath = typeof window !== "undefined" ? window.location.origin : "";
  const { openAt, Menu } = useRowContextMenu([
    {
      label: "Open",
      onPick: () => router.push(`/wines/${vintageId}`),
    },
    {
      label: "Open in new tab",
      onPick: () => window.open(`/catalog-admin/wines/${vintageId}`, "_blank", "noopener,noreferrer"),
    },
    {
      label: "Copy link",
      onPick: () => {
        navigator.clipboard?.writeText(`${basePath}/catalog-admin/wines/${vintageId}`).catch(() => {});
      },
    },
    {
      label: "Export this row as CSV",
      onPick: () => {
        window.location.href = `/catalog-admin/api/wines/export?ids=${vintageId}`;
      },
    },
  ]);

  return (
    <>
      <span
        className="row-menu-target"
        onContextMenu={openAt}
        aria-label="Row actions"
        title="Right-click for row actions"
      />
      <Menu />
    </>
  );
}
