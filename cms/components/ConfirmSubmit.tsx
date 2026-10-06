"use client";
import type React from "react";

// Submits the surrounding form only after confirm() returns true. Server
// components can't inline onClick handlers, so delete/archive buttons that
// want a confirmation live here.
export default function ConfirmSubmit({
  children,
  message,
  className = "link small",
}: {
  children: React.ReactNode;
  message: string;
  className?: string;
}) {
  return (
    <button
      type="submit"
      className={className}
      formNoValidate
      onClick={(e) => {
        if (!confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
