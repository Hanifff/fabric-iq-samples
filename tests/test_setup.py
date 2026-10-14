import base64
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
from deploy_fabric import Fabric, item_definition
from setup_workshop import Setup, check_local, find, placeholders, templates
from preflight import check_capacity, check_tables


class DefinitionTests(unittest.TestCase):
    def test_resolves_contents_and_paths(self):
        with tempfile.TemporaryDirectory() as directory:
            folder = Path(directory)
            (folder / "__GOLD_LAKEHOUSE_ID__.json").write_text(
                '{"workspace":"__WORKSPACE_ID__","model":"__ID:sm_contoso__"}'
            )
            definition = item_definition(
                folder, {"GOLD_LAKEHOUSE_ID": "gold", "WORKSPACE_ID": "workspace"},
                "Notebook", [{"displayName": "sm_contoso", "id": "model"}],
            )
            self.assertEqual(definition["format"], "fabricGitSource")
            part = definition["parts"][0]
            self.assertEqual(part["path"], "gold.json")
            self.assertEqual(json.loads(base64.b64decode(part["payload"])),
                             {"workspace": "workspace", "model": "model"})

    def test_missing_or_empty_placeholder_fails(self):
        for ids in ({}, {"GOLD_LAKEHOUSE_ID": ""}):
            with self.subTest(ids=ids), tempfile.TemporaryDirectory() as directory:
                folder = Path(directory)
                (folder / "definition.json").write_text('{"id":"__GOLD_LAKEHOUSE_ID__"}')
                with self.assertRaisesRegex(ValueError, "unresolved"):
                    item_definition(folder, ids, "DataAgent")

    def test_unknown_item_fails(self):
        with tempfile.TemporaryDirectory() as directory:
            folder = Path(directory)
            (folder / "definition.json").write_text("__ID:missing__")
            with self.assertRaises(SystemExit):
                item_definition(folder, {}, "DataAgent", [])

    def test_all_shipped_templates_resolve_without_network(self):
        with patch("requests.request") as request:
            check_local()
            request.assert_not_called()

    def test_dependency_order(self):
        foundation = templates("foundation")
        self.assertEqual([p.suffix for p in foundation],
                         [".Notebook", ".Notebook", ".SemanticModel", ".SemanticModel", ".SemanticModel"])
        self.assertEqual([p.suffix for p in templates("streaming")],
                         [".Eventhouse", ".KQLDatabase", ".Eventstream", ".KQLDashboard", ".Notebook"])

    def test_duplicate_items_fail(self):
        item = {"displayName": "gold", "type": "Lakehouse", "id": "id"}
        with self.assertRaisesRegex(ValueError, "found 2"):
            find([item, item], "gold", "Lakehouse")

    def test_optional_ids_are_not_empty_strings(self):
        self.assertEqual(placeholders("workspace", []), {"WORKSPACE_ID": "workspace"})


class FabricTests(unittest.TestCase):
    def setUp(self):
        with patch("deploy_fabric.AzureCliCredential"):
            self.fabric = Fabric()

    def test_pagination(self):
        self.fabric.call = Mock(side_effect=[
            {"value": [{"id": "1"}], "continuationUri": "https://api.fabric.microsoft.com/v1/next"},
            {"value": [{"id": "2"}]},
        ])
        self.assertEqual(self.fabric.list("/items"), [{"id": "1"}, {"id": "2"}])
        self.assertEqual(self.fabric.call.call_count, 2)

    def test_lakehouse_table_response_uses_data_not_value(self):
        self.fabric.call = Mock(return_value={"data": [{"name": "project"}]})
        self.assertEqual(self.fabric.list("/tables", key="data"), [{"name": "project"}])

    def test_rejects_external_auth_destinations(self):
        for path in ("https://example.com/v1/items", "https://api.fabric.microsoft.com.evil.test/items"):
            with self.subTest(path=path), self.assertRaises(ValueError):
                self.fabric.request("GET", path)
        self.fabric.cred.get_token.assert_not_called()

    @patch("deploy_fabric.requests.request")
    def test_http_errors_fail(self, request):
        request.return_value.status_code = 403
        with self.assertRaisesRegex(RuntimeError, "HTTP 403"):
            self.fabric.call("GET", "/workspaces")

    @patch("deploy_fabric.time.sleep")
    def test_lro_failed_cancelled_and_success(self, sleep):
        initial = Mock(headers={"Location": "https://api.fabric.microsoft.com/v1/operations/op"})
        for status in ("Failed", "Cancelled"):
            self.fabric.request = Mock(return_value=Mock(content=b"json", json=lambda: {"status": status}))
            with self.subTest(status=status), self.assertRaises(RuntimeError):
                self.fabric.wait(initial)
        self.fabric.request = Mock(side_effect=[
            Mock(content=b"json", json=lambda: {"status": "Succeeded"},
                 headers={"Location": "https://api.fabric.microsoft.com/v1/operations/op/result"}),
            Mock(content=b"json", json=lambda: {"id": "created"}),
        ])
        self.assertEqual(self.fabric.wait(initial), {"id": "created"})

    @patch("deploy_fabric.time.sleep")
    def test_successful_operation_without_a_result(self, sleep):
        initial = Mock(headers={"Location": "https://api.fabric.microsoft.com/v1/operations/op"})
        self.fabric.request = Mock(return_value=Mock(
            content=b"json", json=lambda: {"status": "Succeeded"}, headers={},
        ))
        self.assertEqual(self.fabric.wait(initial), {"status": "Succeeded"})
        self.fabric.request.assert_called_once()

    @patch("deploy_fabric.time.sleep")
    def test_regional_operation_location_uses_canonical_api(self, sleep):
        operation = "00000000-0000-0000-0000-000000000123"
        initial = Mock(headers={
            "Location": f"https://wabi-test.analysis.windows.net/v1/operations/{operation}",
            "x-ms-operation-id": operation,
        })
        self.fabric.request = Mock(return_value=Mock(
            content=b"json", json=lambda: {"status": "Succeeded"}, headers={},
        ))
        self.fabric.wait(initial)
        self.fabric.request.assert_called_once_with("GET", f"https://api.fabric.microsoft.com/v1/operations/{operation}")

    @patch("deploy_fabric.time.monotonic", side_effect=[0, 1801])
    def test_lro_timeout(self, clock):
        initial = Mock(headers={"Location": "https://api.fabric.microsoft.com/v1/operations/op"})
        with self.assertRaises(TimeoutError):
            self.fabric.wait(initial)


class SetupTests(unittest.TestCase):
    @patch("setup_workshop.time.sleep")
    @patch("setup_workshop.requests.request")
    def test_model_refresh_polls_its_own_request(self, request, sleep):
        refresh = "00000000-0000-0000-0000-000000000123"
        request.side_effect = [
            Mock(status_code=202, headers={
                "Location": f"https://wabi-test.analysis.windows.net/refreshes/{refresh}",
            }),
            Mock(status_code=200, json=lambda: {"status": "Completed"}),
        ]
        Setup(Mock(), "workspace").refresh_model({"id": "model", "displayName": "planning"})
        self.assertEqual(request.call_args.args[:2], (
            "GET", f"https://api.powerbi.com/v1.0/myorg/groups/workspace/datasets/model/refreshes/{refresh}",
        ))

    @patch("setup_workshop.time.sleep")
    @patch("setup_workshop.requests.request")
    def test_failed_model_refresh_is_not_success(self, request, sleep):
        request.side_effect = [
            Mock(status_code=202, headers={
                "Location": "https://api.powerbi.com/refreshes/00000000-0000-0000-0000-000000000123",
            }),
            Mock(status_code=200, json=lambda: {"status": "Failed"}),
        ]
        with self.assertRaisesRegex(RuntimeError, "refresh Failed"):
            Setup(Mock(), "workspace").refresh_model({"id": "model", "displayName": "planning"})

    def test_paused_capacity_is_an_explicit_failure(self):
        fabric = Mock()
        fabric.call.return_value = {"capacityId": "capacity"}
        fabric.list.return_value = [{"id": "capacity", "state": "Inactive", "sku": "F16"}]
        with self.assertRaisesRegex(RuntimeError, "Inactive"):
            check_capacity(fabric, "workspace")

    def test_missing_capacity_visibility_is_not_a_pass(self):
        fabric = Mock()
        fabric.call.return_value = {"capacityId": "capacity"}
        fabric.list.return_value = []
        with self.assertRaisesRegex(RuntimeError, "not visible"):
            check_capacity(fabric, "workspace")

    def test_tables_use_documented_response_key(self):
        fabric = Mock()
        fabric.list.return_value = [{"name": "project"}]
        items = [{"id": "silver", "displayName": "silver", "type": "Lakehouse"}]
        check_tables(fabric, "workspace", items, "silver", ["project"])
        fabric.list.assert_called_once_with("/workspaces/workspace/lakehouses/silver/tables", key="data")

    def test_keeps_existing_definition_without_update(self):
        folder = templates("foundation")[0]
        metadata = json.loads((folder / ".platform").read_text())["metadata"]
        existing = {**metadata, "id": "notebook"}
        fabric = Mock()
        fabric.list.return_value = [existing]
        setup = Setup(fabric, "workspace")
        self.assertEqual(setup.deploy(folder), existing)
        fabric.call.assert_not_called()

    @patch("setup_workshop.time.sleep")
    def test_failed_notebook_stops_setup(self, sleep):
        fabric = Mock()
        fabric.request.return_value = Mock(status_code=202, headers={
            "Location": "https://api.fabric.microsoft.com/v1/jobs/00000000-0000-0000-0000-000000000123",
        })
        fabric.call.return_value = {"status": "Failed", "failureReason": "Test failure"}
        setup = Setup(fabric, "workspace")
        with self.assertRaisesRegex(RuntimeError, "Notebook Failed"):
            setup.run_notebook({"id": "notebook", "displayName": "test"})

    def test_schema_enabled_lakehouse_is_rejected(self):
        fabric = Mock()
        fabric.list.return_value = [{"displayName": "silver", "type": "Lakehouse", "id": "silver"}]
        fabric.call.return_value = {"properties": {"defaultSchema": "dbo"}}
        with self.assertRaisesRegex(ValueError, "schema-enabled"):
            Setup(fabric, "workspace").ensure_lakehouse("silver")


if __name__ == "__main__":
    unittest.main()
