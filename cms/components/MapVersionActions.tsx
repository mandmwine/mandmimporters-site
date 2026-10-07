"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { approveMapVersion, retireMapVersion, deleteMapVersion } from "@/lib/actions";

export default function MapVersionActions({
  id,
  status,
}: {
  id: string;
  status: "draft" | "approved" | "retired";
}) {
  const [pending, start] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const router = useRouter();

  function run(fn: (fd: FormData) => Promise<unknown>) {
    const fd = new FormData();
    fd.set("id", id);
    start(async () => {
      await fn(fd);
      router.refresh();
    });
  }

  return (
    <div className="map-actions">
      {status === "draft" && (
        <button
          type="button"
          className="btn primary small"
          disabled={pending}
          onClick={() => run(approveMapVersion)}
        >
          {pending ? "…" : "Approve"}
        </button>
      )}
      {status === "approved" && (
        <button
          type="button"
          className="btn small"
          disabled={pending}
          onClick={() => run(retireMapVersion)}
        >
          Retire
        </button>
      )}
      {status === "retired" && (
        <button
          type="button"
          className="btn small"
          disabled={pending}
          onClick={() => run(approveMapVersion)}
        >
          Re-approve
        </button>
      )}
      {status !== "approved" && (
        !confirmDelete ? (
          <button
            type="button"
            className="btn danger small"
            disabled={pending}
            onClick={() => setConfirmDelete(true)}
          >
            Delete
          </button>
        ) : (
          <>
            <button
              type="button"
              className="btn danger small"
              disabled={pending}
              onClick={() => run(deleteMapVersion)}
            >
              Confirm
            </button>
            <button type="button" className="link small" onClick={() => setConfirmDelete(false)}>
              Cancel
            </button>
          </>
        )
      )}
    </div>
  );
}
