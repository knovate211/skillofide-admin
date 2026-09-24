import React, { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { getUser, isRecruiter, logout } from '../lib/auth';
import { resetCompany, retryCompany, setCompany, useCompany } from '../lib/company';
import { useAlerts } from '../lib/alerts';
import {
  IconAward, IconBell, IconBuilding, IconCalendar, IconChevronDown, IconClipboard, IconCode, IconFile,
  IconHome, IconLayers, IconLogout, IconMenu, IconMessage, IconSearch, IconShield, IconUserCheck,
  IconUserPlus, IconUsers,
} from './Icons';

// Grouped by the job an admin is doing, so related screens sit together and a
// label only has to make sense within its group.
type NavLinkDef = { to: string; label: string; icon: React.FC<{ size?: number }> };
type NavGroup = { heading?: string; links: NavLinkDef[] };

const groups: NavGroup[] = [
  { links: [{ to: '/dashboard', label: 'Dashboard', icon: IconHome }] },
  {
    heading: 'Students',
    links: [
      { to: '/users', label: 'All Users', icon: IconUsers },
      { to: '/import', label: 'Import Users', icon: IconUserPlus },
    ],
  },
  {
    heading: 'Learning',
    links: [
      { to: '/classes', label: 'Live Classes', icon: IconCalendar },
      { to: '/tests', label: 'Tests', icon: IconClipboard },
      { to: '/mcq-bank', label: 'Question Bank', icon: IconLayers },
      { to: '/problems', label: 'Coding Problems', icon: IconCode },
    ],
  },
  {
    heading: 'Admissions',
    links: [
      { to: '/enrollments', label: 'Enrolments', icon: IconUserCheck },
      { to: '/enquiries', label: 'Enquiries', icon: IconMessage },
      { to: '/scholarship', label: 'Applications', icon: IconFile },
      { to: '/scholarship/programmes', label: 'Scholarship Programmes', icon: IconAward },
    ],
  },
  {
    heading: 'Hiring',
    links: [{ to: '/companies', label: 'Companies', icon: IconBuilding }],
  },
  {
    heading: 'Settings',
    links: [{ to: '/audit', label: 'Audit Log', icon: IconShield }],
  },
];

// Recruiters only run their company's hiring tests, so they get a flat menu
// of the screens the backend lets them use.
const recruiterGroups: NavGroup[] = [
  {
    links: [
      { to: '/tests', label: 'Hiring Tests', icon: IconClipboard },
      { to: '/mcq-bank', label: 'Question Bank', icon: IconLayers },
    ],
  },
];

const OPEN_KEY = 'admin_nav_open';
const COLLAPSED_KEY = 'admin_nav_collapsed';

// Per-browser UI memory. Storage can be unavailable (private mode, blocked
// site data), so every access is guarded.
function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function writeJSON(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* not remembered — fine */
  }
}

// A page belongs to a section when its path starts with one of the section's
// links, so /tests/123/results still counts as inside Learning.
const inSection = (path: string, to: string) => path === to || path.startsWith(to + '/');

const initials = (s: string) =>
  s.split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || '?';

/** Closes a popover when the user clicks anywhere outside it or presses Escape. */
function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close]);
  return ref;
}

const Layout: React.FC<{
  title: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  /** The page draws its own header (the dashboard's greeting). */
  hideHeader?: boolean;
}> = ({ title, actions, children, hideHeader = false }) => {
  const navigate = useNavigate();
  const user = getUser();
  const { pathname } = useLocation();
  const [open, setOpen] = useState<Record<string, boolean>>(() => readJSON(OPEN_KEY, {}));
  const [collapsed, setCollapsed] = useState<boolean>(() => readJSON(COLLAPSED_KEY, false));
  const [mobileOpen, setMobileOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const [meOpen, setMeOpen] = useState(false);
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const bellRef = useDismiss(bellOpen, () => setBellOpen(false));
  const meRef = useDismiss(meOpen, () => setMeOpen(false));

  const recruiter = isRecruiter();
  const { companies, companyId, company, ready, failed } = useCompany();
  // Without a company a recruiter has nothing to act on, so page actions go too.
  const noCompany = recruiter && (!ready || companies.length === 0);
  const nav = recruiter ? recruiterGroups : groups;
  const alerts = useAlerts(!recruiter);

  // The drawer on a phone closes once you pick a page.
  useEffect(() => setMobileOpen(false), [pathname]);

  // ⌘K / Ctrl+K jumps to the search box, as it does in most admin tools.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const toggleGroup = (heading: string, isOpen: boolean) => {
    const next = { ...open, [heading]: !isOpen };
    setOpen(next);
    writeJSON(OPEN_KEY, next);
  };

  const toggleNav = () => {
    if (window.matchMedia('(max-width: 900px)').matches) {
      setMobileOpen((o) => !o);
    } else {
      setCollapsed((c) => {
        writeJSON(COLLAPSED_KEY, !c);
        return !c;
      });
    }
  };

  const doLogout = () => {
    logout();
    resetCompany();
    navigate('/login', { replace: true });
  };

  const search = (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    navigate(q ? `/users?search=${encodeURIComponent(q)}` : '/users');
  };

  const displayName = user?.name?.trim() || (recruiter ? 'Recruiter' : 'Admin');
  const roleLabel = recruiter ? `Recruiter${company ? ` · ${company.name}` : ''}` : 'Administrator';

  return (
    <div className={`shell${collapsed ? ' nav-collapsed' : ''}${mobileOpen ? ' nav-mobile-open' : ''}`}>
      <div className="nav-scrim" onClick={() => setMobileOpen(false)} />
      <aside className="sidebar">
        <Link to={recruiter ? '/tests' : '/dashboard'} className="brand" title={recruiter ? 'Knovate Hiring' : 'Knovate Admin'}>
          <span className="brand-mark" aria-hidden>K</span>
          <span className="brand-text">{recruiter ? 'Knovate Hiring' : 'Knovate Admin'}</span>
        </Link>
        {recruiter && companies.length > 1 && (
          <select
            className="company-switch"
            aria-label="Company"
            value={companyId}
            onChange={(e) => {
              setCompany(e.target.value);
              // Every list on screen belongs to the old company; reload it.
              navigate(pathname.startsWith('/mcq-bank') ? '/mcq-bank' : '/tests', { replace: true });
            }}
          >
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
        {recruiter && companies.length === 1 && <div className="company-name">{company?.name}</div>}
        <nav>
          {nav.map((g, i) => {
            const links = g.links.map((l) => (
              // `end` on every link: without it /scholarship stays highlighted
              // while you are on /scholarship/programmes, so the sidebar shows two
              // active items and neither tells you where you are.
              <NavLink key={l.to} to={l.to} end title={l.label} className={({ isActive }) => (isActive ? 'active' : '')}>
                <l.icon size={18} />
                <span className="nav-label">{l.label}</span>
              </NavLink>
            ));
            if (!g.heading) return <div key={i} className="nav-group open">{links}</div>;

            // The section holding the current page is always open — collapsing
            // it would hide where you are. Others default to open until closed.
            const current = g.links.some((l) => inSection(pathname, l.to));
            const isOpen = collapsed || current || open[g.heading] !== false;
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
                  onClick={() => toggleGroup(g.heading!, isOpen)}
                >
                  <span>{g.heading}</span>
                  <IconChevronDown size={14} className="chev" />
                </button>
                <div id={id} className="nav-items">
                  <div>{links}</div>
                </div>
              </div>
            );
          })}
        </nav>
        <div className="spacer" />
        <div className="me-card">
          <span className="avatar" aria-hidden>{initials(displayName)}</span>
          <div className="me-text">
            <div className="me-email" title={user?.email}>{user?.email}</div>
            <div className="me-role">{roleLabel}</div>
          </div>
        </div>
        <button className="signout" onClick={doLogout} title="Sign out">
          <IconLogout size={17} />
          <span className="nav-label">Sign out</span>
        </button>
      </aside>

      <div className="main">
        <header className="topbar">
          <button className="icon-btn" onClick={toggleNav} aria-label="Toggle navigation">
            <IconMenu size={20} />
          </button>
          {!recruiter && (
            <form className="global-search" onSubmit={search} role="search">
              <IconSearch size={17} />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search users by name or email…"
                aria-label="Search users"
              />
              <kbd>⌘ K</kbd>
            </form>
          )}
          <span className="grow" />
          {!recruiter && (
            <div className="popover-anchor" ref={bellRef}>
              <button className="icon-btn" onClick={() => setBellOpen((o) => !o)} aria-label={`Notifications: ${alerts.total} waiting`}>
                <IconBell size={20} />
                {alerts.total > 0 && <span className="bell-count">{alerts.total > 99 ? '99+' : alerts.total}</span>}
              </button>
              {bellOpen && (
                <div className="popover">
                  <div className="popover-head">Needs your attention</div>
                  {alerts.items.length === 0 ? (
                    <p className="muted small" style={{ padding: '4px 14px 12px', margin: 0 }}>All caught up.</p>
                  ) : (
                    alerts.items.map((a) => (
                      <Link key={a.label} to={a.to} className="popover-item" onClick={() => setBellOpen(false)}>
                        <span>{a.label}</span>
                        <span className="popover-count">{a.count}</span>
                      </Link>
                    ))
                  )}
                </div>
              )}
            </div>
          )}
          <div className="popover-anchor" ref={meRef}>
            <button className="me-chip" onClick={() => setMeOpen((o) => !o)} aria-haspopup="menu" aria-expanded={meOpen}>
              <span className="avatar sm" aria-hidden>{initials(displayName)}</span>
              <span className="me-chip-name">{displayName}</span>
              <IconChevronDown size={15} />
            </button>
            {meOpen && (
              <div className="popover" role="menu">
                <div className="popover-head">
                  {user?.email}
                  <div className="muted small" style={{ fontWeight: 500 }}>{roleLabel}</div>
                </div>
                <button className="popover-item" role="menuitem" onClick={doLogout}>
                  <span>Sign out</span>
                  <IconLogout size={16} />
                </button>
              </div>
            )}
          </div>
        </header>

        <div className="content">
          {!hideHeader && (
            <div className="page-head">
              <h1>{title}</h1>
              <div className="row">{noCompany ? null : actions}</div>
            </div>
          )}
          {recruiter && ready && failed ? (
            <div className="card card-pad">
              <h3 style={{ marginTop: 0 }}>Couldn&apos;t load your company</h3>
              <p className="muted">Check your connection and try again.</p>
              <button onClick={retryCompany}>Try again</button>
            </div>
          ) : recruiter && ready && companies.length === 0 ? (
            <div className="card card-pad">
              <h3 style={{ marginTop: 0 }}>Your account isn&apos;t linked to a company yet</h3>
              <p className="muted" style={{ marginBottom: 0 }}>
                Ask the Knovate team to add you to your company. Once they do, your company&apos;s hiring tests appear here.
              </p>
            </div>
          ) : recruiter && !ready ? (
            <p className="muted">Loading…</p>
          ) : (
            children
          )}
        </div>
      </div>
    </div>
  );
};

export default Layout;
