# Model benchmark — chat/transcription rework — 2026-07-30

Live log of the model-benchmarking experiment: six tickets (#192–#197) from
`docs/specs/2026-07-30-chat-and-transcription-rework.md`, each dispatched to an assigned
workhorse model, reviewed by gpt-5.6-sol, merged only on READY TO MERGE + green CI.
Updated after **every** dispatch and review round, from session evidence only.

Subjects under evaluation: **gpt-5.6-terra** (#192, #194), **grok 4.5** (#193, #196, #197),
**gpt-5.6-luna** (#195). Sol rows are context (reviewer), not a subject.
Escalation ladder: 3 tries per workhorse → Opus 5 (high, fresh context).

## Dispatch log

| # | Ticket | Model + effort | Try | Wall time | Outcome | Notes |
|---|--------|----------------|-----|-----------|---------|-------|
| 1 | #192 wire contract | gpt-5.6-terra, high | 1 | 496s | exit 0; claims full green (server 287, client 189, typecheck all ws) + true TDD red runs | 118.9k tokens; touched all 3 layers (shared/server/client) as required; driver verification pending |
| 2 | #193 copy button | grok 4.5 (no effort dial) | 1 | 209s | exit 0; claims red 4-fail → green 191 client tests + typecheck | Fastest dispatch; report was well-structured; noted CSS-only hover visibility not unit-asserted; driver verification pending |
| 3 | #194 background transcription | gpt-5.6-terra, high | 1 | 460s | exit 0; claims red runs both ws → green (server 289, client 187, typecheck) | 111.7k tokens; deleted LiveCaptions.tsx, edited client/tsconfig.json (verify why); driver verification pending |
| 4 | #195 icon/wording | gpt-5.6-luna, medium | 1 | 155s | exit 0; claims red 2-fail → green 188 client tests + typecheck | 62.7k tokens; correctly refused to touch #194's overlay scope — good scope discipline for the cheap probe; driver verification pending |

## Review rounds

| Ticket | PR | Round | Reviewer | Findings (count/severity) | Verdict |
|--------|----|-------|----------|---------------------------|---------|
| #192 | pre-PR | 1 | Sol high (541s, 139k tok) | 1 BLOCKER (malformed-args server crash: payload destructure in handler + cost fn, non-fn ack callback), 3 MAJOR (weighting clamp/padding-bypass/no maxHttpBufferSize; ack race erases newer draft + dup sends; rejection test bypasses ack contract, ASCII-only weighting test) | CHANGES REQUIRED |
| #193 | pre-PR | 1 | Sol low (92s, 42k tok) | 1 MAJOR (out-of-order clipboard settlements show stale feedback), 1 MINOR (post-unmount settlement re-arms untracked timer) | CHANGES REQUIRED |
| #194 | pre-PR | 1 | Sol low (91s, 53k tok) | 1 MAJOR (wants real connected-client interim test — OVERRULED by driver: spec locks "existing seams only"; fake-io seam + contract-level type removal is the seam), 1 MINOR (TranscriptPanel test too weak — accepted) | CHANGES REQUIRED |
| #195 | pre-PR | 1 | Sol low (86s, 58k tok) | 1 MINOR (mobile-menu test covers active state only) | CHANGES REQUIRED |

Driver verification round 1 (all four worktrees, evidence in scratchpad verify-*.log): typecheck
clean ×4; targeted suites green — #192 server 44/44 + client 17/17, #193 client 19/19, #194
server 21/21 + client 1/1, #195 client 22/22. Coder self-reports matched actual output ×4.
Sol note: read-only sandbox can't run Vitest (EROFS on .vite-temp) — Sol verdicts are
read-only-analysis; test execution stays with driver + CI.

### Fix rounds (try 2) + review round 2

| # | Ticket | Model | Try | Wall | Outcome |
|---|--------|-------|-----|------|---------|
| 5 | #192 | Terra high | 2 | 413s | All 4 findings addressed incl. BLOCKER; driver re-verify green (server 47/47, client 19/19, typecheck) — 102.6k tok |
| 6 | #193 | Grok 4.5 (`-c` resume) | 2 | 119s | Both findings fixed with true red-first TDD (2 fail → 21 pass); driver re-verify green 21/21 |
| 7 | #194 | Terra high | 2 | 113s | Strengthened panel test + seam comment; driver re-verify green (15/15 + 1/1) — 46.6k tok |
| 8 | #195 | Luna medium | 2 | 114s | Extended mobile test incl. Escape-close + rerender; driver re-verify green 22/22 — 45.6k tok |

| Ticket | Round | Reviewer | Findings | Verdict |
|--------|-------|----------|----------|---------|
| #192 | 2 | Sol high (362s, 126k tok) | R1 findings 1–3 confirmed resolved; 1 MAJOR remains: harness re-implements RoomPage ack wiring (production seam untested); rateLimitAck shape + unserializable-cost fallback untested | CHANGES REQUIRED |
| #193 | 2 | Sol low (86s, 57k tok) | Both R1 findings confirmed resolved, no new defects | **READY TO MERGE** |
| #194 | 2 | Sol low (82s, 56k tok) | R1 MINOR confirmed resolved | **READY TO MERGE** |
| #195 | 2 | Sol low (63s, 38k tok) | R1 MINOR confirmed resolved, no leakage in rerender test | **READY TO MERGE** |

### Try 3 + review round 3 + escalation (#192)

| # | Ticket | Model | Try | Wall | Outcome |
|---|--------|-------|-----|------|---------|
| 9 | #192 | Terra high | 3 | 163s | Added e2e + 2 server tests, all local suites green (49/49, 19/19) — but missed the point of the finding: over-limit e2e never submits, rate-limit test reconstructs options instead of testing production wiring — 69.3k tok |

| Ticket | Round | Reviewer | Findings | Verdict |
|--------|-------|----------|----------|---------|
| #192 | 3 | Sol high (312s, 101k tok; first attempt lost to a driver-side dispatch error, not billed to Sol) | R2 MAJOR **not resolved**: e2e observes only client-side block, `toHaveCount(0)` races, rate-limit test self-assembles the options | CHANGES REQUIRED |

**ESCALATION: #192 → Opus 5 (high, fresh context) after 3 Terra tries**, per the hard ladder.
Production code cleared review at try 2; all three Terra failures on this ticket's tail were
test-DESIGN failures (asserting the harness instead of the production seam), not code failures.

Infra note (context, not model data): both advisory waves of 2026-07-30 (brace-expansion/tar,
then react-router 7.x fully covered by overlapping advisories) turned the npm-audit CI gate red
on all branches; driver remediated inline on `chore/audit-fix-brace-expansion-tar` (react-router
v8 migration, audit 0 vulns, client 186/186 green) — merge gate for all PRs was blocked on this,
not on any workhorse.

### Opus escalation round (#192)

| # | Ticket | Model | Try | Wall | Outcome |
|---|--------|-------|-----|------|---------|
| 10 | #192 | **Opus 5 high (escalation)** | 1 | 579s | Test-only fix, driver-verified green (server 51/51, client 19/19, typecheck, e2e node-check + `--list`). Asserted the PRODUCTION guard via call-through spy (not a reconstruction), mutation-tested its own tests (deleted options/rateLimitAck → red), and overrode the driver's suggested e2e burst shape with correct refill math (4 KB payloads ≈5 tokens so the limit actually trips; 30 short sends would race the 5/s refill). 93.1k tok, 39 tool uses. Sol round-4 verdict pending. |

### Merges + round 4 (#192)

- **MERGED:** #193 → PR #198, #194 → PR #199, #195 → PR #200 (squash, all checks green after
  the audit remediation PR #203 landed; PR #199's only CI hiccup was the known
  mongodb-binary cold-cache flake, passed on rerun).
- **#192 Sol round 4** (high, 134.5k tok, backgrounded run): round-3 MAJOR **resolved** —
  "production guard spy and behavioral test do exercise the real registered wrapper";
  2 new findings, both in the new e2e rate-limit test only: MAJOR (non-delivery assertion can
  false-pass because denial ack and broadcast race; wants ordered sentinel + exact-count),
  MINOR (recovery retry window 5s < client ack timeout 8s). Verdict CHANGES REQUIRED.
  → Opus resumed (context intact) with both findings; this is Opus try 2.

### Opus try 2 (#192, resumed) + driver re-verify

| # | Ticket | Model | Try | Wall | Outcome |
|---|--------|-------|-----|------|---------|
| 11 | #192 | Opus 5 high (resumed) | 2 | 245s | e2e-only fix, both round-4 findings addressed. New `sendUntilAccepted` helper polls a definitive per-send outcome (composer cleared OR send button re-enabled) for 15s > the 8s ack timeout; non-delivery proof reordered behind a post-recovery sentinel rendered on B, then exact `toHaveCount(1)` on the blocked draft. Made one sound judgment call: used button re-enablement instead of "rejection visible" as the retry signal because `chatError` persists across attempts (stale signal) — correct read of RoomPage state. 112k tok, 11 tool uses. |

Driver re-verify (wt-192, this session): `git status` still the same 10 modified files, no new
files; `node --check` e2e OK; typecheck exit 0 all workspaces; server 51/51; client ChatPanel
19/19; full read of the rewritten e2e region (lines ~160–250) — ordering argument and poll
windows check out. Sol round-5 dispatch next.

| Ticket | Round | Reviewer | Findings | Verdict |
|--------|-------|----------|----------|---------|
| #192 | 5 | Sol high (32.4k tok) | Round-4 MAJOR confirmed fixed ("sentinel establishes Socket.IO ordering before the exact-count assertion"). 1 new MINOR: `sendUntilAccepted` retries after an ambiguous 8s ack timeout — the timeout doesn't cancel the already-emitted event, so a delayed-ack-but-accepted send gets legitimately re-sent by the helper and the exact-count proof fails with two real deliveries. Wants retry only on definitive rejection; ambiguous timeout should fail the attempt, not resend. | CHANGES REQUIRED |

→ Opus resumed with the round-5 MINOR (Opus fix round 3; each round has fixed what it was
asked and the new findings are progressively narrower — round 5's is on round 4's new helper).

### Opus fix round 3 (#192) + driver re-verify

| # | Ticket | Model | Try | Wall | Outcome |
|---|--------|-------|-----|------|---------|
| 12 | #192 | Opus 5 high (resumed) | 3 | 256s | Retry decision in `sendUntilAccepted` made three-way: ok ack → accepted; rate-limit copy visible → safe retry (guard dropped the event); any other failure copy → record `ambiguousSettle`, return WITHOUT re-sending, then hard-fail via `expect(...).toBeNull()` after toPass. Freshness argued in-comment via React batching (ack callback writes chatError + clears pending in one batch, so the copy at settle belongs to this attempt — covers the stale-error recovery call site). Fails closed on unrecognized copy. 130.2k tok, 11 tool uses. |

Driver re-verify: same 10 files, node-check OK, typecheck rc=0, server 51/51, client 19/19;
read the new helper in full (lines 175–226) — the return-not-throw trick to stop toPass from
re-sending on ambiguity is correct, and the burst loop's ambiguous case fails via poll timeout
with no resend. Sol round 6 next.

| Ticket | Round | Reviewer | Findings | Verdict |
|--------|-------|----------|----------|---------|
| #192 | 6 | Sol high (31.1k tok) | None. Round-5 MINOR confirmed fixed ("only definitive server rejection triggers another emission… every other preserved-draft outcome fails closed"); freshness argument accepted as deterministic under React batching. | **READY TO MERGE** |

- **MERGED: #192 → PR #205** (squash 583b79b) after all checks green — incl. the new rate-limit
  e2e passing its first CI run on all three Playwright shards. Issue #192 auto-closed.
  Merge-triggered backend deploy succeeded (prune fix validated twice today); prod healthy on
  the chat-contract build (`{"ok":true}`).

### #196 dispatch (grok 4.5) — unblocked by #192 merge

| # | Ticket | Model | Try | Wall | Outcome |
|---|--------|-------|-----|------|---------|
| 13 | #196 long-message rendering | Grok 4.5 | 1 | ~370s | exit 0; claims TDD red-first, ChatPanel 34/34, client 209/209, typecheck pass. Driver verified: typecheck 0 errors, client 209/209 actual, 2 files touched (ChatPanel.tsx + test), scope discipline held (no CallNotifications/server/composer). Diff read in full: unconditional pre-wrap, 12-line `-webkit-line-clamp` when collapsed, per-message expansion Set on the stable message key, native-button toggle with aria-expanded, copy path untouched. |
| 14 | #196 fix round | Grok 4.5 (`-c` resume) | 2 | ~90s | **FAILED** — exited 0 mid-narration with no changes made (log truncated after "probing"; test untouched). First Grok dispatch failure of the run; `-c` session-resume with `--prompt-file` is the suspect combo. |
| 15 | #196 fix round retry | Grok 4.5 (fresh one-shot) | 3 | ~150s | Rewrote the keyboard test to pin native-button semantics (tagName BUTTON + focus + activation toggle, misleading keyDown removed) — user-event isn't in the workspace and jsdom doesn't synthesize Enter activation. Driver re-verified: ChatPanel 34/34 actual, diff hunk read. |

| Ticket | Round | Reviewer | Findings | Verdict |
|--------|-------|----------|----------|---------|
| #196 | 1 | Sol low (19.3k tok) | 1 MINOR: keyboard test's fallback click masks broken Enter activation (driver had spotted the same hole). Production code explicitly clean on all acceptance criteria. | CHANGES REQUIRED |
| #196 | 2 | Sol low (62.2k tok) | None — "pins the native button contract… without falsely claiming jsdom tested Enter handling". | **READY TO MERGE** |

(Driver-side note, repeat offense: one Sol dispatch lost 10 min to the heredoc+dispatch-in-one-Bash-call stdin bug — second occurrence this run; prompt build and codex dispatch MUST be separate calls.)

- **MERGED: #196 → PR #207** (squash c2cc1f5) after all checks green; issue #196 auto-closed.

### #197 dispatch (grok 4.5) — final ticket

| # | Ticket | Model | Try | Wall | Outcome |
|---|--------|-------|-----|------|---------|
| 16 | #197 clickable links | Grok 4.5 | 1 | ~500s | exit 0; claims TDD red-first (5 failing link tests), ChatPanel 40/40, client 215/215, typecheck pass, NO dependency added (hand-rolled tokenizer — ticket allowed either). Driver verified: typecheck 0 errors, client 215/215 actual, 2 files. Full diff read: URL-parser validation (http/https + dotted hostname — kills `https://javascript:alert(1)`-shaped candidates), boundary check before candidates, balanced-paren trailing-punct peel (Wikipedia URLs correct), React nodes only, composes with collapse, copy untouched. Tests assert behavior incl. inert schemes, punctuation splitting, links in both collapse states, raw-text copy. |
| 17 | #197 fix round | Grok 4.5 (fresh one-shot) | 2 | ~360s | Fixed both round-1 MAJORs as literally stated, real red-run evidence (3 tests failing for the right reasons), 46/46 + typecheck verified by driver. |
| 18 | #197 peel refactor | Grok 4.5 (fresh one-shot) | 3 | ~150s | Driver-spotted residual: slice-per-peel still O(n²) in char copies; Grok converted to index-based single-slice cleanly, 46/46 unchanged. |

| Ticket | Round | Reviewer | Findings | Verdict |
|--------|-------|----------|----------|---------|
| #197 | 1 | Sol high (23.1k tok) | 2 MAJOR: (1) `:`/`/` accepted as boundaries → `javascript:https://…` linkifies its tail (whole-token-inert contract violated) + comma-preceded real URLs rejected; (2) O(n²) trailing-paren peel via per-char full-candidate regex rescans. | CHANGES REQUIRED |
| #197 | 2 | Sol high (60.4k tok) | Paren fix confirmed O(n). 2 MAJOR remain: (1) smuggling through allowed punctuation — `data:text/plain,https://example.com`, `javascript:;https://…` (single-char boundary check can't express token-level inertness); (2) adjacent URLs merge — `,`/`;` allowed inside candidates → `https://one.example,https://two.example` becomes ONE anchor with hostname `one.example,https`. 1 MINOR: ASCII boundary whitelist rejects `>`/em-dash/smart quotes/`**`/`=` prefixes. | CHANGES REQUIRED |

**ESCALATION: #197 → Opus 5 (high, fresh context) after 3 Grok tries**, per the hard ladder.
Pattern echoes Terra on #192: Grok executed each literal fix competently (real red-first TDD
every round) but never re-derived the design — patching the boundary list where the invariant
("the whole whitespace-delimited token is inert if its scheme isn't allowlisted") needed a
token-level rule.

### Opus escalation rounds (#197)

| # | Ticket | Model | Try | Wall | Outcome |
|---|--------|-------|-----|------|---------|
| 19 | #197 | **Opus 5 high (escalation)** | 1 | 700s | Re-derived the design: candidate charset excludes `,;`; boundary inverted to a Unicode continuation-blocklist; token-level foreign-scheme guard with sticky poison flag + monotonic cursor. 15 new tests (11 red-first), no pre-existing test modified; also caught + fixed 2 pre-existing lint errors in Grok's code that would have gone CI-red (no-control-regex, no-useless-assignment). Driver verified: 61/61, typecheck 0, lint clean, guard logic read in full. 90.9k tok, 38 tool uses. |

| Ticket | Round | Reviewer | Findings | Verdict |
|--------|-------|----------|----------|---------|
| #197 | 3 | Sol high (dispatch retried once — first attempt rejected pre-send for control chars in the prompt) | Round-2 findings 2+3 confirmed fixed. 1 MAJOR: token poisoning only forward-looking — `https://ok.example,javascript:https://evil.example` emits the first anchor before the later foreign scheme is seen, and Opus's own regression test misses the surviving anchor. 2 MINOR: segment re-slicing keeps an O(n²) substring path; boundary reads one UTF-16 code unit so astral/combining-mark prefixes slip through. | CHANGES REQUIRED |

→ Opus resumed (context intact) with all three findings; Opus try 2 on #197.

| # | Ticket | Model | Try | Wall | Outcome |
|---|--------|-------|-----|------|---------|
| 20 | #197 | Opus 5 high (resumed) | 2 | 436s | Token-driven rework: whole-token sweep before any candidate links (bidirectional inertness), slice-free sticky-regex scheme checks, code-point-aware boundary + `\p{M}`. Produced red-run evidence by splicing the pre-fix implementation back (5 fail for the right reasons). Rewrote its own flawed regression test with justification (only pre-existing-test change). Driver verified: 66/66, client 241/241, typecheck 0, lint clean, token walk read in full. 124.6k tok. |

| Ticket | Round | Reviewer | Findings | Verdict |
|--------|-------|----------|----------|---------|
| #197 | 4 | Sol high (45.1k tok) | Round-3 findings confirmed fixed (sticky check sound, code-point boundary correct). 1 MAJOR: segment separators (`,;`) diverge from candidate terminators (quotes etc.) — `https://ok.example"javascript:https://evil.example` still leaks the first anchor (mid-segment foreign scheme never checked). 1 MINOR: per-token regex `lastIndex` reset re-scans the suffix per token → O(n²) on many-short-tokens-then-URL. | CHANGES REQUIRED |

→ Opus resumed with both; Opus try 3 on #197. Driver-supplied design constraints: segment
boundaries must equal candidate-terminator set; carried-match pattern for the rescan.

| # | Ticket | Model | Try | Wall | Outcome |
|---|--------|-------|-----|------|---------|
| 21 | #197 | Opus 5 high (resumed) | 3 | 340s | Separator set now equals the candidate-terminator set by construction (with an invariant comment tying them); carried-match + `exhausted` flag makes the scan single-pass (incl. the poisoned-token interaction, explicitly handled + pinned). Red-run 4 fail on round-3 code. Flagged its own new conservative false-positive class and a TS7022 the transpile-only test runner missed ("the test run alone doesn't cover the TS gate"). Driver verified: 72/72, client 247/247, typecheck 0, lint clean, carried logic read in full. 143.0k tok. |

| Ticket | Round | Reviewer | Findings | Verdict |
|--------|-------|----------|----------|---------|
| #197 | 5 | Sol high (43.2k tok) | None. Both round-4 findings confirmed fixed; carried-match state machine ruled correct on all probed axes; "overall scanning remains linear". | **READY TO MERGE** |

- **MERGED: #197 → PR #208** (squash f265a60) after all checks green; issue #197 auto-closed.

## Run complete — 2026-07-30

All six tickets merged: #192→PR205, #193→PR198, #194→PR199, #195→PR200, #196→PR207, #197→PR208.
Driver infra PRs: #203 (react-router v8 audit remediation), #206 (deploy ENOSPC prune fix).
Prod: backend deployed and healthy on the chat-contract build; #196/#197 ship via Vercel.
21 workhorse/escalation dispatches, 15 Sol review rounds, 2 escalations (both per the hard
3-try ladder, both landed by Opus 5), 0 merges without READY TO MERGE + green CI.

**PR #205 opened** (commit 3965e09, 10 files, +676/−63) — CI watch in progress; the new e2e
rate-limit test runs in CI for the first time on this PR (Playwright shards are the risk).

Infra notes (driver work, not model data):
- **PR #205 CI silently never triggered** — root cause: the branch (based pre-#193/#194/#203
  main) was CONFLICTING/DIRTY with main, and `pull_request` workflows build the merge commit,
  which didn't exist. Driver merged origin/main into the branch (one trivial additive conflict
  in ChatPanel.tsx: #192 composer guard + #193 copyFeedback state, kept both), full re-verify
  green (typecheck 0 errors, server 295/295, client 201/201, e2e node-check), pushed d61136c —
  CI triggered normally.
- **Prod deploy incident**: the #199-merge deploy (run 30553109392) failed on EC2 with ENOSPC
  mid image pull — prod stayed up on the old container. Root cause: releases are immutable
  tagged `:sha` images and the pipeline's `docker image prune -f` is dangling-only, so one
  image per deploy accumulated since the 2026-07-01 cutover. Direct SSH diagnosis was blocked
  by the permission classifier; fixed through the sanctioned channel instead — PR #206 adds
  `docker image prune -af` before the pull in deploy + rollback scripts (running last-good
  image is in-use → rollback target survives). Merged c442c9a after green CI; the merge-
  triggered deploy run validates the fix against the actually-full disk. This gated #192's
  merge: without it, Vercel would ship the ack-contract client while the backend deploy
  kept failing on the old contract.

## Qualitative observations

(one honest line per dispatch, written at the time)

- **Terra #192 t1:** genuinely strong first pass — adopted the ack union verbatim, replaced (not deleted) the old slice test, used distinct user-ids to dodge bucket carryover; but shipped classic security blind spots (destructuring crash vectors, text-only costing).
- **Terra #194 t1:** clean surgical deletion across 3 layers incl. tsconfig hygiene; kept interim accumulation internal exactly as specced. Best single dispatch of the run.
- **Terra #192 t2:** fixed all 4 findings faithfully and documented the clamp; good comment discipline.
- **Terra #192 t3 (failure):** did what the prompt literally said but missed its intent — wrote an e2e that never submits and a unit test that reconstructs the very options it should verify. Terra pattern across the run: excellent at building to spec, weak at adversarial test design against its own work.
- **Grok 4.5 #193 t1:** fastest coder (209s), real red-first TDD, self-aware report (flagged its own untested CSS reveal); missed async race conditions Sol caught.
- **Grok 4.5 #193 t2 (`-c` resume):** textbook fix round — strengthened the red test until it failed for the right reason before fixing.
- **Luna #195 t1+t2 (probe):** flawless scope discipline for a cheap model (explicitly declined to touch #194's overlay), correct TDD shape, even improved the test harness (mobile matchMedia variant); needed one nudge on inactive-state coverage. 155s+114s, ~108k tok total.
- **Opus 5 #192 escalation:** did what three Terra tries couldn't — asserted production wiring via call-through spy, mutation-tested its own tests, and corrected the driver's burst-shape suggestion with refill arithmetic. Escalation-only routing validated.
- **Sol (reviewer, context):** round-1 #192 high review was the run's highest-value single dispatch (crash-vector BLOCKER + 3 real MAJORs). Persistent and right across 3 rounds on the test-seam gap. Low-effort rounds (~60-90s) caught real races in #193. One overruled finding (#194 integration seam) was a spec-constraint conflict, not an error.

## Routing verdicts

(grounded in the dispatch/review record above; finalized after #197 reached READY TO MERGE)

### gpt-5.6-terra (high) — subject
Use for: well-specified multi-layer feature work where the spec is the contract — #194 (3-layer
surgical deletion, best single dispatch of the run) and #192 tries 1–2 (adopted a non-trivial
wire contract verbatim, fixed a 4-finding review round faithfully, incl. a BLOCKER).
Do NOT use for: the adversarial tail of security-sensitive work. Its #192 failure mode was
consistent across 3 tries: builds exactly what's asked, cannot design tests that attack its own
work (try 3 wrote an e2e that never submits and a unit test that reconstructs the thing it
should verify). Route Terra output through a strong reviewer, and budget the test-hardening
tail for Opus.

### grok 4.5 — subject
Use for: fast client-side feature work with genuine red-first TDD discipline — #193 (fastest
coder of the run, self-aware reporting), #196 (clean collapse feature, one test-quality nudge),
#197 initial (competent tokenizer + behavioral tests). Every fix round it executed, it executed
literally and correctly, with real red-run evidence.
Do NOT use for: security-invariant design. #197's escalation pattern mirrors Terra's: three
rounds of patching the boundary list without ever re-deriving the invariant (token-level
inertness), each patch closing the reviewer's exact payloads and nothing more — the ticket
then took Opus three further rounds to land, confirming the tail was genuinely hard, but Grok
never engaged it at the design level at all.
Operational note: `-c` session-resume with `--prompt-file` silently no-oped once (exit 0, no
changes, truncated narration) — prefer fresh one-shot dispatches with self-contained prompts.

### gpt-5.6-luna (medium) — subject (capability probe)
Use for: small well-fenced UI tickets — #195 was flawless on scope discipline (explicitly
declined to touch #194's overlay), correct TDD shape, and it even improved the test harness.
Needed exactly one nudge (inactive-state coverage). Cheapest useful tier confirmed; promote it
for more #195-class work.
Do NOT use for: anything multi-layer or adversarial — untested here, and nothing in this run
justifies extrapolating.

### Opus 5 (escalation-only) — context
Validated as the escalation terminal on BOTH escalations. #192: did what three Terra tries
couldn't (production-seam spy, mutation-tested its own tests, corrected the driver's burst-shape
math). #197: re-derived the linkifier design where Grok patched (token-as-unit-of-trust), and
uniquely among the run's coders produced red-run evidence by splicing the old implementation
back in, surfaced its own conservative false-positive classes unprompted, and caught a
TS-gate/test-runner coverage gap. Sobering nuance: even Opus needed three Sol rounds on #197 —
its first redesign had a real invariant hole (forward-only poisoning) hidden behind its own
green regression test. Adversarial review stays load-bearing at every tier.
Keep escalation-only: its wins were exactly on the design/adversarial tail where the
workhorses stalled, not on the bulk feature work they handled fine.

### gpt-5.6-sol (reviewer) — context
The run's decisive quality gate: crash-vector BLOCKER + padding-bypass on #192 round 1, the
e2e determinism chain (rounds 4–6), and the #197 security chain — five high-effort rounds each
finding a real, progressively subtler hole (boundary smuggling → token-level invariant →
bidirectional poisoning → separator/terminator divergence → clean), twice catching flaws that
the coder's own targeted regression test certified as fixed. High effort earns its cost on
security surfaces; low effort caught real races in #193 for ~90s/round. One overruled finding
all run (#194 integration seam vs locked spec constraint); zero hallucinated findings —
every CHANGES REQUIRED reproduced under driver scrutiny.
