import io
import json
from datetime import date
from urllib.error import HTTPError, URLError

import pytest

from prstk_research import data


class FakeResponse:
    def __init__(self, payload, status=200):
        self.payload = payload
        self.status = status

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def getcode(self):
        return self.status

    def read(self):
        return self.payload


class FakeOpener:
    def __init__(self, actions):
        self.actions = list(actions)
        self.urls = []

    def open(self, request, timeout=30):
        self.urls.append(request.full_url)
        action = self.actions.pop(0)
        if isinstance(action, BaseException):
            raise action
        return FakeResponse(action)


def twse_payload(data_rows=None):
    return json.dumps({"stat": "OK", "data": data_rows or []}).encode("utf-8")


def redirect(url, location, code=308):
    return HTTPError(url, code, "Redirect", {"Location": location}, io.BytesIO())


def test_historical_cached_month_reuses_valid_file_without_network(tmp_path):
    path = tmp_path / "0050_2010-06.json"
    path.write_bytes(twse_payload())
    opener = FakeOpener([])

    result = data.download_month(
        "0050", 2010, 6, tmp_path, pause=0, opener=opener,
        today=date(2026, 8, 30),
    )

    assert result == path
    assert opener.urls == []


def test_current_cached_month_is_refreshed(tmp_path):
    path = tmp_path / "0050_2026-08.json"
    old_payload = twse_payload()
    new_payload = twse_payload([["115/08/01", "1", "", "", "", "", "123.4"]])
    path.write_bytes(old_payload)
    opener = FakeOpener([new_payload])

    data.download_month(
        "0050", 2026, 8, tmp_path, pause=0, opener=opener,
        today=date(2026, 8, 30),
    )

    assert len(opener.urls) == 1
    assert path.read_bytes() == new_payload


def test_failed_current_refresh_preserves_last_good_file(tmp_path):
    path = tmp_path / "0050_2026-08.json"
    old_payload = twse_payload()
    path.write_bytes(old_payload)
    invalid = b"<html>security page</html>"
    opener = FakeOpener([invalid] * (data.MAX_ATTEMPTS * len(data.TWSE_ENDPOINTS)))

    with pytest.raises(RuntimeError, match="TWSE download failed"):
        data.download_month(
            "0050", 2026, 8, tmp_path, pause=0, opener=opener,
            today=date(2026, 8, 30), sleep=lambda _: None,
        )

    assert path.read_bytes() == old_payload


def test_307_without_location_fails_and_preserves_current_cache(tmp_path):
    path = tmp_path / "0050_2026-08.json"
    old_payload = twse_payload()
    path.write_bytes(old_payload)

    class NoLocationOpener:
        def __init__(self):
            self.calls = 0

        def open(self, request, timeout=30):
            self.calls += 1
            raise HTTPError(request.full_url, 307, "Temporary Redirect", {}, io.BytesIO())

    opener = NoLocationOpener()
    with pytest.raises(RuntimeError, match="redirect missing Location"):
        data.download_month(
            "0050", 2026, 8, tmp_path, pause=0, opener=opener,
            today=date(2026, 8, 30), sleep=lambda _: None,
        )

    assert opener.calls == data.MAX_ATTEMPTS * len(data.TWSE_ENDPOINTS)
    assert path.read_bytes() == old_payload


def test_308_redirect_is_followed_and_validated(tmp_path):
    primary = data.TWSE_ENDPOINTS[0]
    fallback = data.TWSE_ENDPOINTS[1]
    opener = FakeOpener([
        redirect(f"{primary}?x=1", fallback),
        twse_payload(),
    ])

    path = data.download_month(
        "0050", 2010, 6, tmp_path, pause=0, opener=opener,
        today=date(2026, 8, 30), sleep=lambda _: None,
    )

    assert path.exists()
    assert len(opener.urls) == 2
    assert "/exchangeReport/STOCK_DAY?" in opener.urls[1]


def test_retryable_http_errors_are_retried(tmp_path):
    endpoint = data.TWSE_ENDPOINTS[0]
    opener = FakeOpener([
        HTTPError(endpoint, 429, "Too Many Requests", {}, io.BytesIO()),
        HTTPError(endpoint, 503, "Service Unavailable", {}, io.BytesIO()),
        twse_payload(),
    ])

    path = data.download_month(
        "0050", 2010, 6, tmp_path, pause=0, opener=opener,
        today=date(2026, 8, 30), sleep=lambda _: None,
    )

    assert path.exists()
    assert len(opener.urls) == 3


@pytest.mark.parametrize("payload", [b"not-json", b"{}", b'{"stat":"ERROR","data":[]}'])
def test_invalid_twse_response_never_creates_raw_file(tmp_path, payload):
    opener = FakeOpener([payload] * (data.MAX_ATTEMPTS * len(data.TWSE_ENDPOINTS)))

    with pytest.raises(RuntimeError, match="TWSE download failed"):
        data.download_month(
            "0050", 2010, 6, tmp_path, pause=0, opener=opener,
            today=date(2026, 8, 30), sleep=lambda _: None,
        )

    assert not list(tmp_path.glob("*.json"))


VIX_PAYLOAD = b"DATE,OPEN,HIGH,LOW,CLOSE\n08/28/2026,17,18,16,17.5\n"


def test_existing_vix_is_refreshed_and_replaced_atomically(tmp_path, monkeypatch):
    path = tmp_path / "VIX_History.csv"
    path.write_bytes(b"DATE,CLOSE\n08/27/2026,16.0\n")
    calls = []

    def fetch(*args, **kwargs):
        calls.append((args, kwargs))
        return FakeResponse(VIX_PAYLOAD)

    monkeypatch.setattr(data, "urlopen", fetch)
    result = data.download_vix(path)

    assert result == path
    assert len(calls) == 1
    assert path.read_bytes() == VIX_PAYLOAD


def test_failed_vix_refresh_preserves_last_good_file(tmp_path, monkeypatch):
    path = tmp_path / "VIX_History.csv"
    old_payload = b"DATE,CLOSE\n08/27/2026,16.0\n"
    path.write_bytes(old_payload)

    def fetch(*args, **kwargs):
        raise URLError("security block")

    monkeypatch.setattr(data, "urlopen", fetch)
    with pytest.raises(URLError):
        data.download_vix(path)

    assert path.read_bytes() == old_payload
