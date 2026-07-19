# Decide the implementation strategy

Type: grilling
Status: open
Blocked by: 04, 05, 06

## Question

Should Tentman's content-management architecture be stabilized by retrofitting the existing app, starting a parallel app from the ground up, or building a clean parallel foundation and migrating workflows through a strangler path?

## Evidence that counts as done

- Compare three strategies: direct retrofit, full parallel app rebuild, and parallel foundation/strangler migration.
- Use the collection group lifecycle findings, App Core/Content Source boundary decision, and reconciliation of existing work as evidence.
- Identify the smallest vertical slice that would prove the preferred strategy across local folder mode and GitHub-backed mode.
- Name which existing behavior must be preserved exactly, which behavior may be redesigned, and which behavior can be deferred.
- Evaluate risks specific to AI-agent implementation: hidden feature parity, unclear ownership, regression blast radius, testability, and future maintainability.
- Make explicit what would cause the team to abandon the chosen strategy and switch approaches.

## Resolution should decide

The implementation strategy that should shape the stabilization plan and first tracer-bullet implementation tickets.
