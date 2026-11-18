import { useState } from "react";

export const PAGE_SIZE = 12;

export function paginate<T>(items: readonly T[], page: number, size = PAGE_SIZE) {
  const pages = Math.max(1, Math.ceil(items.length / size));
  const current = Math.min(pages, Math.max(1, page));
  const start = (current - 1) * size;
  return { current, pages, rows: items.slice(start, start + size) };
}
export function useListPage<T>(items: readonly T[], key: string) {
  const [position, setPosition] = useState({ key, page: 1 });
  const result = paginate(items, position.key === key ? position.page : 1);
  return { ...result, onPage: (page: number) => setPosition({ key, page }) };
}
