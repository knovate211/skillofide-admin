import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Layout from '../../components/Layout';
import { useToast } from '../../components/Toast';
import {
  getAssessment,
  getAttemptReport,
  getAttemptIntegrity,
  gradeAnswer,
  type AttemptIntegrity,
  type AttemptReport,
  type ReportQuestion,
} from '../../lib/api';
import CodePlayback from './CodePlayback';
import { RiskBadge } from './IntegrityPanel';
import { fmtDuration, ranOutOfTime, secondsTaken } from '../../lib/duration';

const secs = (ms: number) => {
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
};

const needsGrade = (q: ReportQuestion) =>
  q.kind === 'descriptive' && (q.grading_status === 'pending' || q.grading_status === 'manual_review');

// One descriptive answer's mark box. Saves on button click, not on blur, so a
// half-typed number never becomes a grade.
const GradeBox: React.FC<{ q: ReportQuestion; onSave: (marks: number) => Promise<void> }> = ({ q, onSave }) => {
  const [val, setVal] = useState(q.awarded_marks != null ? String(q.awarded_marks) : '');
  const [saving, setSaving] = useState(false);
  const n = Number(val);
  const valid = val !== '' && !Number.isNaN(n) && n >= 0 && n <= q.marks;
  return (
    <div className="row mt">
      <input
        type="number"
        min={0}
        max={q.marks}
        step={0.5}
        style={{ width: 90 }}
        value={val}
        onChange={(e) => setVal(e.target.value)}
      />
      <span className="muted">/ {q.marks}</span>
      <button
        className="sm"
        disabled={!valid || saving}
        onClick={async () => {
          setSaving(true);
          try {
            await onSave(n);
          } finally {
            setSaving(false);
          }
        }}
      >
        {saving ? 'Saving…' : q.awarded_marks != null && !needsGrade(q) ? 'Update mark' : 'Save mark'}
      </button>
      {val !== '' && !valid && <span className="err">Enter 0 – {q.marks}</span>}
    </div>
  );
};

const AttemptDetail: React.FC = () => {
  const { id, attemptId } = useParams<{ id: string; attemptId: string }>();
  const { push } = useToast();
  const navigate = useNavigate();
  const [report, setReport] = useState<AttemptReport | null>(null);
  const [onlyUngraded, setOnlyUngraded] = useState(false);
  const [integrity, setIntegrity] = useState<AttemptIntegrity | null>(null);
  const [limitMin, setLimitMin] = useState<number | undefined>();

  const load = useCallback(async () => {
    if (!attemptId) return;
    try {
      setReport(await getAttemptReport(attemptId));
      getAttemptIntegrity(attemptId).then(setIntegrity).catch(() => setIntegrity(null));
      if (id) getAssessment(id).then((t) => setLimitMin(t.duration_minutes)).catch(() => undefined);
    } catch (e: any) {
      push('error', e.message);
    }
  }, [attemptId, push]);

  useEffect(() => { load(); }, [load]);

  const save = async (q: ReportQuestion, marks: number) => {
    if (!attemptId) return;
    try {
      const r = await gradeAnswer(attemptId, q.id, marks);
      push('success', `Saved. Score is now ${r.score} / ${r.max_score}`);
      await load();
    } catch (e: any) {
      push('error', e.message);
    }
  };

  const back = (
    <button className="secondary" onClick={() => navigate(`/tests/${id}/results`)}>Back to results</button>
  );

  if (!report) {
    return <Layout title="Attempt" actions={back}><p className="muted">Loading…</p></Layout>;
  }

  const s = report.summary;
  const questions = [...(report.questions || [])].sort((a, b) => a.order_index - b.order_index);
  const pending = questions.filter(needsGrade).length;
  const shown = onlyUngraded ? questions.filter(needsGrade) : questions;
  const totalTime = questions.reduce((t, q) => t + (q.time_spent_ms || 0), 0);
  const taken = secondsTaken(s.started_at, s.submitted_at);
  const timeBy = (kind: ReportQuestion['kind']) =>
    questions.filter((q) => q.kind === kind).reduce((t, q) => t + (q.time_spent_ms || 0), 0);
  const events = report.proctor_events || [];

  return (
    <Layout title={s.user_name || s.user_email || 'Attempt'} actions={back}>
      <div className="tiles mb">
        <div className="card tile">
          <div className="n">{s.score ?? 0} / {s.max_score ?? 0}</div>
          <div className="l">Score{s.percent != null ? ` · ${Math.round(s.percent)}%` : ''}</div>
        </div>
        <div className="card tile">
          <div className="n">{s.passed ? 'Pass' : 'Fail'}</div>
          <div className="l">Result</div>
        </div>
        <div className={`card tile${(s.integrity_score ?? 100) < 70 ? ' alert' : ''}`}>
          <div className="n">{Math.round(s.integrity_score ?? 100)}</div>
          <div className="l">Integrity score</div>
          <div className="hint">{events.length} proctoring event{events.length === 1 ? '' : 's'}</div>
        </div>
        <div className={`card tile${taken != null && ranOutOfTime(taken, limitMin) ? ' alert' : ''}`}>
          <div className="n">{taken != null ? fmtDuration(taken) : '—'}</div>
          <div className="l">Time taken{limitMin ? ` · of ${limitMin} min` : ''}</div>
          <div className="hint">
            {taken == null ? 'Still in progress'
              : ranOutOfTime(taken, limitMin) ? 'Ran out of time — the timer submitted it'
              : limitMin ? `Finished with ${fmtDuration(limitMin * 60 - taken)} to spare` : 'Start to submit'}
          </div>
        </div>
        <div className="card tile">
          <div className="n">{secs(totalTime)}</div>
          <div className="l">Time on questions</div>
          <div className="hint">
            {[['mcq', 'MCQ'], ['coding', 'coding'], ['descriptive', 'written']]
              .map(([k, label]) => [label, timeBy(k as ReportQuestion['kind'])] as const)
              .filter(([, ms]) => ms > 0)
              .map(([label, ms]) => `${secs(ms)} ${label}`)
              .join(' · ') || 'Not recorded'}
          </div>
        </div>
        <div className={`card tile${pending > 0 ? ' alert' : ''}`}>
          <div className="n">{pending}</div>
          <div className="l">Answers to grade</div>
        </div>
      </div>

      <p className="muted mb">
        {s.user_email} · attempt #{s.attempt_no ?? 1} · <span className="badge draft">{s.status}</span>
        {s.submitted_at && ` · submitted ${new Date(s.submitted_at).toLocaleString()}`}
      </p>

      {integrity?.risk && (
        <div className="card card-pad mb">
          <div className="row between wrap" style={{ gap: 8 }}>
            <h3 style={{ margin: 0 }}>Integrity</h3>
            <RiskBadge risk={integrity.risk.risk} />
          </div>
          {integrity.risk.signals.length === 0 ? (
            <p className="muted" style={{ marginBottom: 0 }}>No integrity signals for this candidate.</p>
          ) : (
            <ul className="signals mt">
              {integrity.risk.signals.map((sg, i) => <li key={i} className={`sig-${sg.severity}`}>{sg.text}</li>)}
            </ul>
          )}
          {integrity.similarity.length > 0 && (
            <p className="small mt" style={{ marginBottom: 0 }}>
              Similar code:{' '}
              {integrity.similarity.map((p, i) => {
                const other = p.a.attempt_id === attemptId ? p.b : p.a;
                return (
                  <React.Fragment key={i}>
                    {i > 0 && ' · '}
                    <button className="linkBtn" onClick={() => navigate(`/tests/${id}/results/${other.attempt_id}`)}>
                      {other.name || other.email}
                    </button>{' '}({p.percent}% on “{p.question_title}”)
                  </React.Fragment>
                );
              })}
            </p>
          )}
          {integrity.sessions.length > 0 && (
            <details className="mt">
              <summary className="small">Devices and networks ({integrity.sessions.length} session{integrity.sessions.length === 1 ? '' : 's'})</summary>
              <table className="card mt">
                <thead><tr><th>IP</th><th>Browser</th><th>Screen</th><th>From</th><th>Last seen</th></tr></thead>
                <tbody>
                  {integrity.sessions.map((se, i) => (
                    <tr key={i}>
                      <td className="nowrap">{se.ip || '—'}</td>
                      <td className="small" style={{ maxWidth: 320 }}>{se.user_agent || '—'}</td>
                      <td className="nowrap">{se.screen || '—'}</td>
                      <td className="muted nowrap">{new Date(se.first_seen).toLocaleTimeString()}</td>
                      <td className="muted nowrap">{new Date(se.last_seen).toLocaleTimeString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          )}
        </div>
      )}

      <div className="row between mb">
        <h3>Answers</h3>
        <label className="row">
          <input type="checkbox" checked={onlyUngraded} onChange={(e) => setOnlyUngraded(e.target.checked)} />
          Only answers waiting for a mark
        </label>
      </div>

      {shown.length === 0 && <p className="muted">Nothing to show.</p>}
      {shown.map((q) => {
        const sel = new Set(q.selected_option_ids || []);
        return (
          <div key={q.id} className="card card-pad mb answer">
            <div className="row between">
              <strong>Q{q.order_index + 1} · {q.kind}</strong>
              <span className="row">
                <span className="muted small">{secs(q.time_spent_ms || 0)}</span>
                {q.marked_review && <span className="badge draft">flagged</span>}
                {!q.visited && <span className="badge draft">not seen</span>}
                <span className={`badge ${needsGrade(q) ? 'archived' : 'published'}`}>
                  {q.awarded_marks != null ? `${q.awarded_marks} / ${q.marks}` : needsGrade(q) ? 'needs grading' : `– / ${q.marks}`}
                </span>
              </span>
            </div>

            {q.kind === 'coding' ? (
              <p className="mt"><strong>{q.problem_title || q.problem_id}</strong></p>
            ) : (
              q.body && <p className="mt q-body">{q.body}</p>
            )}

            {q.kind === 'mcq' && (
              <ul className="opts">
                {(q.options || []).map((o, i) => {
                  const picked = o.id != null && sel.has(o.id);
                  return (
                    <li key={o.id || i} className={`${o.is_correct ? 'correct' : ''} ${picked ? 'picked' : ''}`}>
                      <span className="opt-mark">{picked ? '●' : '○'}</span> {o.body}
                      {o.is_correct && <span className="small"> ✓ correct</span>}
                      {picked && !o.is_correct && <span className="small"> ✗ chosen</span>}
                    </li>
                  );
                })}
                {sel.size === 0 && <li className="muted">Not answered</li>}
              </ul>
            )}

            {q.kind === 'descriptive' && (
              <>
                <pre className="answer-text">{q.text_answer || '(no answer)'}</pre>
                <GradeBox q={q} onSave={(m) => save(q, m)} />
              </>
            )}

            {q.kind === 'coding' && (
              q.code ? (
                <>
                  <div className="muted small">{q.language} · final answer</div>
                  <pre className="answer-text code">{q.code}</pre>
                  {integrity && (
                    <CodePlayback snapshots={integrity.snapshots[q.id] || []} events={events} />
                  )}
                </>
              ) : <p className="muted">No code submitted.</p>
            )}
          </div>
        );
      })}

      <h3 className="mt">Proctoring timeline</h3>
      <div className="scroll-x">
        <table className="card">
          <thead><tr><th>Time</th><th>Event</th><th>Detail</th></tr></thead>
          <tbody>
            {events.length === 0 ? (
              <tr><td colSpan={3} className="muted">No proctoring events recorded.</td></tr>
            ) : (
              events.map((e, i) => (
                <tr key={i}>
                  <td className="muted">{new Date(e.occurred_at).toLocaleTimeString()}</td>
                  <td>{e.kind.replace(/_/g, ' ')}</td>
                  <td className="muted">{e.detail || '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Layout>
  );
};

export default AttemptDetail;
