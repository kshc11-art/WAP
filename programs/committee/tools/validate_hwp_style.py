# -*- coding: utf-8 -*-
"""v0.2.6 HWP template/style parser regression check.

This test is intentionally OS-independent.  It builds the archived 2026-1
mock MASTER, constructs the HWP fill plan, preflights each built-in HWP and
then runs the post-save style auditor with the template itself as the output.
That catches parser/audit regressions before Windows COM is involved.

A real Windows generation performs the same audit again on the *generated*
HWP immediately after SaveAs.

Usage: python tools/validate_hwp_style.py
Exit 0: all six templates pass / Exit 1: one or more failures.
"""
from __future__ import annotations

import csv
import datetime as dt
import json
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(ROOT))

import hwp_fill  # noqa: E402
import hwp_support  # noqa: E402

GOLDEN = json.loads((HERE / "golden_2026_1.json").read_text(encoding="utf-8"))
TEMPLATE_DIR = ROOT / "resources" / "hwp_templates" / "2026_1"
DOC_KEYS = ("b1", "b2", "b5", "b6", "b7", "b8")


def main() -> int:
    tmp = Path(tempfile.mkdtemp(prefix="kriss_v026_style_"))
    master_path = tmp / "mock_master.xlsx"
    subprocess.run(
        [sys.executable, str(HERE / "make_mock_master.py"), str(master_path)],
        check=True,
        cwd=str(ROOT),
    )
    dept_csv = tmp / "dept_map.csv"
    with dept_csv.open("w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["주발명자", "본부"])
        for k, v in GOLDEN["dept_map"].items():
            w.writerow([k, v])

    master = hwp_fill.read_master(master_path)
    plan = hwp_fill.PlanBuilder(
        master,
        GOLDEN["round_no"],
        dt.date.fromisoformat(GOLDEN["report_date"]),
        hwp_fill.load_dept_map(dept_csv),
        tmp,
    ).build(list(DOC_KEYS))
    docs = {d.key: d for d in plan.docs}

    failures: list[str] = []
    passes = 0
    with hwp_support.TemplateBundle(TEMPLATE_DIR) as bundle:
        for key in DOC_KEYS:
            doc = docs[key]
            template = bundle.find(doc.template_pattern)
            if template is None:
                failures.append(f"{key}: 템플릿 미발견 ({doc.template_pattern})")
                continue
            pf = hwp_support.preflight_template(doc, template)
            if pf.get("errors"):
                failures.extend(f"{key} preflight: {x}" for x in pf["errors"])
                continue
            audit = hwp_support.audit_generated_document(doc, template, template)
            if audit.get("errors"):
                failures.extend(f"{key} audit: {x}" for x in audit["errors"])
                continue
            passes += 1
            print(f"PASS {key}: {template.name}")
            for msg in audit.get("info", []):
                print(f"  - {msg}")

    print(f"\nHWP style self-audit: {passes}/{len(DOC_KEYS)} PASS")
    if failures:
        for msg in failures[:50]:
            print("FAIL", msg)
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
