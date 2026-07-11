# Tentman

Tentman manages repository-backed content configuration, editing, and publication metadata.

## Language

**Navigation Manifest**:
A versioned JSON document that records manual navigation order and grouping for top-level content and collections.
_Avoid_: Navigation config, menu config, ordering file

**Navigation Reference**:
A stable reference from a navigation manifest to a content config, collection item, or group member.
_Avoid_: Manifest item, nav id, ordering id
