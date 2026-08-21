import type { ReactNode, SVGProps } from "react";

export type AppIconName =
  | "alertCircle"
  | "archive"
  | "assets"
  | "checkCircle"
  | "component"
  | "dashboard"
  | "device"
  | "health"
  | "infoCircle"
  | "installed"
  | "logout"
  | "maintenance"
  | "movement"
  | "reports"
  | "settings"
  | "software"
  | "timeline"
  | "vehicle"
  | "inspection"
  | "fuel"
  | "users"
  | "value"
  | "warningTriangle";

type AppIconProps = Omit<SVGProps<SVGSVGElement>, "children"> & {
  name: AppIconName;
  size?: number;
};

const iconPaths: Record<AppIconName, ReactNode> = {
  alertCircle: <><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5.5M12 16.5h.01" /></>,
  archive: <><path d="M4 7.5h16v12H4zM3 4.5h18v3H3z" /><path d="M9 11.5h6" /></>,
  assets: <><path d="M5 5h14v14H5z" /><path d="M8 9h8M8 12h8M8 15h5" /></>,
  checkCircle: <><circle cx="12" cy="12" r="9" /><path d="m8 12 2.7 2.7L16.5 9" /></>,
  component: <><path d="M8 8h8v8H8z" /><path d="M9 3v3M12 3v3M15 3v3M9 18v3M12 18v3M15 18v3M3 9h3M3 12h3M3 15h3M18 9h3M18 12h3M18 15h3" /></>,
  dashboard: <><path d="M4 13h7V4H4zM13 20h7v-9h-7zM4 20h7v-5H4zM13 9h7V4h-7z" /></>,
  device: <><rect height="12" rx="1.5" width="18" x="3" y="4" /><path d="M8 20h8M12 16v4" /></>,
  health: <><path d="M3.5 12h4l2-4 3.5 8 2.2-4H21" /><path d="M20 7.5a8.5 8.5 0 1 0 0 9" /></>,
  infoCircle: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 7.5h.01" /></>,
  installed: <><path d="M4 6h8v8H4zM12 10h8v8h-8z" /><path d="m6.5 10 1.3 1.3L10 9" /></>,
  logout: <><path d="M10 5H5v14h5M14 8l4 4-4 4M8 12h10" /></>,
  maintenance: <><path d="m14.5 6.5 3-3 3 3-3 3" /><path d="M16.5 8.5 9 16l-2 4-3-3 4-2 7.5-7.5" /></>,
  movement: <><path d="M4 8h14M15 5l3 3-3 3M20 16H6M9 13l-3 3 3 3" /></>,
  reports: <><path d="M5 3h10l4 4v14H5z" /><path d="M15 3v5h5M8 17v-3M12 17v-6M16 17V9" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4" /></>,
  software: <><rect height="16" rx="2" width="18" x="3" y="4" /><path d="M3 8h18M7 6h.01M10 6h.01M8 13l2 2-2 2M13 17h3" /></>,
  timeline: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  vehicle: <><path d="M5 16h14l-1.3-6.2A2.3 2.3 0 0 0 15.5 8h-7a2.3 2.3 0 0 0-2.2 1.8z" /><path d="M3 16v2h2M21 16v2h-2M7 13h.01M17 13h.01M8 8l1-3h6l1 3" /><circle cx="7" cy="17" r="1.5" /><circle cx="17" cy="17" r="1.5" /></>,
  inspection: <><path d="M7 3h10v3H7zM5 5h14v16H5z" /><path d="m8 13 2.2 2.2L16 9.5M8 18h8" /></>,
  fuel: <><path d="M6 4h8v16H6zM8 7h4M14 8h2l2 2v7a1.5 1.5 0 0 0 3 0v-6l-2-2" /></>,
  users: <><circle cx="9" cy="8" r="3" /><path d="M3.5 19c.5-4 2.5-6 5.5-6s5 2 5.5 6M16 5.5a3 3 0 0 1 0 5.5M16 13c2.5.4 4 2.4 4.5 5" /></>,
  value: <><path d="M4 7h16v11H4zM7 7V5h10v2" /><circle cx="12" cy="12.5" r="2.5" /><path d="M7 10h.01M17 15h.01" /></>,
  warningTriangle: <><path d="M10.2 4.5 2.8 18a2 2 0 0 0 1.8 3h14.8a2 2 0 0 0 1.8-3L13.8 4.5a2 2 0 0 0-3.6 0Z" /><path d="M12 9v4M12 17h.01" /></>,
};

export function AppIcon({ name, size = 20, ...props }: AppIconProps) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
      width={size}
      {...props}
    >
      {iconPaths[name]}
    </svg>
  );
}
