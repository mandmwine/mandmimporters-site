"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";

export type UndoHandle = {
  show: (message: string, undo: () => Promise<void> | void, ttlMs?: number) => void;
};

type Toast = {
  id: number;
  message: string;
  undo: () => Promise<void> | void;
  dismissAt: number;
};

const UndoCtx = createContext<UndoHandle | null>(null);

export function useUndo(): UndoHandle {
  const ctx = useContext(UndoCtx);
  if (!ctx) {
    // No provider mounted — give a safe no-op so callers don't crash in tests.
    return { show: () => {} };
  }
  return ctx;
}

// Call `useUndo().show("Removed Chianti", async () => reinsert())` and the
// caller gets a toast with an Undo button for 8s. Clicking Undo runs the
// supplied closure, which should restore whatever was deleted.
export default function UndoToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [tick, setTick] = useState(0);

  const show = useCallback<UndoHandle["show"]>((message, undo, ttlMs = 8000) => {
    const id = Date.now() + Math.random();
    setToasts((cur) => [...cur, { id, message, undo, dismissAt: Date.now() + ttlMs }]);
  }, []);

  // Expire toasts once per second.
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 500);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    setToasts((cur) => cur.filter((t) => t.dismissAt > Date.now()));
  }, [tick]);

  async function doUndo(t: Toast) {
    setToasts((cur) => cur.filter((x) => x.id !== t.id));
    try {
      await t.undo();
    } catch (err) {
      console.error("undo failed", err);
    }
  }

  return (
    <UndoCtx.Provider value={{ show }}>
      {children}
      {toasts.length > 0 && (
        <div className="undo-toasts" role="status" aria-live="polite">
          {toasts.map((t) => {
            const secs = Math.max(1, Math.ceil((t.dismissAt - Date.now()) / 1000));
            return (
              <div key={t.id} className="undo-toast">
                <span>{t.message}</span>
                <button
                  type="button"
                  className="undo-toast__button"
                  onClick={() => void doUndo(t)}
                >
                  Undo <span className="muted small">· {secs}s</span>
                </button>
                <button
                  type="button"
                  className="undo-toast__close"
                  aria-label="Dismiss"
                  onClick={() =>
                    setToasts((cur) => cur.filter((x) => x.id !== t.id))
                  }
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      )}
    </UndoCtx.Provider>
  );
}
