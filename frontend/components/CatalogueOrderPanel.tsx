"use client";

import { useActionState, useEffect, useRef, useState } from "react";

import { Icon } from "@/components/Icon";
import { orderFromCatalogue } from "@/lib/actions";
import { MATERIAL_LABEL, technologyFor } from "@/lib/status";
import type { ActionResult, Part } from "@/lib/types";

export function CatalogueOrderPanel({ parts }: { parts: Part[] }) {
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string>(
    parts.length > 0 ? String(parts[0].id) : "",
  );
  const [state, formAction, pending] = useActionState<
    ActionResult | null,
    FormData
  >(orderFromCatalogue, null);

  const selectRef = useRef<HTMLSelectElement>(null);

  // React resets the form once the action resolves, which snaps the select
  // back to its first option without re-rendering it. Re-assert the value or
  // the DOM silently diverges from state.
  useEffect(() => {
    const element = selectRef.current;
    if (element && element.value !== selectedId) element.value = selectedId;
  }, [state, pending, selectedId]);

  const selected = parts.find((p) => String(p.id) === selectedId);

  if (parts.length === 0) return null;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-[var(--page)] transition-opacity hover:opacity-90"
        style={{ background: "var(--series-1)" }}
      >
        <Icon name="cube" size={15} />
        Place an order
      </button>
    );
  }

  return (
    <section className="rounded-lg border border-[var(--hairline)] bg-[var(--surface-1)] p-5">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">
            Place an order
          </h2>
          <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
            Choose a part from the catalogue. It gets priced by the quoting
            service and opens at <code>quoted</code>, waiting on payment.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="shrink-0 text-xs text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
        >
          Cancel
        </button>
      </div>

      <form action={formAction} className="space-y-4">
        <div>
          <label
            htmlFor="part"
            className="mb-1.5 block text-xs text-[var(--text-secondary)]"
          >
            Part
          </label>
          <select
            id="part"
            name="part"
            ref={selectRef}
            value={selectedId}
            onChange={(event) => setSelectedId(event.target.value)}
            className="w-full rounded-md border border-[var(--hairline)] bg-[var(--surface-2)] px-2.5 py-2 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--series-1)]"
          >
            {parts.map((part) => (
              <option key={part.id} value={part.id}>
                {part.name} - {MATERIAL_LABEL[part.material]} · ×{part.quantity}
              </option>
            ))}
          </select>
        </div>

        {selected ? (
          <dl className="space-y-2 rounded-md border border-[var(--hairline)] bg-[var(--surface-2)] p-3 text-xs">
            <Row
              label="Material"
              value={`${MATERIAL_LABEL[selected.material]} · prints on ${technologyFor(selected.material)}`}
            />
            <Row label="Quantity" value={`×${selected.quantity}`} />
            <Row
              label="Bounding box"
              value={`${selected.length_mm} × ${selected.width_mm} × ${selected.height_mm} mm`}
            />
          </dl>
        ) : null}

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
            Order placed - it is in the table below, priced and awaiting
            payment.
          </p>
        ) : null}

        <button
          type="submit"
          disabled={pending}
          className="rounded-md px-4 py-2.5 text-sm font-medium text-[var(--page)] transition-opacity hover:opacity-90 disabled:opacity-60"
          style={{ background: "var(--series-1)" }}
        >
          {pending ? "Placing..." : "Place order"}
        </button>

        <p className="text-xs text-[var(--text-muted)]">
          An operator takes it from there: payment, then a printer.
        </p>
      </form>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3">
      <dt className="w-24 shrink-0 text-[var(--text-secondary)]">{label}</dt>
      <dd className="min-w-0 flex-1 text-[var(--text-primary)]">{value}</dd>
    </div>
  );
}
