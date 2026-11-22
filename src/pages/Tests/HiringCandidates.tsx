import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Modal from '../../components/Modal';
import Confirm from '../../components/Confirm';
import { useToast } from '../../components/Toast';
import {
  addHiringCandidates,
  listHiringCandidates,
  removeHiringCandidate,
  resendHiringCandidate,
  type Assessment,
  type CandidateInput,
  type HiringCandidate,
} from '../../lib/api';
import { downloadCandidateTemplate, parseCandidateFile, type ParsedCandidate } from '../../lib/excel';

// The server takes at most 500 candidates per request; bigger lists are sent
// in batches of this size.
const BATCH = 500;

// The candidates of one hiring test. The hiring team adds people here; each
// one is emailed a personal link that signs them straight into this test —
// no student account, no portal. Candidates are stored separately from All
// Users. Their links are never shown here: a link is a login, so only the
// candidate's inbox gets it.

const STATUS: Record<string, { label: string; badge: string }> = {
  invited: { label: 'Invited', badge: 'draft' },
  opened: { label: 'Opened link', badge: 'recruiter' },
  in_progress: { label: 'Taking test', badge: 'recruiter' },
  submitted: { label: 'Submitted', badge: 'published' },
  evaluating: { label: 'Grading', badge: 'published' },
  evaluated: { label: 'Completed', badge: 'published' },
  disqualified: { label: 'Disqualified', badge: 'archived' },
  expired: { label: 'Link expired', badge: 'archived' },
};

/** "Name, email, phone" per line; commas or tabs (a paste from Excel). */
function parseLines(text: string): { rows: CandidateInput[]; bad: string[] } {
  const rows: CandidateInput[] = [];
  const bad: string[] = [];
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    const parts = t.split(/\t|,/).map((p) => p.trim()).filter(Boolean);
    const email = parts.find((p) => p.includes('@'));
    if (!email) {
      bad.push(t);
      continue;
    }
    const rest = parts.filter((p) => p !== email);
    const phone = rest.find((p) => /^[+\d][\d\s-]{6,}$/.test(p)) ?? '';
    const name = rest.filter((p) => p !== phone).join(' ');
    rows.push({ name, email, phone });
  }
  return { rows, bad };
}

/** SMTP errors are written for mail admins; say what they mean. */
function friendlyEmailError(raw: string): string {
  if (/535|Username and Password not accepted|BadCredentials|authentication failed/i.test(raw)) {
    return 'the mail server rejected Knovate’s email login — ask your Knovate admin to update the email settings';
  }
  if (/not configured/i.test(raw)) return 'email is not set up on the server yet';
  if (/5\.1\.1|does not exist|user unknown|no such user/i.test(raw)) return 'this email address does not exist';
  if (/timeout|timed out|connection refused/i.test(raw)) return 'the mail server could not be reached — try Resend later';
  return raw;
}

const HiringCandidates: React.FC<{ test: Assessment; onClose: () => void }> = ({ test, onClose }) => {
  const { push } = useToast();
  const [items, setItems] = useState<HiringCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [expires, setExpires] = useState('');
  const [busy, setBusy] = useState(false);
  const [skipped, setSkipped] = useState<{ email: string; message?: string }[]>([]);
  const [removing, setRemoving] = useState<HiringCandidate | null>(null);
  const [mode, setMode] = useState<'paste' | 'file'>('paste');
  const [fileRows, setFileRows] = useState<ParsedCandidate[] | null>(null);
  const [fileName, setFileName] = useState('');
  const [progress, setProgress] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await listHiringCandidates(test.id!);
      setItems(res.candidates || []);
    } catch (e: any) {
      push('error', e.message);
    } finally {
      setLoading(false);
    }
  }, [push, test.id]);

  useEffect(() => { load(); }, [load]);

  const { rows, bad } = useMemo(() => parseLines(text), [text]);
  const published = test.status === 'published';

  const existing = useMemo(() => new Set(items.map((c) => c.email.toLowerCase())), [items]);
  const fileValid = useMemo(() => (fileRows ?? []).filter((r) => r.errors.length === 0), [fileRows]);
  const fileBad = (fileRows?.length ?? 0) - fileValid.length;
  const toSend: CandidateInput[] = mode === 'file'
    ? fileValid.map((r) => ({ name: r.name, email: r.email, phone: r.phone }))
    : rows;

  const pickFile = async (f: File | undefined) => {
    if (!f) return;
    try {
      const parsed = await parseCandidateFile(f);
      setFileName(f.name);
      setFileRows(parsed);
      setSkipped([]);
      if (!parsed.length) push('error', 'No candidates found. Use a sheet with Name, Email and Phone columns.');
    } catch {
      push('error', 'Could not read that file. Upload a .csv or .xlsx file.');
    } finally {
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const clearFile = () => { setFileRows(null); setFileName(''); };

  // Sends in batches, so a list of 2,000 goes through as four requests.
  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!toSend.length) return;
    setBusy(true);
    setSkipped([]);
    let added = 0;
    let emailOn = true;
    const skip: { email: string; message?: string }[] = [];
    try {
      // End of the chosen day, in the recruiter's time zone.
      const expiresAt = expires ? new Date(`${expires}T23:59:59`).toISOString() : undefined;
      for (let i = 0; i < toSend.length; i += BATCH) {
        if (toSend.length > BATCH) setProgress(`Adding ${Math.min(i + BATCH, toSend.length)} of ${toSend.length}…`);
        const res = await addHiringCandidates(test.id!, toSend.slice(i, i + BATCH), expiresAt);
        added += res.added;
        emailOn = res.email_enabled;
        skip.push(...res.results.filter((r) => r.status === 'skipped'));
      }
    } catch (err: any) {
      push('error', `${err.message}${added ? ` — ${added} were added before this` : ''}`);
    } finally {
      setSkipped(skip);
      if (added) {
        push('success', emailOn
          ? `${added} candidate${added === 1 ? '' : 's'} added — invitation emails are on their way`
          : `${added} added, but email is not configured on the server, so no invitations were sent`);
      }
      if (!skip.length) {
        setText('');
        clearFile();
      }
      setProgress('');
      setBusy(false);
      // Emails go out in the background; refresh to show "Emailed" once sent.
      await load();
      setTimeout(load, 4000);
    }
  };

  const resend = async (c: HiringCandidate) => {
    try {
      await resendHiringCandidate(c.id);
      push('success', `A new link is on its way to ${c.email}`);
      setTimeout(load, 4000);
      load();
    } catch (e: any) {
      push('error', e.message);
    }
  };

  const confirmRemove = async () => {
    if (!removing) return;
    try {
      await removeHiringCandidate(removing.id);
      push('success', `${removing.email} removed`);
      setRemoving(null);
      load();
    } catch (e: any) {
      push('error', e.message);
      setRemoving(null);
    }
  };

  const done = (s: string) => ['submitted', 'evaluating', 'evaluated', 'disqualified'].includes(s);

  return (
    <Modal title={`Candidates — ${test.title}`} onClose={onClose} variant="drawer">
      {!published ? (
        <p className="small mb" style={{ color: 'var(--danger)' }}>
          Publish this test first. Each candidate&apos;s email takes them straight into it.
        </p>
      ) : (
        <form onSubmit={add} className="mb">
          <div className="row between wrap mb" style={{ gap: 8 }}>
            <strong>Add candidates</strong>
            <div className="seg" role="tablist" aria-label="How to add candidates">
              <button type="button" role="tab" aria-selected={mode === 'paste'} className={mode === 'paste' ? 'on' : ''} onClick={() => setMode('paste')}>Type or paste</button>
              <button type="button" role="tab" aria-selected={mode === 'file'} className={mode === 'file' ? 'on' : ''} onClick={() => setMode('file')}>Upload file</button>
            </div>
          </div>

          {mode === 'file' ? (
            <div className="field">
              <input ref={fileInput} type="file" accept=".csv,.xlsx,.xls" hidden onChange={(e) => pickFile(e.target.files?.[0])} />
              {!fileRows ? (
                <div
                  className="dropzone"
                  onClick={() => fileInput.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => { e.preventDefault(); pickFile(e.dataTransfer.files?.[0]); }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileInput.current?.click(); }}
                >
                  <strong>Choose a CSV or Excel file</strong>
                  <span className="muted small">or drag it here · columns: Name, Email, Phone (optional)</span>
                </div>
              ) : (
                <div className="card card-pad">
                  <div className="row between wrap" style={{ gap: 8 }}>
                    <span><strong>{fileName}</strong> <span className="muted small">· {fileRows.length} row{fileRows.length === 1 ? '' : 's'}</span></span>
                    <button type="button" className="ghost sm" onClick={clearFile}>Choose another file</button>
                  </div>
                  <div className="row wrap small mt" style={{ gap: 14 }}>
                    <span className="ok-text">{fileValid.length} ready</span>
                    {fileBad > 0 && <span className="err" style={{ fontSize: 12 }}>{fileBad} with errors (skipped)</span>}
                    {fileValid.some((r) => existing.has(r.email)) && (
                      <span className="muted">{fileValid.filter((r) => existing.has(r.email)).length} already invited — they get a fresh link</span>
                    )}
                  </div>
                  <div className="scroll-x" style={{ maxHeight: 240, overflowY: 'auto', marginTop: 8 }}>
                    <table className="card">
                      <thead><tr><th>Row</th><th>Candidate</th><th>Check</th></tr></thead>
                      <tbody>
                        {fileRows.slice(0, 200).map((r) => (
                          <tr key={r.row}>
                            <td className="muted">{r.row}</td>
                            <td>
                              <div>{r.name || <span className="muted">(name taken from email)</span>}</div>
                              <div className="muted small">{r.email || '—'}{r.phone ? ` · ${r.phone}` : ''}</div>
                            </td>
                            <td className="small nowrap">
                              {r.errors.length
                                ? <span className="err" style={{ fontSize: 12 }}>{r.errors.join(', ')}</span>
                                : existing.has(r.email) ? <span className="muted">re-invite</span> : <span className="ok-text">✓</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {fileRows.length > 200 && <p className="muted small">Showing the first 200 of {fileRows.length} rows.</p>}
                  </div>
                </div>
              )}
              <button type="button" className="linkBtn small mt" onClick={downloadCandidateTemplate}>Download a template (.xlsx)</button>
            </div>
          ) : (
          <div className="field">
            <textarea
              rows={5}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={'One per line: name, email, phone (optional)\nAsha Rao, asha@example.com, 9876543210\nRavi Kumar, ravi@example.com'}
            />
            <span className="muted small">
              {rows.length} candidate{rows.length === 1 ? '' : 's'}
              {bad.length ? <span style={{ color: 'var(--danger)' }}> · {bad.length} line{bad.length === 1 ? '' : 's'} without an email</span> : null}
              {' '}· you can paste straight from Excel
            </span>
          </div>
          )}
          <div className="field">
            <label>Link valid until (optional — default 7 days)</label>
            <input type="date" value={expires} onChange={(e) => setExpires(e.target.value)} />
          </div>
          <button type="submit" disabled={busy || !toSend.length}>
            {busy ? (progress || 'Adding…') : `Add & email ${toSend.length || ''} invitation${toSend.length === 1 ? '' : 's'}`}
          </button>
          <p className="muted small" style={{ marginTop: 8 }}>
            Each candidate gets an email with a personal link that opens this test directly. They
            don&apos;t need an account or a password.
          </p>
          {skipped.length > 0 && (
            <div className="card card-pad small" style={{ marginTop: 10 }}>
              <strong>Not added:</strong>
              <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                {skipped.map((s) => <li key={s.email}>{s.email} — {s.message}</li>)}
              </ul>
            </div>
          )}
        </form>
      )}

      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0 }}>Candidates ({items.length})</h3>
        <button className="ghost sm" onClick={load}>Refresh</button>
      </div>
      {loading ? (
        <p className="muted">Loading…</p>
      ) : items.length === 0 ? (
        <p className="muted">No candidates yet.</p>
      ) : (
        <ul className="card" style={{ listStyle: 'none', margin: '8px 0 0', padding: 0 }}>
          {items.map((c, i) => {
            const st = STATUS[c.status] || { label: c.status, badge: 'draft' };
            return (
              <li key={c.id} style={{ padding: '10px 14px', borderTop: i ? '1px solid var(--border)' : undefined }}>
                <div className="row" style={{ gap: 10, alignItems: 'center' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600 }}>{c.name}</div>
                    <div className="muted small" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c.email}{c.phone ? ` · ${c.phone}` : ''}
                    </div>
                  </div>
                  {c.score != null && c.max_score ? (
                    <strong className="nowrap">{c.score}/{c.max_score}</strong>
                  ) : null}
                  <span className={`badge ${st.badge}`}>{st.label}</span>
                </div>
                <div className="row small" style={{ gap: 10, marginTop: 4, alignItems: 'center' }}>
                  <span style={{ flex: 1 }} className={c.email_error ? '' : 'muted'}>
                    {c.email_error
                      ? <span style={{ color: 'var(--danger)' }} title={c.email_error}>Email not sent: {friendlyEmailError(c.email_error)}</span>
                      : c.emailed_at
                        ? `Emailed ${new Date(c.emailed_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}`
                        : 'Sending email…'}
                    {c.expires_at && !done(c.status) ? ` · link valid until ${new Date(c.expires_at).toLocaleDateString()}` : ''}
                  </span>
                  {!done(c.status) && published && (
                    <button className="ghost sm" onClick={() => resend(c)}>Resend</button>
                  )}
                  {(c.status === 'invited' || c.status === 'opened' || c.status === 'expired') && (
                    <button className="ghost sm danger-text" onClick={() => setRemoving(c)}>Remove</button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {removing && (
        <Confirm
          title="Remove candidate"
          message={`Remove ${removing.email}? Their link stops working.`}
          confirmLabel="Remove"
          danger
          onConfirm={confirmRemove}
          onCancel={() => setRemoving(null)}
        />
      )}
    </Modal>
  );
};

export default HiringCandidates;
