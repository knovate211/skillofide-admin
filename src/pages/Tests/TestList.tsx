import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../../components/Layout';
import Modal from '../../components/Modal';
import Confirm from '../../components/Confirm';
import { useToast } from '../../components/Toast';
import {
  listAssessments,
  createAssessment,
  deleteAssessment,
  publishAssessment,
  duplicateTest,
  type Assessment,
} from '../../lib/api';
import { useUrlFilters } from '../../lib/useListState';
import { courseName, useCourses } from '../../lib/courses';

// Scholarship papers are invite-only (the scholarship funnel issues the
// invite), practice tests are open to enrolled students.
const TYPES = [
  { value: 'practice', label: 'Practice tests' },
  { value: 'scholarship', label: 'Scholarship tests' },
] as const;
const TYPE_KEYS = ['type'] as const;

const TestList: React.FC = () => {
  const { push } = useToast();
  const navigate = useNavigate();
  const [tests, setTests] = useState<Assessment[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [duration, setDuration] = useState(60);
  const [deleting, setDeleting] = useState<Assessment | null>(null);
  const [busy, setBusy] = useState(false);
  const [newPurpose, setNewPurpose] = useState<'practice' | 'scholarship'>('practice');
  const [newCourse, setNewCourse] = useState('');
  const courses = useCourses();
  const [duplicating, setDuplicating] = useState<Assessment | null>(null);
  const [copyTitle, setCopyTitle] = useState('');
  const { filters, setFilter } = useUrlFilters(TYPE_KEYS);
  const purpose = filters.type === 'scholarship' ? 'scholarship' : 'practice';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listAssessments(`purpose=${purpose}&pageSize=200`);
      setTests(res.assessments || []);
    } catch (e: any) {
      push('error', e.message);
    } finally {
      setLoading(false);
    }
  }, [push, purpose]);

  useEffect(() => { load(); }, [load]);

  const doCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    try {
      // No company => a platform test an admin owns.
      const { id } = await createAssessment({
        title: title.trim(),
        purpose: newPurpose,
        course_ids: newPurpose === 'practice' && newCourse ? [newCourse] : [],
        duration_minutes: Number(duration) || 60,
        max_attempts: 1,
      });
      push('success', 'Test created');
      setCreating(false);
      setTitle('');
      navigate(`/tests/${id}`);
    } catch (e: any) {
      push('error', e.message);
    } finally {
      setBusy(false);
    }
  };

  const togglePublish = async (t: Assessment) => {
    const publish = t.status !== 'published';
    try {
      await publishAssessment(t.id!, publish);
      push('success', publish ? 'Published' : 'Unpublished');
      load();
    } catch (e: any) {
      push('error', e.message);
    }
  };

  const startDuplicate = (t: Assessment) => {
    setCopyTitle(`${t.title} (copy)`);
    setDuplicating(t);
  };

  const doDuplicate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!duplicating || !copyTitle.trim()) return;
    setBusy(true);
    try {
      const r = await duplicateTest(duplicating.id!, copyTitle.trim());
      push('success', `Copied ${r.sections} section${r.sections === 1 ? '' : 's'} as a draft — review, then publish`);
      setDuplicating(null);
      navigate(`/tests/${r.id}`);
    } catch (e: any) {
      push('error', e.message);
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await deleteAssessment(deleting.id!);
      push('success', 'Test deleted');
      setDeleting(null);
      load();
    } catch (e: any) {
      push('error', e.message);
    }
  };

  return (
    <Layout
      title="Tests"
      actions={<button onClick={() => { setNewPurpose(purpose); setCreating(true); }}>New test</button>}
    >
      <div className="filter-bar mb">
        <div className="seg" role="tablist" aria-label="Test type">
          {TYPES.map((t) => (
            <button
              key={t.value}
              role="tab"
              aria-selected={purpose === t.value}
              className={purpose === t.value ? 'on' : ''}
              onClick={() => setFilter('type', t.value === 'practice' ? '' : t.value)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <span className="grow" />
        {purpose === 'scholarship' && (
          <span className="muted small">
            To open a scholarship for a course: duplicate a paper, rename it, publish it, then attach it under Scholarship Programmes.
          </span>
        )}
      </div>
      <div className="scroll-x">
        <table className="card">
          <thead>
            <tr><th>Title</th>{purpose === 'practice' && <th>For</th>}<th>Status</th><th>Duration</th><th>Questions</th><th>Attempts</th><th></th></tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="muted">Loading…</td></tr>
            ) : tests.length === 0 ? (
              <tr><td colSpan={6} className="muted">No {purpose} tests yet. Create one to get started.</td></tr>
            ) : (
              tests.map((t) => (
                <tr key={t.id}>
                  <td><a onClick={() => navigate(`/tests/${t.id}`)} style={{ cursor: 'pointer' }}>{t.title}</a></td>
                  {purpose === 'practice' && (
                    <td>
                      {t.course_ids?.length
                        ? t.course_ids.map((c) => <span key={c} className="chip">{courseName(c)}</span>)
                        : <span className="muted">All students</span>}
                    </td>
                  )}
                  <td><span className={`badge ${t.status}`}>{t.status}</span></td>
                  <td>{t.duration_minutes} min</td>
                  <td>{t.question_count || '—'}</td>
                  <td>{t.attempt_count ?? 0}</td>
                  <td className="actions">
                    <button className="ghost sm" onClick={() => navigate(`/tests/${t.id}`)}>Edit</button>
                    <button className="ghost sm" onClick={() => navigate(`/tests/${t.id}/results`)}>Results</button>
                    <button className="ghost sm" onClick={() => togglePublish(t)}>
                      {t.status === 'published' ? 'Unpublish' : 'Publish'}
                    </button>
                    <button className="ghost sm" onClick={() => startDuplicate(t)}>Duplicate</button>
                    <button className="ghost sm danger-text" onClick={() => setDeleting(t)}>Delete</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {creating && (
        <Modal title="New test" onClose={() => setCreating(false)}>
          <form onSubmit={doCreate}>
            <div className="field">
              <label>Title *</label>
              <input value={title} autoFocus onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Java Fundamentals — Module 1" />
            </div>
            <div className="field">
              <label>Type</label>
              <select value={newPurpose} onChange={(e) => setNewPurpose(e.target.value as 'practice' | 'scholarship')}>
                <option value="practice">Practice test — for enrolled students</option>
                <option value="scholarship">Scholarship test — invite-only, used by Scholarship Programmes</option>
              </select>
            </div>
            {newPurpose === 'practice' && (
              <div className="field">
                <label>Who is it for</label>
                <select value={newCourse} onChange={(e) => setNewCourse(e.target.value)}>
                  <option value="">All students</option>
                  {courses.map((c) => <option key={c.id} value={c.id}>Students of {c.name}</option>)}
                </select>
              </div>
            )}
            <div className="field">
              <label>Duration (minutes)</label>
              <input type="number" min={1} value={duration} onChange={(e) => setDuration(Number(e.target.value))} />
            </div>
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <button type="button" className="secondary" onClick={() => setCreating(false)}>Cancel</button>
              <button type="submit" disabled={busy}>{busy ? 'Creating…' : 'Create & edit'}</button>
            </div>
          </form>
        </Modal>
      )}

      {duplicating && (
        <Modal title="Duplicate test" onClose={() => setDuplicating(null)}>
          <form onSubmit={doDuplicate}>
            <p className="mb muted">
              Copies the settings, sections and questions of “{duplicating.title}” into a new draft.
              The copy has its own attempts, so candidates who sat the original can sit it too.
            </p>
            <div className="field">
              <label>Title of the copy *</label>
              <input value={copyTitle} autoFocus onChange={(e) => setCopyTitle(e.target.value)} />
            </div>
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <button type="button" className="secondary" onClick={() => setDuplicating(null)}>Cancel</button>
              <button type="submit" disabled={busy || !copyTitle.trim()}>{busy ? 'Copying…' : 'Duplicate & edit'}</button>
            </div>
          </form>
        </Modal>
      )}

      {deleting && (
        <Confirm
          title="Delete test"
          message={`Delete "${deleting.title}"? This removes its sections and questions.`}
          confirmLabel="Delete"
          danger
          onConfirm={confirmDelete}
          onCancel={() => setDeleting(null)}
        />
      )}
    </Layout>
  );
};

export default TestList;
