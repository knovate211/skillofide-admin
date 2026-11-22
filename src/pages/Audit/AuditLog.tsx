import React, { useCallback, useEffect, useState } from 'react';
import Layout from '../../components/Layout';
import { useToast } from '../../components/Toast';
import { listAudit, type AuditEntry } from '../../lib/api';
import { courseName } from '../../lib/courses';

const PAGE_SIZE = 50;

const ACTIONS: { value: string; label: string }[] = [
  { value: '', label: 'All actions' },
  { value: 'user.role_changed', label: 'Role changed' },
  { value: 'user.updated', label: 'User edited' },
  { value: 'user.deleted', label: 'User deleted' },
  { value: 'course.granted', label: 'Course granted' },
  { value: 'course.revoked', label: 'Course revoked' },
  { value: 'users.imported', label: 'Bulk import' },
  { value: 'users.exported', label: 'Users exported' },
  { value: 'enquiries.status_changed', label: 'Enquiries: status changed' },
  { value: 'enquiries.deleted', label: 'Enquiries deleted' },
  { value: 'enquiries.exported', label: 'Enquiries exported' },
  { value: 'scholarships.deleted', label: 'Applications deleted' },
];

const label = (a: string) => ACTIONS.find((x) => x.value === a)?.label ?? a;

function describe(e: AuditEntry): string {
  const d = e.detail || {};
  const parts: string[] = [];
  if (typeof d.role === 'string') parts.push(`role → ${d.role}`);
  if (typeof d.course_id === 'string') parts.push(courseName(d.course_id));
  if (typeof d.name === 'string') parts.push(`name → ${d.name}`);
  if (typeof d.email === 'string') parts.push(`email → ${d.email}`);
  if (typeof d.phone === 'string') parts.push(`phone → ${d.phone}`);
  if (typeof d.total === 'number') parts.push(`${d.success}/${d.total} rows`);
  if (typeof d.rows === 'number') parts.push(`${d.rows} rows`);
  if (typeof d.count === 'number') parts.push(`${d.count} rows`);
  if (typeof d.status === 'string') parts.push(`→ ${d.status}`);
  if (d.all_matching) parts.push('all matching');
  if (d.bulk) parts.push('bulk');
  return parts.join(' · ');
}

const AuditLog: React.FC = () => {
  const { push } = useToast();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [action, setAction] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await listAudit(page, PAGE_SIZE, action, search);
      setEntries(r.entries);
      setTotal(r.total);
    } catch (e: any) {
      push('error', e.message);
    } finally {
      setLoading(false);
    }
  }, [page, action, search, push]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <Layout title="Audit log">
      <div className="filter-bar mb">
        <input
          className="filter-search"
          placeholder="Search admin or user email…"
          value={search}
          onChange={(e) => { setPage(1); setSearch(e.target.value); }}
        />
        <select value={action} onChange={(e) => { setPage(1); setAction(e.target.value); }}>
          {ACTIONS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
        </select>
        <span className="grow" />
        <span className="muted nowrap">{total} entr{total === 1 ? 'y' : 'ies'}</span>
      </div>

      <div className="scroll-x">
        <table className="card">
          <thead>
            <tr><th>When</th><th>Admin</th><th>Action</th><th>User</th><th>Detail</th></tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="muted">Loading…</td></tr>
            ) : entries.length === 0 ? (
              <tr><td colSpan={5} className="muted">No entries yet. Changes made from this panel appear here.</td></tr>
            ) : (
              entries.map((e) => (
                <tr key={e.id}>
                  <td className="muted nowrap">{new Date(e.created_at).toLocaleString()}</td>
                  <td>{e.actor_email || '—'}</td>
                  <td><span className={`badge ${e.action.endsWith('deleted') ? 'archived' : 'draft'}`}>{label(e.action)}</span></td>
                  <td>{e.target_email || '—'}</td>
                  <td className="muted">{describe(e)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div className="row mt" style={{ justifyContent: 'center' }}>
          <button className="secondary sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</button>
          <span className="muted">Page {page} of {pages}</span>
          <button className="secondary sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Next</button>
        </div>
      )}
    </Layout>
  );
};

export default AuditLog;
