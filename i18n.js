/**
 * i18n.js — 輕量多語系模組
 *
 * 支援繁體中文 (zh-Hant) 和英文 (en)。
 * HTML 元素用 data-i18n 屬性標記，JS 字串用 i18n.t('key') 取得。
 */

const i18n = (() => {

  const translations = {
    'zh-Hant': {
      // ─── Header ───
      'app.title': '菇菇計時器',
      'app.subtitle': 'Pikmin Bloom 香菇重生提醒',
      'theme.toggle': '切換主題',

      // ─── Add Timer ───
      'btn.add': '+ 新增計時器',
      'empty.title': '還沒有計時器',
      'empty.hint': '打完菇後點「+ 新增計時器」開始追蹤',

      // ─── OCR Section ───
      'ocr.title': '截圖辨識',
      'ocr.upload': '點擊上傳或貼上截圖',
      'ocr.hint': '支援 Ctrl+V / Cmd+V 貼上',
      'ocr.processing': '辨識中...',
      'ocr.failed': '辨識失敗：',
      'ocr.timeFailed': '時間解析失敗，請手動新增',

      // ─── Add Modal ───
      'modal.title': '新增香菇計時器',
      'modal.type': '蘑菇類型',
      'modal.name': '備註名稱（選填）',
      'modal.namePlaceholder': '例：公司門口、捷運站旁',
      'modal.time': '倒數時間',
      'modal.custom': '自訂',
      'modal.minutePlaceholder': '分',
      'modal.secondPlaceholder': '秒',
      'modal.cancel': '取消',
      'modal.confirm': '開始計時',
      'modal.minutes': '{n} 分鐘',

      // ─── Mushroom Sizes ───
      'size.small': '小',
      'size.normal': '一般',
      'size.large': '大',
      'size.huge': '巨大',

      // ─── Mushroom Colors ───
      'color.purple': '毒蘑菇',
      'color.yellow': '電蘑菇',
      'color.ice-blue': '冰藍蘑菇',
      'color.blue': '藍色蘑菇',
      'color.green': '翠綠蘑菇',
      'color.red': '紅色蘑菇',
      'color.pink': '粉紅色蘑菇',
      'color.gray': '灰色蘑菇',
      'mushroom.default': '蘑菇',

      // ─── Timer Card ───
      'timer.ready': '可以打了！',
      'timer.respawnAt': '預計 {time} 重生',
      'timer.adjust': '調整時間',
      'timer.remove': '移除',
      'timer.editName': '點擊編輯名稱',
      'timer.maxReached': '最多同時 {n} 個計時器！',
      'timer.defaultName': '菇{n}',

      // ─── Duration Format ───
      'duration.hm': '{h} 小時 {m} 分',
      'duration.hms': '{h} 小時 {m} 分 {s} 秒',
      'duration.m': '{m} 分鐘',
      'duration.ms': '{m} 分 {s} 秒',

      // ─── Notification ───
      'notify.title': '菇長回來了！',
      'notify.bodyNamed': '{name} 的{mushroom}已重生',
      'notify.bodyDefault': '{mushroom}已重生，快去打！',
      'notify.banner': '開啟通知，菇長回來時提醒你',
      'notify.enable': '開啟通知',
      'notify.a2hs.title': '加入主畫面才能收到通知',
      'notify.a2hs.steps': '點底部 <span class="a2hs-icon">⬆️</span> 分享按鈕 → 「加入主畫面」',

      // ─── Language ───
      'lang.label': '語言',
    },

    'en': {
      // ─── Header ───
      'app.title': 'Mushroom Timer',
      'app.subtitle': 'Pikmin Bloom Mushroom Respawn Tracker',
      'theme.toggle': 'Toggle theme',

      // ─── Add Timer ───
      'btn.add': '+ New Timer',
      'empty.title': 'No timers yet',
      'empty.hint': 'Tap "+ New Timer" after defeating a mushroom',

      // ─── OCR Section ───
      'ocr.title': 'Screenshot OCR',
      'ocr.upload': 'Tap to upload or paste screenshot',
      'ocr.hint': 'Supports Ctrl+V / Cmd+V paste',
      'ocr.processing': 'Processing...',
      'ocr.failed': 'Recognition failed: ',
      'ocr.timeFailed': 'Time parsing failed, please add manually',

      // ─── Add Modal ───
      'modal.title': 'New Mushroom Timer',
      'modal.type': 'Mushroom Type',
      'modal.name': 'Label (optional)',
      'modal.namePlaceholder': 'e.g. Park entrance, Train station',
      'modal.time': 'Countdown',
      'modal.custom': 'Custom',
      'modal.minutePlaceholder': 'min',
      'modal.secondPlaceholder': 'sec',
      'modal.cancel': 'Cancel',
      'modal.confirm': 'Start Timer',
      'modal.minutes': '{n} min',

      // ─── Mushroom Sizes ───
      'size.small': 'S',
      'size.normal': 'M',
      'size.large': 'L',
      'size.huge': 'XL',

      // ─── Mushroom Colors ───
      'color.purple': 'Poison',
      'color.yellow': 'Electric',
      'color.ice-blue': 'Ice Blue',
      'color.blue': 'Blue',
      'color.green': 'Green',
      'color.red': 'Red',
      'color.pink': 'Pink',
      'color.gray': 'Gray',
      'mushroom.default': 'Mushroom',

      // ─── Timer Card ───
      'timer.ready': 'Ready to fight!',
      'timer.respawnAt': 'Respawns at {time}',
      'timer.adjust': 'Adjust',
      'timer.remove': 'Remove',
      'timer.editName': 'Click to edit name',
      'timer.maxReached': 'Max {n} timers allowed!',
      'timer.defaultName': 'Mushroom {n}',

      // ─── Duration Format ───
      'duration.hm': '{h}h {m}m',
      'duration.hms': '{h}h {m}m {s}s',
      'duration.m': '{m} min',
      'duration.ms': '{m}m {s}s',

      // ─── Notification ───
      'notify.title': 'Mushroom respawned!',
      'notify.bodyNamed': '{name} - {mushroom} has respawned',
      'notify.bodyDefault': '{mushroom} has respawned!',
      'notify.banner': 'Enable notifications for respawn alerts',
      'notify.enable': 'Enable',
      'notify.a2hs.title': 'Add to Home Screen for notifications',
      'notify.a2hs.steps': 'Tap <span class="a2hs-icon">⬆️</span> Share → "Add to Home Screen"',

      // ─── Language ───
      'lang.label': 'Language',
    },
  };

  const STORAGE_KEY = 'pikmin-lang';
  let currentLang = 'zh-Hant';

  /**
   * 偵測系統是否有 CJK 字型可用
   * 原理：Canvas measureText 比較法（業界標準做法）
   * 如果指定 CJK 字型不存在，瀏覽器 fallback 到 monospace，
   * 兩次量測寬度會相同；如果字型存在，寬度會不同。
   */
  function hasCJKFont() {
    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const testStr = '菇菇計時器測試';

      // 基準：純 monospace
      ctx.font = '72px monospace';
      const monoWidth = ctx.measureText(testStr).width;

      // 測試常見 CJK 字型（加 monospace 作為 fallback）
      const cjkFonts = ['PingFang TC', 'Heiti TC', 'Apple LiGothic', 'Noto Sans TC'];
      for (const font of cjkFonts) {
        ctx.font = `72px "${font}", monospace`;
        const testWidth = ctx.measureText(testStr).width;
        if (Math.abs(testWidth - monoWidth) > 1) {
          console.log(`[i18n] CJK font detected: ${font} (width diff: ${(testWidth - monoWidth).toFixed(1)})`);
          return true;
        }
      }

      console.log('[i18n] No CJK font found, falling back to English');
      return false;
    } catch {
      return true; // 無法偵測，假設有
    }
  }

  /**
   * 初始化：偵測語言
   * 優先順序：localStorage → CJK 字型偵測 → navigator.language → 預設 zh-Hant
   */
  function init() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && translations[saved]) {
      currentLang = saved;
    } else {
      const nav = navigator.language || navigator.languages?.[0] || '';
      if (nav.startsWith('zh') && hasCJKFont()) {
        currentLang = 'zh-Hant';
      } else if (nav.startsWith('zh')) {
        // 系統語言是中文但沒有 CJK 字型（如 iOS Simulator）→ fallback 英文
        console.log('[i18n] CJK font not available, falling back to English');
        currentLang = 'en';
      } else {
        currentLang = 'en';
      }
    }
    document.documentElement.lang = currentLang === 'zh-Hant' ? 'zh-Hant' : 'en';
    applyAll();
  }

  /**
   * 取得翻譯字串
   * @param {string} key — 翻譯鍵
   * @param {Object} [params] — 插值參數，如 { n: 5, name: 'foo' }
   * @returns {string}
   */
  function t(key, params) {
    const dict = translations[currentLang] || translations['zh-Hant'];
    let text = dict[key];
    if (text === undefined) {
      // Fallback 到繁中
      text = translations['zh-Hant'][key];
    }
    if (text === undefined) return key;

    if (params) {
      for (const [k, v] of Object.entries(params)) {
        text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), v);
      }
    }
    return text;
  }

  /**
   * 套用翻譯到所有帶 data-i18n 屬性的元素
   */
  function applyAll() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      const text = t(key);
      // 檢查是否需要設定 innerHTML（含 HTML 標籤的翻譯）
      if (el.hasAttribute('data-i18n-html')) {
        el.innerHTML = text;
      } else {
        el.textContent = text;
      }
    });
    // placeholder
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      el.placeholder = t(el.getAttribute('data-i18n-placeholder'));
    });
    // aria-label
    document.querySelectorAll('[data-i18n-aria]').forEach(el => {
      el.setAttribute('aria-label', t(el.getAttribute('data-i18n-aria')));
    });
  }

  /**
   * 切換語言
   */
  function setLang(lang) {
    if (!translations[lang]) return;
    currentLang = lang;
    localStorage.setItem(STORAGE_KEY, lang);
    document.documentElement.lang = lang === 'zh-Hant' ? 'zh-Hant' : 'en';
    applyAll();
    // 觸發自訂事件，讓 app.js 知道要重新渲染
    document.dispatchEvent(new CustomEvent('langchange', { detail: { lang } }));
  }

  function getLang() {
    return currentLang;
  }

  function getAvailableLangs() {
    return Object.keys(translations);
  }

  return { init, t, applyAll, setLang, getLang, getAvailableLangs };

})();
