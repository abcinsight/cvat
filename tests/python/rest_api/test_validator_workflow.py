# Copyright (C) CVAT.ai Corporation
# SPDX-License-Identifier: MIT

import pytest
from shared.utils.config import get_method, patch_method, post_method
from shared.utils.helpers import generate_image_files

from .utils import create_task


@pytest.mark.usefixtures("restore_db_per_function")
def test_validator_review_cycle_with_real_permissions(admin_user, users):
    """Integration coverage against the REST test stack, including its OPA service."""
    annotator, validator = [
        user for user in users
        if user["is_active"] and not user["is_superuser"] and "admin" not in user["groups"]
    ][:2]
    task_id, _ = create_task(
        admin_user, spec={"name": "validator workflow", "labels": [{"name": "object"}]},
        data={"image_quality": 75, "client_files": generate_image_files(1)},
    )
    response = get_method(admin_user, "jobs", task_id=task_id)
    assert response.status_code == 200, response.text
    job_id = response.json()["results"][0]["id"]
    endpoint = f"jobs/{job_id}"
    response = patch_method(admin_user, endpoint, {
        "assignee": annotator["id"], "validator": validator["id"],
    })
    assert response.status_code == 200, response.text
    response = post_method(validator["username"], f"{endpoint}/approve", {})
    assert response.status_code == 403, response.text
    # Generic completion from task/job lists is normalized to the submit transition.
    response = patch_method(annotator["username"], endpoint, {"state": "completed"})
    assert response.status_code == 200, response.text
    assert (response.json()["stage"], response.json()["state"]) == ("validation", "new")
    response = patch_method(annotator["username"], endpoint, {"state": "in progress"})
    assert response.status_code == 403, response.text
    response = patch_method(validator["username"], endpoint, {"stage": "acceptance"})
    assert response.status_code == 403, response.text
    response = post_method(validator["username"], f"{endpoint}/request_changes", {})
    assert response.status_code == 400, response.text
    response = post_method(validator["username"], "issues", {
        "job": job_id, "frame": 0, "position": [0, 0, 10, 10], "message": "Fix the missing object",
    })
    assert response.status_code == 201, response.text
    issue_id = response.json()["id"]
    response = post_method(validator["username"], f"{endpoint}/approve", {})
    assert response.status_code == 400, response.text
    response = post_method(validator["username"], f"{endpoint}/request_changes", {})
    assert response.status_code == 200, response.text
    assert (response.json()["stage"], response.json()["state"], response.json()["review_round"]) == (
        "annotation", "in progress", 1,
    )
    response = patch_method(validator["username"], f"issues/{issue_id}", {"resolved": True})
    assert response.status_code == 200, response.text
    response = post_method(annotator["username"], f"{endpoint}/submit", {})
    assert response.status_code == 200, response.text
    response = post_method(validator["username"], f"{endpoint}/approve", {})
    assert response.status_code == 200, response.text
    assert (response.json()["stage"], response.json()["state"]) == ("acceptance", "completed")
    response = post_method(annotator["username"], f"{endpoint}/reopen", {})
    assert response.status_code == 403, response.text
    response = post_method(admin_user, f"{endpoint}/reopen", {})
    assert response.status_code == 200, response.text
