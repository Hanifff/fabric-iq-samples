# Set up the sample

## Prerequisites

- Python 3.12, Azure CLI and an Entra account.
- A separate workspace assigned to an active Fabric capacity.
- Contributor or higher in the workspace; Read/Build permission on the models.
- Tenant settings permitting Fabric data agents and Power BI Execute Queries.
- For preflight's capacity check, capacity administrator or contributor access.

The Lakehouse Load Table and List Tables APIs are preview. Check tenant and
region availability before deploying.

## 1. Install and validate

From the repository root:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
az login
python tools/validate_silver_data.py
python tools/setup_workshop.py --check-local
python -m unittest discover -s tests
export WORKSPACE_ID="YOUR-WORKSPACE-GUID"
```

On PowerShell, activate with `.venv\Scripts\Activate.ps1`. Set
`$env:WORKSPACE_ID = "YOUR-WORKSPACE-GUID"` and use `$env:WORKSPACE_ID` below.
Find the workspace GUID in its Fabric URL.

The batch snapshot is dated 8 October 2026; only telemetry is live. Regenerate
the same sample with `python tools/gen_silver_data.py --as-of 2026-10-08`.

## 2. Deploy the foundation

```bash
python tools/setup_workshop.py --workspace-id "$WORKSPACE_ID" \
  --phase foundation --confirm-data-replace
python tools/preflight.py --workspace-id "$WORKSPACE_ID"
```

Setup creates non-schema lakehouses, loads silver, runs gold transformation and
description notebooks, then creates and refreshes the semantic models. It waits
for each result. Cold Spark startup and table loads take time.

Expected: 18 silver tables, 13 gold tables, and these semantic-model fact counts:

| Model | Rows |
|---|---:|
| Planning | 119,141 |
| Maintenance | 8,525 |
| Procurement | 12,739 |

If refresh fails on credentials, check the model's **Gateway and cloud
connections** settings as its owner, sign in to the OneLake connection, refresh,
then rerun preflight.

Apply the corresponding [Prep for AI instructions](ai-instructions/README.md)
in each semantic model. The files identify the target model and contain a
plain-text block to paste. Setup does not apply these settings automatically.

## 3. Deploy and test streaming

```bash
python tools/setup_workshop.py --workspace-id "$WORKSPACE_ID" --phase streaming
python tools/verify_streaming.py --workspace-id "$WORKSPACE_ID" --seconds 120
python tools/preflight.py --workspace-id "$WORKSPACE_ID" --streaming
```

The producer sends events and verifies the exact sent and distinct-event counts
in Eventhouse. It does not just inspect existing data. Preflight requires all
twelve tags within the latest five-minute window. If ingestion fails, inspect
the Eventstream custom endpoint, running state and Eventhouse destination.

Default faults are cyclic. `--fault-mode normal` sends normal readings;
`--fault-mode fault` raises vibration on the first selected pump. These are test
signals, not engineering safety limits. Do not run multiple producers during
an exact-count test.

## 4. Deploy the subject-area agents

```bash
python tools/setup_workshop.py --workspace-id "$WORKSPACE_ID" --phase agents
```

Open each agent, review its sources and instructions, and confirm it is published.
Test maintenance's total work orders (8,525), procurement's order-line count
(12,739) and planning's progress-row count (119,141). Inspect the generated query.

Run `nb_contoso_dev_swc_agent_eval_domains_01` interactively for more questions.
Use `sandbox` for draft or `production` for published agents. It installs the
evaluation SDK inside Fabric; run one evaluation at a time.

The planning agent can describe monthly forecast data, but this package does not
create Plan writeback. Remove that guidance until you configure your own forecast
source. Never substitute the completion estimate for monthly predicted hours.

## Reruns and cleanup

- Foundation always rewrites the sample tables; it requires confirmation.
- Definitions are kept by default. `--update` replaces them and can overwrite
  UI edits or reset connections.
- Failures stop setup without rollback. Inspect partial items and timed-out jobs
  before retrying. Do not run overlapping transformations.
- Scripts do not create, resume or suspend capacity, change access or delete items.
- Stop producers and notebook runs. Delete only the disposable workspace you
  created. Have the capacity owner manage its cost and suspension.

## Git and references

These templates contain placeholders; deploy them with the scripts, not a direct
Git sync. For ongoing work, connect the deployed workspace to a separate private
Git repository. Git tracks lakehouse metadata, not the sample table contents or
every user's connection.

- [Fabric Git integration](https://learn.microsoft.com/en-us/fabric/cicd/git-integration/intro-to-git-integration)
- [Lakehouse Git and deployment behaviour](https://learn.microsoft.com/en-us/fabric/data-engineering/lakehouse-git-deployment-pipelines)
- [Prepare Power BI data for AI](https://learn.microsoft.com/en-us/power-bi/create-reports/copilot-prepare-data-ai)
