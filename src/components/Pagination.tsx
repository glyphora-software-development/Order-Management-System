import { PAGE_SIZE } from "./listPage";

export function Pagination({ current, pages, count, onPage }: {
  current: number; pages: number; count: number; onPage: (page: number) => void;
}) {
  if (pages < 2) return null;
  return <nav className="ui-pagination" aria-label="列表分页">
    <span>第 {current} / {pages} 页 · 共 {count} 条，每页 {PAGE_SIZE} 条</span>
    <div className="ui-actions">
      <button className="ui-button" type="button" disabled={current === 1} onClick={() => onPage(current - 1)}>上一页</button>
      <button className="ui-button" type="button" disabled={current === pages} onClick={() => onPage(current + 1)}>下一页</button>
    </div>
  </nav>;
}
