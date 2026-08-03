"""TWSE downloader, parser, hashing and validation. Standard library only."""
from __future__ import annotations
import calendar, csv, hashlib, json, time
from datetime import date, datetime
from pathlib import Path
from urllib.parse import urlencode
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

URL = "https://www.twse.com.tw/rwd/zh/afterTrading/STOCK_DAY"
CBOE_VIX_URL = "https://cdn.cboe.com/api/global/us_indices/daily_prices/VIX_History.csv"
HEADERS = {"User-Agent": "PRStK-Research/0.1 (+research; contact unavailable)"}

def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""): h.update(chunk)
    return h.hexdigest()

def download_month(symbol: str, year: int, month: int, raw_dir: Path, pause: float = .25) -> Path:
    raw_dir.mkdir(parents=True, exist_ok=True)
    path = raw_dir / f"{symbol}_{year:04d}-{month:02d}.json"
    if path.exists(): return path
    params = urlencode({"date": f"{year:04d}{month:02d}01", "stockNo": symbol, "response": "json"})
    req = Request(f"{URL}?{params}", headers=HEADERS)
    payload = None
    last_error = None
    # TWSE's CDN can briefly return 307/429 during long historical pulls.
    # Retry the same official URL instead of silently substituting another source.
    for attempt in range(5):
        try:
            with urlopen(req, timeout=30) as response:
                payload = response.read()
            break
        except (HTTPError, URLError) as exc:
            last_error = exc
            code = getattr(exc, "code", None)
            if code not in {307, 429, 500, 502, 503, 504} and not isinstance(exc, URLError):
                raise
            if attempt == 4:
                raise RuntimeError(f"TWSE download failed after retries: {req.full_url}; last_error={exc}") from exc
            time.sleep(2 ** attempt)
    if payload is None:
        raise RuntimeError(f"TWSE download returned no payload: {req.full_url}; last_error={last_error}")
    path.write_bytes(payload)
    time.sleep(pause)
    return path

def parse_twse_json(path: Path) -> list[dict]:
    obj = json.loads(path.read_text(encoding="utf-8-sig"))
    rows = []
    for row in obj.get("data", []):
        if len(row) < 7: continue
        roc = row[0].replace("/", "-")
        y, m, d = [int(x) for x in roc.split("-")]
        close = row[6].replace(",", "").strip()
        if close in {"", "-", "--"}: continue
        try: close_f = float(close)
        except ValueError: continue
        rows.append({"date": date(y + 1911, m, d).isoformat(), "close": close_f,
                     "volume": row[1].replace(",", ""), "source_file": path.name})
    return rows

def apply_split_adjustments(rows: list[dict], actions: list[dict]) -> list[dict]:
    """Create a continuous historical price series without changing raw data."""
    split_actions = sorted((a for a in actions if a.get("action_type") == "split"), key=lambda a: a["effective_date"])
    for row in rows:
        factor = 1.0
        for action in split_actions:
            if row["date"] < action["effective_date"]:
                factor *= float(action["ratio"])
        row["adjustment_factor"] = factor
        row["adjusted_close"] = row["close"] / factor
        try:
            row["adjusted_volume"] = float(row["volume"].replace(",", "")) * factor
        except (ValueError, AttributeError):
            row["adjusted_volume"] = row["volume"]
    return rows

def normalize(symbol: str, files: list[Path], out_path: Path, actions: list[dict] | None = None) -> int:
    rows = [dict(r, symbol=symbol) for p in files for r in parse_twse_json(p)]
    rows.sort(key=lambda r: r["date"])
    dedup = {r["date"]: r for r in rows}
    apply_split_adjustments(list(dedup.values()), actions or [])
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["date", "symbol", "close", "adjusted_close", "volume", "adjusted_volume", "adjustment_factor", "source_file"])
        writer.writeheader(); writer.writerows(dedup.values())
    return len(dedup)

def download_vix(out_path: Path) -> Path:
    """Download the Cboe VIX historical CSV used by strategy 3."""
    out_path.parent.mkdir(parents=True, exist_ok=True)
    if out_path.exists():
        return out_path
    req = Request(CBOE_VIX_URL, headers=HEADERS)
    with urlopen(req, timeout=60) as response:
        out_path.write_bytes(response.read())
    return out_path

def normalize_vix(path: Path, out_path: Path) -> int:
    rows = []
    with path.open(encoding="utf-8-sig", newline="") as f:
        for row in csv.DictReader(f):
            raw_date = (row.get("DATE") or row.get("Date") or "").strip()
            raw_close = (row.get("CLOSE") or row.get("Close") or "").strip()
            if not raw_date or not raw_close or raw_close in {"-", "NA"}:
                continue
            try:
                parsed = datetime.strptime(raw_date, "%m/%d/%Y").date()
                close = float(raw_close)
            except ValueError:
                continue
            rows.append({"date": parsed.isoformat(), "vix": close})
    rows.sort(key=lambda r: r["date"])
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["date", "vix"])
        writer.writeheader(); writer.writerows(rows)
    return len(rows)

def validate_csv(path: Path) -> dict:
    with path.open(encoding="utf-8") as f: rows = list(csv.DictReader(f))
    dates = [r["date"] for r in rows]
    closes = [float(r["close"]) for r in rows]
    checks = {"non_empty": bool(rows), "dates_sorted": dates == sorted(set(dates)),
              "positive_close": all(x > 0 for x in closes), "duplicate_dates": len(dates) - len(set(dates))}
    return {"file": str(path), "rows": len(rows), "first_date": dates[0] if dates else None,
            "last_date": dates[-1] if dates else None, "checks": checks, "valid": all(v is True for k,v in checks.items() if k != "duplicate_dates") and checks["duplicate_dates"] == 0}

def build_manifest(paths: list[Path], root: Path, out: Path) -> None:
    entries = [{"path": str(p.relative_to(root)), "bytes": p.stat().st_size, "sha256": sha256(p)} for p in paths if p.exists()]
    out.parent.mkdir(parents=True, exist_ok=True); out.write_text(json.dumps({"generated_at_utc": datetime.utcnow().isoformat()+"Z", "files": entries}, ensure_ascii=False, indent=2), encoding="utf-8")

def months(start: date, end: date):
    y, m = start.year, start.month
    while (y, m) <= (end.year, end.month):
        yield y, m
        m += 1
        if m == 13: y, m = y + 1, 1
