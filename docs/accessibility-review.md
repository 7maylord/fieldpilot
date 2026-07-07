# WCAG 2.2 AA review

Reviewed 2026-07-05 across landing, authentication, core office routes, and cached field routes.

- Axe scans enforce WCAG 2.0/2.1/2.2 A and AA with zero detected violations on ten representative routes.
- Keyboard focus is visible, navigation and forms use native controls, and workflows do not require pointer gestures.
- Form controls have programmatic labels; validation, connectivity, sync, update, and conflict feedback use text and appropriate status/alert roles.
- Field controls meet the project's large-touch-target styling, and offline/reload workflows remain keyboard operable.
- Status and priority include text labels rather than relying on colour alone.
- Shared blue, priority, tab, and navigation colours were darkened after the first audit detected contrast failures.

Automated evidence lives in `frontend/tests/e2e/accessibility-audit.spec.ts`; interaction evidence lives in `accessibility-smoke.spec.ts`.
