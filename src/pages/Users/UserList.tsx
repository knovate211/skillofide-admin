import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Layout from '../../components/Layout';
import Confirm from '../../components/Confirm';
import TypeConfirm from '../../components/TypeConfirm';
import UserEditDrawer from './UserEditDrawer';
import AddUserModal from './AddUserModal';
import { useToast } from '../../components/Toast';
import {
  listUsers,
  deleteUser,
  bulkUsers,
  exportUsersCsv,
  type AdminUserRow,
  type BulkUserAction,
  type UserFilters,
} from '../../lib/api';
import { courseName, useCourses } from '../../lib/courses';
import { getUser } from '../../lib/auth';

const PAGE_SIZE = 20;

type PendingBulk = { action: BulkUserAction; role?: string; course_id?: string; text: string };

const UserList: React.FC = () => {
  const { push } = useToast();
  const navigate = useNavigate();
  const courses = useCourses();
  const me = getUser()?.id;

  // Filters and page live in the URL, so a refresh keeps them and dashboard
  // tiles can deep-link into a filtered list.
  const [params, setParams] = useSearchParams();
  const filters: UserFilters = useMemo(() => ({
    search: params.get('search') || '',
    role: params.get('role') || '',
    course: params.get('course') || '',
    from: params.get('from') || '',
    to: params.get('to') || '',
  }), [params]);
  const page = Number(params.get('page')) || 1;

  const setFilter = (key: keyof UserFilters | 'page', value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    if (key !== 'page') next.delete('page');
    setParams(next, { replace: true });
  };

  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<AdminUserRow | null>(null);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<AdminUserRow | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkPick, setBulkPick] = useState('');
  const [pendingBulk, setPendingBulk] = useState<PendingBulk | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listUsers(page, PAGE_SIZE, filters);
      setUsers(res.users);
      setTotal(res.total);
    } catch (e: any) {
      push('error', e.message);
    } finally {
      setLoading(false);
    }
  }, [page, filters, push]);

  useEffect(() => {
    const t = setTimeout(load, 250); // debounce search
    return () => clearTimeout(t);
  }, [load]);

  // A changed filter means a different set of people; carrying a selection
  // across it would act on users no longer on screen.
  useEffect(() => { setSelected(new Set()); }, [filters]);

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await deleteUser(deleting.id);
      push('success', `Deleted ${deleting.email}`);
      setDeleting(null);
      load();
    } catch (e: any) {
      push('error', e.message);
    }
  };

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  const allOnPage = users.length > 0 && users.every((u) => selected.has(u.id));
  const togglePage = () =>
    setSelected((s) => {
      const n = new Set(s);
      users.forEach((u) => (allOnPage ? n.delete(u.id) : n.add(u.id)));
      return n;
    });

  // The bulk dropdown encodes "action:arg", e.g. "grant_course:genai".
  const startBulk = (pick: string) => {
    setBulkPick('');
    if (!pick) return;
    const [action, arg] = pick.split(':') as [BulkUserAction, string | undefined];
    const n = selected.size;
    const who = `${n} user${n === 1 ? '' : 's'}`;
    const text =
      action === 'set_role' ? `Change the role of ${who} to ${arg}?`
      : action === 'grant_course' ? `Give ${who} access to ${courseName(arg!)}?`
      : action === 'revoke_course' ? `Remove ${courseName(arg!)} from ${who}?`
      : `Permanently delete ${who}? This also removes their course access, profile and submissions.`;
    setPendingBulk({
      action,
      text,
      role: action === 'set_role' ? arg : undefined,
      course_id: action.endsWith('_course') ? arg : undefined,
    });
  };

  const runBulk = async () => {
    if (!pendingBulk) return;
    try {
      const r = await bulkUsers([...selected], pendingBulk.action, {
        role: pendingBulk.role,
        course_id: pendingBulk.course_id,
      });
      push('success', `Done — ${r.affected} of ${r.requested} changed`);
      setPendingBulk(null);
      setSelected(new Set());
      load();
    } catch (e: any) {
      push('error', e.message);
    }
  };

  const exportCsv = async () => {
    try {
      await exportUsersCsv(filters);
    } catch (e: any) {
      push('error', e.message);
    }
  };

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasFilters = !!(filters.search || filters.role || filters.course || filters.from || filters.to);
  const bulkDeleteNeedsTyping = pendingBulk?.action === 'delete' && selected.size > 1;

  return (
    <Layout
      title="Users"
      actions={
        <>
          <button className="secondary" onClick={exportCsv}>Export CSV</button>
          <button className="secondary" onClick={() => navigate('/import')}>Bulk import</button>
          <button onClick={() => setAdding(true)}>Add user</button>
        </>
      }
    >
      <div className="filter-bar mb">
        <input
          className="filter-search"
          placeholder="Search name or email…"
          value={filters.search}
          onChange={(e) => setFilter('search', e.target.value)}
        />
        <select value={filters.role} onChange={(e) => setFilter('role', e.target.value)}>
          <option value="">All roles</option>
          <option value="student">Student</option>
          <option value="recruiter">Recruiter</option>
          <option value="admin">Admin</option>
        </select>
        <select value={filters.course} onChange={(e) => setFilter('course', e.target.value)}>
          <option value="">All courses</option>
          <option value="none">No course</option>
          {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <div className="date-range">
          <span className="muted small">Joined</span>
          <input type="date" value={filters.from} max={filters.to || undefined} onChange={(e) => setFilter('from', e.target.value)} aria-label="From date" />
          <span className="muted">–</span>
          <input type="date" value={filters.to} min={filters.from || undefined} onChange={(e) => setFilter('to', e.target.value)} aria-label="To date" />
        </div>
        {hasFilters && (
          <button className="ghost sm" onClick={() => setParams(new URLSearchParams(), { replace: true })}>
            Clear filters
          </button>
        )}
        <span className="grow" />
        <span className="muted nowrap">{total} user{total === 1 ? '' : 's'}</span>
      </div>

      {selected.size > 0 && (
        <div className="bulk-bar mb">
          <strong>{selected.size} selected</strong>
          <select value={bulkPick} onChange={(e) => startBulk(e.target.value)}>
            <option value="">Choose an action…</option>
            <optgroup label="Grant course">
              {courses.map((c) => <option key={c.id} value={`grant_course:${c.id}`}>{c.name}</option>)}
            </optgroup>
            <optgroup label="Revoke course">
              {courses.map((c) => <option key={c.id} value={`revoke_course:${c.id}`}>{c.name}</option>)}
            </optgroup>
            <optgroup label="Set role">
              <option value="set_role:student">Student</option>
              <option value="set_role:recruiter">Recruiter</option>
              <option value="set_role:admin">Admin</option>
            </optgroup>
            <optgroup label="Danger">
              <option value="delete">Delete users</option>
            </optgroup>
          </select>
          <button className="ghost sm" onClick={() => setSelected(new Set())}>Clear selection</button>
        </div>
      )}

      <div className="scroll-x">
        <table className="card">
          <thead>
            <tr>
              <th style={{ width: 32 }}>
                <input type="checkbox" checked={allOnPage} onChange={togglePage} aria-label="Select all on this page" />
              </th>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Courses</th>
              <th>Joined</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="muted">Loading…</td></tr>
            ) : users.length === 0 ? (
              <tr><td colSpan={7} className="muted">No users found.</td></tr>
            ) : (
              users.map((u) => (
                <tr key={u.id} className={selected.has(u.id) ? 'selected' : ''}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selected.has(u.id)}
                      onChange={() => toggle(u.id)}
                      aria-label={`Select ${u.email}`}
                    />
                  </td>
                  <td>{u.name}{u.id === me && <span className="muted small"> (you)</span>}</td>
                  <td>{u.email}</td>
                  <td><span className={`badge ${u.role}`}>{u.role}</span></td>
                  <td>
                    {u.course_ids.length === 0 ? (
                      <span className="muted">—</span>
                    ) : (
                      u.course_ids.map((c) => <span key={c} className="chip">{courseName(c)}</span>)
                    )}
                  </td>
                  <td className="muted nowrap">{new Date(u.created_at).toLocaleDateString()}</td>
                  <td className="actions">
                    <button className="ghost sm" onClick={() => setEditing(u)}>Edit</button>
                    {u.id !== me && <button className="ghost sm" onClick={() => setDeleting(u)}>Delete</button>}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div className="row mt" style={{ justifyContent: 'center' }}>
          <button className="secondary sm" disabled={page <= 1} onClick={() => setFilter('page', String(page - 1))}>Prev</button>
          <span className="muted">Page {page} of {pages}</span>
          <button className="secondary sm" disabled={page >= pages} onClick={() => setFilter('page', String(page + 1))}>Next</button>
        </div>
      )}

      {editing && (
        <UserEditDrawer
          user={editing}
          onClose={() => setEditing(null)}
          onChanged={load}
        />
      )}
      {adding && (
        <AddUserModal
          onClose={() => setAdding(false)}
          onCreated={() => { setAdding(false); load(); }}
        />
      )}
      {deleting && (
        <Confirm
          title="Delete user"
          message={`Permanently delete ${deleting.email}? This also removes their course access, profile and submissions.`}
          confirmLabel="Delete"
          danger
          onConfirm={confirmDelete}
          onCancel={() => setDeleting(null)}
        />
      )}
      {pendingBulk && !bulkDeleteNeedsTyping && (
        <Confirm
          title="Bulk action"
          message={pendingBulk.text}
          confirmLabel={pendingBulk.action === 'delete' ? 'Delete' : 'Apply'}
          danger={pendingBulk.action === 'delete'}
          onConfirm={runBulk}
          onCancel={() => setPendingBulk(null)}
        />
      )}
      {pendingBulk && bulkDeleteNeedsTyping && (
        // Deleting many accounts cannot be undone, so it takes a typed
        // confirmation rather than a single click.
        <TypeConfirm
          title={`Delete ${selected.size} users`}
          message={pendingBulk.text}
          confirmLabel="Delete"
          onConfirm={runBulk}
          onCancel={() => setPendingBulk(null)}
        />
      )}
    </Layout>
  );
};

export default UserList;
