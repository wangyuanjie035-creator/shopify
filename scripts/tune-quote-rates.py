#!/usr/bin/env python3
"""Tune quote-engine coefficients against 4 historical orders."""
import json
from pathlib import Path

BATCH = Path(__file__).resolve().parent.parent / ".tmp_quote_batch.json"
TAX = 0.13
SHIP = 4
DENSITY = {"6061铝": 2.7, "H59黄铜": 8.5}
PRICE_KG = {"6061铝": 28, "H59黄铜": 65}


def parse_holes(ins):
    bd = ins["holes"].get("sizeBreakdown") or ""
    small = standard = large = 0
    for part in bd.split(","):
        part = part.strip()
        m = __import__("re").search(r"×(\d+)", part)
        if not m:
            continue
        n = int(m.group(1))
        if "小孔" in part:
            small += n
        elif "大孔" in part:
            large += n
        elif "标准孔" in part:
            standard += n
    cb = ins["holes"].get("counterboredCount", 0)
    total = ins["holes"].get("dedupedCount") or ins["holes"].get("rawCount") or 0
    if not standard and not small and not large and total:
        standard = max(0, total - cb)
    return small, standard, large, cb, total


def quote(item, p):
    wp = item.get("workpiece") or {}
    vol = (wp.get("volumeMm3") or 0) / 1000
    bbox = (wp.get("bboxVolumeMm3") or 0) / 1000
    removal = max(bbox - vol, 0)

    mat = item.get("material", "6061铝")
    density = DENSITY.get(mat, 2.7)
    price_kg = PRICE_KG.get(mat, 28)
    material = (vol * density / 1000) * price_kg

    ins = item["features"]["insights"]
    s = item["features"]["summary"]
    small, standard, large, cb, total = parse_holes(ins)
    fillets = min(s["filletCount"], p["fillet_cap"])
    shafts = s["shaftCount"]
    faces = ins["topology"].get("faceCount") or 0

    machining = p["setup"] + material
    machining += removal * p["removal"]
    machining += vol * p["part_vol"]
    if bbox > p["bbox_threshold"]:
        machining += (bbox - p["bbox_threshold"]) * p["bbox_premium"]

    machining += small * p["small_hole"]
    machining += standard * p["standard_hole"]
    machining += large * p["large_hole"]
    machining += cb * p["cb_premium"]
    machining += fillets * p["fillet"]
    machining += shafts * p["shaft"]
    if faces > p["face_threshold"]:
        machining += (faces - p["face_threshold"]) * p["face_rate"]

    if "黄铜" in mat or "H59" in mat:
        machining *= p["brass_factor"]

    finishing = p["anodize"] if "阳极" in (item.get("finishing") or "") else 0
    return round((machining + finishing + SHIP) * (1 + TAX), 2), round(machining + finishing, 2)


def main():
    p = {
        "setup": 40,
        "removal": 0.68,
        "part_vol": 0.03,
        "bbox_threshold": 200,
        "bbox_premium": 0.105,
        "small_hole": 2.0,
        "standard_hole": 1.1,
        "large_hole": 24,
        "cb_premium": 1.8,
        "fillet": 0.9,
        "fillet_cap": 12,
        "shaft": 26,
        "face_threshold": 50,
        "face_rate": 0.22,
        "brass_factor": 1.55,
        "anodize": 50,
    }

    data = json.loads(BATCH.read_text(encoding="utf-8"))
    print(json.dumps(p, indent=2))
    print("\nname | actual | est | err% | net_est")
    errs = []
    for item in data:
        est, net = quote(item, p)
        act = item["price"]
        err = (est - act) / act * 100
        errs.append(abs(err))
        print(f"{item['name']:10} | {act:7} | {est:7} | {err:+5.1f}% | {net:.1f}")
    print(f"\nMAPE: {sum(errs)/len(errs):.1f}%")


if __name__ == "__main__":
    main()
