"use client";

export default function SignOut() {
  return (
    <button
      type="button"
      className="link"
      onClick={async () => {
        await fetch("/catalog-admin/api/session", { method: "DELETE" });
        window.location.assign("/catalog-admin/login");
      }}
    >
      Sign out
    </button>
  );
}
