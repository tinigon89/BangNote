export async function loadConfig() {
  const { serverUrl, apiKey } = await chrome.storage.local.get(['serverUrl', 'apiKey']);
  return serverUrl && apiKey ? { serverUrl, apiKey } : null;
}

export async function saveConfig({ serverUrl, apiKey }) {
  await chrome.storage.local.set({ serverUrl, apiKey });
}

export async function loadCachedTags() {
  const { tags } = await chrome.storage.local.get('tags');
  return Array.isArray(tags) ? tags : [];
}

export async function saveCachedTags(tags) {
  await chrome.storage.local.set({ tags });
}
