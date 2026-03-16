"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

import styles from "./AppNavigation.module.css";

export type NavRoute = {
  href: string;
  label: string;
  icon: NavIconName;
  match?: (pathname: string) => boolean;
};

export type NavAction = {
  id: string;
  label: string;
  icon: NavIconName;
  onClick: () => void;
  active?: boolean;
};

type NavIconName =
  | "dashboard"
  | "farms"
  | "newFarm"
  | "analysis"
  | "feedback"
  | "tools"
  | "telegram"
  | "profile"
  | "logout"
  | "water";

type SidebarNavigationProps = {
  title?: string;
  eyebrow?: string;
  routes: Array<NavRoute | NavAction>;
  footerRoutes?: Array<NavRoute | NavAction>;
  onLogout?: () => void;
  logoutLabel?: string;
  className?: string;
};

type RoutePillsProps = {
  routes: NavRoute[];
  className?: string;
};

export const mainRoutes: NavRoute[] = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: "dashboard",
    match: (pathname) => pathname === "/dashboard" || pathname.startsWith("/dashboard/"),
  },
  {
    href: "/dashboard?view=farms",
    label: "Farms",
    icon: "farms",
    match: (pathname) => pathname === "/dashboard",
  },
  {
    href: "/dashboard/analysis",
    label: "Analysis",
    icon: "analysis",
    match: (pathname) => pathname === "/dashboard/analysis" || pathname.startsWith("/dashboard/analysis/"),
  },
  {
    href: "/dashboard?view=feedback",
    label: "Feedback",
    icon: "feedback",
  },
  {
    href: "/dashboard/tools",
    label: "Tools",
    icon: "tools",
    match: (pathname) => pathname === "/dashboard/tools",
  },
];

export const dashboardWorkspaceRoutes: NavRoute[] = [
  {
    href: "/dashboard",
    label: "Action center",
    icon: "dashboard",
    match: (pathname) => pathname === "/dashboard",
  },
  {
    href: "/dashboard/analysis",
    label: "Analyze",
    icon: "analysis",
    match: (pathname) => pathname === "/dashboard/analysis" || pathname.startsWith("/dashboard/analysis/"),
  },
  {
    href: "/dashboard?view=farms",
    label: "Farm registry",
    icon: "farms",
    match: (pathname) => pathname === "/dashboard",
  },
  {
    href: "/dashboard/analysis",
    label: "Analysis history",
    icon: "water",
    match: (pathname) => pathname === "/dashboard/analysis" || pathname.startsWith("/dashboard/analysis/"),
  },
];

export const utilityRoutes: NavRoute[] = [
  {
    href: "/dashboard?view=feedback",
    label: "Feedback",
    icon: "feedback",
  },
  {
    href: "/dashboard/tools",
    label: "Tools lab",
    icon: "tools",
    match: (pathname) => pathname === "/dashboard/tools",
  },
  {
    href: "/dashboard?view=profile",
    label: "Profile",
    icon: "profile",
    match: (pathname) => pathname === "/dashboard",
  },
];

export function AppSidebarNavigation({
  title = "Field workspace",
  eyebrow = "OleaSat navigation",
  routes,
  footerRoutes = [],
  onLogout,
  logoutLabel = "Logout",
  className,
}: SidebarNavigationProps) {
  const pathname = usePathname();
  const classes = className ? `${styles.sidebar} ${className}` : styles.sidebar;

  return (
    <aside className={classes}>
      <div className={styles.sidebarBrand}>
        <Image src="/logo.png" alt="OleaSat Logo" width={180} height={72} priority style={{ maxWidth: "100%", height: "auto" }} />
      </div>

      <nav className={styles.sidebarGroup} aria-label="Primary navigation">
        {routes.map((route) => renderSidebarEntry(route, pathname))}
      </nav>

      {(footerRoutes.length > 0 || onLogout) && (
        <div className={styles.sidebarFooter}>
          {footerRoutes.map((route) => renderSidebarEntry(route, pathname))}

          {onLogout && (
            <button type="button" className={`${styles.navItem} ${styles.navItemDanger}`} onClick={onLogout}>
              <span className={styles.navIcon}>{renderIcon("logout")}</span>
              <span>{logoutLabel}</span>
            </button>
          )}
        </div>
      )}
    </aside>
  );
}

export function AppRoutePills({ routes, className }: RoutePillsProps) {
  const pathname = usePathname();
  const classes = className ? `${styles.routePills} ${className}` : styles.routePills;

  return (
    <nav className={classes} aria-label="Page navigation">
      {routes.map((route) => {
        const active = isRouteActive(route, pathname);
        return (
          <Link
            key={route.href}
            href={route.href}
            className={active ? `${styles.routePill} ${styles.routePillActive}` : styles.routePill}
          >
            <span className={styles.routePillIcon}>{renderIcon(route.icon)}</span>
            <span>{route.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function isRouteActive(route: NavRoute, pathname: string): boolean {
  if (route.match) {
    return route.match(pathname);
  }
  return pathname === route.href;
}

function renderSidebarEntry(entry: NavRoute | NavAction, pathname: string) {
  if ("href" in entry) {
    const active = isRouteActive(entry, pathname);
    return (
      <Link
        key={entry.href}
        href={entry.href}
        className={active ? `${styles.navItem} ${styles.navItemActive}` : styles.navItem}
      >
        <span className={styles.navIcon}>{renderIcon(entry.icon)}</span>
        <span>{entry.label}</span>
      </Link>
    );
  }

  return (
    <button
      key={entry.id}
      type="button"
      onClick={entry.onClick}
      className={entry.active ? `${styles.navItem} ${styles.navItemActive}` : styles.navItem}
    >
      <span className={styles.navIcon}>{renderIcon(entry.icon)}</span>
      <span>{entry.label}</span>
    </button>
  );
}

function renderIcon(icon: NavIconName) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    'aria-hidden': true,
  };

  switch (icon) {
    case "dashboard":
      return (
        <svg {...common}>
          <path d="M4 5h7v6H4z" />
          <path d="M13 5h7v10h-7z" />
          <path d="M4 13h7v6H4z" />
          <path d="M13 17h7v2h-7z" />
        </svg>
      );
    case "farms":
      return (
        <svg {...common}>
          <path d="M5 18c0-4.5 3.1-8 7-8s7 3.5 7 8" />
          <path d="M12 10V4" />
          <path d="M12 4c-2.4 0-4 1.7-4 4 2.4 0 4-1.6 4-4Z" />
          <path d="M12 4c2.4 0 4 1.7 4 4-2.4 0-4-1.6-4-4Z" />
        </svg>
      );
    case "newFarm":
      return (
        <svg {...common}>
          <path d="M12 5v14" />
          <path d="M5 12h14" />
          <path d="M6 19h12" />
        </svg>
      );
    case "analysis":
      return (
        <svg {...common}>
          <path d="M4 18h16" />
          <path d="M7 16V9" />
          <path d="M12 16V5" />
          <path d="M17 16v-4" />
        </svg>
      );
    case "feedback":
      return (
        <svg {...common}>
          <path d="M5 6h14v9H8l-3 3z" />
          <path d="M9 10h6" />
        </svg>
      );
    case "tools":
      return (
        <svg {...common}>
          <path d="M14.7 6.3a3 3 0 0 0 3.9 3.9L12 16.8 7.2 12z" />
          <path d="M5 19l2.2-2.2" />
          <path d="M4.5 14.5 9.5 19.5" />
        </svg>
      );
    case "telegram":
      return (
        <svg {...common}>
          <path d="m21 4-3 15-5.5-4-3 2 1-5 10.5-8z" />
          <path d="M10.5 12 18 19" />
        </svg>
      );
    case "profile":
      return (
        <svg {...common}>
          <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" />
          <path d="M5 20a7 7 0 0 1 14 0" />
        </svg>
      );
    case "water":
      return (
        <svg {...common}>
          <path d="M12 3s5 5.3 5 9a5 5 0 0 1-10 0c0-3.7 5-9 5-9Z" />
          <path d="M10 15c.6.7 1.2 1 2 1 1.7 0 3-1.3 3-3" />
        </svg>
      );
    case "logout":
      return (
        <svg {...common}>
          <path d="M10 17v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v2" />
          <path d="M21 12H9" />
          <path d="m16 7 5 5-5 5" />
        </svg>
      );
  }
}