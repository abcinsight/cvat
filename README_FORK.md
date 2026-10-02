# CVAT Validator Workflow Fork

This fork is based on CVAT 2.60.0 and adds an explicit annotator-to-validator
review workflow plus an operational Jobs Board.

## Workflow

Ordinary annotation jobs with an assigned validator use this lifecycle:

```text
annotation/(new|in progress) --submit------------> validation/new
validation/*                 --request changes---> annotation/in progress
validation/*                 --approve------------> acceptance/completed
acceptance/*                 --reopen-------------> annotation/in progress
```

The explicit API actions are `submit`, `request_changes`, `approve`, and
`reopen`. They enforce permissions, state changes, and audit events together.
Requesting changes requires an unresolved issue; approval requires all issues
to be resolved.

## Jobs Board

Open the board at `/jobs?view=board`, or choose **Board** in the Jobs top bar.
It groups jobs into New, In progress, Awaiting review, and Accepted lanes;
legacy jobs appear in a lane only when present. The board provides per-lane
counts, shared search/filter/sort controls, previews, assignee/validator
details, and permission-aware drag-and-drop transitions.

The valid drag paths are:

| From | To | Action |
| --- | --- | --- |
| New or In progress | Awaiting review | Submit |
| Awaiting review | In progress | Request changes |
| Awaiting review | Accepted | Approve |
| Accepted | In progress | Reopen |

An accepted job must be reopened before it can be submitted for review again.

## Assignment behavior

Assigning an annotator to a task assigns that user to all existing jobs in the
task. Jobs generated afterwards, including consensus and ground-truth jobs,
inherit the task annotator. Clearing the task assignee intentionally preserves
existing job-level assignments.

## Local rebuild

From the repository root, rebuild the backend and UI images after source
changes, then recreate the two services:

```bash
docker build -t cvat/server:v2.60.0 .
docker build -f Dockerfile.ui -t cvat/ui:v2.60.0 .
CVAT_HOST=0.0.0.0 docker compose up -d --no-deps --force-recreate cvat_server cvat_ui
```

Hard-refresh the browser after the UI service has restarted.

## Verification

```bash
python manage.py test cvat.apps.engine.tests.test_job_workflow
docker run --rm -v "$PWD:/src:ro" openpolicyagent/opa:0.68.0 test \
  /src/cvat/apps/engine/rules/jobs.rego \
  /src/cvat/apps/engine/rules/tests/validator_workflow_test.rego \
  /src/cvat/apps/iam/rules/utils.rego \
  /src/cvat/apps/organizations/rules/organizations.rego
npx --yes @yarnpkg/cli-dist@4.9.2 workspace cvat-ui build
```

The local Python environment used for this workspace may require CVAT's full
development dependencies before the Django command can run.
