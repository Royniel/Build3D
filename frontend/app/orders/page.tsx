import Link from "next/link";

import { Card, Empty, ServiceDown, TopBar } from "@/components/Chrome";
import { Icon } from "@/components/Icon";
import { CatalogueOrderPanel } from "@/components/CatalogueOrderPanel";
import { NewOrderPanel } from "@/components/NewOrderPanel";
import { OrderStatusBadge } from "@/components/StatusBadge";
import { ApiError, getOrders, getParts } from "@/lib/api";
import { requireMe } from "@/lib/session";
import {
  formatMoney,
  formatRelative,
  MATERIAL_LABEL,
  ORDER_STATUS,
} from "@/lib/status";
import type { OrderStatus } from "@/lib/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Orders - Build3D" };

const STATUSES = Object.keys(ORDER_STATUS) as OrderStatus[];

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const me = await requireMe();
  const { status } = await searchParams;
  const activeStatus =
    status && STATUSES.includes(status as OrderStatus) ? status : null;

  let orders;
  try {
    orders = await getOrders(activeStatus ? { status: activeStatus } : {});
  } catch (error) {
    return (
      <Shell me={me}>
        <ServiceDown
          service="The order service"
          hint={error instanceof ApiError ? error.detail : undefined}
        />
      </Shell>
    );
  }

  const parts = await getParts().catch(() => null);

  return (
    <Shell me={me}>
      <nav
        aria-label="Filter by status"
        className="mb-5 flex flex-wrap gap-1.5"
      >
        <FilterChip href="/orders" label="All" active={!activeStatus} />
        {STATUSES.map((s) => (
          <FilterChip
            key={s}
            href={`/orders?status=${s}`}
            label={ORDER_STATUS[s].label}
            active={activeStatus === s}
          />
        ))}
      </nav>

      <div className="mb-5">
        {me.role === "operator" ? (
          <NewOrderPanel />
        ) : (
          <CatalogueOrderPanel parts={parts?.results ?? []} />
        )}
      </div>

      <Card
        title={
          activeStatus
            ? `${ORDER_STATUS[activeStatus as OrderStatus].label} orders`
            : "All orders"
        }
        subtitle={`${orders.count} ${orders.count === 1 ? "order" : "orders"}${
          me.role === "customer" ? " · only yours are visible" : ""
        }`}
      >
        {orders.results.length === 0 ? (
          <Empty>
            {activeStatus
              ? "No orders in this status."
              : "No orders yet. Create one above."}
          </Empty>
        ) : (
          <div className="-mx-2 overflow-x-auto">
            <table className="w-full min-w-[46rem] border-collapse text-sm">
              <thead>
                <tr className="border-b border-[var(--gridline)] text-left">
                  {[
                    "Order",
                    "Part",
                    "Status",
                    "Price",
                    "Machine",
                    "Updated",
                  ].map((heading) => (
                    <th
                      key={heading}
                      scope="col"
                      className="px-2 py-2 text-xs font-medium text-[var(--text-secondary)]"
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {orders.results.map((order) => (
                  <tr
                    key={order.id}
                    className="border-b border-[var(--gridline)] transition-colors hover:bg-[var(--surface-2)]"
                  >
                    <td className="px-2 py-3">
                      <Link
                        href={`/orders/${order.id}`}
                        className="nums-tabular font-medium text-[var(--text-primary)] underline-offset-2 hover:underline"
                      >
                        #{order.id}
                      </Link>
                      {order.customer_username ? (
                        <span className="mt-0.5 block text-[11px] text-[var(--text-muted)]">
                          {order.customer_username}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-2 py-3">
                      <span className="block max-w-[14rem] truncate text-[var(--text-primary)]">
                        {order.part_detail?.name ?? "-"}
                      </span>
                      {order.part_detail ? (
                        <span className="mt-0.5 block text-[11px] text-[var(--text-muted)]">
                          {MATERIAL_LABEL[order.part_detail.material]} · ×
                          {order.part_detail.quantity}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-2 py-3">
                      <OrderStatusBadge status={order.status} size="sm" />
                    </td>
                    <td className="nums-tabular px-2 py-3 text-[var(--text-primary)]">
                      {formatMoney(order.quoted_price)}
                      {order.quoted_lead_days ? (
                        <span className="mt-0.5 block text-[11px] text-[var(--text-muted)]">
                          {order.quoted_lead_days} d lead
                        </span>
                      ) : null}
                    </td>
                    <td className="px-2 py-3 text-[var(--text-secondary)]">
                      {order.machine_detail?.name ?? "-"}
                    </td>
                    <td className="px-2 py-3 text-[11px] text-[var(--text-muted)]">
                      {formatRelative(order.updated_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {parts && parts.results.length > 0 ? (
        <p className="mt-4 text-xs text-[var(--text-muted)]">
          {parts.results.length} part definitions on file.
        </p>
      ) : null}
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
      <TopBar me={me} current="/orders" />
      <main className="mx-auto max-w-6xl px-5 py-8">
        <h1 className="mb-5 text-xl font-semibold tracking-tight text-[var(--text-primary)]">
          Orders
        </h1>
        {children}
      </main>
    </div>
  );
}

function FilterChip({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className={[
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors",
        active
          ? "border-transparent font-medium"
          : "border-[var(--hairline)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
      ].join(" ")}
      style={
        active
          ? { background: "var(--series-1)", color: "var(--page)" }
          : undefined
      }
    >
      {active ? <Icon name="check" size={12} /> : null}
      {label}
    </Link>
  );
}
