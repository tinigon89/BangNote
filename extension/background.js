import { createNote, fetchTags } from './lib/api.js';
import { buildMenuItems, parseMenuId } from './lib/menu.js';
import { pickText } from './lib/selection.js';
import { loadCachedTags, loadConfig, saveCachedTags } from './lib/storage.js';

// Dựng lại menu tuần tự để hai lần dựng chồng nhau không tạo trùng id.
let menuChain = Promise.resolve();
function rebuildMenus() {
  menuChain = menuChain.then(doRebuildMenus).catch((err) => console.error('BangNote menu', err));
  return menuChain;
}

async function doRebuildMenus() {
  const config = await loadConfig();
  let tags = await loadCachedTags();
  if (config) {
    try {
      tags = await fetchTags(config);
      await saveCachedTags(tags);
    } catch (err) {
      console.warn('BangNote: không tải được tag', err);
    }
  }
  await chrome.contextMenus.removeAll();
  for (const item of buildMenuItems({ configured: !!config, tags })) {
    await new Promise((resolve) =>
      chrome.contextMenus.create(item, () => {
        if (chrome.runtime.lastError) console.warn('BangNote menu', chrome.runtime.lastError.message);
        resolve();
      }),
    );
  }
}

function notify(message) {
  chrome.notifications.create({ type: 'basic', iconUrl: 'icons/icon128.png', title: 'BangNote', message });
}

async function flash(tabId, ok) {
  await chrome.action.setBadgeBackgroundColor({ tabId, color: ok ? '#16a34a' : '#dc2626' });
  await chrome.action.setBadgeText({ tabId, text: ok ? '✓' : '!' });
  setTimeout(() => chrome.action.setBadgeText({ tabId, text: '' }).catch(() => undefined), 2000);
}

async function readSelection(tabId, frameId) {
  try {
    const [res] = await chrome.scripting.executeScript({
      target: { tabId, frameIds: [frameId] },
      func: () => window.getSelection()?.toString() ?? '',
    });
    return res?.result;
  } catch {
    return undefined; // PDF viewer, chrome://, Web Store… không cho chạy script
  }
}

async function saveSelection(tab, frameId, selectionText, tagIds) {
  if (!tab?.id) return;
  const config = await loadConfig();
  if (!config) {
    chrome.runtime.openOptionsPage();
    return;
  }
  const content = pickText(await readSelection(tab.id, frameId), selectionText);
  if (!content.trim()) {
    await flash(tab.id, false);
    notify('Không có chữ nào được chọn');
    return;
  }
  try {
    await createNote(config, {
      content,
      source: 'extension',
      tagIds,
      sourceUrl: tab.url ?? null,
      sourceTitle: tab.title ?? null,
    });
    await flash(tab.id, true);
  } catch (err) {
    await flash(tab.id, false);
    notify(err.message);
  }
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create('refresh-tags', { periodInMinutes: 30 });
  rebuildMenus();
});
chrome.runtime.onStartup.addListener(() => rebuildMenus());
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'refresh-tags') rebuildMenus();
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes.serverUrl || changes.apiKey)) rebuildMenus();
});
chrome.action.onClicked.addListener(() => chrome.runtime.openOptionsPage());

chrome.contextMenus.onClicked.addListener((info, tab) => {
  const action = parseMenuId(String(info.menuItemId));
  if (!action) return;
  if (action.kind === 'setup') chrome.runtime.openOptionsPage();
  else if (action.kind === 'refresh') rebuildMenus().then(() => notify('Đã làm mới danh sách tag'));
  else saveSelection(tab, info.frameId ?? 0, info.selectionText, action.tagIds);
});

chrome.commands.onCommand.addListener((command, tab) => {
  if (command === 'save-selection') saveSelection(tab, 0, undefined, []);
});
