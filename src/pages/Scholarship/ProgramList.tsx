import React, { useCallback, useEffect, useState } from 'react';
import Layout from '../../components/Layout';
import Modal from '../../components/Modal';
import { useToast } from '../../components/Toast';
import TableState from '../../components/TableState';
import {
  listAssessments,
  listScholarshipPrograms,
  upsertScholarshipProgram,
  type Assessment,
  type AwardSlab,
  type ScholarshipProgram,
} from '../../lib/api';
import { COURSES, courseName } from '../../lib/courses';

const DEFAULT_SLABS: AwardSlab[] = [
  { minPercent: 80, awardPercent: 100 },
  { minPercent: 65, awardPercent: 50 },
  { minPercent: 50, awardPercent: 25 },
];

/**
 * Which course maps to which paper.
 *
 * This is the only screen that decides what the public marketing site offers:
 * `/api/scholarship/config` lists a programme only when it is active, its paper
 * is published, it is inside its window and it has places left. So a course
 * missing here simply is not on offer.
 */
const ProgramList: React.FC = () => {
  const { push } = useToast();
  const [programs, setPrograms] = useState<ScholarshipProgram[]>([]);
  const [papers, setPapers] = useState<Assessment[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<ScholarshipProgram | 'new' | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [progRes, testRes] = await Promise.all([
        listScholarshipPrograms(),
        // Only scholarship papers may back a programme — the backend rejects a
        // practice test, because a practice test ignores invites entirely.
        listAssessments('purpose=scholarship&pageSize=200'),
      ]);
      setPrograms(progRes.programs);
      setPapers(testRes.assessments ?? []);
    } catch (e: any) {
      push('error', e.message);
    } finally {
      setLoading(false);
    }
  }, [push]);

  useEffect(() => { void load(); }, [load]);

  const toggleActive = async (p: ScholarshipProgram) => {
    try {
      await upsertScholarshipProgram({
        course_id: p.course_id,
        course_name: p.course_name,
        assessment_id: p.assessment_id,
        is_active: !p.is_active,
        opens_at: p.opens_at,
        closes_at: p.closes_at,
        seats: p.seats,
        award_slabs: p.award_slabs,
      });
      push('success', p.is_active ? 'Programme paused' : 'Programme is live');
      await load();
    } catch (e: any) {
      push('error', e.message);
    }
  };

  return (
    <Layout
      title="Scholarship programmes"
      actions={<button onClick={() => setEditing('new')}>Add programme</button>}
    >
      <p className="muted mb">
        A course appears on the marketing site only when its programme is live, its paper is
        published, today falls inside the window and places remain.
      </p>

      <div className="scroll-x">
        <table className="card">
          <thead>
            <tr>
              <th>Course</th><th>Paper</th><th>Window</th>
              <th>Places</th><th>Bands</th><th>Live</th><th></th>
            </tr>
          </thead>
          <tbody>
            {loading || programs.length === 0 ? (
              <TableState
                loading={loading}
                columns={7}
                title="No programmes yet"
                hint="Add one to put a course on the scholarship page."
              />
            ) : (
              programs.map((p) => (
                <tr key={p.id}>
                  <td>
                    {p.course_name}
                    <div className="muted" style={{ fontSize: 12 }}>id: {p.course_id}</div>
                  </td>
                  <td>
                    {p.assessment_title || <span className="muted">—</span>}
                    <div style={{ fontSize: 12 }}>
                      {p.assessment_status === 'published' ? (
                        <span className="badge published">published</span>
                      ) : (
                        <span className="badge archived">{p.assessment_status}</span>
                      )}
                    </div>
                  </td>
                  <td className="muted">
                    {p.opens_at || p.closes_at
                      ? `${p.opens_at ? new Date(p.opens_at).toLocaleDateString() : 'now'} → ${p.closes_at ? new Date(p.closes_at).toLocaleDateString() : 'open'}`
                      : 'always open'}
                  </td>
                  <td>{p.seats === 0 ? <span className="muted">unlimited</span> : `${p.used} / ${p.seats}`}</td>
                  <td className="muted" style={{ fontSize: 12 }}>
                    {(p.award_slabs ?? []).length === 0
                      ? '—'
                      : p.award_slabs.map((s) => `${s.minPercent}%→${s.awardPercent}%`).join(', ')}
                  </td>
                  <td>
                    <span className={`badge ${p.is_active ? 'published' : 'draft'}`}>
                      {p.is_active ? 'live' : 'paused'}
                    </span>
                  </td>
                  <td className="actions">
                    <button className="ghost sm" onClick={() => setEditing(p)}>Edit</button>
                    <button className="ghost sm" onClick={() => toggleActive(p)}>
                      {p.is_active ? 'Pause' : 'Go live'}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {editing && (
        <ProgramForm
          program={editing === 'new' ? null : editing}
          papers={papers}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); void load(); }}
        />
      )}
    </Layout>
  );
};

const toDateInput = (iso?: string) => (iso ? iso.slice(0, 10) : '');
const fromDateInput = (d: string) => (d ? new Date(`${d}T00:00:00Z`).toISOString() : '');

const ProgramForm: React.FC<{
  program: ScholarshipProgram | null;
  papers: Assessment[];
  onClose: () => void;
  onSaved: () => void;
}> = ({ program, papers, onClose, onSaved }) => {
  const { push } = useToast();
  const [courseId, setCourseId] = useState(program?.course_id ?? '');
  const [assessmentId, setAssessmentId] = useState(program?.assessment_id ?? '');
  const [opensAt, setOpensAt] = useState(toDateInput(program?.opens_at));
  const [closesAt, setClosesAt] = useState(toDateInput(program?.closes_at));
  const [seats, setSeats] = useState(String(program?.seats ?? 0));
  const [slabs, setSlabs] = useState<AwardSlab[]>(
    program?.award_slabs?.length ? program.award_slabs : DEFAULT_SLABS,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const published = papers.filter((p) => p.status === 'published');

  const setSlab = (i: number, key: keyof AwardSlab, value: string) => {
    const n = Math.max(0, Math.min(100, Number(value.replace(/\D/g, '') || 0)));
    setSlabs((s) => s.map((row, idx) => (idx === i ? { ...row, [key]: n } : row)));
  };

  const save = async () => {
    setError('');
    if (!courseId) return setError('Choose the course this programme is for.');
    if (!assessmentId) return setError('Choose the paper candidates will sit.');
    if (opensAt && closesAt && opensAt > closesAt) {
      return setError('The window closes before it opens.');
    }
    setBusy(true);
    try {
      await upsertScholarshipProgram({
        course_id: courseId,
        course_name: courseName(courseId),
        assessment_id: assessmentId,
        is_active: program ? program.is_active : true,
        opens_at: fromDateInput(opensAt),
        closes_at: fromDateInput(closesAt),
        seats: Number(seats) || 0,
        // Highest band first, so the backend can award on the first match.
        award_slabs: [...slabs].sort((a, b) => b.minPercent - a.minPercent),
      });
      push('success', program ? 'Programme updated' : 'Programme created');
      onSaved();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={program ? `Edit — ${program.course_name}` : 'Add programme'} onClose={onClose}>
      <div className="field">
        <label>Course</label>
        <select value={courseId} onChange={(e) => setCourseId(e.target.value)} disabled={!!program}>
          <option value="">Select a course…</option>
          {COURSES.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        {program && <p className="muted" style={{ fontSize: 12, margin: '4px 0 0' }}>
          The course cannot be changed — create a separate programme instead.
        </p>}
      </div>

      <div className="field">
        <label>Paper</label>
        <select value={assessmentId} onChange={(e) => setAssessmentId(e.target.value)}>
          <option value="">Select a published scholarship paper…</option>
          {published.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
        </select>
        {published.length === 0 && (
          <p className="muted" style={{ fontSize: 12, margin: '4px 0 0' }}>
            No published papers with purpose “scholarship”. Create one under Tests and publish it
            first — a practice test cannot be used, because it ignores invitations.
          </p>
        )}
      </div>

      <div className="row">
        <div className="field" style={{ flex: 1 }}>
          <label>Opens</label>
          <input type="date" value={opensAt} onChange={(e) => setOpensAt(e.target.value)} />
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label>Closes</label>
          <input type="date" value={closesAt} onChange={(e) => setClosesAt(e.target.value)} />
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label>Places</label>
          <input
            inputMode="numeric"
            value={seats}
            onChange={(e) => setSeats(e.target.value.replace(/\D/g, ''))}
          />
          <p className="muted" style={{ fontSize: 12, margin: '4px 0 0' }}>0 = unlimited</p>
        </div>
      </div>

      <div className="field">
        <label>Award bands</label>
        <p className="muted" style={{ fontSize: 12, margin: '0 0 8px' }}>
          Score at or above the left figure earns the discount on the right. These are also the
          numbers shown on the marketing site, so keep the two in step.
        </p>
        {slabs.map((s, i) => (
          <div className="row" key={i} style={{ marginBottom: 6, alignItems: 'center' }}>
            <input style={{ width: 90 }} inputMode="numeric" value={s.minPercent}
                   onChange={(e) => setSlab(i, 'minPercent', e.target.value)} />
            <span className="muted">% and above earns</span>
            <input style={{ width: 90 }} inputMode="numeric" value={s.awardPercent}
                   onChange={(e) => setSlab(i, 'awardPercent', e.target.value)} />
            <span className="muted">% off</span>
            <button className="ghost sm" onClick={() => setSlabs((v) => v.filter((_, idx) => idx !== i))}>
              Remove
            </button>
          </div>
        ))}
        <button className="ghost sm" onClick={() => setSlabs((v) => [...v, { minPercent: 0, awardPercent: 0 }])}>
          Add band
        </button>
      </div>

      {error && <p style={{ color: 'var(--danger, #b91c1c)', fontSize: 13 }}>{error}</p>}

      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button className="secondary" onClick={onClose}>Cancel</button>
        <button disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save programme'}</button>
      </div>
    </Modal>
  );
};

export default ProgramList;
