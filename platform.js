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

  return {
    isNative,
    getPlatform,
  };

})();
