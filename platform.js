/**
 * platform.js — 平台抽象層
 *
 * 統一 PWA 與 Capacitor (iOS App) 的 API 呼叫。
 * 各功能透過此層判斷執行環境，自動選擇對應的原生或 Web 實作。
 */

const Platform = (() => {

  /**
   * 偵測是否在 Capacitor 原生環境中執行
   * Capacitor 會在 WebView 中注入 window.Capacitor 物件
   */
  function isNative() {
    return !!(typeof window !== 'undefined'
      && window.Capacitor
      && window.Capacitor.isNativePlatform
      && window.Capacitor.isNativePlatform());
  }

  /**
   * 取得目前平台名稱
   * @returns {'ios' | 'android' | 'web'}
   */
  function getPlatform() {
    if (!isNative()) return 'web';
    return window.Capacitor.getPlatform();
  }

  // ─── 推播通知抽象 ───

  /**
   * 請求通知權限
   * Native: 使用 Capacitor LocalNotifications
   * PWA: 使用 Web Notification API
   * @returns {Promise<boolean>} 是否取得權限
   */
  async function requestPush() {
    if (isNative()) {
      try {
        const { LocalNotifications } = await import('https://esm.sh/@capacitor/local-notifications');
        const result = await LocalNotifications.requestPermissions();
        return result.display === 'granted';
      } catch (e) {
        console.warn('[platform] Native notification permission failed:', e);
        return false;
      }
    }
    // PWA
    if (!('Notification' in window)) return false;
    const permission = await Notification.requestPermission();
    return permission === 'granted';
  }

  /**
   * 檢查通知權限狀態
   * @returns {Promise<'granted'|'denied'|'default'>}
   */
  async function getNotificationStatus() {
    if (isNative()) {
      try {
        const { LocalNotifications } = await import('https://esm.sh/@capacitor/local-notifications');
        const result = await LocalNotifications.checkPermissions();
        return result.display; // 'granted' | 'denied' | 'prompt'
      } catch {
        return 'default';
      }
    }
    if (!('Notification' in window)) return 'denied';
    return Notification.permission;
  }

  /**
   * 發送本地通知
   * Native: Capacitor LocalNotifications（支援背景通知）
   * PWA: Web Notification / Service Worker
   */
  async function sendNotification({ id, title, body, icon }) {
    if (isNative()) {
      try {
        const { LocalNotifications } = await import('https://esm.sh/@capacitor/local-notifications');
        await LocalNotifications.schedule({
          notifications: [{
            id: typeof id === 'number' ? id : Math.floor(Math.random() * 100000),
            title,
            body,
            sound: 'default',
            smallIcon: 'ic_stat_icon',
            largeIcon: icon || 'icons/icon-192.png',
          }],
        });
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
   * Native: Capacitor LocalNotifications schedule
   * PWA: 不支援排程，回傳 false
   * @returns {Promise<boolean>} 是否成功排程
   */
  async function scheduleNotification({ id, title, body, at }) {
    if (!isNative()) return false;
    try {
      const { LocalNotifications } = await import('https://esm.sh/@capacitor/local-notifications');
      await LocalNotifications.schedule({
        notifications: [{
          id: typeof id === 'number' ? id : Math.floor(Math.random() * 100000),
          title,
          body,
          schedule: { at },
          sound: 'default',
        }],
      });
      return true;
    } catch (e) {
      console.warn('[platform] Schedule notification failed:', e);
      return false;
    }
  }

  return {
    isNative,
    getPlatform,
    requestPush,
    getNotificationStatus,
    sendNotification,
    scheduleNotification,
  };

})();
