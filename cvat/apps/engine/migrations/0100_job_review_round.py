# SPDX-License-Identifier: MIT
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("engine", "0099_job_validator")]

    operations = [
        migrations.AddField(
            model_name="job", name="review_round", field=models.PositiveIntegerField(default=0)
        ),
    ]
