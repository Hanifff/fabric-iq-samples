#!/usr/bin/env python3
"""Generate the Contoso silver sample data (deterministic, fixed seed).

Contoso is a fictional energy services company. The data covers three
domains that share reference tables:

  planning     project, work_package, activity, activity_progress_weekly,
               milestone, document, activity_document, tag, resource
  maintenance  installation, work_order, tag, equipment_class
  procurement  purchase_order, purchase_order_line, supplier, material, cost_code

Silver means clean and ready for modelling: typed columns, stable ids,
nulls only where they carry meaning (for example no actual finish date on an
activity that has not finished). Output goes to data/silver/<table>.parquet,
plus data/silver/as_of.txt with the snapshot date.

The whole timeline is generated first and then cut at the as-of date, so
nothing is dated after "today". Moving the as-of date forward adds work
orders, orders, deliveries, documents and weekly snapshots and advances
statuses. Rows already reported for earlier dates keep their ids and values.

    python tools/gen_silver_data.py --as-of 2026-10-08
"""
from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq

SEED = 20261013
# Structure (which projects have documents, orders and tags) is fixed at this date,
# so moving the as-of date forward only adds events and advances statuses.
BASELINE_DATE = pd.Timestamp("2026-09-30")
AS_OF = BASELINE_DATE  # "today" inside the data, set with --as-of
rng = np.random.default_rng(SEED)

# ---------------------------------------------------------------------------
# Reference lists
# ---------------------------------------------------------------------------
DISCIPLINES = [
    # code, name, group, hourly rate NOK
    ("STR", "Structural Engineering", "Engineering", 1180),
    ("PIP", "Piping Engineering", "Engineering", 1150),
    ("MEC", "Mechanical Engineering", "Engineering", 1160),
    ("ELE", "Electrical Engineering", "Engineering", 1190),
    ("INS", "Instrument and Automation", "Engineering", 1210),
    ("PRO", "Process Engineering", "Engineering", 1250),
    ("SAF", "Safety and Risk", "Engineering", 1230),
    ("HVA", "HVAC", "Engineering", 1120),
    ("MAR", "Marine and Naval", "Engineering", 1200),
    ("WLD", "Welding and Fabrication", "Fabrication", 890),
    ("INT", "Topside Integration", "Construction", 940),
    ("SUB", "Subsea Systems", "Construction", 1280),
    ("COM", "Commissioning", "Commissioning", 1100),
    ("PRC", "Procurement and Supply Chain", "Project Support", 1050),
    ("PLN", "Planning and Project Controls", "Project Support", 1120),
]

# name, segment, contract type, months (lo, hi), size factor range, value NOK bn range, weight
PROJECT_TYPES = [
    ("Jacket Fabrication", "New Build", "EPC", (14, 26), (1.0, 2.2), (0.9, 3.2), 5),
    ("Topside Fabrication", "New Build", "EPC", (18, 32), (1.4, 2.8), (1.5, 6.0), 4),
    ("Module Fabrication", "New Build", "EPC", (10, 20), (0.7, 1.4), (0.5, 2.0), 5),
    ("Subsea Tie-in", "New Build", "EPCI", (8, 16), (0.4, 0.9), (0.3, 1.1), 4),
    ("Floating Wind Substructure", "New Build", "EPC", (14, 26), (0.9, 1.9), (0.8, 2.8), 3),
    ("Carbon Capture FEED", "New Build", "Reimbursable", (6, 12), (0.2, 0.5), (0.05, 0.3), 3),
    ("Offshore Modification Campaign", "Life Cycle", "Reimbursable", (6, 18), (0.4, 1.1), (0.1, 0.9), 7),
    ("Maintenance Frame Agreement", "Life Cycle", "Frame agreement", (36, 60), (1.0, 2.0), (0.4, 2.0), 5),
    ("Brownfield Upgrade", "Life Cycle", "EPC", (10, 24), (0.5, 1.3), (0.2, 1.2), 4),
]

CLIENTS = [
    "Northwind Petroleum", "Fabrikam Offshore Energy", "Adatum Oil and Gas", "Tailspin Energy",
    "Litware Subsea Operations", "Wingtip Energy", "Proseware Power", "Lucerne Carbon Services",
]
YARDS = ["Verdal", "Stord", "Haugesund", "Egersund", "Sandnessjoen", "Kristiansund", "Mongstad"]
ASSET_NAMES = [
    "Haldor", "Brinn", "Skarra", "Ylva", "Vidar", "Magni", "Norrvik", "Lindar", "Frosta", "Tyrne",
    "Kvale", "Ostra", "Brynja", "Solvang", "Eskil", "Rimfaxe", "Alvhild", "Dagny", "Torvald", "Isgard",
]
FIRST_NAMES = [
    "Anders", "Ingrid", "Lars", "Kari", "Ola", "Silje", "Erik", "Hanne", "Jonas", "Marte", "Thomas",
    "Camilla", "Henrik", "Nora", "Magnus", "Sofie", "Petter", "Linn", "Andreas", "Emilie", "Stian",
    "Tuva", "Morten", "Ida", "Sven", "Astrid", "Jakob", "Maja", "Ravi", "Priya", "Tomasz", "Agnieszka",
    "Carlos", "Elena", "James", "Emma", "Pedro", "Mei", "Ahmed", "Fatima", "Dmitri", "Anja",
]
LAST_NAMES = [
    "Berg", "Hansen", "Johansen", "Olsen", "Larsen", "Andersen", "Pedersen", "Nilsen", "Kristiansen",
    "Jensen", "Karlsen", "Johnsen", "Pettersen", "Eriksen", "Berge", "Haugen", "Hagen", "Eide",
    "Solberg", "Moen", "Lie", "Dahl", "Lund", "Bakken", "Strand", "Vik", "Nygaard", "Aas", "Rustad",
    "Sharma", "Kowalski", "Nowak", "Garcia", "Silva", "Smith", "Brown", "Chen", "Hassan", "Petrov",
]
MANUFACTURERS = [
    "Fjordtek", "Arctos Flow", "Nordvik Valves", "Halden Controls", "Brimar Rotating", "Kestrel Instruments",
    "Vestland Electric", "Aurum Heat Transfer", "Skagerak Pumps", "Polar Compression", "Stratos Sensors",
    "Tidewater Systems", "Granit Structures", "Ravnsund Marine", "Lysefjord Power", "Basalt Piping",
    "Orkla Safety", "Nordlys Automation", "Kvitebjorn Industrial", "Sundal Engineering",
]
SUPPLIER_CATEGORIES = [
    "Steel and Plate", "Piping and Fittings", "Valves", "Rotating Equipment", "Electrical",
    "Instrumentation", "Coatings and Paint", "Safety Equipment", "Structural Components", "Consumables",
]
SUPPLIER_STEMS = {
    "Steel and Plate": ["Nordic Steelworks", "Baltic Plate", "Fjord Alloys", "Atlantic Steel"],
    "Piping and Fittings": ["Flowline Fittings", "Pipeworks", "Spoolmaster", "Tubular Systems"],
    "Valves": ["Valve Technology", "Flow Control", "Cryo Valves", "Actuation"],
    "Rotating Equipment": ["Pump Systems", "Compressor Works", "Turbine Services", "Rotor Dynamics"],
    "Electrical": ["Power Systems", "Cable and Wire", "Switchgear", "Marine Electric"],
    "Instrumentation": ["Sensor Technology", "Instrument Supply", "Control Panels", "Gauge and Meter"],
    "Coatings and Paint": ["Protective Coatings", "Marine Paint", "Surface Systems"],
    "Safety Equipment": ["Safety Systems", "Fire Protection", "Lifesaving Equipment"],
    "Structural Components": ["Structural Components", "Heavy Fabrication", "Node Castings"],
    "Consumables": ["Industrial Supply", "Welding Consumables", "Site Logistics"],
}
SUPPLIER_PREFIX = ["Nordvik", "Halden", "Brinn", "Skarra", "Vestland", "Arctos", "Kestrel", "Polar", "Stratos",
                   "Tidewater", "Granit", "Basalt", "Orkla", "Sundal", "Lysefjord", "Ravnsund", "Aurum", "Fjordtek"]
COUNTRIES = [("NO", 0.46), ("GB", 0.12), ("DE", 0.10), ("NL", 0.07), ("SE", 0.06), ("DK", 0.05),
             ("IT", 0.04), ("US", 0.04), ("KR", 0.03), ("PL", 0.03)]
LEGAL = {"NO": "AS", "GB": "Ltd", "DE": "GmbH", "NL": "BV", "SE": "AB", "DK": "A/S", "IT": "SpA",
         "US": "Inc", "KR": "Co Ltd", "PL": "Sp. z o.o."}

# group, class names, tag abbreviation list, discipline code, has_pressure, weight kg range
EQUIPMENT = [
    ("Pumps", ["Centrifugal Pump", "Reciprocating Pump", "Submersible Pump", "Fire Water Pump", "Metering Pump"], ["PA", "PB", "PS", "PF", "PM"], "MEC", True, (150, 6000)),
    ("Valves", ["Ball Valve", "Gate Valve", "Globe Valve", "Check Valve", "Butterfly Valve", "Safety Relief Valve", "Control Valve", "Emergency Shutdown Valve", "Choke Valve"], ["XV", "GV", "GL", "CV", "BV", "PSV", "FCV", "ESV", "CK"], "PIP", True, (8, 1800)),
    ("Vessels", ["Separator", "Scrubber", "Knock-out Drum", "Pressure Vessel", "Storage Tank", "Accumulator"], ["VG", "VS", "VK", "VP", "TK", "VA"], "MEC", True, (2500, 90000)),
    ("Heat Exchangers", ["Shell and Tube Heat Exchanger", "Plate Heat Exchanger", "Air Cooler", "Fired Heater"], ["HE", "HP", "HA", "HF"], "PRO", True, (900, 30000)),
    ("Compressors and Turbines", ["Centrifugal Compressor", "Reciprocating Compressor", "Gas Turbine", "Turboexpander"], ["KA", "KB", "GT", "KX"], "MEC", True, (8000, 120000)),
    ("Electrical", ["Transformer", "Switchgear", "Electric Motor", "Generator", "Uninterruptible Power Supply", "Cable Tray", "Junction Box", "Variable Speed Drive"], ["TR", "SG", "EM", "GE", "UP", "CT", "JB", "VD"], "ELE", False, (20, 22000)),
    ("Instrumentation", ["Pressure Transmitter", "Temperature Transmitter", "Flow Transmitter", "Level Transmitter", "Gas Detector", "Fire Detector", "Process Analyser", "PLC Panel"], ["PT", "TT", "FT", "LT", "AT", "XD", "QA", "PN"], "INS", False, (1, 450)),
    ("Piping", ["Pipe Spool", "Flange Set", "Expansion Joint", "Pipe Support", "Strainer"], ["SP", "FL", "EJ", "PX", "ST"], "PIP", True, (15, 2600)),
    ("Structural", ["Jacket Leg", "Foundation Pile", "Deck Beam", "Module Frame", "Helideck", "Crane Pedestal", "Stair Tower"], ["JL", "FP", "DB", "MF", "HD", "CP", "SW"], "STR", False, (3000, 450000)),
    ("Safety and Marine", ["Lifeboat", "Deluge Skid", "Fire Damper", "Davit", "Anchor Winch", "Mooring Chain"], ["LB", "DS", "FD", "DV", "AW", "MC"], "MAR", False, (200, 40000)),
    ("Lifting", ["Offshore Crane", "Hoist", "Winch"], ["CR", "HO", "WI"], "MEC", False, (400, 60000)),
    ("Subsea", ["Subsea Tree", "Subsea Manifold", "Umbilical", "Jumper", "Flowline"], ["ST", "SM", "UM", "JP", "FLN"], "SUB", True, (500, 90000)),
]
SYSTEMS = [
    ("20", "Process Inlet"), ("21", "Separation"), ("23", "Gas Compression"), ("25", "Water Injection"),
    ("26", "Produced Water Treatment"), ("36", "Fuel Gas"), ("43", "Power Generation"), ("47", "Utility Power Distribution"),
    ("52", "Fire Water"), ("55", "HVAC"), ("60", "Primary Steel"), ("64", "Lifting and Handling"),
    ("70", "Instrument Air"), ("71", "Safety Systems"), ("80", "Subsea Production"), ("91", "Accommodation"),
]
WP_TYPES = [
    # name, phase start, phase end (fractions of project), discipline pool
    ("Engineering", 0.00, 0.40, ["STR", "PIP", "MEC", "ELE", "INS", "PRO", "SAF", "HVA", "MAR"]),
    ("Procurement", 0.08, 0.60, ["PRC", "PRC", "MEC", "PIP", "ELE", "INS"]),
    ("Fabrication", 0.28, 0.82, ["WLD", "STR", "PIP", "MEC", "MAR"]),
    ("Installation", 0.62, 0.92, ["INT", "STR", "PIP", "ELE", "SUB", "MAR"]),
    ("Hook-up", 0.70, 0.95, ["INT", "PIP", "ELE", "INS", "MEC"]),
    ("Commissioning", 0.82, 1.00, ["COM", "ELE", "INS", "PRO", "SAF"]),
    ("Inspection", 0.15, 0.95, ["WLD", "STR", "PIP", "SAF", "COM"]),
    ("Project Controls", 0.00, 1.00, ["PLN", "PLN", "SAF"]),
]
ACTIVITY_TYPES = {
    "Engineering": [("Design", 0.5), ("Document", 0.3), ("Inspect", 0.2)],
    "Procurement": [("Procure", 0.7), ("Document", 0.15), ("Inspect", 0.15)],
    "Fabrication": [("Fabricate", 0.6), ("Inspect", 0.25), ("Test", 0.15)],
    "Installation": [("Install", 0.65), ("Inspect", 0.2), ("Test", 0.15)],
    "Hook-up": [("Install", 0.5), ("Test", 0.3), ("Inspect", 0.2)],
    "Commissioning": [("Test", 0.6), ("Document", 0.2), ("Inspect", 0.2)],
    "Inspection": [("Inspect", 0.7), ("Document", 0.3)],
    "Project Controls": [("Document", 0.6), ("Inspect", 0.4)],
}
ACTIVITY_VERB = {
    "Design": ["Design", "Calculate", "Model", "Review design of"],
    "Document": ["Issue documentation for", "Prepare datasheet for", "Update drawings for"],
    "Procure": ["Procure", "Expedite", "Place order for", "Receive"],
    "Fabricate": ["Fabricate", "Weld", "Assemble", "Pre-fabricate"],
    "Install": ["Install", "Lift and install", "Connect", "Tie in"],
    "Test": ["Pressure test", "Function test", "Loop check", "Commission"],
    "Inspect": ["Inspect", "Verify", "NDT inspect", "Review quality records for"],
}
ACTIVITY_DELAY = {"Procure": 0.14, "Fabricate": 0.05, "Install": 0.07, "Test": 0.03, "Design": 0.0,
                  "Document": 0.02, "Inspect": 0.01}
MILESTONES = [
    ("Contract award", "Contractual", True), ("Basic design approved", "Client approval", False),
    ("Long lead items ordered", "Internal", False), ("Steel cutting start", "Internal", True),
    ("Fabrication 50 percent", "Internal", True), ("Mechanical completion", "Contractual", True),
    ("Load-out", "Contractual", True), ("Sail-away", "Contractual", True),
    ("Offshore installation complete", "Contractual", True), ("Handover to client", "Contractual", True),
    ("Document handover", "Client approval", False), ("As-built dossier approved", "Client approval", False),
]
DOC_TYPES = [
    ("Drawing", "DWG"), ("Datasheet", "DAT"), ("Procedure", "PRC"), ("Isometric", "ISO"),
    ("P&ID", "PID"), ("Specification", "SPC"), ("Calculation", "CAL"), ("Inspection Report", "INR"),
    ("Management of Change", "MOC"), ("Test Certificate", "CER"),
]
PRICE_RANGE = {  # NOK per unit: (low, high); unit of measure
    "Steel and Plate": ((11000, 32000), "tonne"), "Piping and Fittings": ((120, 9500), "ea"),
    "Valves": ((2500, 180000), "ea"), "Rotating Equipment": ((90000, 6500000), "ea"),
    "Electrical": ((350, 850000), "ea"), "Instrumentation": ((1800, 120000), "ea"),
    "Coatings and Paint": ((90, 450), "l"), "Safety Equipment": ((900, 380000), "ea"),
    "Structural Components": ((8000, 520000), "ea"), "Consumables": ((12, 2400), "ea"),
}
COST_CODES = [
    ("Materials", "Direct", ["Structural steel", "Plate and profiles", "Pipe and fittings", "Valves and actuators",
                              "Rotating equipment", "Electrical bulk", "Instrument bulk", "Coating and insulation",
                              "Safety equipment", "Consumables"]),
    ("Subcontract", "Direct", ["Scaffolding", "Insulation contractor", "Blasting and painting", "Heavy lift",
                               "NDT services", "Electrical installation", "Mechanical installation", "Offshore hook-up crew"]),
    ("Equipment Hire", "Indirect", ["Crane hire", "Welding equipment", "Temporary power", "Site cabins", "Survey equipment"]),
    ("Freight and Logistics", "Indirect", ["Road transport", "Sea freight", "Customs and duties", "Marine vessel charter",
                                           "Warehouse handling"]),
    ("Engineering Services", "Direct", ["Third-party design", "Verification and certification", "Vendor engineering",
                                        "Software licences"]),
    ("Site Overhead", "Indirect", ["Safety equipment and PPE", "Training and permits", "Waste handling", "Site catering"]),
]
FAILURE_BY_GROUP = {
    "Pumps": ["Seal failure", "Vibration", "Fail to start", "Overheating", "Leakage"],
    "Compressors and Turbines": ["Vibration", "Overheating", "Fail to start", "Spurious trip", "Seal failure"],
    "Valves": ["Leakage", "Fail to close", "Corrosion", "Actuator fault", "Blockage"],
    "Instrumentation": ["Instrument drift", "Spurious trip", "Electrical fault", "Calibration error"],
    "Electrical": ["Electrical fault", "Overheating", "Spurious trip", "Fail to start"],
}
FAILURE_DEFAULT = ["Corrosion", "Leakage", "Blockage", "Structural damage", "Overheating"]


def wchoice(items, weights, size):
    w = np.asarray(weights, dtype=float)
    return rng.choice(len(items), size=size, p=w / w.sum()) if size else np.array([], dtype=int)


def pick(items, weights, size):
    idx = wchoice(items, weights, size)
    arr = np.empty(len(items), dtype=object)
    arr[:] = list(items)
    return arr[idx]


def to_dates(s: pd.Series) -> pd.Series:
    return pd.to_datetime(s).dt.normalize()


def ts(x) -> pd.Timestamp:
    return pd.Timestamp(x).normalize()


def make_people(n: int) -> list[str]:
    names, seen = [], set()
    while len(names) < n:
        nm = f"{rng.choice(FIRST_NAMES)} {rng.choice(LAST_NAMES)}"
        if nm not in seen:
            seen.add(nm)
            names.append(nm)
    return names


# ---------------------------------------------------------------------------
# Reference and master data
# ---------------------------------------------------------------------------
def build_discipline() -> pd.DataFrame:
    return pd.DataFrame({
        "discipline_id": [f"DSC-{i + 1:02d}" for i in range(len(DISCIPLINES))],
        "discipline_code": [d[0] for d in DISCIPLINES],
        "discipline_name": [d[1] for d in DISCIPLINES],
        "discipline_group": [d[2] for d in DISCIPLINES],
        "standard_hourly_rate_nok": [d[3] for d in DISCIPLINES],
    })


def build_installation() -> pd.DataFrame:
    types = [("Fixed Platform", 0.35), ("Floating Production Unit", 0.2), ("Subsea Template", 0.2),
             ("Unmanned Wellhead Platform", 0.15), ("Onshore Terminal", 0.1)]
    names = rng.choice(ASSET_NAMES, size=18, replace=False)
    rows = []
    for i, nm in enumerate(names):
        itype = pick([t[0] for t in types], [t[1] for t in types], 1)[0]
        rows.append({
            "installation_id": f"INS-{i + 1:03d}",
            "installation_code": f"{nm[:3].upper()}{rng.integers(10, 99)}",
            "installation_name": f"{nm} {rng.choice(['A', 'B', 'Alpha', 'Central', 'North'])}",
            "installation_type": itype,
            "field_name": f"{nm} Field",
            "operator_name": rng.choice(CLIENTS[:6]),
            "country_code": pick(["NO", "GB", "DK"], [0.7, 0.22, 0.08], 1)[0],
            "water_depth_m": 0 if itype == "Onshore Terminal" else int(rng.integers(40, 380)),
            "year_in_service": int(rng.integers(1986, 2025)),
            "operating_status": pick(["Producing", "Shut in", "Late life"], [0.78, 0.07, 0.15], 1)[0],
        })
    return pd.DataFrame(rows)


def build_projects(installation: pd.DataFrame, n: int = 40) -> pd.DataFrame:
    weights = [t[6] for t in PROJECT_TYPES]
    type_idx = wchoice(PROJECT_TYPES, weights, n)
    pm = make_people(12)
    rows = []
    used_names = set()
    for i, ti in enumerate(type_idx):
        name, segment, contract, months, size, value, _ = PROJECT_TYPES[ti]
        asset = rng.choice(ASSET_NAMES)
        while f"{asset}-{name}" in used_names:
            asset = rng.choice(ASSET_NAMES)
        used_names.add(f"{asset}-{name}")
        dur_m = int(rng.integers(months[0], months[1] + 1))
        start = ts("2022-06-01") + pd.Timedelta(days=int(rng.beta(2.4, 1.1) * 1650))
        planned_finish = start + pd.DateOffset(months=dur_m)
        inst = (rng.choice(installation["installation_id"]) if segment == "Life Cycle" else None)
        delay = int(max(-20, rng.normal(35, 55)))
        on_hold = rng.random() < 0.07
        virtual_finish = planned_finish + pd.Timedelta(days=delay)
        if virtual_finish < AS_OF - pd.Timedelta(days=30):
            status, actual_finish = "Completed", virtual_finish
        elif start > AS_OF:
            status, actual_finish = "Planning", pd.NaT
        else:
            status, actual_finish = ("On Hold" if on_hold else "Execution"), pd.NaT
        rows.append({
            "project_id": f"PRJ-{2201 + i}",
            "project_code": f"CON-{(start.year % 100):02d}{i + 1:02d}",
            "project_name": f"{asset} {name}",
            "segment": segment,
            "project_type": name,
            "client_name": rng.choice(CLIENTS),
            "installation_id": inst,
            "yard_location": rng.choice(YARDS) if segment == "New Build" else "Offshore and onshore sites",
            "country_code": "NO" if rng.random() < 0.82 else rng.choice(["GB", "DK"]),
            "contract_type": contract,
            "contract_value_nok": int(rng.uniform(*value) * 1e9 // 1e5 * 1e5),
            "start_date": start,
            "planned_finish_date": planned_finish,
            "actual_finish_date": actual_finish,
            "project_status": status,
            "project_manager_name": rng.choice(pm),
            "size_factor": round(float(rng.uniform(*size)), 3),
            "_virtual_finish": virtual_finish,
        })
    return pd.DataFrame(rows)


def started_by_baseline(project: pd.DataFrame) -> pd.DataFrame:
    return project[project["start_date"] <= BASELINE_DATE]


def build_resources(discipline: pd.DataFrame, n: int = 420) -> pd.DataFrame:
    names = make_people(n)
    d_idx = wchoice(discipline, [1.2, 1.1, 1.0, 1.0, 0.9, 0.8, 0.5, 0.4, 0.5, 1.6, 1.4, 0.7, 0.9, 0.6, 0.5], n)
    seniority = pick(["Junior", "Intermediate", "Senior", "Lead"], [0.25, 0.35, 0.28, 0.12], n)
    mult = {"Junior": 0.82, "Intermediate": 1.0, "Senior": 1.18, "Lead": 1.38}
    base = discipline["standard_hourly_rate_nok"].to_numpy()[d_idx]
    return pd.DataFrame({
        "resource_id": [f"RES-{i + 1:04d}" for i in range(n)],
        "resource_name": names,
        "discipline_id": discipline["discipline_id"].to_numpy()[d_idx],
        "role_title": [f"{s} {discipline['discipline_name'].iloc[d]} {r}" for s, d, r in zip(
            seniority, d_idx, pick(["Engineer", "Specialist", "Coordinator", "Supervisor"], [0.5, 0.2, 0.2, 0.1], n))],
        "seniority_level": seniority,
        "employment_type": pick(["Employee", "Contractor"], [0.68, 0.32], n),
        "home_location": pick(["Fornebu", "Stord", "Verdal", "Haugesund", "Kristiansund", "Egersund", "London"],
                              [0.28, 0.2, 0.15, 0.12, 0.1, 0.08, 0.07], n),
        "hourly_rate_nok": np.round(base * np.array([mult[s] for s in seniority]) * rng.normal(1, 0.04, n), 0).astype(int),
    })


def build_equipment_class(discipline: pd.DataFrame) -> pd.DataFrame:
    rows, k = [], 0
    disc_by_code = dict(zip(discipline["discipline_code"], discipline["discipline_id"]))
    for group, names, abbr, dcode, pressure, wrange in EQUIPMENT:
        for nm, ab in zip(names, abbr):
            k += 1
            rows.append({
                "equipment_class_id": f"CF-{30000100 + k * 7}",
                "equipment_class_name": nm,
                "equipment_class_group": group,
                "tag_abbreviation": ab,
                "default_discipline_id": disc_by_code[dcode],
                "is_pressure_containing": pressure,
                "typical_min_weight_kg": wrange[0],
                "typical_max_weight_kg": wrange[1],
                "class_description": f"{nm} in the {group.lower()} group, classified in a CFIHOS-style class hierarchy.",
            })
    return pd.DataFrame(rows)


def build_cost_code() -> pd.DataFrame:
    rows, k = [], 0
    for cat, ctype, names in COST_CODES:
        for nm in names:
            k += 1
            rows.append({
                "cost_code_id": f"CC-{k:03d}",
                "cost_code": f"{(k * 37) % 900 + 100}",
                "cost_code_name": nm,
                "cost_category": cat,
                "cost_type": ctype,
            })
    return pd.DataFrame(rows)


def build_supplier(n: int = 260) -> pd.DataFrame:
    cat_w = [1.2, 1.1, 1.1, 0.7, 1.0, 0.9, 0.5, 0.6, 0.8, 1.0]
    cats = pick(SUPPLIER_CATEGORIES, cat_w, n)
    countries = pick([c[0] for c in COUNTRIES], [c[1] for c in COUNTRIES], n)
    names, seen = [], set()
    for c, cc in zip(cats, countries):
        for _ in range(50):
            nm = f"{rng.choice(SUPPLIER_PREFIX)} {rng.choice(SUPPLIER_STEMS[c])} {LEGAL[cc]}"
            if nm not in seen:
                seen.add(nm)
                break
        names.append(nm)
    quality = np.clip(rng.normal(3.7, 0.7, n), 1.5, 5.0).round(1)
    return pd.DataFrame({
        "supplier_id": [f"SUP-{i + 1:04d}" for i in range(n)],
        "supplier_name": names,
        "supplier_category": cats,
        "country_code": countries,
        "approval_status": np.where(quality < 2.4, "Conditional", np.where(rng.random(n) < 0.04, "Suspended", "Approved")),
        "quality_rating": quality,
        "payment_terms_days": pick([30, 45, 60, 90], [0.4, 0.2, 0.3, 0.1], n),
        "is_preferred_supplier": (quality >= 4.2) & (rng.random(n) < 0.7),
        "onboarded_date": to_dates(pd.Series(ts("2012-01-01") + pd.to_timedelta(rng.integers(0, 4800, n), unit="D"))),
    })


def build_material(equipment_class: pd.DataFrame, n: int = 1200) -> pd.DataFrame:
    groups = pick(SUPPLIER_CATEGORIES, [1.0, 1.4, 1.1, 0.5, 0.9, 1.0, 0.5, 0.6, 0.8, 1.1], n)
    class_by_cat = {
        "Valves": "Valves", "Rotating Equipment": "Pumps", "Electrical": "Electrical",
        "Instrumentation": "Instrumentation", "Piping and Fittings": "Piping",
        "Structural Components": "Structural", "Safety Equipment": "Safety and Marine",
    }
    rows = []
    for i, g in enumerate(groups):
        (lo, hi), uom = PRICE_RANGE[g]
        price = float(np.exp(rng.uniform(np.log(lo), np.log(hi))))
        cls = None
        if g in class_by_cat:
            pool = equipment_class[equipment_class["equipment_class_group"] == class_by_cat[g]]
            cls = pool.iloc[rng.integers(len(pool))]
        spec = rng.choice(["316L", "Duplex", "Carbon steel", "Super duplex", "Galvanised", "Zinc plated", "Standard"])
        size = rng.choice(["DN25", "DN50", "DN100", "DN150", "DN200", "DN300", "10 mm", "20 mm", "40 mm", "Class 150",
                           "Class 300", "Class 600", "Class 900"])
        base = cls["equipment_class_name"] if cls is not None else g.rstrip("s")
        rows.append({
            "material_id": f"MAT-{i + 1:05d}",
            "material_code": f"M{rng.integers(10000000, 99999999)}",
            "material_description": f"{base}, {size}, {spec}",
            "material_group": g,
            "equipment_class_id": cls["equipment_class_id"] if cls is not None else None,
            "unit_of_measure": uom,
            "standard_unit_price_nok": round(price, 2),
            "standard_lead_time_days": int(np.clip(rng.lognormal(np.log(35) if g != "Rotating Equipment" else np.log(150), 0.45), 5, 420)),
            "is_critical_spare": bool(rng.random() < (0.18 if g in ("Rotating Equipment", "Valves", "Instrumentation") else 0.03)),
        })
    return pd.DataFrame(rows)


# ---------------------------------------------------------------------------
# Planning domain
# ---------------------------------------------------------------------------
def build_work_packages(project, discipline, resource, n_total: int = 1100) -> pd.DataFrame:
    active = started_by_baseline(project).copy()
    planning = project[project["start_date"] > BASELINE_DATE]
    weights = np.concatenate([active["size_factor"].to_numpy(), planning["size_factor"].to_numpy() * 0.5])
    proj_all = pd.concat([active, planning])
    counts = rng.multinomial(n_total - len(proj_all) * 4, weights / weights.sum()) + 4
    disc_by_code = dict(zip(discipline["discipline_code"], discipline["discipline_id"]))
    res_by_disc = {d: g["resource_id"].to_numpy() for d, g in resource.groupby("discipline_id")}
    rows, k = [], 0
    for (_, p), cnt in zip(proj_all.iterrows(), counts):
        dur = (p["planned_finish_date"] - p["start_date"]).days
        for _ in range(cnt):
            k += 1
            wt_idx = rng.integers(len(WP_TYPES))
            wt = WP_TYPES[wt_idx]
            dcode = rng.choice(wt[3])
            did = disc_by_code[dcode]
            s = p["start_date"] + pd.Timedelta(days=int(dur * (wt[1] + rng.uniform(0, 0.12))))
            f = p["start_date"] + pd.Timedelta(days=int(dur * (wt[2] - rng.uniform(0, 0.12))))
            if f <= s + pd.Timedelta(days=21):
                f = s + pd.Timedelta(days=int(rng.integers(28, 120)))
            pool = res_by_disc.get(did)
            owner = rng.choice(pool) if pool is not None else rng.choice(resource["resource_id"])
            rows.append({
                "work_package_id": f"WP-{k:05d}",
                "project_id": p["project_id"],
                "discipline_id": did,
                "work_package_code": f"{p['project_code']}-{dcode}-{k % 1000:03d}",
                "work_package_name": f"{wt[0]} {dcode} package {rng.integers(1, 40)}",
                "work_package_type": wt[0],
                "planned_start_date": s,
                "planned_finish_date": f,
                "responsible_resource_id": owner,
            })
    return pd.DataFrame(rows)


def build_tags(project, installation, equipment_class, discipline, n_inst: int = 2000, n_proj: int = 1600) -> pd.DataFrame:
    disc_by_id = equipment_class.set_index("equipment_class_id")["default_discipline_id"].to_dict()
    class_w = {"Pumps": 0.05, "Valves": 0.22, "Vessels": 0.04, "Heat Exchangers": 0.03,
               "Compressors and Turbines": 0.02, "Electrical": 0.1, "Instrumentation": 0.27, "Piping": 0.15,
               "Structural": 0.05, "Safety and Marine": 0.03, "Lifting": 0.01, "Subsea": 0.03}
    cw = equipment_class["equipment_class_group"].map(class_w).to_numpy()
    cw = cw / cw.sum() * 1.0
    # weight by group share spread over its classes
    grp_n = equipment_class.groupby("equipment_class_group")["equipment_class_id"].transform("count").to_numpy()
    cw = equipment_class["equipment_class_group"].map(class_w).to_numpy() / grp_n
    mfr = np.array(MANUFACTURERS, dtype=object)
    sys_codes = np.array([s[0] for s in SYSTEMS])
    sys_names = dict(SYSTEMS)

    def make(n, inst_ids, proj_ids, proj_status):
        cls_idx = wchoice(equipment_class, cw, n)
        cls = equipment_class.iloc[cls_idx].reset_index(drop=True)
        system = rng.choice(sys_codes, n)
        lo, hi = cls["typical_min_weight_kg"].to_numpy(), cls["typical_max_weight_kg"].to_numpy()
        weight = np.exp(rng.uniform(np.log(lo), np.log(hi))).round(0).astype(int)
        pressure = np.where(cls["is_pressure_containing"], np.round(np.exp(rng.uniform(np.log(5), np.log(420)), ), 1), np.nan)
        temp = np.where(cls["is_pressure_containing"], rng.integers(-40, 260, n), np.nan)
        return pd.DataFrame({
            "equipment_class_id": cls["equipment_class_id"],
            "_abbr": cls["tag_abbreviation"],
            "system_code": system,
            "system_name": [sys_names[s] for s in system],
            "tag_description": [f"{c} in {sys_names[s].lower()}" for c, s in zip(cls["equipment_class_name"], system)],
            "installation_id": inst_ids,
            "project_id": proj_ids,
            "discipline_id": cls["default_discipline_id"],
            "manufacturer_name": rng.choice(mfr, n),
            "weight_kg": weight,
            "design_pressure_bar": pressure,
            "design_temperature_c": temp,
            "criticality_class": pick(["A", "B", "C"], [0.12, 0.33, 0.55], n),
            "installation_status": proj_status,
        })

    life = project[project["segment"] == "Life Cycle"]
    inst_w = rng.uniform(0.4, 2.2, len(installation))
    inst_ids = installation["installation_id"].to_numpy()[wchoice(installation, inst_w, n_inst)]
    # link each installation tag to its frame agreement project when one exists
    proj_by_inst = life.dropna(subset=["installation_id"]).groupby("installation_id")["project_id"].first().to_dict()
    inst_part = make(n_inst, inst_ids, [proj_by_inst.get(i) for i in inst_ids],
                     pick(["Operating", "Operating", "Out of service", "Decommissioned"], [0.8, 0.0, 0.14, 0.06], n_inst))
    nb = started_by_baseline(project)
    nb = nb[nb["segment"] == "New Build"]
    pw = nb["size_factor"].to_numpy()
    p_ids = nb["project_id"].to_numpy()[wchoice(nb, pw, n_proj)]
    prog = pick(["Planned", "Fabricated", "Installed", "Commissioned"], [0.2, 0.35, 0.3, 0.15], n_proj)
    proj_part = make(n_proj, [None] * n_proj, p_ids, prog)
    tags = pd.concat([inst_part, proj_part], ignore_index=True)
    # tag numbers: <system>-<class abbreviation>-<sequence>, unique
    seq = tags.groupby(["system_code", "_abbr"]).cumcount() + 1001
    tags["tag_number"] = tags["system_code"] + "-" + tags["_abbr"] + "-" + seq.astype(str)
    tags.insert(0, "tag_id", [f"TAG-{i + 1:06d}" for i in range(len(tags))])
    cols = ["tag_id", "tag_number"] + [c for c in tags.columns if c not in ("tag_id", "tag_number", "_abbr")]
    return tags[cols]


def build_activities(project, work_package, resource, tag) -> pd.DataFrame:
    proj = project.set_index("project_id")
    disc_bias = {}
    res_by_disc = {d: g["resource_id"].to_numpy() for d, g in resource.groupby("discipline_id")}
    tags_by_proj = {p: g["tag_id"].to_numpy() for p, g in tag.dropna(subset=["project_id"]).groupby("project_id")}
    proj_delay = {pid: float(np.clip(rng.normal(0.06, 0.12), -0.05, 0.4)) for pid in proj.index}
    rows, k = [], 0
    for _, wp in work_package.iterrows():
        p = proj.loc[wp["project_id"]]
        n_act = int(np.clip(rng.poisson(9), 3, 24))
        start, finish = wp["planned_start_date"], wp["planned_finish_date"]
        span = max((finish - start).days, 14)
        atypes = ACTIVITY_TYPES[wp["work_package_type"]]
        types = pick([t[0] for t in atypes], [t[1] for t in atypes], n_act)
        offsets = np.sort(rng.uniform(0, 0.85, n_act))
        durations = np.clip(rng.beta(2.0, 4.5, n_act) * 1.6, 0.05, 1.0) * span
        prev_id = None
        pool = res_by_disc.get(wp["discipline_id"])
        ptags = tags_by_proj.get(wp["project_id"])
        for i in range(n_act):
            k += 1
            t = types[i]
            ps = start + pd.Timedelta(days=int(offsets[i] * span))
            pf = ps + pd.Timedelta(days=int(max(3, durations[i])))
            base_hours = float(np.exp(rng.normal(np.log(650), 0.75))) * p["size_factor"]
            planned_hours = round(float(np.clip(base_hours, 20, 12000)), 1)
            delay = proj_delay[wp["project_id"]] + ACTIVITY_DELAY[t]
            lag = int(max(-4, rng.exponential(3 + 55 * max(delay, 0)) - (3 if rng.random() < 0.15 else 0)))
            if rng.random() < 0.03:
                lag += int(rng.integers(30, 90))
            dur_factor = max(0.6, 1 + delay + rng.normal(0, 0.14))
            vs = ps + pd.Timedelta(days=lag)
            vf = vs + pd.Timedelta(days=int(max(2, (pf - ps).days * dur_factor)))
            hours_factor = float(np.clip(rng.normal(1.05 + delay, 0.22), 0.45, 2.2))
            tag_id = (rng.choice(ptags) if ptags is not None and t in ("Fabricate", "Install", "Test", "Inspect", "Procure")
                      and rng.random() < 0.65 else None)
            verb = rng.choice(ACTIVITY_VERB[t])
            obj = tag[tag["tag_id"] == tag_id]["tag_number"].iloc[0] if tag_id is not None else f"{wp['work_package_type'].lower()} scope {rng.integers(1, 99)}"
            critical = rng.random() < (0.2 if t in ("Fabricate", "Install", "Procure") else 0.07)
            rows.append({
                "activity_id": f"ACT-{k:06d}", "work_package_id": wp["work_package_id"],
                "project_id": wp["project_id"], "discipline_id": wp["discipline_id"],
                "activity_code": f"{wp['work_package_code']}-{i + 1:03d}",
                "activity_name": f"{verb} {obj}", "activity_type": t,
                "planned_start_date": ps, "planned_finish_date": pf,
                "_virtual_start": vs, "_virtual_finish": vf,
                "planned_hours": planned_hours, "_hours_factor": hours_factor,
                "is_critical_path": bool(critical),
                "assigned_resource_id": rng.choice(pool) if pool is not None else None,
                "tag_id": tag_id,
                "predecessor_activity_id": prev_id if prev_id and rng.random() < 0.8 else None,
            })
            prev_id = f"ACT-{k:06d}"
    a = pd.DataFrame(rows)
    # censor at the as-of date to get actuals
    vs, vf = a["_virtual_start"], a["_virtual_finish"]
    started = vs <= AS_OF
    finished = vf <= AS_OF
    a["actual_start_date"] = vs.where(started)
    a["actual_finish_date"] = vf.where(finished & started)
    elapsed = ((AS_OF - vs).dt.days / (vf - vs).dt.days.clip(lower=1)).clip(0, 1)
    pct = np.where(finished, 100.0, np.where(started, np.clip(elapsed * 100 + rng.normal(0, 6, len(a)), 3, 97), 0.0))
    a["percent_complete"] = np.round(pct, 1)
    a["activity_status"] = np.where(finished, "Completed", np.where(started, "In progress", "Not started"))
    a["actual_hours"] = np.round(a["planned_hours"] * a["_hours_factor"] * a["percent_complete"] / 100, 1)
    return a


def build_progress_weekly(a: pd.DataFrame) -> pd.DataFrame:
    """Weekly snapshots from the activity's planned start up to the as-of date.

    A snapshot only depends on its own week, so moving the as-of date forward
    adds weeks and never changes the ones already reported.
    """
    out = []
    cols = {"_hours_factor": "hours_factor", "_virtual_start": "vs", "_virtual_finish": "vf"}
    for r in a.rename(columns=cols).itertuples(index=False):
        ps, pf = r.planned_start_date, r.planned_finish_date
        first_we = ps + pd.Timedelta(days=(6 - ps.weekday()) % 7)  # first Sunday on or after planned start
        weeks = pd.date_range(first_we, min(AS_OF, r.vf + pd.Timedelta(days=6)), freq="7D")
        if len(weeks) == 0:
            continue
        n = len(weeks)
        planned_pct = np.clip((weeks - ps).days / max((pf - ps).days, 1) * 100, 0, 100)
        actual_pct = np.clip((weeks - r.vs).days / max((r.vf - r.vs).days, 1) * 100, 0, 100)
        noise = np.random.default_rng([SEED, int(r.activity_id[4:])]).normal(0, 1.5, n)
        actual_pct = np.where(weeks < r.vs, 0.0, np.clip(actual_pct + noise, 0, 100))
        actual_pct = np.where(weeks >= r.vf, 100.0, np.maximum.accumulate(actual_pct))
        actual_pct = np.round(actual_pct, 1)
        cum_hours = np.round(r.planned_hours * r.hours_factor * actual_pct / 100, 1)
        weekly = np.round(np.diff(cum_hours, prepend=0.0), 1)
        out.append(pd.DataFrame({
            "progress_id": [f"PRG-{r.activity_id[4:]}-{w:%Y%m%d}" for w in weeks],
            "activity_id": r.activity_id, "week_ending_date": weeks,
            "planned_percent_complete": np.round(planned_pct, 1),
            "actual_percent_complete": actual_pct,
            "hours_booked_in_week": weekly, "cumulative_hours_booked": cum_hours,
        }))
    return pd.concat(out, ignore_index=True)


def build_milestones(project: pd.DataFrame) -> pd.DataFrame:
    area_pool = ["Main structure", "Process module", "Utility module", "Piping", "Electrical and instrument",
                 "Marine systems", "Living quarters", "Subsea scope"]
    rows, k = [], 0
    for _, p in project.iterrows():
        dur = (p["planned_finish_date"] - p["start_date"]).days
        areas = rng.choice(area_pool, size=int(rng.integers(2, 5)), replace=False)
        for area in areas:
            fracs = np.clip(np.linspace(0, 1, len(MILESTONES)) + rng.normal(0, 0.03, len(MILESTONES)), 0, 1)
            for fr, (nm, mtype, pay) in zip(np.sort(fracs), MILESTONES):
                k += 1
                planned = p["start_date"] + pd.Timedelta(days=int(dur * fr))
                slip = int(rng.normal(10 + 45 * fr * (0.5 + p["size_factor"] / 2), 20))
                forecast = planned + pd.Timedelta(days=max(slip, -7))
                reached = forecast <= AS_OF
                rows.append({
                    "milestone_id": f"MS-{k:05d}", "project_id": p["project_id"],
                    "milestone_name": f"{nm} - {area}", "milestone_type": mtype,
                    "planned_date": planned, "forecast_date": forecast,
                    "actual_date": forecast if reached else pd.NaT,
                    "milestone_status": "Achieved" if reached else ("At risk" if slip > 21 else "On track"),
                    "is_payment_linked": pay,
                    "payment_weight_percent": round(float(rng.uniform(2, 14)), 1) if pay else 0.0,
                })
    return pd.DataFrame(rows)


def build_documents(project, discipline, resource, n: int = 7000) -> pd.DataFrame:
    """All documents over each project's life, in issue order. main() keeps the ones issued by the as-of date."""
    live = started_by_baseline(project)
    p_idx = wchoice(live, live["size_factor"].to_numpy(), n)
    p = live.iloc[p_idx].reset_index(drop=True)
    d_idx = wchoice(discipline, [1.2, 1.4, 1.2, 1.0, 1.0, 0.8, 0.5, 0.4, 0.5, 0.5, 0.4, 0.3, 0.5, 0.3, 0.4], n)
    d = discipline.iloc[d_idx].reset_index(drop=True)
    dt_idx = wchoice(DOC_TYPES, [2.0, 1.2, 0.9, 1.2, 0.8, 0.7, 1.0, 1.1, 0.3, 0.8], n)
    dtype = np.array([DOC_TYPES[i][0] for i in dt_idx])
    dcode = np.array([DOC_TYPES[i][1] for i in dt_idx])
    span = (p["_virtual_finish"] - p["start_date"]).dt.days.clip(lower=30)
    frac = rng.beta(1.8, 1.6, n)
    issued = (p["start_date"] + pd.to_timedelta((span * frac).astype(int), unit="D")).dt.normalize()
    age = (AS_OF - issued).dt.days
    status = np.where(age > 420, pick(["As-built", "Issued for construction", "Superseded"], [0.45, 0.35, 0.2], n),
                      np.where(age > 150, pick(["Issued for construction", "Issued for approval", "Superseded"], [0.55, 0.3, 0.15], n),
                               pick(["Issued for review", "Issued for approval", "Issued for construction"], [0.4, 0.35, 0.25], n)))
    rev = np.where(np.isin(status, ["Issued for review", "Issued for approval"]),
                   pick(["A", "B", "C", "D"], [0.4, 0.3, 0.2, 0.1], n), pick(["01", "02", "03", "04"], [0.4, 0.3, 0.2, 0.1], n))
    res_by_disc = {k: g["resource_id"].to_numpy() for k, g in resource.groupby("discipline_id")}
    author = [rng.choice(res_by_disc.get(x, resource["resource_id"].to_numpy())) for x in d["discipline_id"]]
    subject = rng.choice(["main deck", "pump skid", "export riser", "flare tower", "cable routing", "pipe rack", "living quarters",
                          "power module", "separator package", "crane foundation", "escape way", "tie-in point", "lifting frame"], n)
    pages = np.clip(rng.lognormal(2.4, 0.9, n), 1, 400).astype(int)
    doc = pd.DataFrame({
        "document_title": [f"{t} - {s}" for t, s in zip(dtype, subject)],
        "document_type": dtype, "project_id": p["project_id"], "discipline_id": d["discipline_id"],
        "revision": rev, "document_status": status, "issued_date": issued,
        "author_resource_id": author, "page_count": pages,
        "_project_code": p["project_code"], "_discipline_code": d["discipline_code"], "_type_code": dcode,
    }).sort_values("issued_date", kind="stable").reset_index(drop=True)
    seq = doc.groupby(["_project_code", "_discipline_code", "_type_code"]).cumcount() + 1
    doc.insert(0, "document_id", [f"DOC-{i + 1:06d}" for i in range(n)])
    doc.insert(1, "document_number", [f"{pc}-{dc}-{tc}-{s:04d}" for pc, dc, tc, s in
                                      zip(doc["_project_code"], doc["_discipline_code"], doc["_type_code"], seq)])
    return doc


def build_activity_document(activity, document) -> pd.DataFrame:
    docs = {k: g["document_id"].to_numpy() for k, g in document.groupby(["project_id", "discipline_id"])}
    rows = []
    for r in activity.itertuples(index=False):
        pool = docs.get((r.project_id, r.discipline_id))
        if pool is None or rng.random() > 0.55:
            continue
        for d in rng.choice(pool, size=min(len(pool), int(rng.integers(1, 4))), replace=False):
            rel = {"Design": "Output", "Document": "Output", "Inspect": "Reference", "Test": "Reference"}.get(r.activity_type, "Input")
            rows.append((r.activity_id, d, rel))
    return pd.DataFrame(rows, columns=["activity_id", "document_id", "relation_type"])


# ---------------------------------------------------------------------------
# Procurement domain
# ---------------------------------------------------------------------------
def build_purchase_orders(project, supplier, material, cost_code, resource, n_po: int = 4700):
    live = started_by_baseline(project).reset_index(drop=True)
    p = live.iloc[wchoice(live, live["size_factor"].to_numpy() * live["contract_value_nok"].to_numpy() ** 0.3, n_po)].reset_index(drop=True)
    span = (p["_virtual_finish"] - p["start_date"]).dt.days.clip(lower=60)
    order_date = (p["start_date"] + pd.to_timedelta((span * rng.beta(1.3, 2.2, n_po)).astype(int), unit="D")).dt.normalize()
    group = pick(SUPPLIER_CATEGORIES, [1.0, 1.4, 1.1, 0.4, 0.9, 1.0, 0.5, 0.6, 0.8, 1.1], n_po)
    sup_by_cat = {c: g for c, g in supplier[supplier["approval_status"] != "Suspended"].groupby("supplier_category")}
    sup_ids, sup_q = [], []
    for g in group:
        pool = sup_by_cat[g]
        w = np.exp(pool["quality_rating"].to_numpy() - 3) * np.where(pool["is_preferred_supplier"], 2.0, 1.0)
        i = wchoice(pool, w, 1)[0]
        sup_ids.append(pool["supplier_id"].iloc[i])
    ccy = pick(["NOK", "EUR", "USD", "GBP"], [0.55, 0.25, 0.15, 0.05], n_po)
    base_fx = {"NOK": 1.0, "EUR": 11.6, "USD": 10.5, "GBP": 13.6}
    month_num = (order_date.dt.year - 2022) * 12 + order_date.dt.month
    fx = np.array([base_fx[c] * (1 + 0.05 * np.sin(m / 5.0) + rng.normal(0, 0.008)) if c != "NOK" else 1.0 for c, m in zip(ccy, month_num)]).round(4)
    buyers = resource[resource["discipline_id"] == "DSC-14"]["resource_id"].to_numpy()
    po = pd.DataFrame({
        "purchase_order_id": [f"PO-{i + 1:06d}" for i in range(n_po)],
        "project_id": p["project_id"], "supplier_id": sup_ids, "order_date": order_date,
        "buyer_resource_id": rng.choice(buyers, n_po), "currency_code": ccy, "exchange_rate_to_nok": fx,
        "incoterms": pick(["DAP", "FCA", "EXW", "CIF", "DDP"], [0.4, 0.2, 0.15, 0.15, 0.1], n_po),
        "_group": group,
    }).sort_values(["order_date", "purchase_order_id"]).reset_index(drop=True)
    po["purchase_order_id"] = [f"PO-{i + 1:06d}" for i in range(n_po)]

    sup = supplier.set_index("supplier_id")
    mats_by_group = {g: m for g, m in material.groupby("material_group")}
    cc_by_group = {
        "Steel and Plate": [0, 1], "Piping and Fittings": [2], "Valves": [3], "Rotating Equipment": [4],
        "Electrical": [5], "Instrumentation": [6], "Coatings and Paint": [7], "Safety Equipment": [8],
        "Structural Components": [0, 1], "Consumables": [9, 28, 29],
    }
    lines = []
    for r in po.rename(columns={"_group": "material_group"}).itertuples(index=False):
        n_lines = int(np.clip(rng.geometric(0.27), 1, 14))
        pool = mats_by_group[r.material_group]
        # material popularity: a few materials are ordered again and again
        w = 1.0 / (np.arange(1, len(pool) + 1) ** 0.7)
        sel = rng.choice(len(pool), size=n_lines, p=w / w.sum())
        sq = float(sup.loc[r.supplier_id, "quality_rating"])
        for ln, mi in enumerate(sel, start=1):
            m = pool.iloc[mi]
            qty = max(1, int(np.exp(rng.normal(np.log(14 if m["unit_of_measure"] == "ea" else 40), 1.0))))
            if m["standard_unit_price_nok"] > 500000:
                qty = max(1, int(qty / 8))
            price = m["standard_unit_price_nok"] * (1 + 0.012 * (r.order_date.year - 2022)) * float(np.clip(rng.normal(1, 0.07), 0.8, 1.3))
            disc = float(pick([0, 2.5, 5, 7.5, 10], [0.55, 0.15, 0.15, 0.1, 0.05], 1)[0])
            lead = m["standard_lead_time_days"] * rng.uniform(0.85, 1.3)
            promised = r.order_date + pd.Timedelta(days=int(lead))
            delay = rng.normal((4.0 - sq) * 7, 9)
            if rng.random() < 0.14:
                delay += rng.integers(14, 75)
            actual = promised + pd.Timedelta(days=int(max(delay, -12)))
            cc_pool = cc_by_group[r.material_group]
            lines.append((r.purchase_order_id, ln, m["material_id"], int(rng.choice(cc_pool)) + 1, qty,
                          round(price, 2), disc, promised, actual, sq))
    ln = pd.DataFrame(lines, columns=["purchase_order_id", "line_number", "material_id", "_cc", "quantity_ordered",
                                     "unit_price_nok", "discount_percent", "promised_delivery_date", "_virtual_actual", "_sq"])
    ln["cost_code_id"] = ln["_cc"].map(lambda i: f"CC-{i:03d}")
    cancelled = rng.random(len(ln)) < 0.03
    delivered = (ln["_virtual_actual"] <= AS_OF) & ~cancelled
    ln["actual_delivery_date"] = ln["_virtual_actual"].where(delivered)
    partial = delivered & (rng.random(len(ln)) < 0.04) & (ln["quantity_ordered"] > 1)
    rejected = delivered & (rng.random(len(ln)) < (0.012 + 0.012 * np.clip(4 - ln["_sq"], 0, 3)))
    ln["quantity_received"] = np.where(delivered, np.where(partial, (ln["quantity_ordered"] * rng.uniform(0.4, 0.9, len(ln))).astype(int), ln["quantity_ordered"]), 0)
    ln["quantity_rejected"] = np.where(rejected, np.maximum(1, (ln["quantity_received"] * rng.uniform(0.02, 0.2, len(ln))).astype(int)), 0)
    ln["line_status"] = np.where(cancelled, "Cancelled", np.where(partial, "Partially received",
                                  np.where(delivered, "Delivered", "Open")))
    ln["line_amount_nok"] = (ln["quantity_ordered"] * ln["unit_price_nok"] * (1 - ln["discount_percent"] / 100)).round(2)
    ln.insert(0, "purchase_order_line_id", [f"POL-{i + 1:07d}" for i in range(len(ln))])
    ln = ln[["purchase_order_line_id", "purchase_order_id", "line_number", "material_id", "cost_code_id", "quantity_ordered",
             "quantity_received", "quantity_rejected", "unit_price_nok", "discount_percent", "line_amount_nok",
             "promised_delivery_date", "actual_delivery_date", "line_status"]]
    # keep what has been ordered by the as-of date; ids are in order date order, so this is a prefix
    po = po[po["order_date"] <= AS_OF].copy()
    ln = ln[ln["purchase_order_id"].isin(po["purchase_order_id"])].reset_index(drop=True)
    # header status from lines
    st = ln.groupby("purchase_order_id")["line_status"].agg(lambda s: "Closed" if (s.isin(["Delivered", "Cancelled"])).all() else "Open")
    po["po_status"] = po["purchase_order_id"].map(st)
    po = po.drop(columns="_group")
    return po, ln


# ---------------------------------------------------------------------------
# Maintenance domain
# ---------------------------------------------------------------------------
def build_work_orders(project, installation, tag, equipment_class, supplier, discipline, n: int = 9000) -> pd.DataFrame:
    cls = equipment_class.set_index("equipment_class_id")
    itags = tag[tag["installation_id"].notna() & (tag["installation_status"] != "Decommissioned")].reset_index(drop=True)
    # recurring maintenance concentrates on critical tags and on older installations
    inst_year = installation.set_index("installation_id")["year_in_service"]
    w = itags["criticality_class"].map({"A": 3.0, "B": 1.5, "C": 0.6}).to_numpy() * (1 + (2026 - itags["installation_id"].map(inst_year).to_numpy()) / 25)
    idx = wchoice(itags, w, n)
    t = itags.iloc[idx].reset_index(drop=True)
    wo_types = ["Preventive", "Corrective", "Inspection", "Modification", "Shutdown"]
    wtype = pick(wo_types, [0.42, 0.28, 0.17, 0.08, 0.05], n)
    # reported date over 2023-01 to 2026-12 with a spring and summer peak for turnaround work
    days = rng.integers(0, 1460, n)
    reported = ts("2023-01-01") + pd.to_timedelta(days, unit="D")
    month = reported.month
    boost = np.where(np.isin(wtype, ["Shutdown", "Modification"]) & np.isin(month, [4, 5, 6, 7, 8]), 1, 0)
    resample = (np.isin(wtype, ["Shutdown", "Modification"]) & (boost == 0) & (rng.random(n) < 0.6))
    days = np.where(resample, rng.integers(90, 240, n) + 365 * rng.integers(0, 4, n), days)
    reported = ts("2023-01-01") + pd.to_timedelta(np.clip(days, 0, 1459), unit="D")
    prio = np.where(wtype == "Corrective", pick([1, 2, 3, 4], [0.14, 0.34, 0.37, 0.15], n),
                    pick([2, 3, 4], [0.1, 0.45, 0.45], n))
    prio = prio.astype(int)
    lag_days = np.where(prio == 1, rng.integers(0, 3, n), np.where(prio == 2, rng.integers(1, 14, n), rng.integers(7, 75, n)))
    pstart = reported + pd.to_timedelta(lag_days, unit="D")
    base_hours = {"Preventive": 18, "Corrective": 34, "Inspection": 26, "Modification": 260, "Shutdown": 640}
    planned_hours = np.array([float(np.clip(rng.lognormal(np.log(base_hours[x]), 0.55), 2, 6000)) for x in wtype]).round(1)
    pfinish = pstart + pd.to_timedelta(np.clip((planned_hours / 24).astype(int) + 1, 1, 120), unit="D")
    delay = np.clip(rng.normal(1.1 + (4 - prio) * 0.04, 0.3), 0.5, 2.8)
    afinish_v = pstart + pd.to_timedelta(np.maximum(1, ((pfinish - pstart).days * delay)).astype(int), unit="D")
    astart_v = pstart + pd.to_timedelta(rng.integers(-1, 6, n), unit="D")
    astart_v = pd.DatetimeIndex(np.minimum(astart_v, afinish_v))  # never start after the finish
    started = astart_v <= AS_OF
    finished = afinish_v <= AS_OF
    cancelled = (rng.random(n) < 0.03)
    status = np.where(cancelled, "Cancelled", np.where(finished, "Completed", np.where(started, "In progress", "Planned")))
    actual_hours = np.where(status == "Completed", planned_hours * np.clip(rng.normal(1.08, 0.3, n), 0.4, 3.0),
                            np.where(status == "In progress", planned_hours * rng.uniform(0.1, 0.8, n), 0)).round(1)
    cls_group = t["equipment_class_id"].map(cls["equipment_class_group"])
    failure = np.array([rng.choice(FAILURE_BY_GROUP.get(g, FAILURE_DEFAULT)) if wt == "Corrective" else None
                        for g, wt in zip(cls_group, wtype)], dtype=object)
    rate = t["discipline_id"].map(discipline.set_index("discipline_id")["standard_hourly_rate_nok"]).to_numpy()
    material_cost = np.where(status == "Completed", np.exp(rng.normal(np.log(np.select(
        [wtype == "Shutdown", wtype == "Modification", wtype == "Corrective"], [180000, 120000, 14000], 3500)), 0.9)), 0).round(0)
    maint_suppliers = supplier[supplier["supplier_category"].isin(["Rotating Equipment", "Consumables", "Electrical", "Instrumentation", "Structural Components"])]
    contractor = np.where(rng.random(n) < np.where(np.isin(wtype, ["Shutdown", "Modification"]), 0.8, 0.22),
                          rng.choice(maint_suppliers["supplier_id"].to_numpy(), n), None)
    downtime = np.where((wtype == "Corrective") & (prio <= 2) & (status == "Completed"), rng.exponential(18, n), 0).round(1)
    inst_proj = project.dropna(subset=["installation_id"]).groupby("installation_id")["project_id"].first()
    desc = [f"{wt} work on {tn}" if f is None else f"{f} on {tn}" for wt, f, tn in zip(wtype, failure, t["tag_number"])]
    wo = pd.DataFrame({
        "installation_id": t["installation_id"], "tag_id": t["tag_id"],
        "project_id": t["installation_id"].map(inst_proj), "discipline_id": t["discipline_id"],
        "work_order_type": wtype, "priority": prio.astype(int), "work_order_status": status,
        "failure_mode": failure, "work_order_description": desc,
        "is_safety_critical": (t["criticality_class"] == "A").to_numpy() & (rng.random(n) < 0.6),
        "reported_date": reported.normalize(),
        "planned_start_date": pstart.normalize(), "planned_finish_date": pfinish.normalize(),
        "actual_start_date": pd.Series(astart_v).where(pd.Series(status).isin(["Completed", "In progress"]).to_numpy()).dt.normalize(),
        "actual_finish_date": pd.Series(afinish_v).where((status == "Completed")).dt.normalize(),
        "planned_hours": planned_hours, "actual_hours": actual_hours,
        "labour_cost_nok": (actual_hours * rate * rng.normal(1.0, 0.05, n)).round(0),
        "material_cost_nok": material_cost, "downtime_hours": downtime, "contractor_supplier_id": contractor,
    }).sort_values("reported_date", kind="stable").reset_index(drop=True)
    # ids follow the reported date, so the work orders reported by the as-of date are a prefix
    wo.insert(0, "work_order_id", [f"WO-{i + 1:07d}" for i in range(n)])
    return wo[wo["reported_date"] <= AS_OF].reset_index(drop=True)


# ---------------------------------------------------------------------------
def finalize(df: pd.DataFrame) -> pd.DataFrame:
    df = df[[c for c in df.columns if not c.startswith("_")]].copy()
    for c in df.columns:
        if str(df[c].dtype).startswith("datetime64"):
            df[c] = pd.to_datetime(df[c]).dt.normalize()
    return df


def write(df: pd.DataFrame, name: str, out: Path) -> None:
    df = finalize(df)
    table = pa.Table.from_pandas(df, preserve_index=False)
    fields = []
    for f in table.schema:
        fields.append(pa.field(f.name, pa.date32()) if pa.types.is_timestamp(f.type) else f)
    table = table.cast(pa.schema(fields))
    pq.write_table(table, out / f"{name}.parquet", compression="snappy")
    print(f"{name:28s} {len(df):>7,d} rows  {len(df.columns):>2d} cols")


def main() -> None:
    global AS_OF
    ap = argparse.ArgumentParser()
    ap.add_argument("--as-of", required=True, help="'today' inside the data, yyyy-mm-dd, on or after 2026-09-30")
    ap.add_argument("--out", default=str(Path(__file__).resolve().parents[1] / "data" / "silver"))
    args = ap.parse_args()
    AS_OF = pd.Timestamp(args.as_of).normalize()
    if AS_OF < BASELINE_DATE:
        raise SystemExit(f"--as-of must be on or after {BASELINE_DATE.date()}")
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    discipline = build_discipline()
    installation = build_installation()
    project = build_projects(installation)
    resource = build_resources(discipline)
    equipment_class = build_equipment_class(discipline)
    cost_code = build_cost_code()
    supplier = build_supplier()
    material = build_material(equipment_class)
    tag = build_tags(project, installation, equipment_class, discipline)
    work_package = build_work_packages(project, discipline, resource)
    activity = build_activities(project, work_package, resource, tag)
    progress = build_progress_weekly(activity)
    milestone = build_milestones(project)
    all_documents = build_documents(project, discipline, resource)
    activity_document = build_activity_document(activity, all_documents)
    document = all_documents[all_documents["issued_date"] <= AS_OF]
    activity_document = activity_document[activity_document["document_id"].isin(document["document_id"])]
    po, pol = build_purchase_orders(project, supplier, material, cost_code, resource)
    work_order = build_work_orders(project, installation, tag, equipment_class, supplier, discipline)

    # derived roll-ups that belong on the master rows
    wp_hours = activity.groupby("work_package_id")["planned_hours"].sum()
    work_package["planned_hours"] = work_package["work_package_id"].map(wp_hours).fillna(0).round(1)
    disc_rate = discipline.set_index("discipline_id")["standard_hourly_rate_nok"]
    work_package["planned_cost_nok"] = (work_package["planned_hours"] * work_package["discipline_id"].map(disc_rate)).round(0)
    wp_status = activity.groupby("work_package_id")["activity_status"].agg(
        lambda s: "Completed" if (s == "Completed").all() else ("Not started" if (s == "Not started").all() else "In progress"))
    work_package["work_package_status"] = work_package["work_package_id"].map(wp_status).fillna("Not started")
    project["planned_total_hours"] = project["project_id"].map(activity.groupby("project_id")["planned_hours"].sum()).fillna(0).round(0).astype(int)

    project = project.drop(columns="size_factor")
    for df, name in [
        (discipline, "discipline"), (installation, "installation"), (project, "project"), (resource, "resource"),
        (work_package, "work_package"), (activity, "activity"), (progress, "activity_progress_weekly"),
        (milestone, "milestone"), (document, "document"), (activity_document, "activity_document"),
        (equipment_class, "equipment_class"), (tag, "tag"), (supplier, "supplier"), (material, "material"),
        (cost_code, "cost_code"), (po, "purchase_order"), (pol, "purchase_order_line"), (work_order, "work_order"),
    ]:
        write(df, name, out)
    (out / "as_of.txt").write_text(f"{AS_OF.date()}\n")
    print(f"as of {AS_OF.date()}")


if __name__ == "__main__":
    main()
