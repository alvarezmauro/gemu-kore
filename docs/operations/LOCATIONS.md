# Location management

Task 6.1 implements the private location manager at `/app/locations`, linked from `/app`. It uses the existing Location schema and design system; no migration, dependency or environment change is required.

## Using the manager

- **Add location** creates a top-level place by default. **Add child** starts with that row as the parent.
- **Edit or move** changes the name, type, description or parent. Choosing **No parent (top level)** moves a place to the root. Its children and owned-item attachments keep their IDs and move with it.
- The arrow buttons move a location up or down among its siblings. New and moved locations are appended to their destination group; renaming preserves order.
- **Delete** is available only for a location without children or assigned items and requires confirmation. Move children and items elsewhere first; deletion never removes a subtree or silently unassigns items.
- Breadcrumbs show the current complete path, such as `Home / Office / Retro Cabinet / Shelf 2`. They update after an ancestor is renamed or moved.

Property, Room, Furniture, Shelf, Container and Custom describe a place. They do not impose nesting rules. Names are required, trimmed and limited to 200 characters; optional descriptions are trimmed and limited to 2,000 characters. Names are unique without regard to case within a parent, including top-level locations. Different parents can contain places with the same name.

Viewers can browse. Editors and administrators can manage locations. All location data and counts remain private; no public route queries this hierarchy. Assigning locations through collection-item forms belongs to those later tasks.

## Server and persistence boundaries

`features/locations/queries.server.ts` verifies the request identity and reads through the location service. The Server Action independently verifies request identity for every change, returns redacted feedback and revalidates the private page after a successful commit. The service validates strict input and reloads current permissions within the outer transaction; browser-supplied roles or identity objects confer no authority. UI visibility is not the permission boundary.

All application hierarchy mutations acquire the same transaction-scoped PostgreSQL advisory lock (GEMU / LOCA) before reading the tree. With Read Committed isolation, a waiting mutation sees the committed result of the preceding mutation. Ancestor validation then rejects self/descendant moves, including concurrent cross-moves. Reordering is atomic and normalizes the affected sibling group's positions, even after gaps or ties. Location types do not affect hierarchy validation.

Repositories own persistence only and receive the service's transaction. PostgreSQL computes `lower(btrim(name))`, so stored normalization matches the existing database constraint for non-ASCII names. Existing sibling/root unique indexes, self-parent checks, nonnegative ordering and restrictive child/item foreign keys remain authoritative. A conflicting move or rename rolls back as a whole; a concurrent item assignment cannot leave an orphan.

Edit, reorder and delete requests carry the location's `updatedAt` token. The service compares it after locking and uses a monotonically increasing millisecond timestamp for updates, so stale forms cannot overwrite newer changes. Child/item usage is always read afresh. On stale input, close the form, refresh and reopen it. A lost response asks the user to refresh before retrying because the commit may already have succeeded.

Paths are derived from parent IDs rather than persisted. Iterative traversal detects duplicate IDs, missing parents and disconnected cycles and fails closed with generic unavailable feedback. Direct SQL can still bypass application ancestor validation: the existing database self-parent constraint does not prohibit every multi-row cycle. Application hierarchy writes must use the service; no closure table or hierarchy migration is introduced.

## Interface and verification

The existing application shell, warm-paper tokens, buttons, dialogs and fields provide responsive layout and theme/reduced-motion support. Native labeled selectors handle type and parent choices; the parent selector omits the edited location and its descendants, while the server independently enforces that rule. The hierarchy is an ordinary list with indentation and full-path breadcrumb navigation, rather than an ARIA tree that would require a different keyboard interaction model. Indentation is capped visually on small screens, while full breadcrumbs preserve every ancestor. Actions remain visible without hover.

Saving disables duplicate submissions. Error feedback is announced and preserves entered values. Cancel restores focus, and destructive confirmation initially focuses Cancel. No animation library or drag-and-drop dependency is added.

Verification on 2026-10-04:

- **416 unit/component tests:** includes 22 new location cases for sorted/derived paths, corrupted and deep hierarchies, validation, viewer controls, move options, deletion confirmation, pending submissions, error recovery and retained form values.
- **226 isolated PostgreSQL integration tests:** includes 28 new cases for CRUD, permissions and changed grants/sessions, normalization and duplicates, atomic subtree moves, item attachment retention, restrictive deletion, sorting, stale changes, missing parents, rollback, corrupted hierarchy and concurrent cycle/duplicate prevention.
- **82 desktop/mobile Chromium tests:** 42 general checks and 40 authenticated checks using the existing disposable database, actual signed production cookies and loopback TLS. Location journeys cover CRUD/nesting, moves, reorder, descendant breadcrumbs, confirmation/focus, duplicate errors, demotion, stale tabs, viewer access, anonymous/public isolation and 320px long-name layouts in dark mode with reduced motion.

These **724** unit/integration/browser checks, lint, typechecking, formatting, production browser builds and whitespace checks pass. Asset-pipeline and storage suites are unchanged and retain their previous Task 5.4 verification; they are not included in this task's rerun total. Test fixtures never use development collection records. The existing nonfailing pg adapter deprecation and documented tooling advisories are unchanged. Next: Task 6.2 — Defects.
