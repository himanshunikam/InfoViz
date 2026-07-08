# InfoViz – 3D-Datenvisualisierung & EEG-Analyse

Dieses Repository enthält zwei zusammengehörige Teilprojekte aus dem Modul *Information Visualization*:

1. **Web-Visualisierung** – eine interaktive 3D-Visualisierung deutscher Agrar- und Verbraucherpreise (Three.js + WebXR).
2. **EEG-Analyse** – eine Auswertung einer selbst aufgezeichneten EEG-Test-Session mit automatisch generiertem PDF-Report.

---

## Live-Version

Die Web-Visualisierung ist als statische Seite über **GitHub Pages** lauffähig.

- **Live-Link:** https://himanshunikam.github.io/InfoViz/

>
> **Lokal starten:** Da die Anwendung Daten per `fetch` lädt und ES-Module nutzt, muss sie über einen lokalen Server laufen (nicht per Doppelklick auf `index.html`):
> ```bash
> python -m http.server 8000
> # danach im Browser: http://localhost:8000
> ```

---

# Teil 1 – Web-Visualisierung: Deutsche Preisentwicklung in 3D

## Welche Daten wurden visualisiert? (+ Quelle)

Es werden zwei Datensätze zur deutschen Preisentwicklung dargestellt:

| Datensatz | Inhalt | Zeitraum | Einheit | Quelle | Datei |
|-----------|--------|----------|---------|--------|-------|
| **Producer Prices** | Erzeugerpreise landwirtschaftlicher Güter (Äpfel, Milch, Getreide, Fleisch …) | 1991–2022 | LCU/Tonne | **FAOSTAT** (Food and Agriculture Organization der UN) | `producer-prices_deu.csv` |
| **Consumer Price Index** | Verbraucherpreisindex nach 12 COICOP-Kategorien | 1991–2026 | Index (2020 = 100) | **Destatis** (Statistisches Bundesamt, Tabelle 61111-0006) | `61111-0006_en_flat.csv` |

## Warum?

Preisentwicklung ist ein Thema mit direktem Alltagsbezug (Inflation, Lebensmittelkosten). Klassische Liniendiagramme stoßen jedoch an Grenzen, wenn man **viele Produkte gleichzeitig über einen langen Zeitraum** vergleichen möchte – die Linien überlagern sich. Ziel dieses Projekts ist es daher, dieselben Daten in **verschiedenen 3D-Formen** erlebbar zu machen und dadurch:

- Muster über die Zeit (z. B. Preissprünge) besser sichtbar zu machen,
- den direkten Vergleich vieler Kategorien in einem Raum zu ermöglichen,
- Krisenzeiträume (Euro-Umstellung 2001/02, COVID-19 2020–2022) hervorzuheben,
- und mit **WebXR** einen immersiven, räumlichen Zugang zu Daten auszuprobieren.

## Wie sind die Daten gemappt worden?

Es stehen vier Visualisierungen zur Verfügung (Tabs oben in der Anwendung):

### ▪▪▪ 3D Bar Matrix (`viz1.js`)
- **X-Achse:** Jahr
- **Z-Achse:** Produkt/Kategorie
- **Y-Achse (Höhe):** Preis bzw. Indexwert
- **Farbe:** Warengruppe (Milk & Dairy, Meat, Vegetables …)
- **Krisen-Overlay:** Balken der Krisenzeiträume werden farblich hervorgehoben und pulsieren leicht.

### ▲ Price Terrain (`viz2.js`)
- Die Preiswerte werden als **Höhenlandschaft** (Terrain) interpoliert: Jahr × Produkt spannen die Grundfläche auf, der Preis bestimmt die Höhe und die Einfärbung des „Geländes“.

### ● Bubble Orbs (`viz3.js`)
- Jede Kategorie ist eine **Kugel**; ihre Größe/Position codiert den Preis in einem einzelnen Jahr.
- Über einen **Zeit-Regler** (mit Play-Button) lässt sich die Entwicklung Jahr für Jahr animieren.

### ▲ Inflation (`viz4.js`, nur CPI)
- Nutzt die monatliche Auflösung des Destatis-Datensatzes, um die Inflations-/Indexentwicklung darzustellen.

**Farbzuordnung:** Jede Warengruppe hat eine feste Farbe (definiert in `js/data.js`), sodass sie über alle Ansichten hinweg wiedererkennbar bleibt (Konsistenzprinzip). Fehlende Jahreswerte werden linear interpoliert (`interpolateMissing`).

## Wie ist die Interaktion? (Suche / Filter)

Die Steuerung erfolgt über die **Seitenleiste** und die **Kontrollleiste**:

- **Datensatz-Umschalter:** *Producer* ↔ *Consumer* (CPI wird erst bei Bedarf nachgeladen).
- **Kategorie-Filter (Dropdown):** Einschränkung auf eine Warengruppe (z. B. nur „Meat“). Beim Start ist **keine Kategorie vorausgewählt** – erst die Auswahl einer Kategorie blendet deren Produkte ein (Ergebnis der EEG-Auswertung, s. Task 1 in Teil 2).
- **Item-Liste:** Einzelne Produkte per Klick an-/abwählen. Schnellauswahl über die Buttons **All**, **Top 8** und **Clear**.
- **Jahres-Bereich (Doppel-Slider):** Start- und Endjahr frei einstellen.
- **Zeit-Slider + Play/Pause:** In „Bubble Orbs“ die Jahre animiert durchlaufen.
- **Krisen-Buttons:** *Keine* / *EUR-Umstellung (2001–2002)* / *COVID-19 (2020–2022)* hervorheben (nur in der Bar Matrix).
- **Tooltip:** Beim Überfahren eines Balkens/Objekts mit der Maus werden Produkt, Jahr und exakter Wert angezeigt.
- **Kamera:** Rotieren, Zoomen und Verschieben per Maus (OrbitControls).

## XR (WebXR)

Die Anwendung unterstützt **immersives VR über WebXR** (`js/viewer.js`):

- Ein **„Enter VR“-Button** startet die immersive Session (falls ein VR-Headset/Emulator verfügbar ist; ansonsten zeigt der Button „WebXR not available“).
- In VR wird die Visualisierung als **räumliches „Tabletop“-Hologramm** dargestellt.
- **Controller** mit Laserpointern erlauben die Auswahl; ein **In-VR-Panel** ermöglicht das Umschalten der Visualisierungen direkt in der Szene.
- Referenzraum: `local-floor` (bodenbezogene Darstellung).

### Projektstruktur (Web-Teil)
```
index.html          – Einstiegspunkt, Layout & Steuerelemente
css/style.css       – Styling
js/main.js          – App-Logik, State, Event-Handling
js/data.js          – CSV laden, parsen, kategorisieren, Farben
js/viewer.js        – Three.js-Renderer & WebXR-Session
js/viz1.js … viz4.js – die vier Visualisierungen
producer-prices_deu.csv   – FAOSTAT-Erzeugerpreise
61111-0006_en_flat.csv    – Destatis-Verbraucherpreisindex
```

---

# Teil 2 – EEG-Analyse

## Welche Daten wurden visualisiert? (+ Quelle)

Visualisiert wird eine **selbst aufgezeichnete EEG-Test-Session** (Elektroenzephalografie – Messung der elektrischen Hirnaktivität).

- **Aufnahmedatum:** 17.06.2026.
- **Rohdaten:** `EEG Analyse/data/eeg_data.txt` (OpenSignals-Textformat) sowie die Original-Aufzeichnungen in `backup-eeg/` (`.h5` / `.txt`).
- **Ausgewerteter Kanal:** der **frontale** Kanal (CH1).
- **Session-Dauer:** ca. **56 Sekunden** (≈ 56.000 Messpunkte).

## Warum?

Ziel ist es, ein Roh-EEG-Signal nicht nur als eine unleserliche Wellenlinie darzustellen, sondern es in **verständliche Wellentypen** (Alpha, Beta, Sonstige) zu zerlegen und deren **Anteile** an der Session sichtbar zu machen. So lässt sich auf einen Blick einschätzen, in welchem mentalen Zustand sich die Testperson während der Aufnahme überwiegend befand.


## Wie ist die Interaktion?

Der EEG-Teil ist eine **Batch-/Report-Pipeline** und daher **nicht interaktiv im Browser** – die „Interaktion“ findet im Notebook statt:

- Anpassbare Parameter in den Grundeinstellungen (`sf`, Frequenzbänder `alpha_band`/`beta_band`, Filter-Parameter, Farben).
- Ausführen des Notebooks erzeugt automatisch PDF, PNG und CSV neu.
- Zusätzlich erzeugt `gen_movie.sh` (per `ffmpeg`) ein Video, in dem der EEG-Farbstreifen synchron unter ein Film-Overlay gelegt wird (`movie_with_eeg_strip.mp4`).

### Ausgabe-Dateien (`EEG Analyse/output/`)
```
EEG_Output.pdf                 – vollständiger Report (Report-Abgabe, s. u.)
EEG_Liniengrafik_Streifen.png  – Farb-Zeitstreifen
movie_with_eeg_strip.mp4       – Video mit eingeblendetem EEG-Streifen
df_frontal.csv                 – klassifizierter Datensatz (in data/)
```

## Report-Abgabe (PDF)
   Der Ausgabe der EEG Notebooks liegt in EEG Analyse/output/EEG_Output-main.pdf(haupt funktion) und EEG_Output.pdf(WebXR funktion)
## Interpretation der Test-Session

Die Aufnahme entstand, während die Testperson nacheinander fünf Aufgaben an der Web-Visualisierung bearbeitete. Grundlage der Deutung ist der Zeitstreifen `output/EEG_Liniengrafik_Streifen-main.png`.

**Farbcode:** 🔵 Blau = Alpha (Entspannung / Ruhe) · 🔴 Rot = Beta (Konzentration / Anspannung) · ⚫ Grau = Sonstige (langsame Wellen & Artefakte wie Blinzeln/Bewegung).

**Task 1** — *bis x ≈ 450:*
Der Abschnitt startet **alpha-betont** (viel Blau) – die Testperson liest sich zunächst entspannt ein. In der Mitte kippt es in eine **ausgeglichene, unruhigere Phase** (Alpha und Beta etwa gleichauf), passend zum Suchen und Umstellen der Auswahl. Gegen Ende steigt das **Alpha wieder deutlich an** (Beruhigung), während die roten Beta-Marker über den ganzen Abschnitt gestreut bleiben.

> **Erkenntnis & Fix aus Task 1:** Die erhöhte Beta-Aktivität (Rot = Anspannung) in Task 1 ließ sich auf ein UX-Problem zurückführen: Beim Öffnen der App war die Kategorie **„All“ vorausgewählt**, sodass bereits die ersten Produkte (Getreide wie Barley, Corn …) angezeigt wurden, obwohl die Testperson diese nie ausgewählt hatte – das sorgte beim Einstieg für Verwirrung und Suchstress. **Fix:** Die App startet jetzt **ohne vorausgewählte Kategorie** mit leerer Szene („Select a category…“); erst nach Klick auf eine Kategorie im Dropdown werden deren Produkte angezeigt und automatisch in die Visualisierung übernommen (`index.html`, `js/main.js`).

**Task 2** — *x ≈ 470 – 590:*
Überwiegend **ruhig und alpha-dominant** in der ersten Hälfte (viel Blau), dann ein **Anstieg der Beta-Aktivität in der zweiten Hälfte** – die Konzentration nimmt zum Ende hin zu, insgesamt aber ein entspannter Abschnitt.

**Task 3** — *x ≈ 590 – 690:*
Beginnt **beta-lastig** (Rot leicht über Blau) – konzentrierter Einstieg. In der Mitte ein **kräftiger Alpha-Ausschlag** (kurze Entspannung), und am **Ende ein deutlicher Beta-Peak** (stärkste Anspannung des Abschnitts).

**Task 4** — *x ≈ 690 – 860:*
Der **entspannteste Abschnitt** insgesamt: durchgehend viel **Alpha** (hoher Blau-Anteil), besonders am Anfang. In der dritten Phase kurz ruhiger/graulastiger, danach wieder **Alpha mit erhöhtem Beta** zum Ende – flüssige Bearbeitung mit klaren Konzentrationsspitzen.

**Task 5** — *x ≈ 890 – 1130:*
Startet **ruhig und unauffällig** (wenig Alpha und Beta, viel Grau), baut sich dann auf und läuft auf einen **Beta-Peak am Ende** zu (steigende Anspannung zum Abschluss der Aufgabe).

**Fazit:** Über alle Aufgaben überwiegt **Alpha gegenüber Beta** – die Session war insgesamt eher entspannt. Die **Beta-Spitzen häufen sich jeweils an den Enden der Aufgaben** (Ablesen/Antwort-Finden) sowie in Umstell-/Suchphasen, während sich das Signal beim ruhigen Lesen Richtung Alpha verschiebt.

