# Repository guidance

This workspace is a customized CVAT 2.60.0 tree. Preserve upstream CVAT behavior unless a change is
explicitly part of the validator workflow described below. The full design and implementation record is
in `docs/validator-workflow-plan.md`.

## Validator workflow

The supported lifecycle for ordinary annotation jobs is:

```text
annotation/(new|in progress) --submit------------> validation/new
validation/*                 --request changes---> annotation/in progress
validation/*                 --approve------------> acceptance/completed
acceptance/*                 --reopen-------------> annotation/in progress
```

- `Job.assignee` is the annotator; `Job.validator` is the reviewer. Do not reassign the annotator merely
  to grant review access.
- A task can have `default_validator`; newly created eligible jobs inherit it. The bulk assignment API is
  `POST /api/tasks/{id}/assign_validator` with `validator` and optional `overwrite`.
- Explicit job actions are `submit`, `request_changes`, `approve`, and `reopen`. Keep their validation,
  persistence, permission checks, and audit behavior consistent.
- Completing an eligible validator-assigned job through the generic job PATCH is intentionally normalized
  to submission. It must atomically become `validation/new` and use the `submit` permission scope. This
  compatibility path supports task/job status selectors and older clients.
- Requesting changes requires at least one unresolved issue and increments `review_round`. Approval requires
  all issues to be resolved. Reopening preserves the round number.
- Ground-truth jobs, consensus replicas, and consensus parent jobs are excluded from this workflow.
- Jobs without a validator retain CVAT's legacy manual state/stage behavior.
- Only a user with `approve` or `request_changes` workflow permission should enter the Review workspace.
  An annotator who reopens a submitted job gets a waiting screen; a validator opening before submission gets
  a waiting-for-annotator screen.

## Important files

- `cvat/apps/engine/job_workflow.py`: transition validation and audit event helper.
- `cvat/apps/engine/models.py`, `serializers.py`, `views.py`, `permissions.py`, and `signals.py`: persistence,
  REST actions, permission scope selection, bulk/default assignment, and inheritance.
- `cvat/apps/engine/rules/jobs.rego` and related issue/comment policies: OPA authorization.
- `cvat/apps/engine/migrations/0099_*` through `0102_*`: validator, review round, task default, and legacy-data repair.
- `cvat-core/src/session.ts` and `session-implementation.ts`: client workflow methods and fields.
- `cvat-ui/src/components/annotation-page/`: submission/review controls and waiting screens.
- `cvat/apps/engine/tests/test_job_workflow.py` and
  `cvat/apps/engine/rules/tests/validator_workflow_test.rego`: primary regression coverage.

## Development rules

- Treat stage, state, status, permission scope, and audit event as one transition. Do not update only one of
  these when changing the workflow.
- Recheck workflow authorization after locking the task and job. Preserve the task-before-job lock order.
- Do not make `review_round`, stage, or state indirectly writable as a way to bypass transition actions.
- Use backend-provided `workflow_permissions` in the UI instead of inferring authority from stage or user role.
- Preserve user changes in this workspace. At the time this customization was written, the directory did not
  have useful tracked Git state, so do not assume `git diff` can identify the complete local modification set.
- Add schema/core/UI changes together when changing API fields or actions. Generated SDK clients are updated
  through the normal `cvat-sdk/gen/generate.sh` workflow.

## Verification

For validator-related changes, run the narrow checks first, then broader checks where practical:

```text
python manage.py test cvat.apps.engine.tests.test_job_workflow
python manage.py check
python manage.py makemigrations --check --dry-run
ruff check <changed Python files>
```

Also run the validator Rego tests, ESLint on changed frontend files, and a frontend development build. The
full-stack test is `tests/python/rest_api/test_validator_workflow.py`; it needs CVAT's REST test stack and OPA.
The repository-wide TypeScript check has existing unrelated failures and is not a clean baseline.

## Deployment

No production deployment is implied by a source change. Apply Django migrations, rebuild `cvat_server` and
`cvat_ui`, and restart `cvat_opa`. Verify migration `0102_submit_completed_jobs_for_review` is applied; it
repairs eligible historical `annotation/completed` jobs to `validation/new`.
