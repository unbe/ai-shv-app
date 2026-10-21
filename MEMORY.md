# MEMORY.md - SHV FSVL Web App

## Project Overview
A high-performance, responsive web reproduction of the official **SHV FSVL** (Schweizerischer Hängegleiter-Verband / Fédération Suisse de Vol Libre) mobile application (`ch.shv_fsvl`).

## Reverse-Engineered APK Findings & Architecture
1. **Developer & Data Providers**:
   - The native app was developed for SHV FSVL by **Ubique Innovation AG** (Zurich).
   - Core weather and mapping backend: **Ubique Fluid SDK** (`weather-ws-prod.ubmeteo.io`, `shv-app-static-prod.ubmeteo.io`, `webcam-prod.ubmeteo.io`).
   - Airspace & Obstacles: Swiss Federal Office of Civil Aviation (**BAZL** / FOCA) and **Skyguide**.
   - Base Maps: Federal Office of Topography **Swisstopo** (GeoAdmin WMTS: `ch.swisstopo.pixelkarte-farbe`, `ch.swisstopo.swissimage`, `ch.swisstopo.pixelkarte-grau`).
   - Wildlife zones: Federal Office for the Environment (**BAFU**) Wildruhezonen & Jagdbanngebiete.
   - Weather: **MeteoSchweiz** & **SLF** (WSL Institute for Snow and Avalanche Research).

2. **Official Endpoints & Datasets**:
   - `https://shv-app-static-prod.ubmeteo.io/v1/flyingsites.geojson`: 1,341 official launch, landing, and hazard sites across Switzerland with takeoff directions, difficulty, club affiliations, Twint landing fees, and guidelines.
   - `https://shv-app-static-prod.ubmeteo.io/v1/airspaces/shv.geojson`: 353 Swiss airspace polygons (CTR, TMA, Airfield, Heliport, RMZ, FIZ, Glider Sectors W, Danger Q, Restricted R) with frequencies, callsigns, lower/upper altitude limits.
   - `https://shv-app-static-prod.ubmeteo.io/v1/wildschutz/shv.geojson`: 51 Swiss wildlife sanctuaries with mandatory 300m AGL minimum altitude or seasonal prohibitions.
   - `https://weather-ws-prod.ubmeteo.io/v1/measurements/current`: 620+ live Swiss weather stations with wind speed, gusts, direction, temperature, and MSL pressure.
   - `https://webcam-prod.ubmeteo.io/v1/webcams/overview`: Alpine mountain webcams with real-time imagery.

3. **Core Application Modules**:
   - **Interactive Live Map**: Leaflet map supporting Swisstopo National Map, Swisstopo Satellite (Swissimage), Swisstopo Light Base, and OpenStreetMap. Interactive layers for Launches, Landings, Airspaces, Wildlife zones, Stations, Föhn transects, and Webcams with wind compass roses and bottom sheets.
   - **Live Weather & Föhn Dashboard**: Real-time North-South pressure difference (Gotthard transect: Lugano vs. Zurich/Kloten) with South Föhn / North Föhn danger levels, secondary transects (Altdorf, Gütsch), and 12-hour barometric trend history (Chart.js).
   - **Flugwetter (Soaring Forecast)**: Daily Swiss Free-Flight synopsis, thermal quality index, cloud base (LCL), thermal ceiling, winds aloft table (Surface, 1000m, 1500m, 2000m, 3000m, 4000m).
   - **Aerological Soundings (Emagram)**: Python companion service (`server/emagram_calc.py`) computing parcel ascent curves, dry/moist adiabatic lapse rates, LCL, CAPE, and thermal climb rates with an interactive afternoon heating simulator.
   - **Safety & Pilot Tools**: 5-Punkte-Check pre-flight checklist, Emergency SOS (Rega 1414, 112, K-Funk 161.300 MHz), tree landing procedures, Skybriefing DABS viewer, electronic Flugbuch (Flight Logbook) with CSV export, and an authentic acoustic variometer simulator using the Web Audio API.
   - **SHV Profile & Digital License**: Official digital membership card and Brevet pilot licence displaying ratings (Brevet Gleitschirm, IPPI Card Stage 5, Tandem BAX), insurance coverage (CHF 10 Mio.), and offline verification QR code.

4. **Languages**:
   - Full multilingual i18n support in German (DE), French (FR), Italian (IT), and English (EN).

5. **Server Setup**:
   - Backend API: Node.js Express server on port 3001 (`server/index.js`).
   - Scientific Aerological Engine: Python (`server/emagram_calc.py`).
   - Frontend Dev Server: Vite on port 3000 (`server/start-dev.js` runs both seamlessly).
