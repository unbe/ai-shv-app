import { store } from '../state.js';
import { varioAudio } from '../services/varioAudio.js';
import { ShvApi } from '../services/api.js';

export class SafetyView {
  constructor(container) {
    this.container = container;
    this.dabsData = null;
    this.showAddModal = false;
  }

  async mount() {
    this.container.innerHTML = `
      <div class="safety-view-wrapper">
        <div class="loading-spinner">
          <div class="spinner"></div>
          <span>Sicherheits- und Flugbuchdaten laden...</span>
        </div>
      </div>
    `;

    this.dabsData = await ShvApi.getDabs();
    this.render();
  }

  unmount() {
    varioAudio.stop();
  }

  render() {
    const t = store.t;
    const { checklist, flights, varioRate, varioMuted } = store.state;

    // Calculate flight stats
    const totalFlightsCount = flights.length;
    const totalMinutes = flights.reduce((acc, f) => acc + (parseInt(f.duration) || 0), 0);
    const totalHours = Math.floor(totalMinutes / 60);
    const remainingMins = totalMinutes % 60;
    const longestFlightMins = flights.reduce((max, f) => Math.max(max, parseInt(f.duration) || 0), 0);

    const allChecked = Object.values(checklist).every(Boolean);

    this.container.innerHTML = `
      <div class="safety-view-wrapper">
        <!-- 1. 5-PUNKTE-CHECKLISTE -->
        <section class="safety-section checklist-card ${allChecked ? 'all-complete' : ''}">
          <div class="section-header-row">
            <div>
              <span class="badge-tag">Pre-Flight</span>
              <h2 class="section-heading">${t.safety.checklistTitle}</h2>
              <p class="section-sub">Standardisierter Startcheck des Schweizerischen Hängegleiter-Verbandes</p>
            </div>
            ${allChecked ? `<span class="check-ready-badge">STARTBEREIT (READY)</span>` : ''}
          </div>

          <div class="checklist-items">
            <label class="check-item ${checklist.p1 ? 'done' : ''}">
              <input type="checkbox" data-check="p1" ${checklist.p1 ? 'checked' : ''} />
              <span class="custom-checkbox"></span>
              <span class="check-text">${t.safety.p1}</span>
            </label>

            <label class="check-item ${checklist.p2 ? 'done' : ''}">
              <input type="checkbox" data-check="p2" ${checklist.p2 ? 'checked' : ''} />
              <span class="custom-checkbox"></span>
              <span class="check-text">${t.safety.p2}</span>
            </label>

            <label class="check-item ${checklist.p3 ? 'done' : ''}">
              <input type="checkbox" data-check="p3" ${checklist.p3 ? 'checked' : ''} />
              <span class="custom-checkbox"></span>
              <span class="check-text">${t.safety.p3}</span>
            </label>

            <label class="check-item ${checklist.p4 ? 'done' : ''}">
              <input type="checkbox" data-check="p4" ${checklist.p4 ? 'checked' : ''} />
              <span class="custom-checkbox"></span>
              <span class="check-text">${t.safety.p4}</span>
            </label>

            <label class="check-item ${checklist.p5 ? 'done' : ''}">
              <input type="checkbox" data-check="p5" ${checklist.p5 ? 'checked' : ''} />
              <span class="custom-checkbox"></span>
              <span class="check-text">${t.safety.p5}</span>
            </label>
          </div>

          <div class="checklist-actions">
            <button id="btn-check-all" class="btn-secondary">${t.safety.checkAll}</button>
            <button id="btn-reset-check" class="btn-text">${t.safety.resetChecklist}</button>
          </div>
        </section>

        <!-- 2. EMERGENCY SOS & REGA PROTOCOLS -->
        <section class="safety-section sos-card">
          <div class="section-header-row">
            <div>
              <span class="badge-tag tag-sos">Notfall</span>
              <h2 class="section-heading">${t.safety.sosTitle}</h2>
              <p class="section-sub">Direktwahl und Rettungskanal im Schweizer Alpenraum</p>
            </div>
          </div>

          <div class="sos-buttons-grid">
            <a href="tel:1414" class="sos-btn btn-rega">
              <span class="sos-name">Schweizerische Rettungsflugwacht</span>
              <span class="sos-phone">REGA 1414</span>
              <span class="sos-sub">Kostenlos aus allen Schweizer Netzen</span>
            </a>
            <a href="tel:112" class="sos-btn btn-euro">
              <span class="sos-name">Europäischer Notruf</span>
              <span class="sos-phone">112</span>
              <span class="sos-sub">Funktioniert auch ohne SIM-Karte</span>
            </a>
          </div>

          <!-- Radio Channel K -->
          <div class="radio-box">
            <div class="radio-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9"/><path d="M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5"/><circle cx="12" cy="12" r="2"/><path d="M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5"/><path d="M19.1 4.9C23 8.8 23 15.1 19.1 19"/></svg>
            </div>
            <div class="radio-info">
              <h4 class="radio-title">${t.safety.kRadio}</h4>
              <p class="radio-sub">Notfallfunkkanal für Bergrettung in der Schweiz. CTCSS-Rufton 151.4 Hz aktivieren!</p>
            </div>
          </div>

          <!-- Tree Landing protocol -->
          <div class="tree-rescue-box">
            <h4 class="tree-heading">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 2 22 22 22"/></svg>
              ${t.safety.treeRescueTitle}
            </h4>
            <ul class="tree-steps">
              <li>${t.safety.treeRescue1}</li>
              <li>${t.safety.treeRescue2}</li>
              <li>${t.safety.treeRescue3}</li>
              <li>${t.safety.treeRescue4}</li>
            </ul>
          </div>
        </section>

        <!-- 3. SKYBRIEFING DABS -->
        <section class="safety-section">
          <div class="section-header-row">
            <div>
              <span class="badge-tag">Luftraumstatus</span>
              <h2 class="section-heading">${t.safety.dabsTitle}</h2>
              <p class="section-sub">${t.safety.dabsSub}</p>
            </div>
          </div>

          <div class="dabs-card-box">
            <div class="dabs-status-row">
              <span class="status-indicator-dot dot-active"></span>
              <span class="dabs-date-text">Gültigkeit heute: ${this.dabsData?.validity || 'Aktiv'}</span>
            </div>
            <p class="dabs-notes">${this.dabsData?.notesDe || 'Täglich ab 16:00 LT für den Folgetag publiziert.'}</p>
            <div class="dabs-links">
              <a href="https://www.skybriefing.com/de/dabs" target="_blank" rel="noopener" class="btn-primary">
                ${t.safety.dabsLink} ↗
              </a>
              <a href="https://www.skybriefing.com/dabs/dabs.pdf" target="_blank" rel="noopener" class="btn-secondary">
                DABS PDF herunterladen ↗
              </a>
            </div>
          </div>
        </section>

        <!-- 4. ACOUSTIC VARIO SIMULATOR -->
        <section class="safety-section vario-card">
          <div class="section-header-row">
            <div>
              <span class="badge-tag">Web Audio API</span>
              <h2 class="section-heading">${t.safety.varioTitle}</h2>
              <p class="section-sub">${t.safety.varioSub}</p>
            </div>
            <button id="btn-toggle-vario" class="btn-vario-audio ${!varioMuted ? 'active-audio' : ''}">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                ${!varioMuted ? `
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                  <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
                ` : `
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                  <line x1="23" y1="9" x2="17" y2="15"></line>
                  <line x1="17" y1="9" x2="23" y2="15"></line>
                `}
              </svg>
              <span>${!varioMuted ? t.safety.varioUnmute : t.safety.varioMute}</span>
            </button>
          </div>

          <div class="vario-display-box">
            <div class="vario-gauge ${varioRate > 0 ? 'vario-lift' : varioRate < -1.5 ? 'vario-sink' : ''}">
              <span class="vario-digital">${varioRate > 0 ? '+' : ''}${varioRate.toFixed(1)}</span>
              <span class="vario-unit">m/s</span>
            </div>
            <div class="vario-slider-wrapper">
              <input type="range" id="vario-slider" min="-5.0" max="6.0" step="0.1" value="${varioRate}" />
              <div class="vario-scale-ticks">
                <span>-5.0 (Saufen)</span>
                <span>0.0</span>
                <span>+6.0 (Hammer!)</span>
              </div>
            </div>
          </div>
        </section>

        <!-- 5. ELECTRONIC FLIGHT LOGBOOK -->
        <section class="safety-section logbook-card">
          <div class="section-header-row">
            <div>
              <span class="badge-tag">SHV Flugbuch</span>
              <h2 class="section-heading">${t.safety.logbookTitle}</h2>
              <p class="section-sub">Erfasste Flüge & Flugstatistiken</p>
            </div>
            <div class="logbook-top-actions">
              <button id="btn-add-flight" class="btn-primary">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                ${t.safety.addFlight}
              </button>
              <button id="btn-export-csv" class="btn-secondary" title="Als CSV herunterladen">
                CSV ↗
              </button>
            </div>
          </div>

          <!-- Stats Summary Bar -->
          <div class="log-stats-bar">
            <div class="log-stat-item">
              <span class="log-stat-lbl">${t.safety.totalFlights}</span>
              <span class="log-stat-val">${totalFlightsCount}</span>
            </div>
            <div class="log-stat-item">
              <span class="log-stat-lbl">${t.safety.totalAirtime}</span>
              <span class="log-stat-val">${totalHours}h ${remainingMins}m</span>
            </div>
            <div class="log-stat-item">
              <span class="log-stat-lbl">${t.safety.longestFlight}</span>
              <span class="log-stat-val">${longestFlightMins} min</span>
            </div>
          </div>

          <!-- Flights Table / List -->
          <div class="flights-list">
            ${flights.length === 0 ? `
              <div class="empty-state-card" style="text-align: center; padding: 36px 16px; background: var(--bg-primary); border-radius: 14px; border: 1px dashed var(--border-color);">
                <p style="font-weight: 700; margin: 0 0 6px; color: var(--text-primary);">Noch keine Flüge im Flugbuch erfasst</p>
                <p style="font-size: 0.85rem; color: var(--text-muted); margin: 0;">Erfasse deinen ersten Flug mit «+ Flug erfassen» oben rechts.</p>
              </div>
            ` : flights.map(f => `
              <div class="flight-item-card">
                <div class="fl-top">
                  <div>
                    <h4 class="fl-site">${f.site}</h4>
                    <span class="fl-landing">→ ${f.landing}</span>
                  </div>
                  <div class="fl-duration-badge">
                    <span>${f.duration} min</span>
                  </div>
                </div>
                <div class="fl-details">
                  <span>📅 ${f.date}</span>
                  <span>🪂 ${f.glider}</span>
                  ${f.distance ? `<span>📍 ${f.distance} km</span>` : ''}
                  ${f.maxAlt ? `<span>⛰️ ${f.maxAlt} m</span>` : ''}
                  <span class="fl-type-pill">${f.type || 'Flug'}</span>
                </div>
                ${f.notes ? `<p class="fl-notes">"${f.notes}"</p>` : ''}
              </div>
            `).join('')}
          </div>
        </section>
      </div>

      <!-- ADD FLIGHT MODAL -->
      ${this.showAddModal ? `
        <div class="modal-scrim" id="flight-modal-scrim">
          <div class="modal-card">
            <div class="modal-header">
              <h3>Neuen Flug erfassen</h3>
              <button class="modal-close" id="modal-close-btn">&times;</button>
            </div>
            <form id="add-flight-form" class="modal-body">
              <div class="form-row">
                <div class="form-group">
                  <label>Datum</label>
                  <input type="date" name="date" required value="${new Date().toISOString().split('T')[0]}" />
                </div>
                <div class="form-group">
                  <label>Flugdauer (Minuten)</label>
                  <input type="number" name="duration" required min="1" max="1200" value="45" />
                </div>
              </div>
              <div class="form-group">
                <label>Startplatz</label>
                <input type="text" name="site" required placeholder="z. B. Fiescheralp, Interlaken, Brunni..." />
              </div>
              <div class="form-group">
                <label>Landeplatz</label>
                <input type="text" name="landing" required placeholder="z. B. Fiesch Landeplatz, Höhematte..." />
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label>Gleitschirm / Gurtzeug</label>
                  <input type="text" name="glider" required value="Advance Iota DLS" />
                </div>
                <div class="form-group">
                  <label>XC Distanz (km)</label>
                  <input type="number" step="0.1" name="distance" placeholder="z. B. 25.4" />
                </div>
              </div>
              <div class="form-group">
                <label>Bemerkungen</label>
                <textarea name="notes" rows="2" placeholder="Thermik, Bedingungen, Route..."></textarea>
              </div>
              <div class="modal-actions">
                <button type="button" class="btn-secondary" id="modal-cancel-btn">Abbrechen</button>
                <button type="submit" class="btn-primary">Flug speichern</button>
              </div>
            </form>
          </div>
        </div>
      ` : ''}
    `;

    this.attachEvents();
  }

  attachEvents() {
    // Checkbox toggles
    this.container.querySelectorAll('input[data-check]').forEach(cb => {
      cb.addEventListener('change', (e) => {
        const key = cb.getAttribute('data-check');
        store.setChecklistPoint(key, e.target.checked);
      });
    });

    const checkAllBtn = this.container.querySelector('#btn-check-all');
    if (checkAllBtn) {
      checkAllBtn.addEventListener('click', () => store.checkAllChecklist());
    }

    const resetCheckBtn = this.container.querySelector('#btn-reset-check');
    if (resetCheckBtn) {
      resetCheckBtn.addEventListener('click', () => store.resetChecklist());
    }

    // Variometer Audio toggle & slider
    const varioToggleBtn = this.container.querySelector('#btn-toggle-vario');
    const varioSlider = this.container.querySelector('#vario-slider');

    if (varioToggleBtn) {
      varioToggleBtn.addEventListener('click', () => {
        const newMuted = !store.state.varioMuted;
        store.setVarioMuted(newMuted);
        if (newMuted) {
          varioAudio.stop();
        } else {
          varioAudio.start();
          varioAudio.setRate(store.state.varioRate);
        }
      });
    }

    if (varioSlider) {
      varioSlider.addEventListener('input', (e) => {
        const rate = parseFloat(e.target.value);
        store.setVarioRate(rate);
        varioAudio.setRate(rate);
      });
    }

    // Add flight modal
    const addFlightBtn = this.container.querySelector('#btn-add-flight');
    if (addFlightBtn) {
      addFlightBtn.addEventListener('click', () => {
        this.showAddModal = true;
        this.render();
      });
    }

    const modalClose = this.container.querySelector('#modal-close-btn');
    const modalCancel = this.container.querySelector('#modal-cancel-btn');
    const scrim = this.container.querySelector('#flight-modal-scrim');

    const closeModal = () => {
      this.showAddModal = false;
      this.render();
    };

    if (modalClose) modalClose.addEventListener('click', closeModal);
    if (modalCancel) modalCancel.addEventListener('click', closeModal);

    const form = this.container.querySelector('#add-flight-form');
    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const fd = new FormData(form);
        const newFlight = {
          id: 'f-' + Date.now(),
          date: fd.get('date'),
          site: fd.get('site'),
          landing: fd.get('landing'),
          glider: fd.get('glider'),
          duration: parseInt(fd.get('duration')) || 30,
          distance: parseFloat(fd.get('distance')) || null,
          notes: fd.get('notes'),
          type: 'Thermikflug',
        };
        store.addFlight(newFlight);
        this.showAddModal = false;
        this.render();
      });
    }

    // Export CSV
    const exportBtn = this.container.querySelector('#btn-export-csv');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => {
        const rows = [['Datum', 'Startplatz', 'Landeplatz', 'Dauer_Min', 'Schirm', 'Distanz_km', 'Notizen']];
        store.state.flights.forEach(f => {
          rows.push([
            f.date,
            `"${f.site}"`,
            `"${f.landing}"`,
            f.duration,
            `"${f.glider}"`,
            f.distance || '',
            `"${(f.notes || '').replace(/"/g, '""')}"`,
          ]);
        });
        const csvContent = 'data:text/csv;charset=utf-8,' + rows.map(r => r.join(',')).join('\n');
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement('a');
        link.setAttribute('href', encodedUri);
        link.setAttribute('download', `shv_flugbuch_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      });
    }
  }
}
