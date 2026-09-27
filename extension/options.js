import { fetchTags } from './lib/api.js';
import { normalizeServerUrl, originPattern } from './lib/config.js';
import { loadConfig, saveConfig } from './lib/storage.js';

const $ = (id) => document.getElementById(id);
const status = (text, ok) => {
  $('status').textContent = text;
  $('status').className = ok === undefined ? '' : ok ? 'ok' : 'err';
};

/** Đọc form; ném Error khi không hợp lệ. Đồng bộ để request quyền ngay sau đó vẫn trong user gesture. */
function readForm() {
  const serverUrl = normalizeServerUrl($('serverUrl').value);
  const apiKey = $('apiKey').value.trim();
  if (!apiKey) throw new Error('Chưa nhập API key');
  return { serverUrl, apiKey };
}

async function withPermission(handler) {
  let config;
  try {
    config = readForm();
  } catch (err) {
    status(err.message, false);
    return;
  }
  const granted = await chrome.permissions.request({ origins: [originPattern(config.serverUrl)] });
  if (!granted) {
    status('Cần cấp quyền truy cập server để gửi ghi chú', false);
    return;
  }
  await handler(config);
}

$('form').addEventListener('submit', (event) => {
  event.preventDefault();
  withPermission(async (config) => {
    await saveConfig(config);
    $('serverUrl').value = config.serverUrl;
    status('Đã lưu. Menu chuột phải đang được cập nhật…', true);
  });
});

$('test').addEventListener('click', () => {
  withPermission(async (config) => {
    status('Đang kiểm tra…');
    try {
      const tags = await fetchTags(config);
      status(`Kết nối OK — ${tags.length} tag`, true);
    } catch (err) {
      status(err.message, false);
    }
  });
});

loadConfig().then((config) => {
  if (!config) return;
  $('serverUrl').value = config.serverUrl;
  $('apiKey').value = config.apiKey;
});
