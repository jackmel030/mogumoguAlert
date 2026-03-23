// ─── Constants ───
const MAX_TIMERS = 10;
const RESPAWN_SECONDS = 300; // 5 minutes
const MANUAL_BUFFER_SECONDS = 15; // human reaction buffer
const EXPIRED_AUTO_REMOVE_MS = 10 * 60 * 1000; // 10 minutes

// 蘑菇大小（基礎類型）
const MUSHROOM_SIZES = {
  small:  { iconSize: '20px', sizeKey: 'size.small' },
  normal: { iconSize: '28px', sizeKey: 'size.normal' },
  large:  { iconSize: '38px', sizeKey: 'size.large' },
  huge:   { iconSize: '44px', sizeKey: 'size.huge' },
};

// 蘑菇顏色（OCR 偵測）
const MUSHROOM_COLOR_INFO = {
  'purple':   { icon: '🟣', nameKey: 'color.purple' },
  'yellow':   { icon: '⚡', nameKey: 'color.yellow' },
  'ice-blue': { icon: '🧊', nameKey: 'color.ice-blue' },
  'blue':     { icon: '🔵', nameKey: 'color.blue' },
  'green':    { icon: '🟢', nameKey: 'color.green' },
  'red':      { icon: '🔴', nameKey: 'color.red' },
  'pink':     { icon: '🩷', nameKey: 'color.pink' },
  'gray':     { icon: '⚪', nameKey: 'color.gray' },
};

// 組合蘑菇資訊（大小 + 顏色）
function getMushroomInfo(type, colorKey) {
  const size = MUSHROOM_SIZES[type] || MUSHROOM_SIZES.normal;
  const sizeLabel = i18n.t(size.sizeKey);
  const color = MUSHROOM_COLOR_INFO[colorKey];
  if (color) {
    return { icon: color.icon, iconSize: size.iconSize, name: `${sizeLabel} ${i18n.t(color.nameKey)}` };
  }
  return { icon: '🍄', iconSize: size.iconSize, name: `${sizeLabel} ${i18n.t('mushroom.default')}` };
}


// ─── State ───
let timers = loadTimers();

function loadTimers() {
  try {
    const data = JSON.parse(localStorage.getItem('pikmin-timers') || '[]');
    if (!Array.isArray(data)) return [];
    // 啟動時清除過期超過 10 分鐘的計時器
    const now = Date.now();
    return data.filter(t => !t.ready || (now - (t.readyAt || t.endTime)) < EXPIRED_AUTO_REMOVE_MS);
  } catch {
    localStorage.removeItem('pikmin-timers');
    return [];
  }
}
let selectedType = 'normal';
let selectedMinutes = 5;
let tickInterval = null;

// ─── Theme ───
function initTheme() {
  const saved = localStorage.getItem('pikmin-theme');
  if (saved) {
    setTheme(saved);
  } else {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    setTheme(prefersDark ? 'dark' : 'light');
  }
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    if (!localStorage.getItem('pikmin-theme')) {
      setTheme(e.matches ? 'dark' : 'light');
    }
  });
}

function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const btn = document.getElementById('theme-toggle');
  if (btn) btn.textContent = theme === 'light' ? '☀️' : '🌙';
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = theme === 'light' ? '#4caf50' : '#2d5a1b';
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  const next = current === 'dark' ? 'light' : 'dark';
  setTheme(next);
  localStorage.setItem('pikmin-theme', next);
}

// ─── Init ───
document.addEventListener('DOMContentLoaded', () => {
  i18n.init();
  initLangSelect();
  initTheme();
  renderTimers();
  startTick();
  checkNotificationPermission();
  registerServiceWorker();
  setupPasteListener();
  initTimeButtons();

  // 語言切換時重新渲染動態內容
  document.addEventListener('langchange', () => {
    renderTimers();
    initTimeButtons();
  });

  // 原生 App：排程所有未到期計時器的通知 + 監聽前景恢復
  if (Platform.isNative()) {
    scheduleAllTimerNotifications();
    // Capacitor App plugin 監聽 appStateChange
    const appPlugin = window.Capacitor?.Plugins?.App;
    if (appPlugin) {
      appPlugin.addListener('appStateChange', (state) => {
        if (state.isActive) onAppResume();
      });
    }
  }
  // PWA：visibilitychange 作為 fallback
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') onAppResume();
  });
});

function initLangSelect() {
  const sel = document.getElementById('lang-select');
  if (sel) sel.value = i18n.getLang();
}

function initTimeButtons() {
  document.querySelectorAll('.time-btn[data-minutes]:not([data-minutes="0"])').forEach(btn => {
    const n = btn.getAttribute('data-minutes');
    btn.textContent = i18n.t('modal.minutes', { n });
  });
}

// ─── Service Worker ───
async function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    try {
      await navigator.serviceWorker.register('sw.js');
    } catch (e) {
      console.log('SW registration failed:', e);
    }
  }
}

// ─── Notification ───
async function checkNotificationPermission() {
  // Native App 不需要 A2HS 提示
  if (Platform.isNative()) {
    const status = await Platform.getNotificationStatus();
    if (status === 'default' || status === 'prompt') {
      showNotifyBanner();
    }
    return;
  }

  // PWA: iOS standalone check
  const isStandalone = window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

  if (isIOS && !isStandalone) {
    showAddToHomeScreenBanner();
    return;
  }

  if (!('Notification' in window)) return;
  if (Notification.permission === 'default') {
    showNotifyBanner();
  }
}

function showAddToHomeScreenBanner() {
  const existing = document.querySelector('.a2hs-banner');
  if (existing) return;

  const banner = document.createElement('div');
  banner.className = 'a2hs-banner';
  banner.innerHTML = `
    <div class="a2hs-content">
      <p><strong>${escapeHtml(i18n.t('notify.a2hs.title'))}</strong></p>
      <p class="a2hs-steps">
        ${i18n.t('notify.a2hs.steps')}
      </p>
    </div>
    <button class="btn-dismiss" onclick="this.parentElement.remove()">&times;</button>
  `;
  document.getElementById('add-section').after(banner);
}

function showNotifyBanner() {
  const existing = document.querySelector('.notify-banner');
  if (existing) return;

  const banner = document.createElement('div');
  banner.className = 'notify-banner';
  banner.innerHTML = `
    <p>${escapeHtml(i18n.t('notify.banner'))}</p>
    <button onclick="requestNotification(this)">${escapeHtml(i18n.t('notify.enable'))}</button>
    <button class="btn-dismiss" onclick="this.parentElement.remove()">&times;</button>
  `;
  document.getElementById('add-section').after(banner);
}

async function requestNotification(btn) {
  const granted = await Platform.requestPush();
  if (granted) {
    btn.parentElement.remove();
  }
}

function sendNotification(timer) {
  const info = getMushroomInfo(timer.type, timer.colorKey);
  const title = '🍄 ' + i18n.t('notify.title');
  const body = timer.name
    ? i18n.t('notify.bodyNamed', { name: timer.name, mushroom: info.name })
    : i18n.t('notify.bodyDefault', { mushroom: info.name });

  Platform.sendNotification({
    id: timer.id,
    title,
    body,
    icon: 'icons/icon-192.png',
  });
}

// ─── 背景通知排程（iOS 原生） ───
// iOS App 進入背景後 setInterval 不執行，
// 預先排程通知讓系統在到期時間觸發
function scheduleTimerNotification(timer) {
  if (!Platform.isNative() || timer.ready) return;
  const remaining = timer.endTime - Date.now();
  if (remaining <= 0) return;

  const info = getMushroomInfo(timer.type, timer.colorKey);
  const title = '🍄 ' + i18n.t('notify.title');
  const body = timer.name
    ? i18n.t('notify.bodyNamed', { name: timer.name, mushroom: info.name })
    : i18n.t('notify.bodyDefault', { mushroom: info.name });

  Platform.scheduleNotification({
    id: parseInt(timer.id, 36) % 100000,
    title,
    body,
    at: new Date(timer.endTime),
  });
}

function scheduleAllTimerNotifications() {
  timers.forEach(t => scheduleTimerNotification(t));
}

// App 從背景回到前景時，重新計算所有計時器狀態
function onAppResume() {
  const now = Date.now();
  let changed = false;
  timers.forEach(t => {
    if (!t.ready && now >= t.endTime) {
      t.ready = true;
      t.readyAt = now;
      changed = true;
    }
  });
  if (changed) {
    saveTimers();
  }
  renderTimers();
  startTick();
}

// ─── Timer Tick ───
function startTick() {
  if (tickInterval) clearInterval(tickInterval);
  tickInterval = setInterval(() => {
    const now = Date.now();
    let changed = false;

    timers.forEach(t => {
      if (!t.ready && now >= t.endTime) {
        t.ready = true;
        t.readyAt = now;
        changed = true;
        sendNotification(t);
      }
    });

    // Auto-remove expired timers older than 10 minutes
    const before = timers.length;
    timers = timers.filter(t => !t.ready || (now - (t.readyAt || t.endTime)) < EXPIRED_AUTO_REMOVE_MS);
    if (timers.length !== before) changed = true;

    if (changed) {
      saveTimers();
      renderTimers();
    } else {
      updateTimerDisplays();
    }
  }, 1000);
}

function updateTimerDisplays() {
  const now = Date.now();
  timers.forEach(t => {
    if (t.id === editingTimerId) return; // 編輯中不更新
    const el = document.getElementById(`timer-${t.id}`);
    if (!el) return;

    const countdownEl = el.querySelector('.countdown-time');
    const progressBar = el.querySelector('.timer-progress-bar');

    if (t.ready) {
      countdownEl.textContent = i18n.t('timer.ready');
      countdownEl.className = 'countdown-time ready';
      if (progressBar) progressBar.style.width = '100%';
      el.classList.add('ready');
    } else {
      const remaining = Math.max(0, t.endTime - now);
      countdownEl.textContent = formatTime(remaining);
      countdownEl.className = 'countdown-time counting';

      const totalDuration = t.endTime - t.startTime;
      const elapsed = totalDuration - remaining;
      const pct = Math.min(100, (elapsed / totalDuration) * 100);
      if (progressBar) progressBar.style.width = pct + '%';

      el.classList.remove('ready');
    }
  });

  toggleEmptyState();
}

// ─── Timer CRUD ───
function createTimer(type, name, totalSeconds, colorKey) {
  const now = Date.now();
  return {
    id: now.toString(36) + Math.random().toString(36).slice(2, 6),
    type,
    name,
    colorKey: colorKey || null,
    totalSeconds,
    startTime: now,
    endTime: now + totalSeconds * 1000,
    ready: false,
  };
}

function insertTimer(type, name, totalSeconds, colorKey) {
  evictExpiredIfFull();
  if (getActiveTimerCount() >= MAX_TIMERS) {
    alert(i18n.t('timer.maxReached', { n: MAX_TIMERS }));
    return false;
  }
  const timer = createTimer(type, name, totalSeconds, colorKey);
  timers.unshift(timer);
  saveTimers();
  renderTimers();
  scheduleTimerNotification(timer);
  return true;
}

function addTimer() {
  const nameInput = document.getElementById('input-name');
  const name = nameInput.value.trim();

  let totalSeconds;
  if (selectedMinutes === 0) {
    const mins = parseInt(document.getElementById('input-custom-minutes').value, 10) || 0;
    const secs = parseInt(document.getElementById('input-custom-seconds').value, 10) || 0;
    totalSeconds = mins * 60 + secs;
    if (totalSeconds < 1) {
      document.getElementById('input-custom-minutes').focus();
      document.getElementById('input-custom-minutes').style.borderColor = '#ef4444';
      return;
    }
  } else {
    totalSeconds = selectedMinutes * 60;
  }

  if (insertTimer(selectedType, name || '', totalSeconds)) {
    closeAddModal();
    nameInput.value = '';
  }
}

function getActiveTimerCount() {
  return timers.filter(t => !t.ready).length;
}

function evictExpiredIfFull() {
  if (timers.length < MAX_TIMERS) return;
  let oldestIdx = -1;
  let oldestTime = Infinity;
  timers.forEach((t, i) => {
    if (t.ready && (t.readyAt || t.endTime) < oldestTime) {
      oldestTime = t.readyAt || t.endTime;
      oldestIdx = i;
    }
  });
  if (oldestIdx !== -1) {
    timers.splice(oldestIdx, 1);
    saveTimers();
  }
}

function deleteTimer(id) {
  timers = timers.filter(t => t.id !== id);
  saveTimers();
  renderTimers();
}

function restartTimer(id) {
  const timer = timers.find(t => t.id === id);
  if (!timer) return;

  const now = Date.now();
  timer.startTime = now;
  timer.endTime = now + timer.totalSeconds * 1000;
  timer.ready = false;

  saveTimers();
  renderTimers();
  scheduleTimerNotification(timer);
}

function saveTimers() {
  localStorage.setItem('pikmin-timers', JSON.stringify(timers));
}

// ─── Render ───
function renderTimers() {
  const list = document.getElementById('timer-list');
  list.innerHTML = '';

  // Sort: ready first, then by endTime ascending
  const sorted = [...timers].sort((a, b) => {
    if (a.ready && !b.ready) return -1;
    if (!a.ready && b.ready) return 1;
    if (a.ready && b.ready) return b.endTime - a.endTime;
    return a.endTime - b.endTime;
  });

  sorted.forEach(t => {
    const card = document.createElement('div');
    card.id = `timer-${t.id}`;
    card.dataset.id = t.id;
    card.className = `timer-card${t.ready ? ' ready' : ''}`;

    const info = getMushroomInfo(t.type, t.colorKey);
    const icon = info.icon;
    const typeName = info.name;
    const displayName = t.name || typeName;
    const timeLang = i18n.getLang() === 'en' ? 'en-US' : 'zh-Hant';
    const endTimeStr = new Date(t.endTime).toLocaleTimeString(timeLang, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    // Display duration as M:SS
    const ts = t.totalSeconds || (t.minutes ? t.minutes * 60 : 300);
    const durationStr = formatDuration(ts);

    const now = Date.now();
    const remaining = Math.max(0, t.endTime - now);
    const totalDuration = t.endTime - t.startTime;
    const elapsed = totalDuration - remaining;
    const pct = t.ready ? 100 : Math.min(100, (elapsed / totalDuration) * 100);

    card.innerHTML = `
      <div class="timer-card-header">
        <div class="timer-info">
          <span class="timer-icon" style="font-size:${info.iconSize}">${icon}</span>
          <div class="timer-meta">
            <h3 class="timer-name" onclick="startEditName('${t.id}')" title="${escapeHtml(i18n.t('timer.editName'))}">${escapeHtml(displayName)} <svg class="edit-icon" viewBox="0 0 512 512" width="11" height="11"><path fill="currentColor" d="M362.7 19.3L314.3 67.7 444.3 197.7l48.4-48.4c25-25 25-65.5 0-90.5L453.3 19.3c-25-25-65.5-25-90.5 0zM291.7 90.3l-261 261c-5 5-8.5 11.3-10.2 18.1L.5 478.2c-2.5 10.4 7 19.9 17.4 17.4l108.8-20c6.8-1.7 13.1-5.2 18.1-10.2l261-261L275.7 74.3z"/></svg></h3>
            <span class="timer-type">${typeName} · ${durationStr}</span>
          </div>
        </div>
      </div>
      <div class="timer-countdown" onclick="openTimeEditor('${t.id}')">
        <div class="countdown-time ${t.ready ? 'ready' : 'counting'}">
          ${t.ready ? i18n.t('timer.ready') : formatTime(remaining)}
        </div>
      </div>
      <div class="timer-progress">
        <div class="timer-progress-bar" style="width: ${pct}%"></div>
      </div>
      <div class="timer-footer">
        <span class="footer-end-time">${escapeHtml(i18n.t('timer.respawnAt', { time: endTimeStr }))}</span>
        <div class="timer-footer-actions">
          <button class="btn-restart" onclick="openTimeEditor('${t.id}')">⏱ ${escapeHtml(i18n.t('timer.adjust'))}</button>
          <button class="btn-remove" onclick="deleteTimer('${t.id}')">🗑 ${escapeHtml(i18n.t('timer.remove'))}</button>
        </div>
      </div>
    `;

    list.appendChild(card);
  });

  toggleEmptyState();
}

function toggleEmptyState() {
  const empty = document.getElementById('empty-state');
  if (timers.length === 0) {
    empty.classList.remove('hidden');
  } else {
    empty.classList.add('hidden');
  }
  updateTimerCountBadge();
}

function updateTimerCountBadge() {
  const badge = document.getElementById('timer-count-badge');
  if (!badge) return;
  const active = getActiveTimerCount();
  if (timers.length === 0) {
    badge.textContent = '';
  } else {
    badge.textContent = `${active}/${MAX_TIMERS}`;
    badge.className = `timer-count-badge${active >= MAX_TIMERS ? ' full' : ''}`;
  }
}

// ─── Add Timer Modal ───
function openAddModal() {
  document.getElementById('modal-overlay').classList.remove('hidden');
  selectType(document.querySelector('.type-btn[data-type="normal"]'));
  selectTime(document.querySelector('.time-btn[data-minutes="5"]'));
}

function closeAddModal(e) {
  if (e && e.target !== e.currentTarget) return;
  document.getElementById('modal-overlay').classList.add('hidden');
}

function selectType(btn) {
  document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  selectedType = btn.dataset.type;
}

function selectTime(btn) {
  document.querySelectorAll('.time-btn').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  selectedMinutes = parseInt(btn.dataset.minutes, 10);

  const customEl = document.getElementById('custom-time');
  if (selectedMinutes === 0) {
    customEl.classList.remove('hidden');
    document.getElementById('input-custom-minutes').focus();
  } else {
    customEl.classList.add('hidden');
  }
}

// ─── OCR Section ───
function toggleOcrSection() {
  const body = document.getElementById('ocr-section-body');
  const icon = document.getElementById('ocr-toggle-icon');
  body.classList.toggle('collapsed');
  icon.classList.toggle('collapsed');
}

function resetOcrSection() {
  // 清理預覽圖的 blob URL
  const previewImg = document.querySelector('#ocr-preview-area img');
  if (previewImg && previewImg.src.startsWith('blob:')) {
    URL.revokeObjectURL(previewImg.src);
  }
  document.getElementById('ocr-preview-area').innerHTML = `
    <div class="upload-placeholder">
      <span style="font-size:28px">📸</span>
      <p>${escapeHtml(i18n.t('ocr.upload'))}</p>
      <p class="hint">${escapeHtml(i18n.t('ocr.hint'))}</p>
    </div>
  `;
  document.getElementById('ocr-status').classList.add('hidden');
  document.getElementById('ocr-file-input').value = '';
}

// ─── OCR: File / Paste Handling ───
function handleOcrFile(event) {
  const file = event.target.files[0];
  if (file) processOcrImage(file);
}

function setupPasteListener() {
  document.addEventListener('paste', (e) => {
    // Only handle paste when OCR modal is open
    const overlay = document.getElementById('ocr-overlay');
    if (overlay.classList.contains('hidden')) return;

    const items = e.clipboardData?.items;
    if (!items) return;

    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        processOcrImage(file);
        return;
      }
    }
  });

  // Drag & drop
  const dropZone = document.getElementById('ocr-drop-zone');
  if (dropZone) {
    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.classList.add('drag-over');
    });
    dropZone.addEventListener('dragleave', () => {
      dropZone.classList.remove('drag-over');
    });
    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.classList.remove('drag-over');
      const file = e.dataTransfer.files[0];
      if (file && file.type.startsWith('image/')) {
        processOcrImage(file);
      }
    });
  }
}

async function processOcrImage(file) {
  // Show preview
  const previewArea = document.getElementById('ocr-preview-area');
  const url = URL.createObjectURL(file);
  previewArea.innerHTML = `<img src="${url}" alt="截圖預覽">`;

  // Show progress
  const statusEl = document.getElementById('ocr-status');
  const statusText = document.getElementById('ocr-status-text');
  const progressFill = document.getElementById('ocr-progress-fill');
  statusEl.classList.remove('hidden');

  try {
    const result = await mushroomOCR(file, (msg, pct) => {
      statusText.textContent = msg;
      progressFill.style.width = pct + '%';
    });

    // 轉換為 autoAddTimerFromOcr 需要的格式
    const extracted = {
      time: result.time,
      mushroomType: result.mushroomSize || 'normal',
      mushroomColor: result.mushroomColor || null,
      location: result.location,
      analysisElapsed: result.analysisElapsed,
    };

    autoAddTimerFromOcr(extracted);

  } catch (err) {
    statusText.textContent = i18n.t('ocr.failed') + err.message;
    progressFill.style.width = '0%';
    console.error('OCR error:', err);
  }
}


function autoAddTimerFromOcr(extracted) {
  // 檢查時間是否有效（0h0m0s = 解析失敗）
  if (!extracted.time ||
      (extracted.time.hours === 0 && extracted.time.minutes === 0 && extracted.time.seconds === 0)) {
    const statusEl = document.getElementById('ocr-status');
    if (statusEl) {
      document.getElementById('ocr-status-text').textContent = '⚠️ ' + i18n.t('ocr.timeFailed');
    }
    console.warn('[timer] OCR 時間解析失敗: 0h0m0s，不自動新增');
    return;
  }

  const name = extracted.location || i18n.t('timer.defaultName', { n: timers.length + 1 });
  const type = extracted.mushroomType || 'normal';
  const colorKey = extracted.mushroomColor || null;
  const analysisElapsed = extracted.analysisElapsed || 0;

  const rawTotal = ((extracted.time.hours || 0) * 60 + (extracted.time.minutes || 0)) * 60 + (extracted.time.seconds || 0);
  let totalSeconds = rawTotal - analysisElapsed + RESPAWN_SECONDS - MANUAL_BUFFER_SECONDS;
  if (totalSeconds < 1) totalSeconds = RESPAWN_SECONDS;

  console.log(`[timer] OCR: ${extracted.time.hours}h${extracted.time.minutes}m${extracted.time.seconds}s - 分析耗時${analysisElapsed}s + 重生${RESPAWN_SECONDS}s - 預留${MANUAL_BUFFER_SECONDS}s = ${totalSeconds}s`);

  insertTimer(type, name, totalSeconds, colorKey);
  resetOcrSection();
}

// 點擊計時器名稱 → 變成 input 編輯
function startEditName(id) {
  const timer = timers.find(t => t.id === id);
  if (!timer) return;
  const nameEl = document.querySelector(`.timer-card[data-id="${id}"] .timer-name`);
  if (!nameEl || nameEl.querySelector('input')) return; // 已在編輯中

  const current = timer.name;
  const input = document.createElement('input');
  input.type = 'text';
  input.value = current;
  input.className = 'edit-name-input';

  const save = () => {
    const newName = input.value.trim() || current;
    timer.name = newName;
    saveTimers();
    renderTimers();
  };

  input.addEventListener('blur', save);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); save(); }
    if (e.key === 'Escape') { renderTimers(); }
  });

  nameEl.textContent = '';
  nameEl.appendChild(input);
  input.focus();
  input.select();
}

// ─── Time Editor (滾輪調整) ───
let editingTimerId = null;

function openTimeEditor(id) {
  if (editingTimerId === id) return; // 已經在編輯
  closeTimeEditor(); // 關閉其他編輯中的

  const timer = timers.find(t => t.id === id);
  if (!timer) return;
  editingTimerId = id;

  const el = document.getElementById(`timer-${id}`);
  const countdownDiv = el.querySelector('.timer-countdown');

  // 計算目前剩餘時間
  const now = Date.now();
  const remainMs = Math.max(0, timer.endTime - now);
  const totalSec = Math.floor(remainMs / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;

  countdownDiv.onclick = null; // 暫時移除點擊
  countdownDiv.innerHTML = `
    <div class="time-editor" onclick="event.stopPropagation()">
      <div class="time-wheel" data-field="hours" data-max="23" data-value="${h}">
        <button class="wheel-btn wheel-up" ontouchstart="wheelStep(this,1,event)" onmousedown="wheelStep(this,1,event)">▲</button>
        <div class="wheel-value">${String(h).padStart(2, '0')}</div>
        <button class="wheel-btn wheel-down" ontouchstart="wheelStep(this,-1,event)" onmousedown="wheelStep(this,-1,event)">▼</button>
      </div>
      <span class="wheel-sep">:</span>
      <div class="time-wheel" data-field="minutes" data-max="59" data-value="${m}">
        <button class="wheel-btn wheel-up" ontouchstart="wheelStep(this,1,event)" onmousedown="wheelStep(this,1,event)">▲</button>
        <div class="wheel-value">${String(m).padStart(2, '0')}</div>
        <button class="wheel-btn wheel-down" ontouchstart="wheelStep(this,-1,event)" onmousedown="wheelStep(this,-1,event)">▼</button>
      </div>
      <span class="wheel-sep">:</span>
      <div class="time-wheel" data-field="seconds" data-max="59" data-value="${s}">
        <button class="wheel-btn wheel-up" ontouchstart="wheelStep(this,1,event)" onmousedown="wheelStep(this,1,event)">▲</button>
        <div class="wheel-value">${String(s).padStart(2, '0')}</div>
        <button class="wheel-btn wheel-down" ontouchstart="wheelStep(this,-1,event)" onmousedown="wheelStep(this,-1,event)">▼</button>
      </div>
      <div class="wheel-actions">
        <button class="wheel-confirm" onclick="confirmTimeEdit()">✓</button>
        <button class="wheel-cancel" onclick="closeTimeEditor()">✕</button>
      </div>
    </div>
  `;

  // 滑鼠滾輪支援
  countdownDiv.querySelectorAll('.time-wheel').forEach(wheel => {
    wheel.addEventListener('wheel', (e) => {
      e.preventDefault();
      const dir = e.deltaY < 0 ? 1 : -1;
      adjustWheel(wheel, dir);
    }, { passive: false });
  });

  // 觸控滑動支援
  countdownDiv.querySelectorAll('.time-wheel').forEach(wheel => {
    let startY = 0;
    wheel.addEventListener('touchstart', (e) => {
      startY = e.touches[0].clientY;
    }, { passive: true });
    wheel.addEventListener('touchmove', (e) => {
      e.preventDefault();
      const dy = startY - e.touches[0].clientY;
      if (Math.abs(dy) > 20) {
        adjustWheel(wheel, dy > 0 ? 1 : -1);
        startY = e.touches[0].clientY;
      }
    }, { passive: false });
  });
}

function wheelStep(btn, dir, e) {
  e.preventDefault();
  const wheel = btn.closest('.time-wheel');
  adjustWheel(wheel, dir);
}

function adjustWheel(wheel, dir) {
  const max = parseInt(wheel.dataset.max);
  let val = parseInt(wheel.dataset.value) + dir;
  if (val < 0) val = max;
  if (val > max) val = 0;
  wheel.dataset.value = val;
  wheel.querySelector('.wheel-value').textContent = String(val).padStart(2, '0');
}

function confirmTimeEdit() {
  if (!editingTimerId) return;
  const timer = timers.find(t => t.id === editingTimerId);
  if (!timer) { closeTimeEditor(); return; }

  const el = document.getElementById(`timer-${editingTimerId}`);
  const wheels = el.querySelectorAll('.time-wheel');
  const h = parseInt(wheels[0].dataset.value);
  const m = parseInt(wheels[1].dataset.value);
  const s = parseInt(wheels[2].dataset.value);

  const newTotalSec = h * 3600 + m * 60 + s;
  const now = Date.now();
  timer.endTime = now + newTotalSec * 1000;
  timer.totalSeconds = newTotalSec;
  timer.ready = newTotalSec <= 0;

  editingTimerId = null;
  saveTimers();
  scheduleTimerNotification(timer);
  renderTimers();
}

function closeTimeEditor() {
  editingTimerId = null;
  // 重新渲染恢復正常顯示
  renderTimers();
}

// ─── Utils ───
function formatTime(ms) {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function formatDuration(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0 && s === 0) return i18n.t('duration.hm', { h, m });
  if (h > 0) return i18n.t('duration.hms', { h, m, s });
  if (s === 0) return i18n.t('duration.m', { m });
  return i18n.t('duration.ms', { m, s });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
