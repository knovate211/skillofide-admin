import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Layout from '../../components/Layout';
import { useToast } from '../../components/Toast';
import {
  getProblemAdmin,
  saveProblem,
  previewStarters,
  verifyProblem,
  PROBLEM_TYPES,
  type CodingProblem,
  type ProblemParam,
  type VerifyResult,
} from '../../lib/api';
import { useCourses } from '../../lib/courses';

// How a coding problem works, which this screen is built around:
//   - The candidate writes ONE function. Its name, parameters and return type
//     are the "signature"; starter code in 5 languages is generated from it.
//   - Each test case gives a value for every parameter and the value the
//     function must return. Values are JSON: 5, "text", [1,2,3], true.
//   - Visible cases are shown as examples; hidden ones are only used to grade.

const LANGS = [
  { id: 'python', label: 'Python' },
  { id: 'javascript', label: 'JavaScript' },
  { id: 'java', label: 'Java' },
  { id: 'cpp', label: 'C++' },
  { id: 'go', label: 'Go' },
];

const EXAMPLE: Record<string, string> = {
  int: '5', long: '10000000000', double: '2.5', bool: 'true', string: '"hello"', char: '"a"',
  'int[]': '[1,2,3]', 'long[]': '[1,2,3]', 'double[]': '[1.5,2.0]', 'bool[]': '[true,false]',
  'string[]': '["a","b"]', 'int[][]': '[[1,2],[3,4]]', 'string[][]': '[["a","b"],["c"]]',
  TreeNode: '[3,9,20,null,null,15,7]', ListNode: '[1,2,3]',
};

const COMPARE = [
  { value: 'exact', label: 'Exact match' },
  { value: 'unordered', label: 'Any order (e.g. a list of pairs)' },
  { value: 'set', label: 'Any order, ignore duplicates' },
  { value: 'float', label: 'Decimal numbers (within 0.000001)' },
];

interface CaseRow { args: string[]; expected: string; hidden: boolean }

const isJson = (v: string) => {
  try {
    JSON.parse(v);
    return true;
  } catch {
    return false;
  }
};

const blank = (): CodingProblem => ({
  title: '', difficulty: 'Easy', topic: '', course_id: '', statement: '', constraints: [],
  is_private: true,
  signature: { entry_point: '', params: [{ name: 'nums', type: 'int[]' }], return_type: 'int', compare: 'exact' },
  test_cases: [],
});

const ProblemEditor: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const isNew = !id || id === 'new';
  const navigate = useNavigate();
  const { push } = useToast();
  const courses = useCourses();

  const [p, setP] = useState<CodingProblem>(blank);
  const [cases, setCases] = useState<CaseRow[]>([{ args: [''], expected: '', hidden: false }]);
  const [constraintsText, setConstraintsText] = useState('');
  const [editable, setEditable] = useState(true);
  const [ioMode, setIoMode] = useState('function');
  const [usedIn, setUsedIn] = useState(0);
  const [refs, setRefs] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState('');

  const [starters, setStarters] = useState<Record<string, string>>({});
  const [starterError, setStarterError] = useState('');
  const [previewLang, setPreviewLang] = useState('python');

  const [solLang, setSolLang] = useState('python');
  const [solCode, setSolCode] = useState('');
  const [checking, setChecking] = useState(false);
  const [check, setCheck] = useState<VerifyResult | null>(null);

  const load = useCallback(async () => {
    if (isNew || !id) return;
    setLoading(true);
    try {
      const r = await getProblemAdmin(id);
      const prob = { ...r.problem, constraints: r.problem.constraints || [], test_cases: r.problem.test_cases || [] };
      if (!prob.signature?.params) prob.signature = { ...blank().signature, ...(prob.signature || {}), params: [] };
      setP(prob);
      setConstraintsText(prob.constraints.join('\n'));
      const n = prob.signature.params.length;
      setCases(
        prob.test_cases.map((tc) => {
          const lines = tc.input.split('\n');
          return { args: Array.from({ length: n }, (_, i) => lines[i] ?? ''), expected: tc.expected_output, hidden: tc.is_hidden };
        }),
      );
      setEditable(r.editable);
      setIoMode(r.io_mode);
      setUsedIn(r.used_in_tests);
      setRefs(r.reference_solutions || {});
      setDirty(false);
    } catch (e: any) {
      push('error', e.message);
    } finally {
      setLoading(false);
    }
  }, [id, isNew, push]);

  useEffect(() => { load(); }, [load]);

  const patch = (fields: Partial<CodingProblem>) => { setP((x) => ({ ...x, ...fields })); setDirty(true); };
  const patchSig = (fields: Partial<CodingProblem['signature']>) =>
    patch({ signature: { ...p.signature, ...fields } });

  // Keep every case's argument list the same length as the parameter list.
  const setParams = (params: ProblemParam[]) => {
    patchSig({ params });
    setCases((cs) => cs.map((c) => ({ ...c, args: Array.from({ length: params.length }, (_, i) => c.args[i] ?? '') })));
  };
  const setParam = (i: number, f: Partial<ProblemParam>) =>
    setParams(p.signature.params.map((x, j) => (j === i ? { ...x, ...f } : x)));
  const removeParam = (i: number) => {
    const params = p.signature.params.filter((_, j) => j !== i);
    patchSig({ params });
    setCases((cs) => cs.map((c) => ({ ...c, args: c.args.filter((_, j) => j !== i) })));
  };

  const setCase = (i: number, f: Partial<CaseRow>) => {
    setCases((cs) => cs.map((c, j) => (j === i ? { ...c, ...f } : c)));
    setDirty(true);
  };
  const setArg = (i: number, k: number, v: string) =>
    setCase(i, { args: cases[i].args.map((a, j) => (j === k ? v : a)) });

  // Live starter preview — regenerated whenever the signature changes.
  const sigKey = JSON.stringify([p.signature.entry_point, p.signature.params, p.signature.return_type]);
  useEffect(() => {
    if (!editable) return;
    const s = p.signature;
    if (!s.entry_point.trim() || s.params.some((x) => !x.name.trim())) {
      setStarters({});
      setStarterError('');
      return;
    }
    const t = setTimeout(() => {
      previewStarters({ entry_point: s.entry_point, params: s.params, return_type: s.return_type })
        .then((r) => { setStarters(r.starters); setStarterError(''); })
        .catch((e) => { setStarters({}); setStarterError(e.message); });
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sigKey, editable]);

  // The solution box starts from the stored reference solution, else the
  // starter. Switching language reloads it; saving a passing solution does not,
  // so the results table stays on screen.
  useEffect(() => {
    setSolCode(refs[solLang] ?? starters[solLang] ?? '');
    setCheck(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [solLang]);
  useEffect(() => {
    setSolCode((cur) => cur || refs[solLang] || starters[solLang] || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refs, starters]);

  const badArg = (v: string) => v.trim() !== '' && !isJson(v.trim());
  const caseProblems = useMemo(
    () => cases.some((c) => c.args.some((a) => !a.trim() || badArg(a)) || !c.expected.trim() || badArg(c.expected)),
    [cases],
  );

  const save = async () => {
    setError('');
    if (!p.title.trim()) return setError('Give the problem a title.');
    if (!p.statement.trim()) return setError('Write the problem statement.');
    if (!p.signature.entry_point.trim()) return setError('Name the function candidates must write.');
    if (cases.length === 0) return setError('Add at least one test case.');
    if (caseProblems) return setError('Some test case values are empty or not valid JSON — they are outlined in red.');
    if (!cases.some((c) => !c.hidden)) return setError('Make at least one test case visible — it becomes the example.');
    setSaving(true);
    try {
      const body: CodingProblem = {
        ...p,
        constraints: constraintsText.split('\n').map((c) => c.trim()).filter(Boolean),
        test_cases: cases.map((c) => ({
          input: c.args.map((a) => a.trim()).join('\n'),
          expected_output: c.expected.trim(),
          is_hidden: c.hidden,
        })),
      };
      const r = await saveProblem(body, isNew ? undefined : id);
      push('success', isNew ? 'Problem created — now check it with a solution' : 'Problem saved');
      setDirty(false);
      if (isNew) navigate(`/problems/${r.id}`, { replace: true });
      else load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const runCheck = async () => {
    if (!id || isNew) return;
    setChecking(true);
    setCheck(null);
    try {
      const r = await verifyProblem(id, solLang, solCode);
      setCheck(r);
      if (r.all_passed) {
        push('success', 'Every test case passed — saved as the reference solution');
        setRefs((x) => ({ ...x, [solLang]: solCode }));
      }
    } catch (e: any) {
      push('error', e.message);
    } finally {
      setChecking(false);
    }
  };

  if (loading) return <Layout title="Coding problem"><p className="muted">Loading…</p></Layout>;

  const s = p.signature;
  const title = isNew ? 'New coding problem' : p.title || 'Coding problem';
  const ro = !editable;

  return (
    <Layout
      title={title}
      actions={
        <>
          <button className="secondary" onClick={() => navigate('/problems')}>Back</button>
          {!ro && <button disabled={saving} onClick={save}>{saving ? 'Saving…' : isNew ? 'Create problem' : 'Save changes'}</button>}
        </>
      }
    >
      {ro && (
        <div className="notice mb">
          This is a <strong>{ioMode}</strong> practice exercise in an older format. It can be used in tests but not edited here.
        </div>
      )}
      {usedIn > 0 && !ro && (
        <div className="notice mb">
          Used in {usedIn} test section{usedIn === 1 ? '' : 's'}. Changes apply to attempts started after you save.
        </div>
      )}
      {error && <div className="notice danger mb">{error}</div>}

      <fieldset disabled={ro} className="plain">
        {/* 1 — Details */}
        <div className="card card-pad mb">
          <h3 className="step">1 · Details</h3>
          <div className="row wrap">
            <div className="field grow" style={{ minWidth: 260 }}>
              <label>Title *</label>
              <input value={p.title} onChange={(e) => patch({ title: e.target.value })} placeholder="e.g. Maximum Profit" />
            </div>
            <div className="field">
              <label>Difficulty</label>
              <select value={p.difficulty} onChange={(e) => patch({ difficulty: e.target.value })}>
                <option>Easy</option><option>Medium</option><option>Hard</option>
              </select>
            </div>
            <div className="field">
              <label>Topic</label>
              <input value={p.topic} onChange={(e) => patch({ topic: e.target.value })} placeholder="e.g. Arrays" />
            </div>
          </div>
          <div className="row wrap">
            <div className="field grow">
              <label>Course</label>
              <select value={p.course_id} onChange={(e) => patch({ course_id: e.target.value })}>
                <option value="">General — any course can use it</option>
                {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="field grow">
              <label>Where it appears</label>
              <select value={p.is_private ? 'private' : 'public'} onChange={(e) => patch({ is_private: e.target.value === 'private' })}>
                <option value="private">Tests only — hidden from the practice list</option>
                <option value="public">Tests and the students’ practice list</option>
              </select>
            </div>
          </div>
        </div>

        {/* 2 — Statement */}
        <div className="card card-pad mb">
          <h3 className="step">2 · Problem statement</h3>
          <div className="field">
            <label>What should the function do? *</label>
            <textarea rows={6} value={p.statement} onChange={(e) => patch({ statement: e.target.value })}
              placeholder="You are given an array prices where prices[i] is the price of a stock on day i. Return the maximum profit…" />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Constraints (one per line, optional)</label>
            <textarea rows={3} value={constraintsText} onChange={(e) => { setConstraintsText(e.target.value); setDirty(true); }}
              placeholder={'1 <= prices.length <= 10^5\n0 <= prices[i] <= 10^4'} />
          </div>
        </div>

        {/* 3 — Signature */}
        <div className="card card-pad mb">
          <h3 className="step">3 · The function candidates write</h3>
          <div className="row wrap">
            <div className="field grow">
              <label>Function name *</label>
              <input value={s.entry_point} onChange={(e) => patchSig({ entry_point: e.target.value })} placeholder="maxProfit" className="mono" />
            </div>
            <div className="field">
              <label>Returns</label>
              <select value={s.return_type} onChange={(e) => patchSig({ return_type: e.target.value })}>
                {PROBLEM_TYPES.map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div className="field grow">
              <label>How answers are compared</label>
              <select value={s.compare} onChange={(e) => patchSig({ compare: e.target.value })}>
                {COMPARE.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
          </div>
          <label>Parameters (in order)</label>
          {s.params.map((prm, i) => (
            <div key={i} className="row mb" style={{ gap: 8 }}>
              <span className="muted small" style={{ width: 18 }}>{i + 1}.</span>
              <input className="mono" style={{ maxWidth: 220 }} value={prm.name} placeholder="name" onChange={(e) => setParam(i, { name: e.target.value })} />
              <select style={{ maxWidth: 160 }} value={prm.type} onChange={(e) => setParam(i, { type: e.target.value })}>
                {PROBLEM_TYPES.map((t) => <option key={t}>{t}</option>)}
              </select>
              <span className="muted small">e.g. <code>{EXAMPLE[prm.type]}</code></span>
              {s.params.length > 1 && <button type="button" className="ghost sm" onClick={() => removeParam(i)}>✕</button>}
            </div>
          ))}
          <button type="button" className="secondary sm" onClick={() => setParams([...s.params, { name: '', type: 'int' }])}>+ Add parameter</button>

          <div className="starter mt">
            <div className="row between">
              <span className="muted small">Starter code candidates will see — generated automatically</span>
              <div className="seg">
                {LANGS.map((l) => (
                  <button type="button" key={l.id} className={previewLang === l.id ? 'on' : ''} onClick={() => setPreviewLang(l.id)}>{l.label}</button>
                ))}
              </div>
            </div>
            {starterError
              ? <p className="err">{starterError}</p>
              : <pre className="code-block">{starters[previewLang] || 'Name the function and its parameters to see the starter code.'}</pre>}
          </div>
        </div>

        {/* 4 — Test cases */}
        <div className="card card-pad mb">
          <h3 className="step">4 · Test cases</h3>
          <p className="muted small" style={{ marginTop: 0 }}>
            Write each value as JSON: numbers <code>5</code>, text in quotes <code>"abc"</code>, lists <code>[1,2,3]</code>, <code>true</code>/<code>false</code>.
            Visible cases are shown to candidates as examples; hidden ones are only used for grading.
          </p>
          <div className="scroll-x">
            <table className="cases">
              <thead>
                <tr>
                  <th>#</th>
                  {s.params.map((prm, k) => <th key={k} className="mono">{prm.name || `arg ${k + 1}`} <span className="muted">{prm.type}</span></th>)}
                  <th>Expected result <span className="muted">{s.return_type}</span></th>
                  <th>Hidden</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {cases.map((c, i) => (
                  <tr key={i}>
                    <td className="muted">{i + 1}</td>
                    {c.args.map((a, k) => (
                      <td key={k}>
                        <input className={`mono${badArg(a) ? ' invalid' : ''}`} value={a} placeholder={EXAMPLE[s.params[k]?.type] || ''}
                          onChange={(e) => setArg(i, k, e.target.value)} />
                      </td>
                    ))}
                    <td>
                      <input className={`mono${badArg(c.expected) ? ' invalid' : ''}`} value={c.expected} placeholder={EXAMPLE[s.return_type] || ''}
                        onChange={(e) => setCase(i, { expected: e.target.value })} />
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <input type="checkbox" checked={c.hidden} onChange={(e) => setCase(i, { hidden: e.target.checked })} />
                    </td>
                    <td>
                      <button type="button" className="ghost sm" onClick={() => { setCases((cs) => cs.filter((_, j) => j !== i)); setDirty(true); }}>✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="row mt">
            <button type="button" className="secondary sm"
              onClick={() => { setCases((cs) => [...cs, { args: s.params.map(() => ''), expected: '', hidden: cs.length >= 2 }]); setDirty(true); }}>
              + Add test case
            </button>
            <span className="muted small">
              {cases.filter((c) => !c.hidden).length} visible · {cases.filter((c) => c.hidden).length} hidden
            </span>
          </div>
        </div>
      </fieldset>

      {/* 5 — Check */}
      {!ro && (
        <div className="card card-pad mb">
          <h3 className="step">5 · Check it with a solution</h3>
          {isNew ? (
            <p className="muted">Create the problem first, then paste a correct solution here to check every test case.</p>
          ) : (
            <>
              <p className="muted small" style={{ marginTop: 0 }}>
                Paste a correct solution and run it against <strong>all</strong> test cases, hidden ones included. It proves the
                expected results are right before candidates see the problem. A passing solution is saved as the reference.
              </p>
              {dirty && <div className="notice mb">You have unsaved changes — save first, the check runs against the saved test cases.</div>}
              <div className="row mb">
                <div className="seg">
                  {LANGS.map((l) => (
                    <button type="button" key={l.id} className={solLang === l.id ? 'on' : ''} onClick={() => setSolLang(l.id)}>
                      {l.label}{refs[l.id] ? ' ✓' : ''}
                    </button>
                  ))}
                </div>
              </div>
              <textarea className="mono code-input" rows={12} value={solCode} onChange={(e) => setSolCode(e.target.value)} spellCheck={false} />
              <div className="row mt">
                <button disabled={checking || dirty || !solCode.trim()} onClick={runCheck}>{checking ? 'Running…' : 'Run all test cases'}</button>
                {check && (
                  <span className={check.all_passed ? 'ok-text' : 'err'}>
                    {check.all_passed
                      ? `All ${check.result.test_results.length} passed`
                      : `${check.result.test_results.filter((t) => t.status === 'Accepted').length} of ${check.result.test_results.length} passed`}
                  </span>
                )}
              </div>
              {check?.result.compile_error && <pre className="code-block err mt">{check.result.compile_error}</pre>}
              {check && check.result.test_results.length > 0 && (
                <div className="scroll-x mt">
                  <table className="card">
                    <thead><tr><th>#</th><th>Input</th><th>Expected</th><th>Got</th><th>Result</th><th>Time</th></tr></thead>
                    <tbody>
                      {check.result.test_results.map((t, i) => (
                        <tr key={i}>
                          <td className="muted">{i + 1}{cases[i]?.hidden ? ' 🔒' : ''}</td>
                          <td className="mono small">{t.input}</td>
                          <td className="mono small">{t.expected_output}</td>
                          <td className="mono small">{t.actual_output || t.error || '—'}</td>
                          <td><span className={`badge ${t.status === 'Accepted' ? 'published' : 'archived'}`}>{t.status}</span></td>
                          <td className="muted small">{t.execution_ms} ms</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </Layout>
  );
};

export default ProblemEditor;
