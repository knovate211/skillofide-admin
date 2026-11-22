import React, { useState } from 'react';
import Modal from '../../components/Modal';
import { useToast } from '../../components/Toast';
import { upsertSection, type Section } from '../../lib/api';

// A different paper per candidate for coding: put several problems in the
// section and give each candidate a random few of them. Answers shared between
// candidates are then often for a problem the next person never sees. The
// draw is seeded per attempt, so a candidate's paper is fixed once started.
const PoolPick: React.FC<{
  assessmentId: string;
  section: Section;
  onClose: () => void;
  onSaved: () => void;
}> = ({ assessmentId, section, onClose, onSaved }) => {
  const { push } = useToast();
  const pool = section.questions?.length ?? 0;
  const [count, setCount] = useState(section.pick_count || Math.max(1, Math.min(2, pool - 1)));
  const [marks, setMarks] = useState(section.pick_marks || section.questions?.[0]?.marks || 10);
  const [busy, setBusy] = useState(false);

  const save = async (off = false) => {
    setBusy(true);
    try {
      const { questions: _q, ...rest } = section;
      await upsertSection(assessmentId, {
        ...rest,
        pick_count: off ? 0 : Number(count) || 0,
        pick_marks: Number(marks) || 1,
      });
      push('success', off ? 'Every candidate now gets every problem' : `Each candidate gets ${count} of ${pool} problems`);
      onSaved();
    } catch (e: any) {
      push('error', e.message);
    } finally {
      setBusy(false);
    }
  };

  const valid = count >= 1 && count < pool && marks >= 1;

  return (
    <Modal title={`Random problems — ${section.title}`} onClose={onClose}>
      {pool < 2 ? (
        <p className="muted">Add at least two problems to this section first, then choose how many each candidate gets.</p>
      ) : (
        <>
          <p className="muted mb">
            This section has {pool} problems. Give each candidate a random selection, so two candidates rarely get the same
            paper and a shared answer is less useful. Every drawn problem carries the same marks.
          </p>
          <div className="row mb" style={{ gap: 12 }}>
            <div className="field" style={{ margin: 0 }}>
              <label>Problems per candidate</label>
              <input type="number" min={1} max={pool - 1} value={count} onChange={(e) => setCount(Number(e.target.value))} style={{ width: 120 }} />
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label>Marks each</label>
              <input type="number" min={1} value={marks} onChange={(e) => setMarks(Number(e.target.value))} style={{ width: 120 }} />
            </div>
          </div>
          {!valid && <p className="err">Choose between 1 and {pool - 1} problems, worth at least 1 mark each.</p>}
          <p className="muted small">Section total: {count * marks} marks.</p>
        </>
      )}
      <div className="row mt" style={{ justifyContent: 'flex-end' }}>
        {section.pick_count ? <button className="secondary" disabled={busy} onClick={() => save(true)}>Give everyone every problem</button> : null}
        <button className="secondary" onClick={onClose}>Cancel</button>
        {pool >= 2 && <button disabled={busy || !valid} onClick={() => save(false)}>{busy ? 'Saving…' : 'Save'}</button>}
      </div>
    </Modal>
  );
};

export default PoolPick;
