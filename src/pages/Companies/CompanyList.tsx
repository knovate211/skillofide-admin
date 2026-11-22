import React, { useCallback, useEffect, useState } from 'react';
import Layout from '../../components/Layout';
import Modal from '../../components/Modal';
import { useToast } from '../../components/Toast';
import {
  addCompanyMember,
  createCompany,
  listCompanies,
  listCompanyMembers,
  listUsers,
  updateUserRole,
  type Company,
  type CompanyMember,
} from '../../lib/api';
import { useOpenOnNew } from '../../lib/useOpenOnNew';

// Companies that hire through Knovate, and the recruiter accounts that act for
// them. A recruiter signs in to this same panel and sees only the hiring tests
// and question bank of the companies they are a member of here.

const CompanyList: React.FC = () => {
  const { push } = useToast();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  useOpenOnNew(() => setCreating(true));
  const [name, setName] = useState('');
  const [website, setWebsite] = useState('');
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<Company | null>(null);
  const [members, setMembers] = useState<Record<string, CompanyMember[]>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listCompanies();
      const list = res.companies || [];
      setCompanies(list);
      // One request per company: fine for the handful of partners there are.
      const entries = await Promise.all(
        list.map(async (c) => [c.id, (await listCompanyMembers(c.id).catch(() => ({ members: [] }))).members || []] as const),
      );
      setMembers(Object.fromEntries(entries));
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
      const c = await createCompany({ name: name.trim(), website: website.trim() || undefined });
      push('success', `Added ${c.name}`);
      setCreating(false);
      setName('');
      setWebsite('');
      await load();
      setOpen(c);
    } catch (err: any) {
      push('error', err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Layout title="Companies" actions={<button onClick={() => setCreating(true)}>New company</button>}>
      <p className="muted small mb">
        Companies that run hiring tests. Add recruiter accounts to a company so they can sign in to this panel and manage
        that company&apos;s tests, question bank and results — nothing else.
      </p>
      <div className="scroll-x">
        <table className="card">
          <thead><tr><th>Company</th><th>Recruiters</th><th>Website</th><th>Added</th><th></th></tr></thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="muted">Loading…</td></tr>
            ) : companies.length === 0 ? (
              <tr><td colSpan={5} className="muted">No companies yet. Add one when a company signs up for hiring tests.</td></tr>
            ) : (
              companies.map((c) => (
                <tr key={c.id} className="clickable" onClick={() => setOpen(c)}>
                  <td>{c.name}</td>
                  <td>
                    {members[c.id]?.length
                      ? members[c.id].map((m) => <span key={m.user_id} className="chip" title={m.email}>{m.name || m.email}{m.role === 'owner' ? ' (owner)' : ''}</span>)
                      : <span style={{ color: 'var(--danger)' }}>None yet</span>}
                  </td>
                  <td>{c.website ? <a href={c.website} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>{c.website}</a> : <span className="muted">—</span>}</td>
                  <td className="muted nowrap">{c.created_at ? new Date(c.created_at).toLocaleDateString() : '—'}</td>
                  <td className="actions"><button className="ghost sm" onClick={(e) => { e.stopPropagation(); setOpen(c); }}>Recruiters</button></td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {creating && (
        <Modal title="New company" onClose={() => setCreating(false)}>
          <form onSubmit={doCreate}>
            <div className="field">
              <label>Company name *</label>
              <input value={name} autoFocus onChange={(e) => setName(e.target.value)} placeholder="e.g. Acme Technologies" />
            </div>
            <div className="field">
              <label>Website</label>
              <input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://" />
            </div>
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <button type="button" className="secondary" onClick={() => setCreating(false)}>Cancel</button>
              <button type="submit" disabled={busy || !name.trim()}>{busy ? 'Adding…' : 'Add company'}</button>
            </div>
          </form>
        </Modal>
      )}

      {open && <Members company={open} onClose={() => { setOpen(null); load(); }} />}
    </Layout>
  );
};

const Members: React.FC<{ company: Company; onClose: () => void }> = ({ company, onClose }) => {
  const { push } = useToast();
  const [members, setMembers] = useState<CompanyMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'recruiter' | 'owner'>('recruiter');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listCompanyMembers(company.id);
      setMembers(res.members || []);
    } catch (e: any) {
      push('error', e.message);
    } finally {
      setLoading(false);
    }
  }, [company.id, push]);

  useEffect(() => { load(); }, [load]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    const wanted = email.trim().toLowerCase();
    if (!wanted) return;
    setBusy(true);
    try {
      // The account must already exist; search is fuzzy, so match exactly.
      const res = await listUsers(1, 20, { search: wanted });
      const user = res.users.find((u) => u.email.toLowerCase() === wanted);
      if (!user) {
        push('error', `No account for ${wanted}. Create it first under All Users, then add it here.`);
        return;
      }
      // Only the recruiter role can sign in to the hiring view. Students and
      // applicants are moved over; admins keep their role (they see everything).
      if (user.role !== 'recruiter' && user.role !== 'admin') {
        await updateUserRole(user.id, 'recruiter');
      }
      await addCompanyMember(company.id, user.id, role);
      push('success', `${user.email} can now manage ${company.name}'s hiring tests`);
      setEmail('');
      load();
    } catch (err: any) {
      push('error', err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={`${company.name} — recruiters`} onClose={onClose} variant="drawer">
      <form onSubmit={add} className="mb">
        <div className="field">
          <label>Add a recruiter by email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" />
        </div>
        <div className="field">
          <label>Access</label>
          <select value={role} onChange={(e) => setRole(e.target.value as 'recruiter' | 'owner')}>
            <option value="recruiter">Recruiter</option>
            <option value="owner">Owner (the company&apos;s main contact)</option>
          </select>
        </div>
        <button type="submit" disabled={busy || !email.trim()}>{busy ? 'Adding…' : 'Add to company'}</button>
        <p className="muted small" style={{ marginTop: 8 }}>
          The person needs an account first (All Users → Add user). If it is a student account, its role changes to
          Recruiter. They then sign in to this panel with their usual password.
        </p>
      </form>

      <h3 style={{ margin: '0 0 8px' }}>Members ({members.length})</h3>
      {loading ? (
        <p className="muted">Loading…</p>
      ) : members.length === 0 ? (
        <p className="muted">No recruiters yet.</p>
      ) : (
        <ul className="card" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {members.map((m, i) => (
            <li
              key={m.user_id}
              className="row"
              style={{ padding: '10px 14px', gap: 10, borderTop: i ? '1px solid var(--border)' : undefined, alignItems: 'center' }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div>{m.name || m.email}</div>
                {m.name && <div className="muted small">{m.email}</div>}
              </div>
              <span className={`badge ${m.role === 'owner' ? 'admin' : 'recruiter'}`}>{m.role}</span>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
};

export default CompanyList;
