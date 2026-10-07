"use client";
import { useRouter } from "next/navigation";

// Wraps a table row and makes any click on it open the detail href, while
// leaving in-row controls (checkboxes, buttons, inner links) alone.  Also
// supports keyboard activation with Enter and Space.
export default function ClickableRow({
  href,
  children,
  className,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  const router = useRouter();

  function onClick(e: React.MouseEvent<HTMLTableRowElement>) {
    const t = e.target as HTMLElement;
    // Let real controls do their own thing — only the empty space triggers nav.
    if (t.closest("a, button, input, select, textarea, label")) return;
    router.push(href);
  }

  function onKey(e: React.KeyboardEvent<HTMLTableRowElement>) {
    if (e.key === "Enter") {
      const t = e.target as HTMLElement;
      if (t.closest("a, button, input, select, textarea")) return;
      router.push(href);
    }
  }

  return (
    <tr className={`row-clickable${className ? " " + className : ""}`}
        onClick={onClick}
        onKeyDown={onKey}
        tabIndex={0}
        role="link">
      {children}
    </tr>
  );
}
