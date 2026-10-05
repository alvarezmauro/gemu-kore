# Defect management

Task 6.2 adds private defect management at `/app/defects`, linked from the private entry page and workspace navigation. Defects belong to an owned `CollectionItem`, never a canonical game/release, console model or accessory variant. Copies of the same release have independent records. This task uses the existing schema; no migration, dependency or environment change is required.

## Using the manager

Choose an existing **Collection copy**, then **View copy**. The selector shows canonical identity and a short copy ID to distinguish identical copies without exposing unrelated notes or serial numbers. It supports owned consoles, games and accessories. An empty collection offers no detached defect creation or placeholder item; collection-item creation remains in its assigned phase.

Editors and administrators can add, edit and delete individual records. Viewers can read. Each record has a required title (up to 200 characters), optional description and repair note (up to 4,000 characters each), severity and status. Text is trimmed; empty or absent optional notes become null. Multiple defects are separate rows, even if they have similar titles.

| Severity | Meaning             |
| -------- | ------------------- |
| Cosmetic | Appearance only.    |
| Minor    | Limited impact.     |
| Major    | Significant impact. |
| Critical | Highest impact.     |

| Status   | Meaning                                                          |
| -------- | ---------------------------------------------------------------- |
| Active   | An unresolved problem. Default for new records.                  |
| Accepted | Acknowledged but still unresolved.                               |
| Repaired | Resolved; retains the defect record and optional repair details. |

Active, accepted and repaired counts are labeled separately. Unresolved includes active and accepted records. **No defects recorded** does not claim that the copy has been inspected or is defect-free. Missing release contents are a separate future component-presence concern.

Selecting Repaired records the server's save time as `resolvedAt`; editing an already repaired record preserves that date. The screen displays its UTC calendar date consistently across server and client rendering. Reopening it as Active or Accepted clears the current resolution date, as required by the SQL constraint. The form retains its repair note for the user to update. These are current-state records, not an immutable chronology of every repair/reopen event. No new history table is introduced. Delete explicitly removes the defect and repair details after confirmation; the confirmation suggests Repaired when the user wants to preserve a resolved record.

## Server boundaries and concurrency

The page and feature query verify request identity, enforce current `private.read` access and call the collection defect service. Read data uses a Repeatable Read snapshot so the selected copy revision matches its defect list. The DTO contains only copy labels, IDs/revision and the requested copy's defect fields. No public query or route is added.

Every Server Action independently verifies identity. The service validates a strict operation envelope, enforces current `collection.manage`, locks the owned root row, and checks permission again after waiting for that lock. Update/delete queries must find the defect under the supplied copy ID; a valid defect ID from another copy is rejected. Browser roles, publication choices, resolution dates and actor IDs cannot be supplied as authority or server-owned fields.

Forms capture the copy's revision when opened. Creation, editing and deletion require that revision, run in one outer Read Committed transaction, advance it once and record the verified user as `updatedById`. A revision compare-and-swap on the root is an additional safeguard. Concurrent stale changes and failures advancing the root roll back the defect change. Separate copies do not share a global defect lock. Future owned-item writers must preserve the aggregate revision convention.

If a copy is published and `PublicSettings.showDefects` is enabled, any defect mutation resets that copy to PRIVATE and clears its publication attribution for explicit review. This applies to both editor and administrator mutations, including repair and deletion. It does not depend on the global publication switch being currently on: an earlier approval must not silently cover replacement defect content later. When defects are confined to private fields (`showDefects=false`), their edits preserve the existing item publication choice. No publication-management or public display UI is implemented here.

Owned-root deletion cascades defects while preserving canonical catalog records and other copies. Component-specific targeting is deferred until physical component tracking exists.

## Interface and verification

The Server Component page uses the existing application shell, warm-paper tokens and a native labeled copy selector. Client forms compose the existing shadcn fields/dialogs and Radix destructive confirmation. Severity/status use visible labels rather than color alone. Cancel receives initial destructive-confirmation focus. Pending saves prevent duplicate submissions, errors preserve entered values and success is announced. A lost action response asks the user to refresh before retrying because the change may already have committed.

Verified on 2026-10-05:

- **439 unit/component cases**, including 23 new defect cases for normalization/defaults/bounds, strict server-owned fields, count semantics, unknown condition, viewers, structured copy-scoped submission, stable form revisions, retained errors, pending saves, confirmation and transport failure.
- **267 isolated PostgreSQL cases**, including 41 new defect cases for CRUD/severities, all owned types, copy/catalog isolation, narrow DTOs, repair transitions, scoped IDs, current grants/sessions, stale/concurrent changes, lock-wait permission revalidation, publication resets, cascade rules and transaction rollback.
- **98 desktop/mobile Chromium cases**: 44 general and 54 authenticated. New defect journeys cover empty states, multiple records, accepting/repairing, retained repair dates, deletion confirmation, copy selection/isolation, stale tabs, demotion with an open form, private/public boundaries and long content/forms at 320px in dark mode with reduced motion. Desktop and mobile screenshots were inspected.

These **804** unit/integration/browser checks, lint, typechecking, formatting, production browser builds and whitespace checks pass. Disposable fixtures use real signed sessions and the existing loopback TLS runner; they never add development collection records. Existing asset/storage suites are unchanged and retain their earlier verification; they are not included in this rerun total. The existing nonfailing pg adapter deprecation and documented tooling advisories remain unchanged. Next: Task 6.3 — Collection Media.
