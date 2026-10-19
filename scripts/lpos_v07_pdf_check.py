from pathlib import Path
import json
import re
import sys

import pymupdf
from pypdf import PdfReader

pdf_path = Path(sys.argv[1] if len(sys.argv) > 1 else "artifacts/lpos-v07/representative-report.pdf")
render_dir = Path("artifacts/lpos-v07/pdf-pages")
render_dir.mkdir(parents=True, exist_ok=True)
reader = PdfReader(str(pdf_path))
document = pymupdf.open(pdf_path)
assert pdf_path.read_bytes().startswith(b"%PDF-"), "download is not a PDF file"
assert len(reader.pages) >= 2, f"expected a multipage research report, got {len(reader.pages)} page(s)"
text = "\n".join(page.extract_text() or "" for page in reader.pages)
normalized = re.sub(r"\s+", "", text)
for expected in (
    "LPOS Portfolio Lab", "研究摘要", "配置與融資", "方法與證據", "報酬研究",
    "同標的無借款基準", "公平比較", "生存分析", "一致性檢查", "來源與限制附錄",
    "研究行情是調整價格代理，非已驗證含息真實可執行融資回測。",
    "formal_conclusions_blocked",
):
    assert re.sub(r"\s+", "", expected) in normalized, f"PDF selectable text is missing: {expected}"
assert len(text) > 1500, f"unexpectedly little selectable text: {len(text)} characters"
assert "006208" in text and "SHA-256" in text
bundle_path = pdf_path.with_name("replay-bundle.json")
if bundle_path.exists():
    bundle = json.loads(bundle_path.read_text(encoding="utf-8"))
    run, report = bundle["run"], bundle["report"]
    assert run["runId"] == report["runId"]
    for expected in (
        run["runId"], run["parameterFingerprint"], run["dataFingerprint"],
        run["actualPeriod"]["start"], run["actualPeriod"]["end"], report["caveat"],
    ):
        assert re.sub(r"\s+", "", expected) in normalized, "PDF and JSON report fingerprints or period differ"
    cagr = run["backtest"]["stats"]["cagrPct"]
    assert f"{cagr:.2f}%" in text, "PDF return metric does not match the replay bundle"
    benchmark_cagr = run["benchmark"]["backtest"]["stats"]["cagrPct"]
    assert f"{benchmark_cagr:.2f}%" in text, "PDF no-borrow benchmark does not match the replay bundle"
for index, page in enumerate(document):
    pix = page.get_pixmap(matrix=pymupdf.Matrix(1.35, 1.35), alpha=False)
    image_path = render_dir / f"page-{index + 1:02}.png"
    pix.save(image_path)
    assert pix.width >= 500 and pix.height >= 700
    assert len(page.get_text().strip()) > 25, f"page {index + 1} is blank"
print(f"PASS PDF: {len(document)} selectable-text pages; rendered {render_dir}")
