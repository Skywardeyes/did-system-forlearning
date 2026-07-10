export function createListState({ pageSize = 10 } = {}) {
  return { search: '', page: 1, pageSize };
}

export function applyListAction(state, action) {
  if (action.type === 'search') return { ...state, search: action.value, page: 1 };
  if (action.type === 'pageSize') return { ...state, pageSize: Number(action.value), page: 1 };
  if (action.type === 'page') return { ...state, page: Number(action.value) };
  return state;
}

export function renderPagination({ page, totalPages, total }) {
  return `<div class="pagination"><span>共 ${total} 条 · ${page}/${totalPages} 页</span><button data-page="prev"${page <= 1 ? ' disabled' : ''}>上一页</button><button data-page="next"${page >= totalPages ? ' disabled' : ''}>下一页</button></div>`;
}
