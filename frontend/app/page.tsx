import Link from "next/link";

import { Card, TopBar, Wordmark } from "@/components/Chrome";
import { Icon, type IconName } from "@/components/Icon";
import { HeroFigure, StatTile } from "@/components/Figures";
import { PipelineChart } from "@/components/PipelineChart";
import { QuoteCalculator } from "@/components/QuoteCalculator";
import { getPublicStats, getServiceHealth } from "@/lib/api";
import { ORDER_STATUS, PIPELINE_ORDER, TONE_VAR } from "@/lib/status";
import type { PublicStats } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function LandingPage() {
  const [stats, health] = await Promise.all([
    getPublicStats().catch(() => null),
    getServiceHealth(),
  ]);

  return (
    <div className="min-h-screen">
      <TopBar me={null} />
      <main>
        <Hero stats={stats} health={health} />
        <PipelineSection stats={stats} />
        <StateMachineSection />
        <QuoteSection />
        <ArchitectureSection />
        <CredentialsSection />
      </main>
      <SiteFooter />
    </div>
  );
}

function Hero({
  stats,
  health,
}: {
  stats: PublicStats | null;
  health: { django: boolean; quoting: boolean };
}) {
  return (
    <section className="border-b border-[var(--hairline)]">
      <div className="mx-auto max-w-6xl px-5 py-16 sm:py-24">
        <div className="grid gap-12 lg:grid-cols-[1.15fr_1fr] lg:items-center">
          <div>
            <p
              className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs"
              style={{
                borderColor:
                  "color-mix(in oklab, var(--series-1) 35%, transparent)",
                background: "var(--series-1-wash)",
                color: "var(--text-secondary)",
              }}
            >
              <Icon name="layers" size={13} />
              Django 5 · FastAPI · Postgres · Next.js
            </p>

            <h1 className="mt-6 text-4xl font-semibold leading-[1.1] tracking-tight text-[var(--text-primary)] sm:text-5xl">
              Print-on-demand order tracking,
              <br />
              <span style={{ color: "var(--series-1)" }}>
                with the rules where they belong.
              </span>
            </h1>

            <p className="mt-5 max-w-xl text-base leading-relaxed text-[var(--text-secondary)]">
              An order moves through nine states, and only certain moves are
              legal. Every one of them is enforced in a service layer - not a
              view, not a form - and every status change writes an audit row in
              the same database transaction. Illegal moves get a{" "}
              <code className="rounded bg-[var(--surface-2)] px-1 py-0.5 text-[13px]">
                400
              </code>{" "}
              that says what <em>is</em> allowed.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/login"
                className="inline-flex items-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium text-[var(--page)] transition-opacity hover:opacity-90"
                style={{ background: "var(--series-1)" }}
              >
                Open the operator console
                <Icon name="arrow-right" size={15} />
              </Link>
              <a
                href="http://localhost:8001/docs"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-md border border-[var(--hairline)] px-4 py-2.5 text-sm text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
              >
                Quoting service docs
                <Icon name="external" size={14} />
              </a>
            </div>

            <div className="mt-8 flex flex-wrap gap-x-5 gap-y-2">
              <ServicePill label="Order service :8000" up={health.django} />
              <ServicePill label="Quoting service :8001" up={health.quoting} />
            </div>
          </div>

          <div className="rounded-xl border border-[var(--hairline)] bg-[var(--surface-1)] p-6">
            {stats ? (
              <>
                <HeroFigure
                  label="Orders in flight"
                  value={stats.orders.active}
                  caption={`${stats.transitions_recorded.toLocaleString("en-US")} status changes recorded, every one audited`}
                />
                <div className="mt-6 grid grid-cols-2 items-start gap-3">
                  <StatTile
                    label="On a printer now"
                    value={stats.orders.by_status.printing}
                    icon="printer"
                    tone="accent"
                  />
                  <StatTile
                    label="Shipped"
                    value={stats.orders.shipped}
                    icon="truck"
                    tone="good"
                  />
                  <StatTile
                    label="Needs rework"
                    value={
                      stats.orders.by_status.failed +
                      stats.orders.by_status.reprint
                    }
                    icon="alert"
                    tone="critical"
                    hint="failed or requeued"
                  />
                  <StatTile
                    label="Printers online"
                    value={stats.machines.total - stats.machines.maintenance}
                    icon="cube"
                    hint={`${stats.machines.maintenance} in maintenance`}
                  />
                </div>
              </>
            ) : (
              <p className="py-10 text-center text-sm text-[var(--text-secondary)]">
                Live counts appear here once the order service is running.
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function ServicePill({ label, up }: { label: string; up: boolean }) {
  return (
    <span className="inline-flex items-center gap-2 text-xs text-[var(--text-secondary)]">
      <span
        style={{ color: up ? "var(--status-good)" : "var(--status-critical)" }}
      >
        <Icon name={up ? "check" : "alert"} size={13} />
      </span>
      {label}
      <span className="text-[var(--text-muted)]">{up ? "up" : "down"}</span>
    </span>
  );
}

function PipelineSection({ stats }: { stats: PublicStats | null }) {
  if (!stats) return null;
  return (
    <section className="border-b border-[var(--hairline)]">
      <div className="mx-auto max-w-6xl px-5 py-14">
        <SectionHeading
          eyebrow="Live shop floor"
          title="Where the work actually is"
          blurb="Counts straight from Postgres. The seven stages below are the happy path; failures branch off it and rejoin through a reprint."
        />
        <div className="mt-8 grid items-start gap-5 lg:grid-cols-[1.4fr_1fr]">
          <Card>
            <PipelineChart
              stages={stats.pipeline}
              title="Orders by pipeline stage"
              subtitle="Ordered earliest to latest. Hover or tab through a row for detail."
            />
          </Card>

          <Card
            title="Off the happy path"
            subtitle="A failed build cannot go straight back to a printer - it must be requeued first."
          >
            <div className="space-y-3">
              {stats.exceptions.map((stage) => {
                const meta = ORDER_STATUS[stage.status];
                return (
                  <div
                    key={stage.status}
                    className="flex items-start gap-3 rounded-md border border-[var(--hairline)] p-3"
                  >
                    <span
                      className="mt-0.5 shrink-0"
                      style={{ color: TONE_VAR[meta.tone] }}
                    >
                      <Icon name={meta.icon} size={16} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="flex items-baseline justify-between gap-2 text-sm font-medium text-[var(--text-primary)]">
                        {stage.label}
                        <span className="nums-tabular">{stage.count}</span>
                      </p>
                      <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                        {meta.blurb}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      </div>
    </section>
  );
}

function StateMachineSection() {
  return (
    <section className="border-b border-[var(--hairline)]">
      <div className="mx-auto max-w-6xl px-5 py-14">
        <SectionHeading
          eyebrow="The state machine"
          title="Nine states, ten legal moves"
          blurb="One dict in one module is the whole specification. A startup assertion fails if a status is ever added to the enum without being added to the transition table."
        />

        <div className="mt-8 overflow-x-auto">
          <ol className="flex min-w-max items-center gap-1">
            {PIPELINE_ORDER.map((status, i) => {
              const meta = ORDER_STATUS[status];
              return (
                <li key={status} className="flex items-center gap-1">
                  <div
                    className="rounded-lg border border-[var(--hairline)] bg-[var(--surface-1)] px-3.5 py-3"
                    title={meta.blurb}
                  >
                    <span
                      className="flex items-center gap-2 text-xs font-medium text-[var(--text-primary)]"
                      style={{ whiteSpace: "nowrap" }}
                    >
                      <span style={{ color: TONE_VAR[meta.tone] }}>
                        <Icon name={meta.icon} size={14} />
                      </span>
                      {meta.label}
                    </span>
                  </div>
                  {i < PIPELINE_ORDER.length - 1 ? (
                    <span className="text-[var(--text-muted)]">
                      <Icon name="arrow-right" size={14} />
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ol>

          <div className="mt-4 flex min-w-max items-center gap-3 text-xs text-[var(--text-secondary)]">
            <span className="inline-flex items-center gap-1.5">
              <span style={{ color: "var(--status-critical)" }}>
                <Icon name="alert" size={13} />
              </span>
              printing or qc → failed
            </span>
            <span className="text-[var(--text-muted)]">·</span>
            <span className="inline-flex items-center gap-1.5">
              <span style={{ color: "var(--status-warning)" }}>
                <Icon name="rotate" size={13} />
              </span>
              failed → reprint → printing
            </span>
            <span className="text-[var(--text-muted)]">·</span>
            <span>shipped is terminal</span>
          </div>
        </div>

        <div className="mt-10 grid gap-5 sm:grid-cols-3">
          <Principle
            icon="layers"
            title="Rules in a service layer"
            body="transition_order() is the only way a status ever changes - not the view, not the serializer, not the admin. The same rule holds whether the change comes from the API, a management command or a shell session."
          />
          <Principle
            icon="check"
            title="Audited in one transaction"
            body="The status UPDATE and the audit INSERT commit together or not at all. A test forces the audit write to fail and asserts the status change rolls back with it."
          />
          <Principle
            icon="bolt"
            title="Degrades instead of failing"
            body="If the quoting service times out, the order is saved as quote_pending and returns 201 - never a 500. Retry it later with the requote endpoint."
          />
        </div>
      </div>
    </section>
  );
}

function Principle({
  icon,
  title,
  body,
}: {
  icon: IconName;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-lg border border-[var(--hairline)] bg-[var(--surface-1)] p-5">
      <span style={{ color: "var(--series-1)" }}>
        <Icon name={icon} size={18} />
      </span>
      <h3 className="mt-3 text-sm font-semibold text-[var(--text-primary)]">
        {title}
      </h3>
      <p className="mt-1.5 text-xs leading-relaxed text-[var(--text-secondary)]">
        {body}
      </p>
    </div>
  );
}

function QuoteSection() {
  return (
    <section className="border-b border-[var(--hairline)]">
      <div className="mx-auto max-w-6xl px-5 py-14">
        <SectionHeading
          eyebrow="Service 2 · FastAPI"
          title="Price a part right now"
          blurb="This form posts to the real quoting service. Drop the quantity to three or fewer to see the rush multiplier kick in - and the lead time drop."
        />
        <div className="mt-8">
          <Card>
            <QuoteCalculator />
          </Card>
        </div>
      </div>
    </section>
  );
}

function ArchitectureSection() {
  const services = [
    {
      name: "Next.js",
      port: "3000",
      role: "This UI. Server components fetch over the private network; the API token lives in an httpOnly cookie, so no credential ever reaches the browser.",
      icon: "layers" as IconName,
    },
    {
      name: "Django 5 + DRF",
      port: "8000",
      role: "Owns the domain: machines, parts, orders, the state machine, the audit log, token auth and the customer/operator split.",
      icon: "cube" as IconName,
    },
    {
      name: "FastAPI",
      port: "8001",
      role: "Stateless pricing. Async, Pydantic v2 validation, auto-generated OpenAPI docs. Django calls it over HTTP when an order is created.",
      icon: "bolt" as IconName,
    },
  ];

  return (
    <section className="border-b border-[var(--hairline)]">
      <div className="mx-auto max-w-6xl px-5 py-14">
        <SectionHeading
          eyebrow="Architecture"
          title="Three services, one private network"
          blurb="The browser only ever talks to Next.js. Django and FastAPI talk to each other by compose service name."
        />
        <div className="mt-8 grid gap-5 sm:grid-cols-3">
          {services.map((s) => (
            <div
              key={s.name}
              className="rounded-lg border border-[var(--hairline)] bg-[var(--surface-1)] p-5"
            >
              <div className="flex items-center justify-between">
                <span style={{ color: "var(--series-1)" }}>
                  <Icon name={s.icon} size={18} />
                </span>
                <span className="nums-tabular rounded border border-[var(--hairline)] px-1.5 py-0.5 text-[10px] text-[var(--text-muted)]">
                  :{s.port}
                </span>
              </div>
              <h3 className="mt-3 text-sm font-semibold text-[var(--text-primary)]">
                {s.name}
              </h3>
              <p className="mt-1.5 text-xs leading-relaxed text-[var(--text-secondary)]">
                {s.role}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function CredentialsSection() {
  const accounts = [
    {
      role: "Operator",
      user: "omar_operator",
      password: "operator-pass-123",
      can: "Sees every order. Can transition, requote, and manage machines and parts.",
    },
    {
      role: "Customer",
      user: "alice_customer",
      password: "customer-pass-123",
      can: "Sees only her own orders, read-only. Every transition control is gone - enforced server-side, not hidden in the UI.",
    },
  ];

  return (
    <section>
      <div className="mx-auto max-w-6xl px-5 py-14">
        <SectionHeading
          eyebrow="Try it"
          title="Two roles, same URLs"
          blurb="Sign in as each and compare. The customer's order list is filtered in SQL, so it is not a matter of hiding buttons."
        />
        <div className="mt-8 grid gap-5 sm:grid-cols-2">
          {accounts.map((a) => (
            <div
              key={a.user}
              className="rounded-lg border border-[var(--hairline)] bg-[var(--surface-1)] p-5"
            >
              <p className="text-xs uppercase tracking-wider text-[var(--text-muted)]">
                {a.role}
              </p>
              <dl className="mt-3 space-y-1.5 text-sm">
                <div className="flex gap-2">
                  <dt className="w-20 shrink-0 text-[var(--text-secondary)]">
                    User
                  </dt>
                  <dd className="font-medium text-[var(--text-primary)]">
                    {a.user}
                  </dd>
                </div>
                <div className="flex gap-2">
                  <dt className="w-20 shrink-0 text-[var(--text-secondary)]">
                    Password
                  </dt>
                  <dd className="text-[var(--text-primary)]">{a.password}</dd>
                </div>
              </dl>
              <p className="mt-3 text-xs leading-relaxed text-[var(--text-secondary)]">
                {a.can}
              </p>
            </div>
          ))}
        </div>
        <div className="mt-8">
          <Link
            href="/login"
            className="inline-flex items-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium text-[var(--page)] transition-opacity hover:opacity-90"
            style={{ background: "var(--series-1)" }}
          >
            Sign in
            <Icon name="arrow-right" size={15} />
          </Link>
        </div>
      </div>
    </section>
  );
}

function SectionHeading({
  eyebrow,
  title,
  blurb,
}: {
  eyebrow: string;
  title: string;
  blurb?: string;
}) {
  return (
    <div className="max-w-2xl">
      <p
        className="text-xs uppercase tracking-wider"
        style={{ color: "var(--series-1)" }}
      >
        {eyebrow}
      </p>
      <h2 className="mt-2 text-2xl font-semibold tracking-tight text-[var(--text-primary)]">
        {title}
      </h2>
      {blurb ? (
        <p className="mt-3 text-sm leading-relaxed text-[var(--text-secondary)]">
          {blurb}
        </p>
      ) : null}
    </div>
  );
}

function SiteFooter() {
  return (
    <footer className="border-t border-[var(--hairline)]">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-8 sm:flex-row sm:items-center sm:justify-between">
        <Wordmark />
        <nav className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-[var(--text-secondary)]">
          <a
            href="http://localhost:8000/api/"
            target="_blank"
            rel="noreferrer"
            className="transition-colors hover:text-[var(--text-primary)]"
          >
            Browsable API
          </a>
          <a
            href="http://localhost:8000/admin/"
            target="_blank"
            rel="noreferrer"
            className="transition-colors hover:text-[var(--text-primary)]"
          >
            Django admin
          </a>
          <a
            href="http://localhost:8001/docs"
            target="_blank"
            rel="noreferrer"
            className="transition-colors hover:text-[var(--text-primary)]"
          >
            OpenAPI docs
          </a>
        </nav>
      </div>
    </footer>
  );
}
