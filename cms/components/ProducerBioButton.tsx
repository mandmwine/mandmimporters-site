"use client";
// Phase 41 (Sprint 3) — "Draft a bio" action for the producer workspace.
//
// Fires proposeProducerBio and surfaces a line pointing at /review/ai
// where the proposal lands. Nothing writes to the producer directly;
// the standard AI approval loop handles that.
import { useState, useTransition } from "react";
import Link from "next/link";
import { proposeProducerBio } from "@/lib/ai-actions";

export default function ProducerBioButton({ producerId }: { producerId: string }) {
  const [pending, start] = useTransition();
  const [state, setState] = useState<"idle" | "ok" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  function run() {
    setState("idle");
    setMessage(null);
    const fd = new FormData();
    fd.set("producer_id", producerId);
    start(async () => {
      const res = await proposeProducerBio(fd);
      if (!res.ok) {
        setState("error");
        setMessage(res.error ?? "Could not draft a bio.");
        return;
      }
      setState("ok");
    });
  }

  return (
    <div className="producer-bio-ai">
      <button type="button" className="btn small" onClick={run} disabled={pending}>
        {pending ? "Drafting…" : "Draft a bio from sources"}
      </button>
      {state === "ok" && (
        <p className="small ok-text">
          Draft is in the <Link href="/review/ai?filter=producer">AI inbox</Link> for review.
        </p>
      )}
      {state === "error" && message && <p className="small error">{message}</p>}
    </div>
  );
}
