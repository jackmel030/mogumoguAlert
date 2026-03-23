/**
 * platform.js — 平台抽象層
 *
 * 統一 PWA 與 Capacitor (iOS App) 的 API 呼叫。
 * 各功能透過此層判斷執行環境，自動選擇對應的原生或 Web 實作。
 */

const Platform = (() => {

  let _cachedLN = null;

  function isNative() {
    return !!(typeof window !== 'undefined'
      && window.Capacitor
      && window.Capacitor.isNativePlatform
      && window.Capacitor.isNativePlatform());
  }

  /**
   * @returns {'ios' | 'android' | 'web'}
   */
  function getPlatform() {
    if (!isNative()) return 'web';
    return window.Capacitor.getPlatform();
  }

  // ─── 推播通知抽象 ───

  function getLocalNotifications() {
    if (!isNative()) return null;
    if (_cachedLN) return _cachedLN;
    const plugins = window.Capacitor.Plugins;
    if (plugins && plugins.LocalNotifications) {
      _cachedLN = plugins.LocalNotifications;
    } else if (window.Capacitor.registerPlugin) {
      _cachedLN = window.Capacitor.registerPlugin('LocalNotifications');
    }
    return _cachedLN;
  }

  function normalizeId(id) {
    return typeof id === 'number' ? id : Math.floor(Math.random() * 100000);
  }

  /**
   * 排程原生本地通知（內部共用）
   */
  function scheduleNative(ln, { id, title, body, icon, at }) {
    const notification = {
      id: normalizeId(id),
      title,
      body,
      sound: 'default',
    };
    if (icon) notification.largeIcon = icon;
    // Capacitor LocalNotifications 需要明確的 schedule.at 才會觸發，
    // 即使是「即時」通知也需提供一個近未來時間
    notification.schedule = { at: at || new Date(Date.now() + 500) };
    return ln.schedule({ notifications: [notification] });
  }

  /**
   * 請求通知權限
   * @returns {Promise<boolean>}
   */
  async function requestPush() {
    const ln = getLocalNotifications();
    if (ln) {
      try {
        const result = await ln.requestPermissions();
        return result.display === 'granted';
      } catch (e) {
        console.warn('[platform] Native notification permission failed:', e);
        return false;
      }
    }
    if (!('Notification' in window)) return false;
    const permission = await Notification.requestPermission();
    return permission === 'granted';
  }

  /**
   * 檢查通知權限狀態
   * @returns {Promise<'granted'|'denied'|'default'>}
   */
  async function getNotificationStatus() {
    const ln = getLocalNotifications();
    if (ln) {
      try {
        const result = await ln.checkPermissions();
        return result.display;
      } catch {
        return 'default';
      }
    }
    if (!('Notification' in window)) return 'denied';
    return Notification.permission;
  }

  /**
   * 發送本地通知（即時）
   * Native: Capacitor LocalNotifications
   * PWA: Web Notification / Service Worker
   */
  async function sendNotification({ id, title, body, icon }) {
    const ln = getLocalNotifications();
    if (ln) {
      try {
        await scheduleNative(ln, { id, title, body, icon });
        return;
      } catch (e) {
        console.warn('[platform] Native notification failed, falling back to web:', e);
      }
    }
    // PWA fallback
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    if (navigator.serviceWorker && navigator.serviceWorker.controller) {
      const reg = await navigator.serviceWorker.ready;
      reg.showNotification(title, {
        body,
        icon: icon || 'icons/icon-192.png',
        badge: 'icons/icon-192.png',
        tag: `timer-${id}`,
        vibrate: [200, 100, 200],
      });
    } else {
      new Notification(title, { body });
    }
  }

  /**
   * 排程本地通知（在指定時間觸發）
   * Native only，PWA 回傳 false
   * @returns {Promise<boolean>}
   */
  async function scheduleNotification({ id, title, body, at }) {
    const ln = getLocalNotifications();
    if (!ln) return false;
    try {
      await scheduleNative(ln, { id, title, body, at });
      return true;
    } catch (e) {
      console.warn('[platform] Schedule notification failed:', e);
      return false;
    }
  }

  // ─── OCR 抽象 ───

  let _cachedOCR = null;

  function getVisionKitOCR() {
    if (!isNative()) return null;
    if (_cachedOCR) return _cachedOCR;
    const plugins = window.Capacitor.Plugins;
    if (plugins && plugins.VisionKitOCR) {
      _cachedOCR = plugins.VisionKitOCR;
    } else if (window.Capacitor.registerPlugin) {
      _cachedOCR = window.Capacitor.registerPlugin('VisionKitOCR');
    }
    return _cachedOCR;
  }

  /**
   * 執行 OCR 文字辨識
   * Native iOS: VisionKit（離線、快速、支援繁中）
   * PWA: 回傳 null，由呼叫端 fallback 到 Tesseract/PaddleOCR
   *
   * @param {string} base64Image - base64 編碼的圖片（可含 data URI prefix）
   * @param {object} [options]
   * @param {string[]} [options.languages] - 辨識語言，預設 ['zh-Hant', 'en']
   * @returns {Promise<{text: string, blocks: Array} | null>} 辨識結果，或 null（非原生環境）
   */
  async function runOCR(base64Image, options = {}) {
    const ocr = getVisionKitOCR();
    if (!ocr) return null;
    try {
      return await ocr.recognize({
        base64: base64Image,
        languages: options.languages || ['zh-Hant', 'en'],
      });
    } catch (e) {
      console.warn('[platform] VisionKit OCR failed:', e);
      return null;
    }
  }

  return {
    isNative,
    getPlatform,
    requestPush,
    getNotificationStatus,
    sendNotification,
    scheduleNotification,
    runOCR,
  };

})();
