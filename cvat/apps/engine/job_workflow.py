# Copyright (C) CVAT.ai Corporation
# SPDX-License-Identifier: MIT

from rest_framework.exceptions import ValidationError

from cvat.apps.engine.models import JobType, StageChoice, StateChoice


def is_submit_update(job, data):
    """Return whether a generic job update expresses submission for review."""
    validator_id = data.get("validator", job.validator_id)
    completion_requested = data.get("state") == StateChoice.COMPLETED or (
        "validator" in data and job.state == StateChoice.COMPLETED
    )
    return (
        completion_requested
        and data.get("stage", job.stage) == StageChoice.ANNOTATION
        and validator_id is not None
        and job.type == JobType.ANNOTATION
        and job.parent_job_id is None
        and not job.child_jobs.exists()
    )


def transition_data(job, action, *, has_open_issues, validator_id=None):
    """Validate a transition against the locked job and return serializer fields."""
    if job.type != JobType.ANNOTATION or job.parent_job_id or job.child_jobs.exists():
        raise ValidationError("Review workflow is only available for non-consensus annotation jobs")

    expected_stage = {
        "submit": StageChoice.ANNOTATION,
        "request_changes": StageChoice.VALIDATION,
        "approve": StageChoice.VALIDATION,
        "reopen": StageChoice.ACCEPTANCE,
    }[action]
    if job.stage != expected_stage:
        raise ValidationError(f"{action} requires the {expected_stage} stage")

    if action == "submit":
        # COMPLETED is accepted to repair jobs produced by older clients that
        # updated state without advancing the stage.
        if job.state not in (StateChoice.NEW, StateChoice.IN_PROGRESS, StateChoice.COMPLETED):
            raise ValidationError("Only new or in-progress jobs can be submitted")
        if not (validator_id if validator_id is not None else job.validator_id):
            raise ValidationError("Assign a validator before submitting for review")
        return {"stage": StageChoice.VALIDATION, "state": StateChoice.NEW}
    if action == "request_changes":
        if not has_open_issues:
            raise ValidationError("Create an unresolved issue before requesting changes")
        return {"stage": StageChoice.ANNOTATION, "state": StateChoice.IN_PROGRESS}
    if action == "approve":
        if has_open_issues:
            raise ValidationError("Resolve all issues before approving this job")
        return {"stage": StageChoice.ACCEPTANCE, "state": StateChoice.COMPLETED}
    return {"stage": StageChoice.ANNOTATION, "state": StateChoice.IN_PROGRESS}


def record_transition(job, action, request, previous):
    """Write the workflow-specific audit payload after the transaction commits."""
    from cvat.apps.events.event import record_server_event
    from cvat.apps.events.handlers import request_info

    record_server_event(
        scope="update:job", request_info=request_info(), on_commit=True,
        job_id=job.id, task_id=job.segment.task_id,
        project_id=job.segment.task.project_id, org_id=job.segment.task.organization_id,
        user_id=request.user.id, user_name=request.user.username,
        payload={
            "transition": action, "previous": previous,
            "stage": job.stage, "state": job.state, "review_round": job.review_round,
        },
    )
