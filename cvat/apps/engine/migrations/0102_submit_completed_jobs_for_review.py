# SPDX-License-Identifier: MIT
from django.db import migrations


def submit_completed_jobs(apps, schema_editor):
    Job = apps.get_model("engine", "Job")
    Job.objects.filter(
        type="annotation",
        validator__isnull=False,
        stage="annotation",
        state="completed",
        child_job__isnull=True,
    ).update(stage="validation", state="new", status="validation")


class Migration(migrations.Migration):
    dependencies = [("engine", "0101_task_default_validator")]  # noqa: RUF012
    operations = [  # noqa: RUF012
        migrations.RunPython(submit_completed_jobs, migrations.RunPython.noop),
    ]
