import React, { useCallback, useEffect, useState } from 'react';
import Layout from '../../components/Layout';
import Modal from '../../components/Modal';
import Confirm from '../../components/Confirm';
import { useToast } from '../../components/Toast';
import {
  createClass,
  deleteClass,
  getClassRoster,
  listClasses,
  updateClass,
  type ClassSchedule,
  type ClassScheduleInput,
  type SessionRoster,
} from '../../lib/api';
import { courseName, useCourses } from '../../lib/courses';
import { useOpenOnNew } from '../../lib/useOpenOnNew';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const to12h = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};

const dayList = (days: number[]) => days.map((d) => DAY_NAMES[d]).join(', ');

/**
 * Weekly live classes. Every student granted the class's course gets an
 * attendance pop-up while it runs, and can mark only between start and end.
 * Times are India time (IST) regardless of where the admin is browsing from.
 */
const ClassList: React.FC = () => {
  const { push } = useToast();
  const [classes, setClasses] = useState<ClassSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<ClassSchedule | 'new' | null>(null);
  useOpenOnNew(() => setEditing('new'));
  const [deleting, setDeleting] = useState<ClassSchedule | null>(null);
  const [roster, setRoster] = useState<ClassSchedule | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setClasses((await listClasses()).classes);
    } catch (e: any) {
      push('error', e.message);
    } finally {
      setLoading(false);
    }
  }, [push]);

  useEffect(() => { void load(); }, [load]);

  const toggleActive = async (c: ClassSchedule) => {
    const { id, enrolled, ...rest } = c;
    try {
      await updateClass(id, { ...rest, is_active: !c.is_active });
      push('success', c.is_active ? 'Class paused' : 'Class resumed');
      await load();
    } catch (e: any) {
      push('error', e.message);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await deleteClass(deleting.id);
      push('success', 'Class deleted');
      setDeleting(null);
      await load();
    } catch (e: any) {
      push('error', e.message);
    }
  };

  return (
    <Layout title="Live classes" actions={<button onClick={() => setEditing('new')}>Schedule class</button>}>
      <p className="muted mb">
        Students enrolled in a class&apos;s course see an attendance pop-up while it runs and can mark
        attendance only between its start and end time. All times are India time (IST).
      </p>

      <div className="scroll-x">
        <table className="card">
          <thead>
            <tr>
              <th>Class</th><th>Days</th><th>Time (IST)</th><th>Runs</th>
              <th>Students</th><th>Status</th><th></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="muted">Loading…</td></tr>
            ) : classes.length === 0 ? (
              <tr><td colSpan={7} className="muted">No classes yet. Schedule one to start taking attendance.</td></tr>
            ) : (
              classes.map((c) => (
                <tr key={c.id}>
                  <td>
                    {c.title}
                    <div className="muted" style={{ fontSize: 12 }}>
                      {courseName(c.course_id)}{c.instructor ? ` · ${c.instructor}` : ''}
                    </div>
                  </td>
                  <td>{dayList(c.days_of_week)}</td>
                  <td>{to12h(c.start_time)} – {to12h(c.end_time)}</td>
                  <td className="muted">{c.start_date} → {c.end_date}</td>
                  <td>{c.enrolled ?? 0}</td>
                  <td>
                    <span className={`badge ${c.is_active ? 'published' : 'draft'}`}>
                      {c.is_active ? 'active' : 'paused'}
                    </span>
                  </td>
                  <td className="actions">
                    <button className="ghost sm" onClick={() => setRoster(c)}>Attendance</button>
                    <button className="ghost sm" onClick={() => setEditing(c)}>Edit</button>
                    <button className="ghost sm" onClick={() => toggleActive(c)}>{c.is_active ? 'Pause' : 'Resume'}</button>
                    <button className="ghost sm" onClick={() => setDeleting(c)}>Delete</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {editing && (
        <ClassForm
          schedule={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); void load(); }}
        />
      )}
      {roster && <RosterModal schedule={roster} onClose={() => setRoster(null)} />}
      {deleting && (
        <Confirm
          title="Delete class"
          message={`Delete “${deleting.title}” and all of its attendance records? To stop the class but keep the records, pause it instead.`}
          confirmLabel="Delete"
          danger
          onConfirm={confirmDelete}
          onCancel={() => setDeleting(null)}
        />
      )}
    </Layout>
  );
};

const ClassForm: React.FC<{
  schedule: ClassSchedule | null;
  onClose: () => void;
  onSaved: () => void;
}> = ({ schedule, onClose, onSaved }) => {
  const { push } = useToast();
  const courses = useCourses();
  const [form, setForm] = useState<ClassScheduleInput>(() =>
    schedule
      ? (({ id, enrolled, ...rest }) => rest)(schedule)
      : {
          course_id: '', title: '', instructor: '', meeting_url: '',
          days_of_week: [1, 3, 5], start_time: '11:00', end_time: '12:00',
          start_date: todayISO(), end_date: '', is_active: true,
        },
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const set = <K extends keyof ClassScheduleInput>(k: K, v: ClassScheduleInput[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const toggleDay = (d: number) =>
    set('days_of_week', form.days_of_week.includes(d)
      ? form.days_of_week.filter((x) => x !== d)
      : [...form.days_of_week, d].sort());

  const save = async () => {
    setError('');
    if (!form.course_id) return setError('Choose the course this class belongs to.');
    if (!form.title.trim()) return setError('Give the class a title.');
    if (form.days_of_week.length === 0) return setError('Pick at least one day.');
    if (form.end_time <= form.start_time) return setError('The class must end after it starts.');
    if (!form.start_date || !form.end_date) return setError('Set both the first and last date.');
    if (form.end_date < form.start_date) return setError('The last date is before the first date.');
    setBusy(true);
    try {
      if (schedule) await updateClass(schedule.id, form);
      else await createClass(form);
      push('success', schedule ? 'Class updated' : 'Class scheduled');
      onSaved();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={schedule ? `Edit — ${schedule.title}` : 'Schedule class'} onClose={onClose}>
      <div className="field">
        <label>Course</label>
        <select
          value={form.course_id}
          onChange={(e) => {
            const id = e.target.value;
            setForm((f) => ({ ...f, course_id: id, title: f.title || courseName(id) }));
          }}
        >
          <option value="">Select a course…</option>
          {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      <div className="row">
        <div className="field" style={{ flex: 2 }}>
          <label>Title</label>
          <input value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="Java — live session" />
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label>Instructor</label>
          <input value={form.instructor} onChange={(e) => set('instructor', e.target.value)} placeholder="Optional" />
        </div>
      </div>

      <div className="field">
        <label>Meeting link</label>
        <input value={form.meeting_url} onChange={(e) => set('meeting_url', e.target.value)} placeholder="https://meet.google.com/… (optional)" />
      </div>

      <div className="field">
        <label>Days</label>
        <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
          {DAY_NAMES.map((name, d) => (
            <button
              key={name}
              type="button"
              className={form.days_of_week.includes(d) ? 'sm' : 'secondary sm'}
              onClick={() => toggleDay(d)}
            >
              {name}
            </button>
          ))}
        </div>
      </div>

      <div className="row">
        <div className="field" style={{ flex: 1 }}>
          <label>Starts (IST)</label>
          <input type="time" value={form.start_time} onChange={(e) => set('start_time', e.target.value)} />
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label>Ends (IST)</label>
          <input type="time" value={form.end_time} onChange={(e) => set('end_time', e.target.value)} />
        </div>
      </div>

      <div className="row">
        <div className="field" style={{ flex: 1 }}>
          <label>First date</label>
          <input type="date" value={form.start_date} onChange={(e) => set('start_date', e.target.value)} />
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label>Last date</label>
          <input type="date" value={form.end_date} onChange={(e) => set('end_date', e.target.value)} />
        </div>
      </div>

      {error && <p style={{ color: 'var(--danger, #b91c1c)', fontSize: 13 }}>{error}</p>}

      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button className="secondary" onClick={onClose}>Cancel</button>
        <button disabled={busy} onClick={save}>{busy ? 'Saving…' : schedule ? 'Save changes' : 'Schedule class'}</button>
      </div>
    </Modal>
  );
};

const STATE_NOTE: Record<SessionRoster['state'], string> = {
  not_scheduled: 'This class does not run on the chosen date.',
  upcoming: 'This session has not started yet.',
  live: 'Live now — students can still mark attendance.',
  ended: 'Session ended. Anyone who did not mark is absent.',
};

const RosterModal: React.FC<{ schedule: ClassSchedule; onClose: () => void }> = ({ schedule, onClose }) => {
  const { push } = useToast();
  const [date, setDate] = useState(todayISO());
  const [data, setData] = useState<SessionRoster | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getClassRoster(schedule.id, date)
      .then((r) => { if (!cancelled) setData(r); })
      .catch((e) => push('error', e.message))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [schedule.id, date, push]);

  return (
    <Modal title={`Attendance — ${schedule.title}`} onClose={onClose} variant="drawer">
      <div className="row" style={{ alignItems: 'flex-end' }}>
        <div className="field" style={{ flex: 1 }}>
          <label>Session date</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        {data && data.state !== 'not_scheduled' && (
          <p style={{ marginBottom: 14 }}>
            <strong>{data.present}</strong> / {data.students.length} present
          </p>
        )}
      </div>

      {loading ? (
        <p className="muted">Loading…</p>
      ) : data ? (
        <>
          <p className="muted mb">{STATE_NOTE[data.state]}</p>
          {data.state !== 'not_scheduled' && (
            <table className="card">
              <thead><tr><th>Student</th><th>Status</th><th>Marked at</th></tr></thead>
              <tbody>
                {data.students.length === 0 ? (
                  <tr><td colSpan={3} className="muted">No students are enrolled in this course.</td></tr>
                ) : data.students.map((s) => (
                  <tr key={s.user_id}>
                    <td>{s.name}<div className="muted" style={{ fontSize: 12 }}>{s.email}</div></td>
                    <td>
                      <span className={`badge ${s.status === 'present' ? 'published' : s.status === 'absent' ? 'archived' : 'draft'}`}>
                        {s.status}
                      </span>
                    </td>
                    <td className="muted">
                      {s.marked_at ? new Date(s.marked_at).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit' }) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      ) : null}
    </Modal>
  );
};

export default ClassList;
