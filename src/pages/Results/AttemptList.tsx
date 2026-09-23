import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Layout from '../../components/Layout';
import { useToast } from '../../components/Toast';
import {
  getAssessment,
  listAttempts,
  downloadResultsCsv,
  type Assessment,
  type AttemptSummary,
} from '../../lib/api';

const AttemptList: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { push } = useToast();
  const navigate = useNavigate();
  const [test, setTest] = useState<Assessment | null>(null);
  const [attempts, setAttempts] = useState<AttemptSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [t, a] = await Promise.all([getAssessment(id), listAttempts(id)]);
      setTest(t);
      setAttempts(a.attempts || []);
    } catch (e: any) {
      push('error', e.message);
    } finally {
      setLoading(false);
    }
  }, [id, push]);

  useEffect(() => { load(); }, [load]);

  const exportCsv = async () => {
    if (!id) return;
    try {
      await downloadResultsCsv(id, `${test?.title || 'results'}.csv`);
    } catch (e: any) {
      push('error', e.message);
    }
  };

  return (
    <Layout
      title={test ? `Results — ${test.title}` : 'Results'}
      actions={
        <>
          <button className="secondary" onClick={() => navigate(`/tests/${id}`)}>Back to test</button>
          <button onClick={exportCsv} disabled={attempts.length === 0}>Export CSV</button>
        </>
      }
    >
      <div className="scroll-x">
        <table className="card">
          <thead>
            <tr><th>Candidate</th><th>Email</th><th>Score</th><th>%</th><th>Result</th><th>Status</th><th>Submitted</th></tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="muted">Loading…</td></tr>
            ) : attempts.length === 0 ? (
              <tr><td colSpan={7} className="muted">No attempts yet.</td></tr>
            ) : (
              attempts.map((at, i) => (
                <tr
                  key={at.id || i}
                  className={at.id ? 'clickable' : ''}
                  onClick={() => at.id && navigate(`/tests/${id}/results/${at.id}`)}
                  title="Open answers, grading and proctoring"
                >
                  <td>{at.user_name || '—'}</td>
                  <td>{at.user_email || '—'}</td>
                  <td>{at.score != null ? `${at.score}${at.max_score != null ? ` / ${at.max_score}` : ''}` : '—'}</td>
                  <td>{at.percent != null ? `${Math.round(at.percent)}%` : '—'}</td>
                  <td>
                    {at.passed == null
                      ? '—'
                      : at.passed
                        ? <span className="badge published">pass</span>
                        : <span className="badge archived">fail</span>}
                  </td>
                  <td>{at.status ? <span className="badge draft">{at.status}</span> : '—'}</td>
                  <td className="muted">{at.submitted_at ? new Date(at.submitted_at).toLocaleString() : '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Layout>
  );
};

export default AttemptList;
