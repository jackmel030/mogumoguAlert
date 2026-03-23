/**
 * mushroom-ocr.js — Pikmin Bloom 蘑菇截圖專屬辨識模組
 *
 * 策略：
 * 1. 蘑菇顏色 → 面板文字解析（備用：圖像顏色取樣）
 * 2. 蘑菇大小 → 白色面板區域文字 OCR（背景乾淨）
 * 3. 剩餘時間 → 裁切 + 白色文字提取 + chi_tra+eng 單次 OCR
 */

// ─── 蘑菇顏色特徵（HSL 範圍） ───
// 從 9 張截圖分析出的各蘑菇代表色
// bestChannel: 該顏色背景下，OCR 白色文字最佳的色彩通道（互補色原理）
// 0=R, 1=G, 2=B
const MUSHROOM_COLORS = [
  { name: '毒蘑菇',     hueMin: 270, hueMax: 310, satMin: 30, color: 'purple',   bestChannel: 1 }, // 紫→G最弱
  { name: '電蘑菇',     hueMin: 40,  hueMax: 65,  satMin: 50, color: 'yellow',   bestChannel: 2 }, // 黃→B最弱
  { name: '冰藍蘑菇',   hueMin: 185, hueMax: 210, satMin: 30, color: 'ice-blue', bestChannel: 0 }, // 冰藍→R最弱
  { name: '藍色蘑菇',   hueMin: 210, hueMax: 250, satMin: 30, color: 'blue',     bestChannel: 0 }, // 藍→R最弱
  { name: '翠綠蘑菇',   hueMin: 100, hueMax: 160, satMin: 30, color: 'green',    bestChannel: 2 }, // 綠→B最弱
  { name: '紅色蘑菇',   hueMin: 350, hueMax: 360, satMin: 40, color: 'red',      bestChannel: 1, hueMin2: 0, hueMax2: 15 }, // 紅→G最弱
  { name: '粉紅色蘑菇', hueMin: 310, hueMax: 350, satMin: 25, color: 'pink',     bestChannel: 1 }, // 粉紅→G最弱
  { name: '灰色蘑菇',   hueMin: 0,   hueMax: 360, satMin: 0,  satMax: 20, color: 'gray', bestChannel: -1 }, // 灰→用RGB交集
];

const CHANNEL_NAMES = ['R', 'G', 'B'];

// ─── 動態區域偵測 ───
// 掃描圖片找到白色面板的上緣（錨點），其他區域相對錨點定位
function detectRegions(img) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  // 縮小掃描加速（寬度 200px 足夠偵測亮度變化）
  const scanW = 200;
  const scanH = Math.round(img.height * (scanW / img.width));
  canvas.width = scanW;
  canvas.height = scanH;
  ctx.drawImage(img, 0, 0, scanW, scanH);
  const imageData = ctx.getImageData(0, 0, scanW, scanH);
  const data = imageData.data;

  // 計算每一行的平均亮度
  const rowBrightness = [];
  for (let y = 0; y < scanH; y++) {
    let sum = 0;
    for (let x = 0; x < scanW; x++) {
      const i = (y * scanW + x) * 4;
      sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    }
    rowBrightness.push(sum / scanW);
  }

  // 從圖片 40%-60% 範圍內找亮度驟升的位置（深色→白色面板）
  const searchStart = Math.round(scanH * 0.40);
  const searchEnd = Math.round(scanH * 0.60);
  let panelTopY = -1;
  let maxJump = 0;

  for (let y = searchStart + 1; y < searchEnd; y++) {
    // 用 3 行滑動窗口平滑比較
    const before = (rowBrightness[y - 3] + rowBrightness[y - 2] + rowBrightness[y - 1]) / 3;
    const after = (rowBrightness[y] + rowBrightness[y + 1] + rowBrightness[y + 2]) / 3;
    const jump = after - before;
    if (jump > maxJump && after > 180) { // 白色面板亮度 > 180
      maxJump = jump;
      panelTopY = y;
    }
  }

  // 轉換回原圖百分比
  const panelTopPct = panelTopY > 0 ? panelTopY / scanH : 0.49;
  console.log(`[mushroom-ocr] 白色面板上緣: ${(panelTopPct * 100).toFixed(1)}% (亮度跳躍: ${maxJump.toFixed(0)})`);

  // 所有區域相對錨點定位
  return {
    // 地點名稱：頂部橫幅（包含「地名 >」，高度可能不同所以裁大一點）
    location:      { x: 0.05, y: 0.04, w: 0.90, h: 0.08 },
    // 蘑菇圖像：錨點上方的大範圍（顏色取樣）
    mushroomImage: { x: 0.20, y: panelTopPct - 0.35, w: 0.60, h: 0.25 },
    // 時間文字：緊貼水平線上方那一行小字
    timeText:      { x: 0.0,  y: panelTopPct - 0.03, w: 0.50, h: 0.02 },
    // 白色面板：錨點正下方
    panelText:     { x: 0.05, y: panelTopPct + 0.02, w: 0.90, h: 0.10 },
  };
}

// ─── 主要辨識函數 ───
async function mushroomOCR(file, onProgress) {
  const report = (msg, pct) => onProgress && onProgress(msg, pct);

  const startedAt = Date.now(); // 記錄開始分析的時間

  report('載入圖片...', 5);
  const img = await loadImage(file);

  // 0. 動態偵測白色面板位置作為錨點
  report('偵測佈局...', 8);
  const REGIONS = detectRegions(img);

  // 1. 顏色取樣辨識蘑菇類型
  report('分析蘑菇顏色...', 10);
  const colorResult = detectMushroomByColor(img, REGIONS);

  // 2. 裁切地點名稱區域（白字在深色/半透明橫幅上）
  report('辨識地點名稱...', 15);
  const { canvas: locRaw } = cropRaw(img, REGIONS.location, 4);
  const locWhite = processCanvas(locRaw, 'whiteText', { threshold: 190 });
  const locDenoised = denoiseCanvas(locWhite, 2);
  debugShowCanvas('[mushroom-ocr] 地點-白色提取', locDenoised);
  const locationText = await ocrRegion(locDenoised, {
    lang: 'chi_tra+eng',
    onProgress: (p) => report('辨識地點名稱...', 15 + p * 10),
  });

  // 3. 裁切白色面板區域辨識大小+顏色（黑字在白底上）
  //    原生: VisionKit → PWA: PaddleOCR → fallback Tesseract
  report('辨識蘑菇類型...', 30);
  const panelBlob = cropRegion(img, REGIONS.panelText, { scale: 3, mode: 'binarize', threshold: 180 });
  let panelText = null;

  // 原生環境：VisionKit（ocrRegion 內部已處理平台判斷）
  if (typeof Platform !== 'undefined' && Platform.isNative()) {
    panelText = await ocrRegion(panelBlob, {});
    if (panelText) console.log('[mushroom-ocr] 面板(VisionKit):', panelText);
  }

  if (!panelText) {
    // PWA: PaddleOCR 優先
    panelText = await paddleOcrText(panelBlob, (msg) => report(msg, 35));
    if (panelText !== null) {
      console.log('[mushroom-ocr] 面板(PaddleOCR):', panelText);
    } else {
      // PaddleOCR 不可用 → fallback Tesseract
      panelText = await ocrRegion(panelBlob, {
        lang: 'chi_tra',
        onProgress: (p) => report('辨識蘑菇類型...', 30 + p * 20),
      });
      console.log('[mushroom-ocr] 面板(Tesseract):', panelText);
    }
  }


  // 4. 裁切時間區域 — 白色文字提取策略
  //    時間文字是白色，HP 數字是紅色 → 白色提取天然過濾紅色
  report('辨識剩餘時間...', 50);
  const { canvas: timeRaw } = cropRaw(img, REGIONS.timeText, 4);

  debugShowCanvas('[mushroom-ocr] 時間-原始裁切', timeRaw);

  // 白色文字提取（乾淨的二值化圖，用於 OCR）
  report('辨識時間：影像前處理...', 52);
  const timeWhite = processCanvas(timeRaw, 'whiteText', { threshold: 200 });
  const timeWhiteDenoised = denoiseCanvas(timeWhite, 2);
  debugShowCanvas('[mushroom-ocr] 時間-白色提取', timeWhiteDenoised);

  // 快速路徑：模板比對（~50ms），失敗則 fallback Tesseract
  report('辨識時間...', 55);
  let timeText = null;
  const tmResult = templateMatchTime(timeWhiteDenoised);
  if (tmResult) {
    timeText = tmResult;
    console.log('[mushroom-ocr] 時間(模板比對):', timeText);
  } else {
    // Fallback: Tesseract OCR
    timeText = await ocrRegion(timeWhiteDenoised, {
      lang: 'chi_tra+eng',
      onProgress: (p) => report('辨識時間...', 55 + p * 35),
    });
    console.log('[mushroom-ocr] 時間(Tesseract):', timeText);
    // Tesseract 成功 → 自動 bootstrap 模板
    const parsed = tryParseTime(timeText);
    if (parsed) {
      bootstrapTemplates(timeWhiteDenoised, timeText);
    }
  }

  report('辨識完成！', 100);

  // Debug
  debugShowCanvas('[mushroom-ocr] 面板裁切', panelBlob);
  console.log('[mushroom-ocr] 顏色辨識:', colorResult);
  console.log('[mushroom-ocr] 時間區域:', `y=${(REGIONS.timeText.y * 100).toFixed(1)}%-${((REGIONS.timeText.y + REGIONS.timeText.h) * 100).toFixed(1)}%`);
  console.log('[mushroom-ocr] 蘑菇顏色:', colorResult.color);
  console.log('[mushroom-ocr] 地點文字:', locationText);
  console.log('[mushroom-ocr] 面板文字:', panelText);
  console.log('[mushroom-ocr] 時間採用:', timeText);

  // 計算分析耗時
  const elapsedSec = Math.round((Date.now() - startedAt) / 1000);
  console.log(`[mushroom-ocr] 分析耗時: ${elapsedSec} 秒`);

  // 釋放 Tesseract workers
  await terminateWorkers();

  // 組合結果（含分析耗時，讓計時器扣除）
  // 蘑菇顏色優先從面板文字解析，顏色取樣作為備用
  return parseResults(colorResult, locationText, panelText, timeText, elapsedSec);
}

// ─── 顏色取樣辨識蘑菇類型 ───
function detectMushroomByColor(img, regions) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const r = regions.mushroomImage;

  const sx = Math.round(img.width * r.x);
  const sy = Math.round(img.height * r.y);
  const sw = Math.round(img.width * r.w);
  const sh = Math.round(img.height * r.h);

  canvas.width = sw;
  canvas.height = sh;
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);

  const imageData = ctx.getImageData(0, 0, sw, sh);
  const data = imageData.data;

  // 統計 HSL 色相分布（忽略太暗或太亮的像素）
  const hueVotes = {};
  MUSHROOM_COLORS.forEach(c => { hueVotes[c.color] = 0; });

  let sampledPixels = 0;
  for (let i = 0; i < data.length; i += 16) { // 每 4 個像素取樣一次（加速）
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const [h, s, l] = rgbToHsl(r, g, b);

    // 忽略太暗（陰影）或太亮（高光）的像素
    if (l < 15 || l > 90) continue;
    sampledPixels++;

    for (const mc of MUSHROOM_COLORS) {
      const satMin = mc.satMin || 0;
      const satMax = mc.satMax !== undefined ? mc.satMax : 100;

      if (s < satMin || s > satMax) continue;

      let hueMatch = (h >= mc.hueMin && h <= mc.hueMax);
      // 紅色跨越 0 度
      if (mc.hueMin2 !== undefined) {
        hueMatch = hueMatch || (h >= mc.hueMin2 && h <= mc.hueMax2);
      }
      // 灰色特殊處理：只看飽和度
      if (mc.color === 'gray') {
        hueMatch = true;
      }

      if (hueMatch) {
        hueVotes[mc.color]++;
      }
    }
  }

  // 找出最高票（灰色要特別高比例才算）
  let bestColor = null;
  let bestScore = 0;

  for (const [color, votes] of Object.entries(hueVotes)) {
    const ratio = sampledPixels > 0 ? votes / sampledPixels : 0;
    // 灰色需要 > 40% 比例才算（因為其他顏色的暗部也可能被算成灰）
    if (color === 'gray' && ratio < 0.4) continue;
    if (votes > bestScore) {
      bestScore = votes;
      bestColor = color;
    }
  }

  const bestMushroom = MUSHROOM_COLORS.find(c => c.color === bestColor);
  return {
    color: bestColor,
    name: bestMushroom ? bestMushroom.name : '未知蘑菇',
    confidence: sampledPixels > 0 ? bestScore / sampledPixels : 0,
  };
}

// ─── 裁切 + 前處理 ───
// 從圖片中裁切指定區域並放大
function cropRaw(img, region, scale) {
  const sx = Math.round(img.width * region.x);
  const sy = Math.round(img.height * region.y);
  const sw = Math.round(img.width * region.w);
  const sh = Math.round(img.height * region.h);

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  canvas.width = sw * scale;
  canvas.height = sh * scale;
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  return { canvas, ctx, width: canvas.width, height: canvas.height };
}

// 前處理模式：
//   'binarize' — 灰階+二值化（白底黑字，如白色面板）
//   'rgbIntersect' — 三通道交集：只有 R、G、B 都亮的像素才保留（= 白色文字）
//   'singleChannel' — 單色通道提取 + 二值化（用於多通道投票）
function processCanvas(canvas, mode, opts = {}) {
  const { threshold = 128, channel = 0 } = opts;
  const ctx = canvas.getContext('2d');
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;

  const out = document.createElement('canvas');
  out.width = canvas.width;
  out.height = canvas.height;
  const outCtx = out.getContext('2d');
  const outData = outCtx.createImageData(canvas.width, canvas.height);
  const od = outData.data;

  for (let i = 0; i < data.length; i += 4) {
    let val = 255; // 預設白底

    if (mode === 'whiteText') {
      // 白色文字提取：只保留高亮度 + 低飽和度的像素（= 白色文字）
      // 紅色 HP 數字 (255,50,50) → min=50 → 被過濾
      // 白色時間文字 (240,240,240) → min=240 → 保留
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const minCh = Math.min(r, g, b);
      const maxCh = Math.max(r, g, b);
      const isWhite = minCh > threshold && (maxCh - minCh) < 60;
      val = isWhite ? 0 : 255;
    } else if (mode === 'rgbIntersect') {
      // 三通道交集：min(R,G,B) > threshold → 白色文字
      const minVal = Math.min(data[i], data[i + 1], data[i + 2]);
      val = minVal > threshold ? 0 : 255; // 黑字白底
    } else if (mode === 'singleChannel') {
      // 單通道：取指定通道值做二值化
      val = data[i + channel] > threshold ? 0 : 255;
    } else {
      // binarize
      const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      val = gray > threshold ? 255 : 0;
    }

    od[i] = val;
    od[i + 1] = val;
    od[i + 2] = val;
    od[i + 3] = 255;
  }

  outCtx.putImageData(outData, 0, 0);
  return out;
}

// 去噪：移除孤立的黑色像素（雜訊），只保留有足夠鄰居的文字筆畫
function denoiseCanvas(canvas, minNeighbors = 2) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  const src = ctx.getImageData(0, 0, w, h);
  const dst = ctx.createImageData(w, h);
  const sd = src.data, dd = dst.data;

  // 複製原始資料
  dd.set(sd);

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = (y * w + x) * 4;
      if (sd[i] === 0) { // 黑色像素（可能是文字或雜訊）
        // 計算 8 鄰域中的黑色像素數
        let neighbors = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const ni = ((y + dy) * w + (x + dx)) * 4;
            if (sd[ni] === 0) neighbors++;
          }
        }
        // 鄰居不足 → 視為雜訊，改為白色
        if (neighbors < minNeighbors) {
          dd[i] = dd[i + 1] = dd[i + 2] = 255;
        }
      }
    }
  }

  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  out.getContext('2d').putImageData(dst, 0, 0);
  return out;
}

// 便利函數：裁切 + 處理一步完成
function cropRegion(img, region, opts = {}) {
  const { scale = 2, mode = 'binarize', threshold = 128 } = opts;
  const { canvas } = cropRaw(img, region, scale);
  return processCanvas(canvas, mode, { threshold });
}

// ─── Tesseract OCR（複用 worker，同語言包只建立一次）───
const _tesseractWorkers = {};

async function getWorker(lang) {
  if (_tesseractWorkers[lang]) return _tesseractWorkers[lang];
  const worker = await Tesseract.createWorker(lang);
  _tesseractWorkers[lang] = worker;
  return worker;
}

async function terminateWorkers() {
  for (const [lang, worker] of Object.entries(_tesseractWorkers)) {
    await worker.terminate();
    delete _tesseractWorkers[lang];
  }
}

/**
 * Canvas → base64 轉換（供 VisionKit 使用）
 */
function canvasToBase64(canvas) {
  return canvas.toDataURL('image/png');
}

/**
 * OCR 文字辨識：原生環境優先 VisionKit，否則 Tesseract
 */
async function ocrRegion(canvas, opts = {}) {
  // 原生環境優先使用 VisionKit（離線、快速）
  if (typeof Platform !== 'undefined' && Platform.isNative()) {
    const result = await Platform.runOCR(canvasToBase64(canvas));
    if (result && result.text) {
      console.log('[mushroom-ocr] VisionKit OCR:', result.text.trim());
      return result.text.trim();
    }
  }
  // PWA fallback: Tesseract
  const { lang = 'chi_tra+eng' } = opts;
  const worker = await getWorker(lang);
  const { data: { text } } = await worker.recognize(canvas);
  return text.trim();
}


// ─── 面板文字 → 蘑菇顏色 ───
// 從面板文字（去空格後）解析顏色關鍵字
// 長關鍵字優先匹配，避免「粉紅」被「紅」搶先
const PANEL_COLOR_KEYWORDS = [
  { keyword: '冰藍', color: 'ice-blue' },
  { keyword: '翠綠', color: 'green' },
  { keyword: '粉紅', color: 'pink' },
  { keyword: '藍色', color: 'blue' },
  { keyword: '紅色', color: 'red' },
  { keyword: '灰色', color: 'gray' },
  { keyword: '毒',   color: 'purple' },
  { keyword: '電',   color: 'yellow' },
  // OCR 可能漏掉「色」字，以下為短 fallback（放最後避免誤判）
  { keyword: '灰',   color: 'gray' },
  { keyword: '藍',   color: 'blue' },
  { keyword: '紅',   color: 'red' },
  { keyword: '綠',   color: 'green' },
  { keyword: '粉',   color: 'pink' },
];

function detectColorFromPanel(panelNoSpace) {
  for (const { keyword, color } of PANEL_COLOR_KEYWORDS) {
    if (panelNoSpace.includes(keyword)) return color;
  }
  return null;
}

// ─── 解析組合結果 ───
function parseResults(colorResult, locationText, panelText, timeText, elapsedSec) {
  // 去空格後用於顏色和大小解析（OCR 常在字間插空格）
  const panelClean = panelText.replace(/\s+/g, '');

  // 蘑菇顏色：優先面板文字，備用顏色取樣
  const panelColor = panelClean ? detectColorFromPanel(panelClean) : null;
  const finalColor = panelColor || colorResult.color;
  const finalName = panelColor
    ? (PANEL_COLOR_KEYWORDS.find(k => k.color === panelColor)?.keyword || '') + '蘑菇'
    : colorResult.name;

  console.log(`[mushroom-ocr] 顏色判定: 面板=${panelColor || '無'}, 取樣=${colorResult.color} → 採用=${finalColor}`);

  const result = {
    mushroomName: finalName,
    mushroomColor: finalColor,
    colorConfidence: panelColor ? 1.0 : colorResult.confidence,
    mushroomSize: null,  // 'small' | 'normal' | 'large' | 'huge'
    location: null,
    time: null,
    analysisElapsed: elapsedSec || 0, // 分析耗時（秒）
    rawLocation: locationText,
    rawPanel: panelText,
    rawTime: timeText,
  };

  // 地點名稱：找「>」符號，取其左邊的文字
  const locClean = locationText.replace(/\n/g, ' ').trim();
  const arrowIdx = locClean.search(/[>＞》»→►]/);
  if (arrowIdx > 0) {
    result.location = locClean.substring(0, arrowIdx).trim();
  } else {
    // 沒找到「>」→ 取第一行有意義的文字
    const locLine = locationText.split('\n').map(l => l.trim()).filter(l => l.length >= 2)[0];
    if (locLine) result.location = locLine;
  }

  // 從面板文字解析大小
  if (/巨大/.test(panelClean)) {
    result.mushroomSize = 'huge';
  } else if (/大/.test(panelClean) && !/大家/.test(panelClean)) {
    result.mushroomSize = 'large';
  } else if (/小/.test(panelClean)) {
    result.mushroomSize = 'small';
  } else if (/一般/.test(panelClean)) {
    result.mushroomSize = 'normal';
  }

  // 從時間文字解析時間
  result.time = tryParseTime(timeText);

  return result;
}

// ─── 工具函數 ───
function loadImage(file) {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.src = url;
  });
}

function debugShowCanvas(label, canvas) {
  const url = canvas.toDataURL();
  console.log(`${label} (${canvas.width}x${canvas.height}):`);
  console.log('%c ', `font-size:1px; padding:${canvas.height/4}px ${canvas.width/4}px; background:url(${url}) no-repeat; background-size:contain;`);
}

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;

  if (max === min) {
    h = s = 0;
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }

  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
}

// ─── 時間文字解析（獨立函數，供 parseResults 和 template matching 共用）───
function tryParseTime(text) {
  const t = text.replace(/\s+/g, '');

  // X小時Y分Z秒
  const hms = t.match(/(\d{1,2})小時(\d{1,2})分(\d{1,2})/);
  if (hms) return { hours: +hms[1], minutes: +hms[2], seconds: +hms[3] };

  // X分Y秒
  const ms = t.match(/(\d{1,3})分(\d{1,2})/);
  if (ms) return { hours: 0, minutes: +ms[1], seconds: +ms[2] };

  // Z秒
  const s = t.match(/(\d{1,2})秒/);
  if (s) return { hours: 0, minutes: 0, seconds: +s[1] };

  // HH:MM:SS
  const col3 = t.match(/(\d{1,2})[:：](\d{1,2})[:：](\d{1,2})/);
  if (col3) return { hours: +col3[1], minutes: +col3[2], seconds: +col3[3] };

  // MM:SS
  const col2 = t.match(/(\d{1,2})[:：](\d{1,2})/);
  if (col2) return { hours: 0, minutes: +col2[1], seconds: +col2[2] };

  return null;
}

// ─── Template Matching 引擎 ───
const TEMPLATE_STORAGE_KEY = 'pikmin-ocr-templates';
const TEMPLATE_TARGET_H = 32;
const TEMPLATE_MIN_CHAR_W = 8;  // 最小字元寬度（像素），過濾雜訊
const TEMPLATE_MAX_DIFF = 0.25; // 匹配閾值：像素差異率 < 25% 才算匹配

/**
 * 垂直投影分割字元：找出黑色像素的列分布，以空白列分隔字元
 * @param {HTMLCanvasElement} canvas — 二值化圖（黑字白底）
 * @returns {Array<{x,w,canvas}>} 每個字元的位置和裁切 canvas
 */
function segmentCharacters(canvas) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  const data = ctx.getImageData(0, 0, w, h).data;

  // 1. 計算每列的黑色像素數
  const colCounts = new Uint32Array(w);
  for (let x = 0; x < w; x++) {
    let count = 0;
    for (let y = 0; y < h; y++) {
      if (data[(y * w + x) * 4] === 0) count++;
    }
    colCounts[x] = count;
  }

  // 2. 找出連續非空列（字元區段）
  const segments = [];
  let inChar = false;
  let startX = 0;
  for (let x = 0; x < w; x++) {
    if (colCounts[x] > 0 && !inChar) {
      inChar = true;
      startX = x;
    } else if (colCounts[x] === 0 && inChar) {
      inChar = false;
      const segW = x - startX;
      if (segW >= TEMPLATE_MIN_CHAR_W) {
        segments.push({ x: startX, w: segW });
      }
    }
  }
  if (inChar) {
    const segW = w - startX;
    if (segW >= TEMPLATE_MIN_CHAR_W) {
      segments.push({ x: startX, w: segW });
    }
  }

  // 3. 裁切每個字元（trim 上下白邊）
  return segments.map(seg => {
    // 找垂直邊界（trim whitespace）
    let topY = h, bottomY = 0;
    for (let y = 0; y < h; y++) {
      for (let x = seg.x; x < seg.x + seg.w; x++) {
        if (data[(y * w + x) * 4] === 0) {
          if (y < topY) topY = y;
          if (y > bottomY) bottomY = y;
        }
      }
    }
    if (topY >= bottomY) return null;

    const charH = bottomY - topY + 1;
    const charCanvas = document.createElement('canvas');
    charCanvas.width = seg.w;
    charCanvas.height = charH;
    const charCtx = charCanvas.getContext('2d');
    charCtx.drawImage(canvas, seg.x, topY, seg.w, charH, 0, 0, seg.w, charH);

    return { x: seg.x, w: seg.w, h: charH, canvas: charCanvas };
  }).filter(Boolean);
}

/**
 * 正規化字元：縮放到固定高度，回傳二值像素陣列 (0/1)
 */
function normalizeChar(canvas, targetH) {
  const ratio = targetH / canvas.height;
  const targetW = Math.max(1, Math.round(canvas.width * ratio));

  const norm = document.createElement('canvas');
  norm.width = targetW;
  norm.height = targetH;
  const ctx = norm.getContext('2d');
  ctx.drawImage(canvas, 0, 0, targetW, targetH);

  // 轉為二值陣列
  const data = ctx.getImageData(0, 0, targetW, targetH).data;
  const bits = new Uint8Array(targetW * targetH);
  for (let i = 0; i < bits.length; i++) {
    bits[i] = data[i * 4] < 128 ? 1 : 0;
  }
  return { w: targetW, h: targetH, bits };
}

/**
 * 比對兩個正規化字元，回傳差異率 (0=完全一致, 1=完全不同)
 */
function charDifference(a, b) {
  // 先 resize 到相同尺寸（取較大的寬度）
  const maxW = Math.max(a.w, b.w);
  const resizeToWidth = (char, targetW) => {
    if (char.w === targetW) return char.bits;
    const result = new Uint8Array(targetW * char.h);
    for (let y = 0; y < char.h; y++) {
      for (let x = 0; x < targetW; x++) {
        const srcX = Math.round(x * (char.w - 1) / Math.max(1, targetW - 1));
        result[y * targetW + x] = char.bits[y * char.w + srcX];
      }
    }
    return result;
  };

  const aBits = resizeToWidth(a, maxW);
  const bBits = resizeToWidth(b, maxW);
  const total = maxW * TEMPLATE_TARGET_H;

  let diff = 0;
  for (let i = 0; i < total; i++) {
    if (aBits[i] !== bBits[i]) diff++;
  }
  return diff / total;
}

/**
 * 從 localStorage 載入模板庫
 */
function loadTemplates() {
  try {
    const raw = localStorage.getItem(TEMPLATE_STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.version !== 1 || !data.chars) return null;
    // 還原 bits 為 Uint8Array
    for (const [, tmpl] of Object.entries(data.chars)) {
      tmpl.bits = new Uint8Array(tmpl.bits);
    }
    return data;
  } catch {
    return null;
  }
}

/**
 * 儲存模板庫到 localStorage
 */
function saveTemplates(templates) {
  // 將 Uint8Array 轉為普通陣列以便 JSON 序列化
  const serializable = { version: 1, chars: {} };
  for (const [char, tmpl] of Object.entries(templates.chars)) {
    serializable.chars[char] = { w: tmpl.w, h: tmpl.h, bits: Array.from(tmpl.bits) };
  }
  try {
    localStorage.setItem(TEMPLATE_STORAGE_KEY, JSON.stringify(serializable));
    console.log(`[template-match] 已儲存 ${Object.keys(serializable.chars).length} 個字元模板`);
  } catch (e) {
    console.warn('[template-match] 儲存模板失敗:', e.message);
  }
}

/**
 * 模板比對辨識時間文字
 * @param {HTMLCanvasElement} canvas — 去噪後的二值化時間圖
 * @returns {string|null} 辨識出的時間文字，或 null（無模板/比對失敗）
 */
function templateMatchTime(canvas) {
  const templates = loadTemplates();
  if (!templates || Object.keys(templates.chars).length < 10) return null;

  const tmStart = Date.now();
  const chars = segmentCharacters(canvas);
  if (chars.length < 3) return null; // 至少要有「X分Y」

  const result = [];
  for (const seg of chars) {
    const norm = normalizeChar(seg.canvas, TEMPLATE_TARGET_H);
    let bestChar = '?';
    let bestDiff = Infinity;
    for (const [char, tmpl] of Object.entries(templates.chars)) {
      const diff = charDifference(norm, tmpl);
      if (diff < bestDiff) {
        bestDiff = diff;
        bestChar = char;
      }
    }
    if (bestDiff > TEMPLATE_MAX_DIFF) {
      console.log(`[template-match] 字元匹配失敗 (diff=${bestDiff.toFixed(3)}), fallback`);
      return null;
    }
    result.push(bestChar);
  }

  const text = result.join('');
  const elapsed = Date.now() - tmStart;
  console.log(`[template-match] 辨識結果: "${text}" (${elapsed}ms)`);

  // 驗證：必須能 parse 出有效時間
  const parsed = tryParseTime(text);
  if (!parsed) {
    console.log('[template-match] 文字無法解析為時間，放棄');
    return null;
  }

  return text;
}

/**
 * Bootstrap：從 Tesseract 成功辨識結果中提取模板
 * @param {HTMLCanvasElement} canvas — 二值化圖
 * @param {string} ocrText — Tesseract 辨識出的原始文字
 */
function bootstrapTemplates(canvas, ocrText) {
  const cleanText = ocrText.replace(/\s+/g, '');
  const chars = segmentCharacters(canvas);

  // 比對 OCR 文字和分割出的字元數量
  // 只保留我們需要的字元集
  const validChars = new Set('0123456789剩下小時分秒');
  const textChars = [...cleanText].filter(c => validChars.has(c));

  if (textChars.length !== chars.length) {
    console.log(`[template-match] bootstrap 跳過: 文字 ${textChars.length} 字 vs 分割 ${chars.length} 段`);
    // 嘗試更寬鬆的對應：去掉非有效字元後重新比對
    const allTextChars = [...cleanText];
    if (allTextChars.length === chars.length) {
      // 總字元數匹配，但包含非字元集的字
      for (let i = 0; i < allTextChars.length; i++) {
        if (validChars.has(allTextChars[i])) {
          textChars.push(allTextChars[i]);
        }
      }
    }
    if (textChars.length !== chars.length) return;
  }

  // 載入現有模板（累積式更新）
  const existing = loadTemplates() || { version: 1, chars: {} };

  let added = 0;
  for (let i = 0; i < textChars.length; i++) {
    const char = textChars[i];
    const norm = normalizeChar(chars[i].canvas, TEMPLATE_TARGET_H);

    // 若該字元已有模板，只在差異明顯時更新
    if (existing.chars[char]) {
      const diff = charDifference(norm, existing.chars[char]);
      if (diff < 0.1) continue; // 差異小，保留舊模板
    }

    existing.chars[char] = norm;
    added++;
  }

  if (added > 0) {
    saveTemplates(existing);
    console.log(`[template-match] bootstrap: 新增/更新 ${added} 個模板 (共 ${Object.keys(existing.chars).length} 個)`);
  }
}
