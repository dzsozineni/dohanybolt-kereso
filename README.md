# Dohánybolt Kereső – webapp

Böngészőben futó változat (PWA). iPhone-on és Androidon is a főképernyőre tehető,
nem kell hozzá App Store, fejlesztői fiók, és nem jár le.

## Közzététel GitHub Pages-en

1. GitHubon hozz létre egy új, **publikus** repót, például `dohanybolt-kereso`.
2. Töltsd fel ennek a mappának a teljes tartalmát (a rejtett `.github` és `.nojekyll` is kell):
   ```bash
   cd dohanybolt-web
   git init && git add -A && git commit -m "Első verzió"
   git branch -M main
   git remote add origin https://github.com/dzsozineni/dohanybolt-kereso.git
   git push -u origin main
   ```
3. A repóban: **Settings → Pages → Build and deployment → Source: Deploy from a branch**,
   Branch: `main`, mappa: `/ (root)` → Save.
4. Pár perc múlva elérhető: `https://dzsozineni.github.io/dohanybolt-kereso/`

## Automatikus adatfrissítés

A `.github/workflows/update-data.yml` naponta lekéri a hivatalos szervert, és ha újabb az adatbázis,
frissíti a `data/shops.json`-t (a Pages ezután magától újraközzéteszi).

Egyszeri beállítás: **Settings → Actions → General → Workflow permissions → Read and write permissions**.
Kézi indítás: **Actions → Adatbázis frissítése → Run workflow**.

Ha a GitHub szerverei nem érik el a magyar szervert (külföldi IP-ről lehet tiltva), a frissítés
otthonról is lefuttatható, majd feltölthető:
```bash
python3 tools/update_from_server.py
git add data && git commit -m "Adatbázis frissítve" && git push
```
Saját SQLite fájlból: `python3 tools/build_data.py tsm_mdb.sqlite --last-update "2026-10-22 14:30:00"`

## Felépítés
```
index.html            oldalváz
style.css             megjelenés (navy / arany / krém)
app.js                logika: keresés, szűrők, nyitvatartás, térkép, adatlap
sw.js                 offline gyorsítótár
manifest.webmanifest  főképernyős telepítés
data/shops.json       boltok + nyitvatartások (tömörítve, egyedi heti beosztásokkal)
vendor/leaflet/       térképkönyvtár (helyben, így offline is betölt)
icons/                alkalmazásikonok
tools/                adatkonverzió és szerverfrissítés
```

Ha az app fájljait módosítod, a `sw.js`-ben emeld a `VERSION` értékét (`v1` → `v2`),
különben a telefonok a régi változatot mutatják a gyorsítótárból. Az adatfájlt ez nem érinti,
az mindig a hálózatról jön, ha van net.

Térkép: OpenStreetMap csempék. Kis forgalomra ingyenes; nagyobb közönséghez saját kulcsos
szolgáltató kell (az `app.js`-ben a `L.tileLayer(...)` sor).
