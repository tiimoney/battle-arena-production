import { useState, type ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { BrandLogo } from "./BrandLogo";
import "./AdminShellScaffold.css";

const NAV_ITEMS = [
  { to: "/admin", label: "Dashboard", icon: "🏠", end: true },
  { to: "/admin/fixtures", label: "Fixtures", icon: "📅" },
  { to: "/admin/matches", label: "Match History", icon: "🕘" },
  { to: "/admin/archives", label: "Archives", icon: "🗄️" },
  { to: "/admin/users", label: "Users", icon: "👥" },
];

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
      {mobileNavOpen && (
        <div className="mobile-nav-backdrop" onClick={() => setMobileNavOpen(false)}>
          <nav className="mobile-nav" onClick={(e) => e.stopPropagation()}>
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
      )}

      <div className="admin-content">
        <header className="admin-header">
          <button className="mobile-nav-toggle btn btn-outlined btn-sm" onClick={() => setMobileNavOpen(true)}>
            ☰ Menu
          </button>
          <div>
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
