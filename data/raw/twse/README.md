# TWSE raw bootstrap snapshot

This directory contains the last-good monthly JSON snapshots used to make a
new GitHub Actions runner reproducible without re-downloading the complete
history in one burst.

- Source: official TWSE `STOCK_DAY` report responses only.
- Scope: the configured 0050, 006208, 00685L, and 00631L history through the
  current bootstrap month.
- Runtime policy: completed historical months may be reused; the current
  month is always downloaded and atomically validated before replacement.
- The GitHub Actions cache stores subsequent raw updates under the
  `prstk-twse-raw-v1` cache family.
- Invalid responses are never written over a valid snapshot.

These files are raw inputs, not authoritative website output. The pipeline
still creates the manifest, processed data, validation reports, and site
snapshot only after a complete successful run.
