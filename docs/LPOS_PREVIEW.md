# LPOS V0.7.1 preview publication

This tooling-only change does not merge or release PR #68. Its files are excluded from the automatic production publish trigger; the normal application/data release trigger and manual production workflow remain available. CI still runs for this PR.

After this tooling PR is reviewed and merged, dispatch `LPOS V0.7.1 isolated preview` **from main**, supplying the full current commit SHA of PR #68. The workflow refuses other source branches, repositories, merged/closed PRs, or a stale candidate SHA. It retains the existing `github-pages` environment and its protections. It does not add an environment or change allowed deployment branches.

The read-only preparation job captures the publicly deployed production commit and metadata, checks out that exact source and the candidate separately, and builds them. It reconstructs the production file set and checks every file against the live site before adding `/lpos-portfolio-lab/preview/v071/`. Candidate prices are under the preview's own `data/` directory. The candidate uses the independent `lpos-preview-v071:` local-storage namespace; it must not read or overwrite production settings.

Only the publication job receives Pages/OIDC write permission. It executes no candidate checkout or scripts, rechecks the production metadata, and publishes the tested artifact through the existing environment. A read-only job then verifies all production checksums, candidate identity, public browser flows, and PDF output. A mismatch stops the run; do not waive it. The workflow uses the shared Pages concurrency group to serialize releases.

Build evidence and public evidence are retained as Actions artifacts. The preview is ready for Android 13 / Chrome 155.0.8059.39 testing only after all jobs succeed. PR #68 remains draft until the owner checks amount clearing/retyping/zero/paste, ETF edits, backward navigation, calculation after edits, background/reopen persistence, a representative historical run, and PDF download/open on the physical phone. Responsive browser simulation does not complete this gate.

Rollback follows the normal reviewed production deployment process. Never reset or delete browser-local financial settings. Remove this one-off workflow after the accepted V0.7.1 release in a reviewed maintenance change.
