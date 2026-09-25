import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { CodeSnapshot } from '../../lib/api';

// Replays how one coding answer was written, from the editor snapshots the
// test player sent while the candidate worked. A solution typed line by line
// grows in small steps; one pasted or generated lands as a single tall bar on
// the timeline. Proctoring events (leaving the tab, pasting…) are marked on
// the same timeline, so "left the tab, then 300 characters appeared" is
// visible at a glance.

// Same rule as the server's integrity report: at least 100 characters arriving
// faster than 12 a second since the previous snapshot — faster than anyone
// types, however short the answer.
const BURST_MIN = 100;
const BURST_RATE = 12;

const isBurst = (snaps: CodeSnapshot[], n: number) => {
  const s = snaps[n];
  if (s.reason === 'start' || s.reason === 'language' || s.chars_added < BURST_MIN) return false;
  if (n === 0) return true;
  const gap = (new Date(s.at).getTime() - new Date(snaps[n - 1].at).getTime()) / 1000;
  return gap <= 0 || s.chars_added / gap >= BURST_RATE;
};

const REASON: Record<CodeSnapshot['reason'], string> = {
  start: 'Opened the question',
  edit: 'Edited',
  language: 'Switched language / reset',
  run: 'Ran the code',
  submit: 'Submitted',
};

const CodePlayback: React.FC<{
  snapshots: CodeSnapshot[];
  events: { occurred_at: string; kind: string }[];
}> = ({ snapshots, events }) => {
  const [i, setI] = useState(snapshots.length - 1);
  const [playing, setPlaying] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(() => setI(snapshots.length - 1), [snapshots.length]);

  useEffect(() => {
    if (!playing) return;
    timer.current = window.setInterval(() => {
      setI((n) => {
        if (n >= snapshots.length - 1) {
          setPlaying(false);
          return n;
        }
        return n + 1;
      });
    }, 700);
    return () => { if (timer.current) window.clearInterval(timer.current); };
  }, [playing, snapshots.length]);

  const t0 = snapshots.length ? new Date(snapshots[0].at).getTime() : 0;
  const t1 = snapshots.length ? new Date(snapshots[snapshots.length - 1].at).getTime() : 0;
  const span = Math.max(1, t1 - t0);
  const maxAdded = Math.max(1, ...snapshots.map((s) => (s.reason === 'start' || s.reason === 'language' ? 0 : s.chars_added)));
  const bursts = snapshots.filter((_, n) => isBurst(snapshots, n)).length;

  const marks = useMemo(
    () => events
      .map((e) => ({ ...e, t: new Date(e.occurred_at).getTime() }))
      .filter((e) => e.t >= t0 - 1000 && e.t <= t1 + 1000 && ['tab_blur', 'paste', 'fullscreen_exit', 'devtools', 'screenshot'].includes(e.kind)),
    [events, t0, t1],
  );

  if (!snapshots.length) {
    return <p className="muted small">No playback recorded for this answer (it was written before playback was switched on, or in an old browser tab).</p>;
  }

  const cur = snapshots[Math.min(i, snapshots.length - 1)];
  const elapsed = Math.round((new Date(cur.at).getTime() - t0) / 1000);

  return (
    <div className="playback">
      <div className="row between wrap" style={{ gap: 8 }}>
        <strong className="small">Code playback</strong>
        <span className="muted small">
          {snapshots.length} snapshots over {Math.round(span / 60000)} min
          {bursts > 0 && <> · <span className="sig-high-text">{bursts} large insert{bursts === 1 ? '' : 's'}</span></>}
        </span>
      </div>

      {/* Timeline: one bar per snapshot, height = characters added. */}
      <div className="pb-track" role="img" aria-label="Characters added over time">
        {snapshots.map((s, n) => {
          const x = ((new Date(s.at).getTime() - t0) / span) * 100;
          const added = s.reason === 'start' || s.reason === 'language' ? 0 : s.chars_added;
          return (
            <button
              key={n}
              className={`pb-bar${isBurst(snapshots, n) ? ' burst' : ''}${n === i ? ' on' : ''}${s.reason === 'submit' ? ' submit' : ''}`}
              style={{ left: `${x}%`, height: `${Math.max(8, (added / maxAdded) * 100)}%` }}
              onClick={() => { setPlaying(false); setI(n); }}
              title={`${new Date(s.at).toLocaleTimeString()} · ${REASON[s.reason]} · +${s.chars_added} chars`}
              aria-label={`Snapshot ${n + 1}`}
            />
          );
        })}
        {marks.map((m, n) => (
          <span key={`m${n}`} className="pb-mark" style={{ left: `${((m.t - t0) / span) * 100}%` }}
            title={`${new Date(m.t).toLocaleTimeString()} · ${m.kind.replace(/_/g, ' ')}`} />
        ))}
      </div>

      <div className="row wrap" style={{ gap: 8, margin: '8px 0' }}>
        <button className="secondary sm" onClick={() => { setI(0); setPlaying(true); }}>▶ Play from start</button>
        {playing && <button className="secondary sm" onClick={() => setPlaying(false)}>Pause</button>}
        <input
          type="range"
          min={0}
          max={snapshots.length - 1}
          value={i}
          onChange={(e) => { setPlaying(false); setI(Number(e.target.value)); }}
          style={{ flex: 1, minWidth: 160 }}
          aria-label="Playback position"
        />
        <span className="muted small nowrap">
          {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')} · {REASON[cur.reason]}
          {cur.reason !== 'start' && cur.reason !== 'language' ? ` · +${cur.chars_added} chars` : ''}
        </span>
      </div>
      <pre className={`answer-text code${isBurst(snapshots, Math.min(i, snapshots.length - 1)) ? ' burst' : ''}`}>{cur.code}</pre>
      <p className="muted small" style={{ margin: '4px 0 0' }}>
        Red bars are code that appeared faster than anyone types ({BURST_MIN}+ characters at over {BURST_RATE}/s); dashed red lines mark leaving the tab, pasting or other proctoring events.
      </p>
    </div>
  );
};

export default CodePlayback;
