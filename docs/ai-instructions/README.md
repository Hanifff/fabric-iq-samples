# Semantic-model AI instructions

Copy-and-paste instructions for **Prep data for AI** in Power BI/Fabric.
Each file contains one plain-text block.

| File | Target semantic model | Covers |
|---|---|---|
| [Planning](planning.md) | `sm_contoso_dev_swc_planning_01` | Progress, hours, snapshot handling and completion estimates |
| [Maintenance](maintenance.md) | `sm_contoso_dev_swc_maintenance_01` | Work orders, date roles, costs and downtime |
| [Procurement](procurement.md) | `sm_contoso_dev_swc_procurement_01` | Order value, deliveries, supplier comparisons and units |

## Apply

1. Open the corresponding semantic model in the Fabric/Power BI service.
2. Select **Prep data for AI > AI instructions**.
3. Copy only the plain-text block from the matching file. Review any existing
   instructions before replacing them.
4. Save/close the dialog. Reopen the Copilot pane to test; changes can take a
   few minutes to appear.

These are **semantic-model instructions**, not data-agent instructions or
VS Code/GitHub Copilot customization files. The setup script does not paste
them for you. AI data schema selection and verified answers are separate settings.
Prep data for AI is documented as preview.

## Test

| Model | Example question | Check in the query and answer |
|---|---|---|
| Planning | Which activities were more than 15 percentage points behind plan in the week ending 4 October 2026? | One week, actual minus planned progress; no summing cumulative values |
| Maintenance | How many work orders finished in September 2026? | `Completed Work Orders By Finish Date`, not the reporting-date cohort |
| Procurement | What was the on-time delivery percentage for orders placed in September 2026? | Order-date cohort, delivered-line denominator, stated filters |

These files describe the included synthetic snapshot, dated 8 October 2026.
Review names, measures, date assumptions and business rules before adapting them
to another model. They neither enforce access controls nor guarantee answers.

[Microsoft Learn: prepare data for AI](https://learn.microsoft.com/en-us/power-bi/create-reports/copilot-prepare-data-ai)
