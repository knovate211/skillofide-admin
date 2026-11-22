import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../../components/Layout';
import Modal from '../../components/Modal';
import Confirm from '../../components/Confirm';
import { useToast } from '../../components/Toast';
import { listReferrers, updateReferrer, type Referrer } from '../../lib/api';
import { useUrlFilters } from '../../lib/useListState';

const PAGE_SIZE = 25;
const FILTER_KEYS = ['search'] as const;

const rupees = (n: number) => `₹${n.toLocaleString('en-IN')}`;
const day = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' }) : '—';

/**
 * Who is sending people our way.
 *
 * The money columns are the summary of their rewards — pending is what is still
 * to be decided, paid is what has left. The bank details live here rather than
 * on each reward because they belong to the person, and a payout run that
 * stalls usually stalls on a missing UPI id.
 */
const ReferrerList: React.FC = () => {
  const { push } = useToast();
  const { filters, page, active, setFilter, setPage, clear } = useUrlFilters(FILTER_KEYS);
  const [rows, setRows] = useState<Referrer[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<Referrer | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listReferrers(page, PAGE_SIZE, filters.search);
      setRows(res.referrers ?? []);
      setTotal(res.total);
    } catch (e: any) {
      push('error', e.message);
    } finally {
      setLoading(false);
    }
  }, [page, filters.search, push]);

  // Debounced: the search box calls this on every keystroke.
  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <Layout title="Referrers">
      <div className="filter-bar mb">
        <input
          className="filter-search"
          placeholder="Search name, email or code…"
          value={filters.search}
          onChange={(e) => setFilter('search', e.target.value)}
        />
        {active && <button className="ghost sm" onClick={clear}>Clear filters</button>}
        <span className="grow" />
        <span className="muted nowrap">{total} referrer{total === 1 ? '' : 's'}</span>
      </div>

      <div className="scroll-x">
        <table className="card">
          <thead>
            <tr>
              <th>Referrer</th><th>Code</th><th>Payout to</th>
              <th>Clicks</th><th>Conversions</th><th>Earned</th><th>Paid</th><th>Pending</th>
              <th>Since</th><th></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={10} className="muted">Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={10} className="muted">
                {active ? 'No referrers match this search.' : 'Nobody has joined the referral programme yet.'}
              </td></tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="clickable" onClick={() => setOpen(r)}>
                  <td>
                    {r.name}
                    <div className="muted" style={{ fontSize: 12 }}>{r.email}</div>
                    {r.is_blocked && (
                      <div style={{ marginTop: 4 }}><span className="badge archived">blocked</span></div>
                    )}
                  </td>
                  <td className="nowrap">
                    {/* Their code is the only way into their rewards, so it is
                        the link rather than the row. */}
                    <Link
                      className="btn-link"
                      to={`/referrals?code=${encodeURIComponent(r.code)}`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {r.code}
                    </Link>
                  </td>
                  <td className="nowrap">
                    {r.upi_id || <span className="muted">no UPI id</span>}
                    {r.pan && <div className="muted" style={{ fontSize: 12 }}>PAN {r.pan}</div>}
                  </td>
                  <td>{r.clicks.toLocaleString('en-IN')}</td>
                  <td>
                    {r.conversions}
                    {r.clicks > 0 && (
                      <span className="muted"> · {Math.round((r.conversions / r.clicks) * 100)}%</span>
                    )}
                  </td>
                  <td className="nowrap">{rupees(r.earned_rupees)}</td>
                  <td className="nowrap muted">{rupees(r.paid_rupees)}</td>
                  <td className="nowrap">
                    {r.pending_rupees > 0
                      ? <strong>{rupees(r.pending_rupees)}</strong>
                      : <span className="muted">—</span>}
                  </td>
                  <td className="muted nowrap">{day(r.created_at)}</td>
                  <td className="actions" onClick={(e) => e.stopPropagation()}>
                    <button className="ghost sm" onClick={() => setOpen(r)}>Edit</button>
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
        <ReferrerDrawer
          referrer={open}
          onClose={() => setOpen(null)}
          onChanged={load}
        />
      )}
    </Layout>
  );
};

const ReferrerDrawer: React.FC<{
  referrer: Referrer;
  onClose: () => void;
  onChanged: () => void;
}> = ({ referrer: r, onClose, onChanged }) => {
  const { push } = useToast();
  const [upi, setUpi] = useState(r.upi_id ?? '');
  const [pan, setPan] = useState(r.pan ?? '');
  const [notes, setNotes] = useState(r.notes ?? '');
  const [busy, setBusy] = useState(false);
  const [confirmBlock, setConfirmBlock] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await updateReferrer(r.id, { upi_id: upi.trim(), pan: pan.trim().toUpperCase(), notes });
      push('success', 'Details saved');
      onChanged();
    } catch (e: any) {
      push('error', e.message);
    } finally {
      setBusy(false);
    }
  };

  const setBlocked = async (blocked: boolean) => {
    setBusy(true);
    try {
      await updateReferrer(r.id, { is_blocked: blocked });
      push('success', blocked ? 'Referrer blocked' : 'Referrer unblocked');
      onChanged();
      onClose();
    } catch (e: any) {
      push('error', e.message);
    } finally {
      setBusy(false);
      setConfirmBlock(false);
    }
  };

  const Row = ({ label, value }: { label: string; value?: string | number | null }) =>
    value === null || value === undefined || value === '' ? null : (
      <div className="field"><label>{label}</label><div>{value}</div></div>
    );

  const divider = <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '16px 0' }} />;

  return (
    <Modal title={r.name} onClose={onClose} variant="drawer">
      {r.is_blocked && (
        <div className="card card-pad mb" style={{ borderColor: 'var(--danger)' }}>
          <strong style={{ color: 'var(--danger)' }}>This referrer is blocked.</strong>
          <p className="muted" style={{ margin: '6px 0 0', fontSize: 12.5 }}>
            Their code earns nothing on new purchases. Rewards they earned before the block are
            untouched — reject those individually if they should not be paid.
          </p>
        </div>
      )}

      <Row label="Email" value={r.email} />
      <Row label="Phone" value={r.phone} />
      <div className="field">
        <label>Code</label>
        <div>
          <Link className="btn-link" to={`/referrals?code=${encodeURIComponent(r.code)}`}>{r.code}</Link>
        </div>
      </div>
      <Row label="Joined" value={new Date(r.created_at).toLocaleString()} />
      <div className="field">
        <label>Performance</label>
        <div>
          {r.clicks.toLocaleString('en-IN')} click{r.clicks === 1 ? '' : 's'} ·{' '}
          {r.conversions} joined
          {r.clicks > 0 && <span className="muted"> ({Math.round((r.conversions / r.clicks) * 100)}%)</span>}
        </div>
      </div>
      <div className="field">
        <label>Rewards</label>
        <div>
          <strong>{rupees(r.earned_rupees)}</strong> earned ·{' '}
          {rupees(r.paid_rupees)} paid ·{' '}
          {rupees(r.pending_rupees)} still to pay
        </div>
      </div>

      {divider}

      {/* Without a UPI id the payout run cannot include them, so this is the
          field most worth filling in before the next one. */}
      <div className="field">
        <label>UPI id</label>
        <input
          value={upi}
          onChange={(e) => setUpi(e.target.value)}
          placeholder="e.g. name@okhdfcbank"
        />
        <p className="muted" style={{ fontSize: 12, margin: '4px 0 0' }}>
          Where their rewards are sent. A reward with no UPI id against it cannot be paid out.
        </p>
      </div>

      <div className="field">
        <label>PAN</label>
        <input
          value={pan}
          onChange={(e) => setPan(e.target.value.toUpperCase().slice(0, 10))}
          placeholder="ABCDE1234F"
        />
        <p className="muted" style={{ fontSize: 12, margin: '4px 0 0' }}>
          Needed once what they have earned crosses the threshold for tax to be deducted.
        </p>
      </div>

      <div className="field">
        <label>Internal notes</label>
        <textarea
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="e.g. Runs the Pune college group, asked to be paid monthly"
        />
      </div>
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button className="secondary sm" disabled={busy} onClick={save}>Save details</button>
      </div>

      {divider}

      <div className="row between" style={{ alignItems: 'center' }}>
        {r.is_blocked ? (
          <button className="secondary sm" disabled={busy} onClick={() => setBlocked(false)}>
            Unblock
          </button>
        ) : (
          <button className="danger sm" disabled={busy} onClick={() => setConfirmBlock(true)}>
            Block referrer
          </button>
        )}
        <button className="secondary" onClick={onClose}>Close</button>
      </div>

      {confirmBlock && (
        <Confirm
          title={`Block ${r.name}?`}
          message={
            `Their code ${r.code} stops earning on anything bought from now on. ` +
            `The ${rupees(r.pending_rupees)} they are already owed stays owed — reject those rewards separately if it should not be paid.`
          }
          confirmLabel="Block"
          danger
          onConfirm={() => setBlocked(true)}
          onCancel={() => setConfirmBlock(false)}
        />
      )}
    </Modal>
  );
};

export default ReferrerList;
