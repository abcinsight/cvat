# Copyright (C) CVAT.ai Corporation
# SPDX-License-Identifier: MIT
from unittest.mock import patch

from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework.test import APIClient

from cvat.apps.engine.models import Data, Issue, Job, Segment, Task
from cvat.apps.iam.permissions import PermissionResult


class JobWorkflowTests(TestCase):
    """Exercise REST persistence; the role matrix is tested against OPA separately."""

    def setUp(self):
        self.permission = patch(
            "cvat.apps.iam.permissions.OpenPolicyAgentPermission.check_access",
            return_value=PermissionResult(allow=True, reasons=[]),
        )
        self.permission.start()
        self.addCleanup(self.permission.stop)
        self.user = User.objects.create(username="annotator")
        self.validator = User.objects.create(username="validator")
        self.task = Task.objects.create(
            name="Review", owner=self.user, data=Data.objects.create(size=1),
            dimension="2d", mode="annotation", overlap=0,
        )
        self.segment = Segment.objects.create(task=self.task, start_frame=0, stop_frame=0)
        self.job = Job.objects.create(segment=self.segment, assignee=self.user, validator=self.validator)
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def transition(self, action, expected=200):
        response = self.client.post(f"/api/jobs/{self.job.pk}/{action}", {}, format="json")
        self.assertEqual(response.status_code, expected, response.data)
        self.job.refresh_from_db()
        return response

    def test_review_cycle_and_audit(self):
        with patch("cvat.apps.events.event.record_server_event") as event:
            self.transition("submit")
            self.assertEqual((self.job.stage, self.job.state, self.job.review_round), ("validation", "new", 0))
            event.assert_called_once()
            self.assertEqual(event.call_args.kwargs["payload"]["transition"], "submit")
            self.assertEqual(event.call_args.kwargs["user_id"], self.user.id)
            self.assertTrue(event.call_args.kwargs["on_commit"])
        self.transition("request_changes", 400)
        issue = Issue.objects.create(job=self.job, frame=0, position=[0, 0], owner=self.validator)
        self.transition("approve", 400)
        self.transition("request_changes")
        self.assertEqual((self.job.stage, self.job.state, self.job.review_round), ("annotation", "in progress", 1))
        self.transition("approve", 400)
        issue.resolved = True
        issue.save()
        self.transition("submit")
        response = self.transition("approve")
        self.assertEqual((self.job.stage, self.job.state, self.job.status), ("acceptance", "completed", "completed"))
        self.assertEqual(response.data["review_round"], 1)
        self.transition("approve", 400)
        self.transition("reopen")
        self.assertEqual(self.job.stage, "annotation")

    def test_missing_validator_and_legacy_patch(self):
        self.job.validator = None
        self.job.save()
        self.transition("submit", 400)
        response = self.client.patch(f"/api/jobs/{self.job.pk}", {"state": "completed"}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        self.job.refresh_from_db()
        self.assertEqual((self.job.stage, self.job.state), ("annotation", "completed"))

    def test_completed_patch_submits_for_review_but_round_is_read_only(self):
        response = self.client.patch(f"/api/jobs/{self.job.pk}", {"state": "completed", "review_round": 9}, format="json")
        self.assertEqual(response.status_code, 403, response.data)
        with patch("cvat.apps.events.event.record_server_event") as event:
            response = self.client.patch(
                f"/api/jobs/{self.job.pk}", {"state": "completed"}, format="json"
            )
        self.assertEqual(response.status_code, 200, response.data)
        self.job.refresh_from_db()
        self.assertEqual(
            (self.job.stage, self.job.state, self.job.status, self.job.review_round),
            ("validation", "new", "validation", 0),
        )
        self.assertEqual(event.call_args.kwargs["payload"]["transition"], "submit")
        self.transition("submit", 400)

    def test_completed_patch_uses_submit_permission(self):
        self.permission.stop()
        with patch(
            "cvat.apps.iam.permissions.OpenPolicyAgentPermission.check_access",
            autospec=True,
            side_effect=lambda permission: PermissionResult(
                allow=permission.scope != "update:state"
            ),
        ):
            response = self.client.patch(
                f"/api/jobs/{self.job.pk}", {"state": "completed"}, format="json"
            )
        self.assertEqual(response.status_code, 200, response.data)
        self.job.refresh_from_db()
        self.assertEqual((self.job.stage, self.job.state), ("validation", "new"))

    def test_consensus_jobs_excluded(self):
        replica = Job.objects.create(segment=self.segment, type="consensus_replica", parent_job=self.job)
        self.transition("submit", 400)
        self.job = replica
        self.transition("submit", 400)

    def test_permission_denial_does_not_mutate(self):
        with patch("cvat.apps.iam.permissions.OpenPolicyAgentPermission.check_access", return_value=PermissionResult(allow=False, reasons=[])):
            self.transition("submit", 403)
        self.assertEqual(self.job.stage, "annotation")

    def test_workflow_permissions_are_checked_individually(self):
        self.permission.stop()
        with patch(
            "cvat.apps.iam.permissions.OpenPolicyAgentPermission.check_access",
            autospec=True,
            side_effect=lambda permission: PermissionResult(allow=permission.scope != "approve"),
        ):
            response = self.client.get(f"/api/jobs/{self.job.pk}")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertTrue(response.data["workflow_permissions"]["submit"])
        self.assertFalse(response.data["workflow_permissions"]["approve"])

    def test_ground_truth_excluded(self):
        self.job.type = "ground_truth"
        self.job.save()
        self.transition("submit", 400)

    def test_bulk_assignment_preserves_existing_unless_overwrite(self):
        other = Job.objects.create(segment=self.segment)
        completed = Job.objects.create(
            segment=self.segment, assignee=self.user, state="completed"
        )
        endpoint = f"/api/tasks/{self.task.pk}/assign_validator"
        response = self.client.post(endpoint, {"validator": self.user.pk}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        other.refresh_from_db()
        self.job.refresh_from_db()
        self.task.refresh_from_db()
        self.assertEqual(other.validator_id, self.user.id)
        completed.refresh_from_db()
        self.assertEqual(
            (completed.validator_id, completed.stage, completed.state),
            (self.user.id, "validation", "new"),
        )
        self.assertEqual(self.job.validator_id, self.validator.id)
        self.assertEqual(self.task.default_validator_id, self.user.id)
        new_segment = Segment.objects.create(task=self.task, start_frame=0, stop_frame=0)
        new_job = Job.objects.create(segment=new_segment)
        self.assertEqual(new_job.validator_id, self.user.id)
        self.assertIsNotNone(new_job.validator_updated_date)
        completed_segment = Segment.objects.create(task=self.task, start_frame=0, stop_frame=0)
        completed_new_job = Job.objects.create(
            segment=completed_segment, state="completed"
        )
        self.assertEqual(
            (completed_new_job.validator_id, completed_new_job.stage, completed_new_job.state),
            (self.user.id, "validation", "new"),
        )
        response = self.client.post(endpoint, {"validator": None, "overwrite": True}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertFalse(Job.objects.filter(segment=self.segment, validator__isnull=False).exists())
