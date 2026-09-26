import React, { useCallback, useEffect, useState } from 'react';
import Layout from '../../components/Layout';
import Modal from '../../components/Modal';
import Confirm from '../../components/Confirm';
import { useToast } from '../../components/Toast';
import {
  extendCertification,
  exportCertificationsCsv,
  listCertificationExams,
  listCertifications,
  resendCertificationLink,
  updateCertification,
  type CertificationExam,
  type CertificationFilters,
  type CertificationRegistration,
} from '../../lib/api';
import { useUrlFilters } from '../../lib/useListState';

const PAGE_SIZE = 25;
const FILTER_KEYS = ['status', 'exam', 'search'] as const;

// Order matches the funnel: bought → sat → judged. 'refunded' sits apart
// because it is a decision staff record, not somewhere the candidate got to.
const FUNNEL_STATUSES = ['created', 'paid', 'started', 'submitted', 'passed', 'failed', 'expired'];
const STATUSES = [...FUNNEL_STATUSES, 'refunded'];

const badgeClass: Record<string, string> = {
  created: 'draft',
  paid: 'student',
  started: 'admin',
  submitted: 'admin',
  passed: 'published',
  failed: 'archived',
  expired: 'archived',
  refunded: 'archived',
};

const rupees = (n: number) => `₹${n.toLocaleString('en-IN')}`;
const day = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' }) : '—';

/**
 * Everyone who has paid for a certification.
 *
 * A row is a purchase before it is an attempt, so the screen has to cope with
 * money that arrived without a link behind it: `error` marks exactly that, and
 * those rows are the reason this list is worth opening every morning.
 */
const RegistrationList: React.FC = () => {
  const { push } = useToast();
  const { filters, page, active, setFilter, setPage, clear } = useUrlFilters(FILTER_KEYS);
  const [rows, setRows] = useState<CertificationRegistration[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [exams, setExams] = useState<CertificationExam[]>([]);
  const [open, setOpen] = useState<CertificationRegistration | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listCertifications(page, PAGE_SIZE, filters as CertificationFilters);
      setRows(res.registrations ?? []);
      setTotal(res.total);
    } catch (e: any) {
      push('error', e.message);
    } finally {
      setLoading(false);
    }
  }, [page, filters, push]);

  // There are no facets for this list, so the exam filter is built from the
  // catalogue — it names exams nobody has bought yet, which a facet would not.
  useEffect(() => {
    listCertificationExams().then((r) => setExams(r.exams ?? [])).catch(() => undefined);
  }, []);

  // Debounced: the search box calls this on every keystroke.
  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  const doExport = async () => {
    setExporting(true);
    try {
      // Exports what the screen is filtered to, not just this page.
      await exportCertificationsCsv(filters as CertificationFilters);
      push('success', 'CSV downloaded');
    } catch (e: any) {
      push('error', e.message);
    } finally {
      setExporting(false);
    }
  };

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const stuck = rows.filter((r) => r.error).length;

  return (
    <Layout
      title="Certifications"
      actions={
        <button className="secondary" disabled={exporting || total === 0} onClick={doExport}>
          {exporting ? 'Exporting…' : 'Export CSV'}
        </button>
      }
    >
      <div className="filter-bar mb">
        <input
          className="filter-search"
          placeholder="Search name, email or payment id…"
          value={filters.search}
          onChange={(e) => setFilter('search', e.target.value)}
        />
        <select value={filters.status} onChange={(e) => setFilter('status', e.target.value)}>
          <option value="">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={filters.exam} onChange={(e) => setFilter('exam', e.target.value)}>
          <option value="">All exams</option>
          {exams.map((e) => <option key={e.id} value={e.slug}>{e.title}</option>)}
        </select>
        {active && <button className="ghost sm" onClick={clear}>Clear filters</button>}
        <span className="grow" />
        <span className="muted nowrap">{total} registration{total === 1 ? '' : 's'}</span>
      </div>

      {stuck > 0 && (
        <p className="mb" style={{ color: 'var(--danger, #b91c1c)', fontSize: 13 }}>
          <strong>{stuck} on this page took payment but never got a link.</strong>{' '}
          Open the row and resend it, or refund.
        </p>
      )}

      <div className="scroll-x">
        <table className="card">
          <thead>
            <tr>
              <th>Candidate</th><th>Exam</th><th>Status</th><th>Score</th>
              <th>Paid</th><th>Expires</th><th>Credential</th><th>Bought</th><th></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} className="muted">Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={9} className="muted">
                {active ? 'No registrations match these filters.' : 'Nobody has registered yet.'}
              </td></tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="clickable" onClick={() => setOpen(r)}>
                  <td>
                    {r.name}
                    <div className="muted" style={{ fontSize: 12 }}>{r.email}</div>
                  </td>
                  <td>{r.exam_title}</td>
                  <td>
                    <span className={`badge ${badgeClass[r.status] || 'draft'}`}>{r.status}</span>
                    {r.error && (
                      <div style={{ marginTop: 4 }}>
                        <span className="badge archived" title={r.error}>needs attention</span>
                      </div>
                    )}
                  </td>
                  <td className="nowrap">
                    {r.score_percent == null
                      ? <span className="muted">not sat</span>
                      : <>{Math.round(r.score_percent * 10) / 10}% <span className="muted">/ {r.pass_percent}%</span></>}
                  </td>
                  <td className="nowrap">
                    {r.paid_at ? rupees(r.amount_rupees) : <span className="muted">unpaid</span>}
                  </td>
                  <td className="muted nowrap">{day(r.expires_at)}</td>
                  <td className="nowrap">
                    {r.credential_id
                      ? r.credential_revoked
                        ? <span className="badge archived">revoked</span>
                        : <span style={{ fontSize: 12 }}>{r.credential_id}</span>
                      : <span className="muted">—</span>}
                  </td>
                  <td className="muted nowrap">{day(r.created_at)}</td>
                  <td className="actions" onClick={(e) => e.stopPropagation()}>
                    <button className="ghost sm" onClick={() => setOpen(r)}>View</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div className="row mt" style={{ justifyContent: 'center' }}>
          <button className="secondary sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Prev</button>
          <span className="muted">Page {page} of {pages}</span>
          <button className="secondary sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</button>
        </div>
      )}

      {open && (
        <RegistrationDrawer
          registration={open}
          onClose={() => setOpen(null)}
          onChanged={load}
        />
      )}
    </Layout>
  );
};

const RegistrationDrawer: React.FC<{
  registration: CertificationRegistration;
  onClose: () => void;
  onChanged: () => void;
}> = ({ registration: r, onClose, onChanged }) => {
  const { push } = useToast();
  const [notes, setNotes] = useState(r.notes ?? '');
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const [freshLink, setFreshLink] = useState('');
  const [sendFailed, setSendFailed] = useState(false);
  const [extendDays, setExtendDays] = useState('7');
  const [reason, setReason] = useState('');
  const [confirmRefund, setConfirmRefund] = useState(false);
  const [confirmIssue, setConfirmIssue] = useState(false);
  const [revoking, setRevoking] = useState(false);

  const sat = r.score_percent != null;
  const paid = !!r.paid_at;

  const resend = async () => {
    setResending(true);
    setSendFailed(false);
    try {
      const res = await resendCertificationLink(r.id);
      // A new link is issued either way; whether the email carrying it left is
      // a separate fact, and staff have to know which happened.
      setFreshLink(res.url);
      if (res.success) {
        push('success', `New link emailed to ${res.email}`);
      } else {
        setSendFailed(true);
        push('error', `Link created, but the email did not send to ${res.email}`);
      }
      onChanged();
    } catch (e: any) {
      push('error', e.message);
    } finally {
      setResending(false);
    }
  };

  const extend = async () => {
    const days = Number(extendDays);
    if (!days) return push('error', 'Enter how many days to add');
    setBusy(true);
    try {
      const res = await extendCertification(r.id, days);
      push('success', `Now expires ${new Date(res.expires_at).toLocaleString()}`);
      onChanged();
    } catch (e: any) {
      push('error', e.message);
    } finally {
      setBusy(false);
    }
  };

  const act = async (
    action: 'refund' | 'issue_certificate' | 'revoke_certificate',
    why?: string,
  ) => {
    setBusy(true);
    try {
      const res = await updateCertification(r.id, { action, reason: why });
      push(
        'success',
        action === 'refund'
          ? 'Refund recorded'
          : action === 'issue_certificate'
            ? `Certificate issued${res.credential_id ? ` — ${res.credential_id}` : ''}`
            : 'Certificate revoked',
      );
      onChanged();
      onClose();
    } catch (e: any) {
      push('error', e.message);
    } finally {
      setBusy(false);
      setConfirmRefund(false);
      setConfirmIssue(false);
      setRevoking(false);
    }
  };

  const saveNotes = async () => {
    setBusy(true);
    try {
      await updateCertification(r.id, { notes });
      push('success', 'Notes saved');
      onChanged();
    } catch (e: any) {
      push('error', e.message);
    } finally {
      setBusy(false);
    }
  };

  const Row = ({ label, value }: { label: string; value?: string | number | null }) =>
    value === null || value === undefined || value === '' ? null : (
      <div className="field"><label>{label}</label><div>{value}</div></div>
    );

  const divider = <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '16px 0' }} />;

  return (
    <Modal title={r.name} onClose={onClose} variant="drawer">
      {/* Money in with nothing to show for it. Nothing else on this screen is
          as urgent, so it goes above the details rather than among them. */}
      {r.error && (
        <div className="card card-pad mb" style={{ borderColor: 'var(--danger, #b91c1c)' }}>
          <strong style={{ color: 'var(--danger, #b91c1c)' }}>Paid, but no link was issued.</strong>
          <p className="muted" style={{ margin: '6px 0 0', fontSize: 12.5 }}>{r.error}</p>
          <p className="muted" style={{ margin: '6px 0 0', fontSize: 12.5 }}>
            Resend below to put it right, or refund if they have given up waiting.
          </p>
        </div>
      )}

      <Row label="Email" value={r.email} />
      <Row label="Phone" value={r.phone} />
      <Row label="Exam" value={r.exam_title} />
      <div className="field">
        <label>Status</label>
        <div><span className={`badge ${badgeClass[r.status] || 'draft'}`}>{r.status}</span></div>
      </div>
      <div className="field">
        <label>Result</label>
        <div>
          {sat
            ? <>
                <strong>{Math.round((r.score_percent ?? 0) * 10) / 10}%</strong>{' '}
                <span className="muted">against a {r.pass_percent}% pass mark</span>
              </>
            : <span className="muted">Has not sat the paper yet.</span>}
        </div>
      </div>
      <Row label="Integrity score" value={r.integrity_score} />
      <Row label="Payment" value={paid ? `${rupees(r.amount_rupees)} · ${r.payment_id}` : 'Not paid'} />
      <Row label="Bought" value={new Date(r.created_at).toLocaleString()} />
      <Row label="Paid" value={r.paid_at ? new Date(r.paid_at).toLocaleString() : null} />
      <Row label="Link expires" value={r.expires_at ? new Date(r.expires_at).toLocaleString() : null} />
      <Row label="Link opened" value={r.claimed_at ? new Date(r.claimed_at).toLocaleString() : null} />
      <div className="field">
        <label>Invitation email</label>
        <div>{r.emailed ? 'Sent' : <span className="muted">Never sent</span>}</div>
      </div>

      {divider}

      {/* The email is the only way into the paper, so a bounced or deleted one
          would otherwise strand somebody who has already paid. */}
      <div className="field">
        <label>Exam link</label>
        {sat ? (
          <p className="muted" style={{ margin: 0 }}>Already sat the paper — there is nothing left to send.</p>
        ) : (
          <>
            <div className="row">
              <button className="secondary sm" disabled={resending} onClick={resend}>
                {resending ? 'Sending…' : 'Resend exam link'}
              </button>
            </div>
            <p className="muted" style={{ fontSize: 12, margin: '6px 0 0' }}>
              Emails a fresh link and restarts the validity period. Any earlier link stops working.
            </p>
            {sendFailed && (
              <p style={{ margin: '8px 0 0', fontSize: 12.5, color: 'var(--danger)' }}>
                <strong>The email did not send.</strong> The link below is still valid — send it to
                them another way.
              </p>
            )}
            {freshLink && (
              <div style={{ marginTop: 10 }}>
                <p className="muted" style={{ fontSize: 12, margin: '0 0 4px' }}>
                  If their email is bouncing, send them this directly:
                </p>
                <div className="row" style={{ alignItems: 'center' }}>
                  <input readOnly value={freshLink} onFocus={(e) => e.currentTarget.select()} />
                  <button
                    className="ghost sm"
                    onClick={() => {
                      navigator.clipboard?.writeText(freshLink);
                      push('success', 'Link copied');
                    }}
                  >
                    Copy
                  </button>
                </div>
              </div>
            )}

            <div className="row mt" style={{ alignItems: 'center' }}>
              <input
                style={{ width: 90 }}
                inputMode="numeric"
                value={extendDays}
                onChange={(e) => setExtendDays(e.target.value.replace(/\D/g, '').slice(0, 3))}
                aria-label="Days to add"
              />
              <span className="muted">more days</span>
              <button className="secondary sm" disabled={busy} onClick={extend}>Extend</button>
            </div>
            <p className="muted" style={{ fontSize: 12, margin: '6px 0 0' }}>
              Extending moves the deadline only — the link they already have keeps working.
            </p>
          </>
        )}
      </div>

      {divider}

      <div className="field">
        <label>Certificate</label>
        {r.credential_id ? (
          <div>
            <code style={{ fontSize: 13 }}>{r.credential_id}</code>{' '}
            {r.credential_revoked && <span className="badge archived">revoked</span>}
          </div>
        ) : (
          <p className="muted" style={{ margin: '0 0 8px', fontSize: 12.5 }}>
            No certificate yet. Passing the paper is the evidence — issuing is a separate,
            deliberate step.
          </p>
        )}
        <div className="row">
          {!r.credential_id && (
            <button className="secondary sm" disabled={busy} onClick={() => setConfirmIssue(true)}>
              Issue certificate
            </button>
          )}
          {r.credential_id && !r.credential_revoked && (
            <button className="danger sm" disabled={busy} onClick={() => setRevoking(true)}>
              Revoke certificate
            </button>
          )}
        </div>
      </div>

      {divider}

      <div className="field">
        <label>Refund</label>
        <p className="muted" style={{ margin: '0 0 8px', fontSize: 12.5 }}>
          This records the refund against the registration and closes it. The money itself is
          moved in the payment dashboard — do that first.
        </p>
        <button
          className="secondary sm"
          disabled={busy || !paid || r.status === 'refunded'}
          onClick={() => setConfirmRefund(true)}
        >
          {r.status === 'refunded' ? 'Already refunded' : 'Record refund'}
        </button>
      </div>

      {divider}

      <div className="field">
        <label>Internal notes</label>
        <textarea
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="e.g. Asked for a resit after a power cut, 12 Sep"
        />
      </div>
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button className="secondary sm" disabled={busy} onClick={saveNotes}>Save notes</button>
      </div>

      {divider}

      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button className="secondary" onClick={onClose}>Close</button>
      </div>

      {confirmIssue && (
        <Confirm
          title={`Issue a certificate to ${r.name}?`}
          message={
            sat
              ? `They scored ${Math.round((r.score_percent ?? 0) * 10) / 10}% against a ${r.pass_percent}% pass mark. This mints a credential id that anyone can verify publicly.`
              : 'They have not sat the paper. You can still issue a certificate, but there is no score behind it and it is publicly verifiable.'
          }
          confirmLabel="Issue"
          onConfirm={() => act('issue_certificate')}
          onCancel={() => setConfirmIssue(false)}
        />
      )}

      {confirmRefund && (
        <Confirm
          title={`Record a refund for ${r.name}?`}
          message={
            `This marks the ${rupees(r.amount_rupees)} registration refunded and ends their access to the paper. ` +
            'It does not return the money — refund it in the payment dashboard too.'
          }
          confirmLabel="Record refund"
          danger
          onConfirm={() => act('refund')}
          onCancel={() => setConfirmRefund(false)}
        />
      )}

      {/* Revoking is public and permanent-looking to anyone verifying the
          credential, so the reason is mandatory rather than a courtesy. */}
      {revoking && (
        <Modal title={`Revoke ${r.credential_id}`} onClose={() => setRevoking(false)}>
          <p className="mb">
            Verification of this certificate will start reporting it as revoked. Say why — it is
            kept on the record and is what you will be asked about later.
          </p>
          <div className="field">
            <label>Reason *</label>
            <textarea
              rows={3}
              autoFocus
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Impersonation confirmed by the integrity review, 14 Sep"
            />
          </div>
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button className="secondary" onClick={() => setRevoking(false)}>Cancel</button>
            <button
              className="danger"
              disabled={busy || !reason.trim()}
              onClick={() => act('revoke_certificate', reason.trim())}
            >
              Revoke
            </button>
          </div>
        </Modal>
      )}
    </Modal>
  );
};

export default RegistrationList;
