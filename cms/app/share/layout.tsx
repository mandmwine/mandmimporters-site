// Public (unauthenticated) share routes. No admin shell. The proxy is NOT a
// gate for these paths — this layout and its pages validate every request on
// their own.
export const dynamic = "force-dynamic";

export default function ShareLayout({ children }: { children: React.ReactNode }) {
  return <div className="share-shell">{children}</div>;
}
