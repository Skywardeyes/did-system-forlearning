export function createListState({ pageSize = 10 } = {}) {
  return { search: '', page: 1, pageSize };
}

export function applyListAction(state, action) {
  if (action.type === 'search') return { ...state, search: action.value, page: 1 };
  if (action.type === 'pageSize') return { ...state, pageSize: Number(action.value), page: 1 };
  if (action.type === 'page') return { ...state, page: Number(action.value) };
  return state;
}

export function renderPagination({ page, totalPages, total }, { id = 'list', pageSize = 10 } = {}) {
  const options = [10, 20, 50]
    .map((size) => `<option value="${size}"${size === Number(pageSize) ? ' selected' : ''}>${size}</option>`)
    .join('');
  return `<div class="pagination"><label class="page-size-label" for="${id}-page-size">每页展示</label><select id="${id}-page-size" class="page-size-select">${options}</select><span class="page-summary">共 ${total} 条 · ${page}/${totalPages} 页</span><button data-page="prev"${page <= 1 ? ' disabled' : ''}>上一页</button><button data-page="next"${page >= totalPages ? ' disabled' : ''}>下一页</button></div>`;
}
