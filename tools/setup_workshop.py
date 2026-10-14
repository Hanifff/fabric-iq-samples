#!/usr/bin/env python3
"""Install the Contoso sample in a user-supplied Fabric workspace.

Never creates or resumes capacity, changes permissions, or deletes items.
Existing definitions are left alone unless --update is supplied.
"""
from __future__ import annotations

import argparse
import json
import time
from pathlib import Path
from uuid import UUID
from urllib.parse import urlparse

import requests
from azure.core.exceptions import ResourceExistsError
from azure.storage.filedatalake import DataLakeServiceClient

from deploy_fabric import FABRIC_DIR, Fabric, item_definition

ROOT = Path(__file__).resolve().parents[1]
SILVER = "lh_contoso_dev_swc_silver_01"
GOLD = "lh_contoso_dev_swc_gold_01"
EVALUATION = "lh_contoso_dev_swc_evaluation_01"
EVENTHOUSE = "eh_contoso_dev_swc_telemetry_01"
KQL = "kdb_contoso_dev_swc_telemetry_01"
EVENTSTREAM = "es_contoso_dev_swc_telemetry_01"
PHASES = ("foundation", "streaming", "agents")


def find(items, name, kind):
    matches = [i for i in items if i["displayName"] == name and i["type"] == kind]
    if len(matches) != 1:
        raise ValueError(f"Expected one {kind} named {name}; found {len(matches)}.")
    return matches[0]


def placeholders(workspace, items):
    ids = {"WORKSPACE_ID": workspace}
    for key, name, kind in [
        ("SILVER_LAKEHOUSE_ID", SILVER, "Lakehouse"),
        ("GOLD_LAKEHOUSE_ID", GOLD, "Lakehouse"),
        ("EVENTHOUSE_ID", EVENTHOUSE, "Eventhouse"),
        ("KQL_DATABASE_ID", KQL, "KQLDatabase"),
    ]:
        matches = [i for i in items if i["displayName"] == name and i["type"] == kind]
        if matches:
            ids[key] = find(items, name, kind)["id"]
    return ids


def templates(phase):
    if phase == "foundation":
        names = (
            "nb_contoso_dev_swc_silver_to_gold_01",
            "nb_contoso_dev_swc_gold_descriptions_01",
        )
        return (
            [FABRIC_DIR / "Notebooks" / f"{n}.Notebook" for n in names]
            + sorted((FABRIC_DIR / "Semantic-Layer").glob("*.SemanticModel"))
        )
    if phase == "streaming":
        return [
            FABRIC_DIR / "Streaming" / f"{EVENTHOUSE}.Eventhouse",
            FABRIC_DIR / "Streaming" / f"{KQL}.KQLDatabase",
            FABRIC_DIR / "Streaming" / f"{EVENTSTREAM}.Eventstream",
            FABRIC_DIR / "Streaming" / "rtd_contoso_dev_swc_operations_01.KQLDashboard",
            FABRIC_DIR / "Notebooks" / "nb_contoso_dev_swc_telemetry_01.Notebook",
        ]
    if phase == "agents":
        return [FABRIC_DIR / "Agents" / f"da_contoso_dev_swc_{area}_01.DataAgent"
                for area in ("maintenance", "planning", "procurement")] + [
            FABRIC_DIR / "Notebooks" / "nb_contoso_dev_swc_agent_eval_domains_01.Notebook",
        ]
    raise ValueError(f"Unknown setup phase: {phase}")


def check_local():
    """Resolve every shipped template offline."""
    files = sorted((ROOT / "data/silver").glob("*.parquet"))
    if len(files) != 18:
        raise ValueError(f"Expected 18 silver parquet files; found {len(files)}.")
    folders = [p for phase in PHASES for p in templates(phase)]
    items = [{"displayName": n, "type": "Lakehouse", "id": str(UUID(int=i))}
             for i, n in enumerate((SILVER, GOLD, EVALUATION), 1)]
    for i, folder in enumerate(folders, 10):
        metadata = json.loads((folder / ".platform").read_text())["metadata"]
        items.append({**metadata, "id": str(UUID(int=i))})
    ids = placeholders(str(UUID(int=100)), items)
    ids["KUSTO_QUERY_URI"] = "https://example.kusto.fabric.microsoft.com"
    for folder in folders:
        item_definition(folder, ids, folder.suffix[1:], items)
    print(f"Local check passed: {len(files)} data files; {len(folders)} scripted item templates.")


class Setup:
    def __init__(self, fabric, workspace, update=False):
        self.fabric = fabric
        self.workspace = workspace
        self.base = f"/workspaces/{workspace}"
        self.update = update
        self.items = fabric.list(f"{self.base}/items")

    def refresh_items(self):
        self.items = self.fabric.list(f"{self.base}/items")

    def ensure_lakehouse(self, name):
        existing = [i for i in self.items if i["displayName"] == name]
        if existing:
            item = find(self.items, name, "Lakehouse")
        else:
            # Omitting creationPayload creates the non-schema lakehouse used by these notebooks.
            self.fabric.call("POST", f"{self.base}/lakehouses", json={
                "displayName": name, "description": "Contoso synthetic workshop data.",
            })
            self.refresh_items()
            item = find(self.items, name, "Lakehouse")
        details = self.fabric.call("GET", f"{self.base}/lakehouses/{item['id']}")
        if details.get("properties", {}).get("defaultSchema"):
            raise ValueError(f"{name} is schema-enabled. Use a fresh workspace with this script's lakehouses.")
        return item

    def deploy(self, folder):
        metadata = json.loads((folder / ".platform").read_text())["metadata"]
        name, kind = metadata["displayName"], metadata["type"]
        existing = [i for i in self.items if i["displayName"] == name]
        if existing:
            item = find(self.items, name, kind)
            if not self.update:
                print(f"Kept {name}; use --update to replace its definition.", flush=True)
                return item
        ids = placeholders(self.workspace, self.items)
        if kind == "KQLDashboard":
            database = find(self.items, KQL, "KQLDatabase")
            details = self.fabric.call("GET", f"{self.base}/kqlDatabases/{database['id']}")
            ids["KUSTO_QUERY_URI"] = details["properties"]["queryServiceUri"]
        definition = item_definition(folder, ids, kind, self.items)
        if existing:
            self.fabric.call("POST", f"{self.base}/items/{item['id']}/updateDefinition",
                             json={"definition": definition})
        else:
            self.fabric.call("POST", f"{self.base}/items", json={
                "displayName": name, "type": kind,
                "description": metadata.get("description", ""), "definition": definition,
            })
        self.refresh_items()
        print(f"Deployed {name}", flush=True)
        return find(self.items, name, kind)

    def load_silver(self, lakehouse):
        service = DataLakeServiceClient("https://onelake.dfs.fabric.microsoft.com",
                                       credential=self.fabric.cred)
        with service:
            filesystem = service.get_file_system_client(self.workspace)
            directory = filesystem.get_directory_client(f"{lakehouse['id']}/Files/silver_parquet")
            try:
                directory.create_directory()
            except ResourceExistsError:
                print("Using the existing silver upload directory.", flush=True)
            for file in sorted((ROOT / "data/silver").glob("*.parquet")):
                path = f"Files/silver_parquet/{file.name}"
                client = filesystem.get_file_client(f"{lakehouse['id']}/{path}")
                with file.open("rb") as content:
                    client.upload_data(content, overwrite=True)
                self.fabric.call(
                    "POST", f"{self.base}/lakehouses/{lakehouse['id']}/tables/{file.stem}/load",
                    json={"relativePath": path, "pathType": "File", "mode": "Overwrite",
                          "formatOptions": {"format": "Parquet"}},
                )
                print(f"Loaded silver.{file.stem}", flush=True)

    def run_notebook(self, notebook):
        response = self.fabric.request(
            "POST", f"{self.base}/items/{notebook['id']}/jobs/instances?jobType=RunNotebook",
            json={"executionData": {"parameters": {}}},
        )
        if response.status_code != 202:
            raise RuntimeError(f"Notebook start returned HTTP {response.status_code}, expected 202.")
        job_id = UUID(urlparse(response.headers["Location"]).path.rstrip("/").rsplit("/", 1)[-1])
        url = f"{self.base}/items/{notebook['id']}/jobs/instances/{job_id}"
        deadline = time.monotonic() + 3600
        while time.monotonic() < deadline:
            time.sleep(15)
            job = self.fabric.call("GET", url)
            status = job["status"]
            print(f"{notebook['displayName']}: {status}", flush=True)
            if status == "Completed":
                return
            if status in ("Failed", "Cancelled", "Deduped"):
                raise RuntimeError(f"Notebook {status}. Inspect its Fabric run details: {job.get('failureReason')}")
        raise TimeoutError("Notebook exceeded one hour. Inspect/stop its run in Fabric before retrying.")

    def refresh_model(self, model):
        base = f"https://api.powerbi.com/v1.0/myorg/groups/{self.workspace}/datasets/{model['id']}/refreshes"

        def request(method, url, **kwargs):
            token = self.fabric.cred.get_token("https://analysis.windows.net/powerbi/api/.default").token
            response = requests.request(method, url, headers={"Authorization": f"Bearer {token}"},
                                        timeout=120, allow_redirects=False, **kwargs)
            if response.status_code >= 300:
                raise RuntimeError(
                    f"{model['displayName']}: refresh failed with HTTP {response.status_code}. "
                    "Check model ownership, OneLake connection credentials and capacity."
                )
            return response

        response = request("POST", base, json={"type": "full", "commitMode": "transactional"})
        if response.status_code != 202:
            raise RuntimeError(f"Refresh start returned HTTP {response.status_code}, expected 202.")
        refresh_id = UUID(urlparse(response.headers["Location"]).path.rstrip("/").rsplit("/", 1)[-1])
        deadline = time.monotonic() + 1800
        while time.monotonic() < deadline:
            time.sleep(10)
            refresh = request("GET", f"{base}/{refresh_id}").json()
            status = refresh["status"]
            print(f"{model['displayName']}: refresh {status}", flush=True)
            if status == "Completed":
                return
            if status in ("Failed", "Cancelled", "Disabled"):
                raise RuntimeError(f"Model refresh {status}. Inspect refresh history and source connection settings.")
        raise TimeoutError("Model refresh exceeded 30 minutes. Inspect its refresh history before retrying.")

    def foundation(self):
        silver = self.ensure_lakehouse(SILVER)
        self.ensure_lakehouse(GOLD)
        self.ensure_lakehouse(EVALUATION)
        self.load_silver(silver)
        for folder in templates("foundation"):
            item = self.deploy(folder)
            if item["type"] == "Notebook":
                self.run_notebook(item)
            elif item["type"] == "SemanticModel":
                self.refresh_model(item)

    def phase(self, phase):
        if phase == "foundation":
            self.foundation()
        else:
            for folder in templates(phase):
                self.deploy(folder)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workspace-id", type=UUID, help="Target workspace GUID, never inferred.")
    parser.add_argument("--phase", choices=PHASES, default="foundation")
    parser.add_argument("--check-local", action="store_true", help="Validate templates without signing in.")
    parser.add_argument("--update", action="store_true", help="Replace existing item definitions.")
    parser.add_argument("--confirm-data-replace", action="store_true",
                        help="Allow foundation to overwrite silver/gold sample tables.")
    args = parser.parse_args()
    check_local()
    if args.check_local:
        return
    if not args.workspace_id:
        parser.error("--workspace-id is required; use a separate workshop workspace.")
    if args.phase == "foundation" and not args.confirm_data_replace:
        parser.error("Foundation rewrites sample tables. Supply --confirm-data-replace for a dedicated workspace.")
    fabric = Fabric()
    workspace = fabric.call("GET", f"/workspaces/{args.workspace_id}")
    if not workspace.get("capacityId"):
        raise ValueError("Workspace has no Fabric capacity. Assign an active supported capacity first.")
    print(f"Target: {workspace['displayName']} ({args.workspace_id}); phase: {args.phase}", flush=True)
    Setup(fabric, str(args.workspace_id), args.update).phase(args.phase)
    print("Phase finished. Complete the corresponding checks in docs/setup.md; this does not certify the full workshop.")


if __name__ == "__main__":
    main()
