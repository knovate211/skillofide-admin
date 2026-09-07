import React, { useCallback, useEffect, useState } from 'react';
import Layout from '../../components/Layout';
import Modal from '../../components/Modal';
import Confirm from '../../components/Confirm';
import { useToast } from '../../components/Toast';
import TableState from '../../components/TableState';
import {
  deleteScholarship,
  enrolScholarshipApplicant,
  exportScholarshipsCsv,
  listScholarships,
  resendScholarshipLink,
  updateScholarship,
  type ScholarshipApplication,
  type ScholarshipFilters,
} from '../../lib/api';
import { COURSES } from '../../lib/courses';

// The funnel states are derived from the candidate's attempt and cannot be set
// by hand; only the two decision states can. Keeping them apart here mirrors
// what the backend will actually accept.
const FUNNEL_STATUSES = ['applied', 'invited', 'started', 'submitted', 'evaluated', 'expired'];
const DECISION_STATUSES = ['awarded', 'rejected'];

const badgeClass: Record<string, string> = {
  applied: 'draft',
  invited: 'draft',
  started: 'admin',
  submitted: 'published',
  evaluated: 'published',
  awarded: 'published',
  rejected: 'archived',
  expired: 'archived',
};

const PAGE_SIZE = 25;

const pct = (a: ScholarshipApplication) =>
  a.percentage == null ? null : Math.round(a.percentage * 10) / 10;

const ApplicationList: React.FC = () => {
  const { push } = useToast();
  const [rows, setRows] = useState<ScholarshipApplication[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<ScholarshipFilters>({});
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [open, setOpen] = useState<ScholarshipApplication | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listScholarships(page, PAGE_SIZE, filters);
      setRows(res.applications);
      setTotal(res.total);
    } catch (e: any) {
      push('error', e.message);
    } finally {
      setLoading(false);
    }
  }, [page, filters, push]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  const setFilter = (patch: Partial<ScholarshipFilters>) => {
    setPage(1);
    setFilters((f) => ({ ...f, ...patch }));
  };

  const doExport = async () => {
    setExporting(true);
    try {
      // Exports what the screen is filtered to, not just this page.
      await exportScholarshipsCsv(filters);
      push('success', 'CSV downloaded');
    } catch (e: any) {
      push('error', e.message);
    } finally {
      setExporting(false);
    }
  };

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <Layout
      title="Scholarship applications"
      actions={
        <button className="secondary" disabled={exporting || total === 0} onClick={doExport}>
          {exporting ? 'Exporting…' : 'Export CSV'}
        </button>
      }
    >
      <div className="row between mb">
        <div className="row">
          <input
            style={{ maxWidth: 240 }}
            placeholder="Search name or email…"
            value={filters.search ?? ''}
            onChange={(e) => setFilter({ search: e.target.value })}
          />
          <select style={{ width: 150 }} value={filters.status ?? ''} onChange={(e) => setFilter({ status: e.target.value })}>
            <option value="">All statuses</option>
            <optgroup label="Progress">
              {FUNNEL_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </optgroup>
            <optgroup label="Decision">
              {DECISION_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </optgroup>
          </select>
          <select style={{ width: 180 }} value={filters.courseId ?? ''} onChange={(e) => setFilter({ courseId: e.target.value })}>
            <option value="">All courses</option>
            {COURSES.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select style={{ width: 140 }} value={filters.minPercent ?? ''} onChange={(e) => setFilter({ minPercent: e.target.value })}>
            <option value="">Any score</option>
            <option value="80">80% and above</option>
            <option value="65">65% and above</option>
            <option value="50">50% and above</option>
          </select>
        </div>
        <span className="muted">{total} application{total === 1 ? '' : 's'}</span>
      </div>

      <div className="scroll-x">
        <table className="card">
          <thead>
            <tr>
              <th>Name</th><th>Email</th><th>Course</th><th>College</th>
              <th>Status</th><th>Score</th><th>Award</th><th>Applied</th><th></th>
            </tr>
          </thead>
          <tbody>
            {loading || rows.length === 0 ? (
              <TableState
                loading={loading}
                columns={9}
                title="No applications match these filters"
                hint="Clear a filter to widen the search."
              />
            ) : (
              rows.map((a) => {
                const p = pct(a);
                return (
                  <tr key={a.id} style={{ cursor: 'pointer' }} onClick={() => setOpen(a)}>
                    <td>{a.name}</td>
                    <td>{a.email}</td>
                    <td>{a.course_name}</td>
                    <td>{a.college || '—'}</td>
                    <td><span className={`badge ${badgeClass[a.status] || 'draft'}`}>{a.status}</span></td>
                    <td>
                      {p == null
                        ? <span className="muted">not sat</span>
                        : <>{a.score}/{a.max_score} <span className="muted">({p}%)</span></>}
                    </td>
                    <td>{a.award_percent == null ? '—' : `${a.award_percent}%`}</td>
                    <td className="muted">{new Date(a.created_at).toLocaleDateString()}</td>
                    <td className="actions">
                      <button className="ghost sm" onClick={(e) => { e.stopPropagation(); setOpen(a); }}>View</button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div className="row mt" style={{ justifyContent: 'center' }}>
          <button className="secondary sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</button>
          <span className="muted">Page {page} of {pages}</span>
          <button className="secondary sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Next</button>
        </div>
      )}

      {open && <ApplicationDrawer application={open} onClose={() => setOpen(null)} onChanged={load} />}
    </Layout>
  );
};

const ApplicationDrawer: React.FC<{
  application: ScholarshipApplication;
  onClose: () => void;
  onChanged: () => void;
}> = ({ application: a, onClose, onChanged }) => {
  const { push } = useToast();
  const [award, setAward] = useState<string>(a.award_percent == null ? '' : String(a.award_percent));
  const [notes, setNotes] = useState(a.notes);
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const [freshLink, setFreshLink] = useState('');
  const [sendError, setSendError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmEnrol, setConfirmEnrol] = useState(false);

  const p = pct(a);
  const sat = p != null;

  const resend = async () => {
    setResending(true);
    setSendError('');
    try {
      const res = await resendScholarshipLink(a.id);
      // A new link is always issued; whether the email carrying it left is a
      // separate fact, and the counsellor has to know which happened.
      setFreshLink(res.testUrl);
      if (res.success) {
        push('success', `New link emailed to ${res.email}`);
      } else {
        setSendError(res.emailError || 'The mail server refused the message.');
        push('error', `Link created, but the email did not send to ${res.email}`);
      }
      onChanged();
    } catch (e: any) {
      push('error', e.message);
    } finally {
      setResending(false);
    }
  };

  const decide = async (status: 'awarded' | 'rejected') => {
    setBusy(true);
    try {
      await updateScholarship(a.id, {
        status,
        award_percent: status === 'awarded' && award !== '' ? Number(award) : null,
        notes,
      });
      push('success', status === 'awarded' ? 'Scholarship awarded' : 'Application rejected');
      onChanged();
      onClose();
    } catch (e: any) {
      push('error', e.message);
    } finally {
      setBusy(false);
    }
  };

  const saveNotes = async () => {
    setBusy(true);
    try {
      await updateScholarship(a.id, { notes });
      push('success', 'Notes saved');
      onChanged();
    } catch (e: any) {
      push('error', e.message);
    } finally {
      setBusy(false);
    }
  };

  const enrol = async () => {
    setBusy(true);
    try {
      const res = await enrolScholarshipApplicant(a.id);
      push('success', `${res.email} enrolled on ${res.courseName}`);
      onChanged();
    } catch (e: any) {
      push('error', e.message);
    } finally {
      setBusy(false);
      setConfirmEnrol(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      const res = await deleteScholarship(a.id);
      push(
        'success',
        res.accountRemoved
          ? `Deleted ${res.email} and their account`
          : `Deleted the application for ${res.email}`,
      );
      onChanged();
      onClose();
    } catch (e: any) {
      push('error', e.message);
    } finally {
      setBusy(false);
      setConfirmDelete(false);
    }
  };

  const Row = ({ label, value }: { label: string; value?: string | number | null }) =>
    value === null || value === undefined || value === '' ? null : (
      <div className="field"><label>{label}</label><div>{value}</div></div>
    );

  return (
    <Modal title={a.name} onClose={onClose} variant="drawer">
      <Row label="Email" value={a.email} />
      <Row label="Phone" value={a.phone} />
      <Row label="Course" value={a.course_name} />
      <Row label="Qualification" value={a.qualification} />
      <Row label="College" value={a.college} />
      <Row label="Graduation year" value={a.graduation_year} />
      <Row label="City" value={a.city} />
      <div className="field">
        <label>Status</label>
        <div><span className={`badge ${badgeClass[a.status] || 'draft'}`}>{a.status}</span></div>
      </div>
      <div className="field">
        <label>Result</label>
        <div>
          {sat
            ? <>{a.score} / {a.max_score} <strong>({p}%)</strong></>
            : <span className="muted">Has not sat the test yet.</span>}
        </div>
      </div>
      <Row label="Applied" value={new Date(a.created_at).toLocaleString()} />

      <hr className="sep" />

      {/* The email is the only way into the test, so a bounced or deleted one
          would otherwise strand the candidate entirely. */}
      <div className="field">
        <label>Test link</label>
        {sat ? (
          <p className="muted" style={{ margin: 0 }}>
            Already sat the test — there is nothing left to send.
          </p>
        ) : (
          <>
            <div className="row">
              <button className="secondary sm" disabled={resending} onClick={resend}>
                {resending ? 'Sending…' : 'Resend test link'}
              </button>
            </div>
            <p className="muted" style={{ fontSize: 12, margin: '6px 0 0' }}>
              Emails a fresh link, valid for another 3 days. Any earlier link stops working.
            </p>
            {sendError && (
              <p style={{ margin: '8px 0 0', fontSize: 12.5, color: 'var(--danger)' }}>
                <strong>The email did not send.</strong> {sendError}
                <br />
                The link below is still valid — send it to them another way.
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
          </>
        )}
      </div>

      <hr className="sep" />

      <div className="field">
        <label>Internal notes</label>
        <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Called 20 Aug, joining the Sept batch" />
      </div>
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button className="secondary sm" disabled={busy} onClick={saveNotes}>Save notes</button>
      </div>

      <hr className="sep" />

      <div className="field">
        <label>Award decision</label>
        {!sat && (
          <p className="muted" style={{ margin: '0 0 8px' }}>
            This candidate has not sat the test. You can still record a decision, but there is no
            score behind it.
          </p>
        )}
        <div className="row">
          <input
            style={{ width: 110 }}
            inputMode="numeric"
            placeholder="Award %"
            value={award}
            onChange={(e) => setAward(e.target.value.replace(/\D/g, '').slice(0, 3))}
          />
          <button disabled={busy} onClick={() => decide('awarded')}>Award</button>
          <button className="secondary" disabled={busy} onClick={() => decide('rejected')}>Reject</button>
        </div>
      </div>

      <hr className="sep" />

      {/* An applicant is not a student. This is where that changes, and it is a
          button somebody presses once the fee is settled — not something the
          test result does on its own. */}
      <div className="field">
        <label>Enrolment</label>
        <p className="muted" style={{ margin: '0 0 8px', fontSize: 12.5 }}>
          Applying does not create a student. Enrol them once they have passed
          <strong> and paid</strong> — this grants the course and puts them in Users.
        </p>
        <button className="secondary sm" disabled={busy} onClick={() => setConfirmEnrol(true)}>
          Enrol as student
        </button>
      </div>

      <hr className="sep" />

      <div className="row between" style={{ alignItems: 'center' }}>
        <button className="danger sm" disabled={busy} onClick={() => setConfirmDelete(true)}>
          Delete application
        </button>
        <button className="secondary" onClick={onClose}>Close</button>
      </div>

      {confirmEnrol && (
        <Confirm
          title={`Enrol ${a.name}?`}
          message={
            `This makes ${a.email} a student and grants them ${a.course_name}. ` +
            `Only do this once their fee is settled — enrolment is not automatic on passing.`
          }
          confirmLabel="Enrol"
          onConfirm={enrol}
          onCancel={() => setConfirmEnrol(false)}
        />
      )}

      {confirmDelete && (
        <Confirm
          title={`Delete ${a.name}?`}
          message={
            `This removes the application for ${a.email}, their invitation, and any attempt at this paper. ` +
            `Their account goes too, unless it has courses or other applications. This cannot be undone.`
          }
          confirmLabel="Delete"
          danger
          onConfirm={remove}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </Modal>
  );
};

export default ApplicationList;
