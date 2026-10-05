const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  needs_review: "Needs review",
  approved: "Approved",
  published: "Published",
  discontinued: "Discontinued",
};

export function StatusBadge({ status }: { status: string }) {
  return <span className={`badge status-${status}`}>{STATUS_LABEL[status] ?? status}</span>;
}

export function SeverityBadge({ severity }: { severity: string }) {
  return <span className={`badge sev-${severity}`}>{severity === "error" ? "Needs fix" : severity === "warning" ? "Check" : "Note"}</span>;
}
