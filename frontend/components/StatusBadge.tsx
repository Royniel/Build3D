import { Icon } from "@/components/Icon";
import {
  MACHINE_STATUS,
  ORDER_STATUS,
  TONE_VAR,
  type Tone,
} from "@/lib/status";
import type { MachineStatus, OrderStatus } from "@/lib/types";

function Badge({
  label,
  tone,
  icon,
  title,
  size = "md",
}: {
  label: string;
  tone: Tone;
  icon: Parameters<typeof Icon>[0]["name"];
  title?: string;
  size?: "sm" | "md";
}) {
  const colour = TONE_VAR[tone];
  return (
    <span
      title={title}
      className={[
        "inline-flex items-center gap-1.5 rounded-full border font-medium whitespace-nowrap",
        size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs",
      ].join(" ")}
      style={{
        borderColor: `color-mix(in oklab, ${colour} 40%, transparent)`,
        background: `color-mix(in oklab, ${colour} 12%, transparent)`,
        color: "var(--text-primary)",
      }}
    >
      <span style={{ color: colour }} className="shrink-0">
        <Icon name={icon} size={size === "sm" ? 12 : 13} />
      </span>
      {label}
    </span>
  );
}

export function OrderStatusBadge({
  status,
  size = "md",
}: {
  status: OrderStatus;
  size?: "sm" | "md";
}) {
  const meta = ORDER_STATUS[status];
  return (
    <Badge
      label={meta.label}
      tone={meta.tone}
      icon={meta.icon}
      title={meta.blurb}
      size={size}
    />
  );
}

export function MachineStatusBadge({
  status,
  size = "md",
}: {
  status: MachineStatus;
  size?: "sm" | "md";
}) {
  const meta = MACHINE_STATUS[status];
  return (
    <Badge
      label={meta.label}
      tone={meta.tone}
      icon={meta.icon}
      title={meta.blurb}
      size={size}
    />
  );
}
