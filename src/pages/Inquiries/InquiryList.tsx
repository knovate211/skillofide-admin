import React, { useCallback, useEffect, useState } from 'react';
import Layout from '../../components/Layout';
import Modal from '../../components/Modal';
import Confirm from '../../components/Confirm';
import TypeConfirm from '../../components/TypeConfirm';
import SelectionBar from '../../components/SelectionBar';
import { useToast } from '../../components/Toast';
import {
  listInquiries,
  updateInquiry,
  getInquiryFacets,
  bulkInquiries,
  exportInquiriesCsv,
  type Facet,
  type Inquiry,
  type BulkTarget,
} from '../../lib/api';
import { useSelection, useUrlFilters } from '../../lib/useListState';

const STATUSES = ['new', 'contacted', 'closed', 'spam'];
const badgeClass: Record<string, string> = {
  new: 'published', contacted: 'draft', closed: 'admin', spam: 'archived',
};
const PAGE_SIZE = 25;
const FILTER_KEYS = ['search', 'status', 'source', 'interest', 'from', 'to'] as const;

const withCount = (f: Facet) => `${f.label || f.value} (${f.count})`;

const InquiryList: React.FC = () => {
  const { push } = useToast();
  const { filters, page, active, setFilter, setPage, clear } = useUrlFilters(FILTER_KEYS);
  const sel = useSelection(JSON.stringify(filters)); // string key: paging keeps the selection, a filter change clears it
  const [rows, setRows] = useState<Inquiry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<Inquiry | null>(null);
  const [facets, setFacets] = useState<{ status: Facet[]; source: Facet[]; interest: Facet[] }>({ status: [], source: [], interest: [] });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deletingOne, setDeletingOne] = useState<Inquiry | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listInquiries(page, PAGE_SIZE, filters);
      setRows(res.inquiries);
      setTotal(res.total);
    } catch (e: any) {
      push('error', e.message);
    } finally {
      setLoading(false);
    }
  }, [page, filters, push]);

  const loadFacets = useCallback(() => {
    getInquiryFacets().then(setFacets).catch(() => undefined);
  }, []);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);
  useEffect(loadFacets, [loadFacets]);

  const reload = () => { sel.clear(); load(); loadFacets(); };

  const target = (): BulkTarget =>
    sel.allMatching ? { allMatching: true, filters, expected: total } : { ids: [...sel.ids] };
  const selectedCount = sel.allMatching ? total : sel.ids.size;

  const setStatusBulk = async (status: string) => {
    if (!status) return;
    try {
      const r = await bulkInquiries(target(), 'status', status);
      push('success', `Marked ${r.affected} as ${status}`);
      reload();
    } catch (e: any) {
      push('error', e.message);
    }
  };

  const deleteBulk = async () => {
    try {
      const r = await bulkInquiries(target(), 'delete');
      push('success', `Deleted ${r.affected} enquir${r.affected === 1 ? 'y' : 'ies'}`);
      setConfirmDelete(false);
      reload();
    } catch (e: any) {
      push('error', e.message);
    }
  };

  const deleteOne = async () => {
    if (!deletingOne) return;
    try {
      await bulkInquiries({ ids: [deletingOne.id] }, 'delete');
      push('success', `Deleted the enquiry from ${deletingOne.name}`);
      setDeletingOne(null);
      setOpen(null);
      reload();
    } catch (e: any) {
      push('error', e.message);
    }
  };

  const doExport = async () => {
    try {
      await exportInquiriesCsv(filters);
    } catch (e: any) {
      push('error', e.message);
    }
  };

  const pageIds = rows.map((r) => r.id);
  const allOnPage = pageIds.length > 0 && pageIds.every((id) => sel.has(id));
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <Layout
      title="Enquiries"
      actions={<button className="secondary" disabled={total === 0} onClick={doExport}>Export CSV</button>}
    >
      <div className="filter-bar mb">
        <input
          className="filter-search"
          placeholder="Search name, email or phone…"
          value={filters.search}
          onChange={(e) => setFilter('search', e.target.value)}
        />
        <select value={filters.status} onChange={(e) => setFilter('status', e.target.value)}>
          <option value="">All statuses</option>
          {facets.status.map((f) => <option key={f.value} value={f.value}>{withCount(f)}</option>)}
        </select>
        <select value={filters.source} onChange={(e) => setFilter('source', e.target.value)}>
          <option value="">All sources</option>
          {facets.source.map((f) => <option key={f.value} value={f.value}>{withCount(f)}</option>)}
        </select>
        <select value={filters.interest} onChange={(e) => setFilter('interest', e.target.value)}>
          <option value="">All interests</option>
          {facets.interest.map((f) => <option key={f.value} value={f.value}>{withCount(f)}</option>)}
        </select>
        <div className="date-range">
          <span className="muted small">Received</span>
          <input type="date" value={filters.from} max={filters.to || undefined} onChange={(e) => setFilter('from', e.target.value)} aria-label="From date" />
          <span className="muted">–</span>
          <input type="date" value={filters.to} min={filters.from || undefined} onChange={(e) => setFilter('to', e.target.value)} aria-label="To date" />
        </div>
        {active && <button className="ghost sm" onClick={clear}>Clear filters</button>}
        <span className="grow" />
        <span className="muted nowrap">{total} enquir{total === 1 ? 'y' : 'ies'}</span>
        {total > 0 && selectedCount === 0 && (
          <button className="ghost sm" onClick={() => sel.setAllMatching(true)}>
            Select all {total}
          </button>
        )}
      </div>

      {selectedCount > 0 && (
        <SelectionBar
          count={selectedCount}
          total={total}
          pageSize={PAGE_SIZE}
          allOnPage={allOnPage}
          allMatching={sel.allMatching}
          noun={active ? 'matching enquiries' : 'enquiries'}
          onSelectAll={() => sel.setAllMatching(true)}
          onClear={sel.clear}
        >
          <select value="" onChange={(e) => setStatusBulk(e.target.value)} style={{ width: 'auto' }}>
            <option value="">Mark as…</option>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
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
              <th>Name</th><th>Email</th><th>Phone</th><th>Interest</th><th>Source</th><th>Status</th><th>Received</th><th></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} className="muted">Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={9} className="muted">{active ? 'No enquiries match these filters.' : 'No enquiries yet.'}</td></tr>
            ) : (
              rows.map((q) => (
                <tr key={q.id} className={`clickable${sel.has(q.id) ? ' selected' : ''}`} onClick={() => setOpen(q)}>
                  <td onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={sel.has(q.id)} onChange={() => sel.toggle(q.id)} aria-label={`Select ${q.email}`} />
                  </td>
                  <td>{q.name}</td>
                  <td>{q.email}</td>
                  <td className="nowrap">{q.phone || '—'}</td>
                  <td>{q.interest || '—'}</td>
                  <td><span className="chip">{q.source}</span></td>
                  <td><span className={`badge ${badgeClass[q.status] || 'draft'}`}>{q.status}</span></td>
                  <td className="muted nowrap">{new Date(q.created_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</td>
                  <td className="actions" onClick={(e) => e.stopPropagation()}>
                    <button className="ghost sm" onClick={() => setOpen(q)}>View</button>
                    <button className="ghost sm danger-text" onClick={() => setDeletingOne(q)}>Delete</button>
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

      {open && <InquiryDrawer inquiry={open} onClose={() => setOpen(null)} onChanged={reload} onDelete={() => setDeletingOne(open)} />}
      {deletingOne && (
        <Confirm
          title="Delete enquiry"
          message={`Permanently delete the enquiry from ${deletingOne.name} (${deletingOne.email})? This cannot be undone.`}
          confirmLabel="Delete"
          danger
          onConfirm={deleteOne}
          onCancel={() => setDeletingOne(null)}
        />
      )}
      {confirmDelete && (
        <TypeConfirm
          title={`Delete ${selectedCount} enquir${selectedCount === 1 ? 'y' : 'ies'}`}
          message={
            sel.allMatching
              ? <>This deletes <strong>every enquiry {active ? 'matching the current filters' : 'in the list'}</strong> ({selectedCount}), including ones on other pages. It cannot be undone.</>
              : <>This permanently deletes the {selectedCount} selected enquir{selectedCount === 1 ? 'y' : 'ies'}. It cannot be undone.</>
          }
          confirmLabel="Delete"
          onConfirm={deleteBulk}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </Layout>
  );
};

const InquiryDrawer: React.FC<{ inquiry: Inquiry; onClose: () => void; onChanged: () => void; onDelete: () => void }> = ({ inquiry, onClose, onChanged, onDelete }) => {
  const { push } = useToast();
  const [status, setStatus] = useState(inquiry.status);
  const [notes, setNotes] = useState(inquiry.notes);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      // Backend requires status + notes together.
      await updateInquiry(inquiry.id, { status, notes });
      push('success', 'Enquiry updated');
      onChanged();
      onClose();
    } catch (e: any) {
      push('error', e.message);
    } finally {
      setBusy(false);
    }
  };

  const Row = ({ label, value }: { label: string; value: string }) =>
    value ? <div className="field"><label>{label}</label><div>{value}</div></div> : null;

  return (
    <Modal title={inquiry.name} onClose={onClose} variant="drawer">
      <Row label="Email" value={inquiry.email} />
      <Row label="Phone" value={inquiry.phone} />
      <Row label="WhatsApp" value={inquiry.whatsapp} />
      <Row label="Interested in" value={inquiry.interest} />
      <Row label="Source" value={inquiry.source} />
      {inquiry.page_url && (
        <div className="field"><label>Page</label><a href={inquiry.page_url} target="_blank" rel="noreferrer">{inquiry.page_url}</a></div>
      )}
      {inquiry.message && (
        <div className="field"><label>Message</label><div style={{ whiteSpace: 'pre-wrap' }}>{inquiry.message}</div></div>
      )}
      <div className="field"><label>Received</label><div className="muted">{new Date(inquiry.created_at).toLocaleString()}</div></div>

      <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '16px 0' }} />

      <div className="field">
        <label>Status</label>
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <div className="field">
        <label>Internal notes</label>
        <textarea rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Called on 19 Aug, will join next batch" />
      </div>
      <div className="row">
        <button className="ghost danger-text" onClick={onDelete}>Delete enquiry</button>
        <span className="grow" />
        <button className="secondary" onClick={onClose}>Cancel</button>
        <button disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</button>
      </div>
    </Modal>
  );
};

export default InquiryList;
