import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../../components/Layout';
import Modal from '../../components/Modal';
import Confirm from '../../components/Confirm';
import { useToast } from '../../components/Toast';
import {
  listAssessments,
  createAssessment,
  deleteAssessment,
  publishAssessment,
  duplicateTest,
  listCompanies,
  createCompany,
  type Assessment,
  type Company,
} from '../../lib/api';
import HiringCandidates from './HiringCandidates';
import { useUrlFilters } from '../../lib/useListState';
import { useOpenOnNew } from '../../lib/useOpenOnNew';
import { courseName, useCourses } from '../../lib/courses';
import { useCompany } from '../../lib/company';

// Scholarship papers are invite-only (the scholarship funnel issues the
// invite), practice tests are open to enrolled students, hiring tests belong
// to a company and are invite-only (invites are created here), and
// certification papers are invite-only too — the invite is issued on payment.
const TYPES = [
  { value: 'practice', label: 'Practice tests' },
  { value: 'scholarship', label: 'Scholarship tests' },
  { value: 'certification', label: 'Certification papers' },
  { value: 'hiring', label: 'Hiring tests' },
] as const;
type Purpose = (typeof TYPES)[number]['value'];

// 'practice' is the default tab, so it is the one the URL leaves out.
const asPurpose = (v: string): Purpose =>
  TYPES.some((t) => t.value === v && t.value !== 'practice') ? (v as Purpose) : 'practice';
const TYPE_KEYS = ['type'] as const;

const TestList: React.FC = () => {
  const { push } = useToast();
  const navigate = useNavigate();
  const [tests, setTests] = useState<Assessment[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [duration, setDuration] = useState(60);
  const [deleting, setDeleting] = useState<Assessment | null>(null);
  const [busy, setBusy] = useState(false);
  const [newPurpose, setNewPurpose] = useState<Purpose>('practice');
  const [newCourse, setNewCourse] = useState('');
  const [companies, setCompanies] = useState<Company[]>([]);
  const [newCompany, setNewCompany] = useState('');
  const [addingCompany, setAddingCompany] = useState(false);
  const [companyName, setCompanyName] = useState('');
  const [companySite, setCompanySite] = useState('');
  const [inviting, setInviting] = useState<Assessment | null>(null);
  const courses = useCourses();
  const [duplicating, setDuplicating] = useState<Assessment | null>(null);
  const [copyTitle, setCopyTitle] = useState('');
  const { filters, setFilter } = useUrlFilters(TYPE_KEYS);
  useOpenOnNew(() => { setNewPurpose(asPurpose(filters.type)); setCreating(true); });
  // A recruiter only ever sees their own company's hiring tests.
  const { recruiter, companyId, company } = useCompany();
  const purpose: Purpose = recruiter ? 'hiring' : asPurpose(filters.type);

  const loadCompanies = useCallback(async () => {
    try {
      const res = await listCompanies();
      setCompanies(res.companies || []);
    } catch (e: any) {
      push('error', e.message);
    }
  }, [push]);

  // Hiring tests pick a company, so fetch them once one might be needed.
  // Recruiters always create in their current company instead.
  useEffect(() => {
    if (!recruiter && (purpose === 'hiring' || newPurpose === 'hiring')) loadCompanies();
  }, [recruiter, purpose, newPurpose, loadCompanies]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listAssessments(`purpose=${purpose}&pageSize=200`);
      // "Delete" on a test that has attempts archives it (the results are
      // kept), so archived tests are ones someone chose to remove.
      setTests((res.assessments || []).filter((t) => t.status !== 'archived'));
    } catch (e: any) {
      push('error', e.message);
    } finally {
      setLoading(false);
    }
  }, [push, purpose, companyId]);

  useEffect(() => { load(); }, [load]);

  const doCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    const ownerCompany = recruiter ? companyId : newCompany;
    if (newPurpose === 'hiring' && !ownerCompany) {
      push('error', 'Choose the company this hiring test is for');
      return;
    }
    setBusy(true);
    try {
      // No company => a platform test an admin owns. Hiring tests belong to
      // the company, which is what lets its recruiters see the results.
      const { id } = await createAssessment({
        title: title.trim(),
        purpose: newPurpose,
        company_id: newPurpose === 'hiring' ? ownerCompany : undefined,
        course_ids: newPurpose === 'practice' && newCourse ? [newCourse] : [],
        duration_minutes: Number(duration) || 60,
        max_attempts: 1,
      });
      push('success', 'Test created');
      setCreating(false);
      setTitle('');
      navigate(`/tests/${id}`);
    } catch (e: any) {
      push('error', e.message);
    } finally {
      setBusy(false);
    }
  };

  const doCreateCompany = async () => {
    if (!companyName.trim()) return;
    setBusy(true);
    try {
      const c = await createCompany({ name: companyName.trim(), website: companySite.trim() || undefined });
      push('success', `Added ${c.name}`);
      await loadCompanies();
      setNewCompany(c.id);
      setAddingCompany(false);
      setCompanyName('');
      setCompanySite('');
    } catch (e: any) {
      push('error', e.message);
    } finally {
      setBusy(false);
    }
  };

  const togglePublish = async (t: Assessment) => {
    const publish = t.status !== 'published';
    try {
      await publishAssessment(t.id!, publish);
      push('success', publish ? 'Published' : 'Unpublished');
      load();
    } catch (e: any) {
      push('error', e.message);
    }
  };

  const startDuplicate = (t: Assessment) => {
    setCopyTitle(`${t.title} (copy)`);
    setDuplicating(t);
  };

  const doDuplicate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!duplicating || !copyTitle.trim()) return;
    setBusy(true);
    try {
      const r = await duplicateTest(duplicating.id!, copyTitle.trim());
      push('success', `Copied ${r.sections} section${r.sections === 1 ? '' : 's'} as a draft — review, then publish`);
      setDuplicating(null);
      navigate(`/tests/${r.id}`);
    } catch (e: any) {
      push('error', e.message);
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await deleteAssessment(deleting.id!);
      push('success', 'Test deleted');
      setDeleting(null);
      load();
    } catch (e: any) {
      push('error', e.message);
    }
  };

  const cols = purpose === 'practice' || (purpose === 'hiring' && !recruiter) ? 7 : 6;

  return (
    <Layout
      title={recruiter ? `Hiring tests${company ? ` — ${company.name}` : ''}` : 'Tests'}
      actions={<button onClick={() => { setNewPurpose(purpose); setCreating(true); }}>New test</button>}
    >
      <div className="filter-bar mb">
        {!recruiter && (
        <div className="seg" role="tablist" aria-label="Test type">
          {TYPES.map((t) => (
            <button
              key={t.value}
              role="tab"
              aria-selected={purpose === t.value}
              className={purpose === t.value ? 'on' : ''}
              onClick={() => setFilter('type', t.value === 'practice' ? '' : t.value)}
            >
              {t.label}
            </button>
          ))}
        </div>
        )}
        <span className="grow" />
        {purpose === 'scholarship' && (
          <span className="muted small">
            To open a scholarship for a course: duplicate a paper, rename it, publish it, then attach it under Scholarship Programmes.
          </span>
        )}
        {purpose === 'certification' && (
          <span className="muted small">
            Build and publish the paper here, then price it under Cert Exams. Candidates are emailed a link once they pay.
          </span>
        )}
        {purpose === 'hiring' && (
          <span className="muted small">
            Hiring tests belong to a company and are invite-only. Build the paper, publish it, then add candidates — each one is emailed a link to the test.
          </span>
        )}
      </div>
      <div className="scroll-x">
        <table className="card">
          <thead>
            <tr><th>Title</th>{purpose === 'practice' && <th>For</th>}{purpose === 'hiring' && !recruiter && <th>Company</th>}<th>Status</th><th>Duration</th><th>Questions</th><th>Attempts</th><th></th></tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={cols} className="muted">Loading…</td></tr>
            ) : tests.length === 0 ? (
              <tr><td colSpan={cols} className="muted">No {purpose} tests yet. Create one to get started.</td></tr>
            ) : (
              tests.map((t) => (
                <tr key={t.id}>
                  <td><a onClick={() => navigate(`/tests/${t.id}`)} style={{ cursor: 'pointer' }}>{t.title}</a></td>
                  {purpose === 'practice' && (
                    <td>
                      {t.course_ids?.length
                        ? t.course_ids.map((c) => <span key={c} className="chip">{courseName(c)}</span>)
                        : <span className="muted">All students</span>}
                    </td>
                  )}
                  {purpose === 'hiring' && !recruiter && (
                    <td>{t.company_name || <span className="muted">—</span>}</td>
                  )}
                  <td><span className={`badge ${t.status}`}>{t.status}</span></td>
                  <td>{t.duration_minutes} min</td>
                  <td>{t.question_count || '—'}</td>
                  <td>{t.attempt_count ?? 0}</td>
                  <td className="actions">
                    <button className="ghost sm" onClick={() => navigate(`/tests/${t.id}`)}>Edit</button>
                    {purpose === 'hiring' && (
                      <button className="ghost sm" onClick={() => setInviting(t)}>Candidates</button>
                    )}
                    <button className="ghost sm" onClick={() => navigate(`/tests/${t.id}/results`)}>Results</button>
                    <button className="ghost sm" onClick={() => togglePublish(t)}>
                      {t.status === 'published' ? 'Unpublish' : 'Publish'}
                    </button>
                    {!recruiter && <button className="ghost sm" onClick={() => startDuplicate(t)}>Duplicate</button>}
                    <button className="ghost sm danger-text" onClick={() => setDeleting(t)}>Delete</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {creating && (
        <Modal title="New test" onClose={() => setCreating(false)}>
          <form onSubmit={doCreate}>
            <div className="field">
              <label>Title *</label>
              <input value={title} autoFocus onChange={(e) => setTitle(e.target.value)} placeholder={recruiter ? 'e.g. Backend Engineer — Round 1' : 'e.g. Java Fundamentals — Module 1'} />
            </div>
            {!recruiter && (
            <div className="field">
              <label>Type</label>
              <select value={newPurpose} onChange={(e) => setNewPurpose(e.target.value as Purpose)}>
                <option value="practice">Practice test — for enrolled students</option>
                <option value="scholarship">Scholarship test — invite-only, used by Scholarship Programmes</option>
                <option value="certification">Certification paper — invite-only, sold under Cert Exams</option>
                <option value="hiring">Hiring test — for a company, invite-only</option>
              </select>
            </div>
            )}
            {!recruiter && newPurpose === 'hiring' && (
              <div className="field">
                <label>Company *</label>
                {addingCompany ? (
                  <div className="card card-pad">
                    <input className="mb" value={companyName} autoFocus onChange={(e) => setCompanyName(e.target.value)} placeholder="Company name" />
                    <input className="mb" value={companySite} onChange={(e) => setCompanySite(e.target.value)} placeholder="Website (optional)" />
                    <div className="row" style={{ justifyContent: 'flex-end' }}>
                      <button type="button" className="secondary sm" onClick={() => setAddingCompany(false)}>Cancel</button>
                      <button type="button" className="sm" disabled={busy || !companyName.trim()} onClick={doCreateCompany}>Add company</button>
                    </div>
                  </div>
                ) : (
                  <div className="row">
                    <select value={newCompany} onChange={(e) => setNewCompany(e.target.value)} style={{ flex: 1 }}>
                      <option value="">Choose a company…</option>
                      {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    <button type="button" className="secondary" onClick={() => setAddingCompany(true)}>New company</button>
                  </div>
                )}
              </div>
            )}
            {newPurpose === 'practice' && (
              <div className="field">
                <label>Who is it for</label>
                <select value={newCourse} onChange={(e) => setNewCourse(e.target.value)}>
                  <option value="">All students</option>
                  {courses.map((c) => <option key={c.id} value={c.id}>Students of {c.name}</option>)}
                </select>
              </div>
            )}
            <div className="field">
              <label>Duration (minutes)</label>
              <input type="number" min={1} value={duration} onChange={(e) => setDuration(Number(e.target.value))} />
            </div>
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <button type="button" className="secondary" onClick={() => setCreating(false)}>Cancel</button>
              <button type="submit" disabled={busy}>{busy ? 'Creating…' : 'Create & edit'}</button>
            </div>
          </form>
        </Modal>
      )}

      {duplicating && (
        <Modal title="Duplicate test" onClose={() => setDuplicating(null)}>
          <form onSubmit={doDuplicate}>
            <p className="mb muted">
              Copies the settings, sections and questions of “{duplicating.title}” into a new draft.
              The copy has its own attempts, so candidates who sat the original can sit it too.
            </p>
            <div className="field">
              <label>Title of the copy *</label>
              <input value={copyTitle} autoFocus onChange={(e) => setCopyTitle(e.target.value)} />
            </div>
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <button type="button" className="secondary" onClick={() => setDuplicating(null)}>Cancel</button>
              <button type="submit" disabled={busy || !copyTitle.trim()}>{busy ? 'Copying…' : 'Duplicate & edit'}</button>
            </div>
          </form>
        </Modal>
      )}

      {inviting && <HiringCandidates test={inviting} onClose={() => { setInviting(null); load(); }} />}

      {deleting && (
        <Confirm
          title="Delete test"
          message={`Delete "${deleting.title}"? This removes its sections and questions.`}
          confirmLabel="Delete"
          danger
          onConfirm={confirmDelete}
          onCancel={() => setDeleting(null)}
        />
      )}
    </Layout>
  );
};

export default TestList;
