export function normalizeServerUrl(input) {
  let url;
  try {
    url = new URL(String(input ?? '').trim());
  } catch {
    throw new Error('URL không hợp lệ (vd: https://bangnote.vercel.app)');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('URL phải bắt đầu bằng http:// hoặc https://');
  }
  return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
}

export function originPattern(serverUrl) {
  return `${new URL(serverUrl).origin}/*`;
}
