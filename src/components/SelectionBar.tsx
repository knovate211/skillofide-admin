import React from 'react';

// Shown while rows are selected. When every row on the page is ticked and more
// rows match, it offers to widen the selection to all of them.
const SelectionBar: React.FC<{
  count: number;
  total: number;
  pageSize: number;
  allOnPage: boolean;
  allMatching: boolean;
  noun: string;
  onSelectAll: () => void;
  onClear: () => void;
  children: React.ReactNode;
}> = ({ count, total, pageSize, allOnPage, allMatching, noun, onSelectAll, onClear, children }) => (
  <div className="bulk-bar mb">
    <strong>{allMatching ? `All ${total} ${noun} selected` : `${count} selected`}</strong>
    {!allMatching && allOnPage && total > Math.min(count, pageSize) && (
      <button className="linkBtn" onClick={onSelectAll}>Select all {total} matching</button>
    )}
    <span className="grow" />
    {children}
    <button className="ghost sm" onClick={onClear}>Clear selection</button>
  </div>
);

export default SelectionBar;
