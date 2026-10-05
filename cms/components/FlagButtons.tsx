import { setFlagStatus } from "@/lib/actions";

export default function FlagButtons({ id, status }: { id: string; status: string }) {
  if (status !== "open") {
    return (
      <form action={setFlagStatus} className="inline">
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="status" value="open" />
        <button className="link small">Reopen</button>
      </form>
    );
  }
  return (
    <span className="inline-actions">
      <form action={setFlagStatus} className="inline">
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="status" value="resolved" />
        <button className="link small">Resolved</button>
      </form>
      <form action={setFlagStatus} className="inline">
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="status" value="dismissed" />
        <button className="link small muted">Dismiss</button>
      </form>
    </span>
  );
}
