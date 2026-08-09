# Defect management — design

**Date:** 2026-08-07
**Status:** approved, not implemented
**Requirements covered:** FR-DEF-001..005, FR-INSP-005, FR-SYNC-005

---

## 1. Why this work exists

The defect backend is complete and tested — state machine, assignments,
corrections, verifications, status events, capability gating. No screen anywhere
in the product creates, lists, or acts on a defect. The only frontend references
to "defect" are a role-description string and unused offline plumbing.

So FR-DEF-001 through 005 are unreachable by any user, and the PRD's stated
differentiator "construction-oriented inspections and defect workflows" does not
exist from a customer's point of view.

### Finding 1 — a live silent data-loss bug (fix first)

`defect_create` is already listed in **both** `supportedOperations`
(`backend/src/sync/sync.service.ts:35`) and `appendOperations`
(`backend/src/sync/conflict-strategy.ts:4`). A pushed `defect_create` therefore:

1. passes the allowlist check,
2. gets `syncOutcome()` → `auto_merged`,
3. matches **no apply branch** — every write is conditioned on `workOrder` or
   `inspection`,
4. falls through to `storeOutcome(..., 'auto_merged')` and is recorded as a
   success.

`grep -c "tx.defect\." backend/src/sync/sync.service.ts` returns **0**. No defect
row is ever created. The client receives `auto_merged`, marks its local draft
synced, and the record is gone.

`asset_create` has the identical shape (`tx.asset` writes: 0). It is out of scope
here but must not be left unexamined — see §9.

This means the sync work below is not a new feature on a new path. It is
completing a path that already reports success while losing data.

---

## 2. Scope

**In scope (v1)**

| Surface | Capability | Online/offline |
| --- | --- | --- |
| Raise a defect | `defects.create` (all roles except `viewer`) | **Offline**, auto-merged |
| Attach photo when raising | — | **Offline**, via `media_append` |
| Raise from a failed inspection item | `defects.create` | **Offline** |
| "My defects" list | — | Offline read of local + synced |
| Office queue, filters | — | Online |
| Triage / transitions | `defects.create` | Online |
| Assignment | `defects.assign` | Online |
| Corrections | `defects.create` | Online |
| Verification, closure | `defects.verify` | Online |

**Out of scope (v2)**

- Offline transitions, corrections, or verification. Only `defect_create` is
  accepted by the sync path; every other defect operation type is explicitly
  rejected.
- Defect dependencies or bulk actions.
- `asset_create` (same bug, separate feature — §9).

**Decisions taken during design**

1. Office and field ship together; the sync protocol is extended.
2. Offline is limited to creation. Version-carrying actions stay online so v1
   introduces no new conflict semantics on a state machine.
3. Entry points are standalone **and** from a failed inspection item, with photo
   capture in both.

---

## 3. Architecture

Backend gains no new endpoints. Every office action already has one:

```
GET    /organizations/:orgId/defects
POST   /organizations/:orgId/defects
POST   /organizations/:orgId/defects/:defectId/transitions
POST   /organizations/:orgId/defects/:defectId/assignments
POST   /organizations/:orgId/defects/:defectId/corrections
POST   /organizations/:orgId/defects/:defectId/verifications
```

New frontend files:

```
app/(office)/[organizationSlug]/defects/page.tsx   office route
app/(field)/field/defects/page.tsx                 field route
components/defects-screen.tsx                      office queue + detail
components/field-defect-capture.tsx                field raise form + my defects
lib/defect-status.ts                               shared vocabulary
```

Navigation: `Defects` joins the **Execute** group in `officeNav` and the
**On site** group in `fieldNav` (`components/app-shell.tsx`).

`components/office-domain-screens.tsx` is already 981 lines holding several
screens and must not be extended. Defects live in their own file. No refactor of
the existing file is proposed — this only avoids making it worse.

### Shared vocabulary, separate layouts

Office and field share `lib/defect-status.ts` — status labels, severity labels,
allowed transitions, colour mapping — and nothing else. The two layouts stay
independent because the contexts differ: a dense triage queue at a desk versus a
large-target form used with gloves in sunlight.

Sharing the vocabulary is not optional. A defect showing "Ready for
verification" in the office and "Awaiting check" in the field destroys trust in
the record.

---

## 4. Data flow — raising a defect offline

```
submit
  -> defectDrafts (local, syncState 'pending')
  -> pendingOperations {
       entityType: 'defect',
       operationType: 'defect_create',
       entityId: <client-generated UUID>,
       baseVersion: null,
       payload: CreateDefectDto shape
     }
  -> photos -> mediaRecords + media_append operations
  -> push
  -> syncOutcome('defect_create', ...) => 'auto_merged'      [already built]
  -> NEW apply branch: create the Defect row                 [to build]
  -> local record marked 'synced'
```

**The client generates the defect UUID and the server honours it as the row id.**
This is required, not cosmetic: media links and the inspection link are written
against that id before the push happens. A server-assigned id would orphan them.
It also makes replay naturally idempotent.

---

## 5. The sync apply path

Deliberately narrow. In `applyOperation` in `backend/src/sync/sync.service.ts`:

- Handle `entityType === 'defect'` with `operationType === 'defect_create'` only.
- Any other defect operation type returns
  `storeOutcome(..., 'rejected', { rejectionCode: 'UNSUPPORTED_OPERATION' })`.
  Never silently dropped, never reported as merged.
- Validate the payload with the existing `CreateDefectDto` rules. No parallel
  validation path that can drift from the REST endpoint.
- Re-check `defects.create` server-side for the pushing user. The client-side
  capability check is UX only.
- Verify `projectId` belongs to the pushing organization before insert.
- Idempotency uses the existing `syncOperation.clientOperationId` dedupe at
  `sync.service.ts:408`. Nothing new is introduced.
- Insert with `id: operation.entityId` and `status: 'reported'` (the schema
  default and the correct pre-triage landing state).

Rejection codes surfaced to the client: `UNSUPPORTED_OPERATION`,
`ENTITY_NOT_FOUND` (unknown project), `FORBIDDEN` (capability lost since
capture), `VALIDATION_FAILED`.

---

## 6. Office surface

**Queue.** Defaults to a "Needs action" view — `reported`, `triaged`,
`ready_for_verification` — because those are the states waiting on the office.
Filters for status, severity, and project. Sorted by severity then age.

**Detail.** Header carries title, severity, status and the source link (the
inspection or work order it came from, when present). The action bar is derived
from `defect-status.ts` allowed transitions and gated by capability:

- `defects.assign` → assignment control
- `defects.verify` → verification control
- `defects.create` → transitions and correction submission

Correction history renders root cause, corrective action, and linked evidence in
reverse-chronological order.

**Concurrency.** Every action sends `version`. A 409 renders as *"This defect
changed while you were looking at it"* with a reload action. The stale payload is
never retried automatically and never overwrites.

---

## 7. Field surface

**Raise form.** Title, category, severity, description, photo. Site and location
prefill from the current field context. Large touch targets per the existing
field screens.

**From a failed inspection item.** When an item is marked failed in
`components/offline-inspection-form.tsx`, offer to raise a defect. Pre-fills
`inspectionId`, `projectId`, `locationId`, and seeds the title from the item
label. This is FR-INSP-005 and is the reason inspections and defects exist
together.

**My defects.** Locally raised plus assigned, showing sync state in the existing
datum language — pink means still held on this device.

---

## 8. Error handling

- Capture never blocks on network. The local write always happens first.
- A rejected push surfaces in the existing conflicts screen with the entry
  preserved and readable. Per FR-SYNC-005 the captured content is never
  discarded, whatever the rejection reason.
- Photo upload is independent of the defect record. The defect exists and is
  actionable while its evidence is still uploading; a failed upload never rolls
  back the defect.
- Office 409s prompt a reload rather than merging blindly.
- A defect whose push is rejected stays visible locally, flagged, until the user
  acts on it.

---

## 9. Testing

**Parity test (highest value).** `defect-status.ts` and
`backend/src/defects/defect-state.ts` are two state machines that must agree. A
unit test asserts the client transition table matches the server table exactly.
Without it they drift and the UI offers actions the server rejects.

**Sync integration tests.**

- Push `defect_create`; assert a defect row exists with the client-supplied id.
- Replay the same `operationId`; assert `already_applied` and exactly one row.
- Push with `defects.create` withheld; assert `rejected` / `FORBIDDEN` and no row.
- Push a defect operation type other than `defect_create`; assert `rejected` /
  `UNSUPPORTED_OPERATION`.
- **Regression guard for Finding 1:** assert a `defect_create` push can never
  return `auto_merged` without a corresponding row.

**e2e.** `tests/e2e/launch-journey.spec.ts` already drives the full defect
lifecycle through the API. Convert those steps to UI interactions; no new
fixtures needed.

**Accessibility.** Add `/:org/defects` and `/field/defects` to
`tests/e2e/accessibility-audit.spec.ts`.

**Sibling bug.** `asset_create` has the identical defect (in both operation sets,
`tx.asset` writes: 0). Out of scope here. It should get its own issue, and the
regression guard above should be written so the same test shape can be reused
for assets.

---

## 10. Open risks

- Extending `sync.service.ts` touches the highest-risk module in the product.
  Mitigated by accepting exactly one new operation type and rejecting everything
  else explicitly.
- The client-supplied id contract must hold. If a future change makes the server
  assign ids, offline media links break silently. The integration test asserting
  the client id survives is the guard.
- Field crews can raise defects but not triage them. If capture proves easy and
  triage stays office-only, queues may grow faster than they are worked. Worth
  watching after release rather than designing for now.
