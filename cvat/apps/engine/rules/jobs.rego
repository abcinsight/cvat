package jobs

import rego.v1

import data.utils
import data.organizations

# input: {
#     "scope": <
#              "create"|
#              "delete"|
#              "delete:annotations"|
#              "download:exported_file"|
#              "export:annotations"|
#              "export:dataset"|
#              "import:annotations"|
#              "list"|
#              "update"|
#              "update:annotations"|
#              "update:assignee"|
#              "update:metadata"|
#              "update:stage"|
#              "update:state"|
#              "update:validator"|
#              "update:validation_layout"|
#              "view"|
#              "view:annotations"|
#              "view:data"|
#              "view:metadata"|
#              "view:validation_layout"
#          > or null,
#     "auth": {
#         "user": {
#             "id": <num>,
#             "privilege": <"admin"|"user"|"worker"> or null
#         },
#         "organization": {
#             "id": <num>,
#             "owner": {
#                 "id": <num>
#             },
#             "user": {
#                 "role": <"owner"|"maintainer"|"supervisor"|"worker"> or null
#             }
#         } or null,
#     },
#     "resource": {
#         "id": <num>,
#         "assignee": { "id": <num> },
#         "validator": { "id": <num> },
#         "stage": <"annotation"|"validation"|"acceptance">,
#         "organization": { "id": <num> } or null,
#         "project": {
#             "owner": { "id": <num> },
#             "assignee": { "id": <num> }
#         } or null,
#         "task": {
#             "owner": { "id": <num> },
#             "assignee": { "id": <num> }
#         } or null,
#         "rq_job": { "owner": { "id": <num> } } or null,
#         "destination": <"local" | "cloud_storage"> or undefined,
#     }
# }

is_job_assignee if {
    input.resource.assignee.id == input.auth.user.id
}

is_job_validator if {
    input.resource.validator.id == input.auth.user.id
}

# The annotator can modify the job only while it is being annotated
is_job_active_assignee if {
    is_job_assignee
    input.resource.stage == "annotation"
}

# The validator can modify the job only while it is being validated
is_job_active_validator if {
    is_job_validator
    input.resource.stage == "validation"
}

is_task_owner if {
    input.resource.task.owner.id == input.auth.user.id
}

is_task_assignee if {
    input.resource.task.assignee.id == input.auth.user.id
}

is_project_owner if {
    input.resource.project.owner.id == input.auth.user.id
}

is_project_assignee if {
    input.resource.project.assignee.id == input.auth.user.id
}

is_project_staff if {
    is_project_owner
}

is_project_staff if {
    is_project_assignee
}

is_task_staff if {
    is_project_staff
}

is_task_staff if {
    is_task_owner
}

is_task_staff if {
    is_task_assignee
}

is_job_staff if {
    is_task_staff
}

is_job_staff if {
    is_job_assignee
}

is_job_staff if {
    is_job_validator
}

# Who can modify the job content and its state
is_job_editor if {
    is_task_staff
}

is_job_editor if {
    is_job_active_assignee
}

is_job_editor if {
    is_job_active_validator
}

# Preserve the manual workflow for jobs without a dedicated validator.
is_job_editor if {
    is_job_assignee
    object.get(object.get(input.resource, "validator", {}), "id", null) == null
}

workflow_actor(_) if {
    is_task_staff
}

workflow_actor(scope) if {
    scope == utils.SUBMIT
    is_job_active_assignee
}

workflow_actor(scope) if {
    scope in {utils.APPROVE, utils.REQUEST_CHANGES}
    is_job_active_validator
}

workflow_allowed(scope) if {
    scope in {utils.SUBMIT, utils.REQUEST_CHANGES, utils.APPROVE, utils.REOPEN}
    utils.is_sandbox
    utils.has_perm(utils.WORKER)
    workflow_actor(scope)
}

workflow_allowed(scope) if {
    scope in {utils.SUBMIT, utils.REQUEST_CHANGES, utils.APPROVE, utils.REOPEN}
    input.auth.organization.id == input.resource.organization.id
    organizations.has_perm(organizations.WORKER)
    utils.has_perm(utils.WORKER)
    workflow_actor(scope)
}

workflow_allowed(scope) if {
    scope in {utils.SUBMIT, utils.REQUEST_CHANGES, utils.APPROVE, utils.REOPEN}
    input.auth.organization.id == input.resource.organization.id
    organizations.has_perm(organizations.MAINTAINER)
    utils.has_perm(utils.USER)
}

workflow_allowed(_) if {
    utils.is_admin
}

default workflow_allowed(_) := false

workflow_permissions := {
    "submit": workflow_allowed(utils.SUBMIT),
    "request_changes": workflow_allowed(utils.REQUEST_CHANGES),
    "approve": workflow_allowed(utils.APPROVE),
    "reopen": workflow_allowed(utils.REOPEN),
}

allow if {
    input.scope in {utils.SUBMIT, utils.REQUEST_CHANGES, utils.APPROVE, utils.REOPEN}
    workflow_allowed(input.scope)
}

default allow := false

allow if {
    utils.is_admin
}

allow if {
    input.scope == utils.LIST
    utils.is_sandbox
}

allow if {
    input.scope == utils.LIST
    organizations.is_member
}


filter := [] if { # Django Q object to filter list of entries
    utils.is_admin
    utils.is_sandbox
} else := qobject if {
    utils.is_admin
    utils.is_organization
    qobject := [
        {"segment__task__organization": input.auth.organization.id},
        {"segment__task__project__organization": input.auth.organization.id}, "|" ]
} else := qobject if {
    utils.is_sandbox
    user := input.auth.user
    qobject := [
        {"assignee_id": user.id},
        {"validator_id": user.id}, "|",
        {"segment__task__owner_id": user.id}, "|",
        {"segment__task__assignee_id": user.id}, "|",
        {"segment__task__project__owner_id": user.id}, "|",
        {"segment__task__project__assignee_id": user.id}, "|"]
} else := qobject if {
    utils.is_organization
    utils.has_perm(utils.USER)
    organizations.has_perm(organizations.MAINTAINER)
    qobject := [
        {"segment__task__organization": input.auth.organization.id},
        {"segment__task__project__organization": input.auth.organization.id}, "|"]
} else := qobject if {
    organizations.has_perm(organizations.WORKER)
    user := input.auth.user
    qobject := [
        {"assignee_id": user.id},
        {"validator_id": user.id}, "|",
        {"segment__task__owner_id": user.id}, "|",
        {"segment__task__assignee_id": user.id}, "|",
        {"segment__task__project__owner_id": user.id}, "|",
        {"segment__task__project__assignee_id": user.id}, "|",
        {"segment__task__organization": input.auth.organization.id},
        {"segment__task__project__organization": input.auth.organization.id}, "|", "&"]
}

allow if {
    input.scope in {utils.CREATE, utils.DELETE}
    utils.has_perm(utils.USER)
    utils.is_sandbox
    is_task_staff
}

allow if {
    input.scope in {utils.CREATE, utils.DELETE}
    input.auth.organization.id == input.resource.organization.id
    organizations.has_perm(organizations.SUPERVISOR)
    utils.has_perm(utils.USER)
    is_task_staff
}

allow if {
    input.scope in {
        utils.VIEW,
        utils.EXPORT_DATASET, utils.EXPORT_ANNOTATIONS,
        utils.VIEW_ANNOTATIONS, utils.VIEW_DATA, utils.VIEW_METADATA
    }
    utils.is_sandbox
    is_job_staff
}

allow if {
    input.scope in {
        utils.CREATE, utils.DELETE, utils.VIEW,
        utils.EXPORT_DATASET, utils.EXPORT_ANNOTATIONS,
        utils.VIEW_ANNOTATIONS, utils.VIEW_DATA, utils.VIEW_METADATA
    }
    input.auth.organization.id == input.resource.organization.id
    utils.has_perm(utils.USER)
    organizations.has_perm(organizations.MAINTAINER)
}

allow if {
    input.scope in {
        utils.VIEW,
        utils.EXPORT_DATASET, utils.EXPORT_ANNOTATIONS,
        utils.VIEW_ANNOTATIONS, utils.VIEW_DATA, utils.VIEW_METADATA
    }
    input.auth.organization.id == input.resource.organization.id
    organizations.has_perm(organizations.WORKER)
    is_job_staff
}

allow if {
    input.scope in {
        utils.UPDATE_STATE, utils.UPDATE_ANNOTATIONS, utils.DELETE_ANNOTATIONS,
        utils.IMPORT_ANNOTATIONS, utils.UPDATE_METADATA
    }
    utils.is_sandbox
    utils.has_perm(utils.WORKER)
    is_job_editor
}

allow if {
    input.scope in {
        utils.UPDATE_STATE, utils.UPDATE_ANNOTATIONS, utils.DELETE_ANNOTATIONS,
        utils.IMPORT_ANNOTATIONS, utils.UPDATE_METADATA
    }
    input.auth.organization.id == input.resource.organization.id
    utils.has_perm(utils.USER)
    organizations.has_perm(organizations.MAINTAINER)
}

allow if {
    input.scope in {
        utils.UPDATE_STATE, utils.UPDATE_ANNOTATIONS, utils.DELETE_ANNOTATIONS,
        utils.IMPORT_ANNOTATIONS, utils.UPDATE_METADATA
    }
    input.auth.organization.id == input.resource.organization.id
    utils.has_perm(utils.WORKER)
    organizations.has_perm(organizations.WORKER)
    is_job_editor
}

allow if {
    input.scope in {utils.VIEW, utils.VIEW_ANNOTATIONS, utils.VIEW_DATA, utils.VIEW_METADATA}
    input.auth.organization.id == input.resource.organization.id
    input.auth.user.privilege == utils.WORKER
    input.auth.organization.user.role == null
    is_job_staff
}

allow if {
    input.scope in {
        utils.UPDATE_STATE, utils.UPDATE_ANNOTATIONS, utils.DELETE_ANNOTATIONS,
        utils.IMPORT_ANNOTATIONS, utils.UPDATE_METADATA
    }
    input.auth.organization.id == input.resource.organization.id
    input.auth.user.privilege == utils.WORKER
    input.auth.organization.user.role == null
    is_job_editor
}

allow if {
    input.scope in {utils.UPDATE_STAGE, utils.UPDATE_ASSIGNEE, utils.UPDATE_VALIDATOR}
    utils.is_sandbox
    utils.has_perm(utils.WORKER)
    is_task_staff
}

allow if {
    input.scope in {utils.UPDATE_STAGE, utils.UPDATE_ASSIGNEE, utils.UPDATE_VALIDATOR}
    input.auth.organization.id == input.resource.organization.id
    utils.has_perm(utils.USER)
    organizations.has_perm(organizations.MAINTAINER)
}

allow if {
    input.scope in {utils.UPDATE_STAGE, utils.UPDATE_ASSIGNEE, utils.UPDATE_VALIDATOR}
    input.auth.organization.id == input.resource.organization.id
    utils.has_perm(utils.WORKER)
    organizations.has_perm(organizations.WORKER)
    is_task_staff
}

allow if {
    input.scope in {utils.VIEW_VALIDATION_LAYOUT, utils.UPDATE_VALIDATION_LAYOUT}
    utils.is_sandbox
    is_task_staff
}

allow if {
    input.scope in {utils.VIEW_VALIDATION_LAYOUT, utils.UPDATE_VALIDATION_LAYOUT}
    input.auth.organization.id == input.resource.organization.id
    organizations.has_perm(organizations.WORKER)
    is_task_staff
}

allow if {
    input.scope in {utils.VIEW_VALIDATION_LAYOUT, utils.UPDATE_VALIDATION_LAYOUT}
    input.auth.organization.id == input.resource.organization.id
    organizations.has_perm(organizations.MAINTAINER)
    utils.has_perm(utils.USER)
}

allow if {
    input.scope == utils.DOWNLOAD_EXPORTED_FILE
    input.auth.user.id == input.resource.rq_job.owner.id
}
