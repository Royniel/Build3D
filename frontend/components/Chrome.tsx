import Link from "next/link";

import { Icon } from "@/components/Icon";
import { logout } from "@/lib/actions";
import type { Me } from "@/lib/types";

export function Wordmark({ size = "md" }: { size?: "md" | "lg" }) {
  return (
    <Link href="/" className="group inline-flex items-center gap-2.5">
      <span
        className="grid place-items-center rounded-md"
        style={{
          width: size === "lg" ? 34 : 28,
          height: size === "lg" ? 34 : 28,
          background: "var(--series-1-wash)",
          border:
            "1px solid color-mix(in oklab, var(--series-1) 40%, transparent)",
          color: "var(--series-1)",
        }}
      >
        <Icon name="cube" size={size === "lg" ? 20 : 17} />
      </span>
      <span
        className={[
          "font-semibold tracking-tight text-[var(--text-primary)]",
          size === "lg" ? "text-lg" : "text-[15px]",
        ].join(" ")}
      >
        Build3D
      </span>
    </Link>
  );
}

const NAV = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/orders", label: "Orders" },
  { href: "/machines", label: "Machines" },
];

export function TopBar({ me, current }: { me: Me | null; current?: string }) {
  return (
    <header className="sticky top-0 z-30 border-b border-[var(--hairline)] bg-[color-mix(in_oklab,var(--page)_88%,transparent)] backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-5">
        <Wordmark />

        {me ? (
          <nav aria-label="Main" className="hidden items-center gap-1 sm:flex">
            {NAV.map((item) => {
              const active = current === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={[
                    "rounded-md px-2.5 py-1.5 text-sm transition-colors",
                    active
                      ? "bg-[var(--surface-2)] text-[var(--text-primary)]"
                      : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
                  ].join(" ")}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        ) : null}

        <div className="ml-auto flex items-center gap-3">
          {me ? (
            <>
              <span className="hidden text-xs text-[var(--text-secondary)] sm:inline">
                {me.username}
                <span className="ml-1.5 rounded border border-[var(--hairline)] px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
                  {me.role ?? "no role"}
                </span>
              </span>

              <form action={logout}>
                <button
                  type="submit"
                  className="rounded-md border border-[var(--hairline)] px-2.5 py-1.5 text-xs text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
                >
                  Sign out
                </button>
              </form>
            </>
          ) : (
            <Link
              href="/login"
              className="rounded-md px-3 py-1.5 text-sm font-medium text-[var(--page)] transition-opacity hover:opacity-90"
              style={{ background: "var(--series-1)" }}
            >
              Sign in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}

export function Card({
  title,
  subtitle,
  action,
  children,
  className = "",
}: {
  title?: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-lg border border-[var(--hairline)] bg-[var(--surface-1)] p-5 ${className}`}
    >
      {title ? (
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">
              {title}
            </h2>
            {subtitle ? (
              <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                {subtitle}
              </p>
            ) : null}
          </div>
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="py-6 text-center text-sm text-[var(--text-muted)]">
      {children}
    </p>
  );
}

export function ServiceDown({
  service,
  hint,
}: {
  service: string;
  hint?: string;
}) {
  return (
    <div
      className="rounded-lg border p-5"
      style={{
        borderColor:
          "color-mix(in oklab, var(--status-warning) 40%, transparent)",
        background:
          "color-mix(in oklab, var(--status-warning) 8%, transparent)",
      }}
    >
      <p className="flex items-center gap-2 text-sm font-medium text-[var(--text-primary)]">
        <span style={{ color: "var(--status-warning)" }}>
          <Icon name="alert" size={16} />
        </span>
        {service} is not reachable
      </p>
      {hint ? (
        <p className="mt-1.5 text-xs text-[var(--text-secondary)]">{hint}</p>
      ) : null}
    </div>
  );
}
