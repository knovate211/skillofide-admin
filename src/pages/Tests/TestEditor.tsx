import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Layout from '../../components/Layout';
import Confirm from '../../components/Confirm';
import QuestionPicker from './QuestionPicker';
import DrawSettings from './DrawSettings';
import { useToast } from '../../components/Toast';
import {
  getAssessment,
  updateAssessment,
  publishAssessment,
  upsertSection,
  deleteSection,
  GENERAL_COURSE,
  type Assessment,
  type Section,
} from '../../lib/api';
import { courseName, useCourses } from '../../lib/courses';

// One line describing where a random-draw section's questions come from.
function drawSummary(s: Section): string {
  const from =
    !s.pick_course ? 'any course'
    : s.pick_course === GENERAL_COURSE ? 'General questions'
    : courseName(s.pick_course);
  const parts = [from, s.pick_topic, s.pick_difficulty].filter(Boolean);
  return `Random: ${s.pick_count} per candidate from ${parts.join(' · ')}, ${s.pick_marks || 1} mark${(s.pick_marks || 1) === 1 ? '' : 's'} each`;
}

const SECTION_KINDS = [
  { value: 'mcq', label: 'MCQ' },
  { value: 'coding', label: 'Coding' },
  { value: 'descriptive', label: 'Descriptive' },
];

const TestEditor: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { push } = useToast();
  const navigate = useNavigate();
  const courses = useCourses();
  const [a, setA] = useState<Assessment | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [pickerSection, setPickerSection] = useState<Section | null>(null);
  const [deletingSection, setDeletingSection] = useState<Section | null>(null);
  const [drawSection, setDrawSection] = useState<Section | null>(null);

  // new-section form
  const [secTitle, setSecTitle] = useState('');
  const [secKind, setSecKind] = useState('mcq');

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      setA(await getAssessment(id));
    } catch (e: any) {
      push('error', e.message);
    } finally {
      setLoading(false);
    }
  }, [id, push]);

  useEffect(() => { load(); }, [load]);

  const patch = (fields: Partial<Assessment>) => setA((prev) => (prev ? { ...prev, ...fields } : prev));

  const saveSettings = async () => {
    if (!a || !id) return;
    setBusy(true);
    try {
      await updateAssessment(id, {
        title: a.title,
        description: a.description || '',
        duration_minutes: Number(a.duration_minutes) || 60,
        passing_marks: Number(a.passing_marks) || 0,
        negative_marking: Number(a.negative_marking) || 0,
        max_attempts: Number(a.max_attempts) || 1,
        shuffle_questions: !!a.shuffle_questions,
        shuffle_options: !!a.shuffle_options,
        allow_backtrack: !!a.allow_backtrack,
        lock_forward: !!a.lock_forward,
        reveal_results: !!a.reveal_results,
        purpose: a.purpose || 'practice',
        course_ids: a.course_ids || [],
      });
      push('success', 'Settings saved');
      load();
    } catch (e: any) {
      push('error', e.message);
    } finally {
      setBusy(false);
    }
  };

  const addSection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !secTitle.trim()) return;
    setBusy(true);
    try {
      await upsertSection(id, {
        title: secTitle.trim(),
        kind: secKind,
        order_index: a?.sections?.length || 0,
      });
      setSecTitle('');
      push('success', 'Section added');
      load();
    } catch (e: any) {
      push('error', e.message);
    } finally {
      setBusy(false);
    }
  };

  const removeSection = async () => {
    if (!id || !deletingSection?.id) return;
    try {
      await deleteSection(id, deletingSection.id);
      push('success', 'Section removed');
      setDeletingSection(null);
      load();
    } catch (e: any) {
      push('error', e.message);
    }
  };

  const togglePublish = async () => {
    if (!a || !id) return;
    const publish = a.status !== 'published';
    try {
      await publishAssessment(id, publish);
      push('success', publish ? 'Published' : 'Unpublished');
      load();
    } catch (e: any) {
      push('error', e.message);
    }
  };

  if (loading) return <Layout title="Test"><div className="muted">Loading…</div></Layout>;
  if (!a) return <Layout title="Test"><div className="muted">Not found.</div></Layout>;

  return (
    <Layout
      title={a.title}
      actions={
        <>
          <span className={`badge ${a.status}`}>{a.status}</span>
          <button className="secondary" onClick={() => navigate('/tests')}>Back</button>
          <button className="secondary" onClick={() => navigate(`/tests/${id}/results`)}>Results</button>
          <button onClick={togglePublish}>{a.status === 'published' ? 'Unpublish' : 'Publish'}</button>
        </>
      }
    >
      {/* Settings */}
      <div className="card card-pad mb">
        <h3 style={{ marginTop: 0 }}>Settings</h3>
        <div className="field">
          <label>Title</label>
          <input value={a.title} onChange={(e) => patch({ title: e.target.value })} />
        </div>
        <div className="field">
          <label>Description</label>
          <textarea rows={2} value={a.description || ''} onChange={(e) => patch({ description: e.target.value })} />
        </div>
        <div className="row wrap">
          <div className="field grow">
            <label>Duration (min)</label>
            <input type="number" min={1} value={a.duration_minutes} onChange={(e) => patch({ duration_minutes: Number(e.target.value) })} />
          </div>
          <div className="field grow">
            <label>Passing marks</label>
            <input type="number" min={0} value={a.passing_marks || 0} onChange={(e) => patch({ passing_marks: Number(e.target.value) })} />
          </div>
          <div className="field grow">
            <label>Negative marking</label>
            <input type="number" min={0} step="0.25" value={a.negative_marking || 0} onChange={(e) => patch({ negative_marking: Number(e.target.value) })} />
          </div>
          <div className="field grow">
            <label>Max attempts</label>
            <input type="number" min={1} value={a.max_attempts || 1} onChange={(e) => patch({ max_attempts: Number(e.target.value) })} />
          </div>
        </div>
        <div className="row wrap mb">
          <label className="row" style={{ gap: 6 }}><input type="checkbox" style={{ width: 'auto' }} checked={!!a.shuffle_questions} onChange={(e) => patch({ shuffle_questions: e.target.checked })} /> Shuffle questions</label>
          <label className="row" style={{ gap: 6 }}><input type="checkbox" style={{ width: 'auto' }} checked={!!a.shuffle_options} onChange={(e) => patch({ shuffle_options: e.target.checked })} /> Shuffle options</label>
          <label className="row" style={{ gap: 6 }}><input type="checkbox" style={{ width: 'auto' }} checked={!!a.allow_backtrack} onChange={(e) => patch({ allow_backtrack: e.target.checked })} /> Allow backtrack</label>
          <label className="row" style={{ gap: 6 }} title="Candidates see one question at a time; the next unlocks once the current one is answered."><input type="checkbox" style={{ width: 'auto' }} checked={!!a.lock_forward} onChange={(e) => patch({ lock_forward: e.target.checked })} /> One question at a time</label>
          <label className="row" style={{ gap: 6 }}><input type="checkbox" style={{ width: 'auto' }} checked={!!a.reveal_results} onChange={(e) => patch({ reveal_results: e.target.checked })} /> Reveal results</label>
        </div>
        {a.purpose === 'practice' && (
          <div className="audience mb">
            <label>Who can take this test</label>
            <div className="row wrap" style={{ gap: 18, marginBottom: 8 }}>
              <label className="row radio">
                <input type="radio" checked={!a.course_ids?.length} onChange={() => patch({ course_ids: [] })} />
                All students
              </label>
              <label className="row radio">
                <input type="radio" checked={!!a.course_ids?.length}
                  onChange={() => patch({ course_ids: a.course_ids?.length ? a.course_ids : courses.slice(0, 1).map((c) => c.id) })} />
                Only students of these courses
              </label>
            </div>
            {!!a.course_ids?.length && (
              <div className="course-pick">
                {courses.map((c) => {
                  const on = a.course_ids!.includes(c.id);
                  return (
                    <label key={c.id} className={`course-chip${on ? ' on' : ''}`}>
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => {
                          const next = on ? a.course_ids!.filter((x) => x !== c.id) : [...a.course_ids!, c.id];
                          patch({ course_ids: next });
                        }}
                      />
                      {c.name}
                    </label>
                  );
                })}
              </div>
            )}
            <p className="muted small" style={{ margin: '6px 0 0' }}>
              {a.course_ids?.length
                ? `Only students enrolled in ${a.course_ids.map(courseName).join(', ')} see this test and can start it.`
                : 'Every signed-in student sees this test in their practice list.'}
            </p>
          </div>
        )}
        {a.purpose === 'scholarship' && (
          <p className="muted small mb">Scholarship tests are invite-only: candidates reach them through the scholarship application, not the practice list.</p>
        )}
        {a.purpose === 'hiring' && (
          <p className="muted small mb">
            Hiring test{a.company_name ? ` for ${a.company_name}` : ''}. It is invite-only: once it is published, add candidates with Candidates on the tests list and each is emailed a link.
          </p>
        )}
        <button disabled={busy} onClick={saveSettings}>{busy ? 'Saving…' : 'Save settings'}</button>
      </div>

      {/* Sections */}
      <div className="card card-pad">
        <h3 style={{ marginTop: 0 }}>Sections</h3>
        {(!a.sections || a.sections.length === 0) && <p className="muted">No sections yet.</p>}

        {a.sections?.map((s) => (
          <div key={s.id} className="card card-pad mb" style={{ background: '#faf9f6' }}>
            <div className="row between">
              <div>
                <strong>{s.title}</strong>{' '}
                <span className="badge draft">{s.kind}</span>{' '}
                {s.pick_count ? (
                  <span className="muted">{drawSummary(s)}</span>
                ) : (
                  <span className="muted">{s.questions?.length || 0} question(s)</span>
                )}
              </div>
              <div className="row">
                {s.kind === 'mcq' && (
                  <button className="secondary sm" onClick={() => setDrawSection(s)}>
                    {s.pick_count ? 'Random draw settings' : 'Random draw…'}
                  </button>
                )}
                <button className="secondary sm" onClick={() => setPickerSection(s)}>
                  {s.kind === 'mcq' ? 'Pick questions' : 'Manage questions'}
                </button>
                <button className="ghost sm" onClick={() => setDeletingSection(s)}>Remove</button>
              </div>
            </div>
            {s.questions && s.questions.length > 0 && (
              <ul className="muted" style={{ margin: '8px 0 0', paddingLeft: 18 }}>
                {s.questions.map((q) => (
                  <li key={q.id || q.mcq_question_id || q.problem_id}>
                    {q.title || q.mcq_question_id || q.problem_id} — {q.marks} mark(s)
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}

        <form className="row mt" onSubmit={addSection}>
          <input className="grow" placeholder="New section title" value={secTitle} onChange={(e) => setSecTitle(e.target.value)} />
          <select style={{ width: 160 }} value={secKind} onChange={(e) => setSecKind(e.target.value)}>
            {SECTION_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
          </select>
          <button type="submit" disabled={busy || !secTitle.trim()}>Add section</button>
        </form>
      </div>

      {pickerSection && id && (
        <QuestionPicker
          assessmentId={id}
          section={pickerSection}
          onClose={() => setPickerSection(null)}
          onSaved={() => { setPickerSection(null); load(); }}
        />
      )}

      {drawSection && id && (
        <DrawSettings
          assessmentId={id}
          section={drawSection}
          onClose={() => setDrawSection(null)}
          onSaved={() => { setDrawSection(null); load(); }}
        />
      )}

      {deletingSection && (
        <Confirm
          title="Remove section"
          message={`Remove section "${deletingSection.title}"?`}
          confirmLabel="Remove"
          danger
          onConfirm={removeSection}
          onCancel={() => setDeletingSection(null)}
        />
      )}
    </Layout>
  );
};

export default TestEditor;
