This instruction fixture is intentionally kept with the core project fixture even
when a test does not assert against it directly.

The core fixture is copied as a complete Tentman project in integration-style
tests. Keeping one realistic instruction definition beside its templates helps
exercise project walking and copy behavior against the same optional directories
that a real Tentman project can contain.
