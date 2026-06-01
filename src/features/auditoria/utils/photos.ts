/* ── Single-pass photo processor: compress + quality-check + preview in one image load ──
   Loads the original file only once into memory, derives quality warning from original
   dimensions (before scaling), compresses to JPEG 1280px/80%, and returns a preview URL
   from the compressed blob. This avoids the 3x memory spike that crashes low-RAM devices. ── */

export interface ProcessedPhoto {
  compressed: File;
  previewUrl: string;
  warning: string;
}

export async function processPhoto(file: File, maxDim = 1280, quality = 0.80): Promise<ProcessedPhoto> {
  // createImageBitmap respects EXIF orientation (iOS Safari 15+, Chrome 83+, Firefox 90+).
  // Fallback to <img> decode for older browsers that don't support it.
  let bitmapSource: ImageBitmap | null = null;
  let nativeW = 0, nativeH = 0;
  try {
    bitmapSource = await createImageBitmap(file);
    nativeW = bitmapSource.width; nativeH = bitmapSource.height;
  } catch {
    // Fallback: decode via <img> (no EXIF correction on very old Safari)
    await new Promise<void>(res => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => { nativeW = img.naturalWidth; nativeH = img.naturalHeight; URL.revokeObjectURL(url); res(); };
      img.onerror = () => { URL.revokeObjectURL(url); res(); };
      img.src = url;
    });
    if (!nativeW) return { compressed: file, previewUrl: URL.createObjectURL(file), warning: '' };
  }

  const minDim = Math.min(nativeW, nativeH);
  const warning =
    minDim < 400 ? 'Foto muy pequeña — puede ser ilegible' :
    minDim < 700 ? 'Resolución baja — intenta acercarte' : '';

  const scale = Math.min(1, maxDim / Math.max(nativeW, nativeH));
  const w = Math.round(nativeW * scale);
  const h = Math.round(nativeH * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  if (bitmapSource) {
    ctx.drawImage(bitmapSource, 0, 0, w, h);
    bitmapSource.close(); // free GPU memory
  } else {
    // Fallback img path — draw via <img> element
    await new Promise<void>(res => {
      const img2 = new Image();
      const url2 = URL.createObjectURL(file);
      img2.onload = () => { ctx.drawImage(img2, 0, 0, w, h); URL.revokeObjectURL(url2); res(); };
      img2.onerror = () => { URL.revokeObjectURL(url2); res(); };
      img2.src = url2;
    });
  }

  return new Promise(resolve => {
    canvas.toBlob(blob => {
      if (!blob) { resolve({ compressed: file, previewUrl: URL.createObjectURL(file), warning }); return; }
      const compressed = new File([blob], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' });
      resolve({ compressed, previewUrl: URL.createObjectURL(blob), warning });
    }, 'image/jpeg', quality);
  });
}
