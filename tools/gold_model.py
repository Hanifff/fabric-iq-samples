"""Gold layer specification for the Contoso sample.

Single source of truth for the gold star schemas: tables, columns, descriptions,
measures and relationships. tools/build_semantic_models.py turns this into TMDL.
The silver to gold notebook builds tables with exactly these column names, in
this order.

Naming: gold lakehouse columns are snake_case. Semantic model names are
business-friendly (spaces, title case). Every table and column has a description.
"""
from __future__ import annotations

from dataclasses import dataclass, field

GOLD_LAKEHOUSE = "lh_contoso_dev_swc_gold_01"


@dataclass
class Col:
    name: str
    dtype: str  # string | int64 | double | date | boolean
    description: str
    display: str | None = None
    hidden: bool = False
    summarize: str = "none"  # none | sum
    fmt: str | None = None
    sort_by: str | None = None  # source column name of the sort column

    @property
    def display_name(self) -> str:
        if self.display:
            return self.display
        words = {"id": "ID", "nok": "NOK", "kg": "KG", "po": "PO"}
        return " ".join(words.get(w, w.capitalize()) for w in self.name.split("_"))


@dataclass
class Table:
    name: str
    display: str
    description: str
    columns: list[Col]
    is_date: bool = False

    def col(self, source_name: str) -> Col:
        return next(c for c in self.columns if c.name == source_name)


def key(name, description, display=None):
    return Col(name, "int64", description, display=display, hidden=True)


def s(name, description, display=None, **kw):
    return Col(name, "string", description, display=display, **kw)


def i(name, description, display=None, **kw):
    return Col(name, "int64", description, display=display, **kw)


def d(name, description, display=None, **kw):
    return Col(name, "double", description, display=display, **kw)


def dt(name, description, display=None, **kw):
    return Col(name, "date", description, display=display, fmt="yyyy-mm-dd", **kw)


def b(name, description, display=None, **kw):
    return Col(name, "boolean", description, display=display, **kw)


TABLES: dict[str, Table] = {}


def add(t: Table) -> None:
    TABLES[t.name] = t


# ---------------------------------------------------------------------------
# Dimensions
# ---------------------------------------------------------------------------
add(Table("dim_date", "Date", "Calendar table with one row per day from 2022 to 2029. Use it to slice every fact by day, week, month, quarter and year.", [
    key("date_key", "Surrogate key for the day in yyyymmdd form. Used by fact tables to join to the calendar."),
    dt("date", "Calendar date.", "Date"),
    i("year", "Calendar year, for example 2026.", "Year", fmt="0"),
    i("quarter_number", "Calendar quarter number from 1 to 4.", "Quarter Number"),
    s("quarter_label", "Calendar quarter label such as 2026 Q3.", "Quarter", sort_by="quarter_number"),
    i("month_number", "Calendar month number from 1 (January) to 12 (December).", "Month Number"),
    s("month_name", "Full month name, for example September.", "Month", sort_by="month_number"),
    s("month_short_name", "Three-letter month name, for example Sep.", "Month Short Name", sort_by="month_number"),
    s("year_month", "Year and month in yyyy-mm form. Sorts correctly as text.", "Year Month"),
    i("week_of_year", "ISO week number from 1 to 53.", "Week Of Year"),
    i("day_of_week_number", "Day of week where Monday is 1 and Sunday is 7.", "Day Of Week Number"),
    s("day_name", "Day name, for example Monday.", "Day", sort_by="day_of_week_number"),
    b("is_weekend", "True when the day is a Saturday or Sunday.", "Is Weekend"),
], is_date=True))

add(Table("dim_project", "Project", "One row per Contoso project: a fabrication, modification, maintenance or study contract for a client. Shared by planning and procurement.", [
    key("project_key", "Surrogate key of the project."),
    s("project_id", "Business identifier of the project in the source system, for example PRJ-2210."),
    s("project_code", "Short project code used on documents and work packages, for example CON-2403."),
    s("project_name", "Name of the project, built from the asset name and the project type."),
    s("segment", "Business segment: New Build for new facilities or Life Cycle for work on producing assets."),
    s("project_type", "Kind of project, for example Jacket Fabrication, Subsea Tie-in or Maintenance Frame Agreement."),
    s("client_name", "Name of the client that owns the facility and awards the contract."),
    s("installation_name", "Installation the project works on. Not applicable for new build projects.", "Installation Name"),
    s("yard_location", "Fabrication yard or work location of the project."),
    s("country_code", "Two-letter country code where the work is delivered."),
    s("contract_type", "Commercial form of the contract, for example EPC, EPCI, Reimbursable or Frame agreement."),
    d("contract_value_nok", "Contract value in Norwegian kroner. One value per project, so do not sum it across rows of other tables.", "Contract Value (NOK)", fmt="#,0"),
    dt("start_date", "Planned start date of the project.", "Project Start Date"),
    dt("planned_finish_date", "Planned finish date of the project.", "Planned Finish Date"),
    dt("actual_finish_date", "Actual finish date. Empty while the project is not finished.", "Actual Finish Date"),
    s("project_status", "Current status: Planning, Execution, On Hold or Completed."),
    s("project_manager_name", "Name of the responsible project manager."),
    d("planned_total_hours", "Total planned hours over all activities of the project.", "Planned Total Hours", fmt="#,0"),
]))

add(Table("dim_discipline", "Discipline", "Engineering and construction disciplines such as Piping or Electrical. Shared by planning and maintenance.", [
    key("discipline_key", "Surrogate key of the discipline."),
    s("discipline_id", "Business identifier of the discipline, for example DSC-04."),
    s("discipline_code", "Three-letter discipline code, for example PIP."),
    s("discipline_name", "Full name of the discipline."),
    s("discipline_group", "Higher level grouping: Engineering, Fabrication, Construction, Commissioning or Project Support."),
    d("standard_hourly_rate_nok", "Standard cost rate per hour for the discipline in Norwegian kroner.", "Standard Hourly Rate (NOK)", fmt="#,0"),
]))

add(Table("dim_resource", "Resource", "People who plan and execute work, with role, discipline and rate.", [
    key("resource_key", "Surrogate key of the resource. Minus one is the Unassigned member."),
    s("resource_id", "Business identifier of the resource, for example RES-0042. Unassigned for activities without an owner."),
    s("resource_name", "Full name of the person."),
    s("role_title", "Role title combining seniority, discipline and role."),
    s("discipline_name", "Discipline the resource belongs to."),
    s("seniority_level", "Seniority: Junior, Intermediate, Senior or Lead."),
    s("employment_type", "Employee or Contractor."),
    s("home_location", "Home office or yard of the resource."),
    d("hourly_rate_nok", "Hourly cost rate in Norwegian kroner.", "Hourly Rate (NOK)", fmt="#,0"),
]))

add(Table("dim_activity", "Activity", "Planned work activity within a work package, with its schedule, type and status. Work package attributes are included.", [
    key("activity_key", "Surrogate key of the activity."),
    key("project_key", "Key of the project the activity belongs to. Joins to Project. For the ontology; not used by the semantic model relationships."),
    key("discipline_key", "Key of the discipline that does the activity. Joins to Discipline. For the ontology; not used by the semantic model relationships."),
    key("resource_key", "Key of the resource assigned to the activity. Minus one when unassigned. Joins to Resource. For the ontology; not used by the semantic model relationships."),
    s("activity_id", "Business identifier of the activity, for example ACT-004512."),
    s("activity_code", "Structured activity code made of the work package code and a sequence number."),
    s("activity_name", "Short description of the work, for example Weld spool 21-PA-1043."),
    s("activity_type", "Type of work: Design, Document, Procure, Fabricate, Install, Test or Inspect."),
    s("activity_status", "Current status: Not started, In progress or Completed."),
    b("is_critical_path", "True when the activity is on the critical path of the schedule."),
    dt("planned_start_date", "Planned start date of the activity.", "Planned Start Date"),
    dt("planned_finish_date", "Planned finish date of the activity.", "Planned Finish Date"),
    dt("actual_start_date", "Actual start date. Empty when the activity has not started.", "Actual Start Date"),
    dt("actual_finish_date", "Actual finish date. Empty when the activity has not finished.", "Actual Finish Date"),
    d("planned_hours", "Planned hours for the activity. One value per activity.", "Planned Hours", fmt="#,0.0"),
    d("actual_hours", "Hours booked on the activity up to the as-of date. One value per activity.", "Actual Hours", fmt="#,0.0"),
    d("percent_complete", "Latest reported percent complete from 0 to 100.", "Percent Complete", fmt="0.0"),
    s("tag_number", "Tag number of the equipment the activity works on. Not applicable when the work is not tied to a tag.", "Tag Number"),
    s("work_package_id", "Business identifier of the work package the activity belongs to."),
    s("work_package_code", "Structured code of the work package."),
    s("work_package_name", "Name of the work package."),
    s("work_package_type", "Work package type: Engineering, Procurement, Fabrication, Installation, Hook-up, Commissioning, Inspection or Project Controls."),
    s("work_package_status", "Status of the work package derived from its activities."),
]))

add(Table("dim_installation", "Installation", "Producing assets that Contoso maintains, such as platforms, floating units and subsea templates.", [
    key("installation_key", "Surrogate key of the installation."),
    s("installation_id", "Business identifier of the installation, for example INS-004."),
    s("installation_code", "Short code of the installation."),
    s("installation_name", "Name of the installation."),
    s("installation_type", "Type of installation, for example Fixed Platform or Floating Production Unit."),
    s("field_name", "Name of the field the installation produces from."),
    s("operator_name", "Name of the operator of the installation."),
    s("country_code", "Two-letter country code of the continental shelf the installation is on."),
    i("water_depth_m", "Water depth at the installation in metres. Zero for onshore terminals.", "Water Depth (m)", fmt="#,0"),
    i("year_in_service", "Year the installation started production.", "Year In Service", fmt="0"),
    s("operating_status", "Operating status: Producing, Shut in or Late life."),
]))

add(Table("dim_equipment", "Equipment", "Tagged equipment items with their class, system, manufacturer and design data. Classes follow a CFIHOS-style hierarchy.", [
    key("equipment_key", "Surrogate key of the equipment tag."),
    s("tag_id", "Business identifier of the tag, for example TAG-000412."),
    s("tag_number", "Tag number built from system, class abbreviation and sequence, for example 23-KA-1004."),
    s("tag_description", "Description of the tagged item."),
    s("equipment_class_id", "Identifier of the equipment class in a CFIHOS-style class hierarchy, for example CF-30000156."),
    s("equipment_class_name", "Name of the equipment class, for example Centrifugal Pump."),
    s("equipment_class_group", "Group of equipment classes, for example Pumps, Valves or Instrumentation."),
    s("system_code", "Two-digit code of the technical system the item belongs to."),
    s("system_name", "Name of the technical system, for example Gas Compression."),
    s("manufacturer_name", "Manufacturer of the equipment."),
    i("weight_kg", "Dry weight of the item in kilograms.", "Weight (kg)", fmt="#,0"),
    d("design_pressure_bar", "Design pressure in bar. Empty for items that do not contain pressure.", "Design Pressure (bar)", fmt="#,0.0"),
    d("design_temperature_c", "Design temperature in degrees Celsius. Empty for items that do not contain pressure.", "Design Temperature (C)", fmt="#,0"),
    s("criticality_class", "Criticality of the item: A is highest, C is lowest."),
    s("equipment_status", "Lifecycle status: Planned, Fabricated, Installed, Commissioned, Operating, Out of service or Decommissioned."),
]))

add(Table("dim_supplier", "Supplier", "Suppliers and contractors with category, country and quality rating. Shared by procurement and maintenance.", [
    key("supplier_key", "Surrogate key of the supplier. Minus one is the Not applicable member."),
    s("supplier_id", "Business identifier of the supplier, for example SUP-0087."),
    s("supplier_name", "Registered name of the supplier."),
    s("supplier_category", "Main category of goods or services the supplier provides."),
    s("country_code", "Two-letter country code of the supplier."),
    s("approval_status", "Approval status: Approved, Conditional or Suspended."),
    d("quality_rating", "Supplier quality rating from 1.5 to 5.0. Higher is better.", "Quality Rating", fmt="0.0"),
    i("payment_terms_days", "Agreed payment terms in days.", "Payment Terms (days)", fmt="0"),
    b("is_preferred_supplier", "True when the supplier is on the preferred supplier list."),
    dt("onboarded_date", "Date the supplier was onboarded.", "Onboarded Date"),
]))

add(Table("dim_material", "Material", "Materials and equipment that Contoso buys, with group, unit and standard price.", [
    key("material_key", "Surrogate key of the material."),
    s("material_id", "Business identifier of the material, for example MAT-00231."),
    s("material_code", "Material number used in the purchasing system."),
    s("material_description", "Description of the material with size and specification."),
    s("material_group", "Purchasing group, for example Valves or Steel and Plate."),
    s("equipment_class_name", "Equipment class the material belongs to. Not applicable for bulk materials."),
    s("unit_of_measure", "Unit the material is ordered in: ea, tonne, m or l."),
    d("standard_unit_price_nok", "Standard price per unit in Norwegian kroner.", "Standard Unit Price (NOK)", fmt="#,0.00"),
    i("standard_lead_time_days", "Typical lead time from order to delivery in days.", "Standard Lead Time (days)", fmt="0"),
    b("is_critical_spare", "True when the material is a critical spare part."),
]))

add(Table("dim_cost_code", "Cost Code", "Cost codes used to book purchase cost, grouped by category and cost type.", [
    key("cost_code_key", "Surrogate key of the cost code."),
    s("cost_code_id", "Business identifier of the cost code, for example CC-004."),
    s("cost_code", "Cost code number."),
    s("cost_code_name", "Name of the cost code."),
    s("cost_category", "Cost category, for example Materials or Subcontract."),
    s("cost_type", "Direct or Indirect cost."),
]))

# ---------------------------------------------------------------------------
# Facts
# ---------------------------------------------------------------------------
add(Table("fact_activity_progress", "Activity Progress", "Weekly progress snapshot per activity: planned versus actual percent complete and hours booked. One row per activity and week ending date.", [
    key("week_ending_date_key", "Date key of the week ending date (Sunday). Joins to Date."),
    key("project_key", "Key of the project the activity belongs to."),
    key("activity_key", "Key of the activity."),
    key("discipline_key", "Key of the discipline of the activity."),
    key("resource_key", "Key of the resource assigned to the activity."),
    d("planned_percent_complete", "Percent complete according to the baseline plan at the week ending date, from 0 to 100.", "Planned Percent Complete", fmt="0.0"),
    d("actual_percent_complete", "Reported percent complete at the week ending date, from 0 to 100.", "Actual Percent Complete", fmt="0.0"),
    d("percent_complete_variance", "Actual minus planned percent complete. Negative values mean behind plan.", "Percent Complete Variance", fmt="0.0"),
    i("is_behind_plan", "1 when actual percent complete is more than 15 points below plan at the week ending date, otherwise 0.", "Is Behind Plan"),
    d("hours_booked_in_week", "Hours booked on the activity during the week.", "Hours Booked In Week", summarize="sum", fmt="#,0.0"),
    d("cumulative_hours_booked", "Hours booked on the activity from the start up to the week ending date. Not additive over weeks.", "Cumulative Hours Booked", fmt="#,0.0"),
]))

add(Table("fact_work_order", "Work Orders", "One row per maintenance or modification work order on an installation, with effort, cost and downtime.", [
    key("reported_date_key", "Date key of the day the work order was reported. Joins to Date."),
    key("actual_finish_date_key", "Date key of the actual finish date. Empty until the work order is finished."),
    key("installation_key", "Key of the installation the work is done on."),
    key("equipment_key", "Key of the equipment tag the work is done on."),
    key("discipline_key", "Key of the discipline responsible for the work."),
    key("contractor_supplier_key", "Key of the contractor that does the work. Minus one when the work is done in-house."),
    s("work_order_id", "Business identifier of the work order, for example WO-0004211."),
    s("work_order_type", "Type of work: Preventive, Corrective, Inspection, Modification or Shutdown."),
    i("priority", "Priority from 1 (highest) to 4 (lowest).", "Priority", fmt="0"),
    s("work_order_status", "Status: Planned, In progress, Completed or Cancelled."),
    s("failure_mode", "Failure mode for corrective work, for example Seal failure. Not applicable for other types."),
    s("work_order_description", "Short description of the work."),
    b("is_safety_critical", "True when the work concerns safety critical equipment."),
    d("planned_hours", "Planned labour hours.", "Planned Hours", summarize="sum", fmt="#,0.0"),
    d("actual_hours", "Labour hours booked so far.", "Actual Hours", summarize="sum", fmt="#,0.0"),
    d("hours_variance", "Actual minus planned hours for completed work orders. Zero for others.", "Hours Variance", summarize="sum", fmt="#,0.0"),
    d("labour_cost_nok", "Labour cost in Norwegian kroner.", "Labour Cost (NOK)", summarize="sum", fmt="#,0"),
    d("material_cost_nok", "Material cost in Norwegian kroner.", "Material Cost (NOK)", summarize="sum", fmt="#,0"),
    d("total_cost_nok", "Labour plus material cost in Norwegian kroner.", "Total Cost (NOK)", summarize="sum", fmt="#,0"),
    d("downtime_hours", "Production downtime caused by the work order in hours.", "Downtime Hours", summarize="sum", fmt="#,0.0"),
    i("days_to_complete", "Days from reported date to actual finish date. Empty until finished.", "Days To Complete", fmt="0"),
    i("is_completed", "1 when the work order is completed, otherwise 0.", "Is Completed"),
    i("is_corrective", "1 when the work order is corrective, otherwise 0.", "Is Corrective"),
]))

add(Table("fact_purchase_order_line", "Purchase Order Lines", "One row per purchase order line: what was ordered from which supplier for which project, with value and delivery performance.", [
    key("order_date_key", "Date key of the order date. Joins to Date."),
    key("promised_delivery_date_key", "Date key of the promised delivery date."),
    key("actual_delivery_date_key", "Date key of the actual delivery date. Empty until delivered."),
    key("project_key", "Key of the project the order is placed for."),
    key("supplier_key", "Key of the supplier."),
    key("material_key", "Key of the material."),
    key("cost_code_key", "Key of the cost code the line is booked on."),
    s("purchase_order_id", "Business identifier of the purchase order, for example PO-001204."),
    s("purchase_order_line_id", "Business identifier of the purchase order line."),
    i("line_number", "Line number within the purchase order.", "Line Number", fmt="0"),
    s("po_status", "Status of the purchase order: Open or Closed."),
    s("line_status", "Status of the line: Open, Partially received, Delivered or Cancelled."),
    s("currency_code", "Currency the order was placed in."),
    d("exchange_rate_to_nok", "Exchange rate used to convert the order currency to Norwegian kroner.", "Exchange Rate To NOK", fmt="0.0000"),
    s("incoterms", "Incoterms agreed for delivery."),
    s("buyer_name", "Name of the buyer who placed the order."),
    d("quantity_ordered", "Ordered quantity in the unit of measure of the material.", "Quantity Ordered", summarize="sum", fmt="#,0"),
    d("quantity_received", "Quantity received so far.", "Quantity Received", summarize="sum", fmt="#,0"),
    d("quantity_rejected", "Received quantity rejected at inspection.", "Quantity Rejected", summarize="sum", fmt="#,0"),
    d("unit_price_nok", "Price per unit in Norwegian kroner before discount.", "Unit Price (NOK)", fmt="#,0.00"),
    d("discount_percent", "Discount given on the line in percent.", "Discount Percent", fmt="0.0"),
    d("line_amount_nok", "Line value in Norwegian kroner after discount.", "Line Amount (NOK)", summarize="sum", fmt="#,0"),
    i("delivery_delay_days", "Actual minus promised delivery date in days. Positive is late. Empty until delivered.", "Delivery Delay Days", fmt="0"),
    i("is_delivered", "1 when at least part of the line has been delivered, otherwise 0.", "Is Delivered"),
    i("is_late_delivery", "1 when the line was delivered after the promised date, otherwise 0.", "Is Late Delivery"),
]))


# ---------------------------------------------------------------------------
# Semantic models: tables, display overrides, relationships and measures
# ---------------------------------------------------------------------------


@dataclass
class Model:
    name: str
    description: str
    fact: str
    tables: list[str]
    relationships: list[tuple[str, str, str, bool]]  # fact column, dim table, dim column, active
    measures: list[tuple[str, str, str, str]]  # name, DAX, description, format
    display_overrides: dict[str, str] = field(default_factory=dict)


def _rel(fact_col, dim, dim_col, active=True):
    return (fact_col, dim, dim_col, active)


MODELS = [
    Model(
        name="sm_contoso_dev_swc_planning_01",
        description="Project planning star schema: weekly progress of activities against plan, by project, discipline, resource and week.",
        fact="fact_activity_progress",
        tables=["dim_date", "dim_project", "dim_discipline", "dim_resource", "dim_activity", "fact_activity_progress"],
        relationships=[
            _rel("week_ending_date_key", "dim_date", "date_key"),
            _rel("project_key", "dim_project", "project_key"),
            _rel("discipline_key", "dim_discipline", "discipline_key"),
            _rel("resource_key", "dim_resource", "resource_key"),
            _rel("activity_key", "dim_activity", "activity_key"),
        ],
        measures=[
            ("Total Hours Booked", "SUM('Activity Progress'[Hours Booked In Week])", "Hours booked on activities in the selected period.", "#,0"),
            ("Activities Tracked", "DISTINCTCOUNT('Activity Progress'[Activity Key])", "Number of distinct activities with a progress snapshot in the selection.", "#,0"),
            ("Activities Behind Plan", "CALCULATE(DISTINCTCOUNT('Activity Progress'[Activity Key]), 'Activity Progress'[Is Behind Plan] = 1)", "Number of distinct activities more than 15 percentage points behind plan in the selection.", "#,0"),
            ("Percent Activities Behind Plan", "DIVIDE([Activities Behind Plan], [Activities Tracked])", "Share of tracked activities that are behind plan.", "0.0%"),
            ("Average Planned Percent Complete", "AVERAGE('Activity Progress'[Planned Percent Complete])", "Average baseline percent complete over the selected snapshots.", "0.0"),
            ("Average Actual Percent Complete", "AVERAGE('Activity Progress'[Actual Percent Complete])", "Average reported percent complete over the selected snapshots.", "0.0"),
            ("Average Percent Complete Variance", "AVERAGE('Activity Progress'[Percent Complete Variance])", "Average of actual minus planned percent complete. Negative means behind plan.", "0.0"),
            ("Baseline Hours", "CALCULATE(SUM(Activity[Planned Hours]), CROSSFILTER('Activity Progress'[Activity Key], Activity[Activity Key], Both))", "Planned hours of the activities in the selection. The baseline budget. Counts each activity once, whatever the number of weekly snapshots.", "#,0"),
            ("Hours Booked To Date", "CALCULATE(SUM(Activity[Actual Hours]), CROSSFILTER('Activity Progress'[Activity Key], Activity[Activity Key], Both))", "Hours booked on the activities in the selection up to the as-of date. Counts each activity once.", "#,0"),
            ("Earned Hours", "CALCULATE(SUMX(Activity, Activity[Planned Hours] * Activity[Percent Complete] / 100), CROSSFILTER('Activity Progress'[Activity Key], Activity[Activity Key], Both))", "Planned hours times percent complete, added up over the activities. The planned value of the work done.", "#,0"),
            ("Weighted Percent Complete", "DIVIDE([Earned Hours], [Baseline Hours])", "Earned hours divided by baseline hours. Weighted by planned hours.", "0.0%"),
            ("Forecast Hours At Completion", "VAR baseline = [Baseline Hours] VAR earned = [Earned Hours] RETURN IF(earned > 0, DIVIDE(baseline * [Hours Booked To Date], earned), baseline)", "Earned value forecast of total hours at completion: baseline hours times hours booked divided by earned hours. Equals the baseline when no work is done yet.", "#,0"),
            ("Forecast Overrun Rate", "DIVIDE([Forecast Hours At Completion] - [Baseline Hours], [Baseline Hours])", "Forecast hours at completion minus baseline hours, as a share of baseline hours. Positive means overrun.", "0.0%"),
        ],
    ),
    Model(
        name="sm_contoso_dev_swc_maintenance_01",
        description="Maintenance star schema: work orders on installations and equipment, with effort, cost, downtime and contractor.",
        fact="fact_work_order",
        tables=["dim_date", "dim_installation", "dim_equipment", "dim_discipline", "dim_supplier", "fact_work_order"],
        relationships=[
            _rel("reported_date_key", "dim_date", "date_key"),
            _rel("actual_finish_date_key", "dim_date", "date_key", False),
            _rel("installation_key", "dim_installation", "installation_key"),
            _rel("equipment_key", "dim_equipment", "equipment_key"),
            _rel("discipline_key", "dim_discipline", "discipline_key"),
            _rel("contractor_supplier_key", "dim_supplier", "supplier_key"),
        ],
        display_overrides={"dim_supplier": "Contractor"},
        measures=[
            ("Work Order Count", "COUNTROWS('Work Orders')", "Number of work orders in the selection.", "#,0"),
            ("Completed Work Orders", "CALCULATE(COUNTROWS('Work Orders'), 'Work Orders'[Is Completed] = 1)", "Number of completed work orders.", "#,0"),
            ("Corrective Work Orders", "CALCULATE(COUNTROWS('Work Orders'), 'Work Orders'[Is Corrective] = 1)", "Number of corrective work orders.", "#,0"),
            ("Corrective Share", "DIVIDE([Corrective Work Orders], [Work Order Count])", "Share of work orders that are corrective.", "0.0%"),
            ("Total Cost NOK", "SUM('Work Orders'[Total Cost (NOK)])", "Labour plus material cost in Norwegian kroner.", "#,0"),
            ("Labour Cost NOK", "SUM('Work Orders'[Labour Cost (NOK)])", "Labour cost in Norwegian kroner.", "#,0"),
            ("Material Cost NOK", "SUM('Work Orders'[Material Cost (NOK)])", "Material cost in Norwegian kroner.", "#,0"),
            ("Hours Variance Percent", "DIVIDE(CALCULATE(SUM('Work Orders'[Actual Hours]), 'Work Orders'[Is Completed] = 1) - CALCULATE(SUM('Work Orders'[Planned Hours]), 'Work Orders'[Is Completed] = 1), CALCULATE(SUM('Work Orders'[Planned Hours]), 'Work Orders'[Is Completed] = 1))", "Actual versus planned hours for completed work orders. Positive means overrun.", "0.0%"),
            ("Total Downtime Hours", "SUM('Work Orders'[Downtime Hours])", "Production downtime caused by work orders.", "#,0.0"),
            ("Average Days To Complete", "AVERAGE('Work Orders'[Days To Complete])", "Average days from report to finish for finished work orders.", "0.0"),
            ("Completed Work Orders By Finish Date", "CALCULATE([Completed Work Orders], USERELATIONSHIP('Work Orders'[Actual Finish Date Key], 'Date'[Date Key]))", "Completed work orders counted on the date they finished instead of the date they were reported. Uses the inactive finish date relationship.", "#,0"),
        ],
    ),
    Model(
        name="sm_contoso_dev_swc_procurement_01",
        description="Procurement star schema: purchase order lines by project, supplier, material and cost code, with delivery performance.",
        fact="fact_purchase_order_line",
        tables=["dim_date", "dim_project", "dim_supplier", "dim_material", "dim_cost_code", "fact_purchase_order_line"],
        relationships=[
            _rel("order_date_key", "dim_date", "date_key"),
            _rel("promised_delivery_date_key", "dim_date", "date_key", False),
            _rel("actual_delivery_date_key", "dim_date", "date_key", False),
            _rel("project_key", "dim_project", "project_key"),
            _rel("supplier_key", "dim_supplier", "supplier_key"),
            _rel("material_key", "dim_material", "material_key"),
            _rel("cost_code_key", "dim_cost_code", "cost_code_key"),
        ],
        measures=[
            ("Order Value NOK", "SUM('Purchase Order Lines'[Line Amount (NOK)])", "Ordered value in Norwegian kroner after discount.", "#,0"),
            ("Open Order Value NOK", "CALCULATE([Order Value NOK], 'Purchase Order Lines'[Line Status] = \"Open\")", "Value of lines that are still open.", "#,0"),
            ("Order Lines", "COUNTROWS('Purchase Order Lines')", "Number of purchase order lines.", "#,0"),
            ("Purchase Orders", "DISTINCTCOUNT('Purchase Order Lines'[Purchase Order ID])", "Number of distinct purchase orders.", "#,0"),
            ("Delivered Lines", "CALCULATE(COUNTROWS('Purchase Order Lines'), 'Purchase Order Lines'[Is Delivered] = 1)", "Number of lines delivered.", "#,0"),
            ("Late Delivered Lines", "CALCULATE(COUNTROWS('Purchase Order Lines'), 'Purchase Order Lines'[Is Late Delivery] = 1)", "Number of lines delivered after the promised date.", "#,0"),
            ("On Time Delivery Percent", "DIVIDE([Delivered Lines] - [Late Delivered Lines], [Delivered Lines])", "Share of delivered lines that arrived on or before the promised date.", "0.0%"),
            ("Average Delivery Delay Days", "AVERAGE('Purchase Order Lines'[Delivery Delay Days])", "Average days between promised and actual delivery. Positive is late.", "0.0"),
            ("Rejection Rate", "DIVIDE(SUM('Purchase Order Lines'[Quantity Rejected]), SUM('Purchase Order Lines'[Quantity Received]))", "Share of received quantity rejected at inspection.", "0.00%"),
            ("Average Discount Percent", "AVERAGE('Purchase Order Lines'[Discount Percent])", "Average discount given on order lines.", "0.0"),
            ("Order Value By Promised Date NOK", "CALCULATE([Order Value NOK], USERELATIONSHIP('Purchase Order Lines'[Promised Delivery Date Key], 'Date'[Date Key]))", "Order value counted on the promised delivery date instead of the order date. Shows what is due for delivery in a period. Uses the inactive promised date relationship.", "#,0"),
            ("Delivered Lines By Delivery Date", "CALCULATE([Delivered Lines], USERELATIONSHIP('Purchase Order Lines'[Actual Delivery Date Key], 'Date'[Date Key]))", "Delivered lines counted on the date they arrived instead of the order date. Uses the inactive actual delivery date relationship.", "#,0"),
        ],
    ),
]


def validate() -> None:
    for t in TABLES.values():
        assert t.description, t.name
        for c in t.columns:
            assert c.description, f"{t.name}.{c.name}"
    for m in MODELS:
        fact = TABLES[m.fact]
        for fcol, dim, dcol, _ in m.relationships:
            fact.col(fcol)
            TABLES[dim].col(dcol)
        assert 5 <= len(m.tables) <= 6, m.name


validate()
