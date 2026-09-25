import Link from "next/link";
import { notFound } from "next/navigation";

import { Card, Empty, ServiceDown, TopBar } from "@/components/Chrome";
import { Icon } from "@/components/Icon";
import { MachineStatusBadge, OrderStatusBadge } from "@/components/StatusBadge";
import { TransitionControls } from "@/components/TransitionControls";
import { ApiError, getMachines, getOrder, getOrderAudit } from "@/lib/api";
import { requireMe } from "@/lib/session";
import {
  formatDateTime,
  formatMoney,
  formatRelative,
  MATERIAL_LABEL,
  ORDER_STATUS,
  technologyFor,
  TONE_VAR,
} from "@/lib/status";
import type { AuditEntry } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return { title: `Order #${id} - Build3D` };
}

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const me = await requireMe();
  const { id } = await params;

  let order;
  let audit: AuditEntry[] = [];
  try {
    [order, audit] = await Promise.all([getOrder(id), getOrderAudit(id)]);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    return (
      <div className="min-h-screen">
        <TopBar me={me} current="/orders" />
        <main className="mx-auto max-w-4xl px-5 py-8">
          <ServiceDown
            service="The order service"
            hint={error instanceof ApiError ? error.detail : undefined}
          />
        </main>
      </div>
    );
  }

  const isOperator = me.role === "operator";
  const machines = isOperator
    ? ((await getMachines().catch(() => null))?.results ?? [])
    : [];
  const part = order.part_detail;

  return (
    <div className="min-h-screen">
      <TopBar me={me} current="/orders" />
      <main className="mx-auto max-w-5xl px-5 py-8">
        <Link
          href="/orders"
          className="text-xs text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
        >
          ← All orders
        </Link>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <h1 className="nums-tabular text-xl font-semibold tracking-tight text-[var(--text-primary)]">
            Order #{order.id}
          </h1>
          <OrderStatusBadge status={order.status} />
        </div>
        <p className="mt-1.5 text-xs text-[var(--text-muted)]">
          Created {formatDateTime(order.created_at)} · updated{" "}
          {formatRelative(order.updated_at)}
          {order.customer_username ? ` · ${order.customer_username}` : ""}
        </p>

        <div className="mt-6 grid gap-5 lg:grid-cols-[1.1fr_1fr]">
          <div className="space-y-5">
            <Card title="Part">
              {part ? (
                <dl className="space-y-2.5 text-sm">
                  <Row label="Name" value={part.name} />
                  <Row
                    label="Material"
                    value={`${MATERIAL_LABEL[part.material]} · ${technologyFor(part.material)}`}
                  />
                  <Row label="Quantity" value={`×${part.quantity}`} />
                  <Row
                    label="Bounding box"
                    value={`${part.length_mm} × ${part.width_mm} × ${part.height_mm} mm`}
                  />
                </dl>
              ) : (
                <Empty>Part details not available.</Empty>
              )}
            </Card>

            <Card title="Quote">
              <dl className="space-y-2.5 text-sm">
                <Row label="Price" value={formatMoney(order.quoted_price)} />
                <Row
                  label="Lead time"
                  value={
                    order.quoted_lead_days
                      ? `${order.quoted_lead_days} working days`
                      : "-"
                  }
                />
              </dl>
              {order.status === "quote_pending" ? (
                <p className="mt-3 text-xs text-[var(--text-muted)]">
                  Saved without a price because the quoting service was
                  unreachable. The order was still created - it did not fail.
                </p>
              ) : null}
            </Card>

            <Card title="Printer">
              {order.machine_detail ? (
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm text-[var(--text-primary)]">
                      {order.machine_detail.name}
                    </p>
                    <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                      {order.machine_detail.technology}
                    </p>
                  </div>
                  <MachineStatusBadge
                    status={order.machine_detail.status}
                    size="sm"
                  />
                </div>
              ) : (
                <Empty>No printer assigned.</Empty>
              )}
            </Card>
          </div>

          <div className="space-y-5">
            <Card
              title={isOperator ? "Advance this order" : "Status"}
              subtitle={
                isOperator
                  ? "Only the moves the state machine permits are offered."
                  : "Customers have read-only access; an operator advances orders."
              }
            >
              {isOperator ? (
                <TransitionControls order={order} machines={machines} />
              ) : (
                <div>
                  <p className="text-sm text-[var(--text-secondary)]">
                    {ORDER_STATUS[order.status].blurb}
                  </p>
                  {order.allowed_transitions.length > 0 ? (
                    <p className="mt-3 text-xs text-[var(--text-muted)]">
                      Next possible:{" "}
                      {order.allowed_transitions
                        .map((s) => ORDER_STATUS[s].label)
                        .join(", ")}
                    </p>
                  ) : null}
                </div>
              )}
            </Card>

            <Card
              title="Audit trail"
              subtitle={`${audit.length} ${audit.length === 1 ? "entry" : "entries"} · written in the same transaction as each status change`}
            >
              {audit.length === 0 ? (
                <Empty>No history recorded.</Empty>
              ) : (
                <ol className="relative space-y-4">
                  {audit.map((entry, index) => (
                    <TimelineEntry
                      key={entry.id}
                      entry={entry}
                      last={index === audit.length - 1}
                    />
                  ))}
                </ol>
              )}
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3">
      <dt className="w-28 shrink-0 text-[var(--text-secondary)]">{label}</dt>
      <dd className="min-w-0 flex-1 text-[var(--text-primary)]">{value}</dd>
    </div>
  );
}

function TimelineEntry({ entry, last }: { entry: AuditEntry; last: boolean }) {
  const meta = ORDER_STATUS[entry.to_status];
  return (
    <li className="flex gap-3">
      <div className="flex flex-col items-center">
        <span
          className="grid size-6 shrink-0 place-items-center rounded-full"
          style={{
            background: `color-mix(in oklab, ${TONE_VAR[meta.tone]} 15%, transparent)`,
            color: TONE_VAR[meta.tone],
          }}
        >
          <Icon name={meta.icon} size={13} />
        </span>

        {!last ? (
          <span className="mt-1 w-px flex-1 bg-[var(--gridline)]" />
        ) : null}
      </div>
      <div className="min-w-0 flex-1 pb-1">
        <p className="text-sm text-[var(--text-primary)]">
          {entry.from_status ? (
            <>
              <span className="text-[var(--text-secondary)]">
                {ORDER_STATUS[entry.from_status].label}
              </span>
              <span className="mx-1.5 text-[var(--text-muted)]">→</span>
            </>
          ) : (
            <span className="mr-1.5 text-[var(--text-secondary)]">
              Created as
            </span>
          )}
          <span className="font-medium">{meta.label}</span>
        </p>
        {entry.note ? (
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            {entry.note}
          </p>
        ) : null}
        <p className="mt-1 text-[11px] text-[var(--text-muted)]">
          {entry.actor_username ?? "system"} · {formatDateTime(entry.timestamp)}
        </p>
      </div>
    </li>
  );
}
