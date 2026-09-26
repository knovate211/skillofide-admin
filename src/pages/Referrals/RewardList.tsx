import React, { useCallback, useEffect, useState } from 'react';
import Layout from '../../components/Layout';
import Modal from '../../components/Modal';
import Confirm from '../../components/Confirm';
import { useToast } from '../../components/Toast';
import {
  bulkReferrals,
  exportReferralsCsv,
  listReferrals,
  updateReferral,
  type Referral,
  type ReferralFilters,
} from '../../lib/api';
import { useSelection, useUrlFilters } from '../../lib/useListState';

const PAGE_SIZE = 25;
const FILTER_KEYS = ['status', 'kind', 'code', 'flagged', 'search'] as const;

// The life of a reward: earned → owed → sent. 'rejected' and 'reversed' are the
// two ways it stops, and they are kept apart from the run because neither is
// somewhere a reward gets to on its own.
const STATUSES = ['pending', 'approved', 'paid', 'rejected', 'reversed'];

const badgeClass: Record<string, string> = {
  pending: 'draft',
  approved: 'student',
  paid: 'published',
  rejected: 'archived',
  reversed: 'archived',
};

const rupees = (n: number) => `₹${n.toLocaleString('en-IN')}`;
const day = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' }) : '—';

/**
 * Every reward somebody has earned by referring a friend.
 *
 * This is the screen the weekly payout run happens on, so the two things that
 * make it slow are handled up front: the figure actually owed sits at the top
 * (across the whole filter, not this page), and approving or paying works over
 * a selection. Flagged rows are tinted because they are the ones where the
 * backend has already found a reason to doubt the referral — paying one of
 * those by reflex is the mistake this screen exists to prevent.
 */
const RewardList: React.FC = () => {
  const { push } = useToast();
  const { filters, page, active, setFilter, setPage, clear } = useUrlFilters(FILTER_KEYS);
  const sel = useSelection(JSON.stringify(filters)); // paging keeps the selection, a filter change clears it
  const [rows, setRows] = useState<Referral[]>([]);
  const [total, setTotal] = useState(0);
  const [owed, setOwed] = useState(0);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [busy, setBusy] = useState(false);
  // One prompt drives both the row buttons and the bulk bar: rejecting needs a
  // reason and paying needs a reference, whether it is one reward or forty.
  const [prompt, setPrompt] = useState<{ action: 'reject' | 'pay'; ids: string[] } | null>(null);
  const [confirmApprove, setConfirmApprove] = useState<string[] | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listReferrals(page, PAGE_SIZE, filters as ReferralFilters);
      setRows(res.referrals ?? []);
      setTotal(res.total);
      setOwed(res.owedRupees ?? 0);
    } catch (e: any) {
      push('error', e.message);
    } finally {
      setLoading(false);
    }
  }, [page, filters, push]);

  // Debounced: the search box calls this on every keystroke.
  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  const reload = () => { sel.clear(); void load(); };

  const doExport = async () => {
    setExporting(true);
    try {
      // Exports what the screen is filtered to, not just this page.
      await exportReferralsCsv(filters as ReferralFilters);
      push('success', 'CSV downloaded');
    } catch (e: any) {
      push('error', e.message);
    } finally {
      setExporting(false);
    }
  };

  // One reward or many, the wording afterwards is the same; the single-row path
  // just goes through the endpoint that does not need a list.
  const run = async (
    ids: string[],
    action: 'approve' | 'reject' | 'pay',
    opts: { reason?: string; payout_ref?: string } = {},
  ) => {
    setBusy(true);
    try {
      let done = ids.length;
      if (ids.length === 1) await updateReferral(ids[0], { action, ...opts });
      else done = (await bulkReferrals(ids, action, opts)).updated;
      const verb = action === 'approve' ? 'Approved' : action === 'pay' ? 'Marked paid' : 'Rejected';
      push('success', `${verb} ${done} reward${done === 1 ? '' : 's'}`);
      setPrompt(null);
      setConfirmApprove(null);
      reload();
    } catch (e: any) {
      // The backend refuses an out-of-order move (paying something unapproved,
      // say) and says which — worth showing verbatim.
      push('error', e.message);
    } finally {
      setBusy(false);
    }
  };

  const reopen = async (r: Referral) => {
    setBusy(true);
    try {
      await updateReferral(r.id, { action: 'reopen' });
      push('success', 'Back to pending');
      reload();
    } catch (e: any) {
      push('error', e.message);
    } finally {
      setBusy(false);
    }
  };

  const pageIds = rows.map((r) => r.id);
  const allOnPage = pageIds.length > 0 && pageIds.every((id) => sel.has(id));
  const selected = rows.filter((r) => sel.has(r.id));
  const selectedIds = [...sel.ids];
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const flagged = rows.filter((r) => r.flags).length;
  // What the selection can actually do — the backend only approves a pending
  // reward and only pays an approved one, so a button that cannot work is not
  // offered at all.
  const canApprove = selected.some((r) => r.status === 'pending');
  const canPay = selected.some((r) => r.status === 'approved');
  const flaggedSelected = selected.filter((r) => r.flags).length;

  return (
    <Layout
      title="Referral rewards"
      actions={
        <button className="secondary" disabled={exporting || total === 0} onClick={doExport}>
          {exporting ? 'Exporting…' : 'Export payout CSV'}
        </button>
      }
    >
      {/* The number the payout run is really about. It covers everything the
          filters match, so it does not shrink as you page through. */}
      <div className="card card-pad mb row between" style={{ alignItems: 'center' }}>
        <div>
          <div className="muted small" style={{ textTransform: 'uppercase', letterSpacing: '.04em' }}>
            Owed right now
          </div>
          <div style={{ fontSize: 30, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
            {rupees(owed)}
          </div>
          <div className="muted small">
            Approved but not yet sent{active ? ', within the current filters' : ''}.
          </div>
        </div>
        <button
          className="secondary sm"
          onClick={() => setFilter('status', filters.status === 'approved' ? '' : 'approved')}
        >
          {filters.status === 'approved' ? 'Show all statuses' : 'Show what is owed'}
        </button>
      </div>

      <div className="filter-bar mb">
        <input
          className="filter-search"
          placeholder="Search referrer, friend or code…"
          value={filters.search}
          onChange={(e) => setFilter('search', e.target.value)}
        />
        <select value={filters.status} onChange={(e) => setFilter('status', e.target.value)}>
          <option value="">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={filters.kind} onChange={(e) => setFilter('kind', e.target.value)}>
          <option value="">Courses and certifications</option>
          <option value="course">Courses</option>
          <option value="certification">Certifications</option>
        </select>
        <label className="row small">
          <input
            type="checkbox"
            checked={filters.flagged === 'true'}
            onChange={(e) => setFilter('flagged', e.target.checked ? 'true' : '')}
          />
          {' '}Flagged only
        </label>
        {filters.code && (
          <span className="chip">
            code {filters.code}
            <button onClick={() => setFilter('code', '')} aria-label="Clear code filter">✕</button>
          </span>
        )}
        {active && <button className="ghost sm" onClick={clear}>Clear filters</button>}
        <span className="grow" />
        <span className="muted nowrap">{total} reward{total === 1 ? '' : 's'}</span>
      </div>

      {flagged > 0 && filters.flagged !== 'true' && (
        <p className="mb" style={{ color: 'var(--danger)', fontSize: 13 }}>
          <strong>{flagged} on this page {flagged === 1 ? 'is' : 'are'} flagged.</strong>{' '}
          Read the flag before approving — it is the last check before money moves.
        </p>
      )}

      {selectedIds.length > 0 && (
        <div className="bulk-bar mb">
          <strong>{selectedIds.length} selected</strong>
          {flaggedSelected > 0 && (
            <span style={{ color: 'var(--danger)', fontWeight: 600 }}>
              {flaggedSelected} flagged
            </span>
          )}
          <span className="grow" />
          {canApprove && (
            <button className="sm" disabled={busy} onClick={() => setConfirmApprove(selectedIds)}>
              Approve
            </button>
          )}
          {canPay && (
            <button className="sm" disabled={busy} onClick={() => setPrompt({ action: 'pay', ids: selectedIds })}>
              Mark paid
            </button>
          )}
          <button
            className="secondary sm"
            disabled={busy}
            onClick={() => setPrompt({ action: 'reject', ids: selectedIds })}
          >
            Reject
          </button>
          <button className="ghost sm" onClick={sel.clear}>Clear selection</button>
        </div>
      )}

      <div className="scroll-x">
        <table className="card">
          <thead>
            <tr>
              <th style={{ width: 32 }}>
                <input
                  type="checkbox"
                  checked={allOnPage}
                  onChange={() => sel.togglePage(pageIds)}
                  aria-label="Select all on this page"
                />
              </th>
              <th>Referrer</th><th>Friend</th><th>Bought</th>
              <th>Order</th><th>Reward</th><th>Status</th><th>Earned</th><th></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} className="muted">Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={9} className="muted">
                {active ? 'No rewards match these filters.' : 'Nobody has earned a reward yet.'}
              </td></tr>
            ) : (
              rows.map((r) => (
                <tr
                  key={r.id}
                  className={sel.has(r.id) ? 'selected' : ''}
                  // A flag is the one thing on this row that has to survive a
                  // skim, so it colours the whole row rather than a cell.
                  style={r.flags && !sel.has(r.id) ? { background: 'var(--danger-bg)' } : undefined}
                >
                  <td>
                    <input
                      type="checkbox"
                      checked={sel.has(r.id)}
                      onChange={() => sel.toggle(r.id)}
                      aria-label={`Select reward for ${r.referrer_name}`}
                    />
                  </td>
                  <td>
                    {r.referrer_name}
                    <div className="muted" style={{ fontSize: 12 }}>
                      {r.code}
                      {r.referrer_upi
                        ? ` · ${r.referrer_upi}`
                        : ' · no UPI on file'}
                    </div>
                  </td>
                  <td>
                    {r.friend_name || <span className="muted">—</span>}
                    <div className="muted" style={{ fontSize: 12 }}>{r.friend_email}</div>
                  </td>
                  <td>
                    {r.item_name}
                    <div className="muted" style={{ fontSize: 12 }}>{r.kind}</div>
                  </td>
                  <td className="nowrap">
                    {rupees(r.order_rupees)}
                    {r.discount_rupees > 0 && (
                      <div className="muted" style={{ fontSize: 12 }}>
                        −{rupees(r.discount_rupees)} friend
                      </div>
                    )}
                  </td>
                  <td className="nowrap"><strong>{rupees(r.reward_rupees)}</strong></td>
                  <td>
                    <span className={`badge ${badgeClass[r.status] || 'draft'}`}>{r.status}</span>
                    {r.flags && (
                      <div style={{ marginTop: 4, fontSize: 12, color: 'var(--danger)' }}>{r.flags}</div>
                    )}
                    {r.reason && (
                      <div className="muted" style={{ marginTop: 4, fontSize: 12 }}>{r.reason}</div>
                    )}
                    {r.payout_ref && (
                      <div className="muted" style={{ marginTop: 4, fontSize: 12 }}>ref {r.payout_ref}</div>
                    )}
                  </td>
                  <td className="muted nowrap">{day(r.created_at)}</td>
                  <td className="actions">
                    {r.status === 'pending' && (
                      <button className="ghost sm" disabled={busy} onClick={() => setConfirmApprove([r.id])}>
                        Approve
                      </button>
                    )}
                    {r.status === 'approved' && (
                      <button className="ghost sm" disabled={busy} onClick={() => setPrompt({ action: 'pay', ids: [r.id] })}>
                        Pay
                      </button>
                    )}
                    {(r.status === 'pending' || r.status === 'approved') && (
                      <button
                        className="ghost sm danger-text"
                        disabled={busy}
                        onClick={() => setPrompt({ action: 'reject', ids: [r.id] })}
                      >
                        Reject
                      </button>
                    )}
                    {(r.status === 'rejected' || r.status === 'reversed') && (
                      <button className="ghost sm" disabled={busy} onClick={() => reopen(r)}>
                        Reopen
                      </button>
                    )}
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

      {confirmApprove && (
        <Confirm
          title={`Approve ${confirmApprove.length} reward${confirmApprove.length === 1 ? '' : 's'}?`}
          message={
            `Approving makes ${confirmApprove.length === 1 ? 'this reward' : 'these rewards'} owed — it adds to the payout figure at the top. ` +
            'The money moves when you mark it paid, not now. Anything already approved or paid is left alone.'
          }
          confirmLabel="Approve"
          onConfirm={() => run(confirmApprove, 'approve')}
          onCancel={() => setConfirmApprove(null)}
        />
      )}

      {prompt && (
        <ActionPrompt
          action={prompt.action}
          count={prompt.ids.length}
          busy={busy}
          onCancel={() => setPrompt(null)}
          onSubmit={(value) =>
            run(
              prompt.ids,
              prompt.action,
              prompt.action === 'reject' ? { reason: value } : { payout_ref: value },
            )
          }
        />
      )}
    </Layout>
  );
};

/**
 * Asks for the one thing the action cannot be recorded without.
 *
 * Rejecting without a reason and paying without a reference are both refused by
 * the backend, and for the same reason: months later somebody asks why this
 * person was not paid, or where the money went, and the row has to answer.
 */
const ActionPrompt: React.FC<{
  action: 'reject' | 'pay';
  count: number;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (value: string) => void;
}> = ({ action, count, busy, onCancel, onSubmit }) => {
  const [value, setValue] = useState('');
  const many = count !== 1;
  const reject = action === 'reject';

  return (
    <Modal
      title={reject
        ? `Reject ${count} reward${many ? 's' : ''}`
        : `Mark ${count} reward${many ? 's' : ''} paid`}
      onClose={onCancel}
    >
      <p className="mb">
        {reject
          ? 'The referrer is not paid for this. Say why — it is kept on the reward and is what you will be asked about later.'
          : `This records that the money has already been sent${many ? ' — one reference covers the whole batch, so use it for a single transfer' : ''}. It does not send anything itself.`}
      </p>
      <div className="field">
        <label>{reject ? 'Reason *' : 'Payout reference *'}</label>
        {reject ? (
          <textarea
            rows={3}
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="e.g. Same device and card as the referrer — self-referral"
          />
        ) : (
          <input
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="e.g. UTR 328941022714"
          />
        )}
        {!reject && (
          <p className="muted" style={{ fontSize: 12, margin: '4px 0 0' }}>
            The UTR or transaction id from the bank, so a query about this payment can be traced.
          </p>
        )}
      </div>
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button className="secondary" onClick={onCancel}>Cancel</button>
        <button
          className={reject ? 'danger' : ''}
          disabled={busy || !value.trim()}
          onClick={() => onSubmit(value.trim())}
        >
          {busy ? 'Saving…' : reject ? 'Reject' : 'Mark paid'}
        </button>
      </div>
    </Modal>
  );
};

export default RewardList;
