import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import DocumentSheet from "../components/DocumentSheet";
import { paginateDocumentRows, type BusinessDocument } from "./documentModel";

const pageWidth = 794;
const pageHeight = 1123;

export async function exportDocumentPdf(sheet: BusinessDocument): Promise<void> {
  const [{ jsPDF }, { default: html2canvas }] = await Promise.all([import("jspdf"), import("html2canvas")]);
  await document.fonts.ready;

  const stage = document.createElement("div");
  stage.className = "document-export-stage";
  stage.setAttribute("aria-hidden", "true");
  document.body.append(stage);
  const root = createRoot(stage);
  const render = (lines: BusinessDocument["lines"], final = true, page?: string) => {
    flushSync(() => root.render(
      <div className="document-raster-page">
        <DocumentSheet document={sheet} lines={lines} final={final} page={page} />
      </div>,
    ));
    const element = stage.firstElementChild;
    if (!(element instanceof HTMLElement)) throw new Error("无法渲染单据");
    return element;
  };

  try {
    const measurement = render(sheet.lines);
    const tbody = measurement.querySelector("tbody");
    const tail = measurement.querySelector(".document-end");
    const footer = measurement.querySelector(".document-footer");
    if (!tbody || !tail || !footer) throw new Error("无法测量单据版面");
    const top = tbody.getBoundingClientRect().top - measurement.getBoundingClientRect().top;
    const budget = pageHeight - top - footer.getBoundingClientRect().height - 58;
    const finalBudget = budget - tail.getBoundingClientRect().height - 22;
    const heights = Array.from(tbody.rows, (row) => Math.ceil(row.getBoundingClientRect().height));
    const pages = paginateDocumentRows(heights, budget, finalBudget);
    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
    pdf.setProperties({ title: sheet.title + " " + sheet.number, author: "Glyphora Demo" });
    for (const [index, group] of pages.entries()) {
      const page = render(group.map((row) => sheet.lines[row]), index === pages.length - 1, `${index + 1} / ${pages.length}`);
      const canvas = await html2canvas(page, {
        backgroundColor: "#ffffff", width: pageWidth, height: pageHeight, scale: 2,
        windowWidth: 1200, windowHeight: pageHeight, logging: false,
      });
      if (index) pdf.addPage();
      pdf.addImage(canvas.toDataURL("image/jpeg", 0.94), "JPEG", 0, 0,
        pdf.internal.pageSize.getWidth(), pdf.internal.pageSize.getHeight(), undefined, "FAST");
    }
    pdf.save(sheet.number.replace(/[^\w-]/g, "_") + ".pdf");
  } finally {
    root.unmount();
    stage.remove();
  }
}
