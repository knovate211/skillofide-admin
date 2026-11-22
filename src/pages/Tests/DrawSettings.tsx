import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Modal from '../../components/Modal';
import { useToast } from '../../components/Toast';
import {
  getMcqFacets,
  listMcq,
  upsertSection,
  GENERAL_COURSE,
  type Facet,
  type Section,
} from '../../lib/api';
import { courseName, useCourses } from '../../lib/courses';

const DIFFICULTIES = ['Easy', 'Medium', 'Hard'];

// Random draw for an MCQ section: each attempt gets `pick_count` questions
// drawn from the bank, filtered by course / topic / difficulty. This is how a
// course's question bank feeds its test — every candidate gets a different
// paper from the same pool.
//
// Every dropdown shows how many questions each choice holds, and empty choices
// are greyed out, so an empty topic list reads as "this course has no
// questions yet" rather than as a broken dropdown.
const DrawSettings: React.FC<{
  assessmentId: string;
  section: Section;
  onClose: () => void;
  onSaved: () => void;
}> = ({ assessmentId, section, onClose, onSaved }) => {
  const { push } = useToast();
  const courses = useCourses();
  const [count, setCount] = useState(section.pick_count || 10);
  const [course, setCourse] = useState(section.pick_course || '');
  const [topic, setTopic] = useState(section.pick_topic || '');
  const [difficulty, setDifficulty] = useState(section.pick_difficulty || '');
  const [marks, setMarks] = useState(section.pick_marks || 1);
  const [courseCounts, setCourseCounts] = useState<Facet[] | null>(null);
  const [topics, setTopics] = useState<Facet[]>([]);
  const [difficulties, setDifficulties] = useState<Facet[]>([]);
  const [available, setAvailable] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  // Question counts per course, for the "Draw from" list.
  useEffect(() => {
    getMcqFacets().then((f) => setCourseCounts(f.course)).catch(() => setCourseCounts([]));
  }, []);

  // Topics and difficulties that exist in the chosen course.
  useEffect(() => {
    getMcqFacets(course)
      .then((f) => { setTopics(f.topic); setDifficulties(f.difficulty); })
      .catch(() => { setTopics([]); setDifficulties([]); });
  }, [course]);

  // Exact number of questions matching all three filters — a draw larger than
  // the pool cannot start.
  useEffect(() => {
    const q = new URLSearchParams({ pageSize: '1' });
    if (course) q.set('course', course);
    if (topic) q.set('topic', topic);
    if (difficulty) q.set('difficulty', difficulty);
    setAvailable(null);
    listMcq(q.toString()).then((r) => setAvailable(r.total ?? 0)).catch(() => setAvailable(null));
  }, [course, topic, difficulty]);

  const countOf = (id: string) => courseCounts?.find((f) => f.value === id)?.count ?? 0;
  const totalAll = courseCounts?.reduce((n, f) => n + f.count, 0) ?? 0;
  const topicCount = (t: string) => topics.find((f) => f.value === t)?.count ?? 0;
  const diffCount = (d: string) => difficulties.find((f) => f.value === d)?.count ?? 0;
  const courseTotal = course === '' ? totalAll : countOf(course === GENERAL_COURSE ? '' : course);
  const courseLabel =
    course === '' ? 'the bank' : course === GENERAL_COURSE ? 'General' : courseName(course);
  const bankLink = `/mcq-bank${course ? `?course=${encodeURIComponent(course)}` : ''}`;
  const n = (x: number) => (courseCounts ? ` (${x})` : '');

  const save = async (off = false) => {
    setBusy(true);
    try {
      const { questions: _q, ...rest } = section;
      await upsertSection(assessmentId, {
        ...rest,
        pick_count: off ? 0 : Number(count) || 0,
        pick_course: course,
        pick_topic: topic,
        pick_difficulty: difficulty,
        pick_marks: Number(marks) || 1,
      });
      push('success', off ? 'Random draw turned off' : 'Random draw saved');
      onSaved();
    } catch (e: any) {
      push('error', e.message);
    } finally {
      setBusy(false);
    }
  };

  const short = available != null && available < count;

  let status: React.ReactNode;
  if (available == null) {
    status = <span className="muted">Counting matching questions…</span>;
  } else if (courseTotal === 0) {
    status = (
      <span className="err">
        {courseLabel} has no questions yet.{' '}
        <Link to={bankLink} onClick={onClose}>Add questions to {courseLabel} in the Question Bank</Link>
        {' '}or draw from another course.
      </span>
    );
  } else if (short) {
    status = (
      <span className="err">
        Only {available} question{available === 1 ? '' : 's'} match these filters — draw {available || 'fewer'} or fewer,
        loosen the topic/difficulty, or <Link to={bankLink} onClick={onClose}>add more to {courseLabel}</Link>.
      </span>
    );
  } else {
    status = <span className="muted">{available} questions match. Section total: {count * marks} marks.</span>;
  }

  return (
    <Modal title={`Random draw — ${section.title}`} onClose={onClose}>
      <p className="muted mb" style={{ marginTop: 0 }}>
        Each candidate gets a different set of questions drawn from the bank.
        {section.questions && section.questions.length > 0 &&
          ' With questions picked by hand, the draw picks from those instead of the bank.'}
      </p>
      <div className="field">
        <label>Draw from</label>
        <select value={course} onChange={(e) => { setCourse(e.target.value); setTopic(''); setDifficulty(''); }}>
          <option value="">Any course{n(totalAll)}</option>
          <option value={GENERAL_COURSE}>General questions only{n(countOf(''))}</option>
          <optgroup label="Courses">
            {courses.map((c) => (
              <option key={c.id} value={c.id}>{c.name}{n(countOf(c.id))}</option>
            ))}
          </optgroup>
        </select>
      </div>
      <div className="row">
        <div className="field grow">
          <label>Topic</label>
          <select value={topic} onChange={(e) => setTopic(e.target.value)} disabled={topics.length === 0}>
            <option value="">{topics.length === 0 ? 'No topics — no questions here yet' : 'Any topic'}</option>
            {topics.map((t) => <option key={t.value} value={t.value}>{t.value} ({t.count})</option>)}
            {topic && topicCount(topic) === 0 && <option value={topic}>{topic} (0)</option>}
          </select>
        </div>
        <div className="field grow">
          <label>Difficulty</label>
          <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
            <option value="">Any difficulty</option>
            {DIFFICULTIES.map((d) => (
              <option key={d} value={d} disabled={diffCount(d) === 0 && difficulty !== d}>
                {d} ({diffCount(d)})
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="row">
        <div className="field grow">
          <label>Questions per candidate</label>
          <input type="number" min={1} value={count} onChange={(e) => setCount(Number(e.target.value))} />
        </div>
        <div className="field grow">
          <label>Marks per question</label>
          <input type="number" min={1} value={marks} onChange={(e) => setMarks(Number(e.target.value))} />
        </div>
      </div>
      <p className="mb">{status}</p>
      <div className="row">
        {section.pick_count ? (
          <button className="ghost danger-text" disabled={busy} onClick={() => save(true)}>Turn off random draw</button>
        ) : null}
        <span className="grow" />
        <button className="secondary" onClick={onClose}>Cancel</button>
        <button disabled={busy || !count || short || available == null} onClick={() => save()}>{busy ? 'Saving…' : 'Save'}</button>
      </div>
    </Modal>
  );
};

export default DrawSettings;
