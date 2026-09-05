/**
 * PAMSDIGI - Client-Side Image Compressor Utility
 * Optimizes images (Foto Meter, Logo KPSPAMS, Stempel) using HTML5 Canvas.
 * Target size: <= 200 KB, Max dimensions: 1600px width/height.
 */

export interface CompressImageOptions {
  maxWidth?: number; // Default 1600px
  maxHeight?: number; // Default 1600px
  maxSizeKB?: number; // Default 200KB
  mimeType?: 'image/jpeg' | 'image/png' | 'auto'; // Default 'auto'
  minQuality?: number; // Default 0.50
}

export interface CompressResult {
  dataUrl: string;
  originalSizeKB: number;
  compressedSizeKB: number;
  width: number;
  height: number;
  format: string;
  isCompressed: boolean;
  message: string;
}

/**
 * Calculates byte size of a base64 Data URL or string
 */
export function getBase64SizeKB(dataUrl: string): number {
  if (!dataUrl) return 0;
  const base64Index = dataUrl.indexOf(';base64,');
  const base64Str = base64Index !== -1 ? dataUrl.substring(base64Index + 8) : dataUrl;
  const padding = (base64Str.match(/=/g) || []).length;
  const bytes = (base64Str.length * 0.75) - padding;
  return Math.round(bytes / 1024);
}

/**
 * Converts a File or Blob to base64 Data URL string
 */
export function fileToDataUrl(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
}

/**
 * Loads a Data URL string into an HTMLImageElement
 */
function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (err) => reject(new Error('Gagal memuat file gambar untuk dikompresi.'));
    img.src = dataUrl;
  });
}

/**
 * Main adaptive client-side image compressor using HTML5 Canvas
 */
export async function compressImage(
  input: File | Blob | string,
  options: CompressImageOptions = {}
): Promise<CompressResult> {
  const maxWidth = options.maxWidth || 1600;
  const maxHeight = options.maxHeight || 1600;
  const maxSizeKB = options.maxSizeKB || 200;
  const minQuality = options.minQuality || 0.50;

  // Convert input to dataUrl string
  let initialDataUrl = '';
  let originalSizeKB = 0;

  if (typeof input === 'string') {
    initialDataUrl = input;
    originalSizeKB = getBase64SizeKB(initialDataUrl);
  } else {
    originalSizeKB = Math.round(input.size / 1024);
    initialDataUrl = await fileToDataUrl(input);
  }

  // Load image to get dimensions
  const img = await loadImage(initialDataUrl);
  const origW = img.naturalWidth || img.width;
  const origH = img.naturalHeight || img.height;

  // Determine output format
  let outputFormat = options.mimeType || 'auto';
  if (outputFormat === 'auto') {
    if (initialDataUrl.startsWith('data:image/png')) {
      outputFormat = 'image/png';
    } else {
      outputFormat = 'image/jpeg';
    }
  }

  // Check if original is already below target size AND within max dimensions
  const exceedsDimension = origW > maxWidth || origH > maxHeight;
  const exceedsSize = originalSizeKB > maxSizeKB;

  if (!exceedsDimension && !exceedsSize) {
    return {
      dataUrl: initialDataUrl,
      originalSizeKB,
      compressedSizeKB: originalSizeKB,
      width: origW,
      height: origH,
      format: outputFormat,
      isCompressed: false,
      message: `Ukuran gambar sudah optimal (${originalSizeKB} KB, ${origW}x${origH}px).`
    };
  }

  // Calculate target dimensions maintaining aspect ratio
  let targetW = origW;
  let targetH = origH;
  if (exceedsDimension) {
    const scale = Math.min(maxWidth / origW, maxHeight / origH);
    targetW = Math.round(origW * scale);
    targetH = Math.round(origH * scale);
  }

  // PNG Compression for Logo/Stempel with potential transparency
  if (outputFormat === 'image/png') {
    let currW = targetW;
    let currH = targetH;
    let finalPngUrl = '';
    let currentPngSizeKB = 0;

    // Loop dimension reduction for PNG if still > maxSizeKB
    while (currW >= 200 && currH >= 200) {
      const canvas = document.createElement('canvas');
      canvas.width = currW;
      canvas.height = currH;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, currW, currH);
        ctx.drawImage(img, 0, 0, currW, currH);
        finalPngUrl = canvas.toDataURL('image/png');
        currentPngSizeKB = getBase64SizeKB(finalPngUrl);

        if (currentPngSizeKB <= maxSizeKB) break;
      }
      // Scale down PNG dimensions by 15% to hit target KB limit
      currW = Math.round(currW * 0.85);
      currH = Math.round(currH * 0.85);
    }

    // If PNG is still slightly above target and original input was PNG, keep best PNG result
    return {
      dataUrl: finalPngUrl || initialDataUrl,
      originalSizeKB,
      compressedSizeKB: currentPngSizeKB || originalSizeKB,
      width: currW,
      height: currH,
      format: 'image/png',
      isCompressed: true,
      message: `Gambar PNG dikompresi: ${originalSizeKB} KB → ${currentPngSizeKB} KB (${currW}x${currH}px).`
    };
  }

  // Adaptive JPEG Compression for Photos / Meter Readings
  let currW = targetW;
  let currH = targetH;
  let bestDataUrl = '';
  let bestSizeKB = 0;
  let quality = 0.90;

  let canvas = document.createElement('canvas');
  canvas.width = currW;
  canvas.height = currH;
  let ctx = canvas.getContext('2d');

  if (ctx) {
    // Fill white background for JPEGs
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, currW, currH);
    ctx.drawImage(img, 0, 0, currW, currH);
  }

  // Adaptive quality reduction loop
  while (quality >= minQuality) {
    bestDataUrl = canvas.toDataURL('image/jpeg', quality);
    bestSizeKB = getBase64SizeKB(bestDataUrl);

    if (bestSizeKB <= maxSizeKB) {
      break;
    }
    quality -= 0.08;
  }

  // If still exceeds size after quality reduction, scale down canvas dimensions adaptive loop
  while (bestSizeKB > maxSizeKB && currW >= 300 && currH >= 300) {
    currW = Math.round(currW * 0.85);
    currH = Math.round(currH * 0.85);

    canvas = document.createElement('canvas');
    canvas.width = currW;
    canvas.height = currH;
    ctx = canvas.getContext('2d');

    if (ctx) {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, currW, currH);
      ctx.drawImage(img, 0, 0, currW, currH);
    }

    // Try at 0.75 quality for smaller canvas
    bestDataUrl = canvas.toDataURL('image/jpeg', 0.75);
    bestSizeKB = getBase64SizeKB(bestDataUrl);
  }

  return {
    dataUrl: bestDataUrl,
    originalSizeKB,
    compressedSizeKB: bestSizeKB,
    width: currW,
    height: currH,
    format: 'image/jpeg',
    isCompressed: true,
    message: `Foto dikompresi: ${originalSizeKB} KB → ${bestSizeKB} KB (${currW}x${currH}px, JPEG q=${Math.round(quality * 100)}%).`
  };
}
