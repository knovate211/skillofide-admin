import React, { useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { getUser, logout } from '../lib/auth';

// Grouped by the job an admin is doing, so related screens sit together and a
// label only has to make sense within its group.
const groups: { heading?: string; links: { to: string; label: string }[] }[] = [
  { links: [{ to: '/dashboard', label: 'Dashboard' }] },
  {
    heading: 'Students',
    links: [
      { to: '/users', label: 'All Users' },
      { to: '/import', label: 'Import Users' },
    ],
  },
  {
    heading: 'Learning',
    links: [
      { to: '/classes', label: 'Live Classes' },
      { to: '/tests', label: 'Tests' },
      { to: '/mcq-bank', label: 'Question Bank' },
      { to: '/problems', label: 'Coding Problems' },
    ],
  },
  {
    heading: 'Admissions',
    links: [
      { to: '/enquiries', label: 'Enquiries' },
      { to: '/scholarship', label: 'Applications' },
      { to: '/scholarship/programmes', label: 'Scholarship Programmes' },
    ],
  },
  {
    heading: 'Settings',
    links: [{ to: '/audit', label: 'Audit Log' }],
  },
];

const OPEN_KEY = 'admin_nav_open';

// Which sections the admin left open, remembered per browser. Storage can be
// unavailable (private mode, blocked site data), so every access is guarded.
function readOpen(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(OPEN_KEY) || '{}');
  } catch {
    return {};
  }
}

// A page belongs to a section when its path starts with one of the section's
// links, so /tests/123/results still counts as inside Learning.
const inSection = (path: string, to: string) => path === to || path.startsWith(to + '/');

const Layout: React.FC<{ title: string; actions?: React.ReactNode; children: React.ReactNode }> = ({
  title,
  actions,
  children,
}) => {
  const navigate = useNavigate();
  const user = getUser();
  const { pathname } = useLocation();
  const [open, setOpen] = useState<Record<string, boolean>>(readOpen);

  const toggle = (heading: string, isOpen: boolean) => {
    const next = { ...open, [heading]: !isOpen };
    setOpen(next);
    try {
      localStorage.setItem(OPEN_KEY, JSON.stringify(next));
    } catch {
      /* not remembered — fine */
    }
  };

  const doLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">Knovate Admin</div>
        <nav>
          {groups.map((g, i) => {
            const links = g.links.map((l) => (
              // `end` on every link: without it /scholarship stays highlighted
              // while you are on /scholarship/programmes, so the sidebar shows two
              // active items and neither tells you where you are.
              <NavLink key={l.to} to={l.to} end className={({ isActive }) => (isActive ? 'active' : '')}>
                {l.label}
              </NavLink>
            ));
            if (!g.heading) return <div key={i} className="nav-group">{links}</div>;

            // The section holding the current page is always open — collapsing
            // it would hide where you are. Others default to open until closed.
            const current = g.links.some((l) => inSection(pathname, l.to));
            const isOpen = current || open[g.heading] !== false;
            const id = `nav-${g.heading.toLowerCase()}`;
            return (
              <div key={g.heading} className={`nav-group${isOpen ? ' open' : ''}`}>
                <button
                  type="button"
                  className="nav-heading"
                  aria-expanded={isOpen}
                  aria-controls={id}
                  disabled={current}
                  title={current ? 'Contains the current page' : undefined}
                  onClick={() => toggle(g.heading!, isOpen)}
                >
                  <span>{g.heading}</span>
                  <span className="chev" aria-hidden>›</span>
                </button>
                <div id={id} className="nav-items">
                  <div>{links}</div>
                </div>
              </div>
            );
          })}
        </nav>
        <div className="spacer" />
        <div className="who">{user?.email}</div>
        <button className="secondary" onClick={doLogout}>Sign out</button>
      </aside>
      <div className="main">
        <div className="topbar">
          <h1>{title}</h1>
          <div className="row">{actions}</div>
        </div>
        <div className="content">{children}</div>
      </div>
    </div>
  );
};

export default Layout;
