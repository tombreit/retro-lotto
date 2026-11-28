# Retro-Lotto

**Hätten deine Zahlen schon mal gewonnen?** Eine kleine, schnelle Web-App, die einen Tipp gegen
alle Ziehungen von **Lotto 6 aus 49 (seit 1955)** und **Eurojackpot 5 aus 50 (seit 2012)** prüft –
plus Statistik zu heißen und kalten Zahlen. Und wer mag, **spielt bei der nächsten Ziehung
kostenlos mit**: ohne Einsatz, ohne Gewinn, nur zum Spaß. Statisch gehostet auf GitHub Pages,
ohne Server und ohne Laufzeit-Abhängigkeiten.

## Was die App kann

- **Live-Auswertung beim Tippen:** Jede Änderung wertet sofort alle Ziehungen aus
  (Bitmasken und Popcount, rund 20 µs für 5.000 Ziehungen). Einen „Prüfen“-Button gibt es nicht.
- **Schon ab einer Zahl:** „Die 13 wurde 564-mal gezogen.“ „Diese 3 Zahlen kamen 6-mal gemeinsam.“
- **Vollständiger Tipp:** Wurde genau diese Kombination je gezogen? Wie oft hätte der Tipp sonst
  gewonnen, wenn man ihn bei jeder Ziehung gespielt hätte – je Gewinnklasse mit Datum? Dazu ein Satz
  zur Einordnung (so oft gewinnt im Schnitt jeder Tipp) und die Gewinnchance.
- **Statistik:**
  - Heat-Map nach Abweichung vom Erwartungswert in Standardabweichungen, statt nach roher Häufigkeit.
  - Größte Abweichungen, längste Abwesenheit, häufigste Paare.
  - Rekorde, z. B. 2-3-11-25-27-35, gezogen am 27.05.1962 und am 08.01.2020.
  - Zeitraumfilter.
- **Jackpots:** die Gewinnkombination jeder Ziehung, also die Zahlen für 6 bzw. 5 Richtige, nach
  Jahr. Ein Antippen öffnet die Kombination in „Prüfen“. Dazu Fakten über ganze Ziehungen, jeweils
  mit dem Wert, den der Zufall erwarten lässt:
  - Nachbarzahlen wie 12 und 13 und die längste Zahlenfolge.
  - Ziehungen nur aus „Geburtstagszahlen“ bis 31.
  - Das am seltensten gemeinsam gezogene Paar.
  - Dreier, die noch nie zusammen gezogen wurden.
- **Mitspielen:** Ein vollständiger Tipp lässt sich als Schein für die nächste echte Ziehung
  abgeben – einmalig oder als **Dauerschein** für jede Ziehung. Im Tab „Spielen“:
  - Countdown bis zur Ziehung, danach „Die Zahlen sind da.“ mit einer Ziehungs-Animation: Die Kugeln
    fallen einzeln, Treffer leuchten auf dem eigenen Schein auf.
  - Jedes Ergebnis wird mit der echten Wahrscheinlichkeit eingeordnet („So weit kommen nur 1,9 %
    aller Tipps“).
  - **Bilanz** mit gespartem Einsatz, **Trefferkarte** (jede Zahl, die man einmal richtig hatte)
    und **Verlauf**.
  - **Zeitreise-Ziehung:** sofort spielen gegen eine zufällige Ziehung der Geschichte.
  - **Benachrichtigung** nach der Ziehung, wo der Browser das kann (siehe unten).
- **Teilen und speichern:** Der Tipp steht in der URL (`#lotto/3-12-13-16-23-41`) und lässt sich
  über die Web Share API teilen. Der letzte Tipp bleibt lokal gespeichert.
- **PWA:** installierbar und offline nutzbar, mit Kurzbefehl „Meine Scheine“.
- **Eingabe per Tastatur:** Antippen im Raster oder eintippen, z. B. `3 12 13 16 23 41`.
  - Auf dem Smartphone öffnet das „+“ in der Tipp-Leiste den Ziffernblock.
  - Am Desktop kann man einfach lostippen, ohne vorher zu klicken.
  - Eindeutige Zahlen wie 12 oder 7 werden sofort übernommen. Nur bei 1 bis 4 (Eurojackpot 1 bis 5)
    wartet die Eingabe auf Komma, Leerzeichen oder Enter, weil noch eine zweite Ziffer folgen könnte.
  - Die Rücktaste entfernt die Zahl links vom Eingabefeld. Ganze Zahlenreihen lassen sich einfügen.
- **Feste Plätze:** Jede Zahl bleibt dort, wo sie eingegeben wurde; es wird nicht sortiert. Eine
  entfernte Zahl hinterlässt eine Lücke, die nächste Zahl füllt die erste freie Stelle. Die Lücken
  stehen auch in der URL (`#lotto/3--41`), geteilte Links enthalten nur die Zahlen.
- **Bedienung:** Hell- und Dunkelmodus, `prefers-reduced-motion` wird beachtet.

Superzahl und Eurozahlen werden bewusst nicht ausgewertet. Als Gewinn zählen ab 3 Richtige; dafür
gibt es in beiden Spielen auch ohne Superzahl bzw. Eurozahlen eine Gewinnklasse.

## Mitspielen: wie es ohne Server funktioniert

Die Scheine liegen ausschließlich im Browser, in **IndexedDB** (`src/lib/ticket-db.js`). Es gibt kein
Konto und keinen Server, der sie kennt. Ausgewertet wird an zwei Stellen mit derselben Logik
(`src/lib/tickets.js`, idempotent je Ziehungsdatum):

| Wo | Wann | Ergebnis |
|---|---|---|
| Seite | beim Öffnen, bei Rückkehr in den Vordergrund, nach einer fälligen Ziehung alle paar Minuten | „Die Zahlen sind da.“ zum Aufdecken |
| Service Worker | per **Periodic Background Sync** (`check-draws`) | Benachrichtigung des Betriebssystems |

Der Service Worker kennt die gehashten Daten-Chunks der Seite nicht. Deshalb erzeugt der Build
zusätzlich `draws-latest.json` mit den letzten 40 Ziehungen je Spiel – ungehasht, nicht im
Precache, immer frisch aus dem Netz.

**Grenzen, ehrlich benannt:**
- Hintergrund-Benachrichtigungen gibt es nur in Chromium-Browsern (Chrome, Edge, Samsung Internet)
  und nur, wenn die App **installiert** ist. Wie oft der Browser den Worker weckt, entscheidet er
  selbst – meist höchstens alle zwölf Stunden. Die Benachrichtigung kommt also oft erst am nächsten
  Morgen.
- iPhone, iPad und Firefox können das nicht. Dort wartet das Ergebnis in der App, sobald man sie
  öffnet. Zuverlässige, pünktliche Benachrichtigungen bräuchten Web Push und damit einen kleinen
  Server; der Worker ist dafür vorbereitet (`checkDraws()` in `src/sw.js`).
- Ein Schein gilt für das Gerät und den Browser, in dem er abgegeben wurde. Löscht der Nutzer die
  Website-Daten, sind die Scheine weg. Ein Umzug auf eine andere Adresse (Origin) ebenfalls.
- Annahmeschluss und Ziehungszeiten stehen in `src/games.js` und rechnen in Berliner Zeit, egal in
  welcher Zeitzone das Gerät steht.

Ausprobieren, ohne auf eine Ziehung zu warten (nur im Entwicklungsserver und in Builds mit
`VITE_DEBUG=1`, siehe `src/debug.js`):

```js
retroLotto.backdate()                       // Schein für die letzte Ziehung → „Die Zahlen sind da.“
retroLotto.backdate(5)                      // Dauerschein über die letzten 5 Ziehungen
retroLotto.backdate(1, { settle: false })   // nur ablegen; auswerten soll der Service Worker
retroLotto.checkInBackground()              // Service Worker prüfen lassen
retroLotto.clear()                          // alle Scheine löschen
```

Den Hintergrundfall testet man mit `VITE_DEBUG=1 npm run build:offline && npm run preview`: Schein mit
`settle: false` ablegen, Tab wechseln, dann in den DevTools unter *Application → Service workers*
bei *Periodic sync* das Tag `check-draws` auslösen.

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
   **automatisch nach jeder Ziehung** (Di/Mi/Fr/Sa rund eine Stunde nach der Ziehung und noch
   einmal am späten Abend, dazu morgens als Nachzügler-Lauf).
   Gibt es neue Ziehungen, committet er `data/` als `github-actions[bot]` und veröffentlicht neu.

Die Seite nutzt relative Pfade (`base: './'`) und funktioniert damit unter jedem Repository-Namen.

### Eigene Domain

Die App nutzt nur relative Pfade und läuft unter jeder Adresse. Weil Scheine und die Erlaubnis für
Benachrichtigungen am Origin hängen, sollte die Adresse feststehen, bevor Leute mitspielen.
Für eine Subdomain wie `lotto.example.de` – erst GitHub, dann DNS, damit niemand die Subdomain
übernehmen kann:

1. Domain verifizieren (einmalig): *GitHub → Settings → Pages → Add a domain*, den angezeigten
   TXT-Eintrag `_github-pages-challenge-<user>` beim DNS-Anbieter anlegen, dann *Verify*.
2. Im Repository unter *Settings → Pages → Custom domain* die Subdomain eintragen. Eine
   `CNAME`-Datei im Repository ist bei Deployments über GitHub Actions nicht nötig.
3. Beim DNS-Anbieter einen CNAME anlegen: Host `lotto`, Ziel `<user>.github.io.` – ohne
   Repository-Namen, mit Punkt am Ende. Ein Wildcard-Eintrag der Domain stört nicht, der eigene
   Eintrag hat Vorrang.
4. Prüfen: `dig +short CNAME lotto.example.de` liefert `<user>.github.io.`
5. Sobald GitHub den DNS-Eintrag sieht, *Enforce HTTPS* aktivieren.

Die alte `github.io`-Adresse leitet danach automatisch um.

Hinweis: GitHub pausiert zeitgesteuerte Workflows in öffentlichen Repositories nach 60 Tagen ohne
Aktivität. Die Daten-Commits des Bots zählen in der Regel als Aktivität. Sonst den Workflow
einmal manuell starten.

## Aufbau

```
data/                 Ziehungsdaten (vom Bot gepflegt)
scripts/              Daten-Pipeline: Quellen, Validierung, Merge
src/games.js          Spielregeln als Daten (Bereiche, Wahrscheinlichkeiten, Ziehungszeiten)
src/lib/              Abfrage-Engine, Statistik, Tipp-Zustand, Formatierung,
                      Termine (schedule), Spielscheine (tickets, ticket-db), Benachrichtigungen (notify)
src/play.js           Mitspielen: Scheine laden, abgeben, auswerten
src/components/       Custom Elements: Raster, Tipp-Leiste, Ergebnis, Statistik, Jackpots,
                      Mitspielen-Karte, Tab „Spielen“, Ziehungs-Animation
src/styles/           CSS mit @layer, Nesting, light-dark(), Container Queries
src/sw.js             Service Worker (wird beim Build gebündelt, Precache-Liste eingesetzt)
test/                 node --test
```

Alle Angaben ohne Gewähr. Vergangene Ziehungen sagen nichts über künftige voraus.
Glücksspiel kann süchtig machen – Hilfe gibt es bei [check-dein-spiel.de](https://www.check-dein-spiel.de).
