# Retro-Lotto

**Hätten deine Zahlen schon mal gewonnen?** Eine kleine, schnelle Web-App, die einen Tipp gegen
alle Ziehungen von **Lotto 6 aus 49 (seit 1955)** und **Eurojackpot 5 aus 50 (seit 2012)** prüft –
plus Statistik zu heißen und kalten Zahlen. Statisch gehostet auf GitHub Pages, ohne Server und
ohne Laufzeit-Abhängigkeiten.

## Was die App kann

- **Live-Auswertung beim Tippen:** Jede Änderung wertet sofort alle Ziehungen aus
  (Bitmasken und Popcount, rund 20 µs für 5.000 Ziehungen). Einen „Prüfen“-Button gibt es nicht.
- **Schon ab einer Zahl:** „Die 13 wurde 564-mal gezogen.“ „Diese 3 Zahlen kamen 6-mal gemeinsam.“
- **Vollständiger Tipp:** Volltreffer ja oder nein. Dazu die Treffer mit 6, 5, 4 und 3 Richtigen,
  jeweils mit Datum und dem Erwartungswert bei reinem Zufall.
- **Statistik:**
  - Heat-Map nach Abweichung vom Erwartungswert in Standardabweichungen, statt nach roher Häufigkeit.
  - Größte Abweichungen, längste Abwesenheit, häufigste Paare.
  - Rekorde, z. B. 2-3-11-25-27-35, gezogen am 27.05.1962 und am 08.01.2020.
  - Zeitraumfilter.
- **Teilen und speichern:** Der Tipp steht in der URL (`#lotto/3-12-13-16-23-41`) und lässt sich
  über die Web Share API teilen. Der letzte Tipp bleibt lokal gespeichert.
- **PWA:** installierbar und offline nutzbar.
- **Eingabe per Tastatur:** Antippen im Raster oder eintippen, z. B. `3 12 13 16 23 41`.
  - Auf dem Smartphone öffnet das „+“ in der Tipp-Leiste den Ziffernblock.
  - Am Desktop kann man einfach lostippen, ohne vorher zu klicken.
  - Eindeutige Zahlen wie 12 oder 7 werden sofort übernommen. Nur bei 1 bis 4 (Eurojackpot 1 bis 5)
    wartet die Eingabe auf Komma, Leerzeichen oder Enter, weil noch eine zweite Ziffer folgen könnte.
  - Die Rücktaste entfernt die letzte Zahl. Ganze Zahlenreihen lassen sich einfügen.
- **Bedienung:** Hell- und Dunkelmodus, `prefers-reduced-motion` wird beachtet.

Superzahl und Eurozahlen werden bewusst nicht ausgewertet. Als Gewinn zählen ab 3 Richtige; dafür
gibt es in beiden Spielen auch ohne Superzahl bzw. Eurozahlen eine Gewinnklasse.

## Entwicklung

```bash
npm install
npm run dev            # Entwicklungsserver
npm test               # Unit-Tests + Integritätsprüfung der Daten (node --test)
npm run data           # Ziehungsdaten inkrementell aktualisieren
npm run build          # Daten aktualisieren + Produktions-Build nach dist/
npm run build:offline  # Build nur mit dem committeten Datenstand
npm run preview        # dist/ lokal ansehen
```

Voraussetzung: Node.js ≥ 24. Einzige Abhängigkeit ist Vite (devDependency).

## Daten

Die Ziehungen liegen versioniert in `data/lotto.json` und `data/eurojackpot.json`, eine Ziehung
pro Zeile. So bleibt jede neue Ziehung im Git-Log als einzeilige Änderung nachvollziehbar.

`scripts/update-data.mjs` fragt mehrere unabhängige Quellen ab und führt sie zusammen:

| Spiel | Quelle | Zweck |
|---|---|---|
| Lotto | [LottoNumberArchive](https://github.com/JohannesFriedrich/LottoNumberArchive) (LGPL-3.0) | komplette Historie seit 1955 |
| Lotto | lottozahlenonline.de | aktuelles Jahr, schließt die Verzögerung des Archivs |
| Lotto, EJ | lotto.de (`/api/stats/entities.*/last`) | offizielle letzte Ziehung als Gegenprobe |
| EJ | Eesti Loto API | laufende Ziehungen mit offizieller Ziehungsnummer |
| EJ | eurojackpot-zahlen.eu | einmaliger Import ab 2012 (`npm run data:backfill`), Notfall bei Lücken |

Regeln:
- **Bestehende Ziehungen werden nie überschrieben.**
- Widersprechen sich zwei Quellen, bricht das Skript mit Fehler ab. Es wird dann nichts veröffentlicht.
- Neue Ziehungen müssen auf einen regulären Ziehungstag fallen (Lotto Mi/Sa, Eurojackpot Di/Fr).
- Fehlende Ziehungstage werden gemeldet.
- Bei Eurojackpot muss die eigene Zählung zur offiziellen Ziehungsnummer passen. Die Nummer liegt
  konstant 2 über der Anzahl der Ziehungen, obwohl jeder Termin seit 23.03.2012 vorhanden ist.
- Fällt eine Quelle aus, ist das nur eine Warnung. Gebaut wird dann mit dem committeten Stand.

Bekannte Lücke: Die Mittwochsziehungen A/B von 1986–2000 fehlen. Mittwochs ist Lotto erst ab
Dezember 2000 enthalten.

## Veröffentlichung auf GitHub Pages

1. Repository auf GitHub anlegen und pushen.
2. Unter *Settings → Pages → Build and deployment* als *Source* „**GitHub Actions**“ wählen.
3. Der Workflow `.github/workflows/pages.yml` läuft bei jedem Push, manuell sowie
   **automatisch nach jeder Ziehung** (Di/Mi/Fr/Sa abends, dazu morgens als Nachzügler-Lauf).
   Gibt es neue Ziehungen, committet er `data/` als `github-actions[bot]` und veröffentlicht neu.

Die Seite nutzt relative Pfade (`base: './'`) und funktioniert damit unter jedem Repository-Namen.

Hinweis: GitHub pausiert zeitgesteuerte Workflows in öffentlichen Repositories nach 60 Tagen ohne
Aktivität. Die Daten-Commits des Bots zählen in der Regel als Aktivität. Sonst den Workflow
einmal manuell starten.

## Aufbau

```
data/                 Ziehungsdaten (vom Bot gepflegt)
scripts/              Daten-Pipeline: Quellen, Validierung, Merge
src/games.js          Spielregeln als Daten (Bereiche, Wahrscheinlichkeiten)
src/lib/              Abfrage-Engine, Statistik, Tipp-Zustand, Formatierung
src/components/       Custom Elements: Raster, Tipp-Leiste, Ergebnis, Statistik
src/styles/           CSS mit @layer, Nesting, light-dark(), Container Queries
src/sw.template.js    Service Worker (Precache-Liste wird beim Build eingesetzt)
test/                 node --test
```

Alle Angaben ohne Gewähr. Vergangene Ziehungen sagen nichts über künftige voraus.
Glücksspiel kann süchtig machen – Hilfe gibt es bei [check-dein-spiel.de](https://www.check-dein-spiel.de).
