"use client";
import { createContext, useContext, useEffect, useMemo, useState } from "react";

type Entry = { id: string; label: string; producer?: string };
type Ctx = {
  selected: Entry[];
  toggle(e: Entry): void;
  clear(): void;
  has(id: string): boolean;
  count: number;
};

const SelectionCtx = createContext<Ctx | null>(null);
const KEY = "mm-catalog:selected-wines";

export function SelectionProvider({ children }: { children: React.ReactNode }) {
  const [selected, setSelected] = useState<Entry[]>([]);
  const [hydrated, setHydrated] = useState(false);

  // Load once from localStorage; try/catch for private windows.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setSelected(parsed as Entry[]);
      }
    } catch {}
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(selected));
    } catch {}
  }, [selected, hydrated]);

  const api = useMemo<Ctx>(
    () => ({
      selected,
      toggle(e) {
        setSelected((prev) =>
          prev.some((x) => x.id === e.id) ? prev.filter((x) => x.id !== e.id) : [...prev, e],
        );
      },
      clear() {
        setSelected([]);
      },
      has(id) {
        return selected.some((x) => x.id === id);
      },
      count: selected.length,
    }),
    [selected],
  );

  return <SelectionCtx.Provider value={api}>{children}</SelectionCtx.Provider>;
}

export function useSelection(): Ctx {
  const v = useContext(SelectionCtx);
  if (!v) throw new Error("useSelection must be used inside <SelectionProvider>");
  return v;
}
