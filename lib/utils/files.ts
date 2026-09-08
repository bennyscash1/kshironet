/** Human-readable file size with Hebrew units. */
export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 בייט";
  if (bytes < 1024) return `${bytes} בייט`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} ק״ב`;
  const mb = kb / 1024;
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} מ״ב`;
}

export function isImageMime(mimeType: string): boolean {
  return mimeType.startsWith("image/");
}
