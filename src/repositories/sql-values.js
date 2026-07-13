export function sqlDate(value) {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('Invalid timestamp value');
  return date;
}

export function sqlPagination(page, pageSize, { defaultSize = 20, maxSize = 100 } = {}) {
  const parsedPage = Number(page);
  const parsedSize = Number(pageSize);
  const safePage = Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const safeSize = Number.isInteger(parsedSize) && parsedSize > 0 ? Math.min(parsedSize, maxSize) : defaultSize;
  return { page: safePage, pageSize: safeSize, offset: (safePage - 1) * safeSize };
}
