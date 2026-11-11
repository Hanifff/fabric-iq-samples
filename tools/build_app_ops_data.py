"""Build the operations demo data for the Operations Hub app (apps/operations-hub).

Reads the committed silver data (installations, projects, tags) and writes
apps/operations-hub/src/ops/seed.json: the sites shown in 3D, an equipment
register per site (real tag numbers from the data, placed on a part of the 3D
model by equipment class and system), sample findings, the projects in the
processing control and sample planning change requests.

Deterministic: no randomness, only stable hashes of the input. Rerun with
    .venv/bin/python tools/build_app_ops_data.py
"""

from __future__ import annotations

import json
import zlib
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
SILVER = ROOT / "data" / "silver"
OUT = ROOT / "apps" / "operations-hub" / "src" / "ops" / "seed.json"

KIND = {
    "Subsea Template": ("Subsea template", "subsea"),
    "Floating Production Unit": ("Floating production", "fpso"),
    "Fixed Platform": ("Fixed platform", "platform"),
    "Unmanned Wellhead Platform": ("Wellhead platform", "platform"),
    "Onshore Terminal": ("Onshore terminal", "module"),
}

# Model part -> (preferred equipment classes, preferred systems). Must match src/three/slots.ts.
SLOTS = {
    "subsea": [
        ("FRAME", ["Foundation Pile", "Module Frame"], ["60"]),
        ("XT1", ["Subsea Tree"], ["80"]),
        ("XT2", ["Subsea Tree"], ["80"]),
        ("XT3", ["Subsea Tree"], ["80"]),
        ("XT4", ["Subsea Tree"], ["80"]),
        ("MANIFOLD", ["Subsea Manifold"], ["80"]),
        ("UMBILICAL", ["Umbilical"], ["80"]),
        ("JUMPER", ["Jumper"], ["80"]),
        ("FLOWLINE", ["Flowline"], ["80"]),
    ],
    "platform": [
        ("JACKET", ["Jacket Leg", "Foundation Pile"], ["60"]),
        ("M20", ["Separator", "Scrubber", "Knock-out Drum"], ["21", "20"]),
        ("M23", ["Centrifugal Compressor", "Reciprocating Compressor", "Turboexpander"], ["23"]),
        ("M43", ["Gas Turbine", "Generator"], ["43"]),
        ("LQ", ["Module Frame", "Lifeboat"], ["91"]),
        ("HELIDECK", ["Helideck"], ["60"]),
        ("CRANE", ["Offshore Crane", "Crane Pedestal", "Winch", "Hoist"], ["64"]),
        ("FLARE", ["Safety Relief Valve", "Emergency Shutdown Valve", "Fire Detector"], ["71"]),
    ],
    "fpso": [
        ("HULL", ["Storage Tank", "Pressure Vessel"], ["20", "60"]),
        ("TURRET", ["Mooring Chain", "Anchor Winch"], ["60", "80"]),
        ("M21", ["Separator", "Scrubber"], ["21"]),
        ("M23", ["Centrifugal Compressor", "Reciprocating Compressor"], ["23"]),
        ("M25", ["Centrifugal Pump", "Reciprocating Pump"], ["25"]),
        ("M43", ["Gas Turbine", "Generator"], ["43"]),
        ("FLARE", ["Safety Relief Valve", "Emergency Shutdown Valve"], ["71"]),
        ("LQ", ["Module Frame", "Lifeboat"], ["91"]),
        ("HELIDECK", ["Helideck"], ["60"]),
    ],
    "wind": [
        ("FLOATER", ["Module Frame", "Deck Beam"], ["60"]),
        ("TOWER", ["Stair Tower", "Module Frame"], ["60"]),
        ("NACELLE", ["Generator", "Transformer"], ["43"]),
        ("ROTOR", ["Generator", "Electric Motor"], ["43"]),
        ("MOORING", ["Mooring Chain", "Anchor Winch"], ["60"]),
        ("CABLE", ["Cable Tray", "Junction Box", "Transformer"], ["47"]),
    ],
    "module": [
        ("FRAME", ["Module Frame", "Deck Beam"], ["60", "23"]),
        ("TURBINE", ["Gas Turbine"], ["23", "43"]),
        ("COMPRESSOR", ["Centrifugal Compressor", "Reciprocating Compressor"], ["23"]),
        ("SCRUBBER", ["Scrubber", "Separator", "Knock-out Drum"], ["23", "21"]),
        ("COOLER", ["Air Cooler", "Shell and Tube Heat Exchanger", "Plate Heat Exchanger"], ["23"]),
        ("PIPING", ["Pipe Spool", "Flange Set", "Strainer"], ["23", "36"]),
        ("EROOM", ["Switchgear", "Transformer", "Variable Speed Drive"], ["47"]),
    ],
}

STATUS = {
    "Operating": "Operating",
    "Installed": "Installed",
    "Commissioned": "Installed",
    "Fabricated": "Fabrication",
    "Planned": "Planned",
    "Out of service": "Out of service",
    "Decommissioned": "Out of service",
}

# Alternatives keep titles unique per site; "Load sample data" matches findings by site, tag and title.
FINDING_TITLE = {
    "Pumps": ("Seal leakage on pump", "Bearing temperature high"),
    "Compressors and Turbines": ("Vibration above alarm limit", "Lube oil pressure low"),
    "Valves": ("Valve does not close fully", "Actuator responds slowly"),
    "Vessels": ("Corrosion under insulation", "Level gauge glass cracked"),
    "Structural": ("Coating damage on member", "Corroded grating on walkway"),
    "Subsea": ("Anomaly found on ROV survey", "Marine growth above limit"),
    "Lifting": ("Wire rope due for replacement", "Brake test overdue"),
    "Electrical": ("Hot spot found by thermography", "Cable tray damaged"),
    "Piping": ("Weld defect needs repair", "Support missing on line"),
    "Heat Exchangers": ("Fouling reduces cooler duty", "Tube leak suspected"),
    "Instrumentation": ("Transmitter drifting", "Cable gland not sealed"),
    "Safety and Marine": ("Deluge test failed", "Fire damper stuck open"),
}

# Projects in the processing control: (project code, site code, phase, frequency, include, next push in days,
# last push days ago, last push status, approval, note). Site codes are installation codes or yard codes.
CONTROLS = [
    ("CON-2610", "YLV44", "Execution", "Weekly", True, 1, 6, "Succeeded", "Approved", None),
    ("CON-2325", "SOL45", "Execution", "Weekly", True, 1, 6, "Failed", "Approved",
     "Last push failed on missing baseline dates; rerun after the fix."),
    ("CON-2507", "EGERSUND", "Execution", "Bi-weekly", True, 8, 6, "Succeeded", "Approved", None),
    ("CON-2618", "LIN15", "Execution", "Weekly", True, 1, 13, "Skipped", "Pending",
     "Requested weekly pushes during the campaign."),
    ("CON-2601", "TOR61", "Execution", "Monthly", True, 15, 16, "Succeeded", "Approved", None),
    ("CON-2603", "VERDAL", "Execution", "Weekly", False, None, 20, "Succeeded", "Approved",
     "Paused until the next weather window."),
    ("CON-2624", None, "Study", "Monthly", False, 22, None, None, "Pending",
     "Planning stage; first push requested after kick-off."),
    ("CON-2614", "KRSUND", "Execution", "Bi-weekly", True, 8, 6, "Succeeded", "Approved", None),
    ("CON-2636", "HAL95", "Execution", "Monthly", False, None, 45, "Succeeded", "Approved",
     "Frame agreement in steady state; pushed on request."),
]

# Fabrication yards shown in 3D: code, town (as in the planning model), model, project code.
YARDS = [
    ("EGERSUND", "Egersund", "module", "CON-2507"),
    ("VERDAL", "Verdal", "wind", "CON-2603"),
    ("KRSUND", "Kristiansund", "module", "CON-2614"),
]


def hash_of(*parts: object) -> int:
    return zlib.crc32("|".join(str(p) for p in parts).encode())


def pick(rng: int, low: int, high: int) -> int:
    return low + rng % (high - low + 1)


def change(project, category, discipline, priority, title, description, **more):
    row = {"project": project, "category": category, "discipline": discipline, "priority": priority,
           "title": title, "description": f"Synthetic example: {description}"}
    row.update(more)
    return row


def dates(current: int, proposed: int) -> dict:
    return {"currentInDays": current, "proposedInDays": proposed}


# 24 sample planning changes on six of the projects above (same texts as the planning admin demo).
A, B, C, D, E, F = "CON-2610", "CON-2614", "CON-2507", "CON-2618", "CON-2624", "CON-2603"
CHANGES = [
    change(A, "Milestone change", "Fabrication", "High", "Move M3 two weeks later",
           "module delivery slipped; align the milestone with the revised fabrication plan.",
           milestone="M3 Mechanical completion", **dates(30, 44)),
    change(A, "Cut-off correction", "Engineering", "Medium", "Correct progress on design package",
           "reported progress was entered against the wrong activity before cut-off.", milestone="Monthly cut-off"),
    change(A, "Milestone change", "Fabrication", "Medium", "Align M2 with revised weld inspection plan",
           "inspection slots moved; keep M2 consistent with the inspection plan.", milestone="M2 Structure complete",
           **dates(10, 17), status="Approved", ageDays=12,
           decisionNote="Approved in the weekly planning review; inspection slots confirmed."),
    change(A, "Data quality", "Fabrication", "Low", "Split activity FAB-210 into two work packages",
           "one activity covers two crews; split it so progress can be reported per crew.", status="In review", ageDays=4),
    change(A, "Data quality", "Engineering", "Medium", "Remove duplicate activities after schedule import",
           "the last import created 18 duplicate activities.", status="Approved", ageDays=20,
           decisionNote="Duplicates confirmed and removed in the planning tool."),
    change(B, "Milestone change", "Procurement", "Low", "Pull kick-off forward one week",
           "supplier confirmed earlier availability; bring the kick-off forward.", milestone="M1 Kick-off", **dates(12, 5)),
    change(B, "Mapping update", "Installation", "Medium", "Map new discipline code",
           "a new discipline code is missing from the reporting mapping."),
    change(B, "Milestone change", "Procurement", "High", "Delay long-lead item delivery milestone",
           "vendor forecast shows a three-week delay on the long-lead package.", milestone="Long-lead delivery",
           **dates(45, 66), status="In review", ageDays=3),
    change(B, "Cut-off correction", "Procurement", "Medium", "Update supplier progress for valve package",
           "supplier report arrived after cut-off; progress is understated by 8 %.", milestone="Monthly cut-off",
           status="Approved", ageDays=9, decisionNote="Supplier report checked against the purchase order milestones."),
    change(B, "Milestone change", "Procurement", "Low", "Bring contract award forward", "one bidder could start earlier.",
           milestone="Contract award", **dates(20, 13), status="Rejected", ageDays=15,
           decisionNote="Bid evaluation is still open; keep the original date."),
    change(C, "Data quality", "Commissioning", "High", "Missing baseline dates",
           "12 activities have no baseline start; fix before the next cut-off.", milestone="M5 Ready for commissioning"),
    change(C, "Milestone change", "Installation", "Medium", "Re-plan installation window",
           "weather window moved; shift installation completion by three weeks.", milestone="M4 Installation complete",
           **dates(60, 81)),
    change(C, "Milestone change", "Commissioning", "High", "Move mechanical completion of system 20",
           "punch list is larger than planned for system 20.", milestone="System 20 mechanical completion",
           **dates(25, 39), status="Approved", ageDays=6,
           decisionNote="Approved: punch list volume justifies two extra weeks."),
    change(C, "Cut-off correction", "Commissioning", "Medium", "Correct commissioning progress before cut-off",
           "two completed test packs were not reported.", milestone="Monthly cut-off", status="In review", ageDays=2),
    change(C, "Mapping update", "Commissioning", "Low", "Map commissioning systems to the reporting hierarchy",
           "new systems are not grouped in the reporting hierarchy.", status="Approved", ageDays=18,
           decisionNote="Mapping table updated; visible after the next refresh."),
    change(D, "Milestone change", "Installation", "High", "Shift shutdown window by one week",
           "the host site moved its planned shutdown.", milestone="Shutdown start", **dates(35, 42),
           status="In review", ageDays=1),
    change(D, "Data quality", "Installation", "Medium", "Add missing resource codes",
           "40 installation activities have no resource code."),
    change(D, "Cut-off correction", "Installation", "Low", "Correct planned hours for scaffolding",
           "planned hours look too low compared with similar work.", status="Rejected", ageDays=11,
           decisionNote="Hours match the approved estimate; no change."),
    change(E, "Milestone change", "Engineering", "Medium", "Bring study gate review forward",
           "the study team finished the concept report early.", milestone="Gate 2 review", **dates(28, 21),
           status="Approved", ageDays=7, decisionNote="Approved: reviewers available a week earlier."),
    change(E, "Mapping update", "Engineering", "Medium", "Map new cost codes to the planning structure",
           "finance introduced new cost codes for the study phase.", status="In review", ageDays=5),
    change(E, "Data quality", "Engineering", "Low", "Fix overlapping activity dates",
           "design review activities overlap in the schedule.", status="Rejected", ageDays=14,
           decisionNote="The overlap is intentional: reviews run in parallel."),
    change(F, "Milestone change", "Installation", "High", "Postpone campaign start after weather forecast",
           "the long-range forecast shows poor conditions for the planned start.", milestone="Campaign start",
           **dates(15, 29), status="Approved", ageDays=8, decisionNote="Approved after the weather window review."),
    change(F, "Cut-off correction", "Installation", "Medium", "Correct actual start dates for campaign tasks",
           "actual starts were entered one week too early.", milestone="Monthly cut-off", ageDays=1),
    change(F, "Mapping update", "Engineering", "Low", "Retire obsolete milestone codes",
           "several milestone codes are no longer used.", status="Rejected", ageDays=25,
           decisionNote="Codes are still used by an active report; revisit next quarter."),
]


def main() -> None:
    inst = pd.read_parquet(SILVER / "installation.parquet")
    proj = pd.read_parquet(SILVER / "project.parquet")
    tags = pd.read_parquet(SILVER / "tag.parquet")
    classes = pd.read_parquet(SILVER / "equipment_class.parquet")
    tags = tags.merge(classes[["equipment_class_id", "equipment_class_name", "equipment_class_group"]],
                      on="equipment_class_id", how="left")
    group_of = dict(zip(classes.equipment_class_name, classes.equipment_class_group))
    projects = {r.project_code: r for r in proj.itertuples()}
    control_by_site = {c[1]: c[0] for c in CONTROLS if c[1]}

    sites = []
    for r in inst.sort_values("installation_code").itertuples():
        kind, model = KIND[r.installation_type]
        code = control_by_site.get(r.installation_code)
        sites.append({
            "code": r.installation_code, "name": r.installation_name, "kind": kind, "model": model,
            "type": r.installation_type, "country": r.country_code, "waterDepth": int(r.water_depth_m),
            "operator": r.operator_name, "project": code, "projectName": projects[code].project_name if code else None,
            "installationId": r.installation_id,
        })
    for code, town, model, project in YARDS:
        sites.append({
            "code": code, "name": f"{town} yard", "kind": "Fabrication yard", "model": model, "type": "Fabrication yard",
            "country": "NO", "town": town, "project": project, "projectName": projects[project].project_name,
            "projectId": projects[project].project_id,
        })

    systems = dict(zip(tags.system_code, tags.system_name))
    abbreviations = dict(zip(classes.equipment_class_name, classes.tag_abbreviation))
    equipment = []
    for site in sites:
        if "installationId" in site:
            pool = tags[tags.installation_id == site["installationId"]]
        else:
            pool = tags[tags.project_id == site["projectId"]]
        pool = pool.sort_values("tag_number")
        used: set[str] = set()
        yard = site["kind"] == "Fabrication yard"
        for number, (slot, wanted, preferred_systems) in enumerate(SLOTS[site["model"]], start=1):
            free = pool[~pool.tag_number.isin(used)]
            hit = free[free.equipment_class_name.isin(wanted)]
            if len(hit):
                row = hit.iloc[0]
                tag, cls, system = row.tag_number, row.equipment_class_name, row.system_code
                status = STATUS.get(row.installation_status, "Operating")
                criticality = row.criticality_class
            else:
                # No tag of a matching class in the data: add a clearly numbered one (9xxx).
                cls, system = wanted[0], preferred_systems[0]
                tag = f"{system}-{abbreviations[cls]}-{9000 + number}"
                status = "Fabrication" if yard else "Operating"
                criticality = "B"
            used.add(tag)
            rng = hash_of(site["code"], tag)
            if status in ("Operating", "Installed"):
                roll = rng % 100
                health = "Action" if roll < 5 else "Watch" if roll < 20 else "OK"
            else:
                health = None
            if status in ("Operating", "Installed"):
                progress = 100
                planned = -pick(rng, 5, 60) if yard else -pick(rng, 90, 900)
            elif status == "Fabrication":
                progress = pick(rng, 55, 95)
                planned = pick(rng, 3, 30)
            elif status == "Planned":
                progress = pick(rng, 0, 20)
                planned = pick(rng, 20, 120 if yard else 400)
            else:
                progress = 100
                planned = -pick(rng, 200, 900)
            inspected = pick(rng >> 8, 5, 400) if status in ("Operating", "Installed") and not yard else None
            equipment.append({
                "siteCode": site["code"], "tag": tag, "name": cls, "equipmentClass": cls, "slot": slot,
                "system": f"{system} {systems.get(system, '')}".strip(), "status": status, "health": health,
                "progress": progress, "plannedInDays": planned, "inspectedDaysAgo": inspected,
                "criticality": criticality,
            })
        if yard:
            # One part per yard is behind plan, so the 4D view has something late to show. The last part in
            # fabrication is a single item, not the frame that would colour the whole model.
            building = [e for e in equipment if e["siteCode"] == site["code"] and e["status"] == "Fabrication"]
            if building:
                building[-1]["plannedInDays"] = -pick(hash_of(site["code"], building[-1]["tag"]) >> 4, 4, 21)

    controlled = {c[1] for c in CONTROLS if c[1]}
    candidates = sorted(
        (e for e in equipment if e["health"] in ("Watch", "Action")),
        key=lambda e: (e["siteCode"] not in controlled, e["health"] != "Action", e["siteCode"], e["tag"]),
    )
    findings, per_site = [], {}
    for e in candidates:
        if per_site.get(e["siteCode"], 0) >= 2 or len(findings) >= 10:
            continue
        per_site[e["siteCode"]] = per_site.get(e["siteCode"], 0) + 1
        used = {f["title"] for f in findings if f["siteCode"] == e["siteCode"]}
        options = FINDING_TITLE.get(group_of.get(e["equipmentClass"], ""), ("Inspection finding", "Follow-up inspection needed"))
        findings.append({
            "siteCode": e["siteCode"], "tag": e["tag"], "slot": e["slot"],
            "title": next(title for title in options if title not in used),
            "severity": "Action" if e["health"] == "Action" else "Watch",
        })

    controls = []
    for code, site, phase, frequency, include, next_push, last_push, last_status, approval, note in CONTROLS:
        controls.append({
            "project": code, "name": projects[code].project_name, "site": site, "phase": phase,
            "frequency": frequency, "includeInPush": include, "nextPushInDays": next_push,
            "lastPushDaysAgo": last_push, "lastPushStatus": last_status, "approvalStatus": approval, "note": note,
        })

    for s in sites:
        s.pop("installationId", None)
        s.pop("projectId", None)
    data = {
        "source": "Generated by tools/build_app_ops_data.py from data/silver (synthetic Contoso data).",
        "sites": sites, "equipment": equipment, "findings": findings, "controls": controls, "changes": CHANGES,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Wrote {OUT.relative_to(ROOT)}: {len(sites)} sites, {len(equipment)} equipment, "
          f"{len(findings)} findings, {len(controls)} controls, {len(CHANGES)} changes")


if __name__ == "__main__":
    main()
