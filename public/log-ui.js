function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  })[char]);
}

export function createLogFilters() {
  return { search: '', type: '', success: '', level: '', module: '', startTime: '', endTime: '', page: 1, pageSize: 10 };
}

export function applyLogFilter(state, action) {
  if (action.type === 'page') return { ...state, page: Number(action.value) };
  return { ...state, [action.type]: action.type === 'pageSize' ? Number(action.value) : action.value, page: 1 };
}

export function renderLogLevel(level) {
  const text = { info: 'INFO', warn: 'WARN', error: 'ERROR' }[level] || 'UNKNOWN';
  const safeLevel = ['info', 'warn', 'error'].includes(level) ? level : 'unknown';
  return `<span class="log-level ${safeLevel}">${text}</span>`;
}

export function renderLogRow(entry, { formatDate = (value) => value } = {}) {
  return `<tr>
    <td>${escapeHtml(formatDate(entry.occurredAt))}</td>
    <td>${renderLogLevel(entry.level)}<small>${escapeHtml(entry.type)}</small></td>
    <td><strong>${escapeHtml(entry.action)}</strong><small>${escapeHtml(entry.module)}</small></td>
    <td><strong>${entry.success ? '成功' : '失败'}</strong><small>${escapeHtml(entry.targetName || entry.targetId || '-')}</small></td>
    <td>${escapeHtml(entry.message)}</td>
    <td><button class="table-action" data-log-detail="${escapeHtml(entry.id)}">详情</button></td>
  </tr>`;
}
