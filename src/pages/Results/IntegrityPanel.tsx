import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { IntegrityPerson, IntegrityReport } from '../../lib/api';

// The whole-test integrity picture above the results table: how many
// candidates need a look, and the cross-candidate evidence no single attempt
// shows — similar code, identical wrong answers, shared networks.

export const RiskBadge: React.FC<{ risk?: string }> = ({ risk }) =>
  risk ? <span className={`risk risk-${risk}`}>{risk === 'high' ? 'High risk' : risk === 'medium' ? 'Review' : 'Low'}</span> : null;

type Tab = 'people' | 'code' | 'answers' | 'network';

const IntegrityPanel: React.FC<{ testId: string; report: IntegrityReport }> = ({ testId, report }) => {
  const navigate = useNavigate();
  const high = report.attempts.filter((a) => a.risk === 'high').length;
  const medium = report.attempts.filter((a) => a.risk === 'medium').length;
  const [tab, setTab] = useState<Tab>('people');
  const open = (p: IntegrityPerson) => navigate(`/tests/${testId}/results/${p.attempt_id}`);
  const who = (p: IntegrityPerson) => (
    <button className="linkBtn" onClick={() => open(p)} title={p.email}>{p.name || p.email}</button>
  );

  return (
    <div className="card card-pad mb integrity-panel">
      <div className="row between wrap" style={{ gap: 12 }}>
        <div>
          <h3 style={{ margin: 0 }}>Integrity report</h3>
          <p className="muted small" style={{ margin: '4px 0 0' }}>
            Evidence to review, not a verdict — open a candidate to see each signal, their devices and a replay of their code.
          </p>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <span className="risk risk-high">{high} high risk</span>
          <span className="risk risk-medium">{medium} to review</span>
          <span className="risk risk-low">{report.attempts.length - high - medium} low</span>
        </div>
      </div>

      <div className="seg mt" role="tablist">
        {([
          ['people', `Candidates (${report.attempts.length})`],
          ['code', `Similar code (${report.similarity.length})`],
          ['answers', `Same wrong answers (${report.collusion.length})`],
          ['network', `Shared networks (${report.shared_ips.length})`],
        ] as [Tab, string][]).map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{label}</button>
        ))}
      </div>

      <div className="mt">
        {tab === 'people' && (
          report.attempts.every((a) => a.signals.length === 0) ? (
            <p className="muted">No signals on any candidate.</p>
          ) : (
            <ul className="signal-list">
              {report.attempts.filter((a) => a.signals.length > 0).map((a) => (
                <li key={a.attempt_id}>
                  <div className="row between">
                    <span className="row" style={{ gap: 8 }}>{who(a)} <RiskBadge risk={a.risk} /></span>
                    <span className="muted small">integrity {Math.round(a.integrity_score)}/100</span>
                  </div>
                  <ul className="signals">
                    {a.signals.slice(0, 4).map((s, i) => <li key={i} className={`sig-${s.severity}`}>{s.text}</li>)}
                    {a.signals.length > 4 && <li className="muted">+{a.signals.length - 4} more</li>}
                  </ul>
                </li>
              ))}
            </ul>
          )
        )}

        {tab === 'code' && (
          report.similarity.length === 0 ? (
            <p className="muted">No two candidates wrote similar code. Solutions are compared by structure, so renamed variables and reformatting do not hide a copy; the starter code is ignored.</p>
          ) : (
            <table className="card">
              <thead><tr><th>Question</th><th>Candidate</th><th>Candidate</th><th>Similarity</th></tr></thead>
              <tbody>
                {report.similarity.map((p, i) => (
                  <tr key={i}>
                    <td>{p.question_title} <span className="muted small">· {p.language}</span></td>
                    <td>{who(p.a)}</td>
                    <td>{who(p.b)}</td>
                    <td><span className={`risk ${p.percent >= 85 ? 'risk-high' : 'risk-medium'}`}>{p.percent}%</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        )}

        {tab === 'answers' && (
          report.collusion.length === 0 ? (
            <p className="muted">No pair of candidates chose the same wrong answers unusually often.</p>
          ) : (
            <table className="card">
              <thead><tr><th>Candidate</th><th>Candidate</th><th>Same wrong answer</th></tr></thead>
              <tbody>
                {report.collusion.map((c, i) => (
                  <tr key={i}>
                    <td>{who(c.a)}</td>
                    <td>{who(c.b)}</td>
                    <td>{c.shared_wrong} of the {c.both_wrong} questions both got wrong</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        )}

        {tab === 'network' && (
          report.shared_ips.length === 0 ? (
            <p className="muted">Every candidate sat the test from a different network.</p>
          ) : (
            <>
              <p className="muted small">A campus or office often puts everyone behind one address — a small group on one network is the one worth a look.</p>
              <table className="card">
                <thead><tr><th>Network (IP)</th><th>Candidates</th></tr></thead>
                <tbody>
                  {report.shared_ips.map((s) => (
                    <tr key={s.ip}>
                      <td className="nowrap">{s.ip}</td>
                      <td>{s.people.map((p, i) => <React.Fragment key={p.attempt_id}>{i > 0 && ', '}{who(p)}</React.Fragment>)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )
        )}
      </div>
    </div>
  );
};

export default IntegrityPanel;
