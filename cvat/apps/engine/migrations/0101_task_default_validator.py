# SPDX-License-Identifier: MIT
from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [("engine", "0100_job_review_round")]
    operations = [migrations.AddField(
        model_name="task", name="default_validator",
        field=models.ForeignKey(
            to=settings.AUTH_USER_MODEL, null=True, blank=True,
            on_delete=django.db.models.deletion.SET_NULL, related_name="validation_tasks",
        ),
    )]
