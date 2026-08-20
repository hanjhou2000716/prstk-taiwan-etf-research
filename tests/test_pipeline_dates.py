from datetime import date

from prstk_research.pipeline import download_start_date


def test_global_start_is_kept_for_proxy_when_listing_is_older():
    assert download_start_date(date(2010, 1, 4), date(2003, 6, 30)) == date(2010, 1, 4)


def test_partial_listing_month_starts_at_next_complete_month():
    assert download_start_date(date(2010, 1, 4), date(2012, 6, 22)) == date(2012, 7, 1)


def test_first_of_month_listing_keeps_the_month():
    assert download_start_date(date(2010, 1, 4), date(2012, 7, 1)) == date(2012, 7, 1)
