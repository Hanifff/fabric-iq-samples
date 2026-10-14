#!/usr/bin/env python3
"""Publish the items under fabric/ to the workspace (create or update).

Notebooks, semantic models and data agents are sent as item definitions. The
placeholders __WORKSPACE_ID__, __SILVER_LAKEHOUSE_ID__, __GOLD_LAKEHOUSE_ID__ and
__KQL_DATABASE_ID__, and __ID:<item name>__ for any workspace item, are replaced
with the real ids in file contents and part paths, so no ids are stored in the
repo. Paths use only the colon-free placeholders, so they stay valid on Windows.

Auth: Entra ID through the Azure CLI login (az login).

    python tools/deploy_fabric.py --workspace YOUR-WORKSPACE --only DataAgent
"""
from __future__ import annotations

import argparse
import base64
import json
import re
import sys
import time
from pathlib import Path
from urllib.parse import urlparse
from uuid import UUID

import requests
from azure.identity import AzureCliCredential

API = "https://api.fabric.microsoft.com/v1"
FABRIC_DIR = Path(__file__).resolve().parents[1] / "fabric"
TYPES = {".Notebook": "Notebook", ".SemanticModel": "SemanticModel", ".DataAgent": "DataAgent"}
FORMATS = {"Notebook": "fabricGitSource"}


class Fabric:
    def __init__(self):
        self.cred = AzureCliCredential()

    def request(self, method, path, **kw):
        url = path if path.startswith("https://") else f"{API}{path}"
        parsed = urlparse(url)
        if parsed.scheme != "https" or parsed.netloc != "api.fabric.microsoft.com":
            raise ValueError("Refusing to send Fabric credentials to a different host.")
        token = self.cred.get_token("https://api.fabric.microsoft.com/.default").token
        r = requests.request(method, url, headers={"Authorization": f"Bearer {token}"},
                             timeout=120, allow_redirects=False, **kw)
        if r.status_code >= 300:
            error_code = "Unknown"
            if r.headers.get("Content-Type", "").startswith("application/json"):
                body = r.json()
                if isinstance(body, dict):
                    error_code = body.get("errorCode", "Unknown")
            raise RuntimeError(f"{method} {url} failed: HTTP {r.status_code} ({error_code}); check permissions and capacity.")
        return r

    def call(self, method, path, **kw):
        r = self.request(method, path, **kw)
        if r.status_code == 202:
            return self.wait(r)
        return r.json() if r.content else {}

    def list(self, path, key="value"):
        values = []
        while path:
            page = self.call("GET", path)
            values.extend(page[key])
            path = page.get("continuationUri")
        return values

    def wait(self, r, token=None):
        operation_id = r.headers.get("x-ms-operation-id")
        url = f"{API}/operations/{UUID(operation_id)}" if operation_id else r.headers["Location"]
        delay = int(r.headers.get("Retry-After", 5))
        deadline = time.monotonic() + 1800
        while time.monotonic() < deadline:
            time.sleep(delay)
            s = self.request("GET", url)
            body = s.json() if s.content else {}
            if body.get("status") in ("Failed", "Cancelled"):
                raise RuntimeError(f"Fabric operation {body['status']}: {body.get('error', {}).get('errorCode', 'unknown')}")
            if body.get("status") == "Succeeded":
                result_url = s.headers.get("Location")
                if result_url and urlparse(result_url).path.rstrip("/").endswith("/result"):
                    res = self.request("GET", url.rstrip("/") + "/result")
                    return res.json() if res.content else {}
                return body
            delay = int(s.headers.get("Retry-After", delay))
        raise TimeoutError(f"Fabric operation did not finish within 30 minutes: {url}")


def item_definition(folder: Path, ids: dict[str, str], item_type: str, items: list[dict] | None = None) -> dict:
    items = items or []
    by_name = {i["displayName"]: i["id"] for i in items}

    def item_id(m):
        if m.group(1) not in by_name:
            sys.exit(f"{folder.name} references '{m.group(1)}', which is not in the workspace.")
        return by_name[m.group(1)]

    parts = []
    for f in sorted(p for p in folder.rglob("*") if p.is_file() and "__pycache__" not in p.parts):
        text = f.read_text()
        for key, value in ids.items():
            if value:
                text = text.replace(f"__{key}__", value)
        text = re.sub(r"__ID:([A-Za-z0-9_.-]+)__", item_id, text)
        path = f.relative_to(folder).as_posix()
        for key, value in ids.items():
            if value:
                path = path.replace(f"__{key}__", value)
        path = re.sub(r"__ID:([A-Za-z0-9_.-]+)__", item_id, path)
        unresolved = re.findall(r"__[A-Z][A-Z_]*__|__ID:[A-Za-z0-9_.-]+__", text + "\n" + path)
        if unresolved:
            raise ValueError(f"{folder.name}: unresolved placeholders: {sorted(set(unresolved))}")
        parts.append({
            "path": path,
            "payload": base64.b64encode(text.encode()).decode(),
            "payloadType": "InlineBase64",
        })
    definition = {"parts": parts}
    if item_type in FORMATS:
        definition["format"] = FORMATS[item_type]
    return definition


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--workspace", required=True, help="Exact target workspace name.")
    ap.add_argument("--only", choices=sorted(set(TYPES.values())))
    ap.add_argument("--name", action="append", help="deploy only items with this display name, repeatable")
    args = ap.parse_args()

    fabric = Fabric()
    workspaces = fabric.list("/workspaces")
    ws = next((w["id"] for w in workspaces if w["displayName"] == args.workspace), None)
    if not ws:
        sys.exit(f"Workspace '{args.workspace}' not found.")
    items = fabric.list(f"/workspaces/{ws}/items")

    def find(item_type, name):
        return next((i["id"] for i in items if i["type"] == item_type and i["displayName"] == name), None)

    ids = {
        "WORKSPACE_ID": ws,
        "SILVER_LAKEHOUSE_ID": find("Lakehouse", "lh_contoso_dev_swc_silver_01") or "",
        "GOLD_LAKEHOUSE_ID": find("Lakehouse", "lh_contoso_dev_swc_gold_01") or "",
        "KQL_DATABASE_ID": find("KQLDatabase", "kdb_contoso_dev_swc_telemetry_01") or "",
    }
    if not ids["SILVER_LAKEHOUSE_ID"] or not ids["GOLD_LAKEHOUSE_ID"]:
        sys.exit("Create the silver and gold lakehouses first.")

    for folder in sorted(p for p in FABRIC_DIR.rglob("*") if p.is_dir() and p.suffix in TYPES):
        item_type = TYPES[folder.suffix]
        if args.only and item_type != args.only:
            continue
        platform = json.loads((folder / ".platform").read_text())["metadata"]
        name, description = platform["displayName"], platform.get("description", "")
        if args.name and name not in args.name:
            continue
        definition = item_definition(folder, ids, item_type, items)
        existing = find(item_type, name)
        if existing:
            fabric.call("POST", f"/workspaces/{ws}/items/{existing}/updateDefinition?updateMetadata=true",
                        json={"definition": definition})
            print(f"updated {item_type} {name}")
        else:
            fabric.call("POST", f"/workspaces/{ws}/items",
                        json={"displayName": name, "type": item_type, "description": description, "definition": definition})
            print(f"created {item_type} {name}")
            items = fabric.list(f"/workspaces/{ws}/items")


if __name__ == "__main__":
    main()
