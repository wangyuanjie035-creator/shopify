#!/usr/bin/env python3
"""Calibrate auto-quote coefficients from historical 4-part batch."""
import json
from pathlib import Path

DENSITIES = {"6061铝": 2.70, "H59黄铜": 8.50}
BATCH = Path(__file__).resolve().parent.parent / ".tmp_quote_batch.json"

def dims_from_item(item):
    aag = item.get("aag") or {}
    solids = (aag.get("assembly_info") or {}).get("solids") or []
    if solids:
        mins = [1e9, 1e9, 1e9]
        maxs = [-1e9, -1e9, -1e9]
        vol = 0.0
        for s in solids:
            vol += s.get("volume") or 0
            b = s.get("bbox") or {}
            if b.get("min") and b.get("max"):
                for i in range(3):
                    mins[i] = min(mins[i], b["min"][i])
                    maxs[i] = max(maxs[i], b["max"][i])
        L, W, H = maxs[0] - mins[0], maxs[1] - mins[1], maxs[2] - mins[2]
        return sorted([L, W, H], reverse=True), vol

    verts = (item.get("topology") or {}).get("vertices", [])
    if verts:
        xs = [v["position"][0] for v in verts]
        ys = [v["position"][1] for v in verts]
        zs = [v["position"][2] for v in verts]
        L, W, H = max(xs) - min(xs), max(ys) - min(ys), max(zs) - min(zs)
        return sorted([L, W, H], reverse=True), None

    bbox = (item.get("meta") or {}).get("bbox") or (item.get("processMetadata") or {}).get("bbox")
    if bbox and bbox.get("max"):
        L = bbox["max"][0] - bbox["min"][0]
        W = bbox["max"][1] - bbox["min"][1]
        H = bbox["max"][2] - bbox["min"][2]
        return sorted([L, W, H], reverse=True), None
    return [0, 0, 0], None


def main():
    data = json.loads(BATCH.read_text(encoding="utf-8"))
    rows = []
    for item in data:
        dims, vol = dims_from_item(item)
        density = DENSITIES.get(item.get("material"), 2.7)
        mass = (vol * density / 1000) if vol else (dims[0] * dims[1] * dims[2] * density / 1000)
        s = item["features"]["summary"]
        ins = item["features"]["insights"]
        net = item["price"] / 1.13 - 4
        faces = (item.get("meta") or {}).get("counts", {}).get("faces") or "?"
        rows.append({
            "name": item["name"],
            "price": item["price"],
            "net": net,
            "material": item.get("material"),
            "finish": item.get("finishing", ""),
            "dims": dims,
            "vol": vol,
            "mass": mass,
            "holes": s["holeCount"],
            "counterbored": ins["holes"].get("counterboredCount", 0),
            "fillets": s["filletCount"],
            "cavities": s["cavityCount"],
            "faces": faces,
        })

    print("name | price | net | LxWxH | vol_mm3 | mass_g | holes | cb | fillets | faces")
    for r in rows:
        d = r["dims"]
        print(
            f"{r['name']} | {r['price']} | {r['net']:.2f} | "
            f"{d[0]:.1f}x{d[1]:.1f}x{d[2]:.1f} | {r['vol'] or 0:.0f} | {r['mass']:.1f} | "
            f"{r['holes']} | {r['counterbored']} | {r['fillets']} | {r['faces']}"
        )

    # Carriage should use deduped holes (32) not raw 52 - check if batch has holeCountRaw
    print("\n--- Feature cost proxies (net / feature) ---")
    for r in rows:
        hole_cost = r["net"] / max(r["holes"], 1)
        fillet_cost = r["net"] / max(r["fillets"], 1)
        vol_cost = r["net"] / max(r["vol"] or 1, 1) * 1000
        print(f"{r['name']}: net/hole={hole_cost:.2f}, net/fillet={fillet_cost:.2f}, net/cm3={vol_cost:.4f}")


if __name__ == "__main__":
    main()
