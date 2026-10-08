// Phase 31 — Office UX acceptance tests (audit §44).
//
// A dedicated page that lets Ralph (or anyone) hand the app to someone
// unfamiliar with the CMS, read them six prescribed tasks, and record
// whether each one passed. Results persist in localStorage per browser
// so the user can set it down and come back, and the page exports a
// Markdown summary so a run can be filed as a document.
import UXAcceptanceTests from "@/components/UXAcceptanceTests";

export const dynamic = "force-dynamic";

export default function TestsPage() {
  return (
    <>
      <header className="page-head">
        <h1>Office UX Acceptance Tests</h1>
        <p className="muted">
          Hand the app to someone unfamiliar with it, read them each task
          one by one, and record what happens. Results stay in this browser;
          there&rsquo;s no server-side state.
        </p>
      </header>

      <UXAcceptanceTests />
    </>
  );
}
