import { useState, type ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { BrandLogo } from "./BrandLogo";
import "./AdminShellScaffold.css";

const NAV_ITEMS = [
  { to: "/admin", label: "Dashboard", icon: "🏠", end: true },
  { to: "/admin/groups", label: "Groups", icon: "🗂️" },
  { to: "/admin/fixtures", label: "Fixtures", icon: "📅" },
  { to: "/admin/matches", label: "Match History", icon: "🕘" },
  { to: "/admin/archives", label: "Archives", icon: "🗄️" },
  { to: "/admin/users", label: "Users", icon: "👥" },
  { to: "/admin/support", label: "Support", icon: "💬" },
  { to: "/standings", label: "Standings", icon: "🏆" },
];

function HamburgerButton({ open, onClick }: { open: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      className="hamburger-btn mobile-nav-toggle"
      aria-label={open ? "Close menu" : "Open menu"}
      aria-expanded={open}
      onClick={onClick}
    >
      <span className={`hamburger-icon${open ? " open" : ""}`} aria-hidden>
        <span />
        <span />
        <span />
      </span>
    </button>
  );
}

export function AdminShellScaffold({
  title,
  actions,
  children,
}: {
  title: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="admin-shell">
      <aside className="admin-rail">
        <div className="admin-rail-brand">
          <BrandLogo size={52} />
          <div>
            <div className="admin-rail-title">Mocheso League</div>
            <div className="admin-rail-subtitle">Admin workspace</div>
          </div>
        </div>
        <nav className="admin-rail-nav">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `admin-rail-link${isActive ? " active" : ""}`}
            >
              <span className="admin-rail-icon" aria-hidden>
                {item.icon}
              </span>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="admin-rail-hint">
          <span aria-hidden>🛡️</span>
          Assignments and score logging are admin-controlled.
        </div>
      </aside>

      {/* Mobile nav is new vs. the original Flutter app, which had no nav at all
          below its 1100px desktop-rail breakpoint -- a deliberate UX improvement. */}
      <div className={`mobile-nav-backdrop${mobileNavOpen ? " open" : ""}`} onClick={() => setMobileNavOpen(false)}>
        <nav className="mobile-nav" onClick={(e) => e.stopPropagation()}>
          <div className="mobile-nav-header">
            <div className="admin-rail-brand">
              <BrandLogo size={40} />
              <div className="admin-rail-title">Mocheso League</div>
            </div>
            <HamburgerButton open onClick={() => setMobileNavOpen(false)} />
          </div>
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `mobile-nav-link${isActive ? " active" : ""}`}
              onClick={() => setMobileNavOpen(false)}
            >
              <span aria-hidden>{item.icon}</span> {item.label}
            </NavLink>
          ))}
        </nav>
      </div>

      <div className="admin-content">
        <header className="admin-header">
          <HamburgerButton open={false} onClick={() => setMobileNavOpen(true)} />
          <div className="admin-header-titles">
            <h1 className="admin-header-title">{title}</h1>
            <div className="admin-header-subtitle">Desktop admin workspace</div>
          </div>
          <div className="admin-header-actions">{actions}</div>
        </header>
        <main className="admin-body">{children}</main>
      </div>
    </div>
  );
}
