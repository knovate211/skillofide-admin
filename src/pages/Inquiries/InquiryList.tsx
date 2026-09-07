import React, { useCallback, useEffect, useState } from 'react';
import Layout from '../../components/Layout';
import Modal from '../../components/Modal';
import { useToast } from '../../components/Toast';
import TableState from '../../components/TableState';
import { listInquiries, updateInquiry, type Inquiry } from '../../lib/api';

const STATUSES = ['new', 'contacted', 'closed', 'spam'];
const badgeClass: Record<string, string> = {
  new: 'published', contacted: 'draft', closed: 'admin', spam: 'archived',
};
const PAGE_SIZE = 25;

const InquiryList: React.FC = () => {
  const { push } = useToast();
  const [rows, setRows] = useState<Inquiry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<Inquiry | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listInquiries(page, PAGE_SIZE, status, search);
      setRows(res.inquiries);
      setTotal(res.total);
    } catch (e: any) {
      push('error', e.message);
    } finally {
      setLoading(false);
    }
  }, [page, status, search, push]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <Layout title="Enquiries">
      <div className="row between mb">
        <div className="row">
          <input style={{ maxWidth: 260 }} placeholder="Search name or email…" value={search} onChange={(e) => { setPage(1); setSearch(e.target.value); }} />
          <select style={{ width: 150 }} value={status} onChange={(e) => { setPage(1); setStatus(e.target.value); }}>
            <option value="">All statuses</option>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <span className="muted">{total} enquir{total === 1 ? 'y' : 'ies'}</span>
      </div>

      <div className="scroll-x">
        <table className="card">
          <thead>
            <tr><th>Name</th><th>Email</th><th>Phone</th><th>Interest</th><th>Source</th><th>Status</th><th>Received</th><th></th></tr>
          </thead>
          <tbody>
            {loading || rows.length === 0 ? (
              <TableState
                loading={loading}
                columns={8}
                title="No enquiries yet"
                hint="Enquiries from the marketing site land here."
              />
            ) : (
              rows.map((q) => (
                <tr key={q.id} style={{ cursor: 'pointer' }} onClick={() => setOpen(q)}>
                  <td>{q.name}</td>
                  <td>{q.email}</td>
                  <td>{q.phone || '—'}</td>
                  <td>{q.interest || '—'}</td>
                  <td><span className="chip">{q.source}</span></td>
                  <td><span className={`badge ${badgeClass[q.status] || 'draft'}`}>{q.status}</span></td>
                  <td className="muted">{new Date(q.created_at).toLocaleString()}</td>
                  <td className="actions"><button className="ghost sm" onClick={(e) => { e.stopPropagation(); setOpen(q); }}>View</button></td>
                </tr>
              ))
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

      {open && <InquiryDrawer inquiry={open} onClose={() => setOpen(null)} onChanged={load} />}
    </Layout>
  );
};

const InquiryDrawer: React.FC<{ inquiry: Inquiry; onClose: () => void; onChanged: () => void }> = ({ inquiry, onClose, onChanged }) => {
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

      <hr className="sep" />

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
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button className="secondary" onClick={onClose}>Cancel</button>
        <button disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</button>
      </div>
    </Modal>
  );
};

export default InquiryList;
