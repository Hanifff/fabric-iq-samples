#!/usr/bin/env python3
"""Read-only checks of deployed tables, semantic models and optional live telemetry."""
from __future__ import annotations

import argparse
from uuid import UUID

import requests
import pyarrow.parquet as parquet
from azure.kusto.data import KustoClient, KustoConnectionStringBuilder

from deploy_fabric import Fabric
from gold_model import TABLES
from setup_workshop import GOLD, KQL, ROOT, SILVER, find


def check_capacity(fabric, workspace):
    details = fabric.call("GET", f"/workspaces/{workspace}")
    capacity_id = details.get("capacityId")
    if not capacity_id:
        raise RuntimeError("Assign a Fabric capacity to this workspace first.")
    capacities = [c for c in fabric.list("/capacities") if c["id"] == capacity_id]
    if len(capacities) != 1:
        raise RuntimeError("Capacity is not visible to this identity. A capacity administrator or contributor must run preflight.")
    capacity = capacities[0]
    if capacity["state"] != "Active":
        raise RuntimeError(f"Capacity is {capacity['state']}. Ask its owner to resume it; preflight will not do so.")
    print(f"PASS capacity: {capacity['sku']}, Active.")


def check_tables(fabric, workspace, items, name, expected):
    lakehouse = find(items, name, "Lakehouse")
    tables = fabric.list(f"/workspaces/{workspace}/lakehouses/{lakehouse['id']}/tables", key="data")
    missing = set(expected) - {t["name"] for t in tables}
    if missing:
        raise RuntimeError(f"{name}: missing {sorted(missing)}. Run the foundation setup and inspect notebook results.")
    print(f"PASS {name}: {len(expected)} expected tables present.")


def check_models(fabric, workspace, items):
    scope = "https://analysis.windows.net/powerbi/api/.default"
    for area, table, source in [
        ("planning", "Activity Progress", "activity_progress_weekly"),
        ("maintenance", "Work Orders", "work_order"),
        ("procurement", "Purchase Order Lines", "purchase_order_line"),
    ]:
        model = find(items, f"sm_contoso_dev_swc_{area}_01", "SemanticModel")
        token = fabric.cred.get_token(scope).token
        response = requests.post(
            f"https://api.powerbi.com/v1.0/myorg/groups/{workspace}/datasets/{model['id']}/executeQueries",
            headers={"Authorization": f"Bearer {token}"}, timeout=120,
            json={"queries": [{"query": f'EVALUATE ROW("Rows", COUNTROWS(\'{table}\'))'}]},
        )
        if response.status_code != 200:
            raise RuntimeError(
                f"{area}: DAX query failed with HTTP {response.status_code}. "
                "Refresh the model and check its OneLake connection, Read/Build permission "
                "and the Execute Queries tenant setting."
            )
        result = response.json()
        if result.get("error") or any(r.get("error") for r in result.get("results", [])):
            raise RuntimeError(f"{area}: DAX returned an error. Check ownership, source connection and refresh.")
        rows = result["results"][0]["tables"][0]["rows"]
        expected = parquet.ParquetFile(ROOT / "data/silver" / f"{source}.parquet").metadata.num_rows
        if len(rows) != 1 or rows[0].get("[Rows]") != expected:
            raise RuntimeError(f"{area}: expected {expected} fact rows. Refresh the model after loading gold and check joins.")
        print(f"PASS {area}: DAX reads {rows[0]['[Rows]']:,} fact rows.")


def check_streaming(fabric, workspace, items):
    database = find(items, KQL, "KQLDatabase")
    properties = fabric.call("GET", f"/workspaces/{workspace}/kqlDatabases/{database['id']}")["properties"]
    connection = KustoConnectionStringBuilder.with_token_provider(
        properties["queryServiceUri"],
        lambda: fabric.cred.get_token("https://kusto.kusto.windows.net/.default").token,
    )
    with KustoClient(connection) as client:
        result = client.execute_query(database["id"], """
EquipmentTelemetry
| where event_time > ago(5m)
| summarize readings=count(), tags=dcount(tag_id), latest=max(event_time)
""").primary_results[0]
        row = dict(zip([c.column_name for c in result.columns], result[0]))
        if row["readings"] < 12 or row["tags"] != 12:
            raise RuntimeError("Expected all 12 tags in the last five minutes. Run verify_streaming.py and retry.")
        print(f"PASS telemetry: {row['readings']} readings across 12 tags in the last five minutes.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workspace-id", type=UUID, required=True)
    parser.add_argument("--streaming", action="store_true", help="Require fresh telemetry for all 12 tags.")
    args = parser.parse_args()
    workspace = str(args.workspace_id)
    fabric = Fabric()
    check_capacity(fabric, workspace)
    items = fabric.list(f"/workspaces/{workspace}/items")
    check_tables(fabric, workspace, items, SILVER, [p.stem for p in (ROOT / "data/silver").glob("*.parquet")])
    check_tables(fabric, workspace, items, GOLD, TABLES)
    check_models(fabric, workspace, items)
    if args.streaming:
        check_streaming(fabric, workspace, items)
    print("Preflight passed for the selected checks. Agent answers, forecast and approval actions need separate tests.")


if __name__ == "__main__":
    main()
