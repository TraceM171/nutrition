// Lazy-load UPNG.js — pure-JS PNG decoder, no canvas needed.
// Bypasses Firefox's privacy.resistFingerprinting which poisons canvas getImageData().
let _upngPromise = null;
export function loadUPNG() {
  if (window.UPNG) return Promise.resolve();
  if (!_upngPromise) {
    _upngPromise = new Promise((resolve, reject) => {
      const pakoScript = document.createElement('script');
      pakoScript.src = 'https://cdn.jsdelivr.net/npm/pako@2.1.0/dist/pako.min.js';
      pakoScript.onerror = () => reject(new Error('Failed to load image decoder from CDN'));
      pakoScript.onload = () => {
        const upngScript = document.createElement('script');
        upngScript.src = 'https://cdn.jsdelivr.net/npm/upng-js@2.1.0/UPNG.js';
        upngScript.onload = resolve;
        upngScript.onerror = () => reject(new Error('Failed to load image decoder from CDN'));
        document.head.appendChild(upngScript);
      };
      document.head.appendChild(pakoScript);
    });
  }
  return _upngPromise;
}

// Lazy-load @undecaf/zbar-wasm — WebAssembly port of ZBar C library.
// Much more reliable than ZXing-js. Accepts ImageData directly (no canvas needed).
let _zbarPromise = null;
export function loadZBar() {
  if (window.zbarWasm?.scanImageData) return Promise.resolve();
  if (!_zbarPromise) {
    _zbarPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/@undecaf/zbar-wasm@0.9.15/dist/index.js';
      s.onload = () => {
        console.log('[barcode] zbar-wasm script loaded, checking global...');
        // The UMD build may need a tick to finish initialising the WASM module
        const poll = (tries) => {
          if (window.zbarWasm?.scanImageData) { resolve(); return; }
          if (tries <= 0) { reject(new Error('zbar-wasm did not initialise')); return; }
          setTimeout(() => poll(tries - 1), 100);
        };
        poll(20); // wait up to 2 s
      };
      s.onerror = () => reject(new Error('Failed to load barcode library from CDN'));
      document.head.appendChild(s);
    });
  }
  return _zbarPromise;
}

export async function decodeBarcodeFromBlob(blob, { onStatus = () => {}, onCode = () => {} } = {}) {
  console.log('[barcode] decodeBarcodeFromBlob called, blob:', blob?.type, blob?.size, 'bytes');
  onStatus('Decoding image…', 'dim');
  try {
    let code;

    if (window.BarcodeDetector) {
      console.log('[barcode] using native BarcodeDetector');
      const detector = new BarcodeDetector({
        formats: ['ean_13','ean_8','upc_a','upc_e','code_128','code_39','itf','data_matrix','qr_code']
      });
      const bitmap = await createImageBitmap(blob);
      console.log('[barcode] bitmap size:', bitmap.width, 'x', bitmap.height);
      const results = await detector.detect(bitmap);
      bitmap.close();
      console.log('[barcode] BarcodeDetector results:', results);
      if (!results.length) { onStatus('No barcode found in image — try a clearer photo', 'err'); onCode(null); return; }
      code = results[0].rawValue;

    } else {
      // zbar-wasm: reliable WASM barcode decoder, no canvas needed.
      // Accepts ImageData directly — we construct it from UPNG RGBA bytes,
      // completely bypassing Firefox's canvas fingerprinting protection.
      onStatus('Loading barcode library…', 'dim');
      await Promise.all([loadUPNG(), loadZBar()]);
      onStatus('Decoding image…', 'dim');

      let rgba, width, height;
      if (blob.type === 'image/png') {
        const buf = await blob.arrayBuffer();
        const decoded = UPNG.decode(buf);
        width = decoded.width;
        height = decoded.height;
        rgba = new Uint8ClampedArray(UPNG.toRGBA8(decoded)[0]);
        console.log('[barcode] UPNG decoded PNG:', width, 'x', height);
      } else {
        // JPEG / WebP: use OffscreenCanvas (canvas fingerprinting less likely for non-PNG)
        const imgBitmap = await createImageBitmap(blob);
        width = imgBitmap.width;
        height = imgBitmap.height;
        const oc = typeof OffscreenCanvas !== 'undefined'
          ? new OffscreenCanvas(width, height)
          : Object.assign(document.createElement('canvas'), { width, height });
        const ctx = oc.getContext('2d');
        ctx.drawImage(imgBitmap, 0, 0);
        imgBitmap.close();
        rgba = ctx.getImageData(0, 0, width, height).data;
        console.log('[barcode] canvas decoded:', width, 'x', height);
      }

      // new ImageData() is a plain data constructor — does NOT require a canvas element
      const imageData = new ImageData(rgba, width, height);
      console.log('[barcode] calling zbarWasm.scanImageData...');
      const symbols = await zbarWasm.scanImageData(imageData);
      console.log('[barcode] zbar symbols:', symbols.length, symbols.map(s => s.typeName + ':' + s.decode()));

      if (!symbols.length) {
        onStatus('No barcode found in image — try a clearer photo', 'err');
        onCode(null);
        return;
      }
      code = symbols[0].decode();
    }

    console.log('[barcode] decoded code:', code);
    onCode(code);

  } catch(e) {
    const msg = e?.message || '';
    console.error('[barcode] outer catch:', msg, e);
    onCode(null);
  }
}
