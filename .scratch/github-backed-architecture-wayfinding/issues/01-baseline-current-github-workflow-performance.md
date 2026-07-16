# Baseline current GitHub workflow performance

Type: research
Status: resolved
Blocked by: None

## Question

Where is GitHub-backed mode actually slow today, measured by workflow rather than by suspected module?

## Evidence that counts as done

- Capture a current, reproducible baseline for at least these GitHub-backed workflows:
  - first repository open/config bootstrap
  - pages overview load
  - collection landing/sidebar load for a large directory-backed collection
  - item open/edit for a directory-backed item
  - save or preview of an edited item
  - navigation manifest edit/save
  - publish/draft summary or draft status where applicable
- Separate cold-cache, warm IndexedDB cache, and freshness-check behavior where the app supports those states.
- Record timing evidence from the app's existing `[tentman:timing]` logs, browser/network observations, GitHub repository request stats, and any focused manual trace needed to make the numbers comparable.
- Note the repository/content shape used for the baseline: item counts, collection modes, draft branch state, and whether block packages/content components are present.

## Resolution should decide

Which workflows are currently slow enough to drive architecture, which are acceptable, and which measurements are too noisy or missing to support a decision yet.

## Answer

Baseline target: `kilmc/theresagrieben`, measured on July 13, 2026 against local Tentman dev servers using the existing `[tentman:timing]` logs and browser wall-clock checks. The target repository is private, so the baseline used the authenticated local GitHub session on `localhost`. I did not make product or architecture changes.

Repository/content shape:

- Root config: `siteName` is `Theresa Grieben`; `configsDir` is `./tentman/configs`; `blocksDir` is `./tentman/blocks`; `componentsDir` is `./src/lib/content-components`; no `blockPackages`.
- Content configs: `home` and `cv` are file-backed singletons; `news`/`news-posts` is a directory-backed collection; `projects` is a directory-backed collection with manual ordering, groups, state, gallery block, and markdown content components.
- Local checkout shape, used only for counts: `news` has 222 markdown items, `projects` has 55 markdown items, `static/images` has 620 files, and the root tree has about 2,021 entries in GitHub snapshot logs.
- Content components present: `buy-button`, `gallery-embed`, and `project-gallery-embed`; local block config present: `imageGallery`.
- Draft state in the app: active `tentman-preview` branch exists, with one pending change in `projects`; `/publish` reported edited item `Portugal Map`. The local checkout has unrelated uncommitted changes and was not used as source-of-truth for GitHub timing.

Measurement setup and caveats:

- The first compact-viewport pass under-measured sidebar behavior because the sidebars were hidden. After the user caught this, I set an explicit `1440x1000` desktop viewport and reran the critical path. The desktop/sidebar-present run is the primary signal.
- Browser resource timing was not available through the in-app browser read-only evaluation scope, so the network evidence is from app route timings, GitHub repository request stats, and browser-observed readiness text rather than a HAR.
- Browser wall times below include a 2.5-3.0s intentional settling delay unless marked otherwise; user-visible ready time is therefore roughly wall time minus that delay.
- I measured preview/draft-review rather than performing a real content save, to avoid writing another commit to the target repository.

Primary desktop/sidebar-present findings:

- First repository open/pages overview is slow but bounded. A fresh `localhost:5203` server with visible sidebar loaded configs in `api.repo.configs` 2.26s, loading both `main` and `tentman-preview` snapshots. Each snapshot read the Git tree plus config blobs and `tentman/navigation-manifest.json`; snapshot loads were 1.31s for `main` and 1.42s for `tentman-preview`. `api.repo.pages-summary` then took 727ms. Browser-observed page state confirmed the sidebar was present (`cv`, `home`, `news`, `projects`, and cache status).
- Desktop collection load for the large `news` collection is slow enough to drive architecture. With the sidebar present, `/pages/news` did not reach loaded item UI within the 90s wait and remained on `Loading items...`; cache status showed `2/450`, not the compact viewport's small `1/6` style workload. Server timings during that run showed `api.repo.collection-index` for `news` at 508ms and `api.repo.collection-projections` for 30 blobs at 1.50s, but repeated freshness/config-state work continued afterward.
- Freshness/config-state behavior is a current bottleneck and possible bug source. During desktop collection load, `/api/repo/config-states` repeated around once per second, typically taking about 1.0-1.6s, and eventually returned a 500 caused by a GitHub tree 404 (`Not Found - https://docs.github.com/rest/git/trees#get-a-tree`). This coincided with the desktop `news` page staying stuck on `Loading items...`.

Secondary compact-viewport timings:

- Cold direct `news` collection, after clearing IndexedDB on `localhost:5200`: visible item list appeared in about 3.7s before settle. Server logs: `api.repo.configs` 858ms, `api.repo.collection-index` 756ms for 222 items, `api.repo.collection-projections` 1.52s for 30 blobs, then repeated `config-states` calls.
- Warm `news` reload: visible hydrated labels appeared in about 1.45s before settle, but the route still fetched 30 projection blobs again (`api.repo.collection-projections` 1.49s) and continued repeated `config-states` calls. Warm IndexedDB helped visible readiness but did not eliminate background GitHub/API work.
- Cold compact `projects` collection: visible grouped item list appeared in about 1.6s before settle. Server logs from the same compact run showed `api.repo.collection-index` around 497ms for 55 items and `api.repo.collection-projections` around 1.51s for 30 blobs.
- `projects` item edit open for `berlin-neukoelln-kiezkulisse`: edit shell appeared in about 3.2s before settle, but the rich editor was still loading; rich editor usable state took another 3.6s. This means item edit has two user-facing readiness points: route/form shell and actual editor readiness.
- `projects` group/navigation editor open: visible group editor appeared in about 1.9s before settle. I did not save a group/navigation edit because that would mutate the draft branch; save timing remains missing.
- `/publish` draft summary: visible review summary appeared in about 8.8s before settle. It reported one edited `projects` item (`Portugal Map`). Server logs included changed-directory document comparison with one before/after document pair at about 255ms, but the full publish route timing needs a cleaner focused rerun because the terminal stream was noisy/truncated.

Decision:

- Slow enough to drive architecture now: desktop/sidebar-present collection loading and freshness/cache coordination. The `news` collection stuck state under desktop conditions is the strongest baseline signal, especially because compact mode looked merely tolerable. Any architecture decision that ignores sidebar/preload behavior will be based on the wrong workflow.
- Also slow enough to matter: first GitHub repository open/config bootstrap, item edit editor readiness, and publish/draft summary. These are not all the same kind of slowness: bootstrap is snapshot/config work; collection load is index/projection/cache/freshness interaction; editor readiness includes client editor startup; publish review is draft comparison/review assembly.
- Acceptable for now: compact `projects` collection shell and `projects` group editor open are usable once server snapshots are warm, though their background work is still suspicious.
- Too noisy or missing to support a final architecture decision yet: real save timing, clean desktop `projects` item edit after the sidebar correction, full HAR-style browser/network request counts, and a clean focused `/publish` timing with complete route logs.

Recommended next tickets:

- [Attribute GitHub API and request fanout cost](02-attribute-github-api-and-request-fanout-cost.md) should focus first on the desktop/sidebar `news` failure: why cache warming expands to about 450 tasks, why `config-states` repeats, why it can 500 on a GitHub tree 404, and why the UI remains stuck despite `collection-index` and `collection-projections` completing.
- [Explain cache lifecycle and staleness cost](03-explain-cache-lifecycle-and-staleness-cost.md) should treat viewport-dependent sidebar/preload behavior as part of the cache lifecycle, not an incidental UI detail.
