import React, { useCallback, useEffect, useState } from 'react';
import Layout from '../../components/Layout';
import Modal from '../../components/Modal';
import Confirm from '../../components/Confirm';
import { useToast } from '../../components/Toast';
import {
  deleteCertificationExam,
  listAssessments,
  listCertificationExams,
  upsertCertificationExam,
  type Assessment,
  type CertificationExam,
} from '../../lib/api';
import { courseName, useCourses } from '../../lib/courses';
import { useOpenOnNew } from '../../lib/useOpenOnNew';

const DEFAULT_LINK_DAYS = 14;
const DEFAULT_RESIT_DAYS = 30;
const DEFAULT_PASS = 60;

// The public site builds its exam URLs from the slug, so it is restricted to
// what survives a URL untouched — and the backend enforces the same shape.
const toSlug = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

const rupees = (n: number) => `₹${n.toLocaleString('en-IN')}`;

/**
 * What a certification costs and which paper it is.
 *
 * This is the only screen that puts an exam on sale: the public endpoint lists
 * one only when it is active, its paper is published and today falls inside the
 * window. Pausing here takes it off sale without touching anyone who has
 * already paid — their link keeps working.
 */
const ExamList: React.FC = () => {
  const { push } = useToast();
  const [exams, setExams] = useState<CertificationExam[]>([]);
  const [papers, setPapers] = useState<Assessment[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<CertificationExam | 'new' | null>(null);
  const [deleting, setDeleting] = useState<CertificationExam | null>(null);
  useOpenOnNew(() => setEditing('new'));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [examRes, paperRes] = await Promise.all([
        listCertificationExams(),
        // Only certification papers may back an exam — the backend rejects
        // anything else, because a practice test ignores invitations.
        listAssessments('purpose=certification&pageSize=200'),
      ]);
      setExams(examRes.exams ?? []);
      setPapers(paperRes.assessments ?? []);
    } catch (e: any) {
      push('error', e.message);
    } finally {
      setLoading(false);
    }
  }, [push]);

  useEffect(() => { void load(); }, [load]);

  const toggleActive = async (e: CertificationExam) => {
    try {
      await upsertCertificationExam({
        slug: e.slug,
        title: e.title,
        course_id: e.course_id,
        assessment_id: e.assessment_id,
        price_rupees: e.price_rupees,
        pass_percent: e.pass_percent,
        link_valid_days: e.link_valid_days,
        resit_wait_days: e.resit_wait_days,
        summary: e.summary,
        is_active: !e.is_active,
        opens_at: e.opens_at ?? '',
        closes_at: e.closes_at ?? '',
      });
      push('success', e.is_active ? 'Exam taken off sale' : 'Exam is on sale');
      await load();
    } catch (err: any) {
      push('error', err.message);
    }
  };

  const remove = async () => {
    if (!deleting) return;
    try {
      await deleteCertificationExam(deleting.id);
      push('success', `Deleted ${deleting.title}`);
      setDeleting(null);
      await load();
    } catch (e: any) {
      // A 409 here means somebody has paid; the message says so.
      push('error', e.message);
    }
  };

  return (
    <Layout
      title="Certification exams"
      actions={<button onClick={() => setEditing('new')}>Add exam</button>}
    >
      <p className="muted mb">
        An exam appears on the site only when it is on sale, its paper is published and today
        falls inside the window. Candidates are emailed a link the moment they pay.
      </p>

      <div className="scroll-x">
        <table className="card">
          <thead>
            <tr>
              <th>Exam</th><th>Course</th><th>Paper</th><th>Price</th>
              <th>Pass</th><th>Link / resit</th><th>Window</th>
              <th>Sold</th><th>On sale</th><th></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={10} className="muted">Loading…</td></tr>
            ) : exams.length === 0 ? (
              <tr><td colSpan={10} className="muted">
                No exams yet. Add one to put a certification on sale.
              </td></tr>
            ) : (
              exams.map((e) => (
                <tr key={e.id}>
                  <td>
                    {e.title}
                    <div className="muted" style={{ fontSize: 12 }}>/{e.slug}</div>
                  </td>
                  <td>{courseName(e.course_id)}</td>
                  <td>
                    {e.assessment_title || <span className="muted">—</span>}
                    <div style={{ fontSize: 12 }}>
                      {e.assessment_status === 'published' ? (
                        <span className="badge published">published</span>
                      ) : (
                        <span className="badge archived">{e.assessment_status}</span>
                      )}
                    </div>
                  </td>
                  <td className="nowrap">{rupees(e.price_rupees)}</td>
                  <td>{e.pass_percent}%</td>
                  <td className="muted nowrap" style={{ fontSize: 12 }}>
                    {e.link_valid_days}d link · {e.resit_wait_days}d resit
                  </td>
                  <td className="muted">
                    {e.opens_at || e.closes_at
                      ? `${e.opens_at ? new Date(e.opens_at).toLocaleDateString() : 'now'} → ${e.closes_at ? new Date(e.closes_at).toLocaleDateString() : 'open'}`
                      : 'always open'}
                  </td>
                  <td className="nowrap">
                    {e.registrations}
                    {e.registrations > 0 && (
                      <span className="muted"> · {e.passed} passed</span>
                    )}
                  </td>
                  <td>
                    <span className={`badge ${e.is_active ? 'published' : 'draft'}`}>
                      {e.is_active ? 'on sale' : 'paused'}
                    </span>
                  </td>
                  <td className="actions">
                    <button className="ghost sm" onClick={() => setEditing(e)}>Edit</button>
                    <button className="ghost sm" onClick={() => toggleActive(e)}>
                      {e.is_active ? 'Pause' : 'Put on sale'}
                    </button>
                    <button className="ghost sm danger-text" onClick={() => setDeleting(e)}>Delete</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {editing && (
        <ExamForm
          exam={editing === 'new' ? null : editing}
          papers={papers}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); void load(); }}
        />
      )}

      {deleting && (
        <Confirm
          title={`Delete ${deleting.title}?`}
          message={
            deleting.registrations > 0
              ? `${deleting.registrations} ${deleting.registrations === 1 ? 'person has' : 'people have'} already registered for this exam, so it cannot be deleted — pause it instead to take it off sale.`
              : 'This removes the exam from the site. The paper itself is left alone and stays under Tests.'
          }
          confirmLabel="Delete"
          danger
          onConfirm={remove}
          onCancel={() => setDeleting(null)}
        />
      )}
    </Layout>
  );
};

const toDateInput = (iso?: string) => (iso ? iso.slice(0, 10) : '');
const fromDateInput = (d: string) => (d ? new Date(`${d}T00:00:00Z`).toISOString() : '');
const digits = (v: string, max: number) => v.replace(/\D/g, '').slice(0, max);

const ExamForm: React.FC<{
  exam: CertificationExam | null;
  papers: Assessment[];
  onClose: () => void;
  onSaved: () => void;
}> = ({ exam, papers, onClose, onSaved }) => {
  const { push } = useToast();
  const courses = useCourses();
  const [title, setTitle] = useState(exam?.title ?? '');
  const [slug, setSlug] = useState(exam?.slug ?? '');
  // Only while the slug is still being derived from the title — once someone
  // types their own, the title stops overwriting it.
  const [slugTouched, setSlugTouched] = useState(!!exam);
  const [courseId, setCourseId] = useState(exam?.course_id ?? '');
  const [assessmentId, setAssessmentId] = useState(exam?.assessment_id ?? '');
  const [price, setPrice] = useState(String(exam?.price_rupees ?? ''));
  const [passPercent, setPassPercent] = useState(String(exam?.pass_percent ?? DEFAULT_PASS));
  const [linkDays, setLinkDays] = useState(String(exam?.link_valid_days ?? DEFAULT_LINK_DAYS));
  const [resitDays, setResitDays] = useState(String(exam?.resit_wait_days ?? DEFAULT_RESIT_DAYS));
  const [opensAt, setOpensAt] = useState(toDateInput(exam?.opens_at));
  const [closesAt, setClosesAt] = useState(toDateInput(exam?.closes_at));
  const [summary, setSummary] = useState(exam?.summary ?? '');
  const [isActive, setIsActive] = useState(exam ? exam.is_active : true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const published = papers.filter((p) => p.status === 'published');

  const onTitle = (v: string) => {
    setTitle(v);
    if (!slugTouched) setSlug(toSlug(v));
  };

  const save = async () => {
    setError('');
    if (!title.trim()) return setError('Give the exam a name candidates will recognise.');
    if (!slug) return setError('The exam needs a slug — the site builds its link from it.');
    if (!courseId) return setError('Choose the course this exam certifies.');
    if (!assessmentId) return setError('Choose the paper candidates will sit.');
    if (!Number(price)) return setError('Set a price. A free certification is not something this screen can sell.');
    const pass = Number(passPercent);
    if (!pass || pass > 100) return setError('The pass mark must be between 1 and 100.');
    if (!Number(linkDays)) return setError('The link has to be valid for at least a day.');
    if (opensAt && closesAt && opensAt > closesAt) {
      return setError('The window closes before it opens.');
    }
    setBusy(true);
    try {
      const res = await upsertCertificationExam({
        slug,
        title: title.trim(),
        course_id: courseId,
        assessment_id: assessmentId,
        price_rupees: Number(price),
        pass_percent: pass,
        link_valid_days: Number(linkDays),
        resit_wait_days: Number(resitDays) || 0,
        summary: summary.trim(),
        is_active: isActive,
        opens_at: fromDateInput(opensAt),
        closes_at: fromDateInput(closesAt),
      });
      push('success', exam ? 'Exam updated' : 'Exam created');
      // Saved either way, but staff still need to hear what is off about it.
      if (res.warning) push('info', res.warning);
      onSaved();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={exam ? `Edit — ${exam.title}` : 'Add exam'} onClose={onClose}>
      <div className="field">
        <label>Name *</label>
        <input
          value={title}
          autoFocus
          onChange={(e) => onTitle(e.target.value)}
          placeholder="e.g. Certified Java Developer"
        />
      </div>

      <div className="field">
        <label>Slug *</label>
        <input
          value={slug}
          disabled={!!exam}
          onChange={(e) => { setSlugTouched(true); setSlug(toSlug(e.target.value)); }}
          placeholder="certified-java-developer"
        />
        <p className="muted" style={{ fontSize: 12, margin: '4px 0 0' }}>
          {exam
            ? 'The slug cannot be changed — the site and every sold link point at it. Create a separate exam instead.'
            : 'Lowercase letters, digits and hyphens. This becomes part of the public link.'}
        </p>
      </div>

      <div className="row">
        <div className="field" style={{ flex: 1 }}>
          <label>Course *</label>
          <select value={courseId} onChange={(e) => setCourseId(e.target.value)}>
            <option value="">Select a course…</option>
            {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label>Price (₹) *</label>
          <input
            inputMode="numeric"
            value={price}
            onChange={(e) => setPrice(digits(e.target.value, 6))}
            placeholder="2999"
          />
        </div>
      </div>

      <div className="field">
        <label>Paper *</label>
        <select value={assessmentId} onChange={(e) => setAssessmentId(e.target.value)}>
          <option value="">Select a published certification paper…</option>
          {published.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
        </select>
        {published.length === 0 && (
          <p className="muted" style={{ fontSize: 12, margin: '4px 0 0' }}>
            No published papers with purpose “certification”. Create one under Tests and publish
            it first — a practice test cannot be used, because it ignores invitations.
          </p>
        )}
      </div>

      <div className="row">
        <div className="field" style={{ flex: 1 }}>
          <label>Pass mark (%) *</label>
          <input inputMode="numeric" value={passPercent}
                 onChange={(e) => setPassPercent(digits(e.target.value, 3))} />
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label>Link valid (days) *</label>
          <input inputMode="numeric" value={linkDays}
                 onChange={(e) => setLinkDays(digits(e.target.value, 3))} />
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label>Resit wait (days)</label>
          <input inputMode="numeric" value={resitDays}
                 onChange={(e) => setResitDays(digits(e.target.value, 3))} />
        </div>
      </div>
      <p className="muted" style={{ fontSize: 12, margin: '-8px 0 12px' }}>
        A buyer has the link period to sit the paper before it expires. After a failure they must
        wait the resit period before buying another sitting — 0 lets them retry straight away.
      </p>

      <div className="row">
        <div className="field" style={{ flex: 1 }}>
          <label>Opens</label>
          <input type="date" value={opensAt} onChange={(e) => setOpensAt(e.target.value)} />
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label>Closes</label>
          <input type="date" value={closesAt} onChange={(e) => setClosesAt(e.target.value)} />
        </div>
      </div>

      <div className="field">
        <label>Summary</label>
        <textarea
          rows={3}
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          placeholder="Shown on the exam's page — what it covers and who it is for."
        />
      </div>

      <div className="field">
        <label>
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
          {' '}On sale
        </label>
        <p className="muted" style={{ fontSize: 12, margin: '4px 0 0' }}>
          Pausing hides it from the site. Anyone who has already paid keeps their link.
        </p>
      </div>

      {error && <p style={{ color: 'var(--danger, #b91c1c)', fontSize: 13 }}>{error}</p>}

      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button className="secondary" onClick={onClose}>Cancel</button>
        <button disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save exam'}</button>
      </div>
    </Modal>
  );
};

export default ExamList;
