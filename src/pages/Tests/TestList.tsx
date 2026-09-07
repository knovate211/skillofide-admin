import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../../components/Layout';
import Modal from '../../components/Modal';
import Confirm from '../../components/Confirm';
import { useToast } from '../../components/Toast';
import TableState from '../../components/TableState';
import {
  listAssessments,
  createAssessment,
  deleteAssessment,
  publishAssessment,
  type Assessment,
} from '../../lib/api';

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

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listAssessments('purpose=practice');
      setTests(res.assessments || []);
    } catch (e: any) {
      push('error', e.message);
    } finally {
      setLoading(false);
    }
  }, [push]);

  useEffect(() => { load(); }, [load]);

  const doCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    try {
      // purpose=practice + no company => a platform test an admin owns.
      const { id } = await createAssessment({
        title: title.trim(),
        purpose: 'practice',
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
    <Layout title="Tests" actions={<button onClick={() => setCreating(true)}>New test</button>}>
      <div className="scroll-x">
        <table className="card">
          <thead>
            <tr><th>Title</th><th>Status</th><th>Duration</th><th>Questions</th><th>Attempts</th><th></th></tr>
          </thead>
          <tbody>
            {loading || tests.length === 0 ? (
              <TableState
                loading={loading}
                columns={6}
                title="No tests yet"
                hint="Create one to get started."
              />
            ) : (
              tests.map((t) => (
                <tr key={t.id}>
                  <td><a onClick={() => navigate(`/tests/${t.id}`)} style={{ cursor: 'pointer' }}>{t.title}</a></td>
                  <td><span className={`badge ${t.status}`}>{t.status}</span></td>
                  <td>{t.duration_minutes} min</td>
                  <td>{t.question_count ?? '—'}</td>
                  <td>{t.attempt_count ?? 0}</td>
                  <td className="actions">
                    <button className="ghost sm" onClick={() => navigate(`/tests/${t.id}`)}>Edit</button>
                    <button className="ghost sm" onClick={() => navigate(`/tests/${t.id}/results`)}>Results</button>
                    <button className="ghost sm" onClick={() => togglePublish(t)}>
                      {t.status === 'published' ? 'Unpublish' : 'Publish'}
                    </button>
                    <button className="ghost sm" onClick={() => setDeleting(t)}>Delete</button>
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
