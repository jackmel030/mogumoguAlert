import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.mogumogu.timer',
  appName: '菇菇計時器',
  // 無 build 步驟的專案，透過 npm run build 複製 Web 檔案到 dist/
  webDir: 'dist',
  server: {
    // iOS App 內不使用外部 URL，直接載入本地檔案
    androidScheme: 'https',
  },
  ios: {
    // 啟用 WKWebView 的 limitsNavigationsToAppBoundDomains
    // 這對 Service Worker 在 App 內正常運作是必要的
    limitsNavigationsToAppBoundDomains: true,
  },
};

export default config;
