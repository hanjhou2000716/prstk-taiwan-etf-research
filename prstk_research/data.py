"""TWSE downloader, parser, hashing and validation. Standard library only."""
from __future__ import annotations
import calendar, csv, hashlib, json, ssl, time
from datetime import date, datetime
from pathlib import Path
from urllib.parse import urlencode, urljoin
from urllib.error import HTTPError, URLError
from urllib.request import HTTPRedirectHandler, HTTPSHandler, Request, build_opener, urlopen

try:
    import certifi
    TLS_CONTEXT = ssl.create_default_context(cafile=certifi.where())
except ImportError:
    TLS_CONTEXT = ssl.create_default_context()

TWSE_ENDPOINTS = (
    "https://www.twse.com.tw/rwd/zh/afterTrading/STOCK_DAY",
    "https://www.twse.com.tw/exchangeReport/STOCK_DAY",
)
URL = TWSE_ENDPOINTS[0]
CBOE_VIX_URL = "https://cdn.cboe.com/api/global/us_indices/daily_prices/VIX_History.csv"
HEADERS = {
    "User-Agent": "PRStK-Research/0.1 (+research; contact unavailable)",
    # Match the normal browser/curl request accepted by the TWSE CDN.  With
    # no explicit Accept header the CDN can return a same-URL 308 for some
    # historical cache keys instead of the JSON response.
    "Accept": "*/*",
}
RETRYABLE_HTTP_CODES = frozenset({429, 500, 502, 503, 504})
REDIRECT_CODES = frozenset({301, 302, 303, 307, 308})
MAX_ATTEMPTS = 5
MAX_REDIRECTS = 3


class _NoRedirectHandler(HTTPRedirectHandler):
    """Expose redirects to the bounded downloader instead of following forever."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def _twse_opener():
    return build_opener(
        _NoRedirectHandler(),
        HTTPSHandler(context=TLS_CONTEXT),
    )


def _request_url(endpoint: str, params: str) -> str:
    separator = "&" if "?" in endpoint else "?"
    return f"{endpoint}{separator}{params}"


def _redirect_target(current_url: str, location: str, params: str) -> str:
    target = urljoin(current_url, location)
    if "?" not in target:
        target = _request_url(target, params)
    return target


def _validate_twse_payload(payload: bytes, source_url: str) -> dict:
    try:
        document = json.loads(payload.decode("utf-8-sig"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise RuntimeError(f"TWSE response is not valid JSON: {source_url}; error={exc}") from exc
    if not isinstance(document, dict):
        raise RuntimeError(f"TWSE response must be a JSON object: {source_url}")
    if document.get("stat") != "OK":
        raise RuntimeError(
            f"TWSE response status is not OK: {source_url}; stat={document.get('stat')!r}"
        )
    if not isinstance(document.get("data"), list):
        raise RuntimeError(f"TWSE response data must be a list: {source_url}")
    return document


def _download_endpoint(
    endpoint: str,
    params: str,
    symbol: str,
    year: int,
    month: int,
    *,
    opener=None,
    sleep=time.sleep,
) -> bytes:
    """Download one official endpoint with bounded redirects and retries."""
    opener = opener or _twse_opener()
    last_error = None
    for attempt in range(MAX_ATTEMPTS):
        current_url = _request_url(endpoint, params)
        visited = set()
        redirects = 0
        redirect_chain = []
        try:
            while True:
                if current_url in visited:
                    chain = " -> ".join(redirect_chain + [current_url])
                    raise RuntimeError(
                        f"TWSE redirect loop for {symbol} {year:04d}-{month:02d}: {chain}"
                    )
                if redirects > MAX_REDIRECTS:
                    chain = " -> ".join(redirect_chain)
                    raise RuntimeError(
                        f"TWSE redirect limit exceeded for {symbol} {year:04d}-{month:02d}: {chain}"
                    )
                visited.add(current_url)
                request = Request(current_url, headers=HEADERS)
                try:
                    with opener.open(request, timeout=30) as response:
                        status = response.getcode() if hasattr(response, "getcode") else getattr(response, "status", None)
                        if status not in (None, 200):
                            raise RuntimeError(
                                f"TWSE response HTTP status is not successful: {current_url}; status={status}"
                            )
                        payload = response.read()
                except HTTPError as exc:
                    code = getattr(exc, "code", None)
                    if code in REDIRECT_CODES:
                        location = exc.headers.get("Location") if exc.headers else None
                        if not location:
                            raise RuntimeError(
                                f"TWSE redirect missing Location for {symbol} {year:04d}-{month:02d}: "
                                f"status={code}; url={current_url}"
                            ) from exc
                        next_url = _redirect_target(current_url, location, params)
                        redirect_chain.append(f"{current_url} [{code}] {next_url}")
                        redirects += 1
                        current_url = next_url
                        continue
                    if code in RETRYABLE_HTTP_CODES:
                        raise
                    raise RuntimeError(
                        f"TWSE download failed for {symbol} {year:04d}-{month:02d}: "
                        f"status={code}; url={current_url}"
                    ) from exc
                except URLError:
                    raise
                _validate_twse_payload(payload, current_url)
                return payload
        except (HTTPError, URLError, RuntimeError) as exc:
            last_error = exc
            if attempt == MAX_ATTEMPTS - 1:
                break
            sleep(2 ** attempt)
    raise RuntimeError(
        f"TWSE endpoint failed for {symbol} {year:04d}-{month:02d}: {endpoint}; "
        f"attempts={MAX_ATTEMPTS}; last_error={last_error}"
    ) from last_error

def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""): h.update(chunk)
    return h.hexdigest()

def download_month(
    symbol: str,
    year: int,
    month: int,
    raw_dir: Path,
    pause: float = .25,
    *,
    opener=None,
    sleep=time.sleep,
) -> Path:
    raw_dir.mkdir(parents=True, exist_ok=True)
    path = raw_dir / f"{symbol}_{year:04d}-{month:02d}.json"
    if path.exists(): return path
    # Keep the order used by the current TWSE CDN cache key.  The equivalent
    # date-first query intermittently returns a same-URL 308 from the CDN for
    # older months, while this official parameter order returns JSON directly.
    params = urlencode({"stockNo": symbol, "date": f"{year:04d}{month:02d}01", "response": "json"})
    errors = []
    for endpoint in TWSE_ENDPOINTS:
        try:
            payload = _download_endpoint(
                endpoint,
                params,
                symbol,
                year,
                month,
                opener=opener,
                sleep=sleep,
            )
            # _download_endpoint validates before returning. Keep the write as
            # the final operation so malformed/error responses never become raw data.
            path.write_bytes(payload)
            time.sleep(pause)
            return path
        except RuntimeError as exc:
            errors.append(f"{endpoint}: {exc}")
    raise RuntimeError(
        f"TWSE download failed for {symbol} {year:04d}-{month:02d}; "
        f"official_endpoints={' | '.join(errors)}"
    ) from None

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
    """Create split-adjusted and, only when supplied, total-return fields.

    TWSE daily close data does not contain distributions.  Therefore the
    total-return field stays blank unless every configured distribution is
    explicitly supplied in the corporate-actions file.
    """
    split_actions = sorted((a for a in actions if a.get("action_type") == "split"), key=lambda a: a["effective_date"])
    dividend_actions = sorted((a for a in actions if a.get("action_type") in {"dividend", "distribution"}), key=lambda a: a.get("effective_date", a.get("ex_date", "")))
    complete_total_return = bool(dividend_actions) and all(a.get("per_share") is not None for a in dividend_actions)
    by_date = {r["date"]: r for r in rows}
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
        row["split_ratio"] = factor
        row["cash_dividend"] = ""
        row["total_return_close"] = ""
    if complete_total_return:
        for action in dividend_actions:
            ex_date = action.get("ex_date", action.get("effective_date"))
            ex_row = by_date.get(ex_date)
            if not ex_row:
                complete_total_return = False
                break
        if complete_total_return:
            for row in rows:
                total_factor = 1.0
                for action in dividend_actions:
                    ex_date = action.get("ex_date", action.get("effective_date"))
                    if row["date"] < ex_date:
                        ex_close = float(by_date[ex_date]["adjusted_close"])
                        total_factor *= 1.0 + float(action["per_share"]) / ex_close
                    if row["date"] == ex_date:
                        row["cash_dividend"] = float(action["per_share"])
                row["total_return_close"] = float(row["adjusted_close"]) * total_factor
    return rows


def corporate_action_summary(symbol: str, actions: list[dict], rows: list[dict] | None = None) -> dict:
    """Return an auditable return-series classification for one asset.

    A split-adjusted close is not a total-return series.  Total return is marked
    available only when every configured cash distribution has an amount and an
    ex-date that is present in the normalized trading dates.  Missing evidence
    remains explicit instead of being interpreted as zero distribution.
    """
    normalized_dates = {row.get("date") for row in (rows or [])}
    split_actions = [action for action in actions if action.get("action_type") == "split"]
    distribution_actions = [
        action for action in actions
        if action.get("action_type") in {"dividend", "distribution"}
    ]
    missing_amount = [
        action for action in distribution_actions
        if action.get("per_share") is None
    ]
    missing_date = [
        action for action in distribution_actions
        if action.get("ex_date", action.get("effective_date")) not in normalized_dates
    ] if rows is not None else []
    if not distribution_actions:
        total_return_status = "unavailable"
        total_return_reason = "no_explicit_distribution_records"
    elif missing_amount:
        total_return_status = "unavailable"
        total_return_reason = "distribution_amount_missing"
    elif missing_date:
        total_return_status = "unavailable"
        total_return_reason = "distribution_ex_date_not_in_trading_data"
    else:
        total_return_status = "available"
        total_return_reason = "explicit_distribution_records_complete"
    return {
        "symbol": symbol,
        "configured_actions": len(actions),
        "split_actions": len(split_actions),
        "distribution_actions": len(distribution_actions),
        "price_return": {"field": "close", "status": "available"},
        "adjusted_price_return": {
            "field": "adjusted_close",
            "status": "available" if rows is not None else "pending",
            "method": "split_adjusted_close",
        },
        "total_return": {
            "field": "total_return_close",
            "status": total_return_status,
            "reason": total_return_reason,
        },
        "cash_distribution_field": "cash_dividend",
        "split_field": "split_ratio",
        "source": "config/corporate_actions.json",
        "evidence_status": "verified" if total_return_status == "available" else "unknown",
    }

def normalize(symbol: str, files: list[Path], out_path: Path, actions: list[dict] | None = None) -> int:
    rows = [dict(r, symbol=symbol) for p in files for r in parse_twse_json(p)]
    rows.sort(key=lambda r: r["date"])
    dedup = {r["date"]: r for r in rows}
    apply_split_adjustments(list(dedup.values()), actions or [])
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["date", "symbol", "close", "adjusted_close", "total_return_close", "cash_dividend", "split_ratio", "volume", "adjusted_volume", "adjustment_factor", "source_file"])
        writer.writeheader(); writer.writerows(dedup.values())
    return len(dedup)

def download_vix(out_path: Path) -> Path:
    """Download the Cboe VIX historical CSV used by strategy 3."""
    out_path.parent.mkdir(parents=True, exist_ok=True)
    if out_path.exists():
        return out_path
    req = Request(CBOE_VIX_URL, headers=HEADERS)
    with urlopen(req, timeout=60, context=TLS_CONTEXT) as response:
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
