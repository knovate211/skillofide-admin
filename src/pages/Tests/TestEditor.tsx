import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import Layout from '../../components/Layout';
import Confirm from '../../components/Confirm';
import QuestionPicker from './QuestionPicker';
import DrawSettings from './DrawSettings';
import PoolPick from './PoolPick';
import { useToast } from '../../components/Toast';
import {
  getAssessment,
  updateAssessment,
  publishAssessment,
  upsertSection,
  deleteSection,
  listMcq,
  GENERAL_COURSE,
  type Assessment,
  type Proctoring,
  type Section,
} from '../../lib/api';
import { courseName, useCourses } from '../../lib/courses';

type Step = 'basics' | 'questions' | 'rules' | 'review';
const STEPS: { key: Step; label: string }[] = [
  { key: 'basics', label: 'Basics' },
  { key: 'questions', label: 'Questions' },
  { key: 'rules', label: 'Rules & proctoring' },
  { key: 'review', label: 'Review & publish' },
];

const SECTION_TYPES = [
  { value: 'mcq', label: 'Multiple choice', text: 'Random draw from the bank, or hand-picked' },
  { value: 'coding', label: 'Coding', text: 'Problems run against test cases' },
  { value: 'descriptive', label: 'Written answer', text: 'Free text, marked by hand' },
];
const KIND_LABEL: Record<string, string> = { mcq: 'Multiple choice', coding: 'Coding', descriptive: 'Written answer' };

const isDraw = (s: Section) => s.kind === 'mcq' && !!s.pick_count && !(s.questions?.length);

// What one candidate gets from a section: question count and marks.
function sectionTotals(s: Section): { questions: number; marks: number } {
  const qs = s.questions || [];
  if (isDraw(s)) return { questions: s.pick_count!, marks: s.pick_count! * (s.pick_marks || 1) };
  if (s.pick_count && qs.length) {
    const n = Math.min(s.pick_count, qs.length);
    const avg = qs.reduce((t, q) => t + (Number(q.marks) || 0), 0) / qs.length;
    return { questions: n, marks: Math.round(n * avg * 100) / 100 };
  }
  return { questions: qs.length, marks: qs.reduce((t, q) => t + (Number(q.marks) || 0), 0) };
}

const drawSource = (s: Section) =>
  !s.pick_course ? 'every course' : s.pick_course === GENERAL_COURSE ? 'General questions' : courseName(s.pick_course);

interface Check { ok: boolean; text: string; block: boolean; step?: Step }

const Switch: React.FC<{ on: boolean; onChange: (v: boolean) => void; title: string; text: string }> = ({ on, onChange, title, text }) => (
  <div className="tb-switch-row" onClick={() => onChange(!on)}>
    <span>
      <strong>{title}</strong>
      <span className="muted small">{text}</span>
    </span>
    <button type="button" role="switch" aria-checked={on} className={`tb-switch${on ? ' on' : ''}`} onClick={(e) => { e.stopPropagation(); onChange(!on); }}>
      <span />
    </button>
  </div>
);

const TestEditor: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { push } = useToast();
  const navigate = useNavigate();
  const courses = useCourses();
  const [params, setParams] = useSearchParams();
  const [a, setA] = useState<Assessment | null>(null);
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState<'saved' | 'dirty' | 'saving' | 'error'>('saved');
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [pickerSection, setPickerSection] = useState<Section | null>(null);
  const [deletingSection, setDeletingSection] = useState<Section | null>(null);
  const [drawSection, setDrawSection] = useState<Section | null>(null);
  const [poolSection, setPoolSection] = useState<Section | null>(null);
  const [addingKind, setAddingKind] = useState<string | null>(null);
  const [secTitle, setSecTitle] = useState('');
  const [bank, setBank] = useState<Record<string, number>>({});
  const [, tick] = useState(0);

  const step = (STEPS.some((s) => s.key === params.get('step')) ? params.get('step') : 'basics') as Step;
  const goStep = (s: Step) => setParams((p) => { p.set('step', s); return p; }, { replace: true });

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const got = await getAssessment(id);
      setA(got);
      if (!params.get('step') && got.sections?.length) goStep('questions');
    } catch (e: any) {
      push('error', e.message);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, push]);

  useEffect(() => { load(); }, [load]);

  // Sections reload without touching unsaved settings.
  const reloadSections = async () => {
    if (!id) return;
    try {
      const got = await getAssessment(id);
      setA((prev) => (prev ? { ...prev, sections: got.sections, status: got.status, question_count: got.question_count } : got));
    } catch (e: any) {
      push('error', e.message);
    }
  };

  // How many bank questions each random-draw section can draw from.
  const drawKey = (s: Section) => `${s.pick_course || ''}|${s.pick_topic || ''}|${s.pick_difficulty || ''}`;
  useEffect(() => {
    a?.sections?.filter(isDraw).forEach((s) => {
      const k = drawKey(s);
      if (k in bank) return;
      const q = new URLSearchParams({ pageSize: '1' });
      if (s.pick_course) q.set('course', s.pick_course);
      if (s.pick_topic) q.set('topic', s.pick_topic);
      if (s.pick_difficulty) q.set('difficulty', s.pick_difficulty);
      listMcq(q.toString()).then((r) => setBank((b) => ({ ...b, [k]: r.total ?? 0 }))).catch(() => {});
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [a?.sections]);

  const proctor: Proctoring = {
    require_fullscreen: !!a?.proctoring?.require_fullscreen,
    tab_switch_limit: Math.max(0, Number(a?.proctoring?.tab_switch_limit) || 0),
    block_copy_paste: !!a?.proctoring?.block_copy_paste,
    webcam: !!a?.proctoring?.webcam,
  };

  const patch = (fields: Partial<Assessment>) => {
    setA((prev) => (prev ? { ...prev, ...fields } : prev));
    setSaveState('dirty');
  };
  const patchProctor = (fields: Partial<Proctoring>) => patch({ proctoring: { ...proctor, ...fields } });

  // Autosave: settings are written a moment after the last change.
  const latest = useRef(a);
  latest.current = a;
  const save = useCallback(async () => {
    const cur = latest.current;
    if (!cur || !id) return;
    setSaveState('saving');
    try {
      await updateAssessment(id, {
        title: cur.title.trim() || 'Untitled test',
        description: cur.description || '',
        duration_minutes: Number(cur.duration_minutes) || 60,
        passing_marks: Number(cur.passing_marks) || 0,
        negative_marking: Number(cur.negative_marking) || 0,
        max_attempts: Number(cur.max_attempts) || 1,
        shuffle_questions: !!cur.shuffle_questions,
        shuffle_options: !!cur.shuffle_options,
        allow_backtrack: !!cur.allow_backtrack,
        lock_forward: !!cur.lock_forward,
        reveal_results: !!cur.reveal_results,
        purpose: cur.purpose || 'practice',
        course_ids: cur.course_ids || [],
        proctoring: {
          require_fullscreen: !!cur.proctoring?.require_fullscreen,
          tab_switch_limit: Math.max(0, Number(cur.proctoring?.tab_switch_limit) || 0),
          block_copy_paste: !!cur.proctoring?.block_copy_paste,
          webcam: !!cur.proctoring?.webcam,
        },
      });
      setSaveState((s) => (s === 'saving' ? 'saved' : s));
      setSavedAt(new Date());
    } catch (e: any) {
      setSaveState('error');
      push('error', `Not saved: ${e.message}`);
    }
  }, [id, push]);

  useEffect(() => {
    if (saveState !== 'dirty') return;
    const t = setTimeout(save, 800);
    return () => clearTimeout(t);
  }, [a, saveState, save]);

  // Keeps "saved 2 min ago" current, and warns before leaving with unsaved changes.
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 30000); return () => clearInterval(t); }, []);
  useEffect(() => {
    if (saveState === 'saved') return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [saveState]);

  const addSection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !addingKind) return;
    const title = secTitle.trim() || KIND_LABEL[addingKind];
    try {
      await upsertSection(id, { title, kind: addingKind, order_index: a?.sections?.length || 0 });
      setSecTitle('');
      setAddingKind(null);
      push('success', 'Section added');
      reloadSections();
    } catch (e: any) {
      push('error', e.message);
    }
  };

  const removeSection = async () => {
    if (!id || !deletingSection?.id) return;
    try {
      await deleteSection(id, deletingSection.id);
      push('success', 'Section removed');
      setDeletingSection(null);
      reloadSections();
    } catch (e: any) {
      push('error', e.message);
    }
  };

  if (loading) return <Layout title="Test"><div className="muted">Loading…</div></Layout>;
  if (!a) return <Layout title="Test"><div className="muted">Not found.</div></Layout>;

  const live = a.status === 'published';
  const sections = a.sections || [];
  const totals = sections.map(sectionTotals);
  const totalQ = totals.reduce((t, x) => t + x.questions, 0);
  const totalMarks = Math.round(totals.reduce((t, x) => t + x.marks, 0) * 100) / 100;
  const passMarks = Number(a.passing_marks) || 0;
  const passPct = totalMarks ? Math.round((passMarks / totalMarks) * 100) : 0;
  const setPassPct = (pct: number) => patch({ passing_marks: Math.round((Math.max(0, Math.min(100, pct)) / 100) * totalMarks * 100) / 100 });
  const strict = a.purpose !== 'practice';
  const nav = a.lock_forward ? 'one' : a.allow_backtrack ? 'free' : 'forward';

  const checks: Check[] = [
    { ok: !!a.title.trim(), text: 'The test has a title', block: true, step: 'basics' },
    { ok: sections.length > 0, text: 'At least one section', block: true, step: 'questions' },
    ...sections.map((s, i) => ({
      ok: totals[i].questions > 0,
      text: `“${s.title}” has questions`,
      block: true,
      step: 'questions' as Step,
    })),
    ...sections.filter(isDraw).map((s) => {
      const have = bank[drawKey(s)];
      return {
        ok: have === undefined || have >= s.pick_count!,
        text: `“${s.title}” bank has at least ${s.pick_count} matching questions`,
        block: true,
        step: 'questions' as Step,
      };
    }),
    ...(strict ? sections.filter((s) => isDraw(s) && !s.pick_course).map((s) => ({
      ok: false,
      text: `“${s.title}” draws from every course — limit it to one`,
      block: false,
      step: 'questions' as Step,
    })) : []),
    { ok: passMarks <= totalMarks, text: 'Pass mark is not above the total marks', block: true, step: 'rules' },
    ...(strict ? [{ ok: passMarks > 0, text: 'A pass mark is set', block: false, step: 'rules' as Step }] : []),
    { ok: Number(a.duration_minutes) > 0, text: 'A time limit is set', block: true, step: 'rules' },
  ];
  const blockers = checks.filter((c) => !c.ok && c.block);
  const warnings = checks.filter((c) => !c.ok && !c.block);

  const togglePublish = async () => {
    if (!id) return;
    if (!live && blockers.length) { push('error', 'Fix the items in “Ready to publish?” first'); return; }
    try {
      if (saveState !== 'saved') await save();
      await publishAssessment(id, !live);
      push('success', live ? 'Unpublished' : 'Published');
      reloadSections();
    } catch (e: any) {
      push('error', e.message);
    }
  };

  const mins = savedAt ? Math.floor((Date.now() - savedAt.getTime()) / 60000) : null;
  const saveLabel =
    saveState === 'saving' ? 'Saving…'
    : saveState === 'dirty' ? 'Unsaved changes'
    : saveState === 'error' ? 'Not saved — retrying on next change'
    : mins === null ? 'All changes saved'
    : `All changes saved · ${mins < 1 ? 'just now' : `${mins} min ago`}`;

  // The candidate's setup screen, in the player's own words.
  const told: string[] = [
    `You have ${a.duration_minutes} minutes for ${totalQ} question${totalQ === 1 ? '' : 's'} (${totalMarks} marks).`,
    ...(passMarks > 0 ? [`You need ${passMarks} marks (${passPct}%) to pass.`] : []),
    ...(Number(a.negative_marking) > 0 ? [`Each wrong answer costs ${a.negative_marking} mark${Number(a.negative_marking) === 1 ? '' : 's'}.`] : []),
    nav === 'one' ? 'Questions appear one at a time; the next unlocks once you answer.'
      : nav === 'forward' ? 'You cannot go back to a question once you move on.'
      : 'You can move between questions freely.',
    ...(proctor.require_fullscreen ? ['The test runs in fullscreen. Leaving it is recorded.'] : []),
    ...(proctor.tab_switch_limit > 0 ? [`Switching tabs ${proctor.tab_switch_limit} time${proctor.tab_switch_limit === 1 ? '' : 's'} ends the test.`] : ['Switching tabs is recorded.']),
    ...(proctor.block_copy_paste ? ['Copy, paste and right-click are turned off.'] : []),
    ...(proctor.webcam ? ['Your camera must stay on. Nothing is recorded.'] : []),
    `You have ${a.max_attempts || 1} attempt${(a.max_attempts || 1) === 1 ? '' : 's'}.`,
  ];

  const summary = (
    <aside className="tb-side">
      <div className="card card-pad">
        <div className="tb-side-h">Each candidate gets</div>
        <div className="tb-kpis">
          <div><b>{totalQ}</b><span>questions</span></div>
          <div><b>{totalMarks}</b><span>marks</span></div>
          <div><b>{a.duration_minutes}</b><span>minutes</span></div>
        </div>
        <div className="tb-side-line">
          Pass mark <b>{passMarks > 0 ? `${passPct}% · ${passMarks} marks` : 'not set'}</b>
        </div>
        <div className="tb-side-line">
          Attempts <b>{a.max_attempts || 1}</b>
        </div>
      </div>
      <div className="card card-pad">
        <div className="tb-side-h">Ready to publish?</div>
        <ul className="tb-checks">
          {checks.map((c, i) => (
            <li key={i} className={c.ok ? 'ok' : c.block ? 'bad' : 'warn'}>
              <span className="tb-ico">{c.ok ? '✓' : c.block ? '✕' : '!'}</span>
              {c.ok || !c.step || c.step === step ? c.text : <a onClick={() => goStep(c.step!)}>{c.text}</a>}
            </li>
          ))}
        </ul>
        {!live && (
          <button className="tb-full" disabled={blockers.length > 0} onClick={togglePublish}>
            {blockers.length ? `${blockers.length} thing${blockers.length === 1 ? '' : 's'} to fix` : 'Publish'}
          </button>
        )}
      </div>
    </aside>
  );

  return (
    <Layout
      title={a.title || 'Untitled test'}
      actions={
        <>
          <span className={`tb-save ${saveState}`}>{saveLabel}</span>
          <span className={`badge ${a.status}`}>{live ? 'Live' : 'Draft'}</span>
          <button className="secondary" onClick={() => navigate('/tests')}>Back</button>
          <button className="secondary" onClick={() => navigate(`/tests/${id}/results`)}>Results</button>
          <button onClick={togglePublish} disabled={!live && blockers.length > 0}
            title={!live && blockers.length ? blockers.map((b) => b.text).join('\n') : undefined}>
            {live ? 'Unpublish' : 'Publish'}
          </button>
        </>
      }
    >
      <nav className="tb-steps" aria-label="Steps">
        {STEPS.map((s, i) => (
          <button key={s.key} className={s.key === step ? 'on' : ''} onClick={() => goStep(s.key)}>
            <span className="tb-step-n">{i + 1}</span>{s.label}
          </button>
        ))}
      </nav>

      <div className="tb-grid">
        <div className="tb-main">
          {step === 'basics' && (
            <div className="card card-pad">
              <h3 className="tb-h">Basics</h3>
              <div className="field">
                <label>Title</label>
                <input value={a.title} onChange={(e) => patch({ title: e.target.value })} />
              </div>
              <div className="field">
                <label>Description <span className="muted small">— shown to candidates before they start</span></label>
                <textarea rows={3} value={a.description || ''} onChange={(e) => patch({ description: e.target.value })} />
              </div>
              {a.purpose === 'practice' ? (
                <div className="audience">
                  <label>Who can take this test</label>
                  <div className="seg mb">
                    <button className={!a.course_ids?.length ? 'on' : ''} onClick={() => patch({ course_ids: [] })}>All students</button>
                    <button className={a.course_ids?.length ? 'on' : ''}
                      onClick={() => patch({ course_ids: a.course_ids?.length ? a.course_ids : courses.slice(0, 1).map((c) => c.id) })}>
                      Students of chosen courses
                    </button>
                  </div>
                  {!!a.course_ids?.length && (
                    <div className="course-pick">
                      {courses.map((c) => {
                        const on = a.course_ids!.includes(c.id);
                        return (
                          <label key={c.id} className={`course-chip${on ? ' on' : ''}`}>
                            <input type="checkbox" checked={on}
                              onChange={() => patch({ course_ids: on ? a.course_ids!.filter((x) => x !== c.id) : [...a.course_ids!, c.id] })} />
                            {c.name}
                          </label>
                        );
                      })}
                    </div>
                  )}
                  <p className="muted small" style={{ margin: '6px 0 0' }}>
                    {a.course_ids?.length
                      ? `Only students enrolled in ${a.course_ids.map(courseName).join(', ')} see this test.`
                      : 'Every signed-in student sees this test in their practice list.'}
                  </p>
                </div>
              ) : (
                <p className="tb-note">
                  {a.purpose === 'scholarship' && 'Scholarship paper — invite-only. Candidates reach it through the scholarship application. After publishing, attach it under Scholarship Programmes.'}
                  {a.purpose === 'certification' && 'Certification paper — invite-only and paid for. After publishing, attach it to an exam under Cert Exams, which prices it and emails each buyer a link.'}
                  {a.purpose === 'hiring' && `Hiring test${a.company_name ? ` for ${a.company_name}` : ''} — invite-only. After publishing, add candidates from the tests list; each is emailed a link.`}
                </p>
              )}
              <div className="tb-foot"><button onClick={() => goStep('questions')}>Next: Questions →</button></div>
            </div>
          )}

          {step === 'questions' && (
            <>
              {sections.length === 0 && (
                <div className="card card-pad muted mb">No sections yet. Add one below — most tests start with a multiple-choice section.</div>
              )}
              {sections.map((s, i) => {
                const t = totals[i];
                const draw = isDraw(s);
                const have = draw ? bank[drawKey(s)] : undefined;
                return (
                  <div key={s.id} className="card tb-sec">
                    <div className="tb-sec-head">
                      <div>
                        <div className="tb-sec-title">{s.title}</div>
                        <div className="muted small">
                          {KIND_LABEL[s.kind] || s.kind} · {draw ? 'Random draw from the bank' : s.pick_count ? `Random ${s.pick_count} of ${s.questions?.length || 0}` : 'Hand-picked'}
                        </div>
                      </div>
                      <div className="tb-sec-nums">
                        <span><b>{t.questions}</b> questions</span>
                        <span><b>{t.marks}</b> marks</span>
                      </div>
                    </div>

                    {draw && (
                      <div className="tb-sec-body">
                        <div className="tb-facts">
                          <span>From <b>{drawSource(s)}</b></span>
                          {s.pick_topic && <span>Topic <b>{s.pick_topic}</b></span>}
                          <span>Difficulty <b>{s.pick_difficulty || 'any'}</b></span>
                          <span><b>{s.pick_count}</b> per candidate</span>
                          <span><b>{s.pick_marks || 1}</b> mark{(s.pick_marks || 1) === 1 ? '' : 's'} each</span>
                        </div>
                        {strict && !s.pick_course && (
                          <div className="tb-warn">Draws from every course. Limit it to the course this test is about.
                            <button className="linkBtn" onClick={() => setDrawSection(s)}>Change</button>
                          </div>
                        )}
                        {have !== undefined && (
                          have < s.pick_count!
                            ? <div className="tb-warn bad">Only {have} matching question{have === 1 ? '' : 's'} in the bank — {s.pick_count} are needed for each candidate.</div>
                            : <div className="muted small">{have} matching questions in the bank; each candidate gets a random {s.pick_count}.</div>
                        )}
                      </div>
                    )}

                    {!draw && (s.questions?.length ?? 0) > 0 && (
                      <ol className="tb-qs">
                        {s.questions!.slice(0, 6).map((q) => (
                          <li key={q.id || q.mcq_question_id || q.problem_id}>
                            <span>{q.title || q.mcq_question_id || q.problem_id}</span>
                            <span className="muted">{q.marks} mark{Number(q.marks) === 1 ? '' : 's'}</span>
                          </li>
                        ))}
                        {s.questions!.length > 6 && <li className="muted">+ {s.questions!.length - 6} more</li>}
                      </ol>
                    )}
                    {t.questions === 0 && <div className="tb-warn bad tb-sec-body">This section is empty. Add questions or remove it.</div>}

                    <div className="tb-sec-actions">
                      {s.kind === 'mcq' && (
                        <button className="secondary sm" onClick={() => setDrawSection(s)}>{s.pick_count ? 'Draw settings' : 'Use random draw'}</button>
                      )}
                      {s.kind === 'coding' && (
                        <button className="secondary sm" onClick={() => setPoolSection(s)}>{s.pick_count ? 'Random pick settings' : 'Random pick'}</button>
                      )}
                      <button className="secondary sm" onClick={() => setPickerSection(s)}>
                        {s.kind === 'mcq' ? 'Pick questions' : 'Manage questions'}
                      </button>
                      <span className="grow" />
                      <button className="ghost sm danger-text" onClick={() => setDeletingSection(s)}>Remove</button>
                    </div>
                  </div>
                );
              })}

              <div className="card card-pad">
                <div className="tb-side-h">Add a section</div>
                <div className="tb-tiles">
                  {SECTION_TYPES.map((k) => (
                    <button key={k.value} type="button" className={`tb-tile${addingKind === k.value ? ' on' : ''}`}
                      onClick={() => { setAddingKind(k.value); setSecTitle(''); }}>
                      <strong>{k.label}</strong><span>{k.text}</span>
                    </button>
                  ))}
                </div>
                {addingKind && (
                  <form className="row mt" onSubmit={addSection}>
                    <input className="grow" autoFocus placeholder={`Section title (default “${KIND_LABEL[addingKind]}”)`}
                      value={secTitle} onChange={(e) => setSecTitle(e.target.value)} />
                    <button type="button" className="secondary" onClick={() => setAddingKind(null)}>Cancel</button>
                    <button type="submit">Add section</button>
                  </form>
                )}
              </div>
              <div className="tb-foot">
                <button className="secondary" onClick={() => goStep('basics')}>← Basics</button>
                <button onClick={() => goStep('rules')}>Next: Rules →</button>
              </div>
            </>
          )}

          {step === 'rules' && (
            <>
              <div className="card card-pad mb">
                <h3 className="tb-h">Time &amp; scoring</h3>
                <div className="tb-fields">
                  <div className="field">
                    <label>Time limit</label>
                    <div className="tb-unit"><input type="number" min={1} value={a.duration_minutes}
                      onChange={(e) => patch({ duration_minutes: Number(e.target.value) })} /><span>minutes</span></div>
                  </div>
                  <div className="field">
                    <label>Pass mark</label>
                    <div className="tb-unit"><input type="number" min={0} max={100} value={passPct} disabled={!totalMarks}
                      onChange={(e) => setPassPct(Number(e.target.value))} /><span>%</span></div>
                    <span className="muted small">{totalMarks ? `= ${passMarks} of ${totalMarks} marks` : 'Add questions first'}</span>
                  </div>
                  <div className="field">
                    <label>Wrong answer costs</label>
                    <div className="tb-unit"><input type="number" min={0} step="0.25" value={a.negative_marking || 0}
                      onChange={(e) => patch({ negative_marking: Number(e.target.value) })} /><span>marks</span></div>
                  </div>
                  <div className="field">
                    <label>Attempts per candidate</label>
                    <div className="tb-unit"><input type="number" min={1} value={a.max_attempts || 1}
                      onChange={(e) => patch({ max_attempts: Number(e.target.value) })} /><span>attempts</span></div>
                  </div>
                </div>
              </div>

              <div className="card card-pad mb">
                <h3 className="tb-h">During the test</h3>
                <Switch on={!!a.shuffle_questions} onChange={(v) => patch({ shuffle_questions: v })}
                  title="Shuffle question order" text="Each candidate sees the questions in a different order." />
                <Switch on={!!a.shuffle_options} onChange={(v) => patch({ shuffle_options: v })}
                  title="Shuffle answer options" text="Options A–D are mixed for each candidate." />
                <Switch on={!!a.reveal_results} onChange={(v) => patch({ reveal_results: v })}
                  title="Show answers after submitting" text="Candidates can review which answers were right." />
                <div className="tb-switch-row">
                  <span><strong>Moving between questions</strong><span className="muted small">How candidates go through the paper.</span></span>
                  <div className="seg">
                    <button className={nav === 'free' ? 'on' : ''} onClick={() => patch({ allow_backtrack: true, lock_forward: false })}>Free</button>
                    <button className={nav === 'forward' ? 'on' : ''} onClick={() => patch({ allow_backtrack: false, lock_forward: false })}>No going back</button>
                    <button className={nav === 'one' ? 'on' : ''} onClick={() => patch({ allow_backtrack: false, lock_forward: true })}>One at a time</button>
                  </div>
                </div>
              </div>

              <div className="card card-pad mb">
                <h3 className="tb-h">Proctoring</h3>
                <p className="muted small" style={{ marginTop: -6 }}>Tab switches, developer tools, screenshot keys and second monitors are always logged.</p>
                <Switch on={proctor.require_fullscreen} onChange={(v) => patchProctor({ require_fullscreen: v })}
                  title="Require fullscreen" text="Leaving fullscreen is recorded and the candidate is asked to return." />
                <Switch on={proctor.block_copy_paste} onChange={(v) => patchProctor({ block_copy_paste: v })}
                  title="Block copy, paste & right-click" text="Each try is recorded." />
                <Switch on={proctor.webcam} onChange={(v) => patchProctor({ webcam: v })}
                  title="Webcam monitoring" text="Flags no face, several faces, a covered camera or talking. Nothing is recorded." />
                <div className="tb-switch-row">
                  <span><strong>End the test after tab switches</strong>
                    <span className="muted small">{proctor.tab_switch_limit > 0 ? `The test ends when the candidate leaves it ${proctor.tab_switch_limit} time${proctor.tab_switch_limit === 1 ? '' : 's'}.` : 'Off — switches are only logged.'}</span></span>
                  <div className="tb-stepper">
                    <button type="button" className="secondary sm" onClick={() => patchProctor({ tab_switch_limit: Math.max(0, proctor.tab_switch_limit - 1) })}>−</button>
                    <span>{proctor.tab_switch_limit ? `${proctor.tab_switch_limit} time${proctor.tab_switch_limit === 1 ? '' : 's'}` : 'Off'}</span>
                    <button type="button" className="secondary sm" onClick={() => patchProctor({ tab_switch_limit: proctor.tab_switch_limit + 1 })}>+</button>
                  </div>
                </div>
              </div>

              <div className="card card-pad tb-told">
                <div className="tb-side-h">What the candidate is told</div>
                <ul>{told.map((t) => <li key={t}>{t}</li>)}</ul>
              </div>
              <div className="tb-foot">
                <button className="secondary" onClick={() => goStep('questions')}>← Questions</button>
                <button onClick={() => goStep('review')}>Next: Review →</button>
              </div>
            </>
          )}

          {step === 'review' && (
            <div className="card card-pad">
              <h3 className="tb-h">Review &amp; publish</h3>
              <dl className="tb-review">
                <dt>Title</dt><dd>{a.title || '—'}</dd>
                <dt>Type</dt><dd style={{ textTransform: 'capitalize' }}>{a.purpose || 'practice'}</dd>
                <dt>Sections</dt>
                <dd>{sections.length ? sections.map((s, i) => `${s.title} (${totals[i].questions} q · ${totals[i].marks} marks)`).join(', ') : 'None'}</dd>
                <dt>Paper</dt><dd>{totalQ} questions · {totalMarks} marks · {a.duration_minutes} min</dd>
                <dt>Pass mark</dt><dd>{passMarks > 0 ? `${passPct}% (${passMarks} marks)` : 'Not set'}</dd>
                <dt>Attempts</dt><dd>{a.max_attempts || 1}</dd>
              </dl>
              <div className="tb-told mt">
                <div className="tb-side-h">The candidate is told</div>
                <ul>{told.map((t) => <li key={t}>{t}</li>)}</ul>
              </div>
              {warnings.length > 0 && <p className="tb-warn">Worth a look: {warnings.map((w) => w.text).join('; ')}.</p>}
              <div className="tb-foot">
                <button className="secondary" onClick={() => goStep('rules')}>← Rules</button>
                <button onClick={togglePublish} disabled={!live && blockers.length > 0}>
                  {live ? 'Unpublish' : blockers.length ? `${blockers.length} thing${blockers.length === 1 ? '' : 's'} to fix` : 'Publish test'}
                </button>
              </div>
            </div>
          )}
        </div>
        {summary}
      </div>

      {pickerSection && id && (
        <QuestionPicker assessmentId={id} section={pickerSection}
          onClose={() => setPickerSection(null)} onSaved={() => { setPickerSection(null); reloadSections(); }} />
      )}
      {poolSection && id && (
        <PoolPick assessmentId={id} section={poolSection}
          onClose={() => setPoolSection(null)} onSaved={() => { setPoolSection(null); reloadSections(); }} />
      )}
      {drawSection && id && (
        <DrawSettings assessmentId={id} section={drawSection}
          onClose={() => setDrawSection(null)} onSaved={() => { setDrawSection(null); reloadSections(); }} />
      )}
      {deletingSection && (
        <Confirm title="Remove section" message={`Remove section "${deletingSection.title}"?`} confirmLabel="Remove" danger
          onConfirm={removeSection} onCancel={() => setDeletingSection(null)} />
      )}
    </Layout>
  );
};

export default TestEditor;
