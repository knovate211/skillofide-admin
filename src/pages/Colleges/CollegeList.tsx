import React, { useCallback, useEffect, useState } from 'react';
import Layout from '../../components/Layout';
import Modal from '../../components/Modal';
import { useToast } from '../../components/Toast';
import {
  addCollegeStaff,
  createCollege,
  listColleges,
  regenerateCollegeCode,
  removeCollegeStaff,
  type College,
} from '../../lib/api';
import { useOpenOnNew } from '../../lib/useOpenOnNew';

// Colleges whose placement cell watches its students' progress. A college's
// staff sign in to this same panel and see one screen: their own linked
// students, read only. Students link themselves with the join code, or accept
// a request the college sends from its student list.

const CollegeList: React.FC = () => {
  const { push } = useToast();
  const [colleges, setColleges] = useState<College[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  useOpenOnNew(() => setCreating(true));
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [busy, setBusy] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setColleges((await listColleges()).colleges || []);
    } catch (e: any) {
      push('error', e.message);
    } finally {
      setLoading(false);
    }
  }, [push]);

  useEffect(() => { load(); }, [load]);

  const doCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      const c = await createCollege(name.trim(), city.trim());
      push('success', `Added ${c.name} — join code ${c.joinCode}`);
      setCreating(false);
      setName('');
      setCity('');
      await load();
      setOpenId(c.id);
    } catch (err: any) {
      push('error', err.message);
    } finally {
      setBusy(false);
    }
  };

  const open = colleges.find((c) => c.id === openId) || null;

  return (
    <Layout title="Colleges" actions={<button onClick={() => setCreating(true)}>New college</button>}>
      <p className="muted small mb">
        A college&apos;s placement cell sees the progress, attendance, test scores and certificates of students who
        linked their account to it — never answers, camera data or messages. Add the placement officer&apos;s account
        here, then give them the join code to share with students.
      </p>
      <div className="scroll-x">
        <table className="card">
          <thead><tr><th>College</th><th>Join code</th><th>Students</th><th>Placement cell</th><th>Added</th><th></th></tr></thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="muted">Loading…</td></tr>
            ) : colleges.length === 0 ? (
              <tr><td colSpan={6} className="muted">No colleges yet. Add one when a college signs up.</td></tr>
            ) : (
              colleges.map((c) => (
                <tr key={c.id} className="clickable" onClick={() => setOpenId(c.id)}>
                  <td>{c.name}{c.city && <div className="muted small">{c.city}</div>}</td>
                  <td><code>{c.joinCode}</code></td>
                  <td className="nowrap">
                    {c.linked} linked{c.pending > 0 && <span className="muted"> · {c.pending} waiting</span>}
                  </td>
                  <td>
                    {c.staff.length
                      ? c.staff.map((s) => <span key={s.userId} className="chip" title={s.email}>{s.name || s.email}</span>)
                      : <span style={{ color: 'var(--danger)' }}>None yet</span>}
                  </td>
                  <td className="muted nowrap">{new Date(c.createdAt).toLocaleDateString()}</td>
                  <td className="actions"><button className="ghost sm" onClick={(e) => { e.stopPropagation(); setOpenId(c.id); }}>Manage</button></td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {creating && (
        <Modal title="New college" onClose={() => setCreating(false)}>
          <form onSubmit={doCreate}>
            <div className="field">
              <label htmlFor="college-name">College name *</label>
              <input id="college-name" value={name} autoFocus onChange={(e) => setName(e.target.value)} placeholder="e.g. Government College of Engineering" />
            </div>
            <div className="field">
              <label htmlFor="college-city">City</label>
              <input id="college-city" value={city} onChange={(e) => setCity(e.target.value)} placeholder="e.g. Pune" />
            </div>
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <button type="button" className="secondary" onClick={() => setCreating(false)}>Cancel</button>
              <button type="submit" disabled={busy || !name.trim()}>{busy ? 'Adding…' : 'Add college'}</button>
            </div>
          </form>
        </Modal>
      )}

      {open && <Manage college={open} onChanged={load} onClose={() => setOpenId(null)} />}
    </Layout>
  );
};

const Manage: React.FC<{ college: College; onChanged: () => Promise<void>; onClose: () => void }> = ({ college, onChanged, onClose }) => {
  const { push } = useToast();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    try {
      const res = await addCollegeStaff(college.id, email.trim());
      push('success', `${res.email} is now on ${college.name}'s placement cell — ${res.note}`);
      setEmail('');
      await onChanged();
    } catch (err: any) {
      push('error', err.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (userId: string, who: string) => {
    if (!window.confirm(`Remove ${who} from ${college.name}? Their account goes back to a student account.`)) return;
    try {
      await removeCollegeStaff(college.id, userId);
      push('success', `Removed ${who}`);
      await onChanged();
    } catch (err: any) {
      push('error', err.message);
    }
  };

  const newCode = async () => {
    if (!window.confirm('Issue a new join code? The old one stops working. Students already linked stay linked.')) return;
    try {
      const res = await regenerateCollegeCode(college.id);
      push('success', `New join code: ${res.joinCode}`);
      await onChanged();
    } catch (err: any) {
      push('error', err.message);
    }
  };

  return (
    <Modal title={college.name} onClose={onClose} variant="drawer">
      <div className="card card-pad mb">
        <div className="muted small">Join code — students enter it in their Knovate profile</div>
        <div className="row" style={{ alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
          <code style={{ fontSize: 20, letterSpacing: '.08em' }}>{college.joinCode}</code>
          <button className="secondary sm" onClick={newCode}>Issue new code</button>
        </div>
        <p className="muted small" style={{ margin: '10px 0 0' }}>{college.linked} students linked, {college.pending} waiting to accept.</p>
      </div>

      <form onSubmit={add} className="mb">
        <div className="field">
          <label htmlFor="staff-email">Add placement-cell staff by email</label>
          <input id="staff-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tpo@college.edu.in" />
        </div>
        <button type="submit" disabled={busy || !email.trim()}>{busy ? 'Adding…' : 'Add to placement cell'}</button>
        <p className="muted small" style={{ marginTop: 8 }}>
          The person needs a Knovate account first (All Users → Add user). A student account becomes a placement-cell
          account and stops being a student; admin and recruiter accounts cannot be used. They then sign in to this
          panel with their usual password.
        </p>
      </form>

      <h3 style={{ margin: '0 0 8px' }}>Placement cell ({college.staff.length})</h3>
      {college.staff.length === 0 ? (
        <p className="muted">No one yet.</p>
      ) : (
        <ul className="card" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {college.staff.map((s, i) => (
            <li key={s.userId} className="row" style={{ padding: '10px 14px', gap: 10, borderTop: i ? '1px solid var(--border)' : undefined, alignItems: 'center' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div>{s.name || s.email}</div>
                {s.name && <div className="muted small">{s.email}</div>}
              </div>
              <button className="ghost sm" onClick={() => remove(s.userId, s.name || s.email)}>Remove</button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
};

export default CollegeList;
