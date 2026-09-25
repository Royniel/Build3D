import { Icon, type IconName } from "@/components/Icon";
import { formatCompact, TONE_VAR, type Tone } from "@/lib/status";

interface StatTileProps {
  label: string;
  value: number;
  hint?: string;
  icon?: IconName;
  tone?: Tone;
}

export function StatTile({
  label,
  value,
  hint,
  icon,
  tone = "neutral",
}: StatTileProps) {
  return (
    <div className="rounded-lg border border-[var(--hairline)] bg-[var(--surface-1)] p-4">
      <div className="flex items-center gap-2">
        {icon ? (
          <span style={{ color: TONE_VAR[tone] }}>
            <Icon name={icon} size={15} />
          </span>
        ) : null}

        <span className="text-xs text-[var(--text-secondary)]">{label}</span>
      </div>
      <p className="figure-stat mt-2 text-[var(--text-primary)]">
        {formatCompact(value)}
      </p>
      {hint ? (
        <p className="mt-1 text-xs text-[var(--text-muted)]">{hint}</p>
      ) : null}
    </div>
  );
}

interface HeroFigureProps {
  label: string;
  value: number;
  caption?: string;
}

export function HeroFigure({ label, value, caption }: HeroFigureProps) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wider text-[var(--text-muted)]">
        {label}
      </p>
      <p className="figure-hero mt-1 text-[var(--text-primary)]">
        {value.toLocaleString("en-US")}
      </p>
      {caption ? (
        <p className="mt-1 text-sm text-[var(--text-secondary)]">{caption}</p>
      ) : null}
    </div>
  );
}

interface MeterProps {
  label: string;
  value: number;
  max: number;

  readout: string;
}

export function Meter({ label, value, max, readout }: MeterProps) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-xs text-[var(--text-secondary)]">{label}</span>
        <span className="nums-tabular text-xs text-[var(--text-primary)]">
          {readout}
        </span>
      </div>
      <div
        className="mt-2 h-2 w-full overflow-hidden rounded-full"
        style={{ background: "var(--series-1-track)" }}
        role="meter"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-label={`${label}: ${readout}`}
      >
        <div
          className="h-full rounded-full transition-[width] duration-300"
          style={{ width: `${pct}%`, background: "var(--series-1)" }}
        />
      </div>
    </div>
  );
}
