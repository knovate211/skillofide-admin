import React, { useCallback, useEffect, useState } from 'react';
import Layout from '../../components/Layout';
import Confirm from '../../components/Confirm';
import McqForm from './McqForm';
import McqImport from './McqImport';
import { useToast } from '../../components/Toast';
import { useCompany } from '../../lib/company';
import {
  listMcq,
  deleteMcq,
  getMcqFacets,
  GENERAL_COURSE,
  type Facet,
  type McqQuestion,
} from '../../lib/api';
import { courseName, useCourses } from '../../lib/courses';
import { useUrlFilters } from '../../lib/useListState';
import { useOpenOnNew } from '../../lib/useOpenOnNew';

const PAGE_SIZE = 50;
const FILTER_KEYS = ['course', 'search', 'topic', 'difficulty'] as const;

const withCount = (f: Facet) => `${f.value} (${f.count})`;

// The bank is organised by course: pick a course on the left and everything on
// the right — the list, the filters, "New question" and "Import" — works inside
// it. "General" holds questions any course can use (e.g. aptitude).
const McqList: React.FC = () => {
  const { push } = useToast();
  const courses = useCourses();
  // Recruiters see their company's questions plus the shared Knovate bank.
  const { recruiter, companyId } = useCompany();
  const { filters, page, setFilter, setPage, replaceFilters } = useUrlFilters(FILTER_KEYS);
  const [items, setItems] = useState<McqQuestion[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [facets, setFacets] = useState<{ course: Facet[]; topic: Facet[]; difficulty: Facet[] }>({ course: [], topic: [], difficulty: [] });
  const [editing, setEditing] = useState<McqQuestion | null>(null);
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  useOpenOnNew(() => setCreating(true));
  const [deleting, setDeleting] = useState<McqQuestion | null>(null);

  // The course the admin is "inside"; '' for All. New questions go here.
  const inCourse = filters.course === GENERAL_COURSE ? '' : filters.course;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
      for (const [k, v] of Object.entries(filters)) if (v) q.set(k, v);
      const res = await listMcq(q.toString());
      setItems(res.questions || []);
      setTotal(res.total ?? 0);
    } catch (e: any) {
      push('error', e.message);
    } finally {
      setLoading(false);
    }
  }, [filters, page, push, companyId]);

  const loadFacets = useCallback(() => {
    getMcqFacets(filters.course).then(setFacets).catch(() => undefined);
  }, [filters.course, companyId]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);
  useEffect(loadFacets, [loadFacets]);

  const reload = () => { load(); loadFacets(); };

  const confirmDelete = async () => {
    if (!deleting?.id) return;
    try {
      await deleteMcq(deleting.id);
      push('success', 'Question deleted');
      setDeleting(null);
      reload();
    } catch (e: any) {
      push('error', e.message);
    }
  };

  const countFor = (id: string) => facets.course.find((f) => f.value === id)?.count ?? 0;
  const allCount = facets.course.reduce((n, f) => n + f.count, 0);
  // Changing course resets the topic/difficulty filters, which belong to a course.
  const pickCourse = (id: string) => replaceFilters({ course: id, search: filters.search });
  const heading =
    filters.course === '' ? 'All questions'
    : filters.course === GENERAL_COURSE ? 'General questions'
    : courseName(filters.course);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const railItem = (id: string, label: string, n: number) => (
    <button
      key={id || 'all'}
      className={`rail-item${filters.course === id ? ' on' : ''}`}
      onClick={() => pickCourse(id)}
    >
      <span>{label}</span>
      <span className="rail-count">{n}</span>
    </button>
  );

  return (
    <Layout
      title="Question bank"
      actions={
        <>
          <button className="secondary" onClick={() => setImporting(true)}>Import Excel</button>
          <button onClick={() => setCreating(true)}>New question</button>
        </>
      }
    >
      <div className="bank">
        <nav className="rail card" aria-label="Courses">
          {railItem('', 'All questions', allCount)}
          {railItem(GENERAL_COURSE, 'General', countFor(''))}
          <div className="rail-heading">Courses</div>
          {courses.map((c) => railItem(c.id, c.name, countFor(c.id)))}
        </nav>

        <div className="bank-main">
          <div className="row between mb">
            <h3 style={{ margin: 0 }}>{heading}</h3>
            <span className="muted">{total} question{total === 1 ? '' : 's'}</span>
          </div>

          <div className="filter-bar mb">
            <input
              className="filter-search"
              placeholder="Search questions…"
              value={filters.search}
              onChange={(e) => setFilter('search', e.target.value)}
            />
            <select value={filters.topic} onChange={(e) => setFilter('topic', e.target.value)}>
              <option value="">All topics</option>
              {facets.topic.map((f) => <option key={f.value} value={f.value}>{withCount(f)}</option>)}
            </select>
            <select value={filters.difficulty} onChange={(e) => setFilter('difficulty', e.target.value)}>
              <option value="">All difficulties</option>
              {facets.difficulty.map((f) => <option key={f.value} value={f.value}>{withCount(f)}</option>)}
            </select>
          </div>

          <div className="scroll-x">
            <table className="card">
              <thead>
                <tr>
                  <th>Question</th>
                  {filters.course === '' && <th>Course</th>}
                  <th>Topic</th><th>Difficulty</th><th>Type</th><th></th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={6} className="muted">Loading…</td></tr>
                ) : items.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="empty-cell">
                      <p className="muted">
                        {filters.search || filters.topic || filters.difficulty
                          ? 'No questions match these filters.'
                          : `No questions in ${heading.toLowerCase() === 'all questions' ? 'the bank' : heading} yet.`}
                      </p>
                      <div className="row" style={{ justifyContent: 'center' }}>
                        <button className="secondary sm" onClick={() => setImporting(true)}>Import from Excel</button>
                        <button className="sm" onClick={() => setCreating(true)}>Add a question</button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  items.map((q) => (
                    <tr key={q.id}>
                      <td style={{ maxWidth: 440 }}>{q.body}</td>
                      {filters.course === '' && (
                        <td>{q.course_id ? <span className="chip">{courseName(q.course_id)}</span> : <span className="muted">General</span>}</td>
                      )}
                      <td>{q.topic}</td>
                      <td>{q.difficulty}</td>
                      <td>{q.kind}</td>
                      <td className="actions">
                        {/* A recruiter can use the shared Knovate bank in their
                            tests but only edit their own company's questions. */}
                        {recruiter && !q.company_id ? (
                          <span className="chip" title="Shared Knovate question: use it in your tests, but it can't be edited">Knovate bank</span>
                        ) : (
                          <>
                            <button className="ghost sm" onClick={() => setEditing(q)}>Edit</button>
                            <button className="ghost sm danger-text" onClick={() => setDeleting(q)}>Delete</button>
                          </>
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
        </div>
      </div>

      {creating && <McqForm defaultCourse={inCourse} onClose={() => setCreating(false)} onSaved={() => { setCreating(false); reload(); }} />}
      {importing && <McqImport defaultCourse={inCourse} onClose={() => setImporting(false)} onImported={() => { setImporting(false); reload(); }} />}
      {editing && <McqForm existing={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />}
      {deleting && (
        <Confirm
          title="Delete question"
          message="Delete this question from the bank? Tests already using it keep their copy."
          confirmLabel="Delete"
          danger
          onConfirm={confirmDelete}
          onCancel={() => setDeleting(null)}
        />
      )}
    </Layout>
  );
};

export default McqList;
