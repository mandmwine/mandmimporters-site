"use client";
import { useEffect, useState } from "react";

type Mode = "auto" | "light" | "dark";

// Three-state theme toggle: Auto → Light → Dark → Auto.
// Stores the chosen mode in localStorage and sets data-theme on <html>.
// CSS vars in globals.css flip when data-theme="dark" or when
// prefers-color-scheme matches and mode is "auto".
export default function ThemeToggle() {
  const [mode, setMode] = useState<Mode>("auto");

  useEffect(() => {
    const stored = (() => {
      try { return (localStorage.getItem("mm.theme") as Mode) || "auto"; } catch { return "auto"; }
    })();
    setMode(stored);
    applyMode(stored);
  }, []);

  function cycle() {
    const next: Mode = mode === "auto" ? "light" : mode === "light" ? "dark" : "auto";
    setMode(next);
    try { localStorage.setItem("mm.theme", next); } catch {}
    applyMode(next);
  }

  function applyMode(m: Mode) {
    const el = document.documentElement;
    if (m === "auto") el.removeAttribute("data-theme");
    else el.setAttribute("data-theme", m);
  }

  const label = mode === "auto" ? "Theme: Auto" : mode === "light" ? "Theme: Light" : "Theme: Dark";
  const icon = mode === "auto" ? "◐" : mode === "light" ? "○" : "●";
  return (
    <button
      type="button"
      className="theme-toggle link small"
      onClick={cycle}
      aria-label={`${label} — click to cycle`}
      title={label}
    >
      <span aria-hidden>{icon}</span> {mode === "auto" ? "Auto" : mode === "light" ? "Light" : "Dark"}
    </button>
  );
}
