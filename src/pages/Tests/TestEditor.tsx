import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Layout from '../../components/Layout';
import Confirm from '../../components/Confirm';
import QuestionPicker from './QuestionPicker';
import { useToast } from '../../components/Toast';
import {
  getAssessment,
  updateAssessment,
  publishAssessment,
  upsertSection,
  deleteSection,
  type Assessment,
  type Section,
} from '../../lib/api';

const SECTION_KINDS = [
  { value: 'mcq', label: 'MCQ' },
  { value: 'coding', label: 'Coding' },
  { value: 'descriptive', label: 'Descriptive' },
];

const TestEditor: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { push } = useToast();
  const navigate = useNavigate();
  const [a, setA] = useState<Assessment | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [pickerSection, setPickerSection] = useState<Section | null>(null);
  const [deletingSection, setDeletingSection] = useState<Section | null>(null);

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
                <span className="muted">{s.questions?.length || 0} question(s)</span>
              </div>
              <div className="row">
                <button className="secondary sm" onClick={() => setPickerSection(s)}>Manage questions</button>
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
