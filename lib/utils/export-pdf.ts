import { pdfCaptureOptions } from "@/lib/utils/pdf-capture";

function replaceInputsWithText(clonedDoc: Document) {
  const inputs = clonedDoc.querySelectorAll("input");
  inputs.forEach((input) => {
    const source = input as HTMLInputElement;
    const computed = window.getComputedStyle(source);
    const span = clonedDoc.createElement("span");
    span.textContent = source.value || "0";
    span.style.display = "inline-flex";
    span.style.alignItems = "center";
    span.style.justifyContent = "center";
    span.style.width = `${source.offsetWidth}px`;
    span.style.height = `${source.offsetHeight}px`;
    span.style.border = computed.border;
    span.style.borderRadius = computed.borderRadius;
    span.style.fontSize = computed.fontSize;
    span.style.fontFamily = computed.fontFamily;
    span.style.color = computed.color;
    span.style.backgroundColor = computed.backgroundColor;
    source.replaceWith(span);
  });
}

export async function exportElementToPdf(containerId: string, filename: string) {
  const element = document.getElementById(containerId);
  if (!element) return;
  const html2canvas = (await import("html2canvas-pro")).default;
  const { jsPDF } = await import("jspdf");

  const blocks = Array.from(element.querySelectorAll<HTMLElement>("[data-pdf-atomic]"));
  if (blocks.length === 0) return;

  const pdf = new jsPDF("p", "mm", "a4");
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 8;
  const usableWidth = pageWidth - margin * 2;

  function estimateHeightMm(el: HTMLElement) {
    const rect = el.getBoundingClientRect();
    return (rect.height / rect.width) * usableWidth;
  }

  const blockGap = 5;
  let cursorY = margin;
  let isFirstOnPage = true;

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const canvas = await html2canvas(block, pdfCaptureOptions(replaceInputsWithText));
    const imgData = canvas.toDataURL("image/jpeg", 0.85);
    const imgHeight = (canvas.height * usableWidth) / canvas.width;

    const gapBefore = isFirstOnPage ? 0 : blockGap;
    let requiredHeight = gapBefore + imgHeight;
    if (block.dataset.pdfGroupStart === "true" && blocks[i + 1]) {
      requiredHeight += blockGap + estimateHeightMm(blocks[i + 1]);
    }

    const forceNewPage = block.dataset.pdfForceNewPage === "true" && !isFirstOnPage;

    if (!isFirstOnPage && (forceNewPage || cursorY + requiredHeight > pageHeight - margin)) {
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

  pdf.save(filename);
}

export async function exportElementToSinglePagePdf(
  containerId: string,
  filename: string,
  opts?: { widthMm?: number }
) {
  const element = document.getElementById(containerId);
  if (!element) return;
  const html2canvas = (await import("html2canvas-pro")).default;
  const { jsPDF } = await import("jspdf");

  const canvas = await html2canvas(element, pdfCaptureOptions(replaceInputsWithText));

  const widthMm = opts?.widthMm ?? 400;
  const heightMm = (canvas.height * widthMm) / canvas.width;
  const pdf = new jsPDF({
    orientation: widthMm >= heightMm ? "l" : "p",
    unit: "mm",
    format: [widthMm, heightMm],
  });
  const imgData = canvas.toDataURL("image/jpeg", 0.85);
  pdf.addImage(imgData, "JPEG", 0, 0, widthMm, heightMm);
  pdf.save(filename);
}
