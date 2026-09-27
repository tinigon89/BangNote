export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export async function apiRequest(config, method, path, body, fetchImpl = fetch) {
  const headers = { authorization: `Bearer ${config.apiKey}` };
  if (body !== undefined) headers['content-type'] = 'application/json';

  let res;
  try {
    res = await fetchImpl(`${config.serverUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new ApiError(0, 'Không kết nối được server');
  }

  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data?.error || `Lỗi ${res.status}`);
  return data;
}

export const fetchTags = (config, fetchImpl) => apiRequest(config, 'GET', '/api/tags', undefined, fetchImpl);

export const createNote = (config, note, fetchImpl) => apiRequest(config, 'POST', '/api/notes', note, fetchImpl);
