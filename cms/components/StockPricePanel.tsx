// Server component — displays stock cases + price ladder for one vintage.
// Pulls data straight from the DB so it stays current.
import Link from "next/link";
import { query } from "@/lib/db";

type PriceRow = { tier: string; min_cases: number; case_price: string; bottle_price: string | null };

type Props = {
  vintageId: string;
  sku: string | null;
  packSize: number | null;
  stockAvailable: string | number | null;
  stockAllocated: string | number | null;
  stockInbound: string | number | null;
  stockUpdatedAt: Date | null;
};

const TIER_LABEL: Record<string, string> = {
  frontline: "FrontLine",
  "2cs": "2 cs",
  "3cs": "3 cs",
  "4cs": "4 cs",
  "5cs": "5 cs",
  "10cs": "10 cs",
  "25cs": "25 cs",
};

function num(v: string | number | null): string {
  if (v === null || v === undefined) return "—";
  const n = typeof v === "number" ? v : parseFloat(v);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}
function money(v: string | number | null): string {
  if (v === null || v === undefined) return "—";
  const n = typeof v === "number" ? v : parseFloat(v);
  if (!Number.isFinite(n)) return "—";
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default async function StockPricePanel({
  vintageId,
  sku,
  packSize,
  stockAvailable,
  stockAllocated,
  stockInbound,
  stockUpdatedAt,
}: Props) {
  const prices = await query<PriceRow>(
    "SELECT tier, min_cases, case_price::text, bottle_price::text FROM wine_vintage_prices WHERE vintage_id = $1 ORDER BY min_cases",
    [vintageId],
  );
  const noStock = stockAvailable === null && stockAllocated === null && stockInbound === null;
  const noPrices = prices.length === 0;

  if (noStock && noPrices) {
    return (
      <div className="panel">
        <h2>Stock &amp; price</h2>
        <p className="muted small">
          No stock or price data loaded yet. Upload your{" "}
          <Link href="/data/import/inventory">inventory</Link> and{" "}
          <Link href="/data/import/prices">price posting</Link> xlsx files
          to populate this panel.
        </p>
      </div>
    );
  }

  return (
    <div className="panel stock-price">
      <div className="panel-head">
        <h2>Stock &amp; price</h2>
        {sku && <code className="muted small mono">{sku}</code>}
      </div>

      <div className="stock-row">
        <div>
          <div className="muted small">Available</div>
          <div className="strong">{num(stockAvailable)} <span className="muted small">cases</span></div>
        </div>
        <div>
          <div className="muted small">Allocated</div>
          <div className="strong">{num(stockAllocated)}</div>
        </div>
        <div>
          <div className="muted small">Inbound</div>
          <div className="strong">{num(stockInbound)}</div>
        </div>
        {packSize && (
          <div>
            <div className="muted small">Pack</div>
            <div className="strong">{packSize}/case</div>
          </div>
        )}
        {stockUpdatedAt && (
          <div className="muted small" style={{ alignSelf: "end" }}>
            Updated {new Date(stockUpdatedAt).toLocaleDateString("en-US")}
          </div>
        )}
      </div>

      {!noPrices && (
        <table className="table compact" style={{ marginTop: 10 }}>
          <thead>
            <tr>
              <th>Tier</th>
              <th>Min cases</th>
              <th className="right">Case</th>
              <th className="right">Bottle</th>
            </tr>
          </thead>
          <tbody>
            {prices.map((p) => (
              <tr key={p.tier}>
                <td>{TIER_LABEL[p.tier] ?? p.tier}</td>
                <td>{p.min_cases}</td>
                <td className="right">{money(p.case_price)}</td>
                <td className="right">{money(p.bottle_price)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
