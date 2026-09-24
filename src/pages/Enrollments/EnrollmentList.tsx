import React, { useCallback, useEffect, useState } from 'react';
import Layout from '../../components/Layout';
import { useToast } from '../../components/Toast';
import { listEnrollments, type EnrollmentOrder } from '../../lib/api';
import { useUrlFilters } from '../../lib/useListState';

const PAGE_SIZE = 50;
const FILTER_KEYS = ['status', 'search'] as const;
const inr = (n: number) => `₹${n.toLocaleString('en-IN')}`;

const STATUS: Record<string, { label: string; badge: string }> = {
  enrolled: { label: 'Enrolled', badge: 'published' },
  paid: { label: 'Paid — setting up', badge: 'admin' },
  failed: { label: 'Needs attention', badge: 'archived' },
  created: { label: 'Checkout abandoned', badge: 'draft' },
};

// Online course purchases from the website's /enroll page. "Enrolled" rows are
// done: paid, account created, course unlocked. "Needs attention" means money
// may have been taken but setup failed — contact the student.
const EnrollmentList: React.FC = () => {
  const { push } = useToast();
  const { filters, page, active, setFilter, setPage, clear } = useUrlFilters(FILTER_KEYS);
  const [rows, setRows] = useState<EnrollmentOrder[]>([]);
  const [total, setTotal] = useState(0);
  const [revenue, setRevenue] = useState(0);
  const [mode, setMode] = useState<{ enabled: boolean; test: boolean } | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await listEnrollments(page, PAGE_SIZE, filters.status, filters.search);
      setRows(r.orders);
      setTotal(r.total);
      setRevenue(r.revenue);
      setMode({ enabled: r.enabled, test: r.test_mode });
    } catch (e: any) {
      push('error', e.message);
    } finally {
      setLoading(false);
    }
  }, [filters, page, push]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <Layout title="Enrolments">
      {mode && !mode.enabled && (
        <div className="notice mb">
          Online payment is <strong>off</strong> — the website shows “request a callback” instead. Set
          <code> RAZORPAY_KEY_ID</code> and <code>RAZORPAY_KEY_SECRET</code> on the api-gateway to turn it on.
        </div>
      )}
      {mode?.enabled && mode.test && (
        <div className="notice mb">Razorpay <strong>test mode</strong> — payments here are not real money.</div>
      )}

      <div className="filter-bar mb">
        <input
          className="filter-search"
          placeholder="Search name, email or payment id…"
          value={filters.search}
          onChange={(e) => setFilter('search', e.target.value)}
        />
        <select value={filters.status} onChange={(e) => setFilter('status', e.target.value)}>
          <option value="">All statuses</option>
          {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        {active && <button className="ghost sm" onClick={clear}>Clear filters</button>}
        <span className="grow" />
        <span className="muted nowrap">{total} order{total === 1 ? '' : 's'} · {inr(revenue)} received</span>
      </div>

      <div className="scroll-x">
        <table className="card">
          <thead>
            <tr><th>Student</th><th>Course</th><th>Plan</th><th>Amount</th><th>Status</th><th>Payment id</th><th>Date</th></tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="muted">Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={7} className="muted">{active ? 'No orders match these filters.' : 'No online enrolments yet.'}</td></tr>
            ) : (
              rows.map((o) => {
                const st = STATUS[o.status] ?? { label: o.status, badge: 'draft' };
                return (
                  <tr key={o.id}>
                    <td>
                      {o.name}
                      <div className="muted small">{o.email}{o.phone ? ` · ${o.phone}` : ''}</div>
                    </td>
                    <td>{o.course_name}</td>
                    <td>{o.plan === 'mentor' ? 'Mentor-Led' : 'Self-Paced'}</td>
                    <td className="nowrap">{inr(o.amount)}</td>
                    <td>
                      <span className={`badge ${st.badge}`}>{st.label}</span>
                      {o.status === 'enrolled' && o.new_account && <div className="muted small">new account</div>}
                      {o.error && <div className="err small" title={o.error}>{o.error.slice(0, 80)}</div>}
                    </td>
                    <td className="mono small">{o.razorpay_payment_id || '—'}</td>
                    <td className="muted nowrap small">{new Date(o.paid_at || o.created_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</td>
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
    </Layout>
  );
};

export default EnrollmentList;
