export type IconName =
  | "clock"
  | "tag"
  | "card"
  | "printer"
  | "droplet"
  | "search"
  | "truck"
  | "alert"
  | "rotate"
  | "pause"
  | "wrench"
  | "check"
  | "arrow-right"
  | "external"
  | "layers"
  | "cube"
  | "bolt";

const PATHS: Record<IconName, React.ReactNode> = {
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  tag: (
    <>
      <path d="M20.6 13.4 12 22l-9-9 8.6-8.6a2 2 0 0 1 1.4-.6H20a2 2 0 0 1 2 2v6a2 2 0 0 1-.6 1.4Z" />
      <circle cx="17" cy="7" r="1.2" />
    </>
  ),
  card: (
    <>
      <rect x="2.5" y="5.5" width="19" height="13" rx="2" />
      <path d="M2.5 10h19" />
    </>
  ),
  printer: (
    <>
      <path d="M7 8V3h10v5" />
      <rect x="3" y="8" width="18" height="8" rx="2" />
      <path d="M7 16h10v5H7z" />
    </>
  ),
  droplet: <path d="M12 3s6 6.4 6 10.5A6 6 0 0 1 6 13.5C6 9.4 12 3 12 3Z" />,
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m16.5 16.5 4 4" />
    </>
  ),
  truck: (
    <>
      <path d="M2.5 6.5h11v9h-11z" />
      <path d="M13.5 10h4l3 3v2.5h-7z" />
      <circle cx="6.5" cy="18" r="1.8" />
      <circle cx="17" cy="18" r="1.8" />
    </>
  ),
  alert: (
    <>
      <path d="M12 3.5 22 20H2L12 3.5Z" />
      <path d="M12 10v4.5" />
      <path d="M12 17.2v.3" />
    </>
  ),
  rotate: (
    <>
      <path d="M20.5 12a8.5 8.5 0 1 1-2.8-6.3" />
      <path d="M20.5 4v5h-5" />
    </>
  ),
  pause: (
    <>
      <path d="M9.5 5v14" />
      <path d="M14.5 5v14" />
    </>
  ),
  wrench: (
    <path d="M15.5 3a5.5 5.5 0 0 0-5 7.8L3 18.3 5.7 21l7.5-7.5A5.5 5.5 0 1 0 15.5 3Z" />
  ),
  check: <path d="m4.5 12.5 5 5 10-11" />,
  "arrow-right": (
    <>
      <path d="M4 12h15" />
      <path d="m13 6 6 6-6 6" />
    </>
  ),
  external: (
    <>
      <path d="M14 4h6v6" />
      <path d="M20 4 11 13" />
      <path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
    </>
  ),
  layers: (
    <>
      <path d="M12 3 3 8l9 5 9-5-9-5Z" />
      <path d="m3 14 9 5 9-5" />
    </>
  ),
  cube: (
    <>
      <path d="M12 2.8 21 7.5v9L12 21.2 3 16.5v-9L12 2.8Z" />
      <path d="M3 7.5l9 4.7 9-4.7" />
      <path d="M12 12.2v9" />
    </>
  ),
  bolt: <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z" />,
};

interface IconProps {
  name: IconName;

  size?: number;
  className?: string;
  strokeWidth?: number;
}

export function Icon({
  name,
  size = 16,
  className,
  strokeWidth = 1.7,
}: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}
