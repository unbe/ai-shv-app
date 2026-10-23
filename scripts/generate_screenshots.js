import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function captureAll() {
  console.log('Connecting to Chrome on host via ws://127.0.0.1:9222/devtools/browser ...');
  const browser = await puppeteer.connect({
    browserWSEndpoint: 'ws://127.0.0.1:9222/devtools/browser',
    defaultViewport: { width: 1440, height: 900, deviceScaleFactor: 2 }
  });

  const pages = await browser.pages();
  const page = pages.find(p => p.url().includes('localhost:3000'));
  if (!page) {
    throw new Error('SHV app page (localhost:3000) not found in browser!');
  }

  await page.bringToFront();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
  
  // Reload page to start with a pristine state
  console.log('Reloading page for fresh state...');
  await page.reload({ waitUntil: 'networkidle2' });
  await sleep(1500);

  // Helper to completely clear all popups, drawers, and bottom sheets
  const clearAllOverlays = async () => {
    await page.evaluate(() => {
      // 1. Close Leaflet popups
      const mapEl = document.querySelector('.leaflet-container');
      if (mapEl && mapEl._leaflet_map) {
        mapEl._leaflet_map.closePopup();
      }
      // 2. Close layer drawer
      const drawer = document.getElementById('map-layers-drawer');
      if (drawer) drawer.classList.add('hidden');
      const btnLayers = document.getElementById('btn-fab-layers');
      if (btnLayers) btnLayers.classList.remove('active');

      // 3. Clear store selections that trigger bottom sheets
      if (window.appStore && window.appStore.state) {
        window.appStore.state.selectedSite = null;
        window.appStore.state.selectedStation = null;
        window.appStore.state.selectedWebcam = null;
        window.appStore.state.selectedObstacle = null;
        window.appStore.notify();
      }
      const sheet = document.getElementById('bottom-sheet-container');
      if (sheet) {
        sheet.classList.add('hidden');
        sheet.innerHTML = '';
      }
      // 4. Close any modal backdrops
      document.querySelectorAll('.modal-overlay, .modal-backdrop').forEach(m => m.remove());
    });
    await sleep(400);
  };

  // Helper to set map position
  const setMapView = async (lat, lng, zoom) => {
    await page.evaluate(({ lat, lng, zoom }) => {
      const mapEl = document.querySelector('.leaflet-container');
      if (mapEl && mapEl._leaflet_map) {
        mapEl._leaflet_map.setView([lat, lng], zoom, { animate: false });
      }
    }, { lat, lng, zoom });
    await sleep(1200);
  };

  // ==========================================
  // 1. FLUGGEBIETE OVERVIEW (Clean Map)
  // ==========================================
  console.log('1. Capturing Clean Fluggebiete Overview...');
  await clearAllOverlays();
  await page.evaluate(() => {
    if (window.appStore) {
      window.appStore.setTab('map');
      window.appStore.setMapCategory('FLYING_AREAS');
    }
  });
  await setMapView(46.818, 8.227, 9);
  await sleep(1000);
  await page.screenshot({ path: '01_fluggebiete_overview.png' });
  console.log('-> Saved 01_fluggebiete_overview.png');

  // ==========================================
  // 2. STARTPLATZ DETAIL & POPUP
  // ==========================================
  console.log('2. Capturing Startplatz Detail with Direction Pointers...');
  await clearAllOverlays();
  // Zoom to Interlaken / Jungfrau flying region
  await setMapView(46.685, 7.865, 13);
  await sleep(800);
  // Open popup on a launch site marker
  await page.evaluate(() => {
    const launchMarker = document.querySelector('.launch-marker');
    if (launchMarker) launchMarker.click();
  });
  await sleep(800);
  await page.screenshot({ path: '02_fluggebiete_startplatz_detail.png' });
  console.log('-> Saved 02_fluggebiete_startplatz_detail.png');

  // ==========================================
  // 3. LANDEVOLTE (Landing Circuit)
  // ==========================================
  console.log('3. Capturing Landevolte Circuit...');
  await clearAllOverlays();
  await setMapView(46.682, 7.855, 14);
  await sleep(800);
  // Click on the Landevolte approach pin
  await page.evaluate(() => {
    const voltePin = document.querySelector('.volte-arrow-pin');
    if (voltePin) voltePin.click();
  });
  await sleep(800);
  await page.screenshot({ path: '03_landevolte_circuit_detail.png' });
  console.log('-> Saved 03_landevolte_circuit_detail.png');

  // ==========================================
  // 4. KARTEN-EBENEN DRAWER (Layer Controls)
  // ==========================================
  console.log('4. Capturing Layer Controls Drawer...');
  await clearAllOverlays();
  await setMapView(46.818, 8.227, 9);
  await sleep(600);
  // Open drawer explicitly
  await page.evaluate(() => {
    const drawer = document.getElementById('map-layers-drawer');
    if (drawer) drawer.classList.remove('hidden');
    const btnLayers = document.getElementById('btn-fab-layers');
    if (btnLayers) btnLayers.classList.add('active');
  });
  await sleep(800);
  await page.screenshot({ path: '04_karten_ebenen_drawer.png' });
  console.log('-> Saved 04_karten_ebenen_drawer.png');

  // ==========================================
  // 5. SWISSTOPO SATELLIT / ORTHOPHOTO
  // ==========================================
  console.log('5. Capturing Clean Swisstopo Satellite View...');
  await clearAllOverlays();
  await page.evaluate(() => {
    if (window.appStore) {
      window.appStore.setBaseMap('topoSatellite');
    }
  });
  await setMapView(46.57, 7.95, 11); // Over Jungfrau / Eiger / Grindelwald
  await sleep(1500);
  await page.screenshot({ path: '05_swisstopo_satellit_ortho.png' });
  console.log('-> Saved 05_swisstopo_satellit_ortho.png');

  // Reset basemap back to standard topo
  await page.evaluate(() => {
    if (window.appStore) window.appStore.setBaseMap('topoLight');
  });
  await sleep(600);

  // ==========================================
  // 6. HINDERNISSE & LUFTRÄUME
  // ==========================================
  console.log('6. Capturing Hindernisse & Lufträume (Airspaces & Obstacles)...');
  await clearAllOverlays();
  await page.evaluate(() => {
    if (window.appStore) {
      window.appStore.setMapCategory('AIRSPACE');
      window.appStore.state.layers.obstacles = true;
      window.appStore.state.layers.airspace = true;
      window.appStore.state.layers.wildschutz = true;
      window.appStore.notify();
    }
  });
  await setMapView(46.9, 8.35, 10);
  await sleep(2000);
  // Click on an airspace or obstacle if present
  await page.evaluate(() => {
    const interactive = document.querySelector('.obstacle-casing, .leaflet-interactive');
    if (interactive) interactive.click();
  });
  await sleep(800);
  await page.screenshot({ path: '06_hindernisse_und_luftraeume.png' });
  console.log('-> Saved 06_hindernisse_und_luftraeume.png');

  // ==========================================
  // 7. WINDSTATIONEN (Schweiz & International)
  // ==========================================
  console.log('7. Capturing Clean Wind Stations (Swiss & Border Countries)...');
  await clearAllOverlays();
  await page.evaluate(() => {
    if (window.appStore) {
      window.appStore.setMapCategory('METEO');
      window.appStore.state.layers.stations = true;
      window.appStore.state.layers.launches = false;
      window.appStore.state.layers.landings = false;
      window.appStore.state.layers.landingPatterns = false;
      window.appStore.notify();
    }
  });
  await setMapView(46.6, 7.6, 9);
  await sleep(1800);
  await page.screenshot({ path: '07_windstationen_schweiz_international.png' });
  console.log('-> Saved 07_windstationen_schweiz_international.png');

  // ==========================================
  // 8. WINDSTATION DETAIL POPUP
  // ==========================================
  console.log('8. Capturing Wind Station Detail Popup...');
  await clearAllOverlays();
  await setMapView(46.68, 7.86, 11);
  await sleep(800);
  await page.evaluate(() => {
    const arrow = document.querySelector('.station-wind-arrow-box');
    if (arrow) arrow.click();
  });
  await sleep(800);
  await page.screenshot({ path: '08_windstation_messwerte_popup.png' });
  console.log('-> Saved 08_windstation_messwerte_popup.png');

  // ==========================================
  // 9. WETTER: DRUCKDIFFERENZ & FÖHN
  // ==========================================
  console.log('9. Capturing Clean Wetter Druckdifferenz & Föhn Chart...');
  await clearAllOverlays();
  await page.evaluate(() => {
    if (window.appStore) window.appStore.setTab('weather');
    window.scrollTo(0, 0);
  });
  await sleep(1500);
  await page.screenshot({ path: '09_wetter_druckdifferenz_foehn.png' });
  console.log('-> Saved 09_wetter_druckdifferenz_foehn.png');

  // ==========================================
  // 10. WETTER: MESSWERTE STATIONEN LISTE
  // ==========================================
  console.log('10. Capturing Messwerte Weather Stations List...');
  await clearAllOverlays();
  await page.evaluate(() => {
    const btn = document.getElementById('btn-tab-stations');
    if (btn) btn.click();
    window.scrollTo(0, 480);
  });
  await sleep(1000);
  await page.screenshot({ path: '10_wetter_messwerte_stationen.png' });
  console.log('-> Saved 10_wetter_messwerte_stationen.png');

  // ==========================================
  // 11. WETTER: WEBCAMS GALLERY
  // ==========================================
  console.log('11. Capturing Webcams Gallery...');
  await clearAllOverlays();
  await page.evaluate(() => {
    const btn = document.getElementById('btn-tab-webcams');
    if (btn) btn.click();
    window.scrollTo(0, 450);
  });
  await sleep(1500);
  await page.screenshot({ path: '11_wetter_webcams_uebersicht.png' });
  console.log('-> Saved 11_wetter_webcams_uebersicht.png');

  // ==========================================
  // 12. PROGNOSEN: ALPENWETTER TEXTPROGNOSEN
  // ==========================================
  console.log('12. Capturing Alpenwetter Textprognosen...');
  await clearAllOverlays();
  await page.evaluate(() => {
    if (window.appStore) window.appStore.setTab('forecast');
    window.scrollTo(0, 0);
  });
  await sleep(1500);
  await page.evaluate(() => {
    const textTab = document.querySelector('.forecast-tab-btn[data-section="text"]');
    if (textTab) textTab.click();
    window.scrollTo(0, 0);
  });
  await sleep(1000);
  await page.screenshot({ path: '12_prognosen_alpenwetter_text.png' });
  console.log('-> Saved 12_prognosen_alpenwetter_text.png');

  // ==========================================
  // 13. PROGNOSEN: AUSSICHTEN KARTEN-OVERLAY
  // ==========================================
  console.log('13. Capturing Aussichten Map Forecast Overlay...');
  await clearAllOverlays();
  await page.evaluate(() => {
    const outlooksTab = document.querySelector('.forecast-tab-btn[data-section="outlooks"]');
    if (outlooksTab) outlooksTab.click();
    window.scrollTo(0, 0);
  });
  await sleep(2000);
  await page.screenshot({ path: '13_prognosen_aussichten_karte.png' });
  console.log('-> Saved 13_prognosen_aussichten_karte.png');

  // ==========================================
  // 14. PROGNOSEN: EMAGRAMM SOUNDING
  // ==========================================
  console.log('14. Capturing Emagramm Atmospheric Sounding...');
  await clearAllOverlays();
  await page.evaluate(() => {
    const emagramTab = document.querySelector('.forecast-tab-btn[data-section="emagram"]');
    if (emagramTab) emagramTab.click();
    window.scrollTo(0, 0);
  });
  await sleep(1800);
  await page.screenshot({ path: '14_prognosen_emagramm_sounding.png' });
  console.log('-> Saved 14_prognosen_emagramm_sounding.png');

  // ==========================================
  // 15. PROGNOSEN: ISOBAREN KARTE
  // ==========================================
  console.log('15. Capturing Isobaren Synoptic Chart...');
  await clearAllOverlays();
  await page.evaluate(() => {
    const isobarenTab = document.querySelector('.forecast-tab-btn[data-section="isobaren"]');
    if (isobarenTab) isobarenTab.click();
    window.scrollTo(0, 0);
  });
  await sleep(1500);
  await page.screenshot({ path: '15_prognosen_isobaren_karten.png' });
  console.log('-> Saved 15_prognosen_isobaren_karten.png');

  // ==========================================
  // 16. SICHERHEIT: DABS, CHECKLIST, FLUGBUCH, VARIO
  // ==========================================
  console.log('16. Capturing Sicherheit, DABS & Flugbuch...');
  await clearAllOverlays();
  await page.evaluate(() => {
    if (window.appStore) window.appStore.setTab('safety');
    window.scrollTo(0, 0);
  });
  await sleep(1500);
  await page.screenshot({ path: '16_sicherheit_dabs_und_flugbuch.png' });
  console.log('-> Saved 16_sicherheit_dabs_und_flugbuch.png');

  // Reset back to clean map
  await clearAllOverlays();
  await page.evaluate(() => {
    if (window.appStore) {
      window.appStore.setTab('map');
      window.appStore.setMapCategory('FLYING_AREAS');
    }
    window.scrollTo(0, 0);
  });
  await sleep(800);

  browser.disconnect();
  console.log('All fresh, unobstructed screenshots successfully captured!');
}

captureAll().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
