import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../../components/Layout';
import Confirm from '../../components/Confirm';
import UserEditDrawer from './UserEditDrawer';
import AddUserModal from './AddUserModal';
import { useToast } from '../../components/Toast';
import TableState from '../../components/TableState';
import { listUsers, deleteUser, type AdminUserRow } from '../../lib/api';
import { courseName } from '../../lib/courses';

const PAGE_SIZE = 20;

const UserList: React.FC = () => {
  const { push } = useToast();
  const navigate = useNavigate();
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<AdminUserRow | null>(null);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<AdminUserRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listUsers(page, PAGE_SIZE, search);
      setUsers(res.users);
      setTotal(res.total);
    } catch (e: any) {
      push('error', e.message);
    } finally {
      setLoading(false);
    }
  }, [page, search, push]);

  useEffect(() => {
    const t = setTimeout(load, 250); // debounce search
    return () => clearTimeout(t);
  }, [load]);

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

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <Layout
      title="Users"
      actions={
        <>
          <button className="secondary" onClick={() => navigate('/import')}>Bulk import</button>
          <button onClick={() => setAdding(true)}>Add user</button>
        </>
      }
    >
      <div className="row between mb">
        <input
          style={{ maxWidth: 320 }}
          placeholder="Search name or email…"
          value={search}
          onChange={(e) => {
            setPage(1);
            setSearch(e.target.value);
          }}
        />
        <span className="muted">{total} user{total === 1 ? '' : 's'}</span>
      </div>

      <div className="scroll-x">
        <table className="card">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Courses</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading || users.length === 0 ? (
              <TableState
                loading={loading}
                columns={5}
                title="No users found"
                hint="Try a different search, or add a user."
              />
            ) : (
              users.map((u) => (
                <tr key={u.id}>
                  <td>{u.name}</td>
                  <td>{u.email}</td>
                  <td><span className={`badge ${u.role}`}>{u.role}</span></td>
                  <td>
                    {u.course_ids.length === 0 ? (
                      <span className="muted">—</span>
                    ) : (
                      u.course_ids.map((c) => <span key={c} className="chip">{courseName(c)}</span>)
                    )}
                  </td>
                  <td className="actions">
                    <button className="ghost sm" onClick={() => setEditing(u)}>Edit</button>
                    <button className="ghost sm" onClick={() => setDeleting(u)}>Delete</button>
                  </td>
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
    </Layout>
  );
};

export default UserList;
