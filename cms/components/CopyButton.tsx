"use client";
import { useState } from "react";

export default function CopyButton({
  value,
  label = "Copy",
  compact = false,
}: {
  value: string;
  label?: string;
  compact?: boolean;
}) {
  const [done, setDone] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setDone(true);
      setTimeout(() => setDone(false), 1200);
    } catch {
      // Fall back to a prompt in the (rare) case clipboard isn't permitted.
      window.prompt("Copy:", value);
    }
  }
  return (
    <button
      type="button"
      className={`copy-btn${compact ? " copy-btn--compact" : ""}`}
      onClick={copy}
      title={done ? "Copied" : `Copy ${label.toLowerCase()}`}
    >
      {done ? "✓ Copied" : label}
    </button>
  );
}
