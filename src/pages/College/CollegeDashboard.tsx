import React, { useCallback, useEffect, useRef, useState } from 'react';
import Layout from '../../components/Layout';
import { useToast } from '../../components/Toast';
import {
  exportCollegeStudents,
  getCollegeOverview,
  listCollegeStudents,
  uploadCollegeRoster,
  type CollegeFilter,
  type CollegeOverview,
  type CollegeStudent,
  type RosterResult,
} from '../../lib/api';
import { parseRoster } from '../../lib/excel';

// The placement cell's only screen: its own linked students, read only. The
// server scopes everything to the signed-in account's college and logs each
// view and export; this page never sends a college id.

const FILTERS: { key: CollegeFilter; label: string }[] = [
  { key: '', label: 'All students' },
  { key: 'inactive', label: 'Inactive' },
  { key: 'attendance', label: 'Low attendance' },
  { key: 'flagged', label: 'Integrity flag' },
];

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Never';

const Bar: React.FC<{ pct: number }> = ({ pct }) => (
  <span aria-hidden style={{ display: 'inline-block', width: 80, height: 8, background: '#efe9de', borderRadius: 99, verticalAlign: 'middle', marginRight: 8 }}>
    <span style={{ display: 'block', width: `${Math.max(0, Math.min(100, pct))}%`, height: 8, background: 'var(--accent)', borderRadius: 99 }} />
  </span>
);

const CollegeDashboard: React.FC = () => {
  const { push } = useToast();
  const [overview, setOverview] = useState<CollegeOverview | null>(null);
  const [students, setStudents] = useState<CollegeStudent[]>([]);
  const [total, setTotal] = useState(0);
  const [branches, setBranches] = useState<string[]>([]);
  const [years, setYears] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [branch, setBranch] = useState('');
  const [year, setYear] = useState('');
  const [filter, setFilter] = useState<CollegeFilter>('');
  const [uploading, setUploading] = useState(false);
  const [rosterResult, setRosterResult] = useState<RosterResult & { invalid: number[] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const tableRef = useRef<HTMLDivElement>(null);

  const loadOverview = useCallback(async () => {
    try {
      setOverview(await getCollegeOverview());
    } catch (e: any) {
      setError(e.message);
    }
  }, []);

  const loadStudents = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listCollegeStudents({ q: search, branch, year, filter });
      setStudents(res.students || []);
      setTotal(res.total);
      setBranches(res.branches || []);
      setYears(res.years || []);
      setError('');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [search, branch, year, filter]);

  useEffect(() => { loadOverview(); }, [loadOverview]);
  useEffect(() => { loadStudents(); }, [loadStudents]);

  // Search as you type, without a request per keystroke.
  useEffect(() => {
    const t = window.setTimeout(() => setSearch(q.trim()), 300);
    return () => window.clearTimeout(t);
  }, [q]);

  const showFilter = (f: CollegeFilter) => {
    setFilter(f);
    tableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const doExport = async () => {
    try {
      const slug = (overview?.college.name || 'college').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      await exportCollegeStudents({ q: search, branch, year, filter }, `${slug}-students-${new Date().toISOString().slice(0, 10)}.csv`);
    } catch (e: any) {
      push('error', e.message);
    }
  };

  const copyCode = async () => {
    if (!overview) return;
    try {
      await navigator.clipboard.writeText(overview.college.joinCode);
      push('success', 'Join code copied');
    } catch {
      push('error', 'Could not copy — select the code and copy it instead');
    }
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    setRosterResult(null);
    try {
      const parsed = await parseRoster(file);
      if (parsed.rows.length === 0) {
        push('error', 'No email addresses found. The file needs an "Email" column.');
        return;
      }
      const res = await uploadCollegeRoster(parsed.rows);
      setRosterResult({ ...res, invalid: parsed.invalid });
      push('success', `${res.requested} new request${res.requested === 1 ? '' : 's'} sent`);
      loadOverview();
    } catch (err: any) {
      push('error', err.message);
    } finally {
      setUploading(false);
    }
  };

  const o = overview;
  const name = o?.college.name || 'Your college';

  return (
    <Layout
      title={name}
      actions={<button className="secondary" onClick={doExport} disabled={!total}>Export CSV</button>}
    >
      <p className="muted small mb">
        Only students who linked their account to {name} appear here. You see progress, attendance, test scores and
        certificates — never answers, camera data or messages. Each time you open or export this list it is logged,
        and students can unlink at any time.
      </p>

      {error && <div className="card card-pad mb" role="alert" style={{ color: 'var(--danger)' }}>{error}</div>}

      {/* Summary */}
      <div className="mb" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12 }}>
        <div className="card card-pad">
          <div className="muted small">Linked students</div>
          <div style={{ fontSize: 28, fontWeight: 800 }}>{o ? o.linked : '—'}</div>
          <div className="muted small">
            {o ? `${o.joinedThisMonth} joined this month${o.pendingRequests ? ` · ${o.pendingRequests} yet to accept` : ''}` : ' '}
          </div>
        </div>
        <div className="card card-pad">
          <div className="muted small">Active in the last 7 days</div>
          <div style={{ fontSize: 28, fontWeight: 800 }}>
            {o ? o.active7d : '—'}
            {o && o.linked > 0 && <span className="muted" style={{ fontSize: 15, fontWeight: 600 }}> · {Math.round((o.active7d / o.linked) * 100)}%</span>}
          </div>
          <div className="muted small">Opened a lesson, a class or a test</div>
        </div>
        <div className="card card-pad">
          <div className="muted small">Average course progress</div>
          <div style={{ fontSize: 28, fontWeight: 800 }}>{o ? `${o.avgProgress}%` : '—'}</div>
          {o && <Bar pct={o.avgProgress} />}
        </div>
        <div className="card card-pad">
          <div className="muted small">Certified</div>
          <div style={{ fontSize: 28, fontWeight: 800 }}>{o ? o.certified : '—'}</div>
          <div className="muted small">
            {o?.certPassRate != null ? `${o.certPassRate}% pass rate on certification exams` : 'No certification exams yet'}
          </div>
        </div>
      </div>

        {/* Attention + linking, side by side */}
      <div className="mb" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, alignItems: 'start' }}>
          <div className="card card-pad">
            <h3 style={{ margin: '0 0 4px', fontSize: 16 }}>Needs attention</h3>
            <p className="muted small" style={{ margin: '0 0 12px' }}>Worth a word from a mentor.</p>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <li className="row" style={{ justifyContent: 'space-between', gap: 8 }}>
                <span><strong>{o?.needsAttention.inactive ?? '—'}</strong> inactive for {o?.inactiveAfterDays ?? 14}+ days</span>
                <button className="ghost sm" onClick={() => showFilter('inactive')} disabled={!o?.needsAttention.inactive}>View</button>
              </li>
              <li className="row" style={{ justifyContent: 'space-between', gap: 8 }}>
                <span><strong>{o?.needsAttention.lowAttendance ?? '—'}</strong> below {o?.lowAttendancePct ?? 60}% attendance</span>
                <button className="ghost sm" onClick={() => showFilter('attendance')} disabled={!o?.needsAttention.lowAttendance}>View</button>
              </li>
              <li className="row" style={{ justifyContent: 'space-between', gap: 8 }}>
                <span><strong>{o?.needsAttention.flagged ?? '—'}</strong> with a test flagged for integrity</span>
                <button className="ghost sm" onClick={() => showFilter('flagged')} disabled={!o?.needsAttention.flagged}>View</button>
              </li>
            </ul>
          </div>

          <div className="card card-pad">
            <h3 style={{ margin: '0 0 4px', fontSize: 16 }}>Link more students</h3>
            <p className="muted small" style={{ margin: '0 0 12px' }}>
              Students enter this code in their Knovate profile. Linking is their choice, and they can unlink any time.
            </p>
            <div className="row" style={{ alignItems: 'center', justifyContent: 'space-between', background: 'var(--bg)', borderRadius: 8, padding: '10px 12px', gap: 8 }}>
              <code style={{ fontSize: 18, letterSpacing: '.08em' }}>{o?.college.joinCode ?? '—'}</code>
              <button className="secondary sm" onClick={copyCode} disabled={!o}>Copy</button>
            </div>
            <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" onChange={onFile} hidden />
            <button style={{ width: '100%', marginTop: 12 }} onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading ? 'Uploading…' : 'Upload a student list (CSV or Excel)'}
            </button>
            <p className="muted small" style={{ margin: '8px 0 0' }}>
              Columns: <strong>Email</strong> (required), Roll no, Branch, Year. Each listed student sees a request in
              their profile and appears here once they accept.
            </p>
            {rosterResult && (
              <div className="small" role="status" style={{ marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                <div><strong>{rosterResult.requested}</strong> new requests sent</div>
                {rosterResult.updated > 0 && <div>{rosterResult.updated} earlier requests updated</div>}
                {rosterResult.alreadyLinked > 0 && <div>{rosterResult.alreadyLinked} already linked</div>}
                {rosterResult.otherCollege > 0 && <div>{rosterResult.otherCollege} linked to another college</div>}
                {rosterResult.notFound.length > 0 && (
                  <details style={{ marginTop: 6 }}>
                    <summary>{rosterResult.notFound.length} not on Knovate as a student</summary>
                    <p className="muted" style={{ margin: '6px 0 0', wordBreak: 'break-all' }}>{rosterResult.notFound.join(', ')}</p>
                  </details>
                )}
                {rosterResult.invalid.length > 0 && (
                  <div className="muted" style={{ marginTop: 6 }}>Skipped rows without a valid email: {rosterResult.invalid.slice(0, 20).join(', ')}{rosterResult.invalid.length > 20 ? '…' : ''}</div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Students */}
        <div ref={tableRef} className="card card-pad" style={{ minWidth: 0 }}>
          <div className="filters row mb" style={{ flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Name, email or roll no."
              aria-label="Search students"
              style={{ minWidth: 200, flex: '1 1 200px' }}
            />
            <select value={branch} onChange={(e) => setBranch(e.target.value)} aria-label="Branch">
              <option value="">All branches</option>
              {branches.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
            <select value={year} onChange={(e) => setYear(e.target.value)} aria-label="Year">
              <option value="">All years</option>
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
            <select value={filter} onChange={(e) => setFilter(e.target.value as CollegeFilter)} aria-label="Show">
              {FILTERS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
            </select>
          </div>

          <div className="scroll-x">
            <table style={{ minWidth: 760 }}>
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Branch · year</th>
                  <th>Course progress</th>
                  <th>Attendance (30 days)</th>
                  <th>Latest test</th>
                  <th>Certificate</th>
                  <th>Last active</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={7} className="muted">Loading…</td></tr>
                ) : students.length === 0 ? (
                  <tr><td colSpan={7} className="muted">
                    {total === 0
                      ? 'No students linked yet. Share your join code, or upload your student list on the right.'
                      : 'No students match these filters.'}
                  </td></tr>
                ) : (
                  students.map((s) => (
                    <tr key={s.userId}>
                      <td>
                        <strong>{s.name}</strong>
                        <div className="muted small">{s.rollNo || s.email}</div>
                      </td>
                      <td className="nowrap">{[s.branch, s.year].filter(Boolean).join(' · ') || <span className="muted">—</span>}</td>
                      <td className="nowrap">
                        {s.courseTitle
                          ? <><Bar pct={s.coursePercent} />{s.coursePercent}% · {s.courseTitle}</>
                          : <span className="muted">Not started</span>}
                      </td>
                      <td className="nowrap">
                        {s.attendancePercent == null
                          ? <span className="muted">No classes</span>
                          : <span style={s.lowAttendance ? { color: 'var(--danger)', fontWeight: 700 } : undefined}>
                              {s.attendancePercent}% <span className="muted small">of {s.attendanceSessions}</span>
                            </span>}
                      </td>
                      <td>
                        {s.latestTest
                          ? <>{s.latestTest.percent}% · {s.latestTest.title}{s.latestTest.endedByProctor && <span className="muted small"> (ended early)</span>}</>
                          : <span className="muted">Not taken</span>}
                        {s.integrityFlag && <> <span className="badge archived">Integrity flag</span></>}
                      </td>
                      <td>
                        {s.certificates > 0
                          ? <span className="badge published" title={s.certificateTitle}>Certified{s.certificates > 1 ? ` ×${s.certificates}` : ''}</span>
                          : <span className="muted">—</span>}
                      </td>
                      <td className="nowrap" style={s.inactive ? { color: 'var(--danger)' } : undefined}>{fmtDate(s.lastActiveAt)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {!loading && total > 0 && (
            <p className="muted small" style={{ margin: '12px 0 0' }}>Showing {students.length} of {total}</p>
          )}
        </div>
    </Layout>
  );
};

export default CollegeDashboard;
