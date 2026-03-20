/**
 * paddle-ocr.js — PaddleOCR (PP-OCRv4) 瀏覽器端整合
 *
 * 透過 @gutenye/ocr-browser + ONNX Runtime Web 在瀏覽器端執行 PaddleOCR。
 * 模型從 jsDelivr CDN 載入（約 16MB），首次載入後瀏覽器快取。
 * 如果載入失敗（離線、瀏覽器不支援等），回傳 null 讓呼叫端 fallback 到 Tesseract。
 */

const PADDLE_MODEL_BASE = 'https://cdn.jsdelivr.net/npm/@gutenye/ocr-models@1.4.2/assets';

let _paddleOcr = null;
let _paddleLoading = null;
let _paddleFailed = false; // 失敗後不再重試

/**
 * 初始化 PaddleOCR（懶載入，只在第一次呼叫時下載模型）
 * @returns {Promise<object|null>} OCR 實例，或 null（載入失敗）
 */
async function initPaddleOCR(onProgress) {
  if (_paddleOcr) return _paddleOcr;
  if (_paddleFailed) return null;
  if (_paddleLoading) return _paddleLoading;

  _paddleLoading = (async () => {
    try {
      if (onProgress) onProgress('載入 PaddleOCR 引擎...（首次約 16MB）');
      console.log('[paddle-ocr] 開始載入 @gutenye/ocr-browser...');

      const module = await import('https://esm.sh/@gutenye/ocr-browser@1.4.8');
      const Ocr = module.default || module.Ocr;

      if (!Ocr || !Ocr.create) {
        throw new Error('無法取得 Ocr.create，模組結構可能有變');
      }

      if (onProgress) onProgress('下載 PaddleOCR 模型...');
      _paddleOcr = await Ocr.create({
        models: {
          detectionPath: `${PADDLE_MODEL_BASE}/ch_PP-OCRv4_det_infer.onnx`,
          recognitionPath: `${PADDLE_MODEL_BASE}/ch_PP-OCRv4_rec_infer.onnx`,
          dictionaryPath: `${PADDLE_MODEL_BASE}/ppocr_keys_v1.txt`,
        },
      });

      console.log('[paddle-ocr] PaddleOCR 初始化成功');
      return _paddleOcr;
    } catch (e) {
      console.warn('[paddle-ocr] PaddleOCR 載入失敗，將使用 Tesseract fallback:', e.message);
      _paddleFailed = true;
      _paddleLoading = null;
      return null;
    }
  })();

  return _paddleLoading;
}

/**
 * 使用 PaddleOCR 辨識 canvas 上的文字
 * @param {HTMLCanvasElement} canvas — 已前處理的圖片
 * @returns {Promise<string|null>} 辨識文字，或 null（PaddleOCR 不可用）
 */
async function paddleOcrText(canvas, onProgress) {
  try {
    const ocr = await initPaddleOCR(onProgress);
    if (!ocr) return null;

    // 將 canvas 轉為 data URL 給 PaddleOCR
    const dataUrl = canvas.toDataURL('image/png');
    const result = await ocr.detect(dataUrl);

    if (!result || !result.texts || result.texts.length === 0) {
      console.log('[paddle-ocr] 未偵測到文字');
      return '';
    }

    const text = result.texts.map(t => t.text).join('');
    const scores = result.texts.map(t => t.score?.toFixed(2)).join(', ');
    console.log(`[paddle-ocr] 辨識結果: "${text}" (信心度: ${scores})`);
    return text;
  } catch (e) {
    console.warn('[paddle-ocr] 辨識失敗:', e.message);
    return null;
  }
}
