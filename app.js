// ─── Constants ───
const MAX_TIMERS = 10;
const RESPAWN_SECONDS = 300; // 5 minutes
const MANUAL_BUFFER_SECONDS = 30; // human reaction buffer
const EXPIRED_AUTO_REMOVE_MS = 10 * 60 * 1000; // 10 minutes

const MUSHROOM_TYPES = {
  small:  { icon: '🍄', iconSize: '20px', name: '小毒蘑菇', color: '#a0522d' },
  normal: { icon: '🍄', iconSize: '28px', name: '一般毒蘑菇', color: '#8B4513' },
  large:  { icon: '🍄', iconSize: '38px', name: '巨大毒蘑菇', color: '#6B2FA0' },
};

// ─── State ───
let timers = JSON.parse(localStorage.getItem('pikmin-timers') || '[]');
let selectedType = 'normal';
let selectedMinutes = 5;
let tickInterval = null;

// ─── Init ───
document.addEventListener('DOMContentLoaded', () => {
  renderTimers();
  startTick();
  checkNotificationPermission();
  registerServiceWorker();
  setupPasteListener();
});

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
function checkNotificationPermission() {
  // iOS standalone PWA check
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
      <p><strong>加入主畫面才能收到通知</strong></p>
      <p class="a2hs-steps">
        點底部 <span class="a2hs-icon">⬆️</span> 分享按鈕 → 「加入主畫面」
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
    <p>開啟通知，菇長回來時提醒你</p>
    <button onclick="requestNotification(this)">開啟通知</button>
    <button class="btn-dismiss" onclick="this.parentElement.remove()">&times;</button>
  `;
  document.getElementById('add-section').after(banner);
}

async function requestNotification(btn) {
  const permission = await Notification.requestPermission();
  if (permission === 'granted') {
    btn.parentElement.remove();
  }
}

function sendNotification(timer) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const info = MUSHROOM_TYPES[timer.type] || MUSHROOM_TYPES.normal;
  const title = '🍄 菇長回來了！';
  const body = timer.name
    ? `${timer.name} 的${info.name}已重生`
    : `${info.name}已重生，快去打！`;

  if (navigator.serviceWorker && navigator.serviceWorker.controller) {
    navigator.serviceWorker.ready.then(reg => {
      reg.showNotification(title, {
        body,
        icon: 'icons/icon-192.png',
        badge: 'icons/icon-192.png',
        tag: `timer-${timer.id}`,
        vibrate: [200, 100, 200],
      });
    });
  } else {
    new Notification(title, { body });
  }
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
    const el = document.getElementById(`timer-${t.id}`);
    if (!el) return;

    const countdownEl = el.querySelector('.countdown-time');
    const progressBar = el.querySelector('.timer-progress-bar');

    if (t.ready) {
      countdownEl.textContent = '可以打了！';
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
function createTimer(type, name, totalSeconds) {
  const now = Date.now();
  return {
    id: now.toString(36) + Math.random().toString(36).slice(2, 6),
    type,
    name,
    totalSeconds,
    startTime: now,
    endTime: now + totalSeconds * 1000,
    ready: false,
  };
}

function insertTimer(type, name, totalSeconds) {
  evictExpiredIfFull();
  if (getActiveTimerCount() >= MAX_TIMERS) {
    alert(`最多同時 ${MAX_TIMERS} 個計時器！`);
    return false;
  }
  timers.unshift(createTimer(type, name, totalSeconds));
  saveTimers();
  renderTimers();
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
    card.className = `timer-card${t.ready ? ' ready' : ''}`;

    const info = MUSHROOM_TYPES[t.type] || MUSHROOM_TYPES.normal;
    const icon = info.icon;
    const typeName = info.name;
    const displayName = t.name || typeName;
    const endTimeStr = new Date(t.endTime).toLocaleTimeString('zh-Hant', {
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
            <h3>${escapeHtml(displayName)}</h3>
            <span class="timer-type">${typeName} · ${durationStr}</span>
          </div>
        </div>
      </div>
      <div class="timer-countdown">
        <div class="countdown-time ${t.ready ? 'ready' : 'counting'}">
          ${t.ready ? '可以打了！' : formatTime(remaining)}
        </div>
      </div>
      <div class="timer-progress">
        <div class="timer-progress-bar" style="width: ${pct}%"></div>
      </div>
      <div class="timer-footer">
        <span class="footer-end-time">預計 ${endTimeStr} 重生</span>
        <div class="timer-footer-actions">
          <button class="btn-restart" onclick="restartTimer('${t.id}')">🔄 重新計時</button>
          <button class="btn-remove" onclick="deleteTimer('${t.id}')">🗑 移除</button>
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

// ─── OCR Modal ───
function openOcrModal() {
  const overlay = document.getElementById('ocr-overlay');
  overlay.classList.remove('hidden');
  resetOcrModal();
}

function closeOcrModal(e) {
  if (e && e.target !== e.currentTarget) return;
  document.getElementById('ocr-overlay').classList.add('hidden');
}

function resetOcrModal() {
  document.getElementById('ocr-preview-area').innerHTML = `
    <div class="upload-placeholder">
      <span style="font-size:36px">📸</span>
      <p>點擊上傳或貼上截圖</p>
      <p class="hint">支援直接 Ctrl+V / Cmd+V 貼上</p>
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
  statusText.textContent = '正在載入 OCR 引擎...';
  progressFill.style.width = '10%';

  try {
    const processedBlob = await preprocessImage(file);

    statusText.textContent = '正在辨識文字（中文+英文）...';
    progressFill.style.width = '30%';

    const worker = await Tesseract.createWorker('chi_tra+eng', 1, {
      logger: (m) => {
        if (m.status === 'recognizing text') {
          const pct = 30 + Math.round(m.progress * 60);
          progressFill.style.width = pct + '%';
        }
      },
    });

    const { data: { text } } = await worker.recognize(processedBlob);
    await worker.terminate();

    progressFill.style.width = '100%';
    statusText.textContent = '辨識完成！';

    console.log('OCR raw text:', text);

    const extracted = extractAllFromText(text);
    autoAddTimerFromOcr(extracted);

  } catch (err) {
    statusText.textContent = '辨識失敗：' + err.message;
    progressFill.style.width = '0%';
    console.error('OCR error:', err);
  }
}

// ─── OCR: Image Preprocessing ───
async function preprocessImage(file) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);

      // Convert to grayscale + increase contrast
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      for (let i = 0; i < data.length; i += 4) {
        // Grayscale
        const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        // Increase contrast
        const contrast = 1.5;
        const adjusted = ((gray / 255 - 0.5) * contrast + 0.5) * 255;
        const val = Math.max(0, Math.min(255, adjusted));
        data[i] = val;
        data[i + 1] = val;
        data[i + 2] = val;
      }
      ctx.putImageData(imageData, 0, 0);

      canvas.toBlob(resolve, 'image/png');
    };
    img.src = URL.createObjectURL(file);
  });
}

// ─── OCR: Full Extraction (time + type + location) ───
function extractAllFromText(text) {
  const result = {
    time: null,
    mushroomType: null,
    location: null,
  };

  // --- Extract mushroom type ---
  if (/巨大/.test(text)) {
    result.mushroomType = 'large';
  } else if (/小/.test(text) && /蘑菇|毒/.test(text)) {
    result.mushroomType = 'small';
  } else if (/一般/.test(text)) {
    result.mushroomType = 'normal';
  }

  // --- Extract time: "剩下X分Y秒" or "剩下X分 Y秒" ---
  const zhTimeMatch = text.match(/剩[下了]\s*(\d{1,3})\s*分\s*(\d{1,2})\s*秒/);
  if (zhTimeMatch) {
    result.time = {
      hours: 0,
      minutes: parseInt(zhTimeMatch[1], 10),
      seconds: parseInt(zhTimeMatch[2], 10),
    };
  }

  // Fallback: HH:MM:SS or MM:SS format
  if (!result.time) {
    const colonPatterns = [
      /(\d{1,2})\s*[:：]\s*(\d{1,2})\s*[:：]\s*(\d{1,2})/,
      /(\d{1,2})\s*[:：]\s*(\d{1,2})/,
    ];
    for (const pattern of colonPatterns) {
      const match = text.match(pattern);
      if (match) {
        if (match[3] !== undefined) {
          result.time = {
            hours: parseInt(match[1], 10),
            minutes: parseInt(match[2], 10),
            seconds: parseInt(match[3], 10),
          };
        } else {
          result.time = {
            hours: 0,
            minutes: parseInt(match[1], 10),
            seconds: parseInt(match[2], 10),
          };
        }
        break;
      }
    }
  }

  // --- Extract location: first line, first 4 chars ---
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length >= 2);
  if (lines.length > 0) {
    result.location = lines[0].substring(0, 4);
  }

  return result;
}

function autoAddTimerFromOcr(extracted) {
  const name = `菇${timers.length + 1}`;
  const type = extracted.mushroomType || 'normal';

  let totalSeconds = RESPAWN_SECONDS - MANUAL_BUFFER_SECONDS;
  if (extracted.time) {
    const rawTotal = ((extracted.time.hours || 0) * 60 + (extracted.time.minutes || 0)) * 60 + (extracted.time.seconds || 0);
    totalSeconds = rawTotal + RESPAWN_SECONDS - MANUAL_BUFFER_SECONDS;
  }
  if (totalSeconds < 1) totalSeconds = RESPAWN_SECONDS;

  insertTimer(type, name, totalSeconds);
  closeOcrModal();
}

// ─── Utils ───
function formatTime(ms) {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function formatDuration(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  if (s === 0) return `${m} 分鐘`;
  return `${m} 分 ${s} 秒`;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
