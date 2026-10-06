// Minimal layout for the single-wine sheet route. No admin sidebar — so when
// the wine edit page embeds this URL in a live-preview iframe, only the sheet
// shows. Auth is enforced by the page itself.
export const dynamic = "force-dynamic";

export default function SheetLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
