import React, { useState } from 'react';
import Modal from '../../components/Modal';
import { useToast } from '../../components/Toast';
import { upsertMcq, type McqQuestion, type McqOption } from '../../lib/api';
import { useCourses } from '../../lib/courses';

const DIFFICULTIES = ['Easy', 'Medium', 'Hard'];

const blankOption = (i: number): McqOption => ({ body: '', is_correct: false, order_index: i });

const McqForm: React.FC<{
  existing?: McqQuestion;
  /** Course a new question starts in — the one the bank is showing. */
  defaultCourse?: string;
  onClose: () => void;
  onSaved: () => void;
}> = ({ existing, defaultCourse = '', onClose, onSaved }) => {
  const { push } = useToast();
  const courses = useCourses();
  const [courseId, setCourseId] = useState(existing ? existing.course_id || '' : defaultCourse);
  const [topic, setTopic] = useState(existing?.topic || 'General');
  const [difficulty, setDifficulty] = useState(existing?.difficulty || 'Medium');
  const [body, setBody] = useState(existing?.body || '');
  const [explanation, setExplanation] = useState(existing?.explanation || '');
  const [kind, setKind] = useState(existing?.kind || 'single');
  const [options, setOptions] = useState<McqOption[]>(
    existing?.options?.length ? existing.options : [blankOption(0), blankOption(1), blankOption(2), blankOption(3)],
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const setOpt = (i: number, patch: Partial<McqOption>) =>
    setOptions((o) => o.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));

  const setCorrect = (i: number, checked: boolean) => {
    if (kind === 'single') {
      // radio behaviour — only one correct
      setOptions((o) => o.map((x, idx) => ({ ...x, is_correct: idx === i && checked })));
    } else {
      setOpt(i, { is_correct: checked });
    }
  };

  const addOption = () => setOptions((o) => [...o, blankOption(o.length)]);
  const removeOption = (i: number) => setOptions((o) => o.filter((_, idx) => idx !== i).map((x, idx) => ({ ...x, order_index: idx })));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const filled = options.filter((o) => o.body.trim());
    if (!body.trim()) return setError('Question text is required.');
    if (filled.length < 2) return setError('At least two options are required.');
    if (!filled.some((o) => o.is_correct)) return setError('Mark at least one option correct.');

    setBusy(true);
    try {
      await upsertMcq({
        id: existing?.id,
        course_id: courseId,
        topic: topic.trim() || 'General',
        difficulty,
        body: body.trim(),
        kind,
        explanation: explanation.trim(),
        is_active: true,
        options: filled.map((o, i) => ({ ...o, order_index: i })),
      });
      push('success', existing ? 'Question updated' : 'Question added');
      onSaved();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={existing ? 'Edit question' : 'New question'} onClose={onClose}>
      <form onSubmit={save}>
        <div className="field">
          <label>Course</label>
          <select value={courseId} onChange={(e) => setCourseId(e.target.value)}>
            <option value="">General — any course can use it</option>
            {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="row">
          <div className="field grow">
            <label>Topic</label>
            <input value={topic} onChange={(e) => setTopic(e.target.value)} />
          </div>
          <div className="field grow">
            <label>Difficulty</label>
            <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
              {DIFFICULTIES.map((d) => <option key={d}>{d}</option>)}
            </select>
          </div>
          <div className="field grow">
            <label>Type</label>
            <select value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="single">Single answer</option>
              <option value="multiple">Multiple answers</option>
            </select>
          </div>
        </div>

        <div className="field">
          <label>Question *</label>
          <textarea rows={3} value={body} onChange={(e) => setBody(e.target.value)} />
        </div>

        <div className="field">
          <label>Options (tick the correct one{kind === 'multiple' ? '(s)' : ''})</label>
          {options.map((o, i) => (
            <div key={i} className="row mb" style={{ gap: 8 }}>
              <input
                type={kind === 'single' ? 'radio' : 'checkbox'}
                name="correct"
                style={{ width: 'auto' }}
                checked={!!o.is_correct}
                onChange={(e) => setCorrect(i, e.target.checked)}
              />
              <input className="grow" placeholder={`Option ${i + 1}`} value={o.body} onChange={(e) => setOpt(i, { body: e.target.value })} />
              {options.length > 2 && <button type="button" className="ghost sm" onClick={() => removeOption(i)}>✕</button>}
            </div>
          ))}
          <button type="button" className="secondary sm" onClick={addOption}>+ Add option</button>
        </div>

        <div className="field">
          <label>Explanation (optional)</label>
          <textarea rows={2} value={explanation} onChange={(e) => setExplanation(e.target.value)} />
        </div>

        {error && <div className="err mb">{error}</div>}

        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="secondary" onClick={onClose}>Cancel</button>
          <button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save question'}</button>
        </div>
      </form>
    </Modal>
  );
};

export default McqForm;
