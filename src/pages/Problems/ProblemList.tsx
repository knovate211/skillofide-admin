import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../../components/Layout';
import Confirm from '../../components/Confirm';
import { useToast } from '../../components/Toast';
import { listProblemsAdmin, deleteProblem, GENERAL_COURSE, type ProblemRow } from '../../lib/api';
import { courseName, useCourses } from '../../lib/courses';
import { useUrlFilters } from '../../lib/useListState';

const PAGE_SIZE = 50;
const FILTER_KEYS = ['search', 'course', 'difficulty', 'show'] as const;

// Coding problems used by test coding sections. By default the list shows the
// problems that can be authored here (function problems with a signature); the
// 400+ seeded practice exercises in other formats are one filter away.
const ProblemList: React.FC = () => {
  const { push } = useToast();
  const navigate = useNavigate();
  const courses = useCourses();
  const { filters, page, active, setFilter, setPage, clear } = useUrlFilters(FILTER_KEYS);
  const [rows, setRows] = useState<ProblemRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<ProblemRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams({ page: String(page), page_size: String(PAGE_SIZE) });
      if (filters.search) q.set('search', filters.search);
      if (filters.course) q.set('course', filters.course);
      if (filters.difficulty) q.set('difficulty', filters.difficulty);
      if (filters.show !== 'all') q.set('editable', 'true');
      const r = await listProblemsAdmin(q.toString());
      setRows(r.problems);
      setTotal(r.total);
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

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await deleteProblem(deleting.id);
      push('success', `Deleted “${deleting.title}”`);
      setDeleting(null);
      load();
    } catch (e: any) {
      push('error', e.message);
      setDeleting(null);
    }
  };

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <Layout title="Coding problems" actions={<button onClick={() => navigate('/problems/new')}>New problem</button>}>
      <div className="filter-bar mb">
        <input
          className="filter-search"
          placeholder="Search title or topic…"
          value={filters.search}
          onChange={(e) => setFilter('search', e.target.value)}
        />
        <select value={filters.course} onChange={(e) => setFilter('course', e.target.value)}>
          <option value="">All courses</option>
          <option value={GENERAL_COURSE}>General</option>
          {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={filters.difficulty} onChange={(e) => setFilter('difficulty', e.target.value)}>
          <option value="">All difficulties</option>
          <option>Easy</option>
          <option>Medium</option>
          <option>Hard</option>
        </select>
        <select value={filters.show} onChange={(e) => setFilter('show', e.target.value)}>
          <option value="">Editable problems</option>
          <option value="all">Everything, incl. practice exercises</option>
        </select>
        {active && <button className="ghost sm" onClick={clear}>Clear filters</button>}
        <span className="grow" />
        <span className="muted nowrap">{total} problem{total === 1 ? '' : 's'}</span>
      </div>

      <div className="scroll-x">
        <table className="card">
          <thead>
            <tr>
              <th>Title</th><th>Course</th><th>Difficulty</th><th>Test cases</th>
              <th>Used in tests</th><th>Checked</th><th>Visible in</th><th></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="muted">Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="empty-cell">
                  <p className="muted">{active ? 'No problems match these filters.' : 'No coding problems yet.'}</p>
                  <button className="sm" onClick={() => navigate('/problems/new')}>Create a problem</button>
                </td>
              </tr>
            ) : (
              rows.map((p) => (
                <tr key={p.id} className="clickable" onClick={() => navigate(`/problems/${p.id}`)}>
                  <td>
                    {p.title}
                    {!p.editable && <span className="muted small"> · {p.io_mode}, read-only</span>}
                  </td>
                  <td>{p.course_id ? <span className="chip">{courseName(p.course_id)}</span> : <span className="muted">General</span>}</td>
                  <td>{p.difficulty}</td>
                  <td>{p.test_cases}</td>
                  <td>{p.used_in_tests || '—'}</td>
                  <td>
                    {p.verified
                      ? <span className="badge published" title="A solution has passed every test case">✓ solution passes</span>
                      : <span className="badge draft" title="No solution has been checked against the test cases yet">not checked</span>}
                  </td>
                  <td className="muted">{p.is_private ? 'Tests only' : 'Tests + practice'}</td>
                  <td className="actions" onClick={(e) => e.stopPropagation()}>
                    <button className="ghost sm" onClick={() => navigate(`/problems/${p.id}`)}>{p.editable ? 'Edit' : 'View'}</button>
                    {p.editable && <button className="ghost sm danger-text" onClick={() => setDeleting(p)}>Delete</button>}
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

      {deleting && (
        <Confirm
          title="Delete problem"
          message={
            deleting.used_in_tests
              ? `“${deleting.title}” is used in ${deleting.used_in_tests} test section(s). Remove it from those tests first.`
              : `Permanently delete “${deleting.title}” with its test cases? This cannot be undone.`
          }
          confirmLabel="Delete"
          danger
          onConfirm={confirmDelete}
          onCancel={() => setDeleting(null)}
        />
      )}
    </Layout>
  );
};

export default ProblemList;
