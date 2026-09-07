import React, { useCallback, useEffect, useState } from 'react';
import Layout from '../../components/Layout';
import Confirm from '../../components/Confirm';
import McqForm from './McqForm';
import McqImport from './McqImport';
import { useToast } from '../../components/Toast';
import TableState from '../../components/TableState';
import { listMcq, deleteMcq, type McqQuestion } from '../../lib/api';

const McqList: React.FC = () => {
  const { push } = useToast();
  const [items, setItems] = useState<McqQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<McqQuestion | null>(null);
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [deleting, setDeleting] = useState<McqQuestion | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listMcq(`pageSize=200&search=${encodeURIComponent(search)}`);
      setItems(res.questions || []);
    } catch (e: any) {
      push('error', e.message);
    } finally {
      setLoading(false);
    }
  }, [search, push]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  const confirmDelete = async () => {
    if (!deleting?.id) return;
    try {
      await deleteMcq(deleting.id);
      push('success', 'Question deleted');
      setDeleting(null);
      load();
    } catch (e: any) {
      push('error', e.message);
    }
  };

  return (
    <Layout title="Question bank" actions={<><button className="secondary" onClick={() => setImporting(true)}>Import Excel</button><button onClick={() => setCreating(true)}>New question</button></>}>
      <div className="row between mb">
        <input style={{ maxWidth: 320 }} placeholder="Search questions…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <span className="muted">{items.length} shown</span>
      </div>

      <div className="scroll-x">
        <table className="card">
          <thead>
            <tr><th>Question</th><th>Topic</th><th>Difficulty</th><th>Type</th><th>Options</th><th></th></tr>
          </thead>
          <tbody>
            {loading || items.length === 0 ? (
              <TableState
                loading={loading}
                columns={6}
                title="No questions yet"
                hint="Add one by hand, or import a spreadsheet."
              />
            ) : (
              items.map((q) => (
                <tr key={q.id}>
                  <td style={{ maxWidth: 420 }}>{q.body}</td>
                  <td>{q.topic}</td>
                  <td>{q.difficulty}</td>
                  <td>{q.kind}</td>
                  <td>{q.options?.length ?? '—'}</td>
                  <td className="actions">
                    <button className="ghost sm" onClick={() => setEditing(q)}>Edit</button>
                    <button className="ghost sm" onClick={() => setDeleting(q)}>Delete</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {creating && <McqForm onClose={() => setCreating(false)} onSaved={() => { setCreating(false); load(); }} />}
      {importing && <McqImport onClose={() => setImporting(false)} onImported={() => { setImporting(false); load(); }} />}
      {editing && <McqForm existing={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
      {deleting && (
        <Confirm
          title="Delete question"
          message="Delete this question from the bank? Tests already using it keep their copy."
          confirmLabel="Delete"
          danger
          onConfirm={confirmDelete}
          onCancel={() => setDeleting(null)}
        />
      )}
    </Layout>
  );
};

export default McqList;
