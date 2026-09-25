import Link from "next/link";

import { Card, Empty, ServiceDown, TopBar } from "@/components/Chrome";
import { HeroFigure, Meter, StatTile } from "@/components/Figures";
import { Icon } from "@/components/Icon";
import { PipelineChart } from "@/components/PipelineChart";
import { MachineStatusBadge, OrderStatusBadge } from "@/components/StatusBadge";
import { ApiError, getMachines, getOrders, getRecentAudit } from "@/lib/api";
import { requireMe } from "@/lib/session";
import {
  formatRelative,
  ORDER_STATUS,
  PIPELINE_ORDER,
  TONE_VAR,
} from "@/lib/status";
import type { AuditEntry, Machine, Order, OrderStatus } from "@/lib/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dashboard - Build3D" };

export default async function DashboardPage() {
  const me = await requireMe();

  const [ordersResult, machinesResult, auditResult] = await Promise.allSettled([
    getOrders(),
    getMachines(),
    getRecentAudit(10),
  ]);

  if (ordersResult.status === "rejected") {
    const error = ordersResult.reason;
    return (
      <Shell me={me}>
        <ServiceDown
          service="The order service"
          hint={
            error instanceof ApiError
              ? error.detail
              : "Check that the django container is running."
          }
        />
      </Shell>
    );
  }

  const orders = ordersResult.value.results;
  const machines =
    machinesResult.status === "fulfilled" ? machinesResult.value.results : [];
  const audit =
    auditResult.status === "fulfilled" ? auditResult.value.results : [];

  const counts = countByStatus(orders);
  const active = orders.filter((o) => o.status !== "shipped").length;
  const busyMachines = machines.filter((m) => m.status === "printing").length;
  const onlineMachines = machines.filter(
    (m) => m.status !== "maintenance",
  ).length;

  const labels: Record<string, string> = Object.fromEntries(
    Object.entries(ORDER_STATUS).map(([k, v]) => [k, v.label]),
  );

  return (
    <Shell me={me}>
      <div className="grid items-start gap-5 lg:grid-cols-[1fr_2fr]">
        <Card>
          <HeroFigure
            label="Orders in flight"
            value={active}
            caption={
              me.role === "operator"
                ? "Across every customer"
                : "Your orders still in progress"
            }
          />
          <div className="mt-6 border-t border-[var(--gridline)] pt-5">
            <Meter
              label="Printer utilisation"
              value={busyMachines}
              max={Math.max(onlineMachines, 1)}
              readout={`${busyMachines} of ${onlineMachines} busy`}
            />
          </div>
        </Card>

        <div className="grid grid-cols-2 items-start gap-5 sm:grid-cols-4">
          <StatTile
            label="Awaiting payment"
            value={counts.quoted}
            icon="tag"
            tone="accent"
          />
          <StatTile
            label="On a printer"
            value={counts.printing}
            icon="printer"
            tone="accent"
          />
          <StatTile
            label="In finishing"
            value={counts.post_processing + counts.qc}
            icon="search"
            tone="accent"
            hint="post-processing or QC"
          />
          <StatTile
            label="Needs rework"
            value={counts.failed + counts.reprint}
            icon="alert"
            tone="critical"
            hint="failed or requeued"
          />
        </div>
      </div>

      <div className="mt-5 grid items-start gap-5 lg:grid-cols-[1.3fr_1fr]">
        <Card>
          <PipelineChart
            stages={PIPELINE_ORDER.map((status) => ({
              status,
              label: labels[status],
              count: counts[status],
            }))}
            title="Orders by pipeline stage"
            subtitle="Hover or tab through a row for detail."
          />
        </Card>

        <Card
          title="Printers"
          subtitle={`${machines.length} machines`}
          action={
            <Link
              href="/machines"
              className="text-xs text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
            >
              Manage →
            </Link>
          }
        >
          {machines.length === 0 ? (
            <Empty>No machines yet.</Empty>
          ) : (
            <ul className="space-y-2">
              {machines.map((machine) => (
                <MachineRow
                  key={machine.id}
                  machine={machine}
                  orders={orders}
                />
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="mt-5 grid items-start gap-5 lg:grid-cols-[1.3fr_1fr]">
        <Card
          title="Needs attention"
          subtitle="Orders the state machine will not advance on its own."
        >
          <NeedsAttention orders={orders} />
        </Card>

        <Card title="Recent activity" subtitle="Straight from the audit log.">
          {audit.length === 0 ? (
            <Empty>No status changes recorded yet.</Empty>
          ) : (
            <ol className="space-y-3">
              {audit.map((entry) => (
                <ActivityRow key={entry.id} entry={entry} />
              ))}
            </ol>
          )}
        </Card>
      </div>
    </Shell>
  );
}

function Shell({
  me,
  children,
}: {
  me: Awaited<ReturnType<typeof requireMe>>;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen">
      <TopBar me={me} current="/dashboard" />
      <main className="mx-auto max-w-6xl px-5 py-8">
        <h1 className="mb-6 text-xl font-semibold tracking-tight text-[var(--text-primary)]">
          Shop floor
        </h1>
        {children}
      </main>
    </div>
  );
}

function countByStatus(orders: Order[]): Record<OrderStatus, number> {
  const zero = Object.fromEntries(
    Object.keys(ORDER_STATUS).map((k) => [k, 0]),
  ) as Record<OrderStatus, number>;
  for (const order of orders) zero[order.status] += 1;
  return zero;
}

function MachineRow({
  machine,
  orders,
}: {
  machine: Machine;
  orders: Order[];
}) {
  const current = orders.find(
    (o) => o.machine === machine.id && o.status === "printing",
  );
  return (
    <li className="flex items-center justify-between gap-3 rounded-md border border-[var(--hairline)] px-3 py-2.5">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-[var(--text-primary)]">
          {machine.name}
          <span className="ml-2 text-xs font-normal text-[var(--text-muted)]">
            {machine.technology}
          </span>
        </p>
        {current ? (
          <p className="mt-0.5 truncate text-xs text-[var(--text-secondary)]">
            Order #{current.id} · {current.part_detail?.name ?? "part"}
          </p>
        ) : null}
      </div>
      <MachineStatusBadge status={machine.status} size="sm" />
    </li>
  );
}

function NeedsAttention({ orders }: { orders: Order[] }) {
  const priority: OrderStatus[] = [
    "failed",
    "quote_pending",
    "reprint",
    "qc",
    "quoted",
  ];
  const flagged = orders
    .filter((o) => priority.includes(o.status))
    .sort((a, b) => priority.indexOf(a.status) - priority.indexOf(b.status))
    .slice(0, 8);

  if (flagged.length === 0) {
    return <Empty>Nothing is blocked. Every order is moving.</Empty>;
  }

  return (
    <ul className="space-y-2">
      {flagged.map((order) => (
        <li key={order.id}>
          <Link
            href={`/orders/${order.id}`}
            className="flex items-center justify-between gap-3 rounded-md border border-[var(--hairline)] px-3 py-2.5 transition-colors hover:bg-[var(--surface-2)]"
          >
            <span className="min-w-0">
              <span className="block truncate text-sm text-[var(--text-primary)]">
                #{order.id} · {order.part_detail?.name ?? "part"}
              </span>
              <span className="mt-0.5 block text-xs text-[var(--text-muted)]">
                {order.allowed_transitions.length > 0
                  ? `Next: ${order.allowed_transitions.map((s) => ORDER_STATUS[s].label).join(", ")}`
                  : "Terminal"}
              </span>
            </span>
            <OrderStatusBadge status={order.status} size="sm" />
          </Link>
        </li>
      ))}
    </ul>
  );
}

function ActivityRow({ entry }: { entry: AuditEntry }) {
  const meta = ORDER_STATUS[entry.to_status];
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 shrink-0" style={{ color: TONE_VAR[meta.tone] }}>
        <Icon name={meta.icon} size={15} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-[var(--text-primary)]">
          <Link
            href={`/orders/${entry.order}`}
            className="font-medium underline-offset-2 hover:underline"
          >
            #{entry.order}
          </Link>{" "}
          <span className="text-[var(--text-secondary)]">
            {entry.from_status
              ? ORDER_STATUS[entry.from_status].label
              : "Created"}{" "}
            → {meta.label}
          </span>
        </p>
        <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
          {entry.actor_username ?? "system"} · {formatRelative(entry.timestamp)}
        </p>
      </div>
    </li>
  );
}
