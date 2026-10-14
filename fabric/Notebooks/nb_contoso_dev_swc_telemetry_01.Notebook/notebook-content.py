# Fabric notebook source

# METADATA ********************

# META {
# META   "kernel_info": {"name": "synapse_pyspark"},
# META   "dependencies": {
# META     "lakehouse": {
# META       "default_lakehouse": "__SILVER_LAKEHOUSE_ID__",
# META       "default_lakehouse_name": "lh_contoso_dev_swc_silver_01",
# META       "default_lakehouse_workspace_id": "__WORKSPACE_ID__",
# META       "known_lakehouses": [{"id": "__SILVER_LAKEHOUSE_ID__"}]
# META     }
# META   }
# META }

# MARKDOWN ********************

# # Contoso live equipment telemetry
#
# Start the last cell to send readings to Eventstream, which stores them in
# Eventhouse. Stop the cell to stop sending. This does not refresh batch data.
# Readings are synthetic, not engineering limits or safety recommendations.

# CELL ********************

%pip install azure-eventhub azure-identity

# METADATA ********************

# META {"language": "python", "language_group": "synapse_pyspark"}

# MARKDOWN ********************

# ## 1. Settings
#
# One reading per second across the selected equipment, in round-robin order.
# Reduce INTERVAL_SECONDS for more events. RUN_SECONDS = 0 runs until stopped.
# A finite ten-minute run is the default, to avoid accidentally leaving compute on.

# CELL ********************

INTERVAL_SECONDS = 1.0
RUN_SECONDS = 600
SEED = 20261013
FAULT_MODE = "cyclic"  # Use "normal", then "fault" for an alert-transition test.
EVENTSTREAM_NAME = "es_contoso_dev_swc_telemetry_01"
SOURCE_NAME = "contoso_telemetry_input"
WORKSPACE_ID = "__WORKSPACE_ID__"

# METADATA ********************

# META {"language": "python", "language_group": "synapse_pyspark"}

# MARKDOWN ********************

# ## 2. Equipment
#
# Use twelve pumps/compressors from silver. Tag and installation IDs join back
# to the maintenance model. The first tag has repeating bearing-wear episodes.

# CELL ********************

from pyspark.sql import functions as F

equipment = (
    spark.table("tag")
    .join(spark.table("equipment_class"), "equipment_class_id")
    .join(spark.table("installation"), "installation_id")
    .filter(
        F.col("equipment_class_group").isin("Pumps", "Compressors and Turbines")
        & (F.col("installation_status") == "Operating")
    )
    .select(
        "installation_id", "installation_name", "tag_id", "tag_number",
        "equipment_class_name",
    )
    .orderBy("tag_id")
    .limit(12)
)
assets = [row.asDict() for row in equipment.collect()]
if not assets:
    raise RuntimeError("No operating pumps/compressors found. Load the silver sample first.")
display(equipment)

# METADATA ********************

# META {"language": "python", "language_group": "synapse_pyspark"}

# MARKDOWN ********************

# ## 3. Connect to Eventstream
#
# Get non-secret endpoint names using the notebook's Fabric identity.
# Event Hubs transport needs its own Entra token; NotebookUtils does not
# document an Event Hubs token audience. Sign in once using the device-code
# prompt below, with an account that has workspace access. No SAS keys.

# CELL ********************

import base64
import json
import requests
from azure.identity import DeviceCodeCredential

fabric_token = notebookutils.credentials.getToken("pbi")
headers = {"Authorization": f"Bearer {fabric_token}"}
api = f"https://api.fabric.microsoft.com/v1/workspaces/{WORKSPACE_ID}"

response = requests.get(f"{api}/items?type=Eventstream", headers=headers, timeout=60)
response.raise_for_status()
eventstream = next(i for i in response.json()["value"] if i["displayName"] == EVENTSTREAM_NAME)
response = requests.post(
    f"{api}/eventstreams/{eventstream['id']}/getDefinition", headers=headers, timeout=60,
)
response.raise_for_status()
if response.status_code != 200:
    raise RuntimeError("Eventstream definition is not ready. Wait a moment and rerun this cell.")
part = next(p for p in response.json()["definition"]["parts"] if p["path"] == "eventstream.json")
topology = json.loads(base64.b64decode(part["payload"]))
source = next(s for s in topology["sources"] if s["name"] == SOURCE_NAME)
response = requests.get(
    f"{api}/eventstreams/{eventstream['id']}/sources/{source['id']}/connection",
    headers=headers, timeout=60,
)
response.raise_for_status()
connection = response.json()
namespace = connection["fullyQualifiedNamespace"]
eventhub_name = connection["eventHubName"]
# Do not display the response: it also contains SAS keys, which we do not use.
del connection, response

payload = fabric_token.split(".")[1]
tenant_id = json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))["tid"]
del fabric_token, headers
credential = DeviceCodeCredential(
    tenant_id=tenant_id,
    client_id="04b07795-8ddb-461a-bbee-02f9e1bf7b46",  # public Azure CLI client, not a secret
)
credential.get_token("https://eventhubs.azure.net/.default")
print("Entra sign-in complete. Ready to send.")

# METADATA ********************

# META {"language": "python", "language_group": "synapse_pyspark"}

# MARKDOWN ********************

# ## 4. Generate and send
#
# Temperature, vibration, pressure and current have different baselines per
# asset, smooth load cycles and random noise. The first tag periodically shows
# elevated vibration and temperature for an observable relationship to explore.
# These are illustrative faults, not real diagnostic rules.

# CELL ********************

import math
import random
import time
import uuid
from datetime import datetime, timezone
from azure.eventhub import EventData, EventHubProducerClient


def make_event(asset, asset_index, sequence, run_id, rng, timestamp, fault_mode="cyclic"):
    if fault_mode not in ("cyclic", "normal", "fault"):
        raise ValueError("Fault mode must be cyclic, normal or fault.")
    load = math.sin(sequence / 25.0 + asset_index * 0.7)
    phase = sequence % 180
    fault = asset_index == 0 and (fault_mode == "fault" or
                                 (fault_mode == "cyclic" and 60 <= phase < 120))
    severity = (1.0 if fault_mode == "fault" else math.sin(math.pi * (phase - 60) / 60)) if fault else 0.0
    return {
        "event_id": f"{run_id}-{sequence:08d}",
        "run_id": run_id,
        "event_time": timestamp.astimezone(timezone.utc).isoformat(),
        "sequence_number": sequence,
        **asset,
        "operating_state": "Running",
        "temperature_c": round(55 + asset_index * 1.3 + 3 * load + 25 * severity + rng.gauss(0, 0.6), 2),
        "vibration_mm_s": round(max(0.1, 1.2 + asset_index * 0.07 + 0.2 * load + 7 * severity + rng.gauss(0, 0.08)), 3),
        "pressure_bar": round(max(0.1, 18 + asset_index * 1.5 + 1.2 * load + rng.gauss(0, 0.15)), 2),
        "motor_current_a": round(max(0.1, 30 + asset_index * 2.2 + 4 * load + 8 * severity + rng.gauss(0, 0.3)), 2),
        "anomaly_type": "BearingWear" if fault else "None",
    }


def send_readings(producer, assets, interval_seconds, run_seconds, seed, fault_mode="cyclic"):
    if fault_mode not in ("cyclic", "normal", "fault"):
        raise ValueError("Fault mode must be cyclic, normal or fault.")
    if not math.isfinite(interval_seconds) or interval_seconds <= 0:
        raise ValueError("INTERVAL_SECONDS must be finite and greater than zero.")
    if not math.isfinite(run_seconds) or run_seconds < 0:
        raise ValueError("RUN_SECONDS must be finite and at least zero.")
    if not assets:
        raise ValueError("At least one equipment item is required.")
    run_id = str(uuid.uuid4())
    rng = random.Random(seed)
    start = time.monotonic()
    sequence = 0
    print(f"Run {run_id}: interval={interval_seconds}s, duration={run_seconds}s", flush=True)
    while run_seconds == 0 or time.monotonic() - start < run_seconds:
        event_start = time.monotonic()
        index = sequence % len(assets)
        event = make_event(assets[index], index, sequence, run_id, rng, datetime.now(timezone.utc), fault_mode)
        batch = producer.create_batch()
        batch.add(EventData(json.dumps(event)))
        producer.send_batch(batch)
        sequence += 1
        if sequence % 10 == 0:
            print(f"Sent {sequence} readings; latest tag {event['tag_number']}", flush=True)
        remaining = max(0.0, interval_seconds - (time.monotonic() - event_start))
        if run_seconds:
            remaining = min(remaining, max(0.0, run_seconds - (time.monotonic() - start)))
        time.sleep(remaining)
    print(f"Finished run {run_id}: {sequence} readings.", flush=True)
    return run_id, sequence


with EventHubProducerClient(
    fully_qualified_namespace=namespace,
    eventhub_name=eventhub_name,
    credential=credential,
    uamqp_transport=False,
) as producer:
    run_id, sent_count = send_readings(producer, assets, INTERVAL_SECONDS, RUN_SECONDS, SEED, FAULT_MODE)

# METADATA ********************

# META {"language": "python", "language_group": "synapse_pyspark"}
