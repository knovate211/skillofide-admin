import React, { useMemo, useState } from 'react';
import Modal from '../../components/Modal';
import { useToast } from '../../components/Toast';
import { parseMcqFile, downloadMcqTemplate, type ParsedMcq } from '../../lib/excel';
import { importMcq, type McqQuestion } from '../../lib/api';
import { useCourses } from '../../lib/courses';

// Bulk-import MCQ questions from an .xlsx/.csv into the bank via /mcq-bank/import.
const McqImport: React.FC<{ defaultCourse?: string; onClose: () => void; onImported: () => void }> = ({
  defaultCourse = '',
  onClose,
  onImported,
}) => {
  const { push } = useToast();
  const courses = useCourses();
  // One course per upload: a sheet is normally written for one course, and a
  // per-row course column would be one more thing to get wrong in Excel.
  const [courseId, setCourseId] = useState(defaultCourse);
  const [rows, setRows] = useState<ParsedMcq[]>([]);
  const [fileName, setFileName] = useState('');
  const [busy, setBusy] = useState(false);

  const valid = useMemo(() => rows.filter((r) => r.errors.length === 0), [rows]);

  const onPick = async (file: File) => {
    setFileName(file.name);
    try {
      setRows(await parseMcqFile(file));
    } catch (e: any) {
      push('error', `Could not read file: ${e.message}`);
    }
  };

  const run = async () => {
    if (valid.length === 0) return;
    setBusy(true);
    try {
      const questions: McqQuestion[] = valid.map((r) => ({
        course_id: courseId,
        topic: r.topic,
        difficulty: r.difficulty,
        body: r.body,
        kind: r.kind,
        explanation: r.explanation,
        is_active: true,
        options: r.options,
      }));
      const res = await importMcq(questions);
      push('success', `Imported ${res.imported ?? valid.length} question(s)`);
      onImported();
    } catch (e: any) {
      push('error', e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Import questions" onClose={onClose}>
      <p className="muted" style={{ marginTop: 0 }}>
        Columns: <code>question, option1…optionN, correct, topic, difficulty, type, explanation</code>.
        <code>correct</code> is the 1-based option number (comma-separated for multiple).
      </p>
      <div className="field">
        <label>Add these questions to</label>
        <select value={courseId} onChange={(e) => setCourseId(e.target.value)}>
          <option value="">General — any course can use them</option>
          {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <div className="row mb">
        <input type="file" accept=".xlsx,.xls,.csv" onChange={(e) => e.target.files?.[0] && onPick(e.target.files[0])} />
        <button className="secondary" onClick={downloadMcqTemplate}>Template</button>
      </div>
      {fileName && <div className="muted mb">Loaded: {fileName}</div>}

      {rows.length > 0 && (
        <>
          <div className="row mb">
            <span className="badge published">{valid.length} ready</span>
            {rows.length - valid.length > 0 && <span className="badge archived">{rows.length - valid.length} with issues</span>}
          </div>
          <div className="scroll-x" style={{ maxHeight: 300, overflow: 'auto' }}>
            <table className="card">
              <thead><tr><th>#</th><th>Question</th><th>Opts</th><th>Status</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.row} style={r.errors.length ? { background: 'var(--danger-bg)' } : undefined}>
                    <td>{r.row}</td>
                    <td style={{ maxWidth: 260 }}>{r.body}</td>
                    <td>{r.options.length}</td>
                    <td>{r.errors.length === 0 ? <span className="badge published">ok</span> : <span className="err">{r.errors.join('; ')}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <div className="row mt" style={{ justifyContent: 'flex-end' }}>
        <button className="secondary" onClick={onClose}>Cancel</button>
        <button disabled={busy || valid.length === 0} onClick={run}>{busy ? 'Importing…' : `Import ${valid.length}`}</button>
      </div>
    </Modal>
  );
};

export default McqImport;
