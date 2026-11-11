/**
 * DAX queries the dashboard sends through the semantic model connectors.
 * Each query lists its output fields in column order; rows are mapped by
 * position, so the aliases in the DAX text are for readability only.
 */
export type ModelName = 'planning' | 'maintenance' | 'procurement';

export interface DaxQuery {
  model: ModelName;
  fields: readonly string[];
  dax: string;
}

const q = (model: ModelName, fields: readonly string[], dax: string): DaxQuery => ({
  model,
  fields,
  dax: dax.trim(),
});

/** Monthly window ending at the last date that has facts (24 months). */
const window = (fact: string, months = 24) => `
VAR _end = CALCULATE(MAX('Date'[Date]), ${fact})
VAR _start = EDATE(EOMONTH(_end, -1) + 1, -${months - 1})
VAR _dates = FILTER(ALL('Date'[Date]), 'Date'[Date] >= _start && 'Date'[Date] <= _end)`;

export const QUERIES = {
  planningKpi: q(
    'planning',
    ['hours', 'weighted', 'behind', 'overrun', 'baseline', 'forecast', 'activeProjects', 'asOf'],
    `
DEFINE VAR _end = CALCULATE(MAX('Date'[Date]), 'Activity Progress')
EVALUATE ROW(
  "Hours", [Total Hours Booked],
  "Weighted", [Weighted Percent Complete],
  "Behind", CALCULATE([Percent Activities Behind Plan], 'Date'[Date] = _end),
  "Overrun", [Forecast Overrun Rate],
  "Baseline", [Baseline Hours],
  "Forecast", [Forecast Hours At Completion],
  "ActiveProjects", CALCULATE(DISTINCTCOUNT(Project[Project ID]), Project[Project Status] = "Execution"),
  "AsOf", _end
)`
  ),

  planningTrend: q(
    'planning',
    ['month', 'hours', 'actual', 'planned', 'behind'],
    `
DEFINE ${window("'Activity Progress'")}
EVALUATE
SUMMARIZECOLUMNS(
  'Date'[Year Month], _dates,
  "Hours", [Total Hours Booked],
  "Actual", [Average Actual Percent Complete],
  "Planned", [Average Planned Percent Complete],
  "Behind", [Percent Activities Behind Plan]
)
ORDER BY 'Date'[Year Month]`
  ),

  projects: q(
    'planning',
    ['name', 'code', 'segment', 'status', 'yard', 'contractValue', 'baseline', 'weighted', 'overrun', 'forecast', 'hours'],
    `
EVALUATE
SUMMARIZECOLUMNS(
  Project[Project Name], Project[Project Code], Project[Segment], Project[Project Status],
  Project[Yard Location], Project[Contract Value (NOK)],
  "Baseline", [Baseline Hours],
  "Weighted", [Weighted Percent Complete],
  "Overrun", [Forecast Overrun Rate],
  "Forecast", [Forecast Hours At Completion],
  "Hours", [Total Hours Booked]
)`
  ),

  disciplines: q(
    'planning',
    ['discipline', 'group', 'hours', 'behind'],
    `
EVALUATE
SUMMARIZECOLUMNS(
  Discipline[Discipline Name], Discipline[Discipline Group],
  "Hours", [Total Hours Booked],
  "Behind", [Percent Activities Behind Plan]
)
ORDER BY [Hours] DESC`
  ),

  yards: q(
    'planning',
    ['yard', 'country', 'projects', 'contractValue', 'hours'],
    `
EVALUATE
SUMMARIZECOLUMNS(
  Project[Yard Location], Project[Country Code],
  "Projects", DISTINCTCOUNT(Project[Project ID]),
  "ContractValue", SUM(Project[Contract Value (NOK)]),
  "Hours", [Total Hours Booked]
)`
  ),

  maintenanceKpi: q(
    'maintenance',
    ['workOrders', 'correctiveShare', 'cost', 'downtime', 'daysToComplete', 'completed', 'asOf'],
    `
EVALUATE ROW(
  "WorkOrders", [Work Order Count],
  "CorrectiveShare", [Corrective Share],
  "Cost", [Total Cost NOK],
  "Downtime", [Total Downtime Hours],
  "Days", [Average Days To Complete],
  "Completed", [Completed Work Orders],
  "AsOf", CALCULATE(MAX('Date'[Date]), 'Work Orders')
)`
  ),

  maintenanceTrend: q(
    'maintenance',
    ['month', 'workOrders', 'corrective', 'cost', 'downtime'],
    `
DEFINE ${window("'Work Orders'")}
EVALUATE
SUMMARIZECOLUMNS(
  'Date'[Year Month], _dates,
  "WorkOrders", [Work Order Count],
  "Corrective", [Corrective Work Orders],
  "Cost", [Total Cost NOK],
  "Downtime", [Total Downtime Hours]
)
ORDER BY 'Date'[Year Month]`
  ),

  workOrderHeatmap: q(
    'maintenance',
    ['installation', 'month', 'workOrders', 'cost'],
    `
DEFINE ${window("'Work Orders'", 12)}
EVALUATE
SUMMARIZECOLUMNS(
  Installation[Installation Name], 'Date'[Year Month], _dates,
  "WorkOrders", [Work Order Count],
  "Cost", [Total Cost NOK]
)`
  ),

  workOrderTypes: q(
    'maintenance',
    ['type', 'workOrders', 'cost', 'downtime'],
    `
EVALUATE
SUMMARIZECOLUMNS(
  'Work Orders'[Work Order Type],
  "WorkOrders", [Work Order Count],
  "Cost", [Total Cost NOK],
  "Downtime", [Total Downtime Hours]
)
ORDER BY [WorkOrders] DESC`
  ),

  installations: q(
    'maintenance',
    ['name', 'type', 'field', 'country', 'status', 'waterDepth', 'workOrders', 'cost', 'correctiveShare', 'downtime'],
    `
EVALUATE
SUMMARIZECOLUMNS(
  Installation[Installation Name], Installation[Installation Type], Installation[Field Name],
  Installation[Country Code], Installation[Operating Status], Installation[Water Depth (m)],
  "WorkOrders", [Work Order Count],
  "Cost", [Total Cost NOK],
  "CorrectiveShare", [Corrective Share],
  "Downtime", [Total Downtime Hours]
)`
  ),

  equipmentGroups: q(
    'maintenance',
    ['group', 'corrective', 'workOrders', 'downtime'],
    `
EVALUATE
TOPN(10,
  SUMMARIZECOLUMNS(
    Equipment[Equipment Class Group],
    "Corrective", [Corrective Work Orders],
    "WorkOrders", [Work Order Count],
    "Downtime", [Total Downtime Hours]
  ),
  [Corrective], DESC
)
ORDER BY [Corrective] DESC`
  ),

  procurementKpi: q(
    'procurement',
    ['orderValue', 'openValue', 'onTime', 'delay', 'rejection', 'purchaseOrders', 'asOf'],
    `
EVALUATE ROW(
  "OrderValue", [Order Value NOK],
  "OpenValue", [Open Order Value NOK],
  "OnTime", [On Time Delivery Percent],
  "Delay", [Average Delivery Delay Days],
  "Rejection", [Rejection Rate],
  "PurchaseOrders", [Purchase Orders],
  "AsOf", CALCULATE(MAX('Date'[Date]), 'Purchase Order Lines')
)`
  ),

  procurementTrend: q(
    'procurement',
    ['month', 'orderValue', 'lines', 'delivered', 'onTime'],
    `
DEFINE ${window("'Purchase Order Lines'")}
MEASURE 'Purchase Order Lines'[_OnTimeByDelivery] =
  DIVIDE(
    CALCULATE([Delivered Lines] - [Late Delivered Lines], USERELATIONSHIP('Purchase Order Lines'[Actual Delivery Date Key], 'Date'[Date Key])),
    [Delivered Lines By Delivery Date]
  )
EVALUATE
SUMMARIZECOLUMNS(
  'Date'[Year Month], _dates,
  "OrderValue", [Order Value NOK],
  "Lines", [Order Lines],
  "Delivered", [Delivered Lines By Delivery Date],
  "OnTime", [_OnTimeByDelivery]
)
ORDER BY 'Date'[Year Month]`
  ),

  supplyFlows: q(
    'procurement',
    ['country', 'materialGroup', 'segment', 'orderValue'],
    `
EVALUATE
SUMMARIZECOLUMNS(
  Supplier[Country Code], Material[Material Group], Project[Segment],
  "OrderValue", [Order Value NOK]
)`
  ),

  materialGroups: q(
    'procurement',
    ['group', 'orderValue', 'onTime', 'delay', 'lines'],
    `
EVALUATE
SUMMARIZECOLUMNS(
  Material[Material Group],
  "OrderValue", [Order Value NOK],
  "OnTime", [On Time Delivery Percent],
  "Delay", [Average Delivery Delay Days],
  "Lines", [Order Lines]
)
ORDER BY [OrderValue] DESC`
  ),

  supplierCountries: q(
    'procurement',
    ['country', 'suppliers', 'orderValue', 'onTime', 'delay'],
    `
EVALUATE
FILTER(
  SUMMARIZECOLUMNS(
    Supplier[Country Code],
    "Suppliers", CALCULATE(DISTINCTCOUNT('Purchase Order Lines'[Supplier Key])),
    "OrderValue", [Order Value NOK],
    "OnTime", [On Time Delivery Percent],
    "Delay", [Average Delivery Delay Days]
  ),
  NOT ISBLANK([OrderValue])
)`
  ),

  topSuppliers: q(
    'procurement',
    ['supplier', 'country', 'category', 'rating', 'orderValue', 'onTime', 'delay'],
    `
EVALUATE
TOPN(12,
  SUMMARIZECOLUMNS(
    Supplier[Supplier Name], Supplier[Country Code], Supplier[Supplier Category], Supplier[Quality Rating],
    "OrderValue", [Order Value NOK],
    "OnTime", [On Time Delivery Percent],
    "Delay", [Average Delivery Delay Days]
  ),
  [OrderValue], DESC
)
ORDER BY [OrderValue] DESC`
  ),
} as const satisfies Record<string, DaxQuery>;

export type QueryName = keyof typeof QUERIES;
