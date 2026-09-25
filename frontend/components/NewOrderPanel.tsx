"use client";

import { useActionState, useState } from "react";

import { Icon } from "@/components/Icon";
import { createOrder } from "@/lib/actions";
import { MATERIAL_LABEL, technologyFor } from "@/lib/status";
import type { ActionResult, Material } from "@/lib/types";

const MATERIALS = Object.keys(MATERIAL_LABEL) as Material[];

const FIELD =
  "w-full rounded-md border border-[var(--hairline)] bg-[var(--surface-2)] px-2.5 py-2 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--series-1)]";
const LABEL = "mb-1.5 block text-xs text-[var(--text-secondary)]";

export function NewOrderPanel() {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<
    ActionResult | null,
    FormData
  >(createOrder, null);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-md border border-[var(--hairline)] px-3 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
      >
        <Icon name="cube" size={15} />
        New order
      </button>
    );
  }

  return (
    <section className="rounded-lg border border-[var(--hairline)] bg-[var(--surface-1)] p-5">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">
            New order
          </h2>
          <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
            Creating this calls the quoting service. If it is down, the order is
            saved as quote_pending instead of failing.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
        >
          Cancel
        </button>
      </div>

      <form action={formAction} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={LABEL} htmlFor="name">
              Part name
            </label>
            <input
              id="name"
              name="name"
              required
              className={FIELD}
              placeholder="Hinge bracket"
            />
          </div>
          <div>
            <label className={LABEL} htmlFor="material">
              Material
            </label>
            <select
              id="material"
              name="material"
              defaultValue="resin_standard"
              className={FIELD}
            >
              {MATERIALS.map((m) => (
                <option key={m} value={m}>
                  {MATERIAL_LABEL[m]} · {technologyFor(m)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <label className={LABEL} htmlFor="quantity">
              Quantity
            </label>
            <input
              id="quantity"
              name="quantity"
              type="number"
              min={1}
              defaultValue={5}
              className={FIELD}
            />
          </div>
          {(
            [
              ["length_mm", "Length"],
              ["width_mm", "Width"],
              ["height_mm", "Height"],
            ] as const
          ).map(([name, label]) => (
            <div key={name}>
              <label className={LABEL} htmlFor={name}>
                {label} (mm)
              </label>
              <input
                id={name}
                name={name}
                type="number"
                min={0.1}
                step="0.01"
                defaultValue={40}
                className={FIELD}
              />
            </div>
          ))}
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

        {state?.ok ? (
          <p
            role="status"
            className="flex items-center gap-2 rounded-md px-3 py-2 text-xs"
            style={{
              background:
                "color-mix(in oklab, var(--status-good) 12%, transparent)",
              color: "var(--text-primary)",
            }}
          >
            <span style={{ color: "var(--status-good)" }} className="shrink-0">
              <Icon name="check" size={13} />
            </span>
            Order created and priced. It is in the table below.
          </p>
        ) : null}

        <button
          type="submit"
          disabled={pending}
          className="rounded-md px-4 py-2.5 text-sm font-medium text-[var(--page)] transition-opacity hover:opacity-90 disabled:opacity-60"
          style={{ background: "var(--series-1)" }}
        >
          {pending ? "Creating..." : "Create order"}
        </button>
      </form>
    </section>
  );
}
