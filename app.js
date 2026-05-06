const IMAGE_BASE = 'https://image.tmdb.org/t/p/w500';
const STORAGE_KEY = 'tmdb_intervalo_settings_v1';
const DEFAULT_API_KEY = 'b095ccbbb185d27703d007ae0ded5f7d';
const DEFAULT_PRICE = 0.45;

const state = {
  selectedShow: null,
  tvDetails: null,
  seasonCache: new Map(),
  currentSeason: null
};

const el = {
  pricePerMinute: document.getElementById('pricePerMinute'),
  saveSettingsBtn: document.getElementById('saveSettingsBtn'),
  resetPriceBtn: document.getElementById('resetPriceBtn'),
  searchInput: document.getElementById('searchInput'),
  searchBtn: document.getElementById('searchBtn'),
  status: document.getElementById('status'),
  resultsSection: document.getElementById('resultsSection'),
  results: document.getElementById('results'),
  detailsSection: document.getElementById('detailsSection'),
  details: document.getElementById('details')
};

function loadSettings() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return;

  try {
    const parsed = JSON.parse(saved);
    if (typeof parsed.pricePerMinute === 'number') {
      el.pricePerMinute.value = parsed.pricePerMinute;
    }
  } catch (_) {}
}

function saveSettings() {
  const pricePerMinute = sanitizePrice(el.pricePerMinute.value);
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ pricePerMinute }));
  el.pricePerMinute.value = String(pricePerMinute);
  recalculateCurrentSeason();
  setStatus('Valor por minuto salvo no navegador.');
}

function resetPrice() {
  localStorage.removeItem(STORAGE_KEY);
  el.pricePerMinute.value = String(DEFAULT_PRICE);
  recalculateCurrentSeason();
  setStatus('Valor restaurado para R$ 0,45/min.');
}

function sanitizePrice(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : DEFAULT_PRICE;
}

function setStatus(message, isError = false) {
  el.status.textContent = message;
  el.status.style.color = isError ? '#fca5a5' : '#93c5fd';
}

function getApiKey() {
  return DEFAULT_API_KEY;
}

async function tmdbFetch(path, params = {}) {
  const url = new URL(`https://api.themoviedb.org/3${path}`);
  url.searchParams.set('api_key', getApiKey());
  url.searchParams.set('language', 'pt-BR');

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  });

  const response = await fetch(url.toString());
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.status_message || 'Erro ao consultar a TMDb.');
  }

  return data;
}

function formatCurrency(value) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(value);
}

function minutesToText(totalMinutes) {
  const safeMinutes = Math.max(0, Number(totalMinutes || 0));
  const h = Math.floor(safeMinutes / 60);
  const m = safeMinutes % 60;
  if (h <= 0) return `${m} min`;
  return `${h}h ${m}min`;
}

function posterUrl(path) {
  return path ? `${IMAGE_BASE}${path}` : 'https://via.placeholder.com/500x750?text=Sem+Imagem';
}

function escapeHtml(text) {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function calculatePrice(minutes) {
  return Number(minutes || 0) * sanitizePrice(el.pricePerMinute.value);
}

async function searchShows() {
  const query = el.searchInput.value.trim();
  if (!query) {
    setStatus('Digite o nome de uma série.', true);
    return;
  }

  el.results.innerHTML = '';
  el.details.innerHTML = '';
  el.resultsSection.classList.add('hidden');
  el.detailsSection.classList.add('hidden');
  state.selectedShow = null;
  state.tvDetails = null;
  state.currentSeason = null;
  state.seasonCache.clear();

  setStatus('Pesquisando série...');

  try {
    const data = await tmdbFetch('/search/tv', { query, include_adult: false });
    const items = data.results || [];

    if (!items.length) {
      setStatus('Nenhuma série encontrada.', true);
      return;
    }

    renderResults(items);
    el.resultsSection.classList.remove('hidden');
    setStatus(`${items.length} resultado(s) encontrado(s).`);
  } catch (error) {
    setStatus(error.message, true);
  }
}

function renderResults(items) {
  el.results.innerHTML = items.map((item) => {
    const title = item.name || 'Sem título';
    const year = item.first_air_date ? item.first_air_date.slice(0, 4) : '—';
    return `
      <article class="result-card">
        <img class="result-poster" src="${posterUrl(item.poster_path)}" alt="Pôster de ${escapeHtml(title)}">
        <div class="result-content">
          <h3>${escapeHtml(title)}</h3>
          <div class="badges">
            <span class="badge">Série</span>
            <span class="badge">${year}</span>
          </div>
          <p class="muted small">${escapeHtml(item.overview || 'Sem descrição disponível.')}</p>
          <button onclick="loadShow(${item.id})">Escolher série</button>
        </div>
      </article>
    `;
  }).join('');
}

async function loadShow(id) {
  setStatus('Carregando série...');
  el.detailsSection.classList.remove('hidden');
  el.details.innerHTML = '<p class="muted">Carregando...</p>';

  try {
    const tv = await tmdbFetch(`/tv/${id}`);
    state.selectedShow = id;
    state.tvDetails = tv;
    state.currentSeason = null;
    state.seasonCache.clear();
    renderShowSkeleton(tv);
    setStatus('Série carregada. Escolha a temporada.');
  } catch (error) {
    el.details.innerHTML = `<p class="muted">Erro: ${escapeHtml(error.message)}</p>`;
    setStatus(error.message, true);
  }
}

function renderShowSkeleton(tv) {
  const title = tv.name || 'Sem título';
  const year = tv.first_air_date ? tv.first_air_date.slice(0, 4) : '—';
  const validSeasons = (tv.seasons || []).filter((season) => season.season_number > 0);
  const seasonOptions = validSeasons.map((season) => (
    `<option value="${season.season_number}">Temporada ${season.season_number}</option>`
  )).join('');

  el.details.innerHTML = `
    <div class="summary">
      <div>
        <img class="poster-lg" src="${posterUrl(tv.poster_path)}" alt="Pôster de ${escapeHtml(title)}">
      </div>
      <div>
        <h2>${escapeHtml(title)} (${year})</h2>
        <p class="muted">${escapeHtml(tv.overview || 'Sem descrição disponível.')}</p>
        <div class="kpis">
          <div class="kpi">
            <span>Temporadas</span>
            <strong>${validSeasons.length}</strong>
          </div>
          <div class="kpi">
            <span>Preço atual</span>
            <strong>${formatCurrency(sanitizePrice(el.pricePerMinute.value))}/min</strong>
          </div>
          <div class="kpi">
            <span>Status</span>
            <strong>${escapeHtml(tv.status || '—')}</strong>
          </div>
        </div>
      </div>
    </div>

    <div class="detail-box">
      <h3>Escolha o intervalo</h3>
      <div class="interval-grid">
        <label>
          <span>Temporada</span>
          <select id="seasonSelect">${seasonOptions}</select>
        </label>

        <label>
          <span>Episódio inicial</span>
          <select id="episodeStartSelect" disabled>
            <option>Carregando...</option>
          </select>
        </label>

        <label>
          <span>Episódio final</span>
          <select id="episodeEndSelect" disabled>
            <option>Carregando...</option>
          </select>
        </label>

        <label>
          <span>&nbsp;</span>
          <button id="calculateBtn">Calcular intervalo</button>
        </label>

        <div class="full actions">
          <button id="selectFullSeasonBtn" class="ghost">Selecionar temporada inteira</button>
        </div>
      </div>

      <div id="seasonSummary" class="detail-box">
        <p class="muted">Carregando temporada...</p>
      </div>

      <div id="intervalResult" class="detail-box hidden"></div>
    </div>
  `;

  document.getElementById('seasonSelect').addEventListener('change', async (event) => {
    await loadSeason(Number(event.target.value));
  });

  document.getElementById('calculateBtn').addEventListener('click', calculateSelectedRange);
  document.getElementById('selectFullSeasonBtn').addEventListener('click', selectFullSeason);

  if (validSeasons.length) {
    loadSeason(validSeasons[0].season_number);
  } else {
    document.getElementById('seasonSummary').innerHTML = '<p class="muted">Essa série não tem temporadas numeradas disponíveis.</p>';
  }
}

async function loadSeason(seasonNumber) {
  if (!state.selectedShow || !state.tvDetails) return;

  setStatus(`Carregando temporada ${seasonNumber}...`);
  state.currentSeason = seasonNumber;

  const startSelect = document.getElementById('episodeStartSelect');
  const endSelect = document.getElementById('episodeEndSelect');
  const summary = document.getElementById('seasonSummary');
  const intervalResult = document.getElementById('intervalResult');

  startSelect.disabled = true;
  endSelect.disabled = true;
  startSelect.innerHTML = '<option>Carregando...</option>';
  endSelect.innerHTML = '<option>Carregando...</option>';
  summary.innerHTML = '<p class="muted">Carregando episódios...</p>';
  intervalResult.classList.add('hidden');
  intervalResult.innerHTML = '';

  try {
    let seasonData = state.seasonCache.get(seasonNumber);

    if (!seasonData) {
      seasonData = await tmdbFetch(`/tv/${state.selectedShow}/season/${seasonNumber}`);
      state.seasonCache.set(seasonNumber, seasonData);
    }

    populateEpisodeSelectors(seasonData);
    renderSeasonSummary(seasonData);
    setStatus(`Temporada ${seasonNumber} carregada. Escolha o intervalo.`);
  } catch (error) {
    summary.innerHTML = `<p class="muted">Erro: ${escapeHtml(error.message)}</p>`;
    setStatus(error.message, true);
  }
}

function getFallbackRuntime() {
  return Number((state.tvDetails?.episode_run_time || [])[0] || 0);
}

function normalizeEpisodes(seasonData) {
  const fallbackRuntime = getFallbackRuntime();
  return (seasonData.episodes || []).map((episode) => ({
    episodeNumber: Number(episode.episode_number || 0),
    name: episode.name || `Episódio ${episode.episode_number}`,
    runtime: Number(episode.runtime || fallbackRuntime || 0),
    overview: episode.overview || ''
  }));
}

function populateEpisodeSelectors(seasonData) {
  const episodes = normalizeEpisodes(seasonData);
  const options = episodes.map((episode) => (
    `<option value="${episode.episodeNumber}">Ep ${episode.episodeNumber}</option>`
  )).join('');

  const startSelect = document.getElementById('episodeStartSelect');
  const endSelect = document.getElementById('episodeEndSelect');

  startSelect.innerHTML = options;
  endSelect.innerHTML = options;
  startSelect.disabled = false;
  endSelect.disabled = false;

  if (episodes.length) {
    startSelect.value = String(episodes[0].episodeNumber);
    endSelect.value = String(episodes[episodes.length - 1].episodeNumber);
  }
}

function renderSeasonSummary(seasonData) {
  const episodes = normalizeEpisodes(seasonData);
  const totalMinutes = episodes.reduce((sum, episode) => sum + episode.runtime, 0);
  const totalPrice = calculatePrice(totalMinutes);

  const episodeList = episodes.map((episode) => `
    <div class="episode-row">
      <div><strong>Ep ${episode.episodeNumber}</strong></div>
      <div>
        <strong>${escapeHtml(episode.name)}</strong>
        <span class="muted small">${episode.overview ? escapeHtml(episode.overview) : 'Sem descrição.'}</span>
      </div>
      <div><strong>${episode.runtime} min</strong></div>
    </div>
  `).join('');

  document.getElementById('seasonSummary').innerHTML = `
    <div class="kpis">
      <div class="kpi">
        <span>Temporada</span>
        <strong>${seasonData.season_number}</strong>
      </div>
      <div class="kpi">
        <span>Episódios</span>
        <strong>${episodes.length}</strong>
      </div>
      <div class="kpi">
        <span>Minutagem total</span>
        <strong>${minutesToText(totalMinutes)}</strong>
      </div>
      <div class="kpi">
        <span>Valor total</span>
        <strong>${formatCurrency(totalPrice)}</strong>
      </div>
    </div>

    <div class="list-grid">
      ${episodeList || '<p class="muted">Sem episódios disponíveis.</p>'}
    </div>
  `;
}

function selectFullSeason() {
  const seasonData = state.seasonCache.get(state.currentSeason);
  if (!seasonData) return;

  const episodes = normalizeEpisodes(seasonData);
  if (!episodes.length) return;

  document.getElementById('episodeStartSelect').value = String(episodes[0].episodeNumber);
  document.getElementById('episodeEndSelect').value = String(episodes[episodes.length - 1].episodeNumber);
  calculateSelectedRange();
}

function calculateSelectedRange() {
  const seasonData = state.seasonCache.get(state.currentSeason);
  if (!seasonData) {
    setStatus('Carregue a temporada primeiro.', true);
    return;
  }

  const episodes = normalizeEpisodes(seasonData);
  const start = Number(document.getElementById('episodeStartSelect').value);
  const end = Number(document.getElementById('episodeEndSelect').value);

  if (!start || !end) {
    setStatus('Escolha os episódios inicial e final.', true);
    return;
  }

  if (start > end) {
    setStatus('O episódio inicial não pode ser maior que o final.', true);
    return;
  }

  const selectedEpisodes = episodes.filter((episode) => episode.episodeNumber >= start && episode.episodeNumber <= end);
  const totalMinutes = selectedEpisodes.reduce((sum, episode) => sum + episode.runtime, 0);
  const totalPrice = calculatePrice(totalMinutes);

  const selectedList = selectedEpisodes.map((episode) => `
    <div class="episode-row">
      <div><strong>Ep ${episode.episodeNumber}</strong></div>
      <div><strong>${escapeHtml(episode.name)}</strong></div>
      <div><strong>${episode.runtime} min</strong></div>
    </div>
  `).join('');

  const result = document.getElementById('intervalResult');
  result.innerHTML = `
    <h3>Resultado do intervalo</h3>
    <div class="kpis">
      <div class="kpi">
        <span>Intervalo</span>
        <strong>Ep ${start} até ${end}</strong>
      </div>
      <div class="kpi">
        <span>Episódios somados</span>
        <strong>${selectedEpisodes.length}</strong>
      </div>
      <div class="kpi">
        <span>Minutagem</span>
        <strong>${totalMinutes} min</strong>
      </div>
      <div class="kpi">
        <span>Valor</span>
        <strong>${formatCurrency(totalPrice)}</strong>
      </div>
    </div>

    <p class="muted">Tempo formatado: ${minutesToText(totalMinutes)}</p>
    <div class="list-grid">${selectedList || '<p class="muted">Nenhum episódio no intervalo.</p>'}</div>
  `;
  result.classList.remove('hidden');
  setStatus(`Intervalo calculado: temporada ${state.currentSeason}, episódios ${start} a ${end}.`);
}

function recalculateCurrentSeason() {
  if (!state.currentSeason || !state.seasonCache.has(state.currentSeason)) return;
  renderSeasonSummary(state.seasonCache.get(state.currentSeason));

  const intervalResult = document.getElementById('intervalResult');
  if (intervalResult && !intervalResult.classList.contains('hidden')) {
    calculateSelectedRange();
  }
}

el.saveSettingsBtn.addEventListener('click', saveSettings);
el.resetPriceBtn.addEventListener('click', resetPrice);
el.searchBtn.addEventListener('click', searchShows);
el.searchInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') searchShows();
});

loadSettings();
window.loadShow = loadShow;
