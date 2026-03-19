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
    const footerTime = el.querySelector('.footer-end-time');

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

  let minutes = selectedMinutes;
  if (minutes === 0) {
    const customInput = document.getElementById('input-custom-minutes');
    minutes = parseInt(customInput.value, 10);
    if (!minutes || minutes < 1) {
      customInput.focus();
      customInput.style.borderColor = '#ef4444';
      return;
    }
  }

  const now = Date.now();
  const timer = {
    id: now.toString(36) + Math.random().toString(36).slice(2, 6),
    type: selectedType,
    name: name || '',
    minutes,
    startTime: now,
    endTime: now + minutes * 60 * 1000,
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
  timer.endTime = now + timer.minutes * 60 * 1000;
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
    });

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
            <span class="timer-type">${typeName} · ${t.minutes} 分鐘</span>
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

// ─── Modal ───
function openAddModal() {
  document.getElementById('modal-overlay').classList.remove('hidden');
  // Reset selections
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

// ─── Utils ───
function formatTime(ms) {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
