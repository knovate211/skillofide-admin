import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Layout from '../../components/Layout';
import { useToast } from '../../components/Toast';
import {
  getAssessment,
  listAttempts,
  downloadResultsCsv,
  getIntegrityReport,
  type Assessment,
  type AttemptSummary,
  type IntegrityReport,
} from '../../lib/api';
import IntegrityPanel, { RiskBadge } from './IntegrityPanel';
import { fmtDuration, ranOutOfTime, secondsTaken } from '../../lib/duration';

const AttemptList: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { push } = useToast();
  const navigate = useNavigate();
  const [test, setTest] = useState<Assessment | null>(null);
  const [attempts, setAttempts] = useState<AttemptSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [integrity, setIntegrity] = useState<IntegrityReport | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [t, a] = await Promise.all([getAssessment(id), listAttempts(id)]);
      setTest(t);
      setAttempts(a.attempts || []);
      // Separate and non-fatal: the results table is useful without it.
      getIntegrityReport(id).then(setIntegrity).catch(() => setIntegrity(null));
    } catch (e: any) {
      push('error', e.message);
    } finally {
      setLoading(false);
    }
  }, [id, push]);

  useEffect(() => { load(); }, [load]);

  // Time taken per finished attempt, for the column and the summary above it.
  const limit = test?.duration_minutes;
  const times = attempts
    .map((a) => secondsTaken(a.started_at, a.submitted_at))
    .filter((t): t is number => t != null);
  const avg = times.length ? times.reduce((n, t) => n + t, 0) / times.length : 0;
  const timedOut = times.filter((t) => ranOutOfTime(t, limit)).length;

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
      {times.length > 0 && (
        <div className="time-strip card mb">
          <div><span className="muted small">Average time</span><strong>{fmtDuration(avg)}</strong></div>
          <div><span className="muted small">Fastest</span><strong>{fmtDuration(Math.min(...times))}</strong></div>
          <div><span className="muted small">Slowest</span><strong>{fmtDuration(Math.max(...times))}</strong></div>
          <div><span className="muted small">Time limit</span><strong>{limit ? `${limit} min` : '—'}</strong></div>
          <div><span className="muted small">Ran out of time</span><strong>{timedOut} of {times.length}</strong></div>
        </div>
      )}
      {integrity && id && attempts.length > 0 && <IntegrityPanel testId={id} report={integrity} />}
      <div className="scroll-x">
        <table className="card">
          <thead>
            <tr><th>Candidate</th><th>Email</th><th>Score</th><th>%</th><th>Result</th><th>Time taken</th><th>Integrity</th><th>Status</th><th>Submitted</th></tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} className="muted">Loading…</td></tr>
            ) : attempts.length === 0 ? (
              <tr><td colSpan={9} className="muted">No attempts yet.</td></tr>
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
                  <td className="nowrap">
                    {(() => {
                      const t = secondsTaken(at.started_at, at.submitted_at);
                      if (t == null) return <span className="muted">{at.status === 'in_progress' ? 'In progress' : '—'}</span>;
                      const pct = limit ? Math.min(100, (t / (limit * 60)) * 100) : 0;
                      return (
                        <div className="time-cell" title={limit ? `${fmtDuration(t)} of ${limit} min` : fmtDuration(t)}>
                          <span>{fmtDuration(t)}</span>
                          {limit ? <span className="time-bar"><span style={{ width: `${pct}%` }} className={ranOutOfTime(t, limit) ? 'full' : ''} /></span> : null}
                          {ranOutOfTime(t, limit) && <span className="badge archived">timed out</span>}
                        </div>
                      );
                    })()}
                  </td>
                  <td>
                    <RiskBadge risk={integrity?.attempts.find((r) => r.attempt_id === at.id)?.risk} />
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
