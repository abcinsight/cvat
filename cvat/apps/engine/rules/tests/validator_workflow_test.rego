package jobs_test

import rego.v1
import data.jobs

workflow_input(user, stage, scope) := {
    "scope": scope,
    "auth": {"user": {"id": user, "privilege": "worker"}, "organization": null},
    "resource": {
        "id": 1, "assignee": {"id": 1}, "validator": {"id": 2}, "stage": stage,
        "organization": {"id": null}, "project": null,
        "task": {"owner": {"id": 3}, "assignee": {"id": null}},
    },
}

expected(user, stage, scope) := true if {
    user == 3
} else := true if {
    user == 1
    stage == "annotation"
    scope == "submit"
} else := true if {
    user == 2
    stage == "validation"
    scope in {"approve", "request_changes"}
} else := false

test_workflow_role_stage_matrix if {
    every stage in ["annotation", "validation", "acceptance"] {
        every scope in ["submit", "request_changes", "approve", "reopen"] {
            every user in [1, 2, 3, 4] {
                result := jobs.allow with input as workflow_input(user, stage, scope)
                result == expected(user, stage, scope)
            }
        }
    }
}

test_validator_cannot_bypass_workflow_with_stage_patch if {
    every stage in ["annotation", "validation", "acceptance"] {
        not jobs.allow with input as workflow_input(2, stage, "update:stage")
    }
}

test_annotator_read_only_after_submission if {
    every stage in ["validation", "acceptance"] {
        every scope in ["update:annotations", "delete:annotations", "import:annotations", "update:metadata", "update:state"] {
            not jobs.allow with input as workflow_input(1, stage, scope)
        }
    }
}

test_legacy_assignee_can_edit_in_validation if {
    original := workflow_input(1, "validation", "update:annotations")
    resource := object.union(original.resource, {"validator": {"id": null}})
    jobs.allow with input as object.union(original, {"resource": resource})
}

test_cross_organization_workflow_denied if {
    original := workflow_input(2, "validation", "approve")
    auth := object.union(original.auth, {"organization": {"id": 9, "owner": {"id": 8}, "user": {"role": "worker"}}})
    resource := object.union(original.resource, {"organization": {"id": 10}})
    not jobs.allow with input as object.union(original, {"auth": auth, "resource": resource})
}

test_organization_workflow_role_stage_matrix if {
    every stage in ["annotation", "validation", "acceptance"] {
        every scope in ["submit", "request_changes", "approve", "reopen"] {
            every user in [1, 2, 3, 4] {
                original := workflow_input(user, stage, scope)
                auth := object.union(original.auth, {"organization": {"id": 9, "owner": {"id": 8}, "user": {"role": "worker"}}})
                resource := object.union(original.resource, {"organization": {"id": 9}})
                result := jobs.allow with input as object.union(original, {"auth": auth, "resource": resource})
                result == expected(user, stage, scope)
            }
        }
    }
}

test_maintainer_and_admin_can_manage_workflow if {
    every scope in ["submit", "request_changes", "approve", "reopen"] {
        original := workflow_input(4, "validation", scope)
        admin := object.union(original.auth, {"user": {"id": 4, "privilege": "admin"}})
        jobs.allow with input as object.union(original, {"auth": admin})
        auth := {"user": {"id": 4, "privilege": "user"}, "organization": {"id": 9, "owner": {"id": 8}, "user": {"role": "maintainer"}}}
        resource := object.union(original.resource, {"organization": {"id": 9}})
        jobs.allow with input as object.union(original, {"auth": auth, "resource": resource})
    }
}
