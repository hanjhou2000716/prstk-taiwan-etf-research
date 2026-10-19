import React from "react";
import { Font, pdf } from "@react-pdf/renderer";
import regularFont from "./pdf/fonts/NotoSansTC-400.ttf?url";
import boldFont from "./pdf/fonts/NotoSansTC-700.ttf?url";
import { ReportDocument } from "./pdf/ReportDocument.js";
import type { ResearchReportV1 } from "./types.js";

Font.register({ family: "LPOS Noto TC", fonts: [
  { src: regularFont, fontWeight: 400 },
  { src: boldFont, fontWeight: 700 }
] });
self.addEventListener("message", async (event: MessageEvent) => {
  if (event.data?.type !== "render") return;
  try {
    const report = event.data.report as ResearchReportV1;
    const blob = await pdf(React.createElement(ReportDocument, { report }) as any).toBlob();
    self.postMessage({ type: "complete", blob, fileName: "LPOS-研究報告-" + report.runId + ".pdf" });
  } catch (error) {
    self.postMessage({ type: "error", message: String((error as Error).message || error) });
  }
});
