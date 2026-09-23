import React, { useCallback, useEffect, useState } from 'react';
import Layout from '../../components/Layout';
import Modal from '../../components/Modal';
import Confirm from '../../components/Confirm';
import TypeConfirm from '../../components/TypeConfirm';
import SelectionBar from '../../components/SelectionBar';
import { useToast } from '../../components/Toast';
import {
  bulkDeleteScholarships,
  getScholarshipFacets,
  type BulkTarget,
  type Facet,
  deleteScholarship,
  enrolScholarshipApplicant,
  exportScholarshipsCsv,
  listScholarships,
  resendScholarshipLink,
  updateScholarship,
  type ScholarshipApplication,
  type ScholarshipFilters,
} from '../../lib/api';
import { useSelection, useUrlFilters } from '../../lib/useListState';

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
const FILTER_KEYS = ['search', 'status', 'courseId', 'minPercent', 'from', 'to'] as const;
const withCount = (f: Facet) => `${f.label || f.value} (${f.count})`;

const pct = (a: ScholarshipApplication) =>
  a.percentage == null ? null : Math.round(a.percentage * 10) / 10;

const ApplicationList: React.FC = () => {
  const { push } = useToast();
  const { filters, page, active, setFilter, setPage, clear } = useUrlFilters(FILTER_KEYS);
  const sel = useSelection(JSON.stringify(filters)); // string key: paging keeps the selection, a filter change clears it
  const [rows, setRows] = useState<ScholarshipApplication[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [open, setOpen] = useState<ScholarshipApplication | null>(null);
  const [facets, setFacets] = useState<{ status: Facet[]; course: Facet[] }>({ status: [], course: [] });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deletingOne, setDeletingOne] = useState<ScholarshipApplication | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listScholarships(page, PAGE_SIZE, filters as ScholarshipFilters);
      setRows(res.applications);
      setTotal(res.total);
    } catch (e: any) {
      push('error', e.message);
    } finally {
      setLoading(false);
    }
  }, [page, filters, push]);

  const loadFacets = useCallback(() => {
    getScholarshipFacets().then(setFacets).catch(() => undefined);
  }, []);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);
  useEffect(loadFacets, [loadFacets]);

  const reload = () => { sel.clear(); load(); loadFacets(); };

  const doExport = async () => {
    setExporting(true);
    try {
      // Exports what the screen is filtered to, not just this page.
      await exportScholarshipsCsv(filters as ScholarshipFilters);
      push('success', 'CSV downloaded');
    } catch (e: any) {
      push('error', e.message);
    } finally {
      setExporting(false);
    }
  };

  const selectedCount = sel.allMatching ? total : sel.ids.size;
  const target = (): BulkTarget =>
    sel.allMatching ? { allMatching: true, filters, expected: total } : { ids: [...sel.ids] };

  const deleteBulk = async () => {
    try {
      const r = await bulkDeleteScholarships(target());
      push('success', `Deleted ${r.affected} application${r.affected === 1 ? '' : 's'}`);
      setConfirmDelete(false);
      reload();
    } catch (e: any) {
      push('error', e.message);
    }
  };

  const deleteOne = async () => {
    if (!deletingOne) return;
    try {
      const r = await deleteScholarship(deletingOne.id);
      push('success', r.accountRemoved
        ? `Deleted ${r.email}'s application and their unused applicant account`
        : `Deleted ${r.email}'s application`);
      setDeletingOne(null);
      reload();
    } catch (e: any) {
      push('error', e.message);
    }
  };

  // Funnel statuses first, then decisions, each only if something has it.
  const statusFacet = (list: string[]) => facets.status.filter((f) => list.includes(f.value));
  const pageIds = rows.map((r) => r.id);
  const allOnPage = pageIds.length > 0 && pageIds.every((id) => sel.has(id));
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
      <div className="filter-bar mb">
        <input
          className="filter-search"
          placeholder="Search name or email…"
          value={filters.search}
          onChange={(e) => setFilter('search', e.target.value)}
        />
        <select value={filters.status} onChange={(e) => setFilter('status', e.target.value)}>
          <option value="">All statuses</option>
          {statusFacet(FUNNEL_STATUSES).length > 0 && (
            <optgroup label="Progress">
              {statusFacet(FUNNEL_STATUSES).map((f) => <option key={f.value} value={f.value}>{withCount(f)}</option>)}
            </optgroup>
          )}
          {statusFacet(DECISION_STATUSES).length > 0 && (
            <optgroup label="Decision">
              {statusFacet(DECISION_STATUSES).map((f) => <option key={f.value} value={f.value}>{withCount(f)}</option>)}
            </optgroup>
          )}
        </select>
        <select value={filters.courseId} onChange={(e) => setFilter('courseId', e.target.value)}>
          <option value="">All courses</option>
          {facets.course.map((f) => <option key={f.value} value={f.value}>{withCount(f)}</option>)}
        </select>
        <select value={filters.minPercent} onChange={(e) => setFilter('minPercent', e.target.value)}>
          <option value="">Any score</option>
          <option value="80">80% and above</option>
          <option value="65">65% and above</option>
          <option value="50">50% and above</option>
        </select>
        <div className="date-range">
          <span className="muted small">Applied</span>
          <input type="date" value={filters.from} max={filters.to || undefined} onChange={(e) => setFilter('from', e.target.value)} aria-label="From date" />
          <span className="muted">–</span>
          <input type="date" value={filters.to} min={filters.from || undefined} onChange={(e) => setFilter('to', e.target.value)} aria-label="To date" />
        </div>
        {active && <button className="ghost sm" onClick={clear}>Clear filters</button>}
        <span className="grow" />
        <span className="muted nowrap">{total} application{total === 1 ? '' : 's'}</span>
        {total > 0 && selectedCount === 0 && (
          <button className="ghost sm" onClick={() => sel.setAllMatching(true)}>Select all {total}</button>
        )}
      </div>

      {selectedCount > 0 && (
        <SelectionBar
          count={selectedCount}
          total={total}
          pageSize={PAGE_SIZE}
          allOnPage={allOnPage}
          allMatching={sel.allMatching}
          noun={active ? 'matching applications' : 'applications'}
          onSelectAll={() => sel.setAllMatching(true)}
          onClear={sel.clear}
        >
          <button className="danger sm" onClick={() => setConfirmDelete(true)}>Delete {selectedCount}</button>
        </SelectionBar>
      )}

      <div className="scroll-x">
        <table className="card">
          <thead>
            <tr>
              <th style={{ width: 32 }}>
                <input type="checkbox" checked={allOnPage} onChange={() => sel.togglePage(pageIds)} aria-label="Select all on this page" />
              </th>
              <th>Name</th><th>Email</th><th>Course</th><th>College</th>
              <th>Status</th><th>Score</th><th>Award</th><th>Applied</th><th></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={10} className="muted">Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={10} className="muted">{active ? 'No applications match these filters.' : 'No applications yet.'}</td></tr>
            ) : (
              rows.map((a) => {
                const p = pct(a);
                return (
                  <tr key={a.id} className={`clickable${sel.has(a.id) ? ' selected' : ''}`} onClick={() => setOpen(a)}>
                    <td onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={sel.has(a.id)} onChange={() => sel.toggle(a.id)} aria-label={`Select ${a.email}`} />
                    </td>
                    <td>{a.name}</td>
                    <td>{a.email}</td>
                    <td>{a.course_name}</td>
                    <td>{a.college || '—'}</td>
                    <td><span className={`badge ${badgeClass[a.status] || 'draft'}`}>{a.status}</span></td>
                    <td className="nowrap">
                      {p == null
                        ? <span className="muted">not sat</span>
                        : <>{a.score}/{a.max_score} <span className="muted">({p}%)</span></>}
                    </td>
                    <td>{a.award_percent == null ? '—' : `${a.award_percent}%`}</td>
                    <td className="muted nowrap">{new Date(a.created_at).toLocaleDateString(undefined, { dateStyle: 'medium' })}</td>
                    <td className="actions" onClick={(e) => e.stopPropagation()}>
                      <button className="ghost sm" onClick={() => setOpen(a)}>View</button>
                      <button className="ghost sm danger-text" onClick={() => setDeletingOne(a)}>Delete</button>
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
          <button className="secondary sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Prev</button>
          <span className="muted">Page {page} of {pages}</span>
          <button className="secondary sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</button>
        </div>
      )}

      {open && <ApplicationDrawer application={open} onClose={() => setOpen(null)} onChanged={reload} />}
      {deletingOne && (
        <Confirm
          title="Delete application"
          message={`Permanently delete ${deletingOne.name}'s application (${deletingOne.email})? Their test invite and attempts are removed too, along with the applicant account if nothing else uses it. This cannot be undone.`}
          confirmLabel="Delete"
          danger
          onConfirm={deleteOne}
          onCancel={() => setDeletingOne(null)}
        />
      )}
      {confirmDelete && (
        <TypeConfirm
          title={`Delete ${selectedCount} application${selectedCount === 1 ? '' : 's'}`}
          message={
            <>
              {sel.allMatching
                ? <>This deletes <strong>every application {active ? 'matching the current filters' : 'in the list'}</strong> ({selectedCount}), including ones on other pages.</>
                : <>This permanently deletes the {selectedCount} selected application{selectedCount === 1 ? '' : 's'}.</>}
              {' '}Their test invites and attempts are removed too, along with any applicant account nothing else uses. It cannot be undone.
            </>
          }
          confirmLabel="Delete"
          onConfirm={deleteBulk}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
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

      <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '16px 0' }} />

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

      <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '16px 0' }} />

      <div className="field">
        <label>Internal notes</label>
        <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Called 20 Aug, joining the Sept batch" />
      </div>
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button className="secondary sm" disabled={busy} onClick={saveNotes}>Save notes</button>
      </div>

      <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '16px 0' }} />

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

      <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '16px 0' }} />

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

      <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '16px 0' }} />

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
