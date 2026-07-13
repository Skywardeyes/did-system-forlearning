const SESSION_KEY = 'did-vc-v2-session';

function mapV2Path(path) {
  return path.startsWith('/api/') ? `/api/v2/${path.slice('/api/'.length)}` : path;
}
async function readBody(response) {
  const text = await response.text();
  if (!text) return {};
  try { return JSON.parse(text); } catch { return { error: text }; }
}

export function createSessionApi({ fetchImpl = globalThis.fetch, storage = globalThis.sessionStorage } = {}) {
  let session = { mode: 'legacy', accessToken: null, actor: null, tenant: null, roles: [] };

  const setSession = (next) => {
    session = next;
    if (storage) storage.setItem(SESSION_KEY, JSON.stringify(next));
    return session;
  };

  async function initialize() {
    const response = await fetchImpl('/api/v2/session/local', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
    });
    const body = await readBody(response);
    if (response.ok && body.accessToken) {
      return setSession({ mode: 'v2', accessToken: body.accessToken, actor: body.actor,
        tenant: body.tenant, roles: body.roles || [], expiresAt: body.expiresAt });
    }

    // Older teaching fixtures do not expose V2. Keep them usable while production mode is migrated.
    const legacy = await fetchImpl('/api/state', { headers: { 'Content-Type': 'application/json' } });
    if (legacy.ok) return setSession({ mode: 'legacy', accessToken: null, actor: null, tenant: null, roles: [] });
    throw new Error(body.error || '无法建立已认证的 V2 会话');
  }

  async function api(path, options = {}) {
    const target = session.mode === 'v2' ? mapV2Path(path) : path;
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    if (session.accessToken) headers.Authorization = `Bearer ${session.accessToken}`;
    const response = await fetchImpl(target, { ...options, headers });
    const body = await readBody(response);
    if (!response.ok) throw new Error(body.error || '请求失败');
    return body;
  }

  return { initialize, api, getSession: () => ({ ...session }) };
}
