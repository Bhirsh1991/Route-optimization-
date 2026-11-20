"""Build the planner's city address reference from the attributed public snapshot.

Usage: python scripts/import-netanya.py downloaded-file.xlsx
Install openpyxl and pyproj to rebuild. Details and source link are in data/README.md.
"""
import argparse
from collections import defaultdict
from hashlib import sha256
import json
from pathlib import Path
import re

from openpyxl import load_workbook
from pyproj import Transformer


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("workbook", type=Path)
    args = parser.parse_args()
    with args.workbook.open("rb") as source:
        if sha256(source.read()).hexdigest() != "200c654075e31f8d35592302ea555054c81926b15df8fcc3063cb14922b78cc9":
            parser.error("Unrecognized snapshot. Review the new source, license, metadata and quality before updating.")

    transformer = Transformer.from_crs("EPSG:2039", "EPSG:4326", always_xy=True)
    workbook = load_workbook(args.workbook, read_only=True, data_only=True)
    by_street = defaultdict(lambda: defaultdict(set))
    try:
        rows = iter(workbook.active.values)
        if next(rows) != ("city", "street", "number", "neighbourhood", "district", "X", "Y"):
            parser.error("Unrecognized address columns.")
        for city, street, number, _, _, x, y in rows:
            if city != "נתניה" or not isinstance(street, str) or not re.search(r"[א-תA-Za-z]", street):
                continue
            house = str(number).strip()
            if not re.fullmatch(r"[1-9]\d{0,3}(?:[א-תA-Za-z]|[-/]\d{1,4})?", house):
                continue
            if not isinstance(x, (int, float)) or not isinstance(y, (int, float)):
                continue
            lng, lat = transformer.transform(x, y)
            if 32.22 < lat < 32.38 and 34.81 < lng < 34.91:
                by_street[street.strip()][house].add((round(lat, 5), round(lng, 5)))
    finally:
        workbook.close()

    streets = {street: {n: sorted(points) for n, points in sorted(houses.items())}
               for street, houses in sorted(by_street.items())}
    if len(streets) < 300 or sum(map(len, streets.values())) < 5000:
        parser.error("Too few located Netanya addresses. Check the source and coordinate conversion.")
    output = Path(__file__).resolve().parents[1] / "data" / "netanya-addresses.json"
    output.parent.mkdir(exist_ok=True)
    output.write_bytes((json.dumps(streets, ensure_ascii=False, separators=(",", ":")) + "\n").encode())
    print(f"{len(streets)} street labels, {sum(map(len, streets.values()))} numbered entries, {output.stat().st_size:,} bytes")


if __name__ == "__main__":
    main()
