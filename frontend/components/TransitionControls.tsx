"use client";

import { useState, useTransition } from "react";

import { Icon } from "@/components/Icon";
import { requoteOrder, transitionOrder } from "@/lib/actions";
import { ORDER_STATUS, TONE_VAR } from "@/lib/status";
import type { Machine, Order, OrderStatus } from "@/lib/types";

interface Props {
  order: Order;
  machines: Machine[];
}

export function TransitionControls({ order, machines }: Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [okMessage, setOkMessage] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [machineId, setMachineId] = useState<string>(
    order.machine ? String(order.machine) : "",
  );

  const material = order.part_detail?.material ?? "";
  const wantedTech = material.startsWith("resin") ? "SLA" : "SLS";
  const eligible = machines.filter(
    (m) => m.technology === wantedTech && m.status !== "maintenance",
  );

  const needsMachine = (to: OrderStatus) => to === "printing";

  function run(to: OrderStatus) {
    setError(null);
    setOkMessage(null);
    startTransition(async () => {
      const result = await transitionOrder(
        order.id,
        to,
        note,
        machineId ? Number(machineId) : null,
      );
      if (result.ok) {
        setNote("");
        setOkMessage(`Moved to ${ORDER_STATUS[to].label.toLowerCase()}.`);
      } else {
        setError(result.error ?? "The transition was rejected.");
      }
    });
  }

  function runRequote() {
    setError(null);
    setOkMessage(null);
    startTransition(async () => {
      const result = await requoteOrder(order.id);
      if (result.ok) setOkMessage("Quote retrieved.");
      else setError(result.error ?? "Requote failed.");
    });
  }

  const canRequote = order.status === "quote_pending";
  const hasMoves = order.allowed_transitions.length > 0;

  return (
    <div style={{ opacity: pending ? 0.6 : 1 }} className="transition-opacity">
      {!hasMoves && !canRequote ? (
        <p className="text-sm text-[var(--text-secondary)]">
          This order is in a terminal state. Nothing further to do.
        </p>
      ) : null}

      {canRequote ? (
        <div className="mb-4">
          <p className="mb-2 text-xs text-[var(--text-secondary)]">
            This order has no price - the quoting service was unreachable when
            it was created. Retry it:
          </p>
          <button
            type="button"
            onClick={runRequote}
            disabled={pending}
            className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-[var(--page)] transition-opacity hover:opacity-90 disabled:opacity-60"
            style={{ background: "var(--series-1)" }}
          >
            <Icon name="rotate" size={14} />
            Retry quote
          </button>
        </div>
      ) : null}

      {hasMoves ? (
        <>
          {order.allowed_transitions.some(needsMachine) ? (
            <div className="mb-4">
              <label
                htmlFor="machine"
                className="mb-1.5 block text-xs text-[var(--text-secondary)]"
              >
                Printer{" "}
                <span className="text-[var(--text-muted)]">
                  ({wantedTech} - required to start a build)
                </span>
              </label>
              <select
                id="machine"
                value={machineId}
                onChange={(event) => setMachineId(event.target.value)}
                className="w-full rounded-md border border-[var(--hairline)] bg-[var(--surface-2)] px-2.5 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--series-1)]"
              >
                <option value="">Not assigned</option>
                {eligible.map((machine) => (
                  <option key={machine.id} value={machine.id}>
                    {machine.name} - {machine.status}
                  </option>
                ))}
              </select>
              {eligible.length === 0 ? (
                <p
                  className="mt-1.5 text-xs"
                  style={{ color: "var(--status-warning)" }}
                >
                  No {wantedTech} printer is available. Bring one out of
                  maintenance first.
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="mb-4">
            <label
              htmlFor="note"
              className="mb-1.5 block text-xs text-[var(--text-secondary)]"
            >
              Note{" "}
              <span className="text-[var(--text-muted)]">
                (goes in the audit log)
              </span>
            </label>
            <input
              id="note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="e.g. Layer shift at 40mm"
              className="w-full rounded-md border border-[var(--hairline)] bg-[var(--surface-2)] px-2.5 py-2 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--series-1)]"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {order.allowed_transitions.map((to) => {
              const meta = ORDER_STATUS[to];
              return (
                <button
                  key={to}
                  type="button"
                  onClick={() => run(to)}
                  disabled={pending}
                  title={meta.blurb}
                  className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-colors disabled:opacity-60"
                  style={{
                    borderColor: `color-mix(in oklab, ${TONE_VAR[meta.tone]} 45%, transparent)`,
                    background: `color-mix(in oklab, ${TONE_VAR[meta.tone]} 12%, transparent)`,
                    color: "var(--text-primary)",
                  }}
                >
                  <span style={{ color: TONE_VAR[meta.tone] }}>
                    <Icon name={meta.icon} size={14} />
                  </span>
                  {meta.label}
                </button>
              );
            })}
          </div>
        </>
      ) : null}

      {error ? (
        <p
          role="alert"
          className="mt-4 flex items-start gap-2 rounded-md px-3 py-2.5 text-xs"
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

          {error}
        </p>
      ) : null}

      {okMessage ? (
        <p
          role="status"
          className="mt-4 flex items-center gap-2 rounded-md px-3 py-2.5 text-xs"
          style={{
            background:
              "color-mix(in oklab, var(--status-good) 12%, transparent)",
            color: "var(--text-primary)",
          }}
        >
          <span style={{ color: "var(--status-good)" }} className="shrink-0">
            <Icon name="check" size={13} />
          </span>
          {okMessage}
        </p>
      ) : null}
    </div>
  );
}
