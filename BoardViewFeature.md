# Board view for CVAT jobs

## Status and scope

This is an implementation proposal, updated on 2026-10-02 after reviewing the
current CVAT 2.60.0 tree and its validator workflow. No application code is
part of this proposal.

The first release is a **job board**. It lets administrators and validators
track jobs across tasks and projects; each card includes its task and project
context. It is not a second board whose cards are Tasks. A task-summary board
can be added later once its grouping and aggregation rules are defined.

The board will live at `/jobs?view=board`, with a List / Board switch in the
existing Jobs page top bar. This preserves the current `/jobs` filters,
browser history, organization scope, and navigation instead of adding a
competing global `/board` page or header menu.

## Findings from the current codebase

- `cvat-ui/src/components/jobs-page/` already owns the paginated Jobs list,
  search, sorting, filter builder, CSV export, job cards, and its SCSS.
  `cvat-ui/src/actions/jobs-actions.ts` and `reducers/jobs-reducer.ts` are
  the existing Redux pattern for this resource.
- The route `/jobs` is registered in `cvat-ui/src/components/cvat-app.tsx`.
  A job opens at `/tasks/:taskId/jobs/:jobId`, which the existing job card
  already uses.
- The job list already supports server-side `filter`, `search`, `sort`,
  `page`, and `page_size`, including filters for project, task, assignee,
  validator, stage, state, and review round. Results include task name,
  project name, frame range, assignee, validator, issue count, preview access,
  stage/state, and review round.
- `Job.transition()` in `cvat-core` exposes the explicit `submit`,
  `request_changes`, `approve`, and `reopen` endpoints. `Job.save({ state })`
  remains for legacy CVAT behavior, but must not be used to drive the
  validator workflow.
- Detail responses expose `workflow_permissions`; list responses intentionally
  return `{}` for this field. A board cannot use role or stage guesses for
  draggable cards, so it needs a list/board response that includes server-side
  transition capabilities.
- `cvat-ui/package.json` has `react-sortable-hoc`, but it only supports sorting
  within one collection and cannot report a cross-column source/destination
  move. Add `@dnd-kit/core` and `@dnd-kit/sortable`: they are maintained,
  TypeScript-first, accessible, modular, and support the required multi-column
  board. No additional UI library is needed.

## Workflow-safe board model

The original three state-only columns are not sufficient for this CVAT
customization: state `completed` has different meanings depending on stage,
and a validator-assigned completion must become `validation/new`. Likewise,
“Rejected” is not a validator-workflow state; Request changes returns a job to
`annotation/in progress` and increments `review_round`.

The default board therefore has these fixed lanes:

| Lane | Job stage/state | Meaning |
| --- | --- | --- |
| New | `annotation/new` | Ready for an annotator. |
| In progress | `annotation/in progress` | Annotation work. Cards returned by review show a **Changes requested** tag, unresolved-issue count, and review round here. |
| Awaiting review | `validation/*` | Submitted to the assigned validator. |
| Accepted | `acceptance/completed` | Approved work. |
| Other / legacy | Remaining visible jobs | Legacy manual statuses, rejected jobs, and excluded job types. This lane is read-only in the first release. |

The board initially shows ordinary annotation jobs and the Other / legacy lane
only when it has matching jobs. Ground-truth jobs, consensus replicas, and
consensus parent jobs never expose validator-workflow transitions.

Dragging is an action, not a field update. The only allowed cross-lane drops
are below; every other destination is disabled before the drop and remains
enforced by the API.

| From | To | API action | Server precondition |
| --- | --- | --- | --- |
| New or In progress | Awaiting review | `POST /api/jobs/:id/submit` | Assigned validator and `submit` permission. |
| Awaiting review | In progress | `POST /api/jobs/:id/request_changes` | `request_changes` permission and at least one unresolved issue. |
| Awaiting review | Accepted | `POST /api/jobs/:id/approve` | `approve` permission and no unresolved issues. |
| Accepted | In progress | `POST /api/jobs/:id/reopen` | `reopen` permission. |

This means “Rejected” is deliberately not a lane in the validator board.
Legacy rejected jobs remain visible in Other / legacy. A later, explicitly
scoped legacy-status board could support generic state updates after it adds
per-card `update:state` permission data; it is not included in this release.

## User experience

- Reuse the Jobs page's filter builder and URL query. Board-specific quick
  filters add **I am validator** and **Waiting for my review**; the existing
  project, task, assignee, validator, stage, search, and review-round filters
  remain available.
- Each column has its title, server-provided total, vertically scrollable card
  list, per-column “Load more” control, loading state, and error/retry state.
  Fetch each lane independently with a fixed page size (for example 25), so a
  large review queue never loads all jobs at once.
- A card shows job ID, task (and project when present), assignee avatar/name,
  validator name, stage/state tag, frame count, review-round and unresolved-
  issue tags, plus a lazily loaded preview. Clicking its non-drag area opens
  `/tasks/:taskId/jobs/:jobId`; modifier-click keeps the current Jobs behavior
  of opening a new tab.
- A draggable card has a clear drag handle. Cards with no permitted
  destination retain the handle in a disabled state and explain why in a CVAT
  tooltip. Drop targets advertise only legal destinations.
- The UI makes an optimistic lane move, marks the card pending, calls the
  matching `Job.transition()` action, and replaces it with the returned job.
  On failure it restores the prior card and lane, shows the existing Redux
  notification pattern, and refreshes the affected lanes because an issue or
  concurrent transition may have changed server state.
- No user role is inferred from stage, assignee, or validator. The server
  supplies the capability map and remains authoritative at transition time.
- Use Ant Design `Card`, `Tag`, `Avatar`, `Badge`, `Spin`, `Empty`, and CVAT
  tooltip components. SCSS follows the existing `jobs-page/styles.scss` base
  variables, supports existing dark/light theming, keeps columns horizontally
  scrollable on narrow screens, and raises the active card while dragging.

## API and authorization design

The current generic `GET /api/jobs` is adequate for filtering and pagination,
but not for board capabilities: list serialization deliberately omits
`workflow_permissions`. Do not hydrate every card with `GET /api/jobs/:id`.
That would create N+1 REST requests. The board-specific OPA decision returns
all four capabilities in one evaluation per returned card instead of one OPA
call per action.

Add a board-specific read endpoint, for example:

```
GET /api/jobs/board?lane=annotation_new&page=1&page_size=25&filter=...&search=...&sort=...
```

It must:

1. Apply the same organization and `JobPermission` list filter as `GET
   /api/jobs`, then combine the user filter with the server-owned lane
   predicate. The client must not be trusted to define a lane predicate.
2. Return a normal paginated `{ count, results }` response for one lane.
   Requests for the four workflow lanes (and Other / legacy when selected) run
   in parallel; their individual `count` values are the column badges and
   pagination boundaries.
3. Use a compact `JobBoardSerializer` with exactly the card fields and
   `workflow_permissions` for `submit`, `request_changes`, `approve`, and
   `reopen`. Keep the normal list serializer unchanged for performance and
   backwards compatibility.
4. Compute the capability map through a purpose-built OPA decision that
   returns all four workflow actions for one job in one authorization request,
   not four or five independent `check_access()` calls per card. Add the
   matching Rego rule and Python permission helper. The four POST transition
   endpoints continue to recheck authorization under the existing task-then-
   job lock order.
5. Document the endpoint and schema in `cvat/schema.yml`, then regenerate the
   SDK through `cvat-sdk/gen/generate.sh`; add the core proxy and typed
   `cvat.jobs.getBoard()` wrapper.

There is no database migration and no new persisted board state. Column
membership is derived from existing stage, state, type, parent/replica status,
validator, and review round. Card ordering follows the requested server sort;
dragging within one column does not persist a custom order.

## Implementation plan

1. **Confirm the API contract and lane semantics.** Add backend unit tests for
   lane membership, combined filter behavior, per-lane pagination/counts,
   OPA capability maps, cross-organization denial, and exclusion of
   ground-truth/consensus jobs from workflow actions. Update the OpenAPI schema
   before frontend work.
2. **Implement the board read path.** In `cvat/apps/engine/views.py`, add the
   collection `board` action and server-owned lane predicates. In
   `serializers.py`, add `JobBoardSerializer`; in `permissions.py` and
   `rules/jobs.rego`, add a batched workflow-capability decision. Reuse the
   existing queryset prefetch and list authorization path. Add Django/OPA
   regression coverage beside the validator-workflow tests.
3. **Expose it through core.** Update `cvat/schema.yml`, run
   `cvat-sdk/gen/generate.sh`, then update `cvat-core/src/server-proxy.ts`,
   `server-response-types.ts`, `session.ts`, and `session-implementation.ts`
   with typed board query and response support. Keep `Job.transition()` as the
   only workflow mutation API.
4. **Add Redux board state.** Create `actions/job-board-actions.ts` and
   `reducers/job-board-reducer.ts`, register its types/root reducer in
   `reducers/index.ts`, and write selectors. Store per-lane pages, counts,
   loading/errors, query, and optimistic transition snapshots. Keep filters in
   the URL and do not store server job data in localStorage. Reuse the current
   Jobs actions only where their behavior fits; do not make the list and
   independent board lanes overwrite one another.
5. **Build the Jobs board UI.** Add `components/jobs-page/board/` containing
   `board-page.tsx`, `board-column.tsx`, `board-card.tsx`,
   `board-filters.tsx`, and `styles.scss`. Add the List / Board switch to
   `jobs-page/top-bar.tsx` and render either existing `jobs-content.tsx` or
   the board based on the URL. Add `@dnd-kit/core` and `@dnd-kit/sortable` to
   `cvat-ui/package.json` and `yarn.lock`.
6. **Wire transitions and failures.** Map each legal drop to
   `job.transition(action)`, perform the optimistic reducer update, and use
   the returned server record to settle it. Reject no-op/illegal drops in the
   UI, preserve keyboard accessibility, and rollback/refetch after any failed
   action. Do not use `job.save({ state })` for validator-assigned jobs.
7. **Test and verify.** Add frontend tests for lane assignment, disabled
   destinations, legal drop/action mapping, optimistic success, and rollback.
   Run the validator Django and Rego tests, API tests for board data and
   transitions, frontend ESLint, and a development build. Check desktop,
   narrow viewport horizontal scrolling, light/dark themes, a validator, an
   admin, an annotator, and a user without transition permissions.

## Expected files

Likely additions are the board UI directory, board Redux action/reducer tests,
backend board endpoint tests, and OPA tests. Likely modifications are
`cvat/apps/engine/views.py`, `serializers.py`, `permissions.py`,
`rules/jobs.rego`, `cvat/schema.yml`, generated SDK output, the CVAT core job
API files, `cvat-ui/package.json`, `yarn.lock`, the root reducer, and the
existing Jobs page/top-bar/style files.

The exact generated SDK file list should be taken from the normal generator
output rather than maintained manually.
