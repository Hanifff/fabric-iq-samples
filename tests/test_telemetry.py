import ast
import json
import math
import random
import unittest
import uuid
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import Mock

from azure.eventhub import EventData

NOTEBOOK = (
    Path(__file__).resolve().parents[1]
    / "fabric/Notebooks/nb_contoso_dev_swc_telemetry_01.Notebook/notebook-content.py"
)


def notebook_functions():
    # Test the actual notebook helpers, without running Spark, sign-in or pip.
    source = "\n".join(line for line in NOTEBOOK.read_text().splitlines() if not line.startswith("%"))
    tree = ast.parse(source)
    functions = ast.Module(
        body=[node for node in tree.body if isinstance(node, ast.FunctionDef)], type_ignores=[],
    )
    scope = {
        "math": math, "random": random, "uuid": uuid, "json": json,
        "datetime": datetime, "timezone": timezone, "EventData": EventData,
    }
    exec(compile(functions, str(NOTEBOOK), "exec"), scope)
    return scope


ASSET = {
    "installation_id": "INS-001", "installation_name": "Contoso Test Installation",
    "tag_id": "TAG-000001", "tag_number": "23-PA-1001",
    "equipment_class_name": "Centrifugal Pump",
}


class Clock:
    def __init__(self):
        self.now = 0.0

    def monotonic(self):
        return self.now

    def sleep(self, seconds):
        self.now += seconds


class TelemetryTests(unittest.TestCase):
    def test_shape_and_repeatability(self):
        fn = notebook_functions()["make_event"]
        timestamp = datetime(2026, 10, 9, tzinfo=timezone.utc)
        first = fn(ASSET, 0, 90, "run", random.Random(7), timestamp)
        second = fn(ASSET, 0, 90, "run", random.Random(7), timestamp)
        self.assertEqual(first, second)
        self.assertEqual(len(first), 15)
        self.assertEqual(first["event_time"], "2026-10-09T00:00:00+00:00")
        self.assertEqual(first["tag_id"], ASSET["tag_id"])
        json.dumps(first, allow_nan=False)

    def test_variety_and_fault_episode(self):
        fn = notebook_functions()["make_event"]
        rng = random.Random(7)
        events = [fn(ASSET, 0, n, "run", rng, datetime.now(timezone.utc)) for n in range(180)]
        self.assertEqual(len({e["event_id"] for e in events}), 180)
        self.assertGreater(len({e["temperature_c"] for e in events}), 100)
        self.assertEqual({e["anomaly_type"] for e in events}, {"None", "BearingWear"})
        normal = [e["vibration_mm_s"] for e in events if e["anomaly_type"] == "None"]
        fault = [e["vibration_mm_s"] for e in events if e["anomaly_type"] == "BearingWear"]
        self.assertGreater(sum(fault) / len(fault), sum(normal) / len(normal) + 3)

    def test_one_event_per_second_and_round_robin(self):
        scope = notebook_functions()
        clock = Clock()
        scope["time"] = clock
        events = []
        producer = Mock()
        producer.create_batch.side_effect = lambda: Mock()
        producer.send_batch.side_effect = lambda batch: events.append(clock.now)
        _, count = scope["send_readings"](producer, [ASSET, {**ASSET, "tag_id": "TAG-000002"}], 1, 5, 7)
        self.assertEqual(count, 5)
        self.assertEqual(events, [0, 1, 2, 3, 4])
        self.assertEqual(producer.send_batch.call_count, count)

    def test_normal_and_fault_modes_cross_the_demo_threshold(self):
        fn = notebook_functions()["make_event"]
        timestamp = datetime(2026, 10, 13, tzinfo=timezone.utc)
        for mode in ("normal", "fault"):
            rng = random.Random(20261013)
            events = [fn(ASSET, n % 12, n, "run", rng, timestamp, mode) for n in range(720)]
            for event in events:
                is_fault = mode == "fault" and event["sequence_number"] % 12 == 0
                if is_fault:
                    self.assertGreater(event["vibration_mm_s"], 5)
                    self.assertEqual(event["anomaly_type"], "BearingWear")
                else:
                    self.assertLess(event["vibration_mm_s"], 5)
                    self.assertEqual(event["anomaly_type"], "None")

    def test_invalid_fault_mode_fails_before_sending(self):
        scope = notebook_functions()
        producer = Mock()
        with self.assertRaisesRegex(ValueError, "Fault mode"):
            scope["send_readings"](producer, [ASSET], 1, 5, 7, "unknown")
        producer.send_batch.assert_not_called()

    def test_controls_and_send_errors(self):
        scope = notebook_functions()
        scope["time"] = Clock()
        for interval, duration in [(0, 5), (-1, 5), (float("nan"), 5), (1, -1), (1, float("inf"))]:
            with self.assertRaises(ValueError):
                scope["send_readings"](Mock(), [ASSET], interval, duration, 7)
        producer = Mock()
        producer.send_batch.side_effect = RuntimeError("Transport failed")
        with self.assertRaisesRegex(RuntimeError, "Transport failed"):
            scope["send_readings"](producer, [ASSET], 1, 5, 7)


if __name__ == "__main__":
    unittest.main()
