import React, { useEffect, useState } from 'react';
import Modal from '../../components/Modal';
import { useToast } from '../../components/Toast';
import { bulkImport } from '../../lib/api';
import { useCourses } from '../../lib/courses';

const ROLES = ['student', 'recruiter', 'admin'];

// A memorable starter password: the first name, capitalised, plus four random
// digits — e.g. "Prabhat4821". The user is told to change it on first sign-in,
// so this only has to be easy to read out over the phone if the email bounces,
// not to be a permanent secret. Random digits keep it from being a fixed,
// guessable "<name>123" across every account.
function suggestPassword(fullName: string): string {
  const first = fullName.trim().split(/\s+/)[0] ?? '';
  const clean = first.replace(/[^a-zA-Z]/g, '');
  const base = clean ? clean.charAt(0).toUpperCase() + clean.slice(1).toLowerCase() : 'User';
  const digits = Math.floor(1000 + Math.random() * 9000); // 1000–9999
  return `${base}${digits}`;
}

// A single manual add reuses the bulk-import endpoint with a one-row payload —
// same validation and phone/course handling, no separate backend path needed.
const AddUserModal: React.FC<{ onClose: () => void; onCreated: () => void }> = ({
  onClose,
  onCreated,
}) => {
  const { push } = useToast();
  const catalog = useCourses();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  // While true, the password tracks the name as it is typed. The moment an
  // admin edits the password by hand, it stops following — their value wins.
  const [autoPassword, setAutoPassword] = useState(true);
  const [role, setRole] = useState('student');
  const [courses, setCourses] = useState<string[]>([]);
  const [sendWelcome, setSendWelcome] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Keep the suggestion in step with the name until the admin takes over.
  useEffect(() => {
    if (autoPassword) setPassword(suggestPassword(name));
  }, [name, autoPassword]);

  const toggleCourse = (id: string) =>
    setCourses((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!name.trim() || !email.trim() || !password) {
      setError('Name, email and password are required.');
      return;
    }
    setBusy(true);
    try {
      const res = await bulkImport(
        [
          {
            name: name.trim(),
            email: email.trim().toLowerCase(),
            phone: phone.trim(),
            password,
            role,
            course_ids: courses,
          },
        ],
        sendWelcome,
      );
      const row = res.results[0];
      if (row && !row.success) {
        setError(row.message);
        return;
      }
      // Say what actually happened to the mail, so nobody assumes a login link
      // went out when SMTP is off in this environment.
      if (sendWelcome && row?.emailed) {
        push('success', `User ${email} created — login details emailed`);
      } else if (sendWelcome) {
        push('success', `User ${email} created — email not sent; share the password below`);
      } else {
        push('success', `User ${email} created`);
      }
      onCreated();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Add user" onClose={onClose}>
      <form onSubmit={submit}>
        <div className="field">
          <label>Full name *</label>
          <input value={name} autoFocus onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field">
          <label>Email *</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="row">
          <div className="field grow">
            <label>Phone</label>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div className="field grow">
            <label>
              Temporary password *
              <button
                type="button"
                className="linkBtn"
                style={{ marginLeft: 8, fontSize: 12 }}
                onClick={() => {
                  setAutoPassword(true);
                  setPassword(suggestPassword(name));
                }}
              >
                Regenerate
              </button>
            </label>
            <input
              value={password}
              onChange={(e) => {
                setAutoPassword(false);
                setPassword(e.target.value);
              }}
            />
          </div>
        </div>
        <div className="field">
          <label>Role</label>
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          {role === 'recruiter' && (
            <p className="muted small" style={{ margin: '6px 0 0' }}>
              A recruiter only sees the companies they belong to. After creating the account, add it to a company
              under Hiring → Companies → Recruiters.
            </p>
          )}
        </div>
        <div className="field">
          <label>Enrolled courses</label>
          <div className="row wrap">
            {catalog.map((c) => (
              <label key={c.id} className="chip" style={{ cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  style={{ width: 'auto', marginRight: 6 }}
                  checked={courses.includes(c.id)}
                  onChange={() => toggleCourse(c.id)}
                />
                {c.name}
              </label>
            ))}
          </div>
        </div>

        <div className="field">
          <label className="chip" style={{ cursor: 'pointer' }}>
            <input
              type="checkbox"
              style={{ width: 'auto', marginRight: 8 }}
              checked={sendWelcome}
              onChange={(e) => setSendWelcome(e.target.checked)}
            />
            Email the login details to the user, with a note to change the password
          </label>
        </div>

        {error && <div className="err mb">{error}</div>}

        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="secondary" onClick={onClose}>Cancel</button>
          <button type="submit" disabled={busy}>{busy ? 'Creating…' : 'Create user'}</button>
        </div>
      </form>
    </Modal>
  );
};

export default AddUserModal;
