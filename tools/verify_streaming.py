#!/usr/bin/env python3
"""Send a bounded probe through Eventstream and verify it in Eventhouse.

Uses the notebook's actual generator and Azure CLI Entra identity, without
starting Spark or an unattended endless producer. Never prints SAS keys.
"""
import argparse
import ast
import base64
import json
import math
import random
import sys
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd
from azure.eventhub import EventData, EventHubProducerClient
from azure.kusto.data import KustoClient, KustoConnectionStringBuilder

from deploy_fabric import Fabric
from setup_workshop import find

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--seconds", type=int, default=120)
    parser.add_argument("--fault-mode", choices=("cyclic", "normal", "fault"), default="cyclic",
                        help="Use a normal run followed by a fault run for an alert-transition test.")
    parser.add_argument("--workspace-id", type=uuid.UUID,
                        help="Target workspace GUID; overrides --workspace.")
    parser.add_argument("--workspace", help="Exact target workspace name; no default target.")
    args = parser.parse_args()
    if args.seconds <= 0:
        parser.error("--seconds must be greater than zero")
    if not args.workspace_id and not args.workspace:
        parser.error("Supply --workspace-id or --workspace. This command sends events.")
    fabric = Fabric()
    if args.workspace_id:
        ws = str(args.workspace_id)
    else:
        matches = [w for w in fabric.list("/workspaces") if w["displayName"] == args.workspace]
        if len(matches) != 1:
            parser.error("Workspace name did not resolve uniquely. Supply --workspace-id.")
        ws = matches[0]["id"]
    items = fabric.list(f"/workspaces/{ws}/items")
    es = find(items, "es_contoso_dev_swc_telemetry_01", "Eventstream")
    db = find(items, "kdb_contoso_dev_swc_telemetry_01", "KQLDatabase")
    definition = fabric.call("POST", f"/workspaces/{ws}/eventstreams/{es['id']}/getDefinition")
    part = next(p for p in definition["definition"]["parts"] if p["path"] == "eventstream.json")
    source = json.loads(base64.b64decode(part["payload"]))["sources"][0]
    connection = fabric.call(
        "GET", f"/workspaces/{ws}/eventstreams/{es['id']}/sources/{source['id']}/connection",
    )
    namespace, hub = connection["fullyQualifiedNamespace"], connection["eventHubName"]
    del connection

    data = ROOT / "data" / "silver"
    assets = (
        pd.read_parquet(data / "tag.parquet")
        .merge(pd.read_parquet(data / "equipment_class.parquet"), on="equipment_class_id")
        .merge(pd.read_parquet(data / "installation.parquet"), on="installation_id")
    )
    assets = assets[
        assets.equipment_class_group.isin(["Pumps", "Compressors and Turbines"])
        & (assets.installation_status == "Operating")
    ].sort_values("tag_id").head(12)
    assets = assets[
        ["installation_id", "installation_name", "tag_id", "tag_number", "equipment_class_name"]
    ].to_dict("records")
    if len(assets) != 12:
        sys.exit(f"Expected 12 telemetry assets; found {len(assets)}. Validate the sample data.")
    notebook = ROOT / "fabric/Notebooks/nb_contoso_dev_swc_telemetry_01.Notebook/notebook-content.py"
    text = "\n".join(line for line in notebook.read_text().splitlines() if not line.startswith("%"))
    tree = ast.parse(text)
    functions = ast.Module(
        body=[node for node in tree.body if isinstance(node, ast.FunctionDef)], type_ignores=[],
    )
    scope = {
        "math": math, "random": random, "uuid": uuid, "json": json, "time": time,
        "datetime": datetime, "timezone": timezone, "EventData": EventData,
    }
    exec(compile(functions, str(notebook), "exec"), scope)
    with EventHubProducerClient(
        fully_qualified_namespace=namespace, eventhub_name=hub,
        credential=fabric.cred, uamqp_transport=False,
    ) as producer:
        run_id, count = scope["send_readings"](producer, assets, 1, args.seconds, 20261013, args.fault_mode)

    properties = fabric.call("GET", f"/workspaces/{ws}/kqlDatabases/{db['id']}")["properties"]
    kcsb = KustoConnectionStringBuilder.with_token_provider(
        properties["queryServiceUri"],
        lambda: fabric.cred.get_token("https://kusto.kusto.windows.net/.default").token,
    )
    query = (
        f"EquipmentTelemetry | where run_id == '{run_id}' "
        "| summarize rows=count(), unique_events=dcount(event_id), tags=dcount(tag_id), "
        "first_event=min(event_time), last_event=max(event_time), "
        "min_temp=min(temperature_c), max_temp=max(temperature_c), "
        "faults=countif(anomaly_type == 'BearingWear')"
    )
    with KustoClient(kcsb) as client:
        deadline = time.monotonic() + 300
        while True:
            table = client.execute_query(db["id"], query).primary_results[0]
            values = dict(zip([c.column_name for c in table.columns], table[0]))
            print(values, flush=True)
            if values["rows"] == count and values["unique_events"] == count:
                break
            if time.monotonic() >= deadline:
                sys.exit(f"Ingestion verification failed: sent {count}, got {values['rows']}.")
            time.sleep(10)
    print(f"Verified {count} events through Eventstream into Eventhouse.")


if __name__ == "__main__":
    main()
