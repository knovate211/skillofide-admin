import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../../components/Layout';
import { useToast } from '../../components/Toast';
import {
  getStats,
  getGradingQueue,
  type AdminStats,
  type GradingQueueItem,
} from '../../lib/api';
import { courseName } from '../../lib/courses';

const Tile: React.FC<{ n: number; label: string; to?: string; hint?: string; alert?: boolean }> = ({
  n,
  label,
  to,
  hint,
  alert,
}) => {
  const body = (
    <div className={`card tile${alert && n > 0 ? ' alert' : ''}`}>
      <div className="n">{n.toLocaleString()}</div>
      <div className="l">{label}</div>
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
  return to ? <Link to={to} className="tile-link">{body}</Link> : body;
};

// Sign-ups per day. One series, so no legend — the heading names it. Bars are
// thin with a 2px gap and rounded tops; hovering a bar shows its exact value.
const SignupChart: React.FC<{ data: { day: string; count: number }[] }> = ({ data }) => {
  const [hover, setHover] = useState<number | null>(null);
  const W = 600;
  const H = 140;
  const max = Math.max(1, ...data.map((d) => d.count));
  const slot = W / Math.max(1, data.length);
  const barW = Math.max(2, slot - 2);
  const fmt = (day: string) =>
    new Date(day + 'T00:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  const total = data.reduce((s, d) => s + d.count, 0);
  const shown = hover != null ? data[hover] : null;

  return (
    <div className="card card-pad">
      <div className="row between">
        <h3 className="chart-title">Sign-ups, last 30 days</h3>
        <span className="muted">
          {shown ? `${fmt(shown.day)}: ${shown.count}` : `${total} total`}
        </span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H + 18}`}
        className="chart"
        role="img"
        aria-label={`Sign-ups per day, ${total} in the last 30 days`}
        onMouseLeave={() => setHover(null)}
      >
        <line x1={0} x2={W} y1={H} y2={H} className="axis" />
        {data.map((d, i) => {
          const h = (d.count / max) * (H - 8);
          const x = i * slot + 1;
          return (
            <g key={d.day} onMouseEnter={() => setHover(i)}>
              {/* Full-height hit target, wider than the mark. */}
              <rect x={i * slot} y={0} width={slot} height={H} fill="transparent" />
              {d.count > 0 && (
                <path
                  className={`bar${hover === i ? ' on' : ''}`}
                  d={roundedTop(x, H - h, barW, h, Math.min(4, barW / 2, h))}
                />
              )}
            </g>
          );
        })}
        <text x={0} y={H + 14} className="tick">{data[0] && fmt(data[0].day)}</text>
        <text x={W} y={H + 14} className="tick" textAnchor="end">
          {data.length > 0 && fmt(data[data.length - 1].day)}
        </text>
      </svg>
    </div>
  );
};

function roundedTop(x: number, y: number, w: number, h: number, r: number): string {
  return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`;
}

const Dashboard: React.FC = () => {
  const { push } = useToast();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [queue, setQueue] = useState<GradingQueueItem[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    getStats().then(setStats).catch((e) => {
      setError(e.message);
      push('error', e.message);
    });
    getGradingQueue().then((r) => setQueue(r.items)).catch(() => setQueue([]));
  }, [push]);

  if (!stats) {
    return (
      <Layout title="Dashboard">
        {error ? (
          <p className="err">Could not load the dashboard: {error}</p>
        ) : (
          <p className="muted">Loading…</p>
        )}
      </Layout>
    );
  }

  const courses = Object.entries(stats.users_by_course).sort((a, b) => b[1] - a[1]);
  const courseMax = Math.max(1, ...courses.map(([, n]) => n));

  return (
    <Layout title="Dashboard">
      <div className="tiles mb">
        <Tile n={stats.users_total} label="Users" to="/users"
          hint={`${stats.users_by_role.student ?? 0} students · ${stats.users_by_role.admin ?? 0} admins`} />
        <Tile n={stats.users_new_7d} label="New this week" to="/users" />
        <Tile n={stats.users_no_course} label="Students with no course" to="/users?course=none" alert />
        <Tile n={stats.enquiries_new} label="New enquiries" to="/enquiries" hint={`${stats.enquiries_7d} this week`} alert />
        <Tile n={stats.scholarship_pending} label="Scholarships to decide" to="/scholarship" hint={`${stats.scholarship_7d} applied this week`} alert />
        <Tile n={stats.answers_to_grade} label="Answers to grade" alert />
        <Tile n={stats.attempts_7d} label="Test attempts this week" to="/tests" hint={`${stats.attempts_live} in progress now`} />
        <Tile n={stats.tests_published} label="Published tests" to="/tests" />
      </div>

      <div className="dash-grid">
        <SignupChart data={stats.signups_30d} />

        <div className="card card-pad">
          <h3 className="chart-title">Enrolments by course</h3>
          {courses.length === 0 ? (
            <p className="muted">No enrolments yet.</p>
          ) : (
            <table className="bars">
              <tbody>
                {courses.map(([id, n]) => (
                  <tr key={id}>
                    <td className="bar-label">
                      <Link to={`/users?course=${encodeURIComponent(id)}`}>{courseName(id)}</Link>
                    </td>
                    <td className="bar-cell">
                      <div className="hbar" style={{ width: `${(n / courseMax) * 100}%` }} />
                    </td>
                    <td className="bar-n">{n}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <h3 className="mt">Grading queue</h3>
      <div className="scroll-x">
        <table className="card">
          <thead>
            <tr><th>Candidate</th><th>Test</th><th>Answers waiting</th><th>Submitted</th><th></th></tr>
          </thead>
          <tbody>
            {queue.length === 0 ? (
              <tr><td colSpan={5} className="muted">Nothing waiting — every written answer has a mark.</td></tr>
            ) : (
              queue.map((q) => (
                <tr key={q.attempt_id}>
                  <td>{q.user_name || q.user_email}<div className="muted small">{q.user_email}</div></td>
                  <td>{q.title}</td>
                  <td>{q.pending}</td>
                  <td className="muted">{new Date(q.submitted_at).toLocaleString()}</td>
                  <td className="actions">
                    <Link className="btn-link" to={`/tests/${q.assessment_id}/results/${q.attempt_id}`}>Grade</Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Layout>
  );
};

export default Dashboard;
