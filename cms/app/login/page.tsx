import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import LoginForm from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await getSessionUser()) redirect("/");
  return (
    <main className="login">
      <div className="login-card">
        <p className="eyebrow">M &amp; M Importers</p>
        <h1>Catalog</h1>
        <p className="muted">Private office system. Sign in with your catalog account.</p>
        <LoginForm />
      </div>
    </main>
  );
}
