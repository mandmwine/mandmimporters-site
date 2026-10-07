"use client";
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";

type Entry = { id: string; label: string; producer?: string };
type Ctx = {
  selected: Entry[];
  toggle(e: Entry): void;
  addMany(es: Entry[]): void;
  removeMany(ids: string[]): void;
  clear(): void;
  has(id: string): boolean;
  count: number;
  // Shift-click helper: remembers the last toggled row index per page so a
  // subsequent shift-click can select the range in between.
  recordLastIndex(index: number): void;
  getLastIndex(): number | null;
};

const SelectionCtx = createContext<Ctx | null>(null);
const KEY = "mm-catalog:selected-wines";

export function SelectionProvider({ children }: { children: React.ReactNode }) {
  const [selected, setSelected] = useState<Entry[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const lastIndex = useRef<number | null>(null);

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
      addMany(es) {
        setSelected((prev) => {
          const have = new Set(prev.map((x) => x.id));
          return [...prev, ...es.filter((e) => !have.has(e.id))];
        });
      },
      removeMany(ids) {
        const kill = new Set(ids);
        setSelected((prev) => prev.filter((x) => !kill.has(x.id)));
      },
      clear() {
        setSelected([]);
        lastIndex.current = null;
      },
      has(id) {
        return selected.some((x) => x.id === id);
      },
      count: selected.length,
      recordLastIndex(i) { lastIndex.current = i; },
      getLastIndex() { return lastIndex.current; },
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
