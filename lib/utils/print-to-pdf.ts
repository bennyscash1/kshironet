import { pdfCaptureOptions } from "@/lib/utils/pdf-capture";

/**
 * Capture an off-screen printable container and paginate it into a PDF, entirely
 * client-side.
 *
 * The container is captured with html2canvas-pro (which, unlike plain html2canvas,
 * understands Tailwind v4 oklch colors), so Hebrew, RTL, card background colors and
 * badges come through exactly as rendered by the browser — no jsPDF font embedding.
 *
 * Pagination is block-based: every element marked `[data-pdf-atomic]` is placed as an
 * indivisible unit, so a card is never split across a page break. `data-pdf-group-start`
 * additionally reserves room for the following block, keeping a section/day header from
 * being orphaned at the bottom of a page.
 */
export async function exportPrintContainerToPdf(rootId: string, filename: string): Promise<void> {
  const element = document.getElementById(rootId);
  if (!element) return;

  const html2canvas = (await import("html2canvas-pro")).default;
  const { jsPDF } = await import("jspdf");

  const blocks = Array.from(element.querySelectorAll<HTMLElement>("[data-pdf-atomic]"));
  if (blocks.length === 0) return;

  const pdf = new jsPDF("p", "mm", "a4");
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 10;
  const footerSpace = 8; // bottom strip reserved for page numbers
  const usableWidth = pageWidth - margin * 2;
  const contentBottom = pageHeight - margin - footerSpace;

  function estimateHeightMm(el: HTMLElement) {
    const rect = el.getBoundingClientRect();
    return (rect.height / rect.width) * usableWidth;
  }

  const blockGap = 4;
  let cursorY = margin;
  let isFirstOnPage = true;

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const canvas = await html2canvas(block, pdfCaptureOptions());
    const imgData = canvas.toDataURL("image/jpeg", 0.9);
    const imgHeight = (canvas.height * usableWidth) / canvas.width;

    const gapBefore = isFirstOnPage ? 0 : blockGap;
    let requiredHeight = gapBefore + imgHeight;
    // Keep a group-start header with the block that follows it.
    if (block.dataset.pdfGroupStart === "true" && blocks[i + 1]) {
      requiredHeight += blockGap + estimateHeightMm(blocks[i + 1]);
    }

    if (!isFirstOnPage && cursorY + requiredHeight > contentBottom) {
      pdf.addPage();
      cursorY = margin;
      isFirstOnPage = true;
    } else if (!isFirstOnPage) {
      cursorY += blockGap;
    }

    pdf.addImage(imgData, "JPEG", margin, cursorY, usableWidth, imgHeight);
    cursorY += imgHeight;
    isFirstOnPage = false;
  }

  // Footer page numbers (Latin numerals render with the default font; no Hebrew needed).
  const pageCount = pdf.getNumberOfPages();
  if (pageCount > 1) {
    pdf.setFontSize(9);
    pdf.setTextColor(120);
    for (let i = 1; i <= pageCount; i++) {
      pdf.setPage(i);
      pdf.text(`${i} / ${pageCount}`, pageWidth / 2, pageHeight - margin / 2, { align: "center" });
    }
  }

  pdf.save(filename);
}
