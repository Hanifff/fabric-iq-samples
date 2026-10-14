# Fabric notebook source

# METADATA ********************

# META {
# META   "kernel_info": {
# META     "name": "synapse_pyspark"
# META   },
# META   "dependencies": {
# META     "lakehouse": {
# META       "default_lakehouse": "__GOLD_LAKEHOUSE_ID__",
# META       "default_lakehouse_name": "lh_contoso_dev_swc_gold_01",
# META       "default_lakehouse_workspace_id": "__WORKSPACE_ID__",
# META       "known_lakehouses": [
# META         {
# META           "id": "__GOLD_LAKEHOUSE_ID__"
# META         },
# META         {
# META           "id": "__SILVER_LAKEHOUSE_ID__"
# META         }
# META       ]
# META     }
# META   }
# META }

# MARKDOWN ********************

# # Contoso silver to gold
#
# Reads the clean silver tables and writes a star schema to the gold lakehouse.
#
# - Default lakehouse: `lh_contoso_dev_swc_gold_01` (output)
# - Attached lakehouse: `lh_contoso_dev_swc_silver_01` (input)
# - Dimensions get an integer surrogate key (`*_key`). Facts store those keys.
# - Missing optional references point to key -1, a "Not applicable" row in the dimension.
# - Every table is rewritten in full, so the notebook can be run again at any time.
#
# Column names and descriptions are defined in `tools/gold_model.py` and used for the semantic models.

# CELL ********************

from pyspark.sql import functions as F
from pyspark.sql.window import Window

SILVER = "lh_contoso_dev_swc_silver_01"


def silver(table):
    return spark.read.table(f"{SILVER}.{table}")


def add_key(df, key, order_by):
    """Add a 1..n surrogate key as the first column."""
    return df.withColumn(key, F.row_number().over(Window.orderBy(order_by)).cast("int")).select(key, *df.columns)


def add_unknown_member(df, key, **values):
    """Add a row with key -1 so facts without a reference still join."""
    blank = df.limit(1).select([F.lit(None).cast(f.dataType).alias(f.name) for f in df.schema.fields])
    unknown = blank.withColumn(key, F.lit(-1)).select(*df.columns)
    for column, value in values.items():
        unknown = unknown.withColumn(column, F.lit(value))
    return unknown.unionByName(df)


def date_key(column):
    return F.date_format(column, "yyyyMMdd").cast("int")


def save(df, name):
    df.write.format("delta").mode("overwrite").option("overwriteSchema", "true").saveAsTable(name)
    print(f"{name}: {spark.read.table(name).count():,} rows")

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "synapse_pyspark"
# META }

# MARKDOWN ********************

# ## Dimensions

# CELL ********************

# dim_date: one row per day, 2022 to 2029
dim_date = (
    spark.sql("SELECT explode(sequence(to_date('2022-01-01'), to_date('2029-12-31'), interval 1 day)) AS date")
    .withColumn("day_of_week_number", ((F.dayofweek("date") + 5) % 7 + 1).cast("int"))
    .select(
        date_key("date").alias("date_key"),
        "date",
        F.year("date").alias("year"),
        F.quarter("date").alias("quarter_number"),
        F.concat_ws(" Q", F.year("date"), F.quarter("date")).alias("quarter_label"),
        F.month("date").alias("month_number"),
        F.date_format("date", "MMMM").alias("month_name"),
        F.date_format("date", "MMM").alias("month_short_name"),
        F.date_format("date", "yyyy-MM").alias("year_month"),
        F.weekofyear("date").alias("week_of_year"),
        "day_of_week_number",
        F.date_format("date", "EEEE").alias("day_name"),
        (F.col("day_of_week_number") >= 6).alias("is_weekend"),
    )
)
save(dim_date, "dim_date")

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

# dim_project: project plus the installation name
installation = silver("installation").select("installation_id", F.col("installation_name"))

dim_project = (
    silver("project")
    .join(installation, "installation_id", "left")
    .withColumn("installation_name", F.coalesce("installation_name", F.lit("Not applicable")))
    .withColumn("contract_value_nok", F.col("contract_value_nok").cast("double"))
    .withColumn("planned_total_hours", F.col("planned_total_hours").cast("double"))
    .select(
        "project_id", "project_code", "project_name", "segment", "project_type", "client_name",
        "installation_name", "yard_location", "country_code", "contract_type", "contract_value_nok",
        "start_date", "planned_finish_date", "actual_finish_date", "project_status",
        "project_manager_name", "planned_total_hours",
    )
)
dim_project = add_key(dim_project, "project_key", "project_id")
save(dim_project, "dim_project")

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

# dim_discipline
dim_discipline = silver("discipline").select(
    "discipline_id", "discipline_code", "discipline_name", "discipline_group",
    F.col("standard_hourly_rate_nok").cast("double").alias("standard_hourly_rate_nok"),
)
dim_discipline = add_key(dim_discipline, "discipline_key", "discipline_id")
save(dim_discipline, "dim_discipline")

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

# dim_resource: resource plus the discipline name, with an Unassigned member
discipline_names = silver("discipline").select("discipline_id", "discipline_name")

dim_resource = (
    silver("resource")
    .join(discipline_names, "discipline_id", "left")
    .select(
        "resource_id", "resource_name", "role_title", "discipline_name", "seniority_level",
        "employment_type", "home_location", F.col("hourly_rate_nok").cast("double").alias("hourly_rate_nok"),
    )
)
dim_resource = add_key(dim_resource, "resource_key", "resource_id")
dim_resource = add_unknown_member(dim_resource, "resource_key", resource_id="UNASSIGNED", resource_name="Unassigned")
save(dim_resource, "dim_resource")

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

# dim_activity: activity plus its work package, tag number and the keys of its project, discipline and resource
work_package = silver("work_package").select(
    "work_package_id", "work_package_code", "work_package_name", "work_package_type", "work_package_status",
)
tag_numbers = silver("tag").select("tag_id", "tag_number")

dim_activity = (
    silver("activity")
    .join(work_package, "work_package_id", "left")
    .join(tag_numbers, "tag_id", "left")
    .join(dim_project.select("project_id", "project_key"), "project_id", "left")
    .join(dim_discipline.select("discipline_id", "discipline_key"), "discipline_id", "left")
    .join(dim_resource.select(F.col("resource_id").alias("assigned_resource_id"), "resource_key"), "assigned_resource_id", "left")
    .withColumn("resource_key", F.coalesce("resource_key", F.lit(-1)))
    .withColumn("tag_number", F.coalesce("tag_number", F.lit("Not applicable")))
    .select(
        "project_key", "discipline_key", "resource_key", "activity_id", "activity_code", "activity_name", "activity_type", "activity_status", "is_critical_path",
        "planned_start_date", "planned_finish_date", "actual_start_date", "actual_finish_date",
        "planned_hours", "actual_hours", "percent_complete", "tag_number",
        "work_package_id", "work_package_code", "work_package_name", "work_package_type", "work_package_status",
    )
)
dim_activity = add_key(dim_activity, "activity_key", "activity_id")
save(dim_activity, "dim_activity")

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

# dim_installation
dim_installation = silver("installation").select(
    "installation_id", "installation_code", "installation_name", "installation_type", "field_name",
    "operator_name", "country_code", "water_depth_m", "year_in_service", "operating_status",
)
dim_installation = add_key(dim_installation, "installation_key", "installation_id")
save(dim_installation, "dim_installation")

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

# dim_equipment: tag plus its equipment class
equipment_class = silver("equipment_class").select("equipment_class_id", "equipment_class_name", "equipment_class_group")

dim_equipment = (
    silver("tag")
    .join(equipment_class, "equipment_class_id", "left")
    .select(
        "tag_id", "tag_number", "tag_description", "equipment_class_id", "equipment_class_name",
        "equipment_class_group", "system_code", "system_name", "manufacturer_name",
        F.col("weight_kg").cast("long").alias("weight_kg"), "design_pressure_bar", "design_temperature_c",
        "criticality_class", F.col("installation_status").alias("equipment_status"),
    )
)
dim_equipment = add_key(dim_equipment, "equipment_key", "tag_id")
save(dim_equipment, "dim_equipment")

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

# dim_supplier: with a Not applicable member for work done without a contractor
dim_supplier = silver("supplier").select(
    "supplier_id", "supplier_name", "supplier_category", "country_code", "approval_status",
    "quality_rating", "payment_terms_days", "is_preferred_supplier", "onboarded_date",
)
dim_supplier = add_key(dim_supplier, "supplier_key", "supplier_id")
dim_supplier = add_unknown_member(
    dim_supplier, "supplier_key",
    supplier_id="NOT_APPLICABLE", supplier_name="Not applicable", supplier_category="Not applicable",
    country_code="NA", approval_status="Not applicable",
)
save(dim_supplier, "dim_supplier")

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

# dim_material: material plus the equipment class name
class_names = silver("equipment_class").select("equipment_class_id", "equipment_class_name")

dim_material = (
    silver("material")
    .join(class_names, "equipment_class_id", "left")
    .withColumn("equipment_class_name", F.coalesce("equipment_class_name", F.lit("Not applicable")))
    .select(
        "material_id", "material_code", "material_description", "material_group", "equipment_class_name",
        "unit_of_measure", "standard_unit_price_nok", "standard_lead_time_days", "is_critical_spare",
    )
)
dim_material = add_key(dim_material, "material_key", "material_id")
save(dim_material, "dim_material")

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

# dim_cost_code
dim_cost_code = silver("cost_code").select("cost_code_id", "cost_code", "cost_code_name", "cost_category", "cost_type")
dim_cost_code = add_key(dim_cost_code, "cost_code_key", "cost_code_id")
save(dim_cost_code, "dim_cost_code")

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "synapse_pyspark"
# META }

# MARKDOWN ********************

# ## Facts

# CELL ********************

# fact_activity_progress: weekly snapshot per activity
activity = silver("activity").select("activity_id", "project_id", "discipline_id", "assigned_resource_id")

fact_activity_progress = (
    silver("activity_progress_weekly")
    .join(activity, "activity_id", "left")
    .join(dim_project.select("project_id", "project_key"), "project_id", "left")
    .join(dim_activity.select("activity_id", "activity_key"), "activity_id", "left")
    .join(dim_discipline.select("discipline_id", "discipline_key"), "discipline_id", "left")
    .join(
        dim_resource.select(F.col("resource_id").alias("assigned_resource_id"), "resource_key"),
        "assigned_resource_id", "left",
    )
    .withColumn("resource_key", F.coalesce("resource_key", F.lit(-1)))
    .withColumn("week_ending_date_key", date_key("week_ending_date"))
    .withColumn("percent_complete_variance", F.round(F.col("actual_percent_complete") - F.col("planned_percent_complete"), 1))
    .withColumn("is_behind_plan", F.when(F.col("percent_complete_variance") < -15, 1).otherwise(0).cast("long"))
    .select(
        "week_ending_date_key", "project_key", "activity_key", "discipline_key", "resource_key",
        "planned_percent_complete", "actual_percent_complete", "percent_complete_variance", "is_behind_plan",
        "hours_booked_in_week", "cumulative_hours_booked",
    )
)
save(fact_activity_progress, "fact_activity_progress")

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

# fact_work_order: one row per work order
fact_work_order = (
    silver("work_order")
    .join(dim_installation.select("installation_id", "installation_key"), "installation_id", "left")
    .join(dim_equipment.select("tag_id", "equipment_key"), "tag_id", "left")
    .join(dim_discipline.select("discipline_id", "discipline_key"), "discipline_id", "left")
    .join(
        dim_supplier.select(F.col("supplier_id").alias("contractor_supplier_id"), F.col("supplier_key").alias("contractor_supplier_key")),
        "contractor_supplier_id", "left",
    )
    .withColumn("contractor_supplier_key", F.coalesce("contractor_supplier_key", F.lit(-1)))
    .withColumn("reported_date_key", date_key("reported_date"))
    .withColumn("actual_finish_date_key", date_key("actual_finish_date"))
    .withColumn("priority", F.col("priority").cast("long"))
    .withColumn("failure_mode", F.coalesce("failure_mode", F.lit("Not applicable")))
    .withColumn("is_completed", F.when(F.col("work_order_status") == "Completed", 1).otherwise(0).cast("long"))
    .withColumn("is_corrective", F.when(F.col("work_order_type") == "Corrective", 1).otherwise(0).cast("long"))
    .withColumn("hours_variance", F.when(F.col("is_completed") == 1, F.round(F.col("actual_hours") - F.col("planned_hours"), 1)).otherwise(F.lit(0.0)))
    .withColumn("total_cost_nok", F.col("labour_cost_nok") + F.col("material_cost_nok"))
    .withColumn("days_to_complete", F.datediff("actual_finish_date", "reported_date").cast("long"))
    .select(
        "reported_date_key", "actual_finish_date_key", "installation_key", "equipment_key", "discipline_key",
        "contractor_supplier_key", "work_order_id", "work_order_type", "priority", "work_order_status",
        "failure_mode", "work_order_description", "is_safety_critical", "planned_hours", "actual_hours",
        "hours_variance", "labour_cost_nok", "material_cost_nok", "total_cost_nok", "downtime_hours",
        "days_to_complete", "is_completed", "is_corrective",
    )
)
save(fact_work_order, "fact_work_order")

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

# fact_purchase_order_line: order lines with header attributes and delivery performance
purchase_order = silver("purchase_order").select(
    "purchase_order_id", "project_id", "supplier_id", "order_date", "buyer_resource_id",
    "currency_code", "exchange_rate_to_nok", "incoterms", "po_status",
)
buyers = silver("resource").select(F.col("resource_id").alias("buyer_resource_id"), F.col("resource_name").alias("buyer_name"))

fact_purchase_order_line = (
    silver("purchase_order_line")
    .join(purchase_order, "purchase_order_id", "left")
    .join(buyers, "buyer_resource_id", "left")
    .join(dim_project.select("project_id", "project_key"), "project_id", "left")
    .join(dim_supplier.select("supplier_id", "supplier_key"), "supplier_id", "left")
    .join(dim_material.select("material_id", "material_key"), "material_id", "left")
    .join(dim_cost_code.select("cost_code_id", "cost_code_key"), "cost_code_id", "left")
    .withColumn("order_date_key", date_key("order_date"))
    .withColumn("promised_delivery_date_key", date_key("promised_delivery_date"))
    .withColumn("actual_delivery_date_key", date_key("actual_delivery_date"))
    .withColumn("line_number", F.col("line_number").cast("long"))
    .withColumn("quantity_ordered", F.col("quantity_ordered").cast("double"))
    .withColumn("quantity_received", F.col("quantity_received").cast("double"))
    .withColumn("quantity_rejected", F.col("quantity_rejected").cast("double"))
    .withColumn("delivery_delay_days", F.datediff("actual_delivery_date", "promised_delivery_date").cast("long"))
    .withColumn("is_delivered", F.when(F.col("actual_delivery_date").isNotNull(), 1).otherwise(0).cast("long"))
    .withColumn("is_late_delivery", F.when(F.col("delivery_delay_days") > 0, 1).otherwise(0).cast("long"))
    .select(
        "order_date_key", "promised_delivery_date_key", "actual_delivery_date_key", "project_key", "supplier_key",
        "material_key", "cost_code_key", "purchase_order_id", "purchase_order_line_id", "line_number", "po_status",
        "line_status", "currency_code", "exchange_rate_to_nok", "incoterms", "buyer_name",
        "quantity_ordered", "quantity_received", "quantity_rejected", "unit_price_nok", "discount_percent",
        "line_amount_nok", "delivery_delay_days", "is_delivered", "is_late_delivery",
    )
)
save(fact_purchase_order_line, "fact_purchase_order_line")

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "synapse_pyspark"
# META }
