# Assistant frontend integration

## First release: external RAGFlow deferred

The first-release server profile keeps external RAGFlow disabled. The authenticated Core registry controls availability: the document-retrieval control is shown only for `retrieval.state=AVAILABLE`, starts unchecked, and every new chat/edit request gates `ragflow` against that same registry. Missing/disabled/unconfigured retrieval sends `ragflow:false`; platform-artwork lookup and its public UUID/revision references remain independent. This does not require a browser RAG address, credential, dataset or external request. Persisted runs show their actual retrieval state and saved citations; unavailable retrieval is never described as document grounding. Historical records are not rewritten or filled with demonstration documents.

Production-origin builds must explicitly use `NEXT_PUBLIC_API_BASE_URL=https://api.artlive.top` and `NEXT_PUBLIC_ASSISTANT_SIMULATED=false`. Isolated mock builds use a separate loopback Core target and retain the simulated notice; they are not interchangeable deployment artifacts. Release identity and configuration authorization remain external gates, and a successful local build is not a formal release approval.

This frontend integrates the accepted Knowledge/ARIA baseline with account-owned Assistant history. Source review and CI do not enable Assistant in production or verify real providers. The browser calls only Core at `NEXT_PUBLIC_API_BASE_URL`; Core owns authentication, data, execution, attachments and knowledge visibility. `NEXT_PUBLIC_ASSISTANT_SIMULATED=true` adds the explicit isolated-preview notice; this is a public presentation flag, never a provider credential or runtime fallback.

## Interface and recovery

The protected `/assistant` route uses the existing shell and session provider. It includes account sessions/rename/delete, server model registry, JPEG/PNG upload and authenticated original-image viewing/download, fetch SSE, saved history, explicit cancellation/retry, retained editing branches, saved choices/citations, bounded public artwork lookup/explicit UUID+batch+revision selection, manual and server-gated automatic summaries, Assistant-only timeline/classifications and JSON/CSV exports. Model output and excerpts render as literal React text. Arbitrary Markdown links/HTML are not executed. Platform citations can link only to UUID-owned Core Gallery routes; RAG provenance remains visibly distinct.

S3 depends on additive Core endpoints `/sessions/page`, session `/{branches,messages,runs,summaries,timeline}/page`, owned branch detail and read-only `POST /requests/resolve`. Messages/timeline first show the latest bounded chronological chunk; “加载更早” prepends older chunks. Other lists load another page explicitly. Cursors never dispatch. Existing export limits are errors, not silently partial files.

Each accepted chat is recovered by server run status/listing. SSE events are UTF-8 decoded, validated, sequenced/deduplicated, with snapshot support. EOF prompts a status GET and another subscription; it never marks completion or resubmits. Browser disconnect and explicit cancel differ. Explicit retry warns of prior possible charges and creates the separately recorded attempt under Core's rules.

Operation keys survive uncertain submission in sessionStorage as **only opaque key, payload SHA-256 and operation/session IDs**, scoped to the platform user ID. No conversation text, images, credentials or provider config are stored there. Same unresolved operation with different payload is refused. A refresh first resolves the original key through Core; confirmed results are recovered without dispatch. Unknown results retain their key; changing it to defeat a conflict is not supported. Clearing browser storage loses this local convenience, not server idempotency tombstones or history.

Every read/write success and failure captures SessionIdentityTracker generation. Account replacement invalidates results and aborts outstanding HTTP/stream calls. Delayed old 401s cannot sign out the new account. Account-keyed components clear private state; image and export blob URLs are revoked. Content/download requests negotiate existing JSON media errors; tokens are never in image URLs. Session deletion uses the server lifecycle boundary and unmounts/revokes local content. A previously downloaded external copy cannot be revoked by the application.

## Configuration and limits

Assistant disabled shows an unavailable state. Execution-disabled/history-only keeps foundation browsing, images, export and deletion; no model dispatch. Configured/enabled model capabilities and evidence labels are shown separately; models never silently switch and unsupported image input is not discarded. JPEG and PNG only, at most four images; server limits remain authoritative. The browser does not advertise WebP support, exact billing, zero loss, unlimited storage, or an approved production retention policy.

Summary policy and auto availability come from authenticated status; a session opt-in cannot enable globally disabled summaries. Stage labels are classifications, not verified physical creation events. Export defaults to the current branch, with explicit include-history; CSV formula escaping remains Core's responsibility.

Speech is feature-detected browser functionality. Recognition text enters the composer for user confirmation, never auto-submit. Permission/error states and playback stop are present; navigation/account changes release recognition and playback. Browser vendors may process speech online. Feature-detection and simulated speech tests are not proof of actual recognition quality or permission support.

## Verification

Required Web checks: Node 22 `npm ci`, `npm run typecheck`, `npm test`, `npm run lint`, `npm run build`, `python3 tests/deploy-workflow-fixtures.py --bash bash`. Browser acceptance, received mock counters and exact artifact/source inventory live in the external S3 stage handoff. No Web UI or mock response alone constitutes Core-to-AI chain acceptance. Existing Knowledge charts/no-map/ARIA, Gallery and session/media contracts remain unchanged except the exact Assistant UUID content allowlist in `lib/media.ts`.

## 2026-10-14 attachment refresh repair

Confirmed READY uploads are a **server-authoritative session-wide draft**, not an in-memory-only composer value. `GET /sessions/{id}/attachments/draft` returns paged READY, unlinked attachments backed by an ACTIVE, unexpired upload request; each item supplies `draftExpiresAt`. It excludes removed/failed/expired uploads and retained message attachments. No branch is guessed for older uploads. The frontend restores this draft on mount and “刷新会话”, re-fetches authenticated image bytes and creates fresh browser blob URLs. More than four drafts are shown with explicit loading/removal; sending is blocked instead of silently choosing or dropping images.

`POST /requests/resolve` supplies attachment `resultStatus`, `attachmentLinked` and expiry. Only known READY/linked/FAILED/removed/expired outcomes retire the browser's pending operation key. NOT_FOUND keeps the original key for an explicit same-file retry, and UPLOADING offers read-only status reconciliation or explicit removal. Uncertain connection failures never rotate keys or automatically re-upload. A failed or removed operation does not prevent a later deliberate file selection from creating its own new key. Actual file bytes that never reached the server are not promised recoverable after a reload.

Upload success alone does not submit to a model. Text-only models still accept file staging but require an explicit image-capable model selection before sending images. Removing an upload is an explicit DELETE; navigating, refreshing and revoking object URLs never delete a server attachment. Linked images continue to restore solely from persisted message references and authenticated content requests. History read failures are visibly failures, not a successfully loaded empty conversation.

Regression details and exact rebuilt preview identity are in `stages/assistant-attachment-repair-20261014/` outside Git. The existing preview account, original affected session, media bytes and old S3 evidence remain preserved.

## S4 storage visibility

`GET /api/v1/assistant/storage` is authenticated and owner-scoped. The page displays server `chargedBytes = logicalBytes + cleanupReservedBytes` against `quotaBytes`: logical usage is `readyBytes + reservedBytes`, and failed/removed uploads conservatively retain their declared-byte reservation until cleanup succeeds. `retainedFileBytes` and `pendingCleanupBytes` separately report observed files; these are not additional free quota or a claim that a deleted file has already disappeared. Usage refreshes after upload reconciliation, explicit removal and conversation refresh. A quota or policy warning never disables historical image reads, downloads, exports, session deletion, or text-only chat. Core remains the atomic upload authority; a selected file can still exceed the remaining quota or fail disk checks after the displayed snapshot.

`policyStatus=MISSING|INVALID` is explicitly unavailable, not unlimited. The UI neither chooses a production quota nor enables cleanup. `ASSISTANT_QUOTA_EXCEEDED`, `ASSISTANT_STORAGE_POLICY_UNAVAILABLE` and `ASSISTANT_DISK_FULL` have distinct Chinese recovery guidance; a disk/network failure still reconciles the original operation key. The READY draft repair remains intact: server-provided `draftExpiresAt` determines the recovery window; expiry is shown to the user, sent/historical attachments remain message references, and page unmount never triggers deletion. No browser cleanup or retention timer is introduced.

The explicit server `historyOnly` state refuses new uploads even when policy and remaining bytes are valid. Its notice preserves read/download/export/delete access; no local quota calculation can override this mode. Core execution status still controls generation availability.

A definitive quota/policy/history-only pre-admission refusal is not presented as a lost upload. The hook first resolves the original key; only explicit refusal plus `NOT_FOUND` retires that browser operation. Generic HTTP/transport failures, disk failures and conflicts keep their prior recovery path. No response is retried automatically, and no key is replaced to defeat a conflict.

S4 builds and browser testing use a separate staged source/runtime. The accepted S3 preview's `.next`, BUILD_ID and database are not changed by this source edit. Test quotas and short retention intervals are labeled isolated fixtures, not production approval. There is still no WebP or real speech hardware acceptance.

## Approved operational policy (2026-10-14)

The owner has approved 512 MiB per account, a seven-day READY unsent draft lifetime, a 5 GiB disk-free floor, and automatic attachment cleanup disabled. Backup retention is seven daily and four weekly sets. These values are bound by Core/Deploy release configuration; the Web displays the actual authenticated storage response instead of hard-coding enforcement. Generation uses the existing authenticated-user rules and manual provider-cost monitoring/suspension, without a monetary hard cap or participant allowlist. This policy approval is separate from the original S5 test window and does not change its counters/reservations. RAGFlow remains disabled; artwork references remain independent. Production activation remains a separate reviewed action.
