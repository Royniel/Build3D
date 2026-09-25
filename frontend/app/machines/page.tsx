import Link from "next/link";

import { Card, Empty, ServiceDown, TopBar } from "@/components/Chrome";
import { Meter, StatTile } from "@/components/Figures";
import { MachineStatusBadge } from "@/components/StatusBadge";
import { ApiError, getMachines, getOrders } from "@/lib/api";
import { requireMe } from "@/lib/session";
import { MACHINE_STATUS } from "@/lib/status";

export const dynamic = "force-dynamic";
export const metadata = { title: "Machines - Build3D" };

export default async function MachinesPage() {
  const me = await requireMe();

  let machines;
  try {
    machines = (await getMachines()).results;
  } catch (error) {
    return (
      <div className="min-h-screen">
        <TopBar me={me} current="/machines" />
        <main className="mx-auto max-w-5xl px-5 py-8">
          <ServiceDown
            service="The order service"
            hint={error instanceof ApiError ? error.detail : undefined}
          />
        </main>
      </div>
    );
  }

  const orders = (await getOrders().catch(() => null))?.results ?? [];
  const busy = machines.filter((m) => m.status === "printing").length;
  const idle = machines.filter((m) => m.status === "idle").length;
  const down = machines.filter((m) => m.status === "maintenance").length;
  const online = machines.length - down;

  const byTech = {
    SLA: machines.filter((m) => m.technology === "SLA"),
    SLS: machines.filter((m) => m.technology === "SLS"),
  };

  return (
    <div className="min-h-screen">
      <TopBar me={me} current="/machines" />
      <main className="mx-auto max-w-5xl px-5 py-8">
        <h1 className="mb-5 text-xl font-semibold tracking-tight text-[var(--text-primary)]">
          Printers
        </h1>

        <div className="grid gap-5 sm:grid-cols-3">
          <StatTile
            label="Printing"
            value={busy}
            icon="printer"
            tone="accent"
          />
          <StatTile label="Idle" value={idle} icon="pause" />
          <StatTile
            label="In maintenance"
            value={down}
            icon="wrench"
            tone="warning"
            hint="the state machine refuses to schedule work on these"
          />
        </div>

        <div className="mt-5">
          <Card
            title="Utilisation"
            subtitle="Share of online printers currently running a build."
          >
            <Meter
              label="Busy printers"
              value={busy}
              max={Math.max(online, 1)}
              readout={`${busy} of ${online} online`}
            />
          </Card>
        </div>

        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          {(["SLA", "SLS"] as const).map((tech) => (
            <Card
              key={tech}
              title={tech === "SLA" ? "SLA - resins" : "SLS - nylons"}
              subtitle={`${byTech[tech].length} ${byTech[tech].length === 1 ? "machine" : "machines"}`}
            >
              {byTech[tech].length === 0 ? (
                <Empty>No {tech} machines.</Empty>
              ) : (
                <ul className="space-y-2">
                  {byTech[tech].map((machine) => {
                    const current = orders.find(
                      (o) =>
                        o.machine === machine.id && o.status === "printing",
                    );
                    return (
                      <li
                        key={machine.id}
                        className="rounded-md border border-[var(--hairline)] px-3 py-2.5"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <p className="truncate text-sm font-medium text-[var(--text-primary)]">
                            {machine.name}
                          </p>
                          <MachineStatusBadge
                            status={machine.status}
                            size="sm"
                          />
                        </div>
                        <p className="mt-1 text-xs text-[var(--text-secondary)]">
                          {current ? (
                            <>
                              Running{" "}
                              <Link
                                href={`/orders/${current.id}`}
                                className="underline-offset-2 hover:underline"
                              >
                                order #{current.id}
                              </Link>
                              {current.part_detail
                                ? ` · ${current.part_detail.name}`
                                : ""}
                            </>
                          ) : (
                            MACHINE_STATUS[machine.status].blurb
                          )}
                        </p>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          ))}
        </div>

        <p className="mt-5 text-xs text-[var(--text-muted)]">
          Machine status is kept in step with orders by the service layer:
          starting a build marks the printer as printing, and leaving `printing`
          frees it - both inside the same transaction as the order's status
          change. A printer flagged for maintenance is never overwritten by the
          workflow.
        </p>
      </main>
    </div>
  );
}
