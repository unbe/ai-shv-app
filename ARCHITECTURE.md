# Technical Architecture – SHV FSVL App & Web Implementation

This document provides a comprehensive technical reference for the official **SHV FSVL** (Schweizerischer Hängegleiter-Verband / Fédération Suisse de Vol Libre) application (`ch.shv_fsvl`) and its web implementation. It is based on reverse engineering of the official native Android APK (`shv.apk`), static asset extraction, decompiled bytecode analysis (`jadx`), and network protocol verification.

---

## 1. System Overview & Ecosystem

The SHV FSVL app is the central digital tool for Swiss paragliding and hang gliding pilots. The system brings together several official government and meteorological data providers:

```
+---------------------------------------------------------------------------------------+
|                                    SHV FSVL Client                                     |
|                     (Native Android Kotlin Compose / Web App Vite)                    |
+-------------------+--------------------+--------------------+-------------------------+
         |                   |                    |                        |
         v                   v                    v                        v
+-----------------+ +------------------+ +------------------+ +-------------------------+
| Keycloak SSO    | | Member WS        | | Ubique Fluid     | | Swiss Federal Geo     |
| Identity Server | | (shv-app-ws-prod)| | Meteo Services   | | & Airspace Providers  |
+-----------------+ +------------------+ +------------------+ +-------------------------+
| login.shv-fsvl  | | /v1/wms/person   | | weather-ws-prod  | | Swisstopo WMTS        |
| - OAuth2 / OIDC | | /v1/wms/company  | | webcam-prod      | | BAZL / Skyguide DABS  |
| - PKCE Auth     | | - Pilot profile  | | shv-app-static   | | BAFU Wildschutz       |
| - JWT Tokens    | | - Brevets        | | - GeoJSON layers | | MeteoSchweiz / SLF    |
|                 | | - Insurances     | | - Flying sites   |                         |
+-----------------+ +------------------+ +------------------+ +-------------------------+
```

### Key Ecosystem Entities
1. **Verband (SHV FSVL)**: Operates the membership registry, pilot licensing (Brevets), collective liability insurance, and the official Keycloak authentication realm.
2. **Ubique Innovation AG** (Zurich): Developer of the official mobile applications and operator of the backend cloud infrastructure (Fluid Meteo SDK).
3. **Swisstopo (Federal Office of Topography)**: High-resolution national topographic maps (Pixelkarte) and aerial orthophotos (Swissimage) served via GeoAdmin WMTS.
4. **BAZL / FOCA & Skyguide**: Swiss airspace structure, obstacle databases, and Daily Airspace Bulletins (DABS).
5. **BAFU (Federal Office for the Environment)**: Swiss wildlife sanctuaries (*Wildruhezonen* and *Jagdbanngebiete*) with mandatory minimum flight altitude restrictions.
6. **MeteoSchweiz & SLF**: Automated weather stations network delivering real-time ground and alpine observations.

---

## 2. Reverse-Engineered Android Architecture

Analysis of `apk_analysis/shv.apk` decompiled using `jadx` reveals the native implementation structure:

### Class Hierarchy & Packages
- `ch.shv_fsvl.feature.account.*`: User account management, login controller, profile screen, and license card renderers.
- `ch.shv_fsvl.feature.account.models.*`: Kotlin `@Serializable` data classes:
  - `g.c` (`UserProfile`): Detailed pilot data.
  - `g.b` (`CompanyProfile`): School/club/enterprise entity profile.
  - `b` (`ShvBrevet`): Pilot license ratings and card levels.
  - `d` (`ShvInsurance`): Third-party liability insurance policy.
  - `e` (`ShvMembership`): Club affiliations and membership categories.
  - `a` (`ShvAddress`): Postal address and canton.
- `ch.ubique.heidi.oidc.*`: Ubique’s proprietary OpenID Connect library:
  - `AuthorizationActivity`: Headless activity managing Chrome Custom Tabs browser launch.
  - `RedirectUriReceiverActivity`: Intent filter destination handling HTTPS App Link redirects.
  - `CodeChallengeMethod.S256`: PKCE challenge computation.
- `ch.ubique.fluidsdk.*`: Meteo time series, raster/vector map engines, weather station products, and telemetry.

### Core Frameworks
- **UI Toolkit**: Jetpack Compose with Material 3 Adaptive layout primitives.
- **Dependency Injection**: Koin (`org.koin.core`).
- **HTTP Engine**: Ktor Client (`io.ktor.client`) with JSON serialization plugins.
- **Serialization**: `kotlinx.serialization` with custom polymorphic class serializers.
- **Error Reporting**: Sentry Android SDK (`sentry.ubique.ch`).

---

## 3. Authentication & Identity Architecture (Keycloak OIDC)

The official app uses standard **OAuth 2.0 / OpenID Connect with PKCE (Proof Key for Code Exchange)**.

### Endpoint Registry

| Service | Target URL |
| :--- | :--- |
| **OIDC Discovery** | `https://login.shv-fsvl.ch/realms/SHV/.well-known/openid-configuration` |
| **Auth Endpoint** | `https://login.shv-fsvl.ch/realms/SHV/protocol/openid-connect/auth` |
| **Token Endpoint** | `https://login.shv-fsvl.ch/realms/SHV/protocol/openid-connect/token` |
| **Client ID** | `app-android` (Android public client, no secret) / `app-ios` (iOS) |
| **Redirect URI** | `https://prod.shv-app.ch/oidc/callback` |
| **Scopes** | `openid offline_access` |
| **Challenge Method**| `S256` (SHA-256 base64url) |

### Native Authentication Sequence
1. **PKCE Setup**: Client creates random `code_verifier` (32 bytes entropy) and derives `code_challenge = BASE64URL(SHA256(verifier))`.
2. **Browser Launch**: Directs pilot to Keycloak auth endpoint:
   ```
   https://login.shv-fsvl.ch/realms/SHV/protocol/openid-connect/auth
     ?client_id=app-android
     &redirect_uri=https%3A%2F%2Fprod.shv-app.ch%2Foidc%2Fcallback
     &response_type=code
     &scope=openid offline_access
     &code_challenge=<challenge>
     &code_challenge_method=S256
     &state=<state>
     &prompt=login
   ```
3. **Keycloak Authentication**: Pilot submits credentials on the official Keycloak login form. Direct Access Grants (Resource Owner Password Credentials) are strictly **disabled** on this realm (`unauthorized_client`).
4. **App Links Interception**: Keycloak redirects to `https://prod.shv-app.ch/oidc/callback?code=...&state=...`.
   - On Android: Android OS captures this via `intent-filter` matching `host="prod.shv-app.ch"` and launches `RedirectUriReceiverActivity`.
   - On Desktop: Browser renders the static callback page (`"Anmeldung erfolgreich – SHV"`) retaining the code and state parameters in the address bar.
5. **Token Exchange**: POST to `https://login.shv-fsvl.ch/realms/SHV/protocol/openid-connect/token`:
   ```http
   POST /realms/SHV/protocol/openid-connect/token HTTP/1.1
   Host: login.shv-fsvl.ch
   Content-Type: application/x-www-form-urlencoded

   grant_type=authorization_code
   &client_id=app-android
   &code=<code>
   &redirect_uri=https%3A%2F%2Fprod.shv-app.ch%2Foidc%2Fcallback
   &code_verifier=<verifier>
   ```
   Returns `{ access_token, refresh_token, id_token, expires_in }`.
6. **Token Role Validation (`TokenRoleValidator` / `qj7.java`)**:
   - Parses the JWT payload `realm_access.roles`.
   - Pilot is validated as an active member if `roles` contains at least one of:
     - `'m'`: Active member (*Mitglied*)
     - `'c'`: Club administrator (*Club*)
     - `'s'`: Flight school / instructor (*Schule*)
     - `'a'`: Federation administrator (*Admin*)

---

## 4. Backend Member Web Services (`shv-app-ws-prod`)

Once authenticated, the app queries the member web service:

### Endpoints
- **Individual Pilot Profile**: `GET https://shv-app-ws-prod.shv-app.ch/v1/wms/person`
  - Header: `Authorization: Bearer <access_token>`
  - Header: `Accept: application/json`
- **Entity / Club Fallback**: `GET https://shv-app-ws-prod.shv-app.ch/v1/wms/company`
  - Invoked automatically by `uu7.java` if `v1/wms/person` returns HTTP 403 Forbidden.

### `UserProfile` Payload Structure

```json
{
  "extId": 58412,
  "shvNumber": 58412,
  "firstName": "Hans",
  "lastName": "Muster",
  "genderId": "M",
  "salutationId": "HERR",
  "birthDate": "1985-06-15",
  "nationalityId": "CH",
  "languageId": "DE",
  "email": "pilot@domain.ch",
  "phone": "+41 44 000 00 00",
  "mobile": "+41 79 000 00 00",
  "address": {
    "adresszusatz": null,
    "strasse": "Flugplatzstrasse 12",
    "postfach": null,
    "plz": "3800",
    "ort": "Interlaken",
    "kanton": "BE",
    "land": "CH"
  },
  "memberships": [
    {
      "organisationName": "SHV FSVL Verband",
      "eintrittsdatum": "2010-04-01",
      "austrittsdatum": null,
      "mitgliedkategorie": {
        "id": 1,
        "name": "Aktivmitglied Pilot"
      }
    }
  ],
  "insurance": {
    "name": "SHV Kollektiv-Haftpflicht",
    "beschreibung": "CHF 10'000'000.-",
    "startDatum": "2026-01-01",
    "endDatum": "2026-12-31",
    "zielgruppeTyp": { "id": 1, "name": "Pilot" }
  },
  "brevets": [
    {
      "category": "Gleitschirm",
      "cardLevels": [
        { "cardLevel": "PILOT", "title": "Brevet Gleitschirm" }
      ]
    }
  ]
}
```

---

## 5. Spatial & Weather Data Pipeline

The app integrates live telemetry and static GIS layers across Switzerland:

```
[Spatial / Weather Sources]
  ├── GeoJSON CDN (shv-app-static-prod.ubmeteo.io)
  │     ├── /v1/flyingsites.geojson   -> 1,341 takeoff/landing sites
  │     ├── /v1/airspaces/shv.geojson -> 353 airspace polygons
  │     └── /v1/wildschutz/shv.geojson-> 51 wildlife protection zones
  ├── Live Weather (weather-ws-prod.ubmeteo.io)
  │     └── /v1/measurements/current  -> 620+ stations (wind, gust, temp, QNH)
  ├── Mountain Webcams (webcam-prod.ubmeteo.io)
  │     └── /v1/webcams/overview      -> Panomax, Roundshot, Swiss alpine cams
  └── Swisstopo GeoAdmin WMTS
        ├── ch.swisstopo.pixelkarte-farbe  -> Swiss National Topo Map
        ├── ch.swisstopo.swissimage        -> High-res aerial imagery
        └── ch.swisstopo.pixelkarte-grau   -> Grey / relief basemap
```

### Flying Sites Data Model & Layer Separation
The SHV flying sites spatial dataset (`public/data/flyingsites.geojson`) contains 1,341 total features representing take-offs, landings, perimeter boundaries, and auxiliary facilities:
- **Interactive Map Pins**: Strictly filtered to `type === 'launch'` (358 take-offs) and `type === 'landing'` (199 landings). Perimeter boundaries (`launcharea`, `landingarea`, `landingpattern`, `access`, `parking`) are preserved in spatial indexing but excluded from generating redundant point markers, ensuring 100% of clickable pins possess valid, official `siteName` values and eliminating generic `"Unbenannter Flugplatz"` placeholders.
- **Parent Site Resolution (`siteId`)**: Auxiliary features (parking, obstacles, landing circuits) link to their primary site via `siteId`. If any feature lacks explicit name attributes, its parent metadata (site name, altitude, rules, club) is inherited automatically from the primary `launch` or `landing` entity.
- **Fees & Payment Integration**:
  - `fees`: Official landing and takeoff fee policies (e.g. Unterleimbach Fr. 5.– Tageskarte / Fr. 40.– Jahreskarte).
  - `feePaymentLink`: Deep link to online digital payment providers (e.g. RaiseNow / Twint).
  - `feeQrCodeUrl`: Official Swiss Twint payment QR code rendered for immediate on-site scanning.
- **Operational Badges**: Renders flight suitability (`paraglider`, `hangglider`, `speedflyer`, `toplanding`, `hikeAndFly`, `soaring`, `crossCountry`), access mode (`accessibleByCar`, `publicTransport`), difficulty level (`easy`, `moderate`, `difficult`), and opening status (`open`, `closed` / shooting range warnings).

### Alpine Pressure & Temperature Difference Transects
The native app computes exactly four official station pairs across Switzerland (`PressureDifferenceGeoJsonTransformer.c`):
1. **Gotthard Föhn Axis (`KLO_LUG`)** – `PRESSURE_NORTH_SOUTH` (midpoint 0.25):
   - **North**: Zürich / Kloten (`meteo_swiss:KLO`, 426m AMSL)
   - **South**: Lugano (`meteo_swiss:LUG`, 273m AMSL)
   - **Calculation**: $\Delta p = p_{\text{Lugano}} - p_{\text{Kloten}}$ (reduced to sea level QNH).
     - $\Delta p \ge +4.0\text{ hPa}$: Moderate South Föhn (*Mässiger Südföhn*)
     - $\Delta p \ge +8.0\text{ hPa}$: Severe South Föhn (*Starker Südföhn – Lebensgefahr*)
     - $\Delta p \le -4.0\text{ hPa}$: Moderate North Föhn (*Mässiger Nordföhn / Tessin*)
     - $\Delta p \le -8.0\text{ hPa}$: Severe North Föhn (*Starker Nordföhn*)
2. **East-West Pressure Gradient (`GVE_GUT`)** – `PRESSURE_EAST_WEST` (midpoint 0.5):
   - **West**: Geneva / Cointrin (`meteo_swiss:GVE`, 411m AMSL)
   - **East**: Güttingen / Gütsch (`meteo_swiss:GUT`, 440m AMSL)
   - **Calculation**: $\Delta p = p_{\text{Geneva}} - p_{\text{Güttingen}}$ (Bise / Westwind gradient indicator).
3. **Alpine Crest Temperature Transect (`PIL_MTR`)** – `TEMPERATURE_NORTH_SOUTH` (midpoint 0.4):
   - **North**: Pilatus (`meteo_swiss:PIL`, 2105m AMSL)
   - **South**: Matro (`meteo_swiss:MTR`, 2171m AMSL)
   - **Calculation**: $\Delta T = T_{\text{Pilatus}} - T_{\text{Matro}}$ in °C (thermal inversion / alpine ridge stability).
4. **Jura Transect (`DEM_GRE`)** – `PRESSURE_NORTH_SOUTH` (midpoint 0.5):
   - **North**: Delémont (`meteo_swiss:DEM`, 439m AMSL)
   - **South**: Grenchen (`meteo_swiss:GRE`, 428m AMSL)
   - **Calculation**: $\Delta p = p_{\text{Grenchen}} - p_{\text{Delémont}}$ in hPa (cross-Jura pressure gradient).

### Live Map Meteo Modes (`LiveMapMeteoType`)
The official application organizes real-time meteo into 5 distinct modes (`LiveMapMeteoType`):
- `WIND`: Displays station wind vectors with direction arrows, speed, and gust tags colored by wind intensity.
- `TEMPERATURE`: Displays thermal gradient overlay with temperature badges (°C) mapped to cold-to-hot chromatic palettes.
- `PRESSURE_DIFFERENCE`: Renders the 4 official transect vectors across Switzerland with dynamic $\Delta p$ / $\Delta T$ mid-point badges.
- `WEBCAM`: Displays alpine live webcams from `webcam-prod.ubmeteo.io/v1/webcams/overview` with high-resolution imagery and timelapses.
- `NONE`: Meteo overlay deactivated.

### Member Data Model & LocalizedString Serialization
The SHV WMS API (`v1/wms/person`) and Kotlin models use specialized naming conventions and localized object structures:
- **Pilot Names**: `vorname` holds the pilot's first name, while `name` holds the pilot's last name. The web layer (`ProfileView.js`) combines both (`vorname + ' ' + name`) to prevent missing first names.
- **`LocalizedString` Model (`q64`)**: Multilingual strings are delivered as serialized objects:
  ```json
  { "de": "Aktivmitglied", "fr": "Membre actif", "it": "Membro attivo", "en": "Active member" }
  ```
  Ktor/kotlinx serialized properties map to `{ a: de, b: fr, c: it, d: en }`.
- **Nested Objects**: Membership categories (`mitgliedkategorie.name`), insurance descriptions (`insurance.beschreibung`, `insurance.name`), and brevet categories are resolved dynamically using `resolveLocalizedString(val, lang)` to eliminate `[object Object]` stringification bugs across all views.
- **Card Levels**: Brevets (`ShvBrevet` `b`) store ratings in `cardLevels` (`ShvCardLevel` `c`: `level`, `date`, `remarks`).

### Text Forecasts, Soaring Prognoses & Synoptic Weather Charts
The application integrates official MeteoSchweiz and SHV daily text prognoses directly from Verband infrastructure (`v1/text/forecast/{lang}.json`):
- **Regional Forecast (`forecast`)**: 3 regional text forecasts with multi-day outlooks (Heute, Morgen, Übermorgen & Trend):
  - Key `'0'`: **Deutschschweiz, Nord- und Mittelbünden** (Suisse alémanique / Svizzera tedesca)
  - Key `'1'`: **Alpensüdseite und das Engadin** (Sud des Alpes / Sud delle Alpi)
  - Key `'2'`: **Westschweiz und das Wallis** (Suisse romande / Svizzera romanda)
- **Gleitschirmprognose (`gleitschirmForecast`)**: Official Paragliding text prognosis covering thermal activity, convection, wind shear, cloud base, and alpine safety warnings.
- **Segelflugprognose (`segelflugForecast`)**: Official MeteoSchweiz Soaring briefing detailing inversion levels, thermal strengths, high-altitude winds, and convection triggers.
- **Allgemeine Lage (`generalForecast`)**: Synoptic overview across Central Europe.
- **Isobar Charts**: `https://shv-app-ws-prod.shv-app.ch/v1/text/isobaren/{lang}.svg` (Synoptic European surface pressure field and fronts).
- **Timeseries Telemetry**: `https://weather-ws-prod.ubmeteo.io/v1/measurements/timeseries/{stationId}?parameters=...` (24-hour recorded historical telemetry).

### Meteo-Aussichten (Outlooks / Days Overview)
Reversed from `ShvAggregatedForecastType` and `https://static-prod.ubmeteo.io/v1/animation/switzerland/days_overview.json`:
- **`RELATIVE_SUNSHINE`**: 6-hour interval raster forecast animations (`.webp`) displaying relative sunshine duration across Switzerland (0% - 100%).
- **`PRECIPITATION_PROBABILITY_WEAK`**: 12-hour interval raster animations mapping light precipitation probability (>0.1 mm / 12h).
- **`PRECIPITATION_PROBABILITY_STRONG`**: 12-hour interval raster animations mapping heavy precipitation probability (>1.0 mm / 12h).
- Interactive timeline stepper, time range labels, and play/pause animation cycle.

### Previtemps Sounding Stations & Thermodynamic Emagram Engine
Reversed from `fl5.java` and `ch.ubique.fluidsdk.reports.common.models.b`:
- **107 Sounding Locations**: Extracted with exact geographic coordinates and elevations covering the entire Swiss Alpine space (Payerne, Engelberg, Interlaken, Fiesch, Davos, Scuol, Zermatt, Chur, Zürich, Sion, etc.).
- **Interactive Map**: Leaflet sounding map allowing pilots to select any station or search by name.
- **Thermodynamic Calculation Engine (`server/emagram_calc.py`)**:
  - Calculates Lifting Condensation Level (LCL / Wolkenbasis) using Bolton 1980 equations.
  - Detects atmospheric inversions and capping barriers.
  - Calculates Convective Trigger Temperature (Auslösetemperatur).
  - Computes dry & moist adiabatic parcel ascent curve (DALR / MALR).
  - Determines thermal ceiling (Thermik-Obergrenze), usable depth, and average climb rates ($w_{\text{avg}}$ in m/s).
  - Provides vertical winds aloft profiles (1000m to 5000m).
  - Features an interactive surface temperature slider to simulate daytime heating and live recomputation of cloud base and thermals.

### Unified Map Controls Architecture
All map controls are consolidated into a **single, unified control drawer** (`#map-layers-drawer`):
1. **Live-Wetter (Meteo-Overlays)**: Mode switcher for Wind & Böen, Temperatur, Föhn / Δp, Webcams, or Aus.
2. **Fluggebiete & Lufträume**: Toggle switches for Startplätze (Take-offs), Landeplätze (Landings), Luftraum (CTR/TMA/Segelflug), and Wildruhezonen (300m AGL).
3. **Startplatz-Windfilter (Compass Rose)**: Interactive 8-direction compass selector to filter launch sites according to flyable wind directions, with a one-click reset button.
4. **Basiskarte (Swisstopo & Maps)**: Swisstopo Pixelkarte, Swisstopo Luftbild (Swissimage), Swisstopo Grau, and OpenStreetMap.

The top floating bar is dedicated exclusively to the location/site search bar and active filter indicators, preventing any controls fragmentation or duplicate UI elements. Leaflet is absolutely positioned within the map container to guarantee 100% viewport coverage.

---

## 6. Web Architecture & Implementation

The web version reproduces the native mobile application inside modern web browsers with zero third-party framework overhead:

```
ai-shv-app/
├── server/
│   ├── index.js          # Express backend API (Port 3001)
│   ├── auth.js           # PKCE generation, Keycloak exchange, session store
│   ├── emagram_calc.py   # Python thermodynamic equations engine (DALR, MALR, LCL, CAPE)
│   └── start-dev.js      # Unified daemon runner (API + Vite hot-reload)
├── src/
│   ├── main.js           # App entrypoint, global error trap, tab switching
│   ├── state.js          # Reactive AppState store, localStorage persistence
│   ├── services/
│   │   ├── api.js        # Data client (ShvApi: GIS, meteo, auth)
│   │   └── varioAudio.js # Acoustic variometer simulator (Web Audio API VCO)
│   ├── views/
│   │   ├── MapView.js    # Interactive Leaflet map, Swisstopo WMTS, compass dial
│   │   ├── WeatherView.js# Live station grid, Gotthard Föhn delta chart
│   │   ├── ForecastView.js# Flugwetter forecast & member blocker
│   │   ├── SafetyView.js # 5-Punkte-Check, SOS Rega 1414, DABS, logbook
│   │   └── ProfileView.js# Digital license card, Brevets, OIDC login bridge
│   └── styles/
│       └── main.css      # Responsive CSS, dark mode, Swiss aviation theme
```

### Option A Authentication Bridge (Web Copy-Paste Flow)
Because modern browser security policies (Same-Origin Policy) prevent localhost from listening to the registered mobile redirect domain (`prod.shv-app.ch`), the web app implements **Option A**:
1. `/api/auth/start`: Express server generates cryptographic PKCE verifier, SHA-256 challenge, and unique state.
2. The user is directed to the official SHV Keycloak web login in a new tab.
3. Upon login, Keycloak redirects to `https://prod.shv-app.ch/oidc/callback?code=...&state=...`, displaying the official confirmation page.
4. The user pastes the URL into the app.
5. `/api/auth/exchange`: Server verifies `state`, exchanges authorization code with Keycloak using `code_verifier`, retrieves the pilot profile from `shv-app-ws-prod.shv-app.ch/v1/wms/person`, and returns a session token.

---

## 7. Zero Fake Data Policy

The application strictly adheres to the **Zero Fake Data Policy**:
- **No Mock Profiles**: Never generate dummy names, placeholder pilot ratings, or fabricated insurance amounts.
- **Member Areas**: If unauthenticated, sections requiring membership cleanly display the official *"Nur für Mitglieder"* notice with links to official login.
- **Genuine Telemetry Only**: Historical charts and measurements reflect only real recorded station observations; mathematical mock sine waves or simulated weather values are prohibited.
- **Credential Protection**: Passwords are never accepted or stored by the web application; all authentication occurs directly on official Keycloak infrastructure.
