#!/usr/bin/env python3
"""Megnézi a hivatalos szervert, és ha újabb adatbázis van, frissíti a data/shops.json-t.
A GitHub Action naponta futtatja; kézzel is indítható: python3 tools/update_from_server.py
Kilépési kód: 0 = frissítve vagy nincs újabb, 1 = hiba (pl. a szerver nem elérhető).
"""
import json, pathlib, sys, tempfile, urllib.request

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from build_data import build

BASE = "http://mobil-webservice.nemzetidohany.gov.hu/"
DATA = pathlib.Path("data/shops.json")

def get(url, timeout):
    req = urllib.request.Request(url, headers={"User-Agent": "dohanybolt-kereso-web/1.0"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()

def main():
    try:
        info = json.loads(get(BASE + "tsm_getlastupdate.php", 20))
        last = info["Response"]["LastUpdate"].strip()
    except Exception as e:
        print(f"A szerver nem elérhető: {e}")
        return 1
    local = None
    if DATA.exists():
        local = json.loads(DATA.read_text(encoding="utf-8"))["meta"].get("lastUpdate")
    print(f"Szerver: {last} | helyi: {local}")
    if local and last <= local:
        print("Nincs újabb adatbázis.")
        return 0
    blob = get(BASE + "tsm_getlastsqlite.php", 120)
    if not blob.startswith(b"SQLite format 3"):
        print("A letöltött fájl nem SQLite adatbázis.")
        return 1
    with tempfile.NamedTemporaryFile(suffix=".sqlite", delete=False) as f:
        f.write(blob)
    build(f.name, last, str(DATA))
    return 0

if __name__ == "__main__":
    sys.exit(main())
