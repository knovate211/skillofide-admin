import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../../components/Layout';
import { useToast } from '../../components/Toast';
import {
  getActivity,
  getGradingQueue,
  getStats,
  type ActivityItem,
  type AdminStats,
  type GradingQueueItem,
} from '../../lib/api';
import { getUser } from '../../lib/auth';
import { courseName, useCourses } from '../../lib/courses';
import { primeAlerts } from '../../lib/alerts';
import {
  IconArrowDown, IconArrowRight, IconArrowUp, IconBuilding, IconCalendar, IconCap, IconChevronRight,
  IconClipboard, IconClock, IconCode, IconHelp, IconInbox, IconAward, IconRefresh, IconStar,
  IconUserPlus, IconUsers, IconZap,
} from '../../components/Icons';

// ─── Small pieces ─────────────────────────────────────────────────────────────

/** Week-on-week change. null = no basis for a percentage (nothing last week). */
function change(cur: number, prev: number): { pct: number | null; dir: 'up' | 'down' | 'flat' } {
  if (cur === prev) return { pct: 0, dir: 'flat' };
  if (prev === 0) return { pct: null, dir: 'up' };
  const pct = Math.round(((cur - prev) / prev) * 100);
  return { pct: Math.abs(pct), dir: pct > 0 ? 'up' : 'down' };
}

const Trend: React.FC<{ cur: number; prev: number; label?: string }> = ({ cur, prev, label = 'vs last week' }) => {
  const c = change(cur, prev);
  const Icon = c.dir === 'up' ? IconArrowUp : c.dir === 'down' ? IconArrowDown : IconArrowRight;
  return (
    <span className={`trend ${c.dir}`} title={`${cur} this week, ${prev} the week before`}>
      <Icon size={13} />
      {c.pct === null ? 'new' : `${c.pct}%`}
      <span className="trend-label">{label}</span>
    </span>
  );
};

/** A 14-day trace. Scaled to its own max, so it shows shape, not size. */
const Sparkline: React.FC<{ data: number[]; tone: string }> = ({ data, tone }) => {
  if (data.length < 2) return null;
  const W = 96;
  const H = 30;
  const max = Math.max(1, ...data);
  const pts = data.map((v, i) => [(i / (data.length - 1)) * W, H - 3 - (v / max) * (H - 6)] as const);
  return (
    <svg className="spark" viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
      <path d={smooth(pts)} fill="none" stroke={tone} strokeWidth={1.8} strokeLinecap="round" />
    </svg>
  );
};

/** Catmull-Rom through the points, as cubic Béziers — a soft line that still
 *  passes through every day's value. Control points are held above `floorY`
 *  (the zero line) so the curve never dips into negative sign-ups. */
function smooth(pts: readonly (readonly [number, number])[], floorY = Infinity): string {
  if (!pts.length) return '';
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0]},${Math.min(c1[1], floorY)} ${c2[0]},${Math.min(c2[1], floorY)} ${p2[0]},${p2[1]}`;
  }
  return d;
}

const Kpi: React.FC<{
  icon: React.FC<{ size?: number }>;
  value: number;
  label: string;
  sub: string;
  to: string;
  tone: string;
  trend?: { cur: number; prev: number };
  spark?: number[];
  footer?: string;
}> = ({ icon: Icon, value, label, sub, to, tone, trend, spark, footer }) => (
  <Link to={to} className="kpi card">
    <span className="kpi-icon"><Icon size={20} /></span>
    <div className="kpi-value">{value.toLocaleString()}</div>
    <div className="kpi-label">{label}</div>
    <div className="kpi-sub">{sub}</div>
    <div className="kpi-foot">
      {trend ? <Trend cur={trend.cur} prev={trend.prev} /> : <span className="trend flat">{footer}</span>}
      {spark && <Sparkline data={spark} tone={tone} />}
    </div>
  </Link>
);

// ─── Sign-ups chart ───────────────────────────────────────────────────────────

const RANGES = [7, 30, 90] as const;

const SignupsChart: React.FC<{
  stats: AdminStats;
  days: 7 | 30 | 90;
  onDays: (d: 7 | 30 | 90) => void;
}> = ({ stats, days, onDays }) => {
  const [hover, setHover] = useState<number | null>(null);
  const data = stats.signups_by_role;
  // Drawn at its real pixel width (not scaled from a fixed viewBox) so the
  // axis labels stay readable however wide the card is.
  const plotRef = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(640);
  useEffect(() => {
    const el = plotRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(260, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const H = 300;
  const padL = 26;
  const padB = 22;
  const innerH = H - padB - 8;
  const maxRaw = Math.max(1, ...data.map((d) => Math.max(d.students, d.staff)));
  const step = Math.max(1, Math.ceil(maxRaw / 4));
  const yMax = step * 4;
  const x = (i: number) => padL + (i / Math.max(1, data.length - 1)) * (W - padL - 6);
  const y = (v: number) => 8 + innerH - (v / yMax) * innerH;
  const students = data.map((d, i) => [x(i), y(d.students)] as const);
  const staff = data.map((d, i) => [x(i), y(d.staff)] as const);
  const base = y(0);
  const fmt = (day: string, long = false) =>
    new Date(day + 'T00:00:00').toLocaleDateString(undefined, long ? { day: 'numeric', month: 'short', year: 'numeric' } : { day: 'numeric', month: 'short' });
  const labelIdx = data.length > 1 ? [0, 1, 2, 3, 4].map((k) => Math.round((k / 4) * (data.length - 1))) : [0];

  const totS = data.reduce((n, d) => n + d.students, 0);
  const totA = data.reduce((n, d) => n + d.staff, 0);
  const prev = stats.signups_prev;
  const shown = hover != null ? data[hover] : null;

  return (
    <div className="card card-pad chart-card">
      <div className="card-head">
        <h3>Sign-ups, last {days} days</h3>
        <div className="row" style={{ gap: 14 }}>
          <span className="legend"><i style={{ background: 'var(--accent)' }} />Students</span>
          <span className="legend"><i style={{ background: '#d9b98a' }} />Staff</span>
          <select className="range" value={days} onChange={(e) => onDays(Number(e.target.value) as 7 | 30 | 90)} aria-label="Range">
            {RANGES.map((r) => <option key={r} value={r}>Last {r} days</option>)}
          </select>
        </div>
      </div>
      <div className="chart-body">
        <div className="chart-plot" ref={plotRef}>
          <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="line-chart" role="img"
            aria-label={`Sign-ups over the last ${days} days: ${totS} students and ${totA} staff`}
            onMouseLeave={() => setHover(null)}>
            <defs>
              <linearGradient id="studentsFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.28" />
                <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
              </linearGradient>
            </defs>
            {[0, 1, 2, 3, 4].map((k) => (
              <g key={k}>
                <line x1={padL} x2={W - 6} y1={y(k * step)} y2={y(k * step)} className="grid" />
                <text x={padL - 6} y={y(k * step) + 3} className="tick" textAnchor="end">{k * step}</text>
              </g>
            ))}
            {data.length > 1 && (
              <>
                <path d={`${smooth(students, base)} L${x(data.length - 1)},${base} L${x(0)},${base} Z`} fill="url(#studentsFill)" />
                <path d={smooth(staff, base)} fill="none" stroke="#d9b98a" strokeWidth={2} />
                <path d={smooth(students, base)} fill="none" stroke="var(--accent)" strokeWidth={2.4} />
              </>
            )}
            {labelIdx.map((i) => data[i] && (
              <text key={i} x={x(i)} y={H - 4} className="tick"
                textAnchor={i === 0 ? 'start' : i === data.length - 1 ? 'end' : 'middle'}>{fmt(data[i].day)}</text>
            ))}
            {hover != null && data[hover] && (
              <g>
                <line x1={x(hover)} x2={x(hover)} y1={8} y2={base} className="crosshair" />
                <circle cx={x(hover)} cy={y(data[hover].students)} r={4} fill="var(--accent)" stroke="#fff" strokeWidth={2} />
                <circle cx={x(hover)} cy={y(data[hover].staff)} r={3.5} fill="#d9b98a" stroke="#fff" strokeWidth={2} />
              </g>
            )}
            {data.map((_, i) => (
              <rect key={i} x={x(i) - (W / data.length) / 2} y={0} width={W / data.length} height={base}
                fill="transparent" onMouseEnter={() => setHover(i)} />
            ))}
          </svg>
          <div className="chart-tip" aria-live="polite">
            {shown ? <>{fmt(shown.day, true)} — <strong>{shown.students}</strong> students, <strong>{shown.staff}</strong> staff</> : <>&nbsp;</>}
          </div>
        </div>
        <div className="chart-side">
          <div className="side-label">Total sign-ups</div>
          <div className="side-total">
            {(totS + totA).toLocaleString()}
            <Trend cur={totS + totA} prev={prev.students + prev.staff} label="" />
          </div>
          <div className="muted small">vs previous {days} days</div>
          <hr />
          <div className="side-row">
            <span className="legend"><i style={{ background: 'var(--accent)' }} />Students</span>
            <div className="side-n">{totS}<Trend cur={totS} prev={prev.students} label="" /></div>
          </div>
          <div className="side-row">
            <span className="legend"><i style={{ background: '#d9b98a' }} />Staff</span>
            <div className="side-n">{totA}<Trend cur={totA} prev={prev.staff} label="" /></div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Activity & actions ──────────────────────────────────────────────────────

const KIND: Record<ActivityItem['kind'], { label: string; cls: string }> = {
  enrolled: { label: 'Enrolled', cls: 'k-green' },
  test: { label: 'Test completed', cls: 'k-blue' },
  scholarship: { label: 'Scholarship', cls: 'k-purple' },
  enquiry: { label: 'Enquiry', cls: 'k-amber' },
  joined: { label: 'New account', cls: 'k-grey' },
};

const AVATAR_TONES = ['#efe3d0', '#e3ecf5', '#e9e0f2', '#e2f1e7', '#f7e3e0'];
const toneFor = (s: string) => AVATAR_TONES[[...s].reduce((n, c) => n + c.charCodeAt(0), 0) % AVATAR_TONES.length];
const initials = (s: string) =>
  s.split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || '?';

const QUICK = [
  { to: '/users?new=1', title: 'Add new user', sub: 'Create a student or admin', icon: IconUserPlus },
  { to: '/problems/new', title: 'Add coding problem', sub: 'Write a problem and its tests', icon: IconCode },
  { to: '/classes?new=1', title: 'Schedule live class', sub: 'Plan an upcoming session', icon: IconCalendar },
  { to: '/tests?new=1', title: 'Add test', sub: 'Create an assessment', icon: IconClipboard },
  { to: '/mcq-bank?new=1', title: 'Add question', sub: 'Build the question bank', icon: IconHelp },
  { to: '/companies?new=1', title: 'Add company', sub: 'Manage hiring partners', icon: IconBuilding },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

const greeting = (h: number) => (h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening');

const Dashboard: React.FC = () => {
  const { push } = useToast();
  const courses = useCourses();
  const [days, setDays] = useState<7 | 30 | 90>(30);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [activity, setActivity] = useState<ActivityItem[] | null>(null);
  const [queue, setQueue] = useState<GradingQueueItem[]>([]);
  const [error, setError] = useState('');
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (d: 7 | 30 | 90) => {
    setRefreshing(true);
    try {
      const s = await getStats(d);
      setStats(s);
      primeAlerts(s);
      setLoadedAt(new Date());
      setError('');
    } catch (e: any) {
      setError(e.message);
      push('error', e.message);
    } finally {
      setRefreshing(false);
    }
    getActivity(8).then((r) => setActivity(r.items)).catch(() => setActivity([]));
    getGradingQueue().then((r) => setQueue(r.items)).catch(() => setQueue([]));
  }, [push]);

  useEffect(() => { load(days); }, [load, days]);

  // Every catalogue course, busiest first, so an empty course is visible too.
  const courseRows = useMemo(() => {
    const by = stats?.users_by_course ?? {};
    const ids = new Set([...courses.map((c) => c.id), ...Object.keys(by)]);
    return [...ids].map((id) => ({ id, n: by[id] ?? 0 })).sort((a, b) => b.n - a.n || courseName(a.id).localeCompare(courseName(b.id)));
  }, [stats, courses]);
  const courseMax = Math.max(1, ...courseRows.map((c) => c.n));

  const user = getUser();
  const now = new Date();

  if (!stats) {
    return (
      <Layout title="Dashboard" hideHeader>
        {error ? <p className="err">Could not load the dashboard: {error}</p> : <p className="muted">Loading…</p>}
      </Layout>
    );
  }

  const students = stats.users_by_role.student ?? 0;
  const admins = stats.users_by_role.admin ?? 0;
  const recruiters = stats.users_by_role.recruiter ?? 0;

  return (
    <Layout title="Dashboard" hideHeader>
      <section className="hello card">
        <div>
          <p className="hello-kicker">{greeting(now.getHours())},</p>
          <h1 className="hello-name">{user?.name?.trim() || 'Admin'} <span aria-hidden>👋</span></h1>
          <p className="muted" style={{ margin: 0 }}>Here&apos;s what&apos;s happening on your platform today.</p>
        </div>
        <div className="hello-date">
          <span className="hello-date-icon"><IconCalendar size={20} /></span>
          <div>
            <div className="hello-date-day">
              {now.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
            </div>
            <div className="muted small">
              Last updated: {loadedAt?.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
            </div>
          </div>
          <button className="icon-btn" onClick={() => load(days)} disabled={refreshing} aria-label="Refresh" title="Refresh">
            <IconRefresh size={17} className={refreshing ? 'spin' : ''} />
          </button>
        </div>
      </section>

      <div className="kpis">
        <Kpi icon={IconUsers} value={stats.users_total} label="Total users" to="/users" tone="#c98a3a"
          sub={`${students} student${students === 1 ? '' : 's'} · ${admins} admin${admins === 1 ? '' : 's'}${recruiters ? ` · ${recruiters} recruiter${recruiters === 1 ? '' : 's'}` : ''}`}
          trend={{ cur: stats.users_new_7d, prev: stats.users_new_prev_7d }} spark={stats.spark.signups} />
        <Kpi icon={IconUserPlus} value={stats.users_new_7d} label="New this week" to="/users" tone="#2e7d52"
          sub="Accounts created in 7 days"
          trend={{ cur: stats.users_new_7d, prev: stats.users_new_prev_7d }} spark={stats.spark.signups} />
        <Kpi icon={IconCap} value={stats.users_no_course} label="Students with no course" to="/users?course=none" tone="#c98a3a"
          sub={stats.users_no_course ? 'Need a course assigned' : 'No pending issues'} footer={stats.users_no_course ? 'Assign a course' : 'All set'} />
        <Kpi icon={IconInbox} value={stats.enquiries_new} label="New enquiries" to="/enquiries?status=new" tone="#c98a3a"
          sub={`${stats.enquiries_7d} this week`}
          trend={{ cur: stats.enquiries_7d, prev: stats.enquiries_prev_7d }} spark={stats.spark.enquiries} />
        <Kpi icon={IconAward} value={stats.scholarship_pending} label="Scholarships to decide" to="/scholarship" tone="#c0492f"
          sub={`${stats.scholarship_7d} applied this week`}
          trend={{ cur: stats.scholarship_7d, prev: stats.scholarship_prev_7d }} spark={stats.spark.scholarship} />
        <Kpi icon={IconStar} value={stats.answers_to_grade} label="Answers to grade" to="#grading" tone="#2f6fb5"
          sub="Written answers pending review" footer={stats.answers_to_grade ? 'Review now' : 'Nothing waiting'}
          spark={stats.spark.submissions} />
      </div>

      <div className="dash-row">
        <SignupsChart stats={stats} days={days} onDays={setDays} />

        <div className="card card-pad">
          <div className="card-head">
            <h3>Enrolments by course</h3>
            <Link to="/users" className="see-all">View all <IconArrowRight size={14} /></Link>
          </div>
          <ul className="course-bars">
            {courseRows.map((c) => (
              <li key={c.id}>
                <Link to={`/users?course=${encodeURIComponent(c.id)}`} className="course-bar">
                  <span className="course-badge" style={{ background: toneFor(c.id) }}>{initials(courseName(c.id))}</span>
                  <span className="course-name">{courseName(c.id)}</span>
                  <span className="course-track"><span style={{ width: `${(c.n / courseMax) * 100}%` }} /></span>
                  <span className="course-n">{c.n}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="dash-row">
        <div className="card activity-card">
          <div className="card-head card-pad-x">
            <h3><IconClock size={18} /> Recent activity</h3>
          </div>
          {activity === null ? (
            <p className="muted card-pad-x">Loading…</p>
          ) : activity.length === 0 ? (
            <p className="muted card-pad-x">Nothing has happened yet.</p>
          ) : (
            <div className="scroll-x">
              <table className="activity">
                <thead><tr><th>Date &amp; time</th><th>Person</th><th>Activity</th><th>Details</th></tr></thead>
                <tbody>
                  {activity.map((a, i) => (
                    <tr key={i}>
                      <td className="nowrap muted">
                        {new Date(a.at).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
                      </td>
                      <td>
                        <span className="person">
                          <span className="avatar xs" style={{ background: toneFor(a.email) }}>{initials(a.name || a.email)}</span>
                          <span title={a.email}>{a.name || a.email}</span>
                        </span>
                      </td>
                      <td>
                        {a.link_to ? (
                          <Link to={a.link_to} className="activity-link">{a.text}{a.course ? ` ${courseName(a.course)}` : ''}</Link>
                        ) : <>{a.text}{a.course ? ` ${courseName(a.course)}` : ''}</>}
                      </td>
                      <td><span className={`kind ${KIND[a.kind]?.cls ?? 'k-grey'}`}>{KIND[a.kind]?.label ?? a.kind}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="card card-pad">
          <div className="card-head"><h3><IconZap size={18} /> Quick actions</h3></div>
          <div className="quick">
            {QUICK.map((q) => (
              <Link key={q.to} to={q.to} className="quick-item">
                <span className="quick-icon"><q.icon size={19} /></span>
                <span className="quick-text"><strong>{q.title}</strong><span>{q.sub}</span></span>
                <IconChevronRight size={16} />
              </Link>
            ))}
          </div>
        </div>
      </div>

      {queue.length > 0 && (
        <div className="card mt" id="grading">
          <div className="card-head card-pad-x"><h3><IconStar size={18} /> Answers to grade</h3></div>
          <div className="scroll-x">
            <table className="activity">
              <thead><tr><th>Candidate</th><th>Test</th><th>Answers waiting</th><th>Submitted</th><th></th></tr></thead>
              <tbody>
                {queue.map((q) => (
                  <tr key={q.attempt_id}>
                    <td>{q.user_name || q.user_email}<div className="muted small">{q.user_email}</div></td>
                    <td>{q.title}</td>
                    <td>{q.pending}</td>
                    <td className="muted nowrap">{new Date(q.submitted_at).toLocaleString()}</td>
                    <td className="actions">
                      <Link className="btn-link" to={`/tests/${q.assessment_id}/results/${q.attempt_id}`}>Grade</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Layout>
  );
};

export default Dashboard;
