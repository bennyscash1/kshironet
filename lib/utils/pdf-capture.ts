/**
 * Viewport width (CSS px) every PDF capture is rendered at.
 *
 * html2canvas-pro renders into an off-screen iframe whose width comes from
 * `windowWidth ?? window.innerWidth`. Left at the default, the exported PDF depended on
 * the device it was exported from: a phone captured its own ~390px mobile layout, which
 * was then scaled up to the A4 content width (194mm). That produced oversized text, one
 * card per page, a near-empty first page, and — worst — a truncated gantt, because the
 * gantt lives in an `overflow-x-auto` container and needs `220 + days × 40` px, so
 * everything past the phone's screen edge was silently cut off.
 *
 * Pinning the width makes the PDF identical no matter which device exported it. 1280 is a
 * standard desktop width, wide enough for Tailwind's `md:`/`lg:` layouts to apply.
 */
export const PDF_CAPTURE_WIDTH = 1280;

/** Options shared by every html2canvas-pro capture used for PDF export. */
export function pdfCaptureOptions(
  onclone?: (clonedDoc: Document, element: HTMLElement) => void
) {
  return {
    scale: 2,
    useCORS: true,
    backgroundColor: "#ffffff",
    windowWidth: PDF_CAPTURE_WIDTH,
    ...(onclone ? { onclone } : {}),
  };
}
