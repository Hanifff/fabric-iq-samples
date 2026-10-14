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
# META         }
# META       ]
# META     }
# META   }
# META }

# MARKDOWN ********************

# # Contoso gold descriptions
#
# Writes business descriptions into the gold tables, so the meaning travels with the data.
#
# - Default lakehouse: `lh_contoso_dev_swc_gold_01`
# - Table description, plus two table properties: `contoso.business_name` and `contoso.table_type`.
# - One description (comment) per column. Unchanged comments are skipped, so a rerun is cheap.
# - Run it after `nb_contoso_dev_swc_silver_to_gold_01`. That notebook rewrites the tables, so run this one again after it.
#
# The text is generated from `tools/gold_model.py`, the same source as the semantic model descriptions.
# Change it there and run `tools/build_gold_descriptions_notebook.py`, not here.

# CELL ********************

def sql_text(text):
    """Quote text as a Spark SQL string literal."""
    return "'" + text.replace("\\", "\\\\").replace("'", "\\'") + "'"


def describe_table(table, business_name, description, columns):
    """Set the table description and properties, then one comment per column."""
    table_type = "Fact" if table.startswith("fact_") else "Dimension"
    spark.sql(
        f"ALTER TABLE {table} SET TBLPROPERTIES ("
        f"'comment' = {sql_text(description)}, "
        f"'contoso.business_name' = {sql_text(business_name)}, "
        f"'contoso.table_type' = '{table_type}')"
    )

    current = {c.name: c.description for c in spark.catalog.listColumns(table)}
    changed = 0
    for column, text in columns.items():
        if current.get(column) != text:
            spark.sql(f"ALTER TABLE {table} ALTER COLUMN `{column}` COMMENT {sql_text(text)}")
            changed += 1

    missing = [name for name in current if name not in columns]
    print(f"{table}: {len(columns)} column descriptions, {changed} changed" + (f", no description for {missing}" if missing else ""))

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "synapse_pyspark"
# META }

# MARKDOWN ********************

# ## Dimensions

# CELL ********************

# dim_date
describe_table(
    "dim_date",
    business_name="Date",
    description="Calendar table with one row per day from 2022 to 2029. Use it to slice every fact by day, week, month, quarter and year.",
    columns={
        "date_key": "Surrogate key for the day in yyyymmdd form. Used by fact tables to join to the calendar.",
        "date": "Calendar date.",
        "year": "Calendar year, for example 2026.",
        "quarter_number": "Calendar quarter number from 1 to 4.",
        "quarter_label": "Calendar quarter label such as 2026 Q3.",
        "month_number": "Calendar month number from 1 (January) to 12 (December).",
        "month_name": "Full month name, for example September.",
        "month_short_name": "Three-letter month name, for example Sep.",
        "year_month": "Year and month in yyyy-mm form. Sorts correctly as text.",
        "week_of_year": "ISO week number from 1 to 53.",
        "day_of_week_number": "Day of week where Monday is 1 and Sunday is 7.",
        "day_name": "Day name, for example Monday.",
        "is_weekend": "True when the day is a Saturday or Sunday.",
    },
)

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

# dim_project
describe_table(
    "dim_project",
    business_name="Project",
    description="One row per Contoso project: a fabrication, modification, maintenance or study contract for a client. Shared by planning and procurement.",
    columns={
        "project_key": "Surrogate key of the project.",
        "project_id": "Business identifier of the project in the source system, for example PRJ-2210.",
        "project_code": "Short project code used on documents and work packages, for example CON-2403.",
        "project_name": "Name of the project, built from the asset name and the project type.",
        "segment": "Business segment: New Build for new facilities or Life Cycle for work on producing assets.",
        "project_type": "Kind of project, for example Jacket Fabrication, Subsea Tie-in or Maintenance Frame Agreement.",
        "client_name": "Name of the client that owns the facility and awards the contract.",
        "installation_name": "Installation the project works on. Not applicable for new build projects.",
        "yard_location": "Fabrication yard or work location of the project.",
        "country_code": "Two-letter country code where the work is delivered.",
        "contract_type": "Commercial form of the contract, for example EPC, EPCI, Reimbursable or Frame agreement.",
        "contract_value_nok": "Contract value in Norwegian kroner. One value per project, so do not sum it across rows of other tables.",
        "start_date": "Planned start date of the project.",
        "planned_finish_date": "Planned finish date of the project.",
        "actual_finish_date": "Actual finish date. Empty while the project is not finished.",
        "project_status": "Current status: Planning, Execution, On Hold or Completed.",
        "project_manager_name": "Name of the responsible project manager.",
        "planned_total_hours": "Total planned hours over all activities of the project.",
    },
)

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

# dim_discipline
describe_table(
    "dim_discipline",
    business_name="Discipline",
    description="Engineering and construction disciplines such as Piping or Electrical. Shared by planning and maintenance.",
    columns={
        "discipline_key": "Surrogate key of the discipline.",
        "discipline_id": "Business identifier of the discipline, for example DSC-04.",
        "discipline_code": "Three-letter discipline code, for example PIP.",
        "discipline_name": "Full name of the discipline.",
        "discipline_group": "Higher level grouping: Engineering, Fabrication, Construction, Commissioning or Project Support.",
        "standard_hourly_rate_nok": "Standard cost rate per hour for the discipline in Norwegian kroner.",
    },
)

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

# dim_resource
describe_table(
    "dim_resource",
    business_name="Resource",
    description="People who plan and execute work, with role, discipline and rate.",
    columns={
        "resource_key": "Surrogate key of the resource. Minus one is the Unassigned member.",
        "resource_id": "Business identifier of the resource, for example RES-0042. Unassigned for activities without an owner.",
        "resource_name": "Full name of the person.",
        "role_title": "Role title combining seniority, discipline and role.",
        "discipline_name": "Discipline the resource belongs to.",
        "seniority_level": "Seniority: Junior, Intermediate, Senior or Lead.",
        "employment_type": "Employee or Contractor.",
        "home_location": "Home office or yard of the resource.",
        "hourly_rate_nok": "Hourly cost rate in Norwegian kroner.",
    },
)

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

# dim_activity
describe_table(
    "dim_activity",
    business_name="Activity",
    description="Planned work activity within a work package, with its schedule, type and status. Work package attributes are included.",
    columns={
        "activity_key": "Surrogate key of the activity.",
        "project_key": "Key of the project the activity belongs to. Joins to Project. For the ontology; not used by the semantic model relationships.",
        "discipline_key": "Key of the discipline that does the activity. Joins to Discipline. For the ontology; not used by the semantic model relationships.",
        "resource_key": "Key of the resource assigned to the activity. Minus one when unassigned. Joins to Resource. For the ontology; not used by the semantic model relationships.",
        "activity_id": "Business identifier of the activity, for example ACT-004512.",
        "activity_code": "Structured activity code made of the work package code and a sequence number.",
        "activity_name": "Short description of the work, for example Weld spool 21-PA-1043.",
        "activity_type": "Type of work: Design, Document, Procure, Fabricate, Install, Test or Inspect.",
        "activity_status": "Current status: Not started, In progress or Completed.",
        "is_critical_path": "True when the activity is on the critical path of the schedule.",
        "planned_start_date": "Planned start date of the activity.",
        "planned_finish_date": "Planned finish date of the activity.",
        "actual_start_date": "Actual start date. Empty when the activity has not started.",
        "actual_finish_date": "Actual finish date. Empty when the activity has not finished.",
        "planned_hours": "Planned hours for the activity. One value per activity.",
        "actual_hours": "Hours booked on the activity up to the as-of date. One value per activity.",
        "percent_complete": "Latest reported percent complete from 0 to 100.",
        "tag_number": "Tag number of the equipment the activity works on. Not applicable when the work is not tied to a tag.",
        "work_package_id": "Business identifier of the work package the activity belongs to.",
        "work_package_code": "Structured code of the work package.",
        "work_package_name": "Name of the work package.",
        "work_package_type": "Work package type: Engineering, Procurement, Fabrication, Installation, Hook-up, Commissioning, Inspection or Project Controls.",
        "work_package_status": "Status of the work package derived from its activities.",
    },
)

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

# dim_installation
describe_table(
    "dim_installation",
    business_name="Installation",
    description="Producing assets that Contoso maintains, such as platforms, floating units and subsea templates.",
    columns={
        "installation_key": "Surrogate key of the installation.",
        "installation_id": "Business identifier of the installation, for example INS-004.",
        "installation_code": "Short code of the installation.",
        "installation_name": "Name of the installation.",
        "installation_type": "Type of installation, for example Fixed Platform or Floating Production Unit.",
        "field_name": "Name of the field the installation produces from.",
        "operator_name": "Name of the operator of the installation.",
        "country_code": "Two-letter country code of the continental shelf the installation is on.",
        "water_depth_m": "Water depth at the installation in metres. Zero for onshore terminals.",
        "year_in_service": "Year the installation started production.",
        "operating_status": "Operating status: Producing, Shut in or Late life.",
    },
)

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

# dim_equipment
describe_table(
    "dim_equipment",
    business_name="Equipment",
    description="Tagged equipment items with their class, system, manufacturer and design data. Classes follow a CFIHOS-style hierarchy.",
    columns={
        "equipment_key": "Surrogate key of the equipment tag.",
        "tag_id": "Business identifier of the tag, for example TAG-000412.",
        "tag_number": "Tag number built from system, class abbreviation and sequence, for example 23-KA-1004.",
        "tag_description": "Description of the tagged item.",
        "equipment_class_id": "Identifier of the equipment class in a CFIHOS-style class hierarchy, for example CF-30000156.",
        "equipment_class_name": "Name of the equipment class, for example Centrifugal Pump.",
        "equipment_class_group": "Group of equipment classes, for example Pumps, Valves or Instrumentation.",
        "system_code": "Two-digit code of the technical system the item belongs to.",
        "system_name": "Name of the technical system, for example Gas Compression.",
        "manufacturer_name": "Manufacturer of the equipment.",
        "weight_kg": "Dry weight of the item in kilograms.",
        "design_pressure_bar": "Design pressure in bar. Empty for items that do not contain pressure.",
        "design_temperature_c": "Design temperature in degrees Celsius. Empty for items that do not contain pressure.",
        "criticality_class": "Criticality of the item: A is highest, C is lowest.",
        "equipment_status": "Lifecycle status: Planned, Fabricated, Installed, Commissioned, Operating, Out of service or Decommissioned.",
    },
)

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

# dim_supplier
describe_table(
    "dim_supplier",
    business_name="Supplier",
    description="Suppliers and contractors with category, country and quality rating. Shared by procurement and maintenance.",
    columns={
        "supplier_key": "Surrogate key of the supplier. Minus one is the Not applicable member.",
        "supplier_id": "Business identifier of the supplier, for example SUP-0087.",
        "supplier_name": "Registered name of the supplier.",
        "supplier_category": "Main category of goods or services the supplier provides.",
        "country_code": "Two-letter country code of the supplier.",
        "approval_status": "Approval status: Approved, Conditional or Suspended.",
        "quality_rating": "Supplier quality rating from 1.5 to 5.0. Higher is better.",
        "payment_terms_days": "Agreed payment terms in days.",
        "is_preferred_supplier": "True when the supplier is on the preferred supplier list.",
        "onboarded_date": "Date the supplier was onboarded.",
    },
)

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

# dim_material
describe_table(
    "dim_material",
    business_name="Material",
    description="Materials and equipment that Contoso buys, with group, unit and standard price.",
    columns={
        "material_key": "Surrogate key of the material.",
        "material_id": "Business identifier of the material, for example MAT-00231.",
        "material_code": "Material number used in the purchasing system.",
        "material_description": "Description of the material with size and specification.",
        "material_group": "Purchasing group, for example Valves or Steel and Plate.",
        "equipment_class_name": "Equipment class the material belongs to. Not applicable for bulk materials.",
        "unit_of_measure": "Unit the material is ordered in: ea, tonne, m or l.",
        "standard_unit_price_nok": "Standard price per unit in Norwegian kroner.",
        "standard_lead_time_days": "Typical lead time from order to delivery in days.",
        "is_critical_spare": "True when the material is a critical spare part.",
    },
)

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

# dim_cost_code
describe_table(
    "dim_cost_code",
    business_name="Cost Code",
    description="Cost codes used to book purchase cost, grouped by category and cost type.",
    columns={
        "cost_code_key": "Surrogate key of the cost code.",
        "cost_code_id": "Business identifier of the cost code, for example CC-004.",
        "cost_code": "Cost code number.",
        "cost_code_name": "Name of the cost code.",
        "cost_category": "Cost category, for example Materials or Subcontract.",
        "cost_type": "Direct or Indirect cost.",
    },
)

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "synapse_pyspark"
# META }

# MARKDOWN ********************

# ## Facts

# CELL ********************

# fact_activity_progress
describe_table(
    "fact_activity_progress",
    business_name="Activity Progress",
    description="Weekly progress snapshot per activity: planned versus actual percent complete and hours booked. One row per activity and week ending date.",
    columns={
        "week_ending_date_key": "Date key of the week ending date (Sunday). Joins to Date.",
        "project_key": "Key of the project the activity belongs to.",
        "activity_key": "Key of the activity.",
        "discipline_key": "Key of the discipline of the activity.",
        "resource_key": "Key of the resource assigned to the activity.",
        "planned_percent_complete": "Percent complete according to the baseline plan at the week ending date, from 0 to 100.",
        "actual_percent_complete": "Reported percent complete at the week ending date, from 0 to 100.",
        "percent_complete_variance": "Actual minus planned percent complete. Negative values mean behind plan.",
        "is_behind_plan": "1 when actual percent complete is more than 15 points below plan at the week ending date, otherwise 0.",
        "hours_booked_in_week": "Hours booked on the activity during the week.",
        "cumulative_hours_booked": "Hours booked on the activity from the start up to the week ending date. Not additive over weeks.",
    },
)

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

# fact_work_order
describe_table(
    "fact_work_order",
    business_name="Work Orders",
    description="One row per maintenance or modification work order on an installation, with effort, cost and downtime.",
    columns={
        "reported_date_key": "Date key of the day the work order was reported. Joins to Date.",
        "actual_finish_date_key": "Date key of the actual finish date. Empty until the work order is finished.",
        "installation_key": "Key of the installation the work is done on.",
        "equipment_key": "Key of the equipment tag the work is done on.",
        "discipline_key": "Key of the discipline responsible for the work.",
        "contractor_supplier_key": "Key of the contractor that does the work. Minus one when the work is done in-house.",
        "work_order_id": "Business identifier of the work order, for example WO-0004211.",
        "work_order_type": "Type of work: Preventive, Corrective, Inspection, Modification or Shutdown.",
        "priority": "Priority from 1 (highest) to 4 (lowest).",
        "work_order_status": "Status: Planned, In progress, Completed or Cancelled.",
        "failure_mode": "Failure mode for corrective work, for example Seal failure. Not applicable for other types.",
        "work_order_description": "Short description of the work.",
        "is_safety_critical": "True when the work concerns safety critical equipment.",
        "planned_hours": "Planned labour hours.",
        "actual_hours": "Labour hours booked so far.",
        "hours_variance": "Actual minus planned hours for completed work orders. Zero for others.",
        "labour_cost_nok": "Labour cost in Norwegian kroner.",
        "material_cost_nok": "Material cost in Norwegian kroner.",
        "total_cost_nok": "Labour plus material cost in Norwegian kroner.",
        "downtime_hours": "Production downtime caused by the work order in hours.",
        "days_to_complete": "Days from reported date to actual finish date. Empty until finished.",
        "is_completed": "1 when the work order is completed, otherwise 0.",
        "is_corrective": "1 when the work order is corrective, otherwise 0.",
    },
)

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

# fact_purchase_order_line
describe_table(
    "fact_purchase_order_line",
    business_name="Purchase Order Lines",
    description="One row per purchase order line: what was ordered from which supplier for which project, with value and delivery performance.",
    columns={
        "order_date_key": "Date key of the order date. Joins to Date.",
        "promised_delivery_date_key": "Date key of the promised delivery date.",
        "actual_delivery_date_key": "Date key of the actual delivery date. Empty until delivered.",
        "project_key": "Key of the project the order is placed for.",
        "supplier_key": "Key of the supplier.",
        "material_key": "Key of the material.",
        "cost_code_key": "Key of the cost code the line is booked on.",
        "purchase_order_id": "Business identifier of the purchase order, for example PO-001204.",
        "purchase_order_line_id": "Business identifier of the purchase order line.",
        "line_number": "Line number within the purchase order.",
        "po_status": "Status of the purchase order: Open or Closed.",
        "line_status": "Status of the line: Open, Partially received, Delivered or Cancelled.",
        "currency_code": "Currency the order was placed in.",
        "exchange_rate_to_nok": "Exchange rate used to convert the order currency to Norwegian kroner.",
        "incoterms": "Incoterms agreed for delivery.",
        "buyer_name": "Name of the buyer who placed the order.",
        "quantity_ordered": "Ordered quantity in the unit of measure of the material.",
        "quantity_received": "Quantity received so far.",
        "quantity_rejected": "Received quantity rejected at inspection.",
        "unit_price_nok": "Price per unit in Norwegian kroner before discount.",
        "discount_percent": "Discount given on the line in percent.",
        "line_amount_nok": "Line value in Norwegian kroner after discount.",
        "delivery_delay_days": "Actual minus promised delivery date in days. Positive is late. Empty until delivered.",
        "is_delivered": "1 when at least part of the line has been delivered, otherwise 0.",
        "is_late_delivery": "1 when the line was delivered after the promised date, otherwise 0.",
    },
)

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "synapse_pyspark"
# META }
