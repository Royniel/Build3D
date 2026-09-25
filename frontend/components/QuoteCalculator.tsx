"use client";

import { useActionState } from "react";

import { Icon } from "@/components/Icon";
import { getQuote } from "@/lib/actions";
import { MATERIAL_LABEL, technologyFor } from "@/lib/status";
import type { Material, QuoteResult } from "@/lib/types";

const MATERIALS = Object.keys(MATERIAL_LABEL) as Material[];

const FIELD =
  "w-full rounded-md border border-[var(--hairline)] bg-[var(--surface-2)] px-2.5 py-2 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--series-1)]";
const LABEL = "mb-1.5 block text-xs text-[var(--text-secondary)]";

export function QuoteCalculator() {
  const [state, formAction, pending] = useActionState<
    QuoteResult | null,
    FormData
  >(getQuote, null);

  const quote = state?.quote;

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <form action={formAction} className="space-y-4">
        <div>
          <label className={LABEL} htmlFor="q-material">
            Material
          </label>
          <select
            id="q-material"
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

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={LABEL} htmlFor="q-quantity">
              Quantity
            </label>
            <input
              id="q-quantity"
              name="quantity"
              type="number"
              min={1}
              max={1000}
              defaultValue={10}
              className={FIELD}
            />
          </div>
          <div>
            <label className={LABEL} htmlFor="q-length">
              Length (mm)
            </label>
            <input
              id="q-length"
              name="length_mm"
              type="number"
              min={0.1}
              max={500}
              step="0.1"
              defaultValue={40}
              className={FIELD}
            />
          </div>
          <div>
            <label className={LABEL} htmlFor="q-width">
              Width (mm)
            </label>
            <input
              id="q-width"
              name="width_mm"
              type="number"
              min={0.1}
              max={500}
              step="0.1"
              defaultValue={25}
              className={FIELD}
            />
          </div>
          <div>
            <label className={LABEL} htmlFor="q-height">
              Height (mm)
            </label>
            <input
              id="q-height"
              name="height_mm"
              type="number"
              min={0.1}
              max={500}
              step="0.1"
              defaultValue={12}
              className={FIELD}
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={pending}
          className="inline-flex w-full items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium text-[var(--page)] transition-opacity hover:opacity-90 disabled:opacity-60"
          style={{ background: "var(--series-1)" }}
        >
          <Icon name="bolt" size={15} />
          {pending ? "Pricing..." : "Get a live quote"}
        </button>

        {state && !state.ok && state.error ? (
          <p
            role="alert"
            className="rounded-md px-3 py-2 text-xs"
            style={{
              background:
                "color-mix(in oklab, var(--status-warning) 10%, transparent)",
              color: "var(--text-primary)",
            }}
          >
            {state.error}
          </p>
        ) : null}
      </form>

      <div
        className="rounded-lg border border-[var(--hairline)] bg-[var(--surface-2)] p-5 transition-opacity"
        style={{ opacity: pending ? 0.6 : 1 }}
      >
        {quote ? (
          <>
            <p className="text-xs uppercase tracking-wider text-[var(--text-muted)]">
              Quoted price
            </p>
            <p className="figure-hero mt-1 text-[var(--text-primary)]">
              $
              {quote.price.toLocaleString("en-US", {
                minimumFractionDigits: 2,
              })}
            </p>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              {quote.lead_time_days} working{" "}
              {quote.lead_time_days === 1 ? "day" : "days"} lead time
            </p>

            <dl className="mt-5 space-y-2 border-t border-[var(--gridline)] pt-4 text-xs">
              <Row
                label="Bounding-box volume"
                value={`${quote.breakdown.volume_cm3} cm³`}
              />
              <Row
                label="Material rate"
                value={`$${quote.breakdown.rate_per_cm3.toFixed(2)} / cm³`}
              />
              <Row
                label="Material cost"
                value={`$${quote.breakdown.material_cost.toFixed(2)}`}
              />
              <Row
                label="Setup fee"
                value={`$${quote.breakdown.setup_fee.toFixed(2)}`}
              />
              <Row
                label="Rush multiplier"
                value={
                  quote.breakdown.rush_applied
                    ? `×${quote.breakdown.rush_multiplier} applied`
                    : "not applied"
                }
              />
              <Row
                label="Machine load factor"
                value={`×${quote.breakdown.machine_load_factor}`}
              />
            </dl>

            {quote.breakdown.rush_applied ? (
              <p className="mt-4 text-xs text-[var(--text-muted)]">
                A batch this small cannot amortise setup across a full plate, so
                it costs more per part - and gets scheduled ahead of bigger
                batches.
              </p>
            ) : null}
          </>
        ) : (
          <div className="flex h-full flex-col justify-center text-center">
            <p className="text-sm text-[var(--text-secondary)]">
              Submit the form to call the quoting service.
            </p>
            <p className="mt-2 text-xs text-[var(--text-muted)]">
              price = bounding-box volume × material rate × quantity × rush
              multiplier + setup fee
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-[var(--text-secondary)]">{label}</dt>
      <dd className="nums-tabular text-[var(--text-primary)]">{value}</dd>
    </div>
  );
}
