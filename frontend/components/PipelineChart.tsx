"use client";

import { useId, useState } from "react";

import { Icon } from "@/components/Icon";
import { ORDER_STATUS, TONE_VAR } from "@/lib/status";
import type { StageCount } from "@/lib/types";

const LABEL_W = "8.75rem";
const VALUE_W = "2rem";
const GAP = "0.75rem";

function niceTicks(max: number, target = 4): number[] {
  if (max <= 0) return [0, 1];
  const magnitude = 10 ** Math.floor(Math.log10(max / target || 1));
  const normalised = max / target / magnitude;
  const niceStep =
    normalised <= 1 ? 1 : normalised <= 2 ? 2 : normalised <= 5 ? 5 : 10;

  const step = Math.max(1, Math.round(niceStep * magnitude));
  const top = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let value = 0; value <= top; value += step) ticks.push(value);
  return ticks;
}

interface PipelineChartProps {
  stages: StageCount[];
  title: string;
  subtitle?: string;
}

export function PipelineChart({ stages, title, subtitle }: PipelineChartProps) {
  const [active, setActive] = useState<string | null>(null);
  const [showTable, setShowTable] = useState(false);
  const tableId = useId();

  const peak = Math.max(0, ...stages.map((s) => s.count));
  const ticks = niceTicks(peak);
  const axisMax = ticks[ticks.length - 1];
  const total = stages.reduce((sum, s) => sum + s.count, 0);

  return (
    <figure
      className="m-0"
      style={{
        ["--label-w" as string]: LABEL_W,
        ["--value-w" as string]: VALUE_W,
        ["--col-gap" as string]: GAP,
      }}
    >
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">
            {title}
          </h3>
          {subtitle ? (
            <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
              {subtitle}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => setShowTable((v) => !v)}
          aria-expanded={showTable}
          aria-controls={tableId}
          className="shrink-0 rounded border border-[var(--hairline)] px-2 py-1 text-xs text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
        >
          {showTable ? "Show chart" : "Show table"}
        </button>
      </div>

      {showTable ? (
        <table id={tableId} className="w-full border-collapse text-sm">
          <caption className="sr-only">{title}, as a table</caption>
          <thead>
            <tr className="border-b border-[var(--gridline)] text-left">
              <th
                scope="col"
                className="py-2 font-medium text-[var(--text-secondary)]"
              >
                Stage
              </th>
              <th
                scope="col"
                className="py-2 text-right font-medium text-[var(--text-secondary)]"
              >
                Orders
              </th>
              <th
                scope="col"
                className="py-2 text-right font-medium text-[var(--text-secondary)]"
              >
                Share
              </th>
            </tr>
          </thead>
          <tbody>
            {stages.map((stage) => (
              <tr
                key={stage.status}
                className="border-b border-[var(--gridline)]"
              >
                <th
                  scope="row"
                  className="py-2 font-normal text-[var(--text-primary)]"
                >
                  {stage.label}
                </th>
                <td className="nums-tabular py-2 text-right text-[var(--text-primary)]">
                  {stage.count}
                </td>
                <td className="nums-tabular py-2 text-right text-[var(--text-secondary)]">
                  {total ? `${Math.round((stage.count / total) * 100)}%` : "0%"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="relative" id={tableId}>
          <div
            className="pointer-events-none absolute inset-y-0"
            style={{
              left: `calc(var(--label-w) + var(--col-gap))`,
              right: `calc(var(--value-w) + var(--col-gap))`,
            }}
            aria-hidden="true"
          >
            {ticks.map((tick) => (
              <span
                key={tick}
                className="absolute inset-y-0 w-px bg-[var(--gridline)]"
                style={{ left: `${(tick / axisMax) * 100}%` }}
              />
            ))}
          </div>

          <ul className="relative flex flex-col gap-0.5">
            {stages.map((stage) => {
              const meta = ORDER_STATUS[stage.status];
              const isActive = active === stage.status;
              return (
                <li key={stage.status}>
                  <div
                    tabIndex={0}
                    role="button"
                    aria-label={`${stage.label}: ${stage.count} orders. ${meta.blurb}`}
                    onMouseEnter={() => setActive(stage.status)}
                    onMouseLeave={() => setActive(null)}
                    onFocus={() => setActive(stage.status)}
                    onBlur={() => setActive(null)}
                    className="group relative flex min-h-8 items-center rounded transition-colors hover:bg-[var(--surface-2)] focus-visible:bg-[var(--surface-2)]"
                    style={{ gap: "var(--col-gap)" }}
                  >
                    <span
                      className="flex shrink-0 items-center gap-2 pl-1 text-xs text-[var(--text-secondary)]"
                      style={{ width: "var(--label-w)" }}
                    >
                      <span style={{ color: TONE_VAR[meta.tone] }}>
                        <Icon name={meta.icon} size={14} />
                      </span>
                      <span className="truncate">{stage.label}</span>
                    </span>

                    <span className="relative flex-1">
                      <span
                        className="block h-3 transition-[width] duration-300"
                        style={{
                          width: `${(stage.count / axisMax) * 100}%`,
                          background: "var(--series-1)",
                          borderRadius: "0 4px 4px 0",
                          opacity: isActive ? 1 : 0.92,
                        }}
                      />
                    </span>

                    <span
                      className="nums-tabular shrink-0 text-right text-xs font-medium text-[var(--text-primary)]"
                      style={{ width: "var(--value-w)" }}
                    >
                      {stage.count}
                    </span>

                    {isActive ? (
                      <span
                        role="tooltip"
                        className="pointer-events-none absolute -top-1 z-10 max-w-xs -translate-y-full rounded border border-[var(--hairline)] bg-[var(--surface-2)] px-2.5 py-1.5 text-xs shadow-lg"
                        style={{
                          left: `calc(var(--label-w) + var(--col-gap))`,
                        }}
                      >
                        <span className="block font-medium text-[var(--text-primary)]">
                          {stage.label} - {stage.count}{" "}
                          {stage.count === 1 ? "order" : "orders"}
                        </span>
                        <span className="mt-0.5 block text-[var(--text-secondary)]">
                          {meta.blurb}
                        </span>
                      </span>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>

          <div
            className="relative mt-1"
            style={{
              marginLeft: `calc(var(--label-w) + var(--col-gap))`,
              marginRight: `calc(var(--value-w) + var(--col-gap))`,
            }}
          >
            <div className="h-px bg-[var(--baseline)]" aria-hidden="true" />
            <div className="relative mt-1.5 h-4">
              {ticks.map((tick) => (
                <span
                  key={tick}
                  className="nums-tabular absolute top-0 -translate-x-1/2 text-[10px] text-[var(--text-muted)]"
                  style={{ left: `${(tick / axisMax) * 100}%` }}
                >
                  {tick}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </figure>
  );
}
