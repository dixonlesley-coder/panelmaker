#!/usr/bin/env python3
"""
Extract Schneider (or any) catalogue ordering tables into the committed parts
JSON the app seeds from: src/shared/data/catalog/schneider.parts.json

This is DEV-ONLY tooling — it is never bundled into the Electron app. It reads
the EMBEDDED TEXT of the PDF (pdfplumber), not OCR: catalogue PDFs are born
digital, so text extraction is accurate where OCR would corrupt order codes and
ratings (O/0, I/1/l, B/8, S/5).

Pipeline:
    catalogue.pdf  ──(this script: extract + validate)──▶  schneider.parts.json   [commit, review in PR]
                                                                  │  loader + tests
                                                                  ▼
                              default web parts  +  idempotent SQLite seed (by SKU, on launch)

Usage
-----
    pip install -r scripts/requirements.txt

    # 1) Inspect a page range to discover the table headers / column order:
    python scripts/extract_catalogue.py --pdf catalogue.pdf --inspect 120-122

    # 2) Fill in FAMILIES below (page_range + header_map per family), then run:
    python scripts/extract_catalogue.py --pdf catalogue.pdf

It MERGES into the existing JSON by SKU (your hand-curated rows are preserved),
validates every row with the SAME rules as the TypeScript loader, drops bad rows
with a report, and writes the file sorted + deterministic so PR diffs are clean.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path

try:
    import pdfplumber  # type: ignore
except ImportError:
    sys.exit("pdfplumber is required: pip install -r scripts/requirements.txt")

ROOT = Path(__file__).resolve().parent.parent
OUT_DEFAULT = ROOT / "src/shared/data/catalog/schneider.parts.json"

# Keep in sync with PART_CATEGORIES in src/shared/types/parts.ts.
PART_CATEGORIES = {
    "breaker", "cable", "busbar", "enclosure", "accessory",
    "light_fixture", "switch", "smart_switch", "socket_outlet",
    "contactor", "overload_relay", "control_relay", "timer_relay",
    "phase_protection_relay", "pilot_device", "indicator_lamp",
    "control_transformer", "control_protection", "vfd", "soft_starter",
    "vfd_accessory", "aux_contact_block", "terminal_block",
    "panel_meter", "current_transformer",
    "level_relay", "float_switch", "electrode_assembly", "pressure_switch",
    "pressure_transmitter", "level_sensor", "alternator_relay", "hoa_selector",
    "run_hour_meter", "alarm_device",
}


@dataclass
class Family:
    """One device family's ordering tables and how to read their columns."""
    series: str
    category: str
    # 1-based inclusive page range in the PDF, e.g. (120, 139).
    page_range: tuple[int, int]
    # logical field -> a lowercase substring to find in the table's header row.
    # Recognised fields: sku, model, ratingA, poles, curve, breakingKa.
    header_map: dict[str, str]
    # static attributes applied to every row of this family.
    constant_attrs: dict[str, object] = field(default_factory=dict)


# ---------------------------------------------------------------------------
# CONFIGURE ME: one entry per device family, after using --inspect to read the
# headers. The example below is Acti9 iC60N MCBs — adjust page_range/header_map
# to match YOUR catalogue, then add ComPacT NSX, TeSys, iID, etc.
# ---------------------------------------------------------------------------
FAMILIES: list[Family] = [
    Family(
        series="Acti9 iC60N",
        category="breaker",
        page_range=(0, 0),  # TODO: set to the iC60N ordering pages, e.g. (120, 123)
        header_map={
            "sku": "reference",      # column whose header contains "reference"/"cat no"
            "ratingA": "rating",     # "In", "rated current", "A"
            "poles": "pole",
            "curve": "curve",
        },
        constant_attrs={"deviceClass": "MCB", "breakingKa": 6},
    ),
]

ORDER_CODE_RE = re.compile(r"^[A-Z0-9][A-Z0-9.\-/]{3,}$", re.I)


def parse_rating(s: str) -> float | None:
    m = re.search(r"(\d+(?:[.,]\d+)?)", s or "")
    return float(m.group(1).replace(",", ".")) if m else None


def parse_poles(s: str) -> int | None:
    m = re.search(r"([1-4])\s*P", (s or "").upper()) or re.search(r"\b([1-4])\b", s or "")
    return int(m.group(1)) if m else None


def parse_curve(s: str) -> str | None:
    m = re.search(r"\b([BCD])\b", (s or "").upper())
    return m.group(1) if m else None


def find_columns(header_row: list[str], header_map: dict[str, str]) -> dict[str, int]:
    """Map each logical field to a column index by matching header substrings."""
    cols: dict[str, int] = {}
    lowered = [(h or "").strip().lower() for h in header_row]
    for field_name, needle in header_map.items():
        for i, h in enumerate(lowered):
            if needle.lower() in h:
                cols[field_name] = i
                break
    return cols


def row_to_entry(row: list[str], cols: dict[str, int], fam: Family) -> dict | None:
    def cell(name: str) -> str:
        i = cols.get(name)
        return (row[i] if i is not None and i < len(row) else "") or ""

    sku = cell("sku").strip().replace(" ", "")
    if not ORDER_CODE_RE.match(sku):
        return None  # not a data row (header/spacer/footnote)

    attrs: dict[str, object] = dict(fam.constant_attrs)
    if "ratingA" in cols:
        r = parse_rating(cell("ratingA"))
        if r is not None:
            attrs["ratingA"] = int(r) if r.is_integer() else r
    if "poles" in cols:
        p = parse_poles(cell("poles"))
        if p is not None:
            attrs["poles"] = p
    if "curve" in cols:
        c = parse_curve(cell("curve"))
        if c is not None:
            attrs["curve"] = c

    model = cell("model").strip() or _derive_model(fam.series, attrs)
    return {"sku": sku, "category": fam.category, "series": fam.series,
            "model": model, "attributes": attrs}


def _derive_model(series: str, attrs: dict) -> str:
    bits = [series]
    if attrs.get("poles"):
        bits.append(f"{attrs['poles']}P")
    if attrs.get("curve") and attrs.get("ratingA"):
        bits.append(f"{attrs['curve']}{attrs['ratingA']}")
    elif attrs.get("ratingA"):
        bits.append(f"{attrs['ratingA']}A")
    return " ".join(str(b) for b in bits)


def validate(entry: dict) -> str | None:
    """Mirror the TypeScript loader's rules; return a reason if invalid."""
    if not entry.get("sku"):
        return "missing sku"
    if entry.get("category") not in PART_CATEGORIES:
        return f"unknown category {entry.get('category')!r}"
    if not entry.get("model"):
        return "missing model"
    a = entry.get("attributes") or {}
    if "ratingA" in a and not (isinstance(a["ratingA"], (int, float)) and a["ratingA"] > 0):
        return "ratingA must be positive"
    if "poles" in a and a["poles"] not in (1, 2, 3, 4):
        return "poles must be 1-4"
    if "curve" in a and a["curve"] not in ("B", "C", "D"):
        return "curve must be B/C/D"
    return None


def extract(pdf_path: Path) -> tuple[list[dict], list[str]]:
    entries: list[dict] = []
    report: list[str] = []
    with pdfplumber.open(str(pdf_path)) as pdf:
        for fam in FAMILIES:
            lo, hi = fam.page_range
            if lo <= 0:
                report.append(f"  · {fam.series}: page_range not set — skipped")
                continue
            kept = 0
            for pageno in range(lo, hi + 1):
                page = pdf.pages[pageno - 1]
                for table in page.extract_tables() or []:
                    if not table:
                        continue
                    cols = find_columns(table[0], fam.header_map)
                    if "sku" not in cols:
                        continue  # no order-code column on this table
                    for raw in table[1:]:
                        entry = row_to_entry(raw, cols, fam)
                        if entry:
                            entries.append(entry)
                            kept += 1
            report.append(f"  · {fam.series} (pp.{lo}-{hi}): {kept} rows")
    return entries, report


def merge_and_write(entries: list[dict], out: Path) -> None:
    existing = json.loads(out.read_text(encoding="utf-8")) if out.exists() else {
        "catalogVersion": "schneider-0", "manufacturer": "Schneider Electric",
        "source": "", "parts": [],
    }
    by_sku: dict[str, dict] = {p["sku"]: p for p in existing.get("parts", [])}

    kept, dropped = 0, 0
    for e in entries:
        reason = validate(e)
        if reason:
            dropped += 1
            print(f"    DROP {e.get('sku', '?')}: {reason}")
            continue
        by_sku[e["sku"]] = e  # extracted wins; hand-curated rows without a clash stay
        kept += 1

    parts = sorted(by_sku.values(),
                   key=lambda p: (p["category"], p.get("series", ""),
                                  p["attributes"].get("ratingA", 0), p["sku"]))
    existing["parts"] = parts
    out.write_text(json.dumps(existing, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"\n  wrote {len(parts)} parts → {out.relative_to(ROOT)}  (+{kept} extracted, {dropped} dropped)")


def inspect(pdf_path: Path, page_range: str) -> None:
    lo, hi = (int(x) for x in page_range.split("-")) if "-" in page_range else (int(page_range), int(page_range))
    with pdfplumber.open(str(pdf_path)) as pdf:
        for pageno in range(lo, hi + 1):
            page = pdf.pages[pageno - 1]
            tables = page.extract_tables() or []
            print(f"\n=== page {pageno}: {len(tables)} table(s) ===")
            for ti, table in enumerate(tables):
                print(f"  table {ti}: header = {table[0] if table else '∅'}")
                for r in (table[1:3] if table else []):
                    print(f"    sample = {r}")


def auto_json(pdf_path: Path, page_range: str | None) -> None:
    """Dump every detected table (header + rows) for a page range as JSON to
    stdout. This is the mode the bundled in-app extractor calls — the app maps
    columns and validates in TypeScript, so this stays a dumb, deterministic
    table dump: {"tables":[{"page","index","header","rows"}]}."""
    with pdfplumber.open(str(pdf_path)) as pdf:
        total = len(pdf.pages)
        if page_range and "-" in page_range:
            lo, hi = (int(x) for x in page_range.split("-"))
        elif page_range:
            lo = hi = int(page_range)
        else:
            lo, hi = 1, total
        out: dict = {"pages": total, "tables": []}
        for pageno in range(max(1, lo), min(total, hi) + 1):
            page = pdf.pages[pageno - 1]
            for ti, table in enumerate(page.extract_tables() or []):
                if not table or len(table) < 2:
                    continue
                header = [(c or "").strip() for c in table[0]]
                rows = [[(c or "").strip() for c in r] for r in table[1:]]
                out["tables"].append({"page": pageno, "index": ti, "header": header, "rows": rows})
    print(json.dumps(out, ensure_ascii=False))


def main() -> None:
    # Windows consoles/pipes default to cp1252; catalogue tables carry δ, Ω, ²,
    # ° etc. Force UTF-8 so json.dumps(ensure_ascii=False) prints without a
    # UnicodeEncodeError (the app reads this stdout as UTF-8).
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8")  # type: ignore[union-attr]
        except Exception:
            pass

    ap = argparse.ArgumentParser(description="Extract catalogue tables → committed parts JSON")
    ap.add_argument("--pdf", required=True, type=Path, help="path to the catalogue PDF")
    ap.add_argument("--out", default=OUT_DEFAULT, type=Path, help="target JSON (default: the committed catalogue)")
    ap.add_argument("--inspect", metavar="A-B", help="dump table headers for a page range and exit")
    ap.add_argument("--auto-json", action="store_true", help="print detected tables as JSON to stdout (used by the app)")
    ap.add_argument("--pages", metavar="A-B", help="page range for --auto-json (default: whole document)")
    args = ap.parse_args()

    if not args.pdf.exists():
        sys.exit(f"no such PDF: {args.pdf}")
    if args.auto_json:
        auto_json(args.pdf, args.pages)
        return
    if args.inspect:
        inspect(args.pdf, args.inspect)
        return

    print(f"extracting {args.pdf.name} …")
    entries, report = extract(args.pdf)
    print("\n".join(report))
    merge_and_write(entries, args.out)
    print("\nNext: review the JSON diff, run `npx vitest run tests/engine/catalog.test.ts`, commit.")


if __name__ == "__main__":
    main()
