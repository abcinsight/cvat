from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("engine", "0098_data_local_storage_backing_cs"),
    ]

    operations = [
        migrations.AddField(
            model_name="job",
            name="validator",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="validated_jobs",
                related_query_name="validated_job",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AddField(
            model_name="job",
            name="validator_updated_date",
            field=models.DateTimeField(blank=True, default=None, null=True),
        ),
    ]
