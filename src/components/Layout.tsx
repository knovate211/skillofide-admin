import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { getUser, logout } from '../lib/auth';

/* Icons are inline so the panel keeps its zero icon-library footprint. Each is
   a 16px stroked glyph that inherits colour from the nav link around it. */
const Icon: React.FC<{ d: React.ReactNode }> = ({ d }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
       strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {d}
  </svg>
);

const icons = {
  users: <Icon d={<><path d="M16 19v-1.5a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4V19" /><circle cx="9" cy="7" r="3.2" /><path d="M22 19v-1.5a4 4 0 0 0-3-3.87M16.5 4.13a4 4 0 0 1 0 7.75" /></>} />,
  upload: <Icon d={<><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m8 8 4-4 4 4" /><path d="M12 4v12" /></>} />,
  tests: <Icon d={<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="m9 15 2 2 4-4" /></>} />,
  bank: <Icon d={<><circle cx="12" cy="12" r="9.2" /><path d="M9.2 9.3a2.9 2.9 0 1 1 3.9 2.7c-.7.3-1.1.9-1.1 1.6v.5" /><path d="M12 17.4h.01" /></>} />,
  inbox: <Icon d={<><path d="M22 12h-6l-2 3h-4l-2-3H2" /><path d="M5.4 5.8 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.4-6.2a2 2 0 0 0-1.8-1.1H7.2a2 2 0 0 0-1.8 1.1Z" /></>} />,
  award: <Icon d={<><circle cx="12" cy="9" r="5.5" /><path d="m8.2 13.6-1.4 7.2 5.2-2.7 5.2 2.7-1.4-7.2" /></>} />,
  calendar: <Icon d={<><rect x="3" y="4.8" width="18" height="16.2" rx="2" /><path d="M3 10h18M8 2.8v4M16 2.8v4" /></>} />,
};

/* Grouped so the seven destinations read as three jobs rather than one list. */
const sections: { title: string; links: { to: string; label: string; icon: React.ReactNode }[] }[] = [
  {
    title: 'People',
    links: [
      { to: '/users', label: 'Users', icon: icons.users },
      { to: '/import', label: 'Bulk Import', icon: icons.upload },
    ],
  },
  {
    title: 'Assessment',
    links: [
      { to: '/tests', label: 'Tests', icon: icons.tests },
      { to: '/mcq-bank', label: 'Question Bank', icon: icons.bank },
    ],
  },
  {
    title: 'Admissions',
    links: [
      { to: '/enquiries', label: 'Enquiries', icon: icons.inbox },
      { to: '/scholarship', label: 'Scholarship', icon: icons.award },
      { to: '/scholarship/programmes', label: 'Programmes', icon: icons.calendar },
    ],
  },
];

const initials = (user: { name?: string; email?: string } | null) => {
  const source = user?.name?.trim() || user?.email || '';
  const parts = source.split(/[\s@._-]+/).filter(Boolean);
  return (parts[0]?.[0] ?? 'A') + (parts[1]?.[0] ?? '');
};

const Layout: React.FC<{ title: string; actions?: React.ReactNode; children: React.ReactNode }> = ({
  title,
  actions,
  children,
}) => {
  const navigate = useNavigate();
  const user = getUser();
  const [navOpen, setNavOpen] = React.useState(false);

  React.useEffect(() => {
    document.title = `${title} · Knovate Admin`;
  }, [title]);

  const doLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="shell">
      <aside className={`sidebar${navOpen ? ' open' : ''}`}>
        <div className="brand">
          <span className="mark" aria-hidden="true">K</span>
          <span>
            Knovate
            <small>Admin</small>
          </span>
        </div>

        {/* The sidebar is an overlay on narrow screens, so following a link has to
            close it — otherwise the page you land on stays hidden behind it. */}
        <nav onClick={() => setNavOpen(false)}>
          {sections.map((s) => (
            <React.Fragment key={s.title}>
              <div className="group">{s.title}</div>
              {s.links.map((l) => (
                // `end` on every link: without it /scholarship stays highlighted
                // while you are on /scholarship/programmes, so the sidebar shows two
                // active items and neither tells you where you are.
                <NavLink key={l.to} to={l.to} end className={({ isActive }) => (isActive ? 'active' : '')}>
                  {l.icon}
                  {l.label}
                </NavLink>
              ))}
            </React.Fragment>
          ))}
        </nav>

        <div className="spacer" />

        <div className="who">
          <span className="avatar" aria-hidden="true">{initials(user)}</span>
          <span className="id">
            <b>{user?.name || 'Administrator'}</b>
            <span title={user?.email}>{user?.email}</span>
          </span>
        </div>
        <button className="secondary" onClick={doLogout}>Sign out</button>
      </aside>

      {navOpen && <div className="scrim" onClick={() => setNavOpen(false)} />}

      <div className="main">
        <div className="topbar">
          <div className="row grow">
            <button
              className="secondary nav-toggle"
              aria-label="Open navigation"
              aria-expanded={navOpen}
              onClick={() => setNavOpen((v) => !v)}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <path d="M4 7h16M4 12h16M4 17h16" />
              </svg>
            </button>
            <h1>{title}</h1>
          </div>
          <div className="row">{actions}</div>
        </div>
        <div className="content">{children}</div>
      </div>
    </div>
  );
};

export default Layout;
