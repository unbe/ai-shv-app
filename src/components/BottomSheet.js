import { store } from '../state.js';

export function renderBottomSheet(container) {
  const { selectedSite, selectedStation, selectedWebcam, selectedObstacle } = store.state;
  const t = store.t;

  if (!selectedSite && !selectedStation && !selectedWebcam && !selectedObstacle) {
    container.innerHTML = '';
    container.classList.add('hidden');
    return;
  }

  container.classList.remove('hidden');

  // 1. FLYING SITE DETAILS
  if (selectedSite) {
    let p = selectedSite.properties || {};

    // If siteName is missing, resolve from parent primary site via siteId
    if (p.siteId && store.state.flyingSitesById?.[p.siteId]) {
      const parent = store.state.flyingSitesById[p.siteId];
      p = { ...parent, ...p, siteName: p.siteName || parent.siteName };
    }

    const latLng = getSiteCenterLatLng(selectedSite) || [46.8, 8.2];
    const [lat, lng] = latLng;
    const type = (p.type || '').toLowerCase();
    const isLaunch = type === 'launch' || type === 'launcharea';
    const isLanding = type === 'landing' || type === 'landingarea' || type === 'landingpattern';

    const displayName = p.siteName || p.description || (isLaunch ? 'Startplatz' : isLanding ? 'Landeplatz' : 'Fluggebiet');

    // Compass wind rose tags
    const launchDirs = p.launchDirections || [];
    const allDirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const windPills = allDirs.map(d => {
      const isOk = launchDirs.includes(d);
      return `<span class="wind-tag ${isOk ? 'wind-ok' : 'wind-no'}">${d}</span>`;
    }).join('');

    // Difficulty badge
    let difficultyBadge = '';
    if (p.difficulty) {
      const diffMap = {
        easy: { label: 'Einfach', class: 'badge-diff-easy' },
        moderate: { label: 'Mittel', class: 'badge-diff-moderate' },
        difficult: { label: 'Anspruchsvoll', class: 'badge-diff-difficult' },
      };
      const d = diffMap[p.difficulty.toLowerCase()] || { label: p.difficulty, class: 'badge-diff-moderate' };
      difficultyBadge = `<span class="sheet-badge ${d.class}">${d.label}</span>`;
    }

    // Opening Status badge
    let statusBadge = '';
    if (p.openingStatus) {
      const st = p.openingStatus.toLowerCase();
      if (st === 'open') {
        statusBadge = `<span class="sheet-badge badge-status-open">🟢 Geöffnet</span>`;
      } else if (st === 'closed') {
        statusBadge = `<span class="sheet-badge badge-status-closed">🔴 Geschlossen</span>`;
      }
    }

    // Suitability pills (paraglider, hangglider, toplanding, hike & fly, etc.)
    const suitabilityBadges = [];
    if (p.paraglider) suitabilityBadges.push('🪂 Gleitschirm');
    if (p.hangglider) suitabilityBadges.push('🪁 Delta / Hängegleiter');
    if (p.speedflyer) suitabilityBadges.push('⚡ Speedflyer');
    if (p.toplanding) suitabilityBadges.push('🎯 Toplandung');
    if (p.soaring) suitabilityBadges.push('🌊 Soaring');
    if (p.crossCountry) suitabilityBadges.push('🦅 Streckenflug (XC)');
    if (p.hikeAndFly) suitabilityBadges.push('🥾 Hike & Fly');
    if (p.groundhandling) suitabilityBadges.push('🌾 Groundhandling');
    if (p.accessibleByCar) suitabilityBadges.push('🚗 Auto-Zufahrt');
    if (p.publicTransport) suitabilityBadges.push('🚊 ÖV / Bergbahn');

    container.innerHTML = `
      <div class="sheet-scrim" id="sheet-scrim"></div>
      <div class="sheet-content">
        <div class="sheet-drag-handle"></div>

        <div class="sheet-header">
          <div class="sheet-title-group">
            <div class="sheet-badges-row">
              <span class="sheet-badge ${isLaunch ? 'badge-launch' : isLanding ? 'badge-landing' : 'badge-general'}">
                ${isLaunch ? 'Startplatz (Take-off)' : isLanding ? 'Landeplatz (Landing)' : (p.type || 'Fluggebiet')}
              </span>
              ${difficultyBadge}
              ${statusBadge}
            </div>
            <h2 class="sheet-title">${escapeHtml(displayName)}</h2>
            <div class="sheet-meta">
              <span class="meta-item">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m8 3 4 8 5-5 5 15H2L8 3z"/></svg>
                ${p.elevation ? `${p.elevation} m ü. M.` : 'Höhe n/a'}
              </span>
              <span class="meta-item">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></svg>
                ${lat.toFixed(4)}° N, ${lng.toFixed(4)}° E
              </span>
            </div>
          </div>
          <button class="sheet-close" id="sheet-close-btn">&times;</button>
        </div>

        <div class="sheet-body">
          <!-- Suitability & Category Badges -->
          ${suitabilityBadges.length > 0 ? `
            <div class="suitability-pills-row">
              ${suitabilityBadges.map(b => `<span class="suitability-pill">${b}</span>`).join('')}
            </div>
          ` : ''}

          <!-- Opening Info Notice -->
          ${p.openingInfo ? `
            <div class="sheet-section section-opening" style="background: rgba(0, 137, 207, 0.08); border-left: 3px solid var(--shv-blue); padding: 10px 12px; border-radius: 0 8px 8px 0;">
              <h4 class="section-title" style="color: var(--shv-blue);">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                Status & Flugbetrieb
              </h4>
              <p class="section-text">${escapeHtml(p.openingInfo).replace(/\n/g, '<br/>')}</p>
            </div>
          ` : ''}

          ${isLaunch && launchDirs.length > 0 ? `
            <!-- Wind Suitability -->
            <div class="sheet-section">
              <h4 class="section-title">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.7 7.7a2.5 2.5 0 1 1 1.8 4.3H2"/><path d="M9.6 4.6A2 2 0 1 1 11 8H2"/><path d="M12.6 19.4A2 2 0 1 0 14 16H2"/></svg>
                ${t.map.windSuitable}
              </h4>
              <div class="wind-rose-grid">
                ${windPills}
              </div>
            </div>
          ` : ''}

          <!-- Guidelines & Rules -->
          ${p.siteDescription ? `
            <div class="sheet-section">
              <h4 class="section-title">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                ${t.map.rules}
              </h4>
              <p class="section-text">${escapeHtml(p.siteDescription).replace(/\n/g, '<br/>')}</p>
            </div>
          ` : ''}

          <!-- Hazards & Specifics -->
          ${p.hazards ? `
            <div class="sheet-section section-warning">
              <h4 class="section-title text-warning">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                ${t.map.hazards}
              </h4>
              <p class="section-text">${escapeHtml(p.hazards).replace(/\n/g, '<br/>')}</p>
            </div>
          ` : ''}

          <!-- Access Instructions -->
          ${p.access ? `
            <div class="sheet-section">
              <h4 class="section-title">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/></svg>
                ${t.map.access}
              </h4>
              <p class="section-text">${escapeHtml(p.access).replace(/\n/g, '<br/>')}</p>
            </div>
          ` : ''}

          <!-- Start- & Landegebühren (Fees) -->
          ${p.fees ? `
            <div class="sheet-section section-fees" style="background: rgba(0, 165, 81, 0.08); border: 1px solid rgba(0, 165, 81, 0.25); border-radius: 12px; padding: 14px;">
              <h4 class="section-title" style="color: #00A551; margin-bottom: 6px;">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
                ${t.map.fees || 'Start- & Landegebühr / Twint'}
              </h4>
              <p class="section-text" style="line-height: 1.5;">${escapeHtml(p.fees).replace(/\n/g, '<br/>')}</p>

              ${p.feePaymentLink ? `
                <div class="fee-action-row" style="margin-top: 10px;">
                  <a href="${p.feePaymentLink}" target="_blank" rel="noopener" class="btn-action btn-pay" style="display: inline-flex; align-items: center; gap: 8px; background: #00A551; color: #FFFFFF; font-weight: 700; font-size: 0.85rem; padding: 10px 16px; border-radius: 10px; text-decoration: none;">
                    <span>💳</span> Gebühr online / Twint bezahlen ↗
                  </a>
                </div>
              ` : ''}

              ${p.feeQrCodeUrl ? `
                <div class="fee-qr-wrapper" style="margin-top: 12px; display: inline-flex; flex-direction: column; align-items: center; background: #FFFFFF; padding: 12px; border-radius: 12px; border: 1px solid var(--border-color); box-shadow: var(--shadow-sm);">
                  <img src="${p.feeQrCodeUrl}" alt="Twint QR-Code" style="width: 140px; height: 140px; object-fit: contain; border-radius: 6px;" />
                  <span style="font-size: 0.74rem; color: #334155; margin-top: 6px; font-weight: 700;">Twint QR-Code vor Ort scannen</span>
                </div>
              ` : ''}
            </div>
          ` : ''}

          <!-- Responsible Club -->
          ${p.responsible ? `
            <div class="sheet-section">
              <h4 class="section-title">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                ${t.map.responsible}
              </h4>
              <div class="club-row">
                <span class="club-name">${escapeHtml(p.responsible)}</span>
                ${p.clubLink ? `<a href="${p.clubLink}" target="_blank" rel="noopener" class="btn-link">Website ↗</a>` : ''}
              </div>
            </div>
          ` : ''}

          <!-- Actions: Navigation & Emergency -->
          <div class="sheet-actions">
            <a href="https://maps.apple.com/?daddr=${lat},${lng}" target="_blank" class="btn-action btn-nav">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>
              ${t.map.openInMaps}
            </a>
            <a href="tel:1414" class="btn-action btn-sos">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
              Rega 1414
            </a>
          </div>
        </div>
      </div>
    `;
  }
  // 2. WEATHER STATION DETAILS
  else if (selectedStation) {
    const p = selectedStation.properties || {};
    const coords = selectedStation.geometry?.coordinates || [0, 0];
    const windSpeedKmH = (p.windSpeedValue !== undefined && p.windSpeedValue !== null) ? Math.round(p.windSpeedValue * 10) / 10 : null;
    const windGustKmH = (p.windGustValue !== undefined && p.windGustValue !== null) ? Math.round(p.windGustValue * 10) / 10 : null;
    const tempC = p.temperatureValue ? (p.temperatureValue > 200 ? Math.round((p.temperatureValue - 273.15) * 10) / 10 : Math.round(p.temperatureValue * 10) / 10) : null;
    const qnh = p.pressureStandardMslValue ? (p.pressureStandardMslValue > 5000 ? Math.round(p.pressureStandardMslValue / 10) : Math.round(p.pressureStandardMslValue)) : null;

    container.innerHTML = `
      <div class="sheet-scrim" id="sheet-scrim"></div>
      <div class="sheet-content">
        <div class="sheet-drag-handle"></div>

        <div class="sheet-header">
          <div class="sheet-title-group">
            <span class="sheet-badge badge-station">Live Wetterstation</span>
            <h2 class="sheet-title">${p.name || 'Wetterstation'}</h2>
            <div class="sheet-meta">
              <span class="meta-item">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m8 3 4 8 5-5 5 15H2L8 3z"/></svg>
                ${p.altitude ? `${p.altitude} m ü. M.` : 'Höhe n/a'}
              </span>
              <span class="meta-item">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></svg>
                ${coords[1].toFixed(4)}° N, ${coords[0].toFixed(4)}° E
              </span>
            </div>
          </div>
          <button class="sheet-close" id="sheet-close-btn">&times;</button>
        </div>

        <div class="sheet-body">
          <div class="station-metrics-grid">
            ${windSpeedKmH !== null ? `
              <div class="metric-card">
                <span class="metric-lbl">Wind</span>
                <span class="metric-val">${windSpeedKmH} km/h</span>
                ${windGustKmH ? `<span class="metric-sub">Böen: ${windGustKmH} km/h</span>` : ''}
              </div>
            ` : ''}
            ${tempC !== null ? `
              <div class="metric-card">
                <span class="metric-lbl">Temperatur</span>
                <span class="metric-val">${tempC} °C</span>
              </div>
            ` : ''}
            ${qnh !== null ? `
              <div class="metric-card">
                <span class="metric-lbl">Druck (QNH)</span>
                <span class="metric-val">${qnh} hPa</span>
              </div>
            ` : ''}
          </div>

          <div class="sheet-actions">
            <a href="https://maps.apple.com/?daddr=${coords[1]},${coords[0]}" target="_blank" class="btn-action btn-nav">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>
              ${t.map.openInMaps}
            </a>
          </div>
        </div>
      </div>
    `;
  }
  // 3. WEBCAM DETAILS
  else if (selectedWebcam) {
    const p = selectedWebcam.properties || {};
    const imgUrl = p.mediumResolutionImageUrl || p.thumbnailUrl || p.highResolutionImageUrl;

    container.innerHTML = `
      <div class="sheet-scrim" id="sheet-scrim"></div>
      <div class="sheet-content sheet-webcam-content">
        <div class="sheet-drag-handle"></div>

        <div class="sheet-header">
          <div class="sheet-title-group">
            <span class="sheet-badge badge-webcam">Live Webcam</span>
            <h2 class="sheet-title">${p.title || p.name || 'Webcam'}</h2>
          </div>
          <button class="sheet-close" id="sheet-close-btn">&times;</button>
        </div>

        <div class="sheet-body">
          ${imgUrl ? `
            <div class="webcam-viewer">
              <img src="${imgUrl}" alt="${p.title || 'Webcam'}" class="webcam-img" loading="eager" />
            </div>
          ` : '<p class="error-notice">Kein Bild verfügbar</p>'}

          ${p.liveUrl ? `
            <div class="sheet-actions">
              <a href="${p.liveUrl}" target="_blank" rel="noopener" class="btn-action btn-nav">
                <span>Webcam Vollbild ↗</span>
              </a>
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }
  // 4. BAZL AVIATION OBSTACLE DETAILS
  else if (selectedObstacle) {
    const p = selectedObstacle.properties || selectedObstacle;
    const center = getSiteCenterLatLng(selectedObstacle) || [46.8, 8.2];
    const [lat, lng] = center;

    const OBSTACLE_TYPE_LABELS = {
      TRANSMISSION_LINE: 'Freileitung / Stromkabel',
      CABLE_CAR: 'Luftseilbahn / Seilbahn',
      CATENARY: 'Spannseil / Catenary',
      POLE: 'Mast / Freileitungsmast',
      CRANE: 'Baukran',
      BUILDING: 'Gebäude / Turm',
      VEGETATION: 'Baum / Waldhindernis',
      WINDMILL: 'Windenergieanlage',
      STACK: 'Kamin / Schornstein',
      BRIDGE: 'Brücke / Hängebrücke',
    };

    const typeTitle = OBSTACLE_TYPE_LABELS[p.obstacleType] || p.obstacleType || 'Luftfahrthindernis';
    const isLine = p.geometryType === 'LineString' || p.obstacleType === 'TRANSMISSION_LINE' || p.obstacleType === 'CABLE_CAR';
    const iconName = p.styleId || (isLine ? 'ms_pole' : 'red_circle');
    const iconUrl = `/assets/obstacles/${iconName}.svg`;

    container.innerHTML = `
      <div class="sheet-scrim" id="sheet-scrim"></div>
      <div class="sheet-content">
        <div class="sheet-drag-handle"></div>

        <div class="sheet-header">
          <div class="sheet-title-group">
            <div class="sheet-badges-row">
              <span class="sheet-badge" style="background: #CC0000; color: #FFFFFF; font-weight: 700;">
                ⚠️ Luftfahrthindernis BAZL
              </span>
              ${p.airport ? `<span class="sheet-badge badge-launch">Flugplatz ${escapeHtml(p.airport)}</span>` : ''}
              ${p.marking && p.marking !== 'NONE' ? `<span class="sheet-badge badge-status-closed">Markiert</span>` : ''}
              ${p.lighting && p.lighting !== 'NONE' ? `<span class="sheet-badge badge-status-open">Beleuchtet</span>` : ''}
            </div>
            <h2 class="sheet-title" style="display: flex; align-items: center; gap: 8px;">
              <img src="${iconUrl}" onerror="this.style.display='none'" alt="" style="width: 24px; height: 24px; object-fit: contain;" />
              <span>${escapeHtml(typeTitle)}</span>
            </h2>
            <div class="sheet-meta">
              ${p.topElevationAmsl ? `
                <span class="meta-item">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m8 3 4 8 5-5 5 15H2L8 3z"/></svg>
                  ${p.topElevationAmsl} m ü. M. (AMSL)
                </span>
              ` : ''}
              <span class="meta-item">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></svg>
                ${lat.toFixed(4)}° N, ${lng.toFixed(4)}° E
              </span>
            </div>
          </div>
          <button class="sheet-close" id="sheet-close-btn">&times;</button>
        </div>

        <div class="sheet-body">
          <div class="station-metrics-grid" style="grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));">
            ${p.maxHeightAgl ? `
              <div class="metric-card" style="border-left: 3px solid #CC0000;">
                <span class="metric-lbl">Max. Höhe (AGL)</span>
                <span class="metric-val" style="color: #CC0000;">${p.maxHeightAgl} m</span>
                <span class="metric-sub">Über Grund</span>
              </div>
            ` : ''}
            ${p.topElevationAmsl ? `
              <div class="metric-card">
                <span class="metric-lbl">Max. Höhe (AMSL)</span>
                <span class="metric-val">${p.topElevationAmsl} m</span>
                <span class="metric-sub">Über Meer</span>
              </div>
            ` : ''}
            ${p.totalLength ? `
              <div class="metric-card">
                <span class="metric-lbl">Gesamtlänge</span>
                <span class="metric-val">${p.totalLength} m</span>
              </div>
            ` : ''}
            ${p.radius ? `
              <div class="metric-card">
                <span class="metric-lbl">Radius</span>
                <span class="metric-val">${p.radius} m</span>
              </div>
            ` : ''}
          </div>

          <!-- Technical Attributes -->
          <div class="sheet-section" style="margin-top: 14px; background: rgba(255, 255, 255, 0.04); border-radius: 12px; padding: 12px 14px;">
            <div style="display: grid; grid-template-columns: 140px 1fr; gap: 8px; font-size: 0.85rem; line-height: 1.5;">
              <span style="color: var(--text-secondary);">Typ:</span>
              <span style="font-weight: 600;">${escapeHtml(p.obstacleType || '-')}</span>

              ${p.sourceId ? `
                <span style="color: var(--text-secondary);">BAZL-ID:</span>
                <span style="font-family: monospace; font-size: 0.8rem;">${escapeHtml(p.sourceId)}</span>
              ` : ''}

              <span style="color: var(--text-secondary);">Markierung:</span>
              <span>${p.marking === 'MARKED' ? '🔴 Markiert' : 'Keine'}</span>

              <span style="color: var(--text-secondary);">Beleuchtung:</span>
              <span>${p.lighting && p.lighting !== 'NONE' ? `💡 ${escapeHtml(p.lighting)}` : 'Keine'}</span>

              ${p.effectiveDate ? `
                <span style="color: var(--text-secondary);">In Kraft seit:</span>
                <span>${escapeHtml(p.effectiveDate)}</span>
              ` : ''}

              ${p.lastUpdate ? `
                <span style="color: var(--text-secondary);">Aktualisiert:</span>
                <span>${escapeHtml(p.lastUpdate)}</span>
              ` : ''}
            </div>

            ${p.sanctionText ? `
              <div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--border-color); font-size: 0.82rem; color: var(--text-secondary);">
                <strong>Verfügung:</strong> ${escapeHtml(p.sanctionText)}
              </div>
            ` : ''}
          </div>

          <div class="sheet-actions" style="margin-top: 14px;">
            <a href="https://maps.apple.com/?daddr=${lat},${lng}" target="_blank" class="btn-action btn-nav">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>
              ${t.map.openInMaps}
            </a>
            <a href="https://www.skybriefing.com/de/dabs" target="_blank" rel="noopener" class="btn-action" style="background: rgba(255,255,255,0.08); border: 1px solid var(--border-color); color: var(--text-primary); text-decoration: none; display: inline-flex; align-items: center; justify-content: center; gap: 6px; border-radius: 10px; font-size: 0.85rem; font-weight: 600; padding: 10px 14px;">
              <span>DABS Konsultation ↗</span>
            </a>
          </div>
        </div>
      </div>
    `;
  }

  // Event handlers
  const closeBtn = container.querySelector('#sheet-close-btn');
  const scrim = container.querySelector('#sheet-scrim');

  const closeSheet = () => {
    store.selectSite(null);
    store.selectStation(null);
    store.selectWebcam(null);
    store.selectObstacle(null);
  };

  if (closeBtn) closeBtn.addEventListener('click', closeSheet);
  if (scrim) scrim.addEventListener('click', closeSheet);
}

function getSiteCenterLatLng(feature) {
  const geom = feature?.geometry;
  if (!geom || !geom.coordinates) return null;
  const t = geom.type;
  const coords = geom.coordinates;

  if (t === 'Point') {
    if (Array.isArray(coords) && coords.length >= 2 && typeof coords[0] === 'number' && typeof coords[1] === 'number') {
      return [coords[1], coords[0]];
    }
  } else if (t === 'Polygon') {
    const ring = coords[0];
    if (Array.isArray(ring) && ring.length > 0) {
      let sumLat = 0, sumLng = 0, count = 0;
      for (const pt of ring) {
        if (Array.isArray(pt) && pt.length >= 2 && typeof pt[0] === 'number' && typeof pt[1] === 'number') {
          sumLng += pt[0];
          sumLat += pt[1];
          count++;
        }
      }
      if (count > 0) return [sumLat / count, sumLng / count];
    }
  } else if (t === 'LineString') {
    if (Array.isArray(coords) && coords.length > 0) {
      let sumLat = 0, sumLng = 0, count = 0;
      for (const pt of coords) {
        if (Array.isArray(pt) && pt.length >= 2 && typeof pt[0] === 'number' && typeof pt[1] === 'number') {
          sumLng += pt[0];
          sumLat += pt[1];
          count++;
        }
      }
      if (count > 0) return [sumLat / count, sumLng / count];
    }
  }
  return null;
}

function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
