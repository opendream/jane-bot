/**
 * Model weights live in Cache Storage under one named cache. Only model files from our own origin
 * (/models/...) are ever stored there; never chat text.
 */
export const WEIGHTS_CACHE = "model-weights-v1";

export function modelUrl(path: string): string {
  return new URL(`models/${path}`, document.baseURI).href;
}

/** Returns the cached file, downloading it once from the local server if needed. */
export async function cachedBlob(path: string, onProgress?: (loaded: number, total: number) => void): Promise<Blob> {
  const url = modelUrl(path);
  const cache = await caches.open(WEIGHTS_CACHE);
  const hit = await cache.match(url);
  if (hit) return hit.blob();
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`model file missing: ${path} (${res.status})`);
  const total = Number(res.headers.get("content-length") || 0);
  const [toCache, toCount] = res.body.tee();
  const put = cache.put(url, new Response(toCache, { headers: { "content-type": "application/octet-stream", "content-length": String(total) } }));
  const reader = toCount.getReader();
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    loaded += value.byteLength;
    onProgress?.(loaded, total);
  }
  await put;
  const stored = await cache.match(url);
  if (!stored) throw new Error("cache write failed");
  return stored.blob();
}
