"use client";
import { useEffect, useState } from "react";
import { useEscClose } from "./useEscClose";

type Row = { keys: string[]; what: string };

const SHORTCUTS: { group: string; rows: Row[] }[] = [
  {
    group: "Global",
    rows: [
      { keys: ["?"], what: "Open this shortcut sheet" },
      { keys: ["⌘K", "Ctrl+K", "/"], what: "Open the command palette" },
      { keys: ["Esc"], what: "Close any dialog or edit panel" },
    ],
  },
  {
    group: "Editing",
    rows: [
      { keys: ["⌘S", "Ctrl+S"], what: "Save the panel in focus" },
      { keys: ["Enter"], what: "Submit a short form" },
      { keys: ["Esc"], what: "Cancel an inline form" },
    ],
  },
  {
    group: "Lists",
    rows: [
      { keys: ["Click row"], what: "Open the record (except on controls)" },
      { keys: ["Click column"], what: "Sort by that column, click again to flip, third to clear" },
      { keys: ["Shift+Click"], what: "Select a range of rows between two clicks" },
      { keys: ["J", "↓"], what: "Focus the next row" },
      { keys: ["K", "↑"], what: "Focus the previous row" },
      { keys: ["Enter"], what: "Open the focused row" },
    ],
  },
  {
    group: "Palette",
    rows: [
      { keys: ["↑ ↓"], what: "Move between results" },
      { keys: ["Enter"], what: "Open the highlighted result" },
    ],
  },
];

export default function ShortcutHelp() {
  const [open, setOpen] = useState(false);
  useEscClose(open, () => setOpen(false));

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const inField = (() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el) return false;
        return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable;
      })();
      // ? is Shift+/ on US keyboards; the key value is "?"
      if (e.key === "?" && !inField) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!open) return null;
  return (
    <div className="shortcut-help" onClick={() => setOpen(false)}>
      <div className="shortcut-help__dialog" onClick={(e) => e.stopPropagation()}>
        <div className="shortcut-help__head">
          <h2>Keyboard shortcuts</h2>
          <button type="button" className="link small" onClick={() => setOpen(false)}>Close</button>
        </div>
        <div className="shortcut-help__body">
          {SHORTCUTS.map((g) => (
            <section key={g.group}>
              <h3>{g.group}</h3>
              <table>
                <tbody>
                  {g.rows.map((r, i) => (
                    <tr key={i}>
                      <td className="shortcut-help__keys">
                        {r.keys.map((k, j) => (
                          <span key={j}>
                            {j > 0 && <span className="muted small"> or </span>}
                            <kbd>{k}</kbd>
                          </span>
                        ))}
                      </td>
                      <td>{r.what}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
