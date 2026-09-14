# -*- coding: utf-8 -*-
from smart_rules import normalize_date_notation

cases = {
    "09.01. ~ 2027.08.31.": "9.1. ~ 2027.8.31.",
    "2026.09.01. ~ 2027.08.31.": "2026.9.1. ~ 2027.8.31.",
    "2027/08/31": "2027.8.31.",
    "08/25(화)": "8.25.(화)",
    "1.8%": "1.8%",
    "4.3년": "4.3년",
    "0.05 μmol": "0.05 μmol",
}

for source, expected in cases.items():
    actual = normalize_date_notation(source)
    assert actual == expected, (source, actual, expected)

print("DATE NORMALIZATION v0.4.2 CHECK PASSED")
