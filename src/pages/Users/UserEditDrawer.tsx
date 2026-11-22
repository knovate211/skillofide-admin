import React, { useEffect, useState } from 'react';
import Modal from '../../components/Modal';
import { useToast } from '../../components/Toast';
import {
  updateUserRole,
  updateUser,
  grantCourse,
  revokeCourse,
  listCompanies,
  addCompanyMember,
  type AdminUserRow,
  type Company,
} from '../../lib/api';
import { useCourses, courseName } from '../../lib/courses';

const ROLES = ['student', 'recruiter', 'admin'];

interface Props {
  user: AdminUserRow;
  onClose: () => void;
  onChanged: () => void;
}

const UserEditDrawer: React.FC<Props> = ({ user, onClose, onChanged }) => {
  const { push } = useToast();
  const [role, setRole] = useState(user.role);
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [phone, setPhone] = useState('');
  const [courses, setCourses] = useState<string[]>(user.course_ids);
  const [addCourse, setAddCourse] = useState('');
  const [busy, setBusy] = useState(false);
  const [memberOf, setMemberOf] = useState(user.companies || []);
  const [allCompanies, setAllCompanies] = useState<Company[]>([]);
  const [addCompany, setAddCompany] = useState('');

  // Companies are only relevant once the user is a recruiter.
  useEffect(() => {
    if (role !== 'recruiter') return;
    listCompanies().then((r) => setAllCompanies(r.companies || [])).catch(() => setAllCompanies([]));
  }, [role]);

  const doAddCompany = async () => {
    const c = allCompanies.find((x) => x.id === addCompany);
    if (!c) return;
    setBusy(true);
    try {
      await addCompanyMember(c.id, user.id, 'recruiter');
      setMemberOf((m) => [...m, { id: c.id, name: c.name, role: 'recruiter' }]);
      setAddCompany('');
      push('success', `Added to ${c.name}`);
      onChanged();
    } catch (e: any) {
      push('error', e.message);
    } finally {
      setBusy(false);
    }
  };

  const saveRole = async (newRole: string) => {
    setBusy(true);
    try {
      await updateUserRole(user.id, newRole);
      setRole(newRole);
      push('success', 'Role updated');
      onChanged();
    } catch (e: any) {
      push('error', e.message);
    } finally {
      setBusy(false);
    }
  };

  const saveProfile = async () => {
    setBusy(true);
    try {
      await updateUser(user.id, { name: name.trim(), email: email.trim().toLowerCase(), phone: phone.trim() });
      push('success', 'Profile saved');
      onChanged();
    } catch (e: any) {
      push('error', e.message);
    } finally {
      setBusy(false);
    }
  };

  const doGrant = async () => {
    if (!addCourse) return;
    setBusy(true);
    try {
      await grantCourse(user.id, addCourse);
      setCourses((c) => [...new Set([...c, addCourse])]);
      setAddCourse('');
      push('success', 'Course granted');
      onChanged();
    } catch (e: any) {
      push('error', e.message);
    } finally {
      setBusy(false);
    }
  };

  const doRevoke = async (courseId: string) => {
    setBusy(true);
    try {
      await revokeCourse(user.id, courseId);
      setCourses((c) => c.filter((x) => x !== courseId));
      push('success', 'Course revoked');
      onChanged();
    } catch (e: any) {
      push('error', e.message);
    } finally {
      setBusy(false);
    }
  };

  const catalog = useCourses();
  const available = catalog.filter((c) => !courses.includes(c.id));

  return (
    <Modal title={user.name || user.email} onClose={onClose} variant="drawer">
      <div className="field">
        <label>Full name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="field">
        <label>Email</label>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div className="field">
        <label>Phone</label>
        <input
          value={phone}
          placeholder="Enter to set / overwrite"
          onChange={(e) => setPhone(e.target.value)}
        />
        <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
          Current phone isn't shown here; typing a value overwrites it.
        </div>
      </div>
      <button className="secondary mb" disabled={busy} onClick={saveProfile}>Save profile</button>

      <div className="field">
        <label>Role</label>
        <select value={role} disabled={busy} onChange={(e) => saveRole(e.target.value)}>
          {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>

      {role === 'recruiter' && (
        <div className="field">
          <label>Company</label>
          <div className="row wrap mb">
            {memberOf.length === 0 && (
              <span style={{ color: 'var(--danger)' }}>
                Not linked to a company. They can sign in but will see nothing until you add them to one.
              </span>
            )}
            {memberOf.map((c) => (
              <span key={c.id} className="chip">{c.name}{c.role === 'owner' ? ' (owner)' : ''}</span>
            ))}
          </div>
          <div className="row">
            <select className="grow" value={addCompany} onChange={(e) => setAddCompany(e.target.value)}>
              <option value="">{allCompanies.length ? 'Add to a company…' : 'No companies yet — create one under Companies'}</option>
              {allCompanies.filter((c) => !memberOf.some((m) => m.id === c.id)).map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <button disabled={busy || !addCompany} onClick={doAddCompany}>Add</button>
          </div>
        </div>
      )}

      <div className="field">
        <label>Enrolled courses</label>
        <div className="row wrap mb">
          {courses.length === 0 && <span className="muted">No courses yet.</span>}
          {courses.map((c) => (
            <span key={c} className="chip">
              {courseName(c)}
              <button disabled={busy} onClick={() => doRevoke(c)} title="Revoke">✕</button>
            </span>
          ))}
        </div>
        <div className="row">
          <select className="grow" value={addCourse} onChange={(e) => setAddCourse(e.target.value)}>
            <option value="">Add a course…</option>
            {available.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button disabled={busy || !addCourse} onClick={doGrant}>Grant</button>
        </div>
      </div>

      <div className="row mt" style={{ justifyContent: 'flex-end' }}>
        <button className="secondary" onClick={onClose}>Done</button>
      </div>
    </Modal>
  );
};

export default UserEditDrawer;
