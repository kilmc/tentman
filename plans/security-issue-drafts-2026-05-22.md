# Security Issue Drafts 2026-05-22

These drafts are intentionally problem-focused. They describe the risk, scope, and questions to resolve without prescribing implementation.

## 1. Protect Tentman from repo-controlled preview template script execution

Labels:

- `security`
- `release-blocker`
- `needs-decision`

Body:

```md
## Summary

Review and address the trust boundary around repo-controlled content component preview templates in Tentman.

Tentman currently supports repo-defined content component preview templates such as `preview.njk`. That feature is important to the product, but it also means repo-controlled preview markup is being brought into the Tentman app experience itself. Before private release, we need a clear security understanding of what those templates are allowed to do, what assumptions Tentman is making about trusted repos, and what the blast radius is if a repo contains hostile or unexpected preview markup.

## Why This Matters

This is not just a normal rendering detail. Preview templates are part of the authoring experience, which means they run in a highly privileged context from the user’s point of view:

- the user may be authenticated to GitHub in the same app session
- the app can read and write repository content on the user’s behalf
- the feature is intended to render repo-controlled UI fragments inside Tentman itself

If the boundary here is too permissive, a malicious or compromised repo could affect the Tentman session in ways that go far beyond a broken preview.

## What Needs To Be Understood

- what content from `preview.njk` is considered trusted vs untrusted
- whether repo-controlled preview output can execute script or event handlers in the Tentman app context
- whether preview output can make same-origin requests as the authenticated user
- whether the current behavior is acceptable only for fully trusted repos, or whether Tentman intends a stronger safety boundary
- what product expectations we want around the feature before private release

## Acceptance Criteria

- the current preview-template trust boundary is documented clearly
- the actual risk of repo-controlled preview markup is understood and written down
- we decide whether the current behavior is acceptable for private release
- any material gap between the intended feature model and the actual security model is captured explicitly
```

## 2. Stop exposing the live GitHub bearer token directly to the browser session

Labels:

- `security`
- `release-blocker`

Body:

```md
## Summary

Review the current GitHub session model where Tentman keeps the active GitHub credential in browser-managed session state.

Tentman’s GitHub-backed workflow depends on an authenticated GitHub credential with broad repository access. Before private release, we need to treat the storage and handling of that credential as a first-class security concern and document whether the current model is appropriate for the product.

## Why This Matters

This credential is not just an app session identifier. It is the thing that gives Tentman the ability to read and write repository content on the user’s behalf.

If the browser-held session state is exposed, copied, replayed, or otherwise mishandled, the impact is not limited to Tentman state corruption. It can become direct repository access under the user’s identity.

## What Needs To Be Understood

- what exact GitHub credential Tentman stores during an authenticated session
- whether the browser is holding a raw bearer credential or a narrower app-specific session token
- how much repository access that credential carries in practice
- what the exposure model is if browser session data leaks
- whether the current approach matches the level of trust we want for private release

## Acceptance Criteria

- the current GitHub credential/session model is documented clearly
- the risk of browser-side credential exposure is evaluated explicitly
- we decide whether the current model is acceptable for private release
- any gap between the intended security model and the implemented one is recorded clearly
```

## 3. Validate draft asset uploads as server-owned writes rather than client-declared paths

Labels:

- `security`
- `release-blocker`

Body:

```md
## Summary

Review the security boundary around draft asset uploads in the GitHub-backed workflow.

Tentman supports draft asset staging so rich content editing can include uploaded images and similar files before publish. That feature is valuable, but it also creates a write path from browser-submitted metadata into repository files. Before private release, we need to understand exactly how much of that write intent is controlled by the server versus declared by the client.

## Why This Matters

Asset staging should feel like a constrained content workflow, not a generic repository file-write primitive.

If the server is trusting client-submitted file destination metadata too directly, a malformed or hostile request could potentially write files outside the intended asset area or create repository changes that do not correspond to a legitimate editor action.

## What Needs To Be Understood

- which parts of draft asset destination metadata are derived by Tentman versus supplied by the browser
- whether the server independently validates the final repository path for staged assets
- whether a crafted request could cause writes outside the intended asset storage location
- whether the current behavior matches the product expectation of “upload an image for this content” rather than “write an arbitrary file into the repo”

## Acceptance Criteria

- the draft asset write boundary is described clearly
- we understand whether client-submitted asset metadata can influence repository paths too broadly
- we decide whether the current behavior is acceptable for private release
- any material mismatch between intended asset workflow and actual write capability is captured explicitly
```

## 4. Constrain directory-backed content filenames to the intended content area

Labels:

- `security`
- `release-blocker`

Body:

```md
## Summary

Review how Tentman handles filenames for directory-backed content create, rename, preview, and delete flows.

Directory-backed content is a core authoring model in Tentman. Users and config-driven flows can influence filenames, and those filenames are then used to determine repository paths for content items. Before private release, we need to confirm that this remains a constrained content workflow and cannot escape the intended content directory.

## Why This Matters

Filename-driven content editing should only affect the content files that the configuration is supposed to manage.

If filename handling is too permissive, a crafted rename or create flow could potentially target unrelated files elsewhere in the repo. That would turn a content editor into a broader repository mutation surface than intended.

## What Needs To Be Understood

- what filename values are allowed from UI and request flows today
- whether filename and rename inputs are validated against the configured content directory
- whether path-like filename values can alter where Tentman writes, reads, or deletes files
- whether preview-time path handling and save-time path handling are equally constrained

## Acceptance Criteria

- the filename/path boundary for directory-backed content is documented clearly
- we know whether content filename inputs can escape the intended managed directory
- we decide whether the current behavior is acceptable for private release
- any material path-safety gap is captured explicitly
```

## 5. Define the trust model for repo-provided JavaScript adapters in local mode

Labels:

- `security`
- `release-blocker`
- `needs-decision`

Body:

```md
## Summary

Define and review the trust model for repo-provided JavaScript adapters in local mode.

Tentman’s local mode is meant to be powerful and flexible, including support for repo-defined adapter behavior. That is an important capability, but it also means code from the opened local repository may execute inside the Tentman app experience. Before private release, we need a deliberate statement of what trust level local mode assumes and what that means when the same browser session can also use GitHub-backed features.

## Why This Matters

Opening a local repository should not silently blur the line between “editing local content” and “running repo-provided code with access to the Tentman app environment.”

If local adapter execution is broad and automatic, an untrusted or compromised local repo could potentially interact with privileged app behavior in ways the user would not expect.

## What Needs To Be Understood

- what code from a local repository Tentman can execute today
- whether that execution is automatic as part of normal local-mode loading
- what access that code has to the app origin, session, and network requests
- whether local mode is explicitly intended to require fully trusted repositories
- whether that trust assumption is acceptable for private release and clear enough in the product

## Acceptance Criteria

- the local-mode adapter trust model is documented clearly
- the current execution boundary is understood and written down
- we decide whether the current behavior is acceptable for private release
- any mismatch between expected local-mode flexibility and actual security exposure is captured explicitly
```

## 6. Align documented and actual session/auth assumptions before private release

Labels:

- `security`

Body:

```md
## Summary

Review the gap between Tentman’s documented auth/session assumptions and the current implementation.

The current setup and deployment docs describe certain session-related expectations, but the app’s actual runtime behavior may not match those expectations exactly. Before private release, we should make sure operators and contributors are not relying on security assumptions that the app does not actually enforce.

## Why This Matters

Security problems are not only about vulnerable code paths. They also come from incorrect assumptions.

If documentation implies stronger session protection, stronger secret usage, or a different auth model than the app actually has, that can distort release decisions and reduce operator awareness of the real risk posture.

## What Needs To Be Understood

- which session/auth-related environment variables and docs imply security properties
- which of those properties are actually implemented today
- whether repo/session selection cookies and related state are protected to the degree the docs suggest
- whether logout and expiry behavior match the mental model the docs create

## Acceptance Criteria

- documented and actual session/auth behavior are compared directly
- any misleading or overstated assumptions are identified clearly
- we decide what is acceptable for private release versus follow-up work
- release decisions are based on the implemented security model, not the implied one
```

## 7. Audit release-readiness assumptions in GitHub draft/publish branch handling

Labels:

- `security`
- `integration`

Body:

```md
## Summary

Review the release-readiness and safety assumptions in Tentman’s GitHub draft/publish branch handling.

Tentman’s GitHub-backed workflow currently makes assumptions about the repository branch model that may be narrower than the product intends. Before private release, we should document those assumptions clearly and decide whether they are part of the supported workflow or a gap that needs to be addressed.

## Why This Matters

Branch-handling assumptions affect author trust and publish safety.

If Tentman implicitly assumes a particular default branch model, repos that differ from that expectation may behave incorrectly during draft creation, comparison, preview, or publish. Even if this is not a classic exploit, it is still part of the release security and reliability picture because it can lead to writing or merging against the wrong branch expectations.

## What Needs To Be Understood

- what branch assumptions the current workflow makes
- whether those assumptions are visible and explicit to operators
- which parts of the draft/publish flow depend on them
- whether the current behavior is acceptable as a constrained private-release assumption or whether it represents a real workflow safety gap

## Acceptance Criteria

- the current branch-model assumptions are documented clearly
- the impact of those assumptions on real repos is understood
- we decide whether they are acceptable for private release
- any material mismatch between intended GitHub support and implemented branch behavior is captured explicitly
```

## 8. Establish a browser, deployment, and dependency hardening baseline for private release

Labels:

- `security`
- `tech-debt`

Body:

```md
## Summary

Establish a clearer hardening baseline for Tentman’s browser surface, deployment configuration, and dependency posture before private release.

The focused code-path audit surfaced important app-level issues, but it also highlighted broader release-hardening questions around browser security policy, deployment headers, and dependency vulnerabilities. These should be tracked explicitly rather than left as background context.

## Why This Matters

Private release does not require a full public-launch security program, but it still needs a minimum hardening baseline that we can explain and defend.

Without that baseline, it is too easy to normalize missing browser protections, vague deployment assumptions, and known dependency issues as “later” work without ever deciding what is acceptable for `0.1.0`.

## Areas To Cover

- browser-facing security policy and app shell hardening
- deployment/runtime configuration hardening assumptions
- current dependency vulnerability posture and whether the known findings matter for Tentman’s release context
- which hardening gaps are release blockers versus follow-up work

## Acceptance Criteria

- the current browser and deployment hardening posture is documented clearly
- known dependency vulnerabilities are reviewed deliberately rather than left implicit
- we decide what minimum hardening baseline is required for private release
- the remaining hardening tasks are categorized clearly for release planning
```
