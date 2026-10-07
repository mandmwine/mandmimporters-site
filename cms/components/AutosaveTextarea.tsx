"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Status = "idle" | "typing" | "saving" | "saved" | "error";

type Props = {
  initialValue: string;
  save: (next: string) => Promise<{ ok: boolean; message?: string }>;
  rows?: number;
  placeholder?: string;
  name?: string;
  maxWarnAt?: number;        // show a character-count warning once we cross this
  idleMs?: number;           // debounce window; defaults to 1200ms
};

// Textarea that saves on its own after the user pauses typing.  The pending
// state is visible as a small status strip to the right of the label.
export default function AutosaveTextarea({
  initialValue,
  save,
  rows = 4,
  placeholder,
  name,
  maxWarnAt,
  idleMs = 1200,
}: Props) {
  const [value, setValue] = useState(initialValue);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSaved = useRef(initialValue);
  const router = useRouter();

  // Keep local value in sync when the server rerenders with a different value
  // (e.g. after an AI accept).
  useEffect(() => {
    if (status === "idle" && initialValue !== lastSaved.current) {
      setValue(initialValue);
      lastSaved.current = initialValue;
    }
  }, [initialValue, status]);

  function onChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const next = e.target.value;
    setValue(next);
    setStatus("typing");
    setError(null);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(next), idleMs);
  }

  async function flush(next: string) {
    if (next === lastSaved.current) {
      setStatus("idle");
      return;
    }
    setStatus("saving");
    try {
      const res = await save(next);
      if (!res.ok) {
        setError(res.message ?? "Save failed.");
        setStatus("error");
        return;
      }
      lastSaved.current = next;
      setStatus("saved");
      // Refresh server data so other panels reflect the change.
      router.refresh();
      // After a brief "Saved" moment, go back to idle.
      setTimeout(() => setStatus((s) => (s === "saved" ? "idle" : s)), 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus("error");
    }
  }

  function onBlur() {
    if (status === "typing") {
      if (timer.current) clearTimeout(timer.current);
      void flush(value);
    }
  }

  const overWarn = Boolean(maxWarnAt && value.length > maxWarnAt);
  const statusText =
    status === "typing" ? "Typing…" :
    status === "saving" ? "Saving…" :
    status === "saved"  ? "✓ Saved" :
    status === "error"  ? (error ?? "Error") :
    "";

  return (
    <div className="autosave">
      <textarea
        name={name}
        rows={rows}
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        placeholder={placeholder}
      />
      <div className="autosave__status small">
        <span className={`autosave__chip autosave__chip--${status}`}>{statusText}</span>
        {maxWarnAt && (
          <span className={`muted ${overWarn ? "warn-text" : ""}`}>
            {value.length} / {maxWarnAt} chars
          </span>
        )}
      </div>
    </div>
  );
}
