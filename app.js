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
  if (!('Notification' in window)) return;
  if (Notification.permission === 'default') {
    showNotifyBanner();
  }
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
  const title = '🍄 菇長回來了！';
  const body = timer.name
    ? `${timer.name} 的${timer.type === 'large' ? '大菇' : '普通菇'}已重生`
    : `${timer.type === 'large' ? '大菇' : '普通菇'}已重生，快去打！`;

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
        changed = true;
        sendNotification(t);
      }
    });

    if (changed) saveTimers();
    updateTimerDisplays();
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
function addTimer() {
  const nameInput = document.getElementById('input-name');
  const name = nameInput.value.trim();

  let totalSeconds;
  if (selectedMinutes === 0) {
    // Custom time: minutes + seconds
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

  const now = Date.now();
  const timer = {
    id: now.toString(36) + Math.random().toString(36).slice(2, 6),
    type: selectedType,
    name: name || '',
    totalSeconds,
    startTime: now,
    endTime: now + totalSeconds * 1000,
    ready: false,
  };

  timers.unshift(timer);
  saveTimers();
  renderTimers();
  closeAddModal();

  // Reset form
  nameInput.value = '';
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

    const icon = t.type === 'large' ? '🟣' : '🍄';
    const typeName = t.type === 'large' ? '大菇' : '普通菇';
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
          <span class="timer-icon">${icon}</span>
          <div class="timer-meta">
            <h3>${escapeHtml(displayName)}</h3>
            <span class="timer-type">${typeName} · ${durationStr}</span>
          </div>
        </div>
        <button class="btn-delete" onclick="deleteTimer('${t.id}')" title="刪除">&times;</button>
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
        <button class="btn-restart" onclick="restartTimer('${t.id}')">🔄 重新計時</button>
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
  document.getElementById('ocr-result').classList.add('hidden');
  document.getElementById('ocr-confirm-btn').disabled = true;
  document.getElementById('ocr-file-input').value = '';
  document.getElementById('ocr-name').value = '';
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
    // Pre-process image: crop center area, grayscale, high contrast
    const processedBlob = await preprocessImage(file);

    statusText.textContent = '正在辨識文字...';
    progressFill.style.width = '30%';

    const worker = await Tesseract.createWorker('eng', 1, {
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

    // Extract time from OCR text
    const extracted = extractTimeFromText(text);
    showOcrResult(extracted, text);

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

// ─── OCR: Time Extraction ───
function extractTimeFromText(text) {
  // Clean up OCR text
  const cleaned = text.replace(/[^\d:：.]/g, (c) => {
    // Keep digits, colons, periods, spaces, newlines
    if (c === ' ' || c === '\n') return c;
    return '';
  });

  // Try multiple patterns for time formats
  // Format: HH:MM:SS, H:MM:SS, MM:SS, M:SS
  const patterns = [
    /(\d{1,2})\s*[:：.]\s*(\d{1,2})\s*[:：.]\s*(\d{1,2})/,  // H:MM:SS
    /(\d{1,2})\s*[:：.]\s*(\d{1,2})/,                          // MM:SS or M:SS
  ];

  // Search in original text too (OCR might preserve formatting better)
  const searchText = text + '\n' + cleaned;

  for (const pattern of patterns) {
    const match = searchText.match(pattern);
    if (match) {
      if (match[3] !== undefined) {
        // H:MM:SS format
        return {
          hours: parseInt(match[1], 10),
          minutes: parseInt(match[2], 10),
          seconds: parseInt(match[3], 10),
        };
      } else {
        // MM:SS format
        const first = parseInt(match[1], 10);
        const second = parseInt(match[2], 10);
        // If first number > 59, treat as MM:SS where MM is large
        return {
          hours: 0,
          minutes: first,
          seconds: second,
        };
      }
    }
  }

  // Try just finding standalone numbers (might be minutes)
  const numMatch = text.match(/(\d{1,3})/);
  if (numMatch) {
    return { hours: 0, minutes: parseInt(numMatch[1], 10), seconds: 0 };
  }

  return null;
}

function showOcrResult(extracted, rawText) {
  const resultEl = document.getElementById('ocr-result');
  const minsInput = document.getElementById('ocr-minutes');
  const secsInput = document.getElementById('ocr-seconds');
  const confirmBtn = document.getElementById('ocr-confirm-btn');

  resultEl.classList.remove('hidden');

  if (extracted) {
    const totalMins = (extracted.hours || 0) * 60 + (extracted.minutes || 0);
    minsInput.value = totalMins;
    secsInput.value = extracted.seconds || 0;
    confirmBtn.disabled = false;

    document.getElementById('ocr-status-text').textContent =
      `辨識到時間：${totalMins} 分 ${extracted.seconds || 0} 秒`;
  } else {
    minsInput.value = '';
    secsInput.value = '';
    confirmBtn.disabled = false; // Let user manually input
    document.getElementById('ocr-status-text').textContent =
      '未辨識到時間格式，請手動輸入';
  }

  // Allow manual editing to enable confirm
  minsInput.addEventListener('input', () => { confirmBtn.disabled = false; });
  secsInput.addEventListener('input', () => { confirmBtn.disabled = false; });
}

function addTimerFromOcr() {
  const mins = parseInt(document.getElementById('ocr-minutes').value, 10) || 0;
  const secs = parseInt(document.getElementById('ocr-seconds').value, 10) || 0;
  const totalSeconds = mins * 60 + secs;
  const name = document.getElementById('ocr-name').value.trim();

  if (totalSeconds < 1) {
    document.getElementById('ocr-minutes').style.borderColor = '#ef4444';
    return;
  }

  const now = Date.now();
  const timer = {
    id: now.toString(36) + Math.random().toString(36).slice(2, 6),
    type: 'normal',
    name: name || '',
    totalSeconds,
    startTime: now,
    endTime: now + totalSeconds * 1000,
    ready: false,
  };

  timers.unshift(timer);
  saveTimers();
  renderTimers();
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
