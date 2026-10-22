#!/usr/bin/env python3
"""tsm_mdb.sqlite -> data/shops.json (tömör formátum a webapphoz).

Használat:
  python3 tools/build_data.py <sqlite> [--last-update "2026-10-22 14:30:00"]
"""
import argparse, json, sqlite3, pathlib, datetime

DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

def build(db_path, last_update=None, out="data/shops.json"):
    c = sqlite3.connect(db_path)
    c.row_factory = sqlite3.Row
    rows = c.execute(
        "SELECT * FROM Trafik WHERE MissingFrom = '' OR MissingFrom IS NULL ORDER BY Id"
    ).fetchall()
    sched_idx, schedules, shops = {}, [], []
    for r in rows:
        # hét: 7 nap × 4 sáv × (start, end) percben
        week = tuple(
            tuple(v for i in range(1, 5) for v in (r[f"Open{d}Start{i}"] or 0, r[f"Open{d}End{i}"] or 0))
            for d in DAYS
        )
        if week not in sched_idx:
            sched_idx[week] = len(schedules)
            schedules.append([list(day) for day in week])
        shops.append([
            r["Id"], r["Zip"] or "", (r["City"] or "").strip(), (r["District"] or "").strip(),
            (r["Address"] or "").strip(), round(r["Lat"], 6), round(r["Lng"], 6),
            1 if r["AcceptsCardPayment"] else 0, sched_idx[week],
        ])
    meta = {
        "lastUpdate": last_update,  # a szerver LastUpdate értéke (teljes időbélyeg), vagy null = beépített
        "builtAt": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "count": len(shops),
    }
    data = {"meta": meta, "schedules": schedules, "shops": shops}
    p = pathlib.Path(out)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{len(shops)} bolt, {len(schedules)} egyedi nyitvatartás -> {out} ({p.stat().st_size//1024} KB)")

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("sqlite")
    ap.add_argument("--last-update", default=None)
    ap.add_argument("--out", default="data/shops.json")
    a = ap.parse_args()
    build(a.sqlite, a.last_update, a.out)
