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

### Telemetry Units & Data Normalization Standards
Ubique Fluid Meteo Services (`weather-ws-prod.ubmeteo.io`) delivers real-time weather observations with specific unit standards verified against the Android APK decompression (`apk_analysis/unpacked/assets/map/layers/measurement_wind/style.json`):
- **Wind Speed (`windSpeedValue`) & Gusts (`windGustValue`)**: Values are natively in **km/h** (not m/s). Do **not** multiply by 3.6. Multiplying causes massive over-reporting (e.g. Uetliberg 40.3 km/h showing as 145 km/h).
- **Temperatures (`temperatureValue`, `temperature2mValue`, `dewPoint2mValue`)**: If raw value $> 200$, it is expressed in Kelvin and must be converted via $T(^\circ\text{C}) = T(\text{K}) - 273.15$. Values $\le 200$ are natively in Celsius.
- **Atmospheric Pressure (`pressureMslValue`, `pressureStandardMslValue`)**: Scaled in raw tenths or Pa in some sensors. If raw value $> 5000$, divide by 10 to obtain standard hectopascals (hPa / QNH).

### Flying Sites GeoJSON & Fee Rules
The official flying sites GeoJSON (`shv-app-static.ubmeteo.io/v1/shv_app/geodata/flyingsites.geojson`) contains primary site points and auxiliary geometry (areas, landing patterns):
- **Feature Filtering**: Primary point markers must match `type === 'launch'` (358 launch sites) or `type === 'landing'` (199 landing sites). Auxiliary polygon features (`launcharea`, `landingarea`, `landingpattern`) frequently lack `siteName` and must not produce duplicate `"Unbenannter Flugplatz"` pins. An index `flyingSitesById` maps any auxiliary entity back to its parent metadata.
- **Start- und Landegebühr (Fees & Digital Payments)**: Landing sites such as *Unterleimbach* or *Balderen* specify mandatory pilot site fees:
  - `fees`: Detailed textual fee regulations and local club tariffs.
  - `feePaymentLink`: Official RaiseNow / club web payment link.
  - `feeQrCodeUrl`: Dynamic Twint QR-Code for mobile payment integration rendered directly within the site bottom sheet.

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
- **In-place DOM Animation Engine**: Step and play updates modify image source, time interval label, step indicators, and range slider directly in-place without triggering full view re-renders, preventing scroll resets. Next frames are pre-cached in memory for seamless playback.

### Previtemps Sounding Stations & Genuine MeteoSwiss ICON-CH1 Emagram
Reversed from `fl5.java`, `sl2.java`, `xh7.java`, `ki4.java`, and `u62.java`:
- **107 Sounding Locations**: Extracted with exact geographic coordinates and elevations covering the entire Swiss Alpine space (Interlaken, Engelberg, Payerne, Fiesch, Davos, Scuol, Zermatt, Chur, Zürich, Sion, etc.).
- **Keyless High-Resolution Map**: Leaflet sounding map powered by official Swisstopo Pixelkarte WMTS (`ch.swisstopo.pixelkarte-farbe`), eliminating external CartoDB dependencies and "API KEY REQUIRED" errors.
- **EPSG:4326 Grid Tile Resolution (`xh7.java`)**:
  - Zoom 10 tile coordinates derived via:
    $x = \lfloor (180.0 + \text{lon}) / 0.3515625 \rfloor$, $y = \lfloor (90.0 - \text{lat}) / 0.17578125 \rfloor$.
  - Grid definition fetched from `https://static-prod.ubmeteo.io/v1/products/grid/10/{x}/{y}.json`.
  - Maps any station to the nearest `meteo_swiss:icon_ch1` or `meteo_swiss:icon_ch2` model grid point.
- **Hourly Point-Data Sounding Engine (`server/emagram_provider.js`)**:
  - Latest model run fetched from `https://weather-ws-prod.ubmeteo.io/v1/point-data/meteo_swiss:icon_ch1/runs`.
  - Multi-level atmospheric profiles fetched across 34 hourly timesteps:
    `temperature`, `pressure`, `specific_humidity`, `height_half_level`, `wind_u`, `wind_v`.
  - Dew point derived via Magnus-Tetens from vapor pressure $e = \frac{q \cdot p}{0.622 + 0.378 \cdot q}$.
  - Wind speed ($km/h$) and direction ($0^\circ-360^\circ$) computed from vector components $u, v$.
- **Android Native Visual Parity**:
  - **Lapse Rate Color Scale**: Temperature curve segmented and dynamically colored by vertical temperature lapse rate $\Gamma = -\frac{dT}{dz} \times 100$ (°C / 100m):
    - Yellow ($\ge 0.0$ °C/100m, Inversion layer)
    - Light Green ($-0.3$ to $0.0$ °C/100m, Weak lapse)
    - Green ($-0.6$ to $-0.3$ °C/100m, Normal lapse / good thermals)
    - Cyan/Blue ($-0.8$ to $-0.6$ °C/100m, Moderate instability)
    - Red ($-1.0$ to $-0.8$ °C/100m, Strong thermals / near DALR)
    - Purple ($< -1.0$ °C/100m, Superadiabatic)
  - **Dashed Dew Point Curve**: Plotted alongside environmental temperature.
  - **Right Column Wind Vector & Speed Profile**: Dedicated wind barb column and $0-45$ km/h wind speed line.
  - **Interactive Time Selector Bar**: Horizontal timeline with hour marks, current time indicator, stepper controls (`<<` / `>>`), and play button for smooth animation across the forecast day.

### Unified Map Controls & Native Android Segmented Drawer Architecture
In accordance with `Screenshot_20261022-164845.png` and decompiled bytecode (`LiveMapCategory.java`, `d.java`, `g34.java`), map controls are organized into a docked bottom drawer (`.map-bottom-drawer`) with a 3-tab segmented category selector:
1. **`Weather` (`METEO`)**: Live weather overlays (`Wind & Böen`, `Temperatur`, `Föhn / Δp`, `Webcams`, `Keine`).
2. **`Airspace` (`AIRSPACE`)**:
   - **Base map**: Swisstopo Light Base Map (`topoLight` / `ch.swisstopo.pixelkarte-grau`), Pixelkarte (`topoColor`), Luftbild (`topoSatellite`), OpenStreetMap (`topoOsm`).
   - **Luftraum & Hindernisse**:
     - `Luftfahrthindernisse BAZL` (checked by default).
     - `Luftraum (CTR, TMA, Segelflug)` (checked by default).
     - `Wildschutz & Jagdbanngebiete` (checked by default).
   - **Floating DABS Button**: Floating pill (`DABS ↗`) linking directly to official Skybriefing DABS (`https://www.skybriefing.com/de/dabs`).
3. **`Flying sites` (`FLYING_AREAS`)**:
   - `Startplätze (Take-offs)` and `Landeplätze (Landings)` toggles.
   - 8-direction wind compass rose filter with reset button.

### BAZL Aviation Obstacles (`Luftfahrthindernisse`)
Reversed from `apk_analysis/unpacked/assets/map/layers/bazl_obstacles/style.json`, `b20.java`, `n10.java`, and `n20.java`:
- **Data Source & CDN Endpoints**:
  - Complete Swiss GeoJSON dataset: `https://shv-app-static-prod.ubmeteo.io/v1/obstacles/bazl.geojson` (225,389 authentic features).
  - Production vector tile CDN: `https://shv-app-static-prod.ubmeteo.io/v1/obstacles/tiles/bazl/{z}/{x}/{y}.pbf` (levels 6, 9, 12).
- **Spatial Grid Indexing & LOD Engine (`server/obstacles_provider.js`)**:
  - Caches authentic GeoJSON to local disk with 24-hour TTL and builds a 0.1° spatial binning index ($~7 \times 11$ km cells) in ~45 ms.
  - Viewport bounding-box queries execute in sub-millisecond time ($<0.5$ ms).
  - Strict zoom LOD filtering adhering to native `style.json`:
    - `z >= 6`: Regional lines (`TRANSMISSION_LINE`, `CABLE_CAR`, `BRIDGE`, `CATENARY`) and hazard polygons.
    - `z >= 8`: Structural point symbols (masts, antennas, cranes, tree groups, buildings, windmills).
    - `z >= 13`: Cable pylon endpoint markers (circular dots along transmission lines and triangles for marked catenaries).
- **Styling Parity with Native App**:
  - Transmission lines colored `#0054FF` (blue) or `#CC0000` (red if marked), with line width scaling from 1.5 to 5.0.
  - Endpoints rendered as red dots (`red_circle.svg`) or triangles (`triangle.svg`).
  - Point obstacles rendered using authentic SVG symbols (`ms_pole.svg`, `ms_tree_group.svg`, `ms_crane.svg`, `ms_building.svg`, `ms_windmill.svg`).
- **Obstacle Details Bottom Sheet (`BottomSheet.js`)**:
  - Displays obstacle type in German (`Freileitung`, `Baukran`, `Mast`, `Baumgruppe`, `Seilbahn`, etc.).
  - Technical metrics: `Maximale Höhe (AGL)` in meters, `Maximale Höhe (AMSL)` in meters ü. M., `Gesamtlänge`, `Radius`, `Flugplatz` code (if within aerodrome zone).
  - Official markings (`Markierung: Markiert / Keine`), lighting status (`Beleuchtung: Beleuchtet / Keine`), sanction decree notice (`Verfügung`), and effective date (`Inkrafttretensdatum`).
  - Direct navigation link to Apple/Google Maps and Skybriefing DABS consultation.

---

## 6. Data Query Architecture: Direct Frontend vs. Backend Proxy Pipeline

To ensure 60 FPS map panning, instant layer toggles, and rock-solid reliability without triggering browser security violations (CORS) or freezing the client thread with multi-megabyte payloads, network queries are partitioned into **Direct Frontend Queries** and an **Intelligent Backend Proxy Pipeline**:

```
                       +---------------------------------------+
                       |           Browser Frontend            |
                       +---------------------------------------+
                                  /                 \
                    [Direct Query]                   [Proxied Query]
                    CORS allowed                      CORS restricted OR
                    Static & light                    Heavy calculation OR
                    CDN tile caches                   Enormous GIS dataset OR
                                  /                   OAuth2 secrets / PKCE
                                 v                             v
                   +--------------------+             +------------------+
                   | External Providers |             | Node Backend API |
                   | (Swisstopo, OSM,   |             | (Express / Node) |
                   |  Static CDN files) |             +------------------+
                   +--------------------+                      |
                                                         [Processing]
                                                         - Spatial indexing (0.1°)
                                                         - Physics & lapse rates
                                                         - CORS negotiation
                                                         - Multi-station deltas
                                                         - Memory/disk caching
                                                               |
                                                               v
                                                      +--------------------+
                                                      | Upstream APIs      |
                                                      | (Keycloak, BAZL,   |
                                                      |  MeteoSwiss ICON,  |
                                                      |  Ubique WS)        |
                                                      +--------------------+
```

### 6.1 Architectural Principles for Route Placement

1. **Direct Frontend Queries** are used exclusively when the upstream endpoint:
   - Emits permissive public CORS headers (`Access-Control-Allow-Origin: *`).
   - Serves pre-tiled, highly cacheable image assets (WMTS raster/satellite tiles, pre-rendered animation frames).
   - Is lightweight enough to be ingested directly without degrading browser rendering performance.
2. **Backend Proxy Routing & Processing** is mandatory when any of the following apply:
   - **Cross-Origin Resource Sharing (CORS)**: Upstream APIs do not permit browser-origin requests.
   - **Enormous Spatial Payloads**: GIS datasets (such as BAZL Obstacles with 225,000+ features and 122 MB uncompressed data) would choke browser DOM and Leaflet canvas rendering. The backend performs spatial binning and zoom Level of Detail (LOD) filtering.
   - **Multi-Step Mathematical & Meteorological Modeling**: Sounding emagram profiles require resolving nearest EPSG:4326 model grid points, querying multi-level runs, and computing vertical lapse rates, dew points via Magnus-Tetens, and wind vectors.
   - **Station Telemetry Pair Calculations**: Föhn and pressure gradient vectors require cross-referencing multiple live weather stations (`KLO_LUG`, `GVE_GUT`, etc.), reducing pressures to QNH, and calculating delta values that upstream does not provide as a consolidated endpoint.
   - **OAuth2 / OIDC Security**: PKCE code verifier storage, Keycloak secret exchanges, and session token persistence.

---

### 6.2 Comprehensive Data Flow Matrix

| Data Endpoint / Resource | Upstream Source / Origin | Query Path | Why Proxied? / Why Direct? | Backend Processing & Transformation Performed |
| :--- | :--- | :--- | :--- | :--- |
| **Swisstopo Pixelkarte (Farbe)** | `wmts.geo.admin.ch/1.0.0/ch.swisstopo.pixelkarte-farbe/...` | **Direct** | Official public WMTS tile cache; CORS enabled; pre-rendered EPSG:3857 tiles. | None (Browser directly renders image tiles via Leaflet). |
| **Swisstopo Swissimage (Luftbild)** | `wmts.geo.admin.ch/1.0.0/ch.swisstopo.swissimage/...` | **Direct** | Official public satellite orthophoto cache; CORS enabled. | None. |
| **Swisstopo Pixelkarte-Grau (Light Base Map)** | `wmts.geo.admin.ch/1.0.0/ch.swisstopo.pixelkarte-grau/...` | **Direct** | Official public greyscale topographic map; CORS enabled. | None. |
| **OpenStreetMap Tiles** | `*.tile.openstreetmap.org/{z}/{x}/{y}.png` | **Direct** | Public OpenStreetMap tile servers with CORS. | None. |
| **Flying Sites (`flyingsites.geojson`)** | `shv-app-static-prod.ubmeteo.io/v1/flyingsites.geojson` (with `/data/` fallback) | **Direct** | 1,341 features (~450 KB); small enough for browser memory; CORS enabled. | Pre-packaged locally in `public/data/`, fallback to live CDN. |
| **Airspaces (`airspaces.geojson`)** | `shv-app-static-prod.ubmeteo.io/v1/airspaces/shv.geojson` (with `/data/` fallback) | **Direct** | 353 airspace polygons (~600 KB); fast Leaflet GeoJSON layer; CORS enabled. | Pre-packaged locally in `public/data/`, fallback to live CDN. |
| **Wildlife Reserves (`wildschutz.geojson`)** | `shv-app-static-prod.ubmeteo.io/v1/wildschutz/shv.geojson` (with `/data/` fallback) | **Direct** | 51 reserve polygons (~250 KB); small payload; CORS enabled. | Pre-packaged locally in `public/data/`, fallback to live CDN. |
| **Days Overview Animation Frames** | `static-prod.ubmeteo.io/v1/animation/switzerland/days_overview/...` | **Direct** | Pre-rendered WebP raster frames; CORS enabled; pre-cached by browser `Image()`. | None. |
| **BAZL Aviation Obstacles BBox (`/api/obstacles`)** | `shv-app-static-prod.ubmeteo.io/v1/obstacles/bazl.geojson` | **Proxied** | **Critical Performance**: Upstream dataset is 122 MB (225,389 features). Loading into browser freezes Leaflet. | 1. 24h disk caching of 122MB dataset.<br/>2. In-memory $0.1^\circ$ spatial grid index (~45 ms build).<br/>3. Sub-millisecond ($<0.5$ ms) bounding-box queries.<br/>4. Multi-tier zoom LOD filtering (z6 lines, z8 symbols, z13 pylon dots). |
| **BAZL Vector Tiles (`/api/obstacles/tiles/...`)** | `shv-app-static-prod.ubmeteo.io/v1/obstacles/tiles/bazl/{z}/{x}/{y}.pbf` | **Proxied** | Caching, connection pooling, and resilient local fallback. | Local file caching (`server/cache/tile_*.pbf`), protobuf MIME negotiation (`application/x-protobuf`). |
| **Live Ground Stations (`/api/measurements`)** | `weather-ws-prod.ubmeteo.io/v1/measurements` | **Proxied** | Browser CORS restrictions on `weather-ws-prod`; rate limiting protection. | 1. In-memory 60s TTL caching.<br/>2. Normalizes wind speed/gust to km/h.<br/>3. Converts temperatures Kelvin -> °C.<br/>4. Formats station properties for Leaflet marker clustering. |
| **Alpine Webcams (`/api/webcams`)** | `webcam-prod.ubmeteo.io/v1/webcams` | **Proxied** | Browser CORS restrictions on `webcam-prod`; heavy JSON payload. | 1. In-memory 120s TTL caching.<br/>2. Resolves Panomax/Roundshot thumbnail and HD URLs.<br/>3. Filters out broken or inactive webcams outside Switzerland. |
| **Föhn Transects (`/api/foehn`)** | `weather-ws-prod.ubmeteo.io/v1/measurements` | **Proxied** | **Custom Meteorological Synthesis**: Upstream provides raw station data, but no pre-calculated transects. | 1. Extracts station pairs (`KLO_LUG`, `GVE_GUT`, `PIL_MTR`, `DEM_GRE`).<br/>2. Calculates sea-level reduced pressure differences ($\Delta p$).<br/>3. Calculates alpine temperature differences ($\Delta T$).<br/>4. Categorizes danger thresholds (Moderate/Severe Föhn).<br/>5. Synthesizes GeoJSON midpoint linestrings for map overlay. |
| **Text Forecasts (`/api/meteo/text-forecast/:lang`)** | `shv-app-ws-prod.shv-app.ch/v1/text/forecast/{lang}.json` | **Proxied** | Browser CORS restrictions on `shv-app-ws-prod`. | 1. Multi-tier forecast aggregation (Regional, Paragliding, Soaring, Synoptic).<br/>2. 15-minute memory caching.<br/>3. Stale-while-revalidate fallback resilience. |
| **Synoptic Surface Isobars (`/api/meteo/isobaren/:lang`)** | `shv-app-ws-prod.shv-app.ch/v1/text/isobaren/{lang}.svg` | **Proxied** | Browser CORS restrictions on `shv-app-ws-prod`. | 1. SVG payload sanitization and MIME header negotiation.<br/>2. 1-hour memory caching. |
| **Station Telemetry Timeseries (`/api/measurements/timeseries/:id`)** | `weather-ws-prod.ubmeteo.io/v1/measurements/timeseries/{id}` | **Proxied** | Browser CORS restrictions; complex query parameter formatting. | 1. Injects required telemetry parameters (`wind_speed,wind_gust_peak,wind_direction,temperature,pressure_standard_msl`).<br/>2. Normalizes timestamps and units.<br/>3. 5-minute memory caching. |
| **Days Overview Metadata (`/api/meteo/outlooks`)** | `static-prod.ubmeteo.io/v1/animation/switzerland/days_overview.json` | **Proxied** | Prevents intermittent upstream 503/timeout red boxes on client. | 1. Extended 30-minute cache TTL with stale-while-revalidate.<br/>2. Guarantees 100% uptime for animation sequence definitions. |
| **Previtemps Station Catalog (`/api/meteo/previtemps/stations`)** | Decompiled APK station database (`fl5.java`, `sl2.java`) | **Proxied (Internal)** | Static embedded catalog of 107 Swiss sounding stations. | Formats station identifiers, elevations, and geographic coordinates into clean JSON API response. |
| **MeteoSwiss ICON-CH1 Sounding (`/api/emagram/sounding`, `/api/meteo/previtemps/forecast`)** | `static-prod.ubmeteo.io/v1/products/grid/10/{x}/{y}.json` & `weather-ws-prod.ubmeteo.io/v1/point-data/meteo_swiss:icon_ch1/...` | **Proxied** | **Heavy Multi-Step Science Pipeline**: Multiple upstream API calls, grid math, and thermodynamic profiling. | 1. Reversed zoom-10 grid math ($x, y$).<br/>2. Resolves nearest ICON-CH1 model point.<br/>3. Fetches 34 hourly timesteps of multi-level atmospheric variables.<br/>4. Magnus-Tetens dew point calculation ($T_d$).<br/>5. Wind vector math ($u, v \rightarrow$ speed & dir).<br/>6. Layer-by-layer lapse rate calculation ($\Gamma = -dT/dz \times 100$ °C/100m) for stability color bands. |
| **Skybriefing DABS (`/api/dabs`)** | Official Skybriefing portal metadata | **Proxied (Internal)** | Dynamic daily bulletin metadata and Swiss legal consultation notices. | Generates current date-stamped URLs for daily bulletin PDF and Skybriefing portal with pilot legal advisory text. |
| **Authentication Flow (`/api/auth/*`)** | `login.shv-fsvl.ch` (Keycloak OIDC) & `shv-app-ws-prod.shv-app.ch/v1/wms/person` | **Proxied** | **OAuth2 Security & Credentials**: PKCE state verification, token exchange, and authenticated member queries. | 1. Cryptographic PKCE code verifier and challenge generation (`S256`).<br/>2. Exchanges authorization code for JWT bearer tokens.<br/>3. Queries authenticated person registry (`/v1/wms/person`).<br/>4. Extracts pilot Brevets, IPPI card ratings, passenger permits, and insurance policies into secure local sessions. |

---

## 7. Web Architecture & Implementation

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

## 8. Zero Fake Data Policy

The application strictly adheres to the **Zero Fake Data Policy**:
- **No Mock Profiles**: Never generate dummy names, placeholder pilot ratings, or fabricated insurance amounts.
- **Member Areas**: If unauthenticated, sections requiring membership cleanly display the official *"Nur für Mitglieder"* notice with links to official login.
- **Genuine Telemetry Only**: Historical charts and measurements reflect only real recorded station observations; mathematical mock sine waves or simulated weather values are prohibited.
- **Credential Protection**: Passwords are never accepted or stored by the web application; all authentication occurs directly on official Keycloak infrastructure.
