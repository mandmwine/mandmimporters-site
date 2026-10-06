"use client";
import { useEffect, useRef, useState } from "react";

export type WorkspaceSection = {
  id: string;
  label: string;
  state: "ok" | "missing" | "warn" | "info";
  hint?: string;
};

type Props = {
  sheetUrl: string;         // e.g. "/catalog-admin/sheet/<vintage-id>"
  version: string;          // vintage.updated_at ISO — bumps the iframe
  sections: WorkspaceSection[];
  completeness: { filled: number; total: number };
  vintageTabs: React.ReactNode;
  children: React.ReactNode;
};

// Three-column editor workspace:
//   left rail — jump-to section nav with filled/missing hints, scroll-spy
//                active-section highlight, completeness meter, vintage tabs
//   center    — the editable panels (passed as children, each with id=`sec-<n>`)
//   right     — sticky live preview iframe. Reloads automatically whenever the
//                server rerenders the page with a new `version` (the vintage's
//                updated_at timestamp), so saves show up without a manual refresh.
export default function WineWorkspace({
  sheetUrl,
  version,
  sections,
  completeness,
  vintageTabs,
  children,
}: Props) {
  const [previewOpen, setPreviewOpen] = useState<boolean>(true);
  const [previewScale, setPreviewScale] = useState<number>(0.52);
  const [activeId, setActiveId] = useState<string | null>(sections[0]?.id ?? null);
  const centerRef = useRef<HTMLDivElement | null>(null);

  // Persist layout choices per-user so moving between wines keeps the layout.
  useEffect(() => {
    try {
      const openRaw = localStorage.getItem("mm.workspace.previewOpen");
      const scaleRaw = localStorage.getItem("mm.workspace.previewScale");
      if (openRaw !== null) setPreviewOpen(openRaw === "1");
      if (scaleRaw) {
        const n = parseFloat(scaleRaw);
        if (Number.isFinite(n) && n > 0.2 && n <= 1) setPreviewScale(n);
      }
    } catch {}
  }, []);
  useEffect(() => {
    try { localStorage.setItem("mm.workspace.previewOpen", previewOpen ? "1" : "0"); } catch {}
  }, [previewOpen]);
  useEffect(() => {
    try { localStorage.setItem("mm.workspace.previewScale", String(previewScale)); } catch {}
  }, [previewScale]);

  // Scroll spy: whichever section anchor is nearest the top of the viewport
  // (after the sticky page header) is the active one in the left rail.
  useEffect(() => {
    if (sections.length === 0) return;
    const topOffset = 110; // allow for header
    const observed: HTMLElement[] = [];
    for (const s of sections) {
      const el = document.getElementById(`sec-${s.id}`);
      if (el) observed.push(el);
    }
    function onScroll() {
      let current = sections[0]?.id ?? null;
      for (const el of observed) {
        const rect = el.getBoundingClientRect();
        if (rect.top - topOffset <= 0) current = el.id.replace(/^sec-/, "");
      }
      setActiveId(current);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [sections]);

  function jump(id: string) {
    const el = document.getElementById(`sec-${id}`);
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY - 90;
    window.scrollTo({ top, behavior: "smooth" });
    setActiveId(id);
  }

  const iframeSrc = `${sheetUrl}?v=${encodeURIComponent(version)}&embed=1`;
  const pct = completeness.total > 0
    ? Math.round((completeness.filled / completeness.total) * 100)
    : 0;

  return (
    <div className={`workspace ${previewOpen ? "" : "workspace--no-preview"}`}>
      <aside className="workspace__rail">
        <div className="rail-progress">
          <div className="rail-progress__bar"><span style={{ width: `${pct}%` }} /></div>
          <div className="small muted">
            {completeness.filled} of {completeness.total} complete
          </div>
        </div>

        <nav className="rail-nav" aria-label="Edit sections">
          {sections.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`rail-nav__item rail-nav__item--${s.state} ${activeId === s.id ? "active" : ""}`}
              onClick={() => jump(s.id)}
              title={s.hint}
            >
              <span className="rail-nav__dot" aria-hidden />
              <span className="rail-nav__label">{s.label}</span>
              {s.hint && <span className="rail-nav__hint small muted">{s.hint}</span>}
            </button>
          ))}
        </nav>

        <div className="rail-vintages">
          <div className="small muted" style={{ marginBottom: 6 }}>Vintages</div>
          {vintageTabs}
        </div>
      </aside>

      <div className="workspace__main" ref={centerRef}>
        {children}
      </div>

      <aside className={`workspace__preview ${previewOpen ? "" : "workspace__preview--closed"}`}>
        <div className="preview-head">
          <strong>Live preview</strong>
          <div className="preview-head__right">
            <button
              type="button"
              className="link small"
              onClick={() => setPreviewScale((s) => Math.max(0.3, +(s - 0.08).toFixed(2)))}
              aria-label="Zoom out"
            >
              −
            </button>
            <span className="small muted">{Math.round(previewScale * 100)}%</span>
            <button
              type="button"
              className="link small"
              onClick={() => setPreviewScale((s) => Math.min(1, +(s + 0.08).toFixed(2)))}
              aria-label="Zoom in"
            >
              +
            </button>
            <button
              type="button"
              className="link small"
              onClick={() => setPreviewOpen(false)}
              aria-label="Hide preview"
            >
              Hide
            </button>
          </div>
        </div>
        <div className="preview-frame">
          <div
            className="preview-frame__scale"
            style={{ transform: `scale(${previewScale})` }}
          >
            <iframe
              src={iframeSrc}
              title="Sheet preview"
              loading="lazy"
            />
          </div>
        </div>
      </aside>

      {!previewOpen && (
        <button
          type="button"
          className="preview-reopen"
          onClick={() => setPreviewOpen(true)}
          aria-label="Show preview"
        >
          Show preview
        </button>
      )}
    </div>
  );
}
