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

const HINTS: Record<Purpose, string> = {
  practice: 'Open to enrolled students in their practice list.',
  scholarship: 'Publish here, then attach under Scholarship Programmes.',
  certification: 'Publish here, then price it under Cert Exams.',
  hiring: 'Invite-only. Publish, then add candidates — each gets an emailed link.',
};

// What each purpose starts with, so a new test needs fewer changes.
const PURPOSES: { value: Purpose; title: string; text: string; duration: number; attempts: number; proctored: boolean }[] = [
  { value: 'practice', title: 'Practice', text: 'Students revise a course. Open to enrolled students, answers shown after.', duration: 30, attempts: 3, proctored: false },
  { value: 'scholarship', title: 'Scholarship', text: 'Screening paper for a scholarship programme. Invite-only.', duration: 60, attempts: 1, proctored: true },
  { value: 'certification', title: 'Certification', text: 'Paid exam that issues a certificate. Proctored, 2 attempts.', duration: 90, attempts: 2, proctored: true },
  { value: 'hiring', title: 'Hiring', text: 'Assessment for a company’s candidates. Invite-only.', duration: 60, attempts: 1, proctored: true },
];

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
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');

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
      const res = await listAssessments(recruiter ? 'purpose=hiring&pageSize=500' : 'pageSize=500');
      // "Delete" on a test that has attempts archives it (the results are
      // kept), so archived tests are ones someone chose to remove.
      setTests((res.assessments || []).filter((t) => t.status !== 'archived'));
    } catch (e: any) {
      push('error', e.message);
    } finally {
      setLoading(false);
    }
  }, [push, recruiter, companyId]);

  useEffect(() => { load(); }, [load]);

  const doCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    const ownerCompany = recruiter ? companyId : newCompany;
    if (newPurpose === 'hiring' && !ownerCompany) {
      push('error', 'Choose the company this hiring test is for');
      return;
    }
    const preset = PURPOSES.find((p) => p.value === newPurpose)!;
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
        max_attempts: preset.attempts,
        reveal_results: newPurpose === 'practice',
        allow_backtrack: true,
        shuffle_questions: preset.proctored,
        shuffle_options: preset.proctored,
        proctoring: preset.proctored
          ? { require_fullscreen: true, tab_switch_limit: 3, block_copy_paste: true, webcam: newPurpose === 'certification' }
          : null,
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

  const [menuFor, setMenuFor] = useState<string | null>(null);
  useEffect(() => {
    if (!menuFor) return;
    const close = () => setMenuFor(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [menuFor]);

  const shown = tests
    .filter((t) => (t.purpose || 'practice') === purpose)
    .filter((t) => !status || (status === 'live' ? t.status === 'published' : t.status !== 'published'))
    .filter((t) => !search.trim() || t.title.toLowerCase().includes(search.trim().toLowerCase()));
  const countFor = (p: string) => tests.filter((t) => (t.purpose || 'practice') === p).length;

  const audience = (t: Assessment) =>
    t.purpose === 'practice'
      ? (t.course_ids?.length ? t.course_ids.map(courseName).join(', ') : 'All students')
      : t.purpose === 'hiring' ? (t.company_name ? `Invite-only · ${t.company_name}` : 'Invite-only')
      : t.purpose === 'certification' ? 'Paid · invite on purchase'
      : 'Invite-only · scholarship';

  return (
    <Layout
      title={recruiter ? `Hiring tests${company ? ` — ${company.name}` : ''}` : 'Tests'}
      actions={<button onClick={() => { setNewPurpose(purpose); setCreating(true); }}>+ New test</button>}
    >
      {!recruiter && (
        <div className="tl-tabs mb" role="tablist" aria-label="Test type">
          {TYPES.map((t) => (
            <button
              key={t.value}
              role="tab"
              aria-selected={purpose === t.value}
              className={purpose === t.value ? 'on' : ''}
              onClick={() => setFilter('type', t.value === 'practice' ? '' : t.value)}
            >
              {t.label} <span className="tl-count">{countFor(t.value)}</span>
            </button>
          ))}
        </div>
      )}
      <div className="filter-bar mb">
        <input className="tl-search" placeholder="Search tests…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <div className="seg" aria-label="Status">
          {[['', 'All'], ['live', 'Live'], ['draft', 'Drafts']].map(([v, l]) => (
            <button key={v} className={status === v ? 'on' : ''} onClick={() => setStatus(v)}>{l}</button>
          ))}
        </div>
        <span className="grow" />
        <span className="muted small tl-hint">{HINTS[purpose]}</span>
      </div>

      {loading ? (
        <div className="muted">Loading…</div>
      ) : shown.length === 0 ? (
        <div className="card card-pad muted">
          {tests.length && countFor(purpose) ? 'No tests match this search.' : `No ${purpose} tests yet. Create one to get started.`}
        </div>
      ) : (
        <div className="tl-list">
          {shown.map((t) => {
            const live = t.status === 'published';
            const qs = t.question_count || 0;
            return (
              <div key={t.id} className="card tl-row">
                <div className="tl-main" onClick={() => navigate(`/tests/${t.id}`)}>
                  <div className="tl-title">
                    <span className={`tl-dot${live ? ' live' : ''}`} />
                    {t.title}
                    <span className={`badge ${t.status}`}>{live ? 'Live' : 'Draft'}</span>
                  </div>
                  <div className="tl-facts">
                    <span>{qs ? `${qs} question${qs === 1 ? '' : 's'}` : 'No questions yet'}</span>
                    {!!t.total_marks && <span>{t.total_marks} marks</span>}
                    <span>{t.duration_minutes} min</span>
                    <span>{audience(t)}</span>
                    <span>{t.attempt_count ?? 0} attempt{(t.attempt_count ?? 0) === 1 ? '' : 's'}</span>
                  </div>
                  {!live && !qs && <div className="tl-draft">Add questions before you can publish</div>}
                </div>
                <div className="tl-actions">
                  <button className="secondary sm" onClick={() => navigate(`/tests/${t.id}`)}>Edit</button>
                  {purpose === 'hiring' && <button className="secondary sm" onClick={() => setInviting(t)}>Candidates</button>}
                  <button className="secondary sm" onClick={() => navigate(`/tests/${t.id}/results`)}>Results</button>
                  <div className="tl-menu-wrap">
                    <button className="ghost sm" aria-label="More actions"
                      onClick={(e) => { e.stopPropagation(); setMenuFor(menuFor === t.id ? null : t.id!); }}>⋯</button>
                    {menuFor === t.id && (
                      <div className="tl-menu card" onClick={(e) => e.stopPropagation()}>
                        <button onClick={() => { setMenuFor(null); togglePublish(t); }}>{live ? 'Unpublish' : 'Publish'}</button>
                        {!recruiter && <button onClick={() => { setMenuFor(null); startDuplicate(t); }}>Duplicate</button>}
                        <button className="danger-item" onClick={() => { setMenuFor(null); setDeleting(t); }}>Delete</button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {creating && (
        <Modal title="New test — what is it for?" onClose={() => setCreating(false)}>
          <form onSubmit={doCreate}>
            <div className="field">
              <label>Title *</label>
              <input value={title} autoFocus onChange={(e) => setTitle(e.target.value)} placeholder={recruiter ? 'e.g. Backend Engineer — Round 1' : 'e.g. Java Fundamentals — Module 1'} />
            </div>
            {!recruiter && (
            <div className="field">
              <label>What is it for?</label>
              <div className="tl-purposes">
                {PURPOSES.map((p) => (
                  <button type="button" key={p.value}
                    className={`tl-purpose${newPurpose === p.value ? ' on' : ''}`}
                    onClick={() => { setNewPurpose(p.value); setDuration(p.duration); }}>
                    <strong>{p.title}</strong>
                    <span>{p.text}</span>
                  </button>
                ))}
              </div>
              <p className="muted small" style={{ margin: '6px 0 0' }}>
                Starts with {PURPOSES.find((p) => p.value === newPurpose)!.attempts} attempt(s)
                {PURPOSES.find((p) => p.value === newPurpose)!.proctored ? ' and proctoring on' : ''}. You can change everything later.
              </p>
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
