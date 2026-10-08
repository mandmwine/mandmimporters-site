"use client";
// Phase C — plain-language editor workspace.
//
// Changes vs the previous build (audit sections 18, 21, 22):
//   • Progress text is contextual ("Almost ready — add a bottle image.") instead
//     of "5 of 7 complete". The caller passes a precomputed status + next-step.
//   • Preview defaults to Fit Page. The old −/52%/+ zoom row is replaced by a
//     single "Fit Page" chip and an overflow menu (Actual / 75% / 100% / Hide).
//   • The scale is computed from the actual preview-column width via
//     ResizeObserver, so moving the window never leaves the sheet clipped or
//     surrounded by whitespace.
//   • No nested iframe scroll in the default state — the sheet scales to the
//     visible frame, period.
import { useEffect, useLayoutEffect, useRef, useState } from "react";

export type WorkspaceSection = {
  id: string;
  label: string;
  state: "ok" | "missing" | "warn" | "info";
  hint?: string;
};

export type WorkspaceStatus = {
  // "ready" | "almost" | "needs" | "review" — drives the pill color + label.
  level: "ready" | "almost" | "needs" | "review";
  // Human-language headline, 2-5 words.
  headline: string;
  // Optional 1-2 next actions in plain English.
  nextActions?: string[];
};

type Props = {
  sheetUrl: string;         // "/catalog-admin/sheet/<vintage-id>"
  version: string;          // vintage.updated_at ISO — forces iframe refresh
  sections: WorkspaceSection[];
  status: WorkspaceStatus;
  vintageTabs: React.ReactNode;
  children: React.ReactNode;
};

// US-Letter page dimensions at 96dpi (what the sheet CSS declares).
const SHEET_W = 816;   // 8.5in * 96
const SHEET_H = 1056;  // 11in * 96

// Named zoom levels the overflow menu offers.
type ZoomMode = "fit" | "actual" | "75" | "100";
const ZOOM_LABEL: Record<ZoomMode, string> = {
  fit: "Fit Page",
  actual: "Actual Size",
  "75": "75%",
  "100": "100%",
};

const STATUS_LABEL: Record<WorkspaceStatus["level"], string> = {
  ready: "Ready",
  almost: "Almost ready",
  needs: "Needs a few details",
  review: "Needs review",
};

export default function WineWorkspace({
  sheetUrl,
  version,
  sections,
  status,
  vintageTabs,
  children,
}: Props) {
  const [previewOpen, setPreviewOpen] = useState<boolean>(true);
  const [zoom, setZoom] = useState<ZoomMode>("fit");
  const [zoomMenuOpen, setZoomMenuOpen] = useState(false);
  const [fitScale, setFitScale] = useState<number>(0.5);
  const [activeId, setActiveId] = useState<string | null>(sections[0]?.id ?? null);
  const frameRef = useRef<HTMLDivElement | null>(null);

  // Persist layout choices per-user so moving between wines keeps the layout.
  useEffect(() => {
    try {
      const openRaw = localStorage.getItem("mm.workspace.previewOpen");
      const zoomRaw = localStorage.getItem("mm.workspace.zoomMode");
      if (openRaw !== null) setPreviewOpen(openRaw === "1");
      if (zoomRaw && zoomRaw in ZOOM_LABEL) setZoom(zoomRaw as ZoomMode);
    } catch {}
  }, []);
  useEffect(() => {
    try { localStorage.setItem("mm.workspace.previewOpen", previewOpen ? "1" : "0"); } catch {}
  }, [previewOpen]);
  useEffect(() => {
    try { localStorage.setItem("mm.workspace.zoomMode", zoom); } catch {}
  }, [zoom]);

  // Compute the Fit-Page scale from the actual preview frame width. Keeps the
  // page centered and legible without a nested horizontal scrollbar.
  useLayoutEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const compute = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w <= 0 || h <= 0) return;
      const sw = (w - 16) / SHEET_W;
      const sh = (h - 16) / SHEET_H;
      setFitScale(Math.min(sw, sh, 1));
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, [previewOpen]);

  // Scroll spy — same behavior as the previous build.
  useEffect(() => {
    if (sections.length === 0) return;
    const topOffset = 110;
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
  const scale =
    zoom === "fit" ? fitScale :
    zoom === "actual" ? 1 :
    zoom === "75" ? 0.75 :
    1;

  return (
    <div className={`workspace ${previewOpen ? "" : "workspace--no-preview"}`}>
      <aside className="workspace__rail">
        <div className={`rail-status rail-status--${status.level}`}>
          <strong className="rail-status__level">{STATUS_LABEL[status.level]}</strong>
          <p className="rail-status__headline">{status.headline}</p>
          {status.nextActions && status.nextActions.length > 0 && (
            <ul className="rail-status__next">
              {status.nextActions.slice(0, 2).map((a, i) => (
                <li key={i}>{a}</li>
              ))}
            </ul>
          )}
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

      <div className="workspace__main">
        {children}
      </div>

      <aside className={`workspace__preview ${previewOpen ? "" : "workspace__preview--closed"}`}>
        <div className="preview-head">
          <strong>Preview</strong>
          <div className="preview-head__right">
            <div className="preview-zoom">
              <button
                type="button"
                className="btn small"
                onClick={() => setZoomMenuOpen((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={zoomMenuOpen}
              >
                {ZOOM_LABEL[zoom]}
                <span className="preview-zoom__chev" aria-hidden="true">▾</span>
              </button>
              {zoomMenuOpen && (
                <ul className="preview-zoom__menu" role="menu" onMouseLeave={() => setZoomMenuOpen(false)}>
                  {(Object.keys(ZOOM_LABEL) as ZoomMode[]).map((k) => (
                    <li key={k}>
                      <button
                        type="button"
                        role="menuitem"
                        className={zoom === k ? "active" : undefined}
                        onClick={() => { setZoom(k); setZoomMenuOpen(false); }}
                      >
                        {ZOOM_LABEL[k]}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
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
        <div
          className={`preview-frame preview-frame--${zoom}`}
          ref={frameRef}
          style={zoom !== "fit" ? { overflow: "auto" } : undefined}
        >
          <div
            className="preview-frame__scale"
            style={{ transform: `scale(${scale})` }}
          >
            <iframe src={iframeSrc} title="Sheet preview" loading="lazy" />
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
