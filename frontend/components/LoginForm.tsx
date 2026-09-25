"use client";

import { useActionState } from "react";

import { Icon } from "@/components/Icon";
import { login } from "@/lib/actions";
import type { ActionResult } from "@/lib/types";

const FIELD =
  "w-full rounded-md border border-[var(--hairline)] bg-[var(--surface-1)] px-3 py-2.5 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--series-1)]";

export function LoginForm() {
  const [state, formAction, pending] = useActionState<
    ActionResult | null,
    FormData
  >(login, null);

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label
          htmlFor="username"
          className="mb-1.5 block text-xs text-[var(--text-secondary)]"
        >
          Username
        </label>
        <input
          id="username"
          name="username"
          autoComplete="username"
          required
          autoFocus
          className={FIELD}
        />
      </div>

      <div>
        <label
          htmlFor="password"
          className="mb-1.5 block text-xs text-[var(--text-secondary)]"
        >
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className={FIELD}
        />
      </div>

      {state?.error ? (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-md px-3 py-2 text-xs"
          style={{
            background:
              "color-mix(in oklab, var(--status-critical) 12%, transparent)",
            color: "var(--text-primary)",
          }}
        >
          <span
            style={{ color: "var(--status-critical)" }}
            className="mt-0.5 shrink-0"
          >
            <Icon name="alert" size={13} />
          </span>
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md px-4 py-2.5 text-sm font-medium text-[var(--page)] transition-opacity hover:opacity-90 disabled:opacity-60"
        style={{ background: "var(--series-1)" }}
      >
        {pending ? "Signing in..." : "Sign in"}
      </button>
    </form>
  );
}
