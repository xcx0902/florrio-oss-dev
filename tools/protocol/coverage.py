#!/usr/bin/env python3
"""Cross-check the 24 mask-bit grades between 04, 09 and README.

Grades are the leading R/P/W/U/B/A/C token of the last table cell (04/09)
or the second cell (README).  Exit code 1 on mismatch.
"""
import argparse
import re
import sys

BITS = [
    "0x1", "0x2", "0x4", "0x8", "0x10", "0x20", "0x40", "0x80",
    "0x100", "0x200", "0x400", "0x800", "0x1000", "0x2000", "0x4000",
    "0x8000", "0x10000", "0x20000", "0x40000", "0x80000", "0x100000",
    "0x200000", "0x400000", "0x800000",
]
GRADE = re.compile(r"^(?:\*\*)?([RPWUABC])(?:\*\*)?")


def cells(line):
    return [c.strip() for c in line.strip().strip("|").split("|")]


def grade(text):
    text = text.strip()
    # Keep the first grade token, e.g. "**R**（解析）/P（下游）" -> R
    m = GRADE.match(text.replace(" ", ""))
    return m.group(1) if m else "?"


def parse_table(path, bit_col, grade_col):
    rows = {}
    for line in open(path, encoding="utf-8"):
        if not line.startswith("|"):
            continue
        c = cells(line)
        if len(c) <= max(bit_col, grade_col):
            continue
        m = re.fullmatch(r"`?(0x[0-9A-Fa-f]+)`?", c[bit_col])
        if not m:
            continue
        if len(c) != 5:
            continue
        rows[hex(int(m.group(1), 16))] = grade(c[grade_col])
    return rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default="wave/docs/protocol")
    ap.add_argument("--check", action="store_true")
    args = ap.parse_args()

    r09 = parse_table(f"{args.root}/09-field-audit.md", 0, -1)
    r04 = parse_table(f"{args.root}/04-entities.md", 0, -1)
    # README: | 实体 `0x1` | **R** ... | evidence |
    rread = {}
    for line in open(f"{args.root}/README.md", encoding="utf-8"):
        if not line.startswith("|"):
            continue
        c = cells(line)
        if len(c) < 2:
            continue
        m = re.search(r"`(0x[0-9A-Fa-f]+)`", c[0])
        if m:
            rread[m.group(1).lower()] = grade(c[1])

    bad = 0
    print(f"{'bit':>10}  09  04  README")
    for bit in BITS:
        a, b, c = r09.get(bit, "-"), r04.get(bit, "-"), rread.get(bit, "-")
        flag = ""
        # README may use R/P for a partially closed row; compare the lead grade.
        if a != b or (c not in ("-", a) and not (a == "R" and c == "R")):
            flag = "  <-- MISMATCH"
            bad += 1
        print(f"{bit:>10}  {a:>2}  {b:>2}  {c:>6}{flag}")

    missing = [b for b in BITS if b not in r09 or b not in r04]
    if missing:
        print("missing rows:", ", ".join(missing))
        bad += len(missing)
    if args.check and bad:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
