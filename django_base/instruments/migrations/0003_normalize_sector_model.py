from django.db import migrations, models
import django.db.models.deletion


def fill_industry_group_sector(apps, schema_editor):
    Sector = apps.get_model('instruments', 'Sector')
    IndustryGroup = apps.get_model('instruments', 'IndustryGroup')

    default_sector, _ = Sector.objects.get_or_create(name='Не указан')
    IndustryGroup.objects.filter(sector__isnull=True).update(sector=default_sector)


class Migration(migrations.Migration):

    dependencies = [
        ('instruments', '0002_add_industry_futures_and_icons'),
    ]

    operations = [
        migrations.CreateModel(
            name='Sector',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=100, unique=True, verbose_name='Сектор экономики')),
            ],
            options={
                'verbose_name': 'Сектор экономики',
                'verbose_name_plural': 'Секторы экономики',
                'db_table': 'instruments_sector',
                'ordering': ['name'],
            },
        ),
        migrations.AddField(
            model_name='industrygroup',
            name='sector',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name='industry_groups',
                to='instruments.sector',
                verbose_name='Сектор экономики',
            ),
        ),
        migrations.AlterField(
            model_name='industrygroup',
            name='name',
            field=models.CharField(max_length=200, verbose_name='Группа индустрии'),
        ),
        migrations.AlterUniqueTogether(
            name='industrygroup',
            unique_together={('name', 'sector')},
        ),
        migrations.RunPython(fill_industry_group_sector, migrations.RunPython.noop),
        migrations.AlterField(
            model_name='industrygroup',
            name='sector',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT,
                related_name='industry_groups',
                to='instruments.sector',
                verbose_name='Сектор экономики',
            ),
        ),
    ]
