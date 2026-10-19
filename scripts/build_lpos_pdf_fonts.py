from pathlib import Path

from fontTools.merge import Merger
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "node_modules" / "@fontsource" / "noto-sans-tc" / "files"
TARGET = ROOT / "apps" / "lpos" / "src" / "pdf" / "fonts"
SUBSETS = ("chinese-traditional", "104", "112", "113", "115", "118", "119")
REQUIRED_TEXT = (
    "研究行情是調整價格代理，非已驗證含息真實可執行融資回測。",
    "LPOS Portfolio Lab 研究摘要 配置與融資 方法與證據 報酬研究",
    "公平比較 生存分析 一致性檢查 來源與限制附錄（）、，－／；＝｜",
)


def main() -> None:
    if not SOURCE.is_dir():
        raise SystemExit("Run npm ci first; the pinned Noto Sans TC font package is missing.")
    TARGET.mkdir(parents=True, exist_ok=True)
    required = {ord(char) for char in "".join(REQUIRED_TEXT)}
    for weight in (400, 700):
        paths = [SOURCE / f"noto-sans-tc-{subset}-{weight}-normal.woff" for subset in SUBSETS]
        missing = [str(path) for path in paths if not path.is_file()]
        if missing:
            raise SystemExit("Missing licensed font subsets: " + ", ".join(missing))
        font = Merger().merge([str(path) for path in paths])
        font.flavor = None
        font.recalcTimestamp = False
        font["head"].created = 2_082_844_800
        font["head"].modified = 2_082_844_800
        glyphs = set().union(*(set(table.cmap) for table in font["cmap"].tables))
        absent = sorted(required - glyphs)
        if absent:
            raise SystemExit(f"Weight {weight} is missing required Unicode points: {absent}")
        output = TARGET / f"NotoSansTC-{weight}.ttf"
        font.save(output)
        check = TTFont(output, lazy=True)
        saved_glyphs = set().union(*(set(table.cmap) for table in check["cmap"].tables))
        if required - saved_glyphs:
            raise SystemExit(f"Generated font {output.name} lost a required Unicode point.")
        print(f"Built {output.relative_to(ROOT)} ({output.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()
