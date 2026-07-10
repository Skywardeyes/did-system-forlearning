export function normalizePageSize(value) {
  const size = Number(value);
  return [10, 20, 50].includes(size) ? size : 10;
}

export function queryRecords(records, options = {}) {
  const fields = options.fields || [];
  const search = String(options.search || '').trim().toLocaleLowerCase();
  const filtered = search
    ? records.filter((record) => fields.some((field) => (
      String(record[field] ?? '').toLocaleLowerCase().includes(search)
    )))
    : [...records];

  filtered.sort((left, right) => {
    const timeOrder = String(right[options.timeField] || '')
      .localeCompare(String(left[options.timeField] || ''));
    return timeOrder || String(right.id).localeCompare(String(left.id));
  });

  const pageSize = normalizePageSize(options.pageSize);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const page = Math.min(Math.max(1, Number(options.page) || 1), totalPages);

  return {
    items: filtered.slice((page - 1) * pageSize, page * pageSize),
    total: filtered.length,
    page,
    pageSize,
    totalPages,
  };
}
