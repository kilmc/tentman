# Tentman

Tentman manages repository-backed content configuration, editing, and publication metadata.

## Language

**Navigation Manifest**:
A versioned JSON document that records manual navigation order and grouping for top-level content and collections.
_Avoid_: Navigation config, menu config, ordering file

**Navigation Reference**:
A stable reference from a navigation manifest to a content config, collection item, or group member.
_Avoid_: Manifest item, nav id, ordering id

**Content Source**:
The backing place Tentman reads content from and writes content changes to, such as a local repository, GitHub repository, or future GitLab repository.
_Avoid_: sync source, backend, provider, storage mode

**Editing Source**:
The Web App's user-facing durable editing space for a Tentman-managed site. It lets non-technical administrators edit what they experience as "their website" while Tentman syncs those edits with the Content Source in the background.
_Avoid_: Browser working copy, local copy, browser copy

**Saved**:
A Web App editing state meaning a user's changes are durably recorded in the Editing Source and should survive reload, even if they have not yet synced to the Content Source.
_Avoid_: Synced, published

**Syncing**:
A Web App editing state meaning Saved changes are currently being reconciled with the Content Source.
_Avoid_: Committing, pushing, cache refresh

**Synced**:
A Web App editing state meaning Editing Source changes have been confirmed by the Content Source. In GitHub-backed mode, synced means the changes have reached Tentman's managed draft branch or repository state, not that they are published live.
_Avoid_: Published, deployed, live

**Unsynced**:
A Web App editing state meaning changes are Saved in the Editing Source but have not yet been confirmed by the Content Source.
_Avoid_: Unsaved, lost, cache-only

**Needs Attention**:
A Web App editing state meaning Tentman cannot automatically sync or reconcile the Editing Source with the Content Source and needs user action, while preserving the user's Saved Editing Source changes.
_Avoid_: Failed, broken, lost

**Offline**:
A Web App editing state meaning the Editing Source remains editable while the Content Source is unreachable; changes can still become Saved and later sync when connectivity returns.
_Avoid_: Disconnected cache, unavailable app

**Published**:
A Web App publishing state meaning synced changes have been promoted into the site's live branch or deployment path, such as merging a GitHub draft branch into main.
_Avoid_: Synced, saved

**Domain Core**:
The shared package-level Tentman domain layer used by the web app, CLI, and future surfaces for portable content rules and semantics.
_Avoid_: Tentman core, system core, shared core

**App Core**:
The web app's source-independent workflow layer where UI actions become mutation intents and results before Content Source adapters persist them.
_Avoid_: Web core, web app core, workflow core
