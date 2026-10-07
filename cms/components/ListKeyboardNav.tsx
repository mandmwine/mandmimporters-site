"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

type Props = {
  rowSelector: string;   // CSS selector that matches each row (e.g. "tbody tr.row-clickable")
  newHref?: string;      // where "N" takes you (e.g. "/catalogs")
};

// Enables J / K (or ↑ / ↓) row navigation on a list, plus optional "N" for new.
// Finds rows via the given CSS selector. The focused row gets .list-focus and
// Enter opens it (ClickableRow already handles Enter natively; we just steal
// focus to it).
export default function ListKeyboardNav({ rowSelector, newHref }: Props) {
  const router = useRouter();
  useEffect(() => {
    function rows(): HTMLElement[] {
      return Array.from(document.querySelectorAll<HTMLElement>(rowSelector));
    }
    function focusedIndex(rs: HTMLElement[]): number {
      const el = document.activeElement as HTMLElement | null;
      if (!el) return -1;
      const i = rs.findIndex((r) => r === el || r.contains(el));
      return i;
    }
    function onKey(e: KeyboardEvent) {
      const el = document.activeElement as HTMLElement | null;
      const inField = el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
      if (inField) return;
      const rs = rows();
      if (rs.length === 0) return;

      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        const i = focusedIndex(rs);
        const next = rs[Math.min(rs.length - 1, (i < 0 ? 0 : i + 1))];
        next.focus();
        next.scrollIntoView({ block: "nearest" });
      } else if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        const i = focusedIndex(rs);
        const prev = rs[Math.max(0, (i < 0 ? 0 : i - 1))];
        prev.focus();
        prev.scrollIntoView({ block: "nearest" });
      } else if (e.key === "n" && newHref) {
        // Only trigger plain "n" (no modifier); Cmd+N is browser-new-window.
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        e.preventDefault();
        router.push(newHref);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [rowSelector, newHref, router]);
  return null;
}
