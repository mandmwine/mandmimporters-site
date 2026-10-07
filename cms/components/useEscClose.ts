"use client";
import { useEffect } from "react";

// Attach a global Esc listener while `open` is true.  Call `close()` when it
// fires.  Clean up on unmount.
export function useEscClose(open: boolean, close: () => void): void {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        close();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);
}
