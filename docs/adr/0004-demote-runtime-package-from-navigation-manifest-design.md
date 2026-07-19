# Demote runtime package from navigation manifest design

`@tentman/runtime` is currently an internal workspace package with no observed consumers in the repo, so navigation manifest ownership will not be designed around preserving its parser shape. The migration may keep runtime tests passing through thin delegation, but the core/web implementation should treat runtime as optional cleanup territory and revisit whether the package should exist separately.
