#!/usr/bin/env node
/**
 * build.js — 將 Web 資源複製到 dist/ 供 Capacitor 使用
 *
 * 因為專案沒有 bundler/build 步驟，
 * 這個腳本只負責把需要的檔案同步到 dist/ 目錄。
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

// 需要複製的檔案和目錄
const FILES = [
  'index.html',
  'app.js',
  'style.css',
  'platform.js',
  'i18n.js',
  'paddle-ocr.js',
  'mushroom-ocr.js',
  'sw.js',
  'manifest.json',
  'favicon.svg',
];

const DIRS = [
  'icons',
];

// 清空並重建 dist/
if (fs.existsSync(DIST)) {
  fs.rmSync(DIST, { recursive: true });
}
fs.mkdirSync(DIST, { recursive: true });

// 複製檔案
for (const file of FILES) {
  const src = path.join(ROOT, file);
  const dest = path.join(DIST, file);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    console.log(`  ✓ ${file}`);
  } else {
    console.warn(`  ⚠ ${file} 不存在，跳過`);
  }
}

// 複製目錄（遞迴）
for (const dir of DIRS) {
  const src = path.join(ROOT, dir);
  const dest = path.join(DIST, dir);
  if (fs.existsSync(src)) {
    fs.cpSync(src, dest, { recursive: true });
    console.log(`  ✓ ${dir}/`);
  } else {
    console.warn(`  ⚠ ${dir}/ 不存在，跳過`);
  }
}

console.log('\n✅ Build 完成 → dist/');
