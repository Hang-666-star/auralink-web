# Knowledge isolated validation evidence

## Approved no-map candidate

The current candidate removes map rendering and map transport while preserving
geographic pair-count statistics and all other painting/poetry views. Its local
checks and new-build browser evidence are recorded below. The older screenshots
and map-enabled BUILD_ID in the historical section are **not** evidence that
this no-map candidate was rendered. The existing preview is kept unchanged.

Executed for the no-map working tree on 2026-10-12 (Node.js 22.23.2):

- `npm run typecheck`: passed.
- `npm test`: **84 passed, zero failures/skips**; includes geographic pair counts
  versus painting coverage, only the two no-map resource requests, session
  generation and media JSON error regressions.
- `npm run lint`: passed.
- `python3 tests/deploy-workflow-fixtures.py --bash bash`: **7 passed**.

Logs: task-local `evidence/nomap/frontend/{typecheck,test,lint,deploy-fixtures}.log`
and `checks.json`. Build and rendered browser evidence must identify the separate
no-map preview below; the historical `.next` directory was not rebuilt by these
checks. The unchanged PostgreSQL aggregation evidence remains reusable only when
its source-file identity mapping is verified in the current readiness report.

### New no-map build and actual browser evidence

The independent preview is `http://127.0.0.1:20493/knowledge`, BUILD_ID
`LRFTy0Fca0TE-qoobNz2l`. It calls actual isolated Core on `127.0.0.1:20490`,
JAR SHA-256 `4748f2bef01b551bcb7a6c1eec4175abcb814395f6dbd56afbed7e37ee551d12`,
and fresh synthetic PostgreSQL on `127.0.0.1:55645`. The historical preview on
20483 remains running with its own unchanged build. No screenshot below comes
from that historical preview.

The new preview was built from the no-map application working tree based on
`675d96d875000bb557772236ddedd6863df2f464`; the evidence records exact source-file
hashes before the scoped commit. Subsequent documentation/image changes do not
change those application bytes. For example, `components/knowledge-screen.tsx`
SHA-256 is `2818928e4808061dc73360e3cbf34c20043b7c3deef4557b7177b827174deba6`.
CI builds have separate artifacts and do not inherit this local JAR evidence.

Executed from the task root:

```sh
NOMAP_BUILD_FILE=/home/bailangguihun/artlive-database-migration/runtime/nomap/frontend-build/.next/BUILD_ID node runtime/browser/nomap.mjs
```

It completed **13 checks** using existing Playwright 1.58.2 / Chromium. Browser plugin was unavailable; no
new browser dependency or global installation was used. Receipts and commands
are task-local `evidence/nomap/BROWSER_ACCEPTANCE.json`, `browser.log`, and
`runtime/browser/nomap.mjs`:

- Actual authentication/route protection, both tabs and all seven painting
  metrics rendered. Six eligible synthetic paintings and two author names were
  unchanged. Geography had two field-eligible paintings, four missing/restricted,
  one unmatched and one Zhejiang name/birthplace pair, shown as a bar and table.
- Actual poetry files produced **711 unique nodes / 609 valid relationships**
  with the required graph/statistics hashes. Search, exact category filtering,
  empty search, pagination reset, one-hop selection/focus, relation detail,
  relation summaries and pan/zoom controls worked.
- Desktop 1440×1000 and narrow 390×844 had no horizontal overflow, framework
  overlay or unexpected page/console errors. Network recording saw **zero map
  requests and zero external requests** throughout all flows.
- Browser-injected graph 503/retry/empty, statistics loading/500/404 and restricted
  fields were explicitly synthetic state tests; retry returned to the actual API.
  The three injected HTTP error messages were expected. These tests did not
  alter PostgreSQL, snapshots or either server's configuration.

Two initial harness-only failures (an overly exact nested-select label and the
expected-HTTP console pattern) are retained beside the final passed receipt.
Viewport screenshots avoid offscreen compositor artifacts from tall full-page
captures of the existing backdrop-filter panels. The narrow geography screenshot
was recaptured at the same source/build after its layout settled, using
`runtime/browser/nomap-screenshot.mjs`; no application change or rebuild followed.

| No-map candidate | Desktop | Narrow (390px) |
| --- | --- | --- |
| Painting statistics / geography | [Open](knowledge-review/painting-desktop-nomap.png) | [Open](knowledge-review/painting-mobile-nomap.png) |
| Poetry graph / one-hop detail | [Open](knowledge-review/poetry-desktop-nomap.png) | [Open](knowledge-review/poetry-mobile-nomap.png) |

These review images contain isolated synthetic painting counts and the existing
poetry display. They contain no credentials, private annotations, production user
records or runtime JSON asset bundle. Browser validation is not production
acceptance; unchanged PostgreSQL and kernel/deployment evidence is mapped
separately in the release-readiness record.

## Historical map-enabled candidate evidence

Application source reviewed: `a5e5c50b48c046eb5972c0d614fc932c8f3036b6` (Web) with
`a6875b63fafd4c8658d79f6ec040d08b7cad04ad` (Core). Release-preparation commits through Web
`675d96d875000bb557772236ddedd6863df2f464` only added documentation, review images
and offline asset-verification support; the new no-map changes are subsequent
application changes and need their own build/browser evidence.

Validated on 2026-10-12 with Node.js 22, Java 17 and isolated PostgreSQL 16.15.
Web BUILD_ID: `ZTBFk3sN5MNNwckmM-GNR`. Core JAR SHA-256:
`550d1bb9e71717226d5fc7645c94b6cb21234ecbfff44aa3fdae4f1f9c1a84d8`.

## Scope and observed results

- `npm run typecheck`, `npm run lint`, `npm test` (83 tests) and `npm run build`
  completed successfully. Session-generation and media JSON error regressions
  are included in the unit suite.
- Core `mvn -B -ntp clean package` ran 24 tests without failures or skips in the
  explicitly configured local fixture environment, including seven PostgreSQL
  tests. CI without that environment will skip those seven PG tests.
- Actual isolated UI/API desktop and 390px layouts rendered both views with no
  JavaScript/console errors or horizontal overflow. The preview's painting
  population is **six eligible synthetic paintings**, not production data.
- The graph view used the inherited real snapshot: **711 unique nodes / 609
  edges**. The map used the inherited 35-feature snapshot. Neither JSON artifact
  is in this repository. Screenshots document isolated review, not production
  distribution approval. Map source/redistribution rights remain a release gate;
  see the associated Core PR's `docs/knowledge-map-provenance.md`.
- Existing browser evidence covers search, pagination, one-hop focus, node/edge
  detail, missing-file/retry, empty/restricted painting data, empty graph,
  untrusted text, late 401 and media JSON 404. Injected failures were identified
  as fixtures, not actual production incidents.
- The 406-category relation donut was checked against real Canvas pixels after
  removing its minimum sector angle; count proportions were preserved.
- Separate Core scale validation used 10,000 deterministic synthetic paintings,
  10,200 source memberships and 266,000 annotation rows. Exact eligible total
  7,000, author-name total 50 and all seven metric distributions matched.
  Actual HTTP completed 33 assertions with a 3,014-byte response. The following
  five requests had median 1,584.907 ms (range 1,520.626–1,807.920 ms): loopback,
  warm cache, one concurrent request, connection-level JIT off, minimal read
  tables/relevant indexes. This is not production performance acceptance.

Prior unaffected browser/state and deployment-fixture evidence was reused;
checks were not all repeated after documentation-only commits. CI/review status
belongs to the associated PR checks, not this dated local evidence.

## Historical map-enabled screenshots

These are rendered review images, not runtime JSON/data bundles. No credentials,
production records, private annotations or real user uploads appear in them.

| View | Desktop | Narrow (390px) |
| --- | --- | --- |
| Painting statistics | [Open](knowledge-review/painting-desktop.png) | [Open](knowledge-review/painting-mobile.png) |
| Poetry graph | [Open](knowledge-review/poetry-desktop.png) | [Open](knowledge-review/poetry-mobile.png) |

![Painting statistics, isolated synthetic fixture](knowledge-review/painting-desktop.png)

![Poetry graph, existing external snapshot](knowledge-review/poetry-desktop.png)

## Remaining release acceptance

Production field coverage, real permission combinations, concurrent capacity and
coordinated production release/recovery remain unverified. Map redistribution
permission is deferred: this no-map candidate does not package, request or serve
map data. Publish compatible Core and the **two poetry files** before Web through
the reviewed V1-install → V2-upgrade → Core → c5ea-Web sequence. Missing APIs or
required poetry files produce Knowledge unavailable/retry states. Roll back code
without restoring the database or removing existing data/media/huaniao records.
Owner review and final release identities remain separate from local/CI success.
