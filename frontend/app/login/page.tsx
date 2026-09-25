import Link from "next/link";

import { LoginForm } from "@/components/LoginForm";
import { TopBar, Wordmark } from "@/components/Chrome";

export const metadata = { title: "Sign in - Build3D" };

const DEMO = [
  { user: "omar_operator", password: "operator-pass-123", role: "Operator" },
  { user: "alice_customer", password: "customer-pass-123", role: "Customer" },
];

export default function LoginPage() {
  return (
    <div className="min-h-screen">
      <TopBar me={null} />
      <main className="mx-auto flex max-w-md flex-col justify-center px-5 py-20">
        <div className="sm:hidden">
          <Wordmark />
        </div>
        <h1 className="mt-6 text-2xl font-semibold tracking-tight text-[var(--text-primary)] sm:mt-0">
          Sign in
        </h1>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">
          Your credentials are exchanged for a DRF token server-side. The token
          is stored in an httpOnly cookie, so browser JavaScript never sees it.
        </p>

        <div className="mt-8">
          <LoginForm />
        </div>

        <div className="mt-8 rounded-lg border border-[var(--hairline)] bg-[var(--surface-1)] p-4">
          <p className="text-xs font-medium text-[var(--text-primary)]">
            Seeded accounts
          </p>
          <ul className="mt-2.5 space-y-2">
            {DEMO.map((account) => (
              <li key={account.user} className="text-xs">
                <span className="text-[var(--text-muted)]">{account.role}</span>
                <span className="mt-0.5 block text-[var(--text-secondary)]">
                  <code className="text-[var(--text-primary)]">
                    {account.user}
                  </code>
                  {" / "}
                  <code>{account.password}</code>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-[var(--text-muted)]">
            Created by <code>manage.py seed</code>. Run{" "}
            <code>manage.py demo --reset</code> for a fuller dataset.
          </p>
        </div>

        <Link
          href="/"
          className="mt-6 text-xs text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
        >
          ← Back to the overview
        </Link>
      </main>
    </div>
  );
}
