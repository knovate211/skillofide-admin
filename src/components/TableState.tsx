import React from 'react';

interface Props {
  /** While true, shimmer placeholders stand in for the rows that are coming. */
  loading: boolean;
  /** Column count, so the placeholder keeps the table's real shape. */
  columns: number;
  /** Headline for the empty state, e.g. "No users found". */
  title: string;
  /** One line saying what to do about it. */
  hint?: string;
  /** How many placeholder rows to draw while loading. */
  rows?: number;
}

/* The two states a table can be in before it has anything to show. Loading
   draws skeleton rows rather than the word "Loading…", so the table does not
   collapse to one line and then jump back to full height. */
const TableState: React.FC<Props> = ({ loading, columns, title, hint, rows = 5 }) => {
  if (loading) {
    return (
      <>
        {Array.from({ length: rows }).map((_, r) => (
          <tr key={r}>
            {Array.from({ length: columns }).map((_, c) => (
              <td key={c}>
                {/* Varying widths keep the placeholder from reading as a grid. */}
                <span className="skeleton" style={{ width: `${[70, 85, 55, 62, 78, 48][(r + c) % 6]}%` }} />
              </td>
            ))}
          </tr>
        ))}
      </>
    );
  }

  return (
    <tr>
      <td colSpan={columns}>
        <div className="empty">
          <span className="icon" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 11.5V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7.5" />
              <path d="M3 11.5 5.2 5a2 2 0 0 1 1.9-1.4h9.8A2 2 0 0 1 18.8 5L21 11.5" />
              <path d="M9 11.5h6" />
            </svg>
          </span>
          <b>{title}</b>
          {hint && <p>{hint}</p>}
        </div>
      </td>
    </tr>
  );
};

export default TableState;
