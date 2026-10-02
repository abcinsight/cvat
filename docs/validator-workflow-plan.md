# CVAT 2.60.0 – Validator workflow: context & implementation plan

## Implementation status — 2026-10-02

Phases A–C are implemented. The remaining text below records the original plan and phase 0 context.

- Explicit job actions: `POST /api/jobs/{id}/submit`, `request_changes`, `approve`, and `reopen`.
  Submit requires an assigned validator and an annotation job in `new` or `in progress` state.
  Request changes requires an unresolved issue, increments `review_round`, and returns the job
  to `annotation/in progress`. Approval requires no unresolved issues and sets `acceptance/completed`.
  Reopen returns an accepted job to `annotation/in progress`, preserving its round number.
- GT jobs, consensus replicas, and consensus parent jobs are excluded. Jobs without validators retain
  manual stage/state behavior. For eligible jobs, a generic PATCH to `state=completed` is normalized to
  the same `submit` transition and permission scope, so older clients and every status selector produce
  `validation/new` and cannot create the inconsistent combination through the REST API.
- Workflow actions check OPA permissions and recheck after locking the task and job. PATCH and bulk
  assignment use the same lock order; issue creation/resolution locks the job during review decisions.
  Each transition emits an `update:job` server event after commit with actor, timestamp, action,
  previous/current stage/state, and round. Existing job-update webhooks continue to work.
- Job detail responses expose `workflow_permissions`; the annotation UI uses these for review buttons
  and workspace selection. Only users with Approve or Request changes permission enter Review workspace.
  After submission, annotators return to the task page; reopening the job displays a waiting-for-review
  screen instead of review tools. Validators who open a job before submission see a waiting-for-annotator
  screen. Returned jobs show the unresolved issue count and round,
  with resolved issues hidden initially. Job cards show the round; job filters include validator and
  review round plus “I am validator” and “Waiting for my review”.
- `POST /api/tasks/{id}/assign_validator` accepts `{ "validator": <user id or null>, "overwrite": false }`.
  It saves the task default and fills jobs without validators. `overwrite: true` replaces all annotation
  job validators. New non-consensus annotation jobs inherit the default. The task job list exposes this action.
- Migrations: `0100_job_review_round`, `0101_task_default_validator`, and
  `0102_submit_completed_jobs_for_review`, following phase 0 migration `0099`. Migration `0102` repairs
  existing eligible validator-assigned `annotation/completed` jobs to `validation/new`.
  The OpenAPI schema is regenerated. Core wrappers and SDK proxy methods (`Job.transition`,
  `Task.assign_validator`) are included; generated SDK clients come from the normal `cvat-sdk/gen/generate.sh` build.
- No new notification delivery or round-robin assignment was added (optional phases).
  Parent task/project visibility and quality-report access are unchanged; validators can enter assigned
  jobs from the jobs page without receiving broader task/project privileges.

Verification:

- Django system check and migration/model consistency check passed.
- Nine Django REST tests passed with an isolated SQLite database and mocked OPA transport.
  See `cvat/apps/engine/tests/test_job_workflow.py`.
- Seven OPA tests passed, including sandbox and organization role × stage × action matrices,
  cross-organization denial, admin/maintainer access, legacy editing, and PATCH bypass prevention.
  See `cvat/apps/engine/rules/tests/validator_workflow_test.rego`.
- Frontend development webpack build passed. Modified frontend files pass ESLint (existing warnings remain).
  The full TypeScript check reports errors throughout existing code; it is not a clean baseline.
- A full-stack REST/OPA integration test is added at `tests/python/rest_api/test_validator_workflow.py`;
  it requires the project's REST test stack and has not been run against a deployed service.
  PostgreSQL concurrency and interactive browser behavior have not been tested.
- No deployment or production database migration was performed. Rebuild the server/UI and restart OPA
  using the deployment procedure below to activate these changes.

---

Target workflow: **annotator → validator → (adjustments needed ? back to annotator : acceptance)**

Repo: `/Users/thanhninh/orca/projects/cvat-2.60.0` (not a git repo). Deployed via docker compose
(`docker-compose.yml` + `docker-compose.dev.yml`; images `cvat/server:v2.60.0`, `cvat/ui:v2.60.0`).
The environment where this was written had no Django/OPA installed, so **nothing below was executed or tested**.

---

## 1. Original problem

CVAT has a single `assignee` per job and permission rules ignored `stage`. Consequences:

- After the annotator marks a job `completed`, the admin must change stage to `validation` and re-assign
  the job to a validator; but the original assignee could still open the job and act as validator.
- Desired: assign a **validator in advance** (task/job level) so that when the annotator completes the job,
  the validator sees it and reviews it, then either sends it back to annotation or accepts it.

## 2. What is already implemented (phase 0, done in the code, untested)

### Backend
- `cvat/apps/engine/models.py`: `Job.validator` (FK User, null, `related_name="validated_jobs"`,
  `related_query_name="validated_job"`) and `Job.validator_updated_date`.
  `Project.is_job_staff` / `Task.is_job_staff` also consider validators.
- `cvat/apps/engine/migrations/0099_job_validator.py` (depends on `0098_data_local_storage_backing_cs`).
- `cvat/apps/engine/serializers.py`
  - `JobReadSerializer`, `SimpleJobSerializer`: `validator` (BasicUser) exposed; `validator_updated_date` in read.
  - `JobWriteSerializer`: `validator` (int, nullable) on create/update; update sets `validator_updated_date`.
  - `JobWriteSerializer.update`: **auto transition** – if `state == completed`, stage is `annotation`,
    job type is `annotation`, a validator exists, and the requester is not the validator
    → `stage = validation` (state resets to `new` via existing stage-change logic).
- `cvat/apps/engine/views.py` (`JobViewSet`): `select_related('validator')`; `validator` in
  `search_fields`/`filter_fields` and `lookup_fields` (`validator__username`).
- `cvat/apps/engine/permissions.py` (`JobPermission`): new scope `update:validator`
  (mapped from the `validator` field in PATCH), `UserPermission` view check for the validator id,
  and `get_resource()` now sends `validator` and `stage`. Issue/comment permissions send `job.validator`.
- `cvat/apps/iam/rules/utils.rego`: `UPDATE_VALIDATOR := "update:validator"`.
- `cvat/apps/engine/rules/jobs.rego`
  - `is_job_validator`, `is_job_active_assignee` (assignee AND `stage == "annotation"`),
    `is_job_active_validator` (validator AND `stage == "validation"`), `is_job_editor`
    (task staff | active assignee | active validator).
  - `is_job_staff` includes validator → view scopes work at any stage.
  - Edit scopes (`update:state`, `update:annotations`, `delete:annotations`, `import:annotations`,
    `update:metadata`) use `is_job_editor`.
  - `update:stage`/`update:state` additionally allowed for the validator at **any** stage (so the validator can
    approve / send back from the immediate review mode).
  - `update:assignee`/`update:stage`/`update:validator` for task staff / maintainers as before.
  - List filter includes `validator_id`.
- `cvat/apps/engine/rules/issues.rego`, `comments.rego`: validator counts as job staff
  (can view/create issues & comments); list filters include `job__validator` / `issue__job__validator`.
- `cvat/schema.yml`: `validator` added to `JobRead`, `JobWriteRequest`, `PatchedJobWriteRequest` (hand-edited, YAML validated).

### Frontend
- `cvat-core/src/server-response-types.ts`, `session.ts`, `session-implementation.ts`: `Job.validator` getter,
  `save({ validator })`.
- `cvat-ui/src/components/job-item/job-item.tsx`: **Validator** `UserSelector` on the task page job list.
- `cvat-ui/src/components/jobs-page/job-card.tsx`: shows Validator.
- `cvat-ui/src/actions/annotation-actions.ts` (`getJobAsync`) passes `isValidator`;
  `cvat-ui/src/reducers/annotation-reducer.ts`: `isReview = stage === VALIDATION || isValidator`
  → the assigned validator opens the **Review workspace immediately**, whatever the stage.

### Behaviour changes to remember
- Assignee can edit only in stage `annotation`; read-only in validation/acceptance.
- "Re-assign `assignee` to the validator" no longer grants edit; must use the Validator field.
- Jobs without a validator keep the old manual flow (admin changes stage).
- Known gap: UI does not make the workspace read-only for an assignee opening a job in validation; the API returns 403 on save.

### Deploy notes
- `backend_entrypoint.sh` runs `manage.py migrate` automatically at `cvat_server` start.
- Must rebuild `cvat_server` and `cvat_ui` images and restart `cvat_opa`:
  `docker compose -f docker-compose.yml -f docker-compose.dev.yml build cvat_server cvat_ui && ... up -d`
- At last check, running `cvat/server:v2.60.0` image was built 2026-03-17 and did **not** contain migration `0099`; no CVAT containers were running.
- Verify: `docker exec cvat_server python manage.py showmigrations engine | tail -3` should show `[X] 0099_job_validator`.

---

## 3. Gaps in the current workflow

| Step | Now | Problem |
|---|---|---|
| Annotator finishes | State `completed` → auto `validation/new` | "Submitted" not recorded; no history |
| Validator review | Opens review mode, creates issues | No explicit Approve / Request changes buttons; uses stage selector |
| Send back | Validator sets stage `annotation` via selector | Annotator isn't told; no reason; open issues not enforced |
| Accept | Stage `acceptance` set manually | Can accept with unresolved issues |
| Assigning | Per job only | Tedious for tasks with many jobs |

## 4. Target state machine

```
annotation/(new|in_progress) --annotator: Submit-->            validation/new
validation/(new|in_progress) --validator: Request changes-->   annotation/in_progress  (review_round += 1)
validation/*                 --validator: Approve-->           acceptance/completed
acceptance                   --task owner/admin: Reopen-->     annotation
```

Rules:
- **Submit**: requires a validator on the job; without one, fall back to the legacy behaviour.
- **Request changes**: must have ≥1 unresolved issue, otherwise HTTP 400. *(to confirm)*
- **Approve**: all issues of the job must be `resolved`. *(to confirm)*
- Every transition records actor, time and `review_round`.
- Exclude GT / consensus jobs from this flow (only `JobType.ANNOTATION`).

## 5. Work packages

### Phase A – Backend: explicit workflow
1. Endpoints: `POST /api/jobs/{id}/submit`, `/request_changes`, `/approve` (+ optional `/reopen`) in `JobViewSet`,
   each validating permission and preconditions in one place. Remove the implicit auto-transition from
   `JobWriteSerializer.update` once the endpoints exist (keep PATCH stage/state for admins).
2. `Job.review_round` (PositiveInteger, default 0) + migration `0100_*`; expose read-only in `JobReadSerializer`.
3. Enforce issue constraints (unresolved issues for request-changes, all resolved for approve) using `Issue.resolved`.
4. Emit events for each transition (CVAT events/analytics) so history is auditable.
5. Rego: new scopes `submit`, `request_changes`, `approve` (+ `reopen`) in `jobs.rego`, `utils.rego`, `JobPermission.Scopes`
   and `_get_scopes` mapping. Assignee: `submit` only at stage annotation. Validator: `request_changes` /
   `approve` at stage validation. Task staff/maintainers: all. This replaces the ad-hoc stage-based edits of phase 0.
6. Update `cvat/schema.yml` (or regenerate with the project's schema tooling) and the SDK if used.
7. Tests: OPA tests under `cvat/apps/engine/rules/tests` (role × stage × scope matrix) and REST API tests under `tests/python/rest_api` for the state machine.

### Phase B – Frontend
1. Annotation top bar, review mode: **Approve** and **Request changes** buttons (Approve disabled with tooltip while open issues exist).
2. Annotation top bar, annotation mode: **Submit for review** replacing the `completed` state menu item for jobs that have a validator
   (`cvat-ui/src/components/annotation-page/top-bar/annotation-menu.tsx`, `actions/annotation-actions.ts` around the `JobState.COMPLETED` handling).
3. Annotator opening a returned job: banner "N unresolved issues (round X)", issues list prefiltered to unresolved.
4. Make the workspace read-only for the assignee when stage ≠ annotation.
5. Jobs page: filters "I am validator", "Waiting for my review"; columns Validator and review round
   (`jobs-filter-configuration.ts`, `job-card.tsx`).
6. cvat-core: wrappers for the new endpoints (`server-proxy.ts`, `session.ts`, `session-implementation.ts`).

### Phase C – Bulk assignment
1. Task-level "Default validator" (field on Task or a bulk action) and "Assign validator to all jobs".
   New jobs / jobs without validator inherit it.
2. Optional: round-robin assignment across several validators.

### Phase D – Notifications (optional)
- Webhooks / notifications on submit and request-changes (CVAT already has webhooks and `update:job` events).

## 6. Risks
- **Backward compatibility**: legacy jobs without a validator must keep working with the manual flow; no data migration changes.
- **Concurrent edits**: annotator must not edit while the job is in validation (enforced in rego).
- **Quality-control rego** (`cvat/apps/quality_control/rules/quality_utils.rego`) has its own `is_job_assignee`; decide whether validators need access.
- **Task/project visibility**: validators see jobs via the jobs list; check they can open the parent task page if needed
  (task rules currently don't include job assignees/validators either).
- **No test environment** was available; set up Django + OPA (`opa test`) before/while doing Phase A.

## 7. Open questions (confirm with the product owner)
1. Must "Request changes" require ≥1 unresolved issue, or can the validator return a job without a reason?
2. Must Approve require all issues resolved?
3. After Request changes, should the annotator's state be `in_progress` or `new`?
4. Is task-level validator assignment (Phase C) needed now?
5. Are notifications (Phase D) needed?

Suggested order: A → B → C, then D if required.
