import io
import json
from urllib.error import HTTPError

import pytest

from prstk_research import data


class FakeResponse:
    def __init__(self, payload):
        self.payload = payload

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

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


def twse_payload():
    return json.dumps({"stat": "OK", "data": []}).encode("utf-8")


def redirect(url, location, code=308):
    return HTTPError(url, code, "Permanent Redirect", {"Location": location}, io.BytesIO())


def test_rwd_payload_is_validated_and_written(tmp_path):
    opener = FakeOpener([twse_payload()])

    path = data.download_month("0050", 2010, 6, tmp_path, pause=0, opener=opener, sleep=lambda _: None)

    assert path.exists()
    assert json.loads(path.read_text(encoding="utf-8"))["stat"] == "OK"
    assert "/rwd/zh/afterTrading/STOCK_DAY?" in opener.urls[0]
    assert "stockNo=0050&date=20100601&response=json" in opener.urls[0]


def test_308_redirect_is_followed_once_and_does_not_loop(tmp_path):
    primary = data.TWSE_ENDPOINTS[0]
    fallback = data.TWSE_ENDPOINTS[1]
    opener = FakeOpener([
        redirect(f"{primary}?x=1", fallback),
        twse_payload(),
    ])

    path = data.download_month("0050", 2010, 6, tmp_path, pause=0, opener=opener, sleep=lambda _: None)

    assert path.exists()
    assert len(opener.urls) == 2
    assert "/exchangeReport/STOCK_DAY?" in opener.urls[1]


def test_same_url_308_loop_is_bounded_and_does_not_write(tmp_path):
    class LoopOpener:
        def __init__(self):
            self.calls = 0

        def open(self, request, timeout=30):
            self.calls += 1
            raise redirect(request.full_url, request.full_url)

    opener = LoopOpener()
    with pytest.raises(RuntimeError, match="TWSE download failed"):
        data.download_month("0050", 2010, 6, tmp_path, pause=0, opener=opener, sleep=lambda _: None)

    assert opener.calls == data.MAX_ATTEMPTS * len(data.TWSE_ENDPOINTS)
    assert not list(tmp_path.glob("*.json"))


def test_retryable_http_errors_are_retried(tmp_path):
    url = data.TWSE_ENDPOINTS[0]
    opener = FakeOpener([
        HTTPError(url, 429, "Too Many Requests", {}, io.BytesIO()),
        HTTPError(url, 503, "Service Unavailable", {}, io.BytesIO()),
        twse_payload(),
    ])

    path = data.download_month("0050", 2010, 6, tmp_path, pause=0, opener=opener, sleep=lambda _: None)

    assert path.exists()
    assert len(opener.urls) == 3


@pytest.mark.parametrize("payload", [b"not-json", b"{}", b'{"stat":"ERROR","data":[]}'])
def test_invalid_twse_response_never_creates_raw_file(tmp_path, payload):
    opener = FakeOpener([payload] * (data.MAX_ATTEMPTS * len(data.TWSE_ENDPOINTS)))

    with pytest.raises(RuntimeError, match="TWSE download failed"):
        data.download_month("0050", 2010, 6, tmp_path, pause=0, opener=opener, sleep=lambda _: None)

    assert not list(tmp_path.glob("*.json"))
