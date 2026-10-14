#!/usr/bin/env python3
"""Check the generated silver parquet files: keys, references, dates, variety.

Exits non-zero if a hard check fails. Run after tools/gen_silver_data.py.

With --previous, also compares against an earlier snapshot: no row may
disappear, and columns that describe the past must keep their values. Only
statuses and actuals are allowed to move forward.

    python tools/validate_silver_data.py
    python tools/validate_silver_data.py --data /tmp/silver_next --previous data/silver
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import pandas as pd

DATA = Path(__file__).resolve().parents[1] / "data" / "silver"

PRIMARY_KEYS = {
    "discipline": "discipline_id", "installation": "installation_id", "project": "project_id",
    "resource": "resource_id", "work_package": "work_package_id", "activity": "activity_id",
    "activity_progress_weekly": "progress_id", "milestone": "milestone_id", "document": "document_id",
    "equipment_class": "equipment_class_id", "tag": "tag_id", "supplier": "supplier_id",
    "material": "material_id", "cost_code": "cost_code_id", "purchase_order": "purchase_order_id",
    "purchase_order_line": "purchase_order_line_id", "work_order": "work_order_id",
}
# child table, child column, parent table, parent column
REFERENCES = [
    ("project", "installation_id", "installation", "installation_id"),
    ("resource", "discipline_id", "discipline", "discipline_id"),
    ("work_package", "project_id", "project", "project_id"),
    ("work_package", "discipline_id", "discipline", "discipline_id"),
    ("work_package", "responsible_resource_id", "resource", "resource_id"),
    ("activity", "work_package_id", "work_package", "work_package_id"),
    ("activity", "project_id", "project", "project_id"),
    ("activity", "discipline_id", "discipline", "discipline_id"),
    ("activity", "assigned_resource_id", "resource", "resource_id"),
    ("activity", "tag_id", "tag", "tag_id"),
    ("activity", "predecessor_activity_id", "activity", "activity_id"),
    ("activity_progress_weekly", "activity_id", "activity", "activity_id"),
    ("activity_document", "activity_id", "activity", "activity_id"),
    ("activity_document", "document_id", "document", "document_id"),
    ("milestone", "project_id", "project", "project_id"),
    ("document", "project_id", "project", "project_id"),
    ("document", "discipline_id", "discipline", "discipline_id"),
    ("document", "author_resource_id", "resource", "resource_id"),
    ("equipment_class", "default_discipline_id", "discipline", "discipline_id"),
    ("tag", "equipment_class_id", "equipment_class", "equipment_class_id"),
    ("tag", "installation_id", "installation", "installation_id"),
    ("tag", "project_id", "project", "project_id"),
    ("tag", "discipline_id", "discipline", "discipline_id"),
    ("material", "equipment_class_id", "equipment_class", "equipment_class_id"),
    ("purchase_order", "project_id", "project", "project_id"),
    ("purchase_order", "supplier_id", "supplier", "supplier_id"),
    ("purchase_order", "buyer_resource_id", "resource", "resource_id"),
    ("purchase_order_line", "purchase_order_id", "purchase_order", "purchase_order_id"),
    ("purchase_order_line", "material_id", "material", "material_id"),
    ("purchase_order_line", "cost_code_id", "cost_code", "cost_code_id"),
    ("work_order", "installation_id", "installation", "installation_id"),
    ("work_order", "tag_id", "tag", "tag_id"),
    ("work_order", "project_id", "project", "project_id"),
    ("work_order", "discipline_id", "discipline", "discipline_id"),
    ("work_order", "contractor_supplier_id", "supplier", "supplier_id"),
]
# event dates that must not be after the as-of date
EVENT_DATES = [
    ("activity", "actual_start_date"), ("activity", "actual_finish_date"),
    ("activity_progress_weekly", "week_ending_date"), ("milestone", "actual_date"),
    ("document", "issued_date"), ("purchase_order", "order_date"),
    ("purchase_order_line", "actual_delivery_date"), ("work_order", "reported_date"),
    ("work_order", "actual_start_date"), ("work_order", "actual_finish_date"),
    ("project", "actual_finish_date"),
]
# columns that may change from one day to the next; everything else must stay as it was
MUTABLE = {
    "project": ["project_status", "actual_finish_date"],
    "work_package": ["work_package_status"],
    "activity": ["actual_start_date", "actual_finish_date", "percent_complete", "activity_status", "actual_hours"],
    "milestone": ["actual_date", "milestone_status"],
    "document": ["document_status", "revision"],
    "purchase_order": ["po_status"],
    "purchase_order_line": ["quantity_received", "quantity_rejected", "actual_delivery_date", "line_status"],
    "work_order": ["work_order_status", "actual_start_date", "actual_finish_date", "actual_hours",
                   "labour_cost_nok", "material_cost_nok", "downtime_hours"],
}
MIN_ROWS = 1000
SMALL_REFERENCE = {"discipline", "installation", "project", "resource", "equipment_class", "supplier", "cost_code"}


def load(path: Path) -> pd.DataFrame:
    df = pd.read_parquet(path)
    for c in df.columns:
        if c.endswith("_date"):
            df[c] = pd.to_datetime(df[c])
    return df


def key_of(name: str) -> list[str]:
    return [PRIMARY_KEYS[name]] if name in PRIMARY_KEYS else ["activity_id", "document_id"]


def compare(previous: dict[str, pd.DataFrame], current: dict[str, pd.DataFrame]) -> list[str]:
    errors = []
    for name, old in previous.items():
        new = current[name]
        key = key_of(name)
        merged = old.merge(new, on=key, how="left", suffixes=("_old", ""), indicator=True)
        gone = (merged["_merge"] == "left_only").sum()
        if gone:
            errors.append(f"{name}: {gone} rows from the previous snapshot are missing")
        fixed = [c for c in old.columns if c not in key and c not in MUTABLE.get(name, [])]
        both = merged[merged["_merge"] == "both"]
        for c in fixed:
            a, b = both[f"{c}_old"], both[c]
            changed = ~((a == b) | (a.isna() & b.isna()))
            if changed.any():
                errors.append(f"{name}.{c}: {changed.sum()} rows changed since the previous snapshot")
        print(f"  {name:28s} {len(old):>8,d} -> {len(new):>8,d}")
    return errors


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default=str(DATA))
    ap.add_argument("--previous", help="folder with the previous snapshot to compare against")
    args = ap.parse_args()
    data = Path(args.data)
    t = {p.stem: load(p) for p in sorted(data.glob("*.parquet"))}
    as_of = pd.Timestamp((data / "as_of.txt").read_text().strip())
    errors: list[str] = []

    for name, col in EVENT_DATES:
        late = (t[name][col] > as_of).sum()
        if late:
            errors.append(f"{name}.{col} has {late} dates after the as-of date {as_of.date()}")

    for name, key in PRIMARY_KEYS.items():
        if name not in t:
            errors.append(f"missing table {name}")
            continue
        df = t[name]
        if df[key].isna().any() or not df[key].is_unique:
            errors.append(f"{name}.{key} is not a unique, non-null key")
        if len(df) < MIN_ROWS and name not in SMALL_REFERENCE:
            errors.append(f"{name} has only {len(df)} rows")

    for child, ccol, parent, pcol in REFERENCES:
        vals = t[child][ccol].dropna()
        missing = ~vals.isin(t[parent][pcol])
        if missing.any():
            errors.append(f"{child}.{ccol} has {missing.sum()} values not in {parent}.{pcol}")

    a = t["activity"]
    if (a["actual_finish_date"].notna() & (a["actual_finish_date"] < a["actual_start_date"])).any():
        errors.append("activity actual_finish_date before actual_start_date")
    if (a["planned_finish_date"] < a["planned_start_date"]).any():
        errors.append("activity planned_finish_date before planned_start_date")
    if (a.loc[a["activity_status"] == "Completed", "percent_complete"] != 100).any():
        errors.append("completed activity not at 100 percent")
    wo = t["work_order"]
    if (wo["actual_finish_date"].notna() & (wo["actual_finish_date"] < wo["actual_start_date"])).any():
        errors.append("work_order actual_finish_date before actual_start_date")
    pol = t["purchase_order_line"]
    if (pol["quantity_received"] > pol["quantity_ordered"]).any():
        errors.append("purchase_order_line received more than ordered")

    print(f"as of {as_of.date()}")
    if args.previous:
        prev = Path(args.previous)
        print(f"rows per table, previous ({(prev / 'as_of.txt').read_text().strip()}) -> current")
        errors += compare({p.stem: load(p) for p in sorted(prev.glob("*.parquet"))}, t)
    else:
        print("rows per table")
        for name, df in t.items():
            print(f"  {name:28s} {len(df):>8,d}")

    print("\nvariety checks (distinct values / spread)")
    checks = {
        "activity.planned_hours distinct": a["planned_hours"].nunique(),
        "activity delay days (finish) std": (a["actual_finish_date"] - a["planned_finish_date"]).dt.days.std().round(1),
        "activity status mix": a["activity_status"].value_counts(normalize=True).round(2).to_dict(),
        "po line delivery delay days std": (pol["actual_delivery_date"] - pol["promised_delivery_date"]).dt.days.std().round(1),
        "po line unit_price distinct": pol["unit_price_nok"].nunique(),
        "work_order type mix": wo["work_order_type"].value_counts(normalize=True).round(2).to_dict(),
        "work_order failure_mode distinct": wo["failure_mode"].nunique(),
        "work_order labour_cost distinct": wo["labour_cost_nok"].nunique(),
        "tag.weight_kg distinct": t["tag"]["weight_kg"].nunique(),
        "document revision/status distinct": (t["document"]["revision"].nunique(), t["document"]["document_status"].nunique()),
    }
    for k, v in checks.items():
        print(f"  {k}: {v}")

    if errors:
        print("\nFAILED")
        for e in errors:
            print("  -", e)
        return 1
    print("\nOK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
