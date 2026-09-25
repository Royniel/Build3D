import type { MachineStatus, Material, OrderStatus } from "./types";
import type { IconName } from "@/components/Icon";

export type Tone = "neutral" | "accent" | "good" | "warning" | "critical";

export const TONE_VAR: Record<Tone, string> = {
  neutral: "var(--text-muted)",
  accent: "var(--series-1)",
  good: "var(--status-good)",
  warning: "var(--status-warning)",
  critical: "var(--status-critical)",
};

interface StatusMeta {
  label: string;
  tone: Tone;
  icon: IconName;

  blurb: string;
}

export const ORDER_STATUS: Record<OrderStatus, StatusMeta> = {
  quote_pending: {
    label: "Quote pending",
    tone: "neutral",
    icon: "clock",
    blurb: "Saved without a price - the quoting service was unreachable.",
  },
  quoted: {
    label: "Quoted",
    tone: "accent",
    icon: "tag",
    blurb: "Priced and waiting on the customer to pay.",
  },
  paid: {
    label: "Paid",
    tone: "accent",
    icon: "card",
    blurb: "Paid for and queued for a printer.",
  },
  printing: {
    label: "Printing",
    tone: "accent",
    icon: "printer",
    blurb: "On a machine right now.",
  },
  post_processing: {
    label: "Post-processing",
    tone: "accent",
    icon: "droplet",
    blurb: "Off the printer; washing, curing or depowdering.",
  },
  qc: {
    label: "Quality control",
    tone: "accent",
    icon: "search",
    blurb: "Being inspected before it ships.",
  },
  shipped: {
    label: "Shipped",
    tone: "good",
    icon: "truck",
    blurb: "Handed to the courier. Terminal state.",
  },
  failed: {
    label: "Failed",
    tone: "critical",
    icon: "alert",
    blurb: "The build failed. Must be requeued before it can print again.",
  },
  reprint: {
    label: "Queued for reprint",
    tone: "warning",
    icon: "rotate",
    blurb: "Requeued after a failure, waiting for a printer.",
  },
};

export const MACHINE_STATUS: Record<MachineStatus, StatusMeta> = {
  idle: {
    label: "Idle",
    tone: "neutral",
    icon: "pause",
    blurb: "Available for work.",
  },
  printing: {
    label: "Printing",
    tone: "accent",
    icon: "printer",
    blurb: "Running a build.",
  },
  maintenance: {
    label: "Maintenance",
    tone: "warning",
    icon: "wrench",
    blurb: "Offline. The state machine refuses to schedule work on it.",
  },
};

export const PIPELINE_ORDER: OrderStatus[] = [
  "quote_pending",
  "quoted",
  "paid",
  "printing",
  "post_processing",
  "qc",
  "shipped",
];

export const MATERIAL_LABEL: Record<Material, string> = {
  resin_standard: "Standard resin",
  resin_tough: "Tough resin",
  resin_castable: "Castable resin",
  nylon_pa12: "Nylon PA12",
  nylon_glass_filled: "Glass-filled nylon",
};

export function technologyFor(material: string): "SLA" | "SLS" {
  return material.startsWith("resin") ? "SLA" : "SLS";
}

export function formatMoney(value: string | number | null): string {
  if (value === null) return "-";
  const n = typeof value === "string" ? Number.parseFloat(value) : value;
  if (Number.isNaN(n)) return "-";
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export function formatCompact(n: number): string {
  if (Math.abs(n) < 1000) return String(n);
  return n.toLocaleString("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatRelative(iso: string): string {
  const seconds = (Date.now() - new Date(iso).getTime()) / 1000;
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["second", 60],
    ["minute", 60],
    ["hour", 24],
    ["day", 30],
    ["month", 12],
    ["year", Number.POSITIVE_INFINITY],
  ];
  let value = seconds;
  for (const [unit, size] of units) {
    if (Math.abs(value) < size) {
      return new Intl.RelativeTimeFormat("en", { numeric: "auto" }).format(
        -Math.round(value),
        unit,
      );
    }
    value /= size;
  }
  return iso;
}
