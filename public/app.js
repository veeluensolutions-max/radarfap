/**
 * RadarFAP Brasil — Bento Minimalist High-Contrast UI
 * Integrado ao vivo com https://www2.facepe.br/editais/ e às 27 FAPs Estaduais + Federais
 */

let appState = {
  editais: [],
  faps: [],
  favoritos: [],
  pipeline: [],
  alertConfig: {},
  alerts: [],
  noticiasFacepe: [],
  syncHistory: []
};

let currentTab = 'dashboard';
let fapRegionFilter = 'ALL';
let fapUfFilter = 'ALL';
let onlyFavoritesFilter = false;
let regionQuickFilter = 'ALL';
let onlyOpenFacepeSwitch = true;
let activeBarKey = 'PE';

const KANBAN_STAGES = [
  { id: 'favorito', label: 'Triagem / Interesse', badge: 'bg-[#14181f] text-white' },
  { id: 'analise', label: 'Elegibilidade', badge: 'bg-[#e6e8ec] text-[#14181f]' },
  { id: 'elaboracao', label: 'Escrevendo Projeto', badge: 'bg-[#b6f53b] text-[#14181f]' },
  { id: 'documentacao', label: 'AgilFAP / Anexos', badge: 'bg-[#e6e8ec] text-[#14181f]' },
  { id: 'submetido', label: 'Submetido', badge: 'bg-[#14181f] text-[#b6f53b]' }
];

function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatCurrencyBRL(num = 0) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0
  }).format(Number(num) || 0);
}

function formatDateBr(isoStr = '') {
  if (!isoStr) return '—';
  const parts = isoStr.slice(0, 10).split('-');
  if (parts.length !== 3) return isoStr;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function getDaysRemaining(isoDate = '') {
  if (!isoDate) return null;
  const refToday = new Date('2026-11-10T00:00:00Z');
  const target = new Date(`${isoDate.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(target.getTime())) return null;
  return Math.ceil((target - refToday) / (1000 * 60 * 60 * 24));
}

function showToast(message) {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const el = document.createElement('div');
  el.className = 'px-5 py-3.5 rounded-full bg-[#14181f] text-white shadow-xl text-xs font-semibold flex items-center justify-between gap-3 border border-white/10';
  el.innerHTML = `
    <span class="flex items-center gap-2">
      <span class="w-2.5 h-2.5 rounded-full bg-[#b6f53b]"></span>
      <span>${escapeHtml(message)}</span>
    </span>
    <button class="text-[#8a92a0] hover:text-white">✕</button>
  `;
  el.querySelector('button').onclick = () => el.remove();
  container.appendChild(el);
  setTimeout(() => el.remove(), 4200);
}

function updateRealtimeBadge(isoTimestamp) {
  const badgeTxt = document.getElementById('realtimeBadgeText');
  if (!badgeTxt) return;
  const timeStr = isoTimestamp
    ? new Date(isoTimestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  badgeTxt.textContent = `Tempo Real Ativo • Sync ${timeStr}`;
}

function connectRealtimeStream() {
  try {
    const evtSource = new EventSource('/api/events');
    evtSource.onmessage = event => {
      try {
        const data = JSON.parse(event.data);
        if (data.lastSync) {
          updateRealtimeBadge(data.lastSync);
        }
        if (data.state) {
          appState = data.state;
          renderAll();
          if (data.type === 'auto_sync') {
            showToast('Radar atualizado automaticamente em tempo real com a FACEPE & FAPs!');
          }
        }
      } catch {}
    };
  // Fallback/Complemento Serverless (Vercel): sincroniza silenciosamente a cada 3 minutos
  setInterval(async () => {
    try {
      const res = await fetch('/api/sync', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        if (data.state) {
          appState = data.state;
          renderAll();
          updateRealtimeBadge(data.lastAutoSyncIso || new Date().toISOString());
        }
      }
    } catch {}
  }, 3 * 60 * 1000);
}

const LOCAL_STORAGE_KEY = 'radarfap_user_workspace_v1';
let portalPingStatus = {};

function saveWorkspaceBackup() {
  try {
    const manualEditais = (appState.editais || []).filter(e => e.curadoriaManual);
    const backup = {
      favoritos: appState.favoritos || [],
      pipeline: appState.pipeline || [],
      alertConfig: appState.alertConfig || {},
      manualEditais
    };
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(backup));
  } catch {}
}

function mergeWorkspaceBackup() {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return;
    const backup = JSON.parse(raw);
    if (Array.isArray(backup.favoritos) && backup.favoritos.length > 0) {
      appState.favoritos = [...new Set([...(appState.favoritos || []), ...backup.favoritos])];
    }
    if (Array.isArray(backup.pipeline) && backup.pipeline.length > 0) {
      const pipeMap = new Map((appState.pipeline || []).map(p => [p.id, p]));
      for (const bp of backup.pipeline) {
        pipeMap.set(bp.id, bp);
      }
      appState.pipeline = Array.from(pipeMap.values());
    }
    if (Array.isArray(backup.manualEditais) && backup.manualEditais.length > 0) {
      const edMap = new Map((appState.editais || []).map(e => [e.id, e]));
      for (const me of backup.manualEditais) {
        if (!edMap.has(me.id)) edMap.set(me.id, me);
      }
      appState.editais = Array.from(edMap.values());
    }
  } catch {}
}

async function fetchInitialState() {
  const res = await fetch('/api/state');
  appState = await res.json();
  mergeWorkspaceBackup();
  if (appState.lastAutoSyncIso) {
    updateRealtimeBadge(appState.lastAutoSyncIso);
  }
  populateFilterSelects();
  renderAll();
  connectRealtimeStream();
}

function populateFilterSelects() {
  const ufSelect = document.getElementById('filterUf');
  const quickUfSelect = document.getElementById('quickFormUf');
  const agSelect = document.getElementById('filterAgencia');
  const formAgSelect = document.getElementById('formEditalAgencia');

  const ufs = [...new Set(appState.faps.map(f => f.uf))];

  if (ufSelect && ufSelect.options.length <= 1) {
    ufs.forEach(uf => {
      const fap = appState.faps.find(f => f.uf === uf);
      const opt = document.createElement('option');
      opt.value = uf;
      opt.textContent = uf === 'BR' ? 'BR — Federal (CNPq/FINEP/CAPES/CONFAP)' : `${uf} — ${fap?.estado || uf} (${fap?.sigla || ''})`;
      ufSelect.appendChild(opt);
    });
  }

  if (quickUfSelect && quickUfSelect.options.length <= 3) {
    ufs.filter(u => u !== 'PE' && u !== 'BR').forEach(uf => {
      const fap = appState.faps.find(f => f.uf === uf);
      const opt = document.createElement('option');
      opt.value = uf;
      opt.textContent = `${uf} — ${fap?.estado || uf} (${fap?.sigla || ''})`;
      quickUfSelect.appendChild(opt);
    });
  }

  if (agSelect && agSelect.options.length <= 1) {
    appState.faps.forEach(fap => {
      const opt = document.createElement('option');
      opt.value = fap.sigla;
      opt.textContent = `${fap.sigla} (${fap.uf}) — ${fap.estado}`;
      agSelect.appendChild(opt);
    });
  }

  if (formAgSelect && formAgSelect.options.length === 0) {
    appState.faps.forEach(fap => {
      const opt = document.createElement('option');
      opt.value = fap.sigla;
      opt.textContent = `${fap.sigla} (${fap.uf}) — ${fap.nome}`;
      formAgSelect.appendChild(opt);
    });
  }
}

function renderAll() {
  saveWorkspaceBackup();
  document.getElementById('badgeTotalEditais').textContent = appState.editais.length;
  document.getElementById('badgePipelineCount').textContent = appState.pipeline.length;
  document.getElementById('badgeAlertsCount').textContent = appState.alerts.length;

  renderDashboard();
  renderEditaisTab();
  renderFapsDirectory();
  renderPipelineKanban();
  renderAlertasTab();
}

// ===================== TAB NAVIGATION =====================
window.switchTab = function switchTab(tabName) {
  currentTab = tabName;
  document.querySelectorAll('.tab-panel').forEach(panel => {
    panel.classList.toggle('hidden', panel.id !== `tab-${tabName}`);
  });
  document.querySelectorAll('header .pill-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });
};

// ===================== 1. RENDER BENTO DASHBOARD =====================
function renderDashboard() {
  const totalEditais = appState.editais.length;
  const openEditais = appState.editais.filter(e => e.status === 'Aberto');
  const facepeEditais = appState.editais.filter(e => e.agencia === 'FACEPE' || e.uf === 'PE');

  const subtitleEl = document.getElementById('graphicsTotalSubtitle');
  if (subtitleEl) {
    subtitleEl.textContent = `${totalEditais} editais ativos • ${facepeEditais.length} FACEPE (PE) • ${openEditais.length} abertos`;
  }

  const peakBadge = document.getElementById('peakBadgeText');
  if (peakBadge) {
    peakBadge.textContent = `${facepeEditais.length} PE`;
  }

  const lineSub = document.getElementById('lineChartSubtitle');
  if (lineSub) {
    lineSub.textContent = `${facepeEditais.length} chamadas FACEPE • ${appState.noticiasFacepe.length} comunicados`;
  }

  // 1A. Gráfico de Barras Verticais em Cápsulas Verde-Lima ("Graphics 2")
  const barGroups = [
    { key: 'NE', label: 'NE', count: appState.editais.filter(e => e.regiao === 'Nordeste').length, pct: 82 },
    { key: 'PE', label: 'PE', count: facepeEditais.length, pct: 92 },
    { key: 'BR', label: 'Fed', count: appState.editais.filter(e => e.regiao === 'Federal').length, pct: 64 },
    { key: 'SE', label: 'SE', count: appState.editais.filter(e => e.regiao === 'Sudeste').length, pct: 54 },
    { key: 'NO', label: 'Nor', count: appState.editais.filter(e => e.regiao === 'Norte').length, pct: 70 },
    { key: 'CO', label: 'CO', count: appState.editais.filter(e => e.regiao === 'Centro-Oeste').length, pct: 48 },
    { key: 'SUL', label: 'Sul', count: appState.editais.filter(e => e.regiao === 'Sul').length, pct: 42 },
    { key: 'FAV', label: 'Fav', count: appState.favoritos.length, pct: 58 }
  ];

  const chartEl = document.getElementById('verticalCapsuleChart');
  if (chartEl) {
    chartEl.innerHTML = barGroups.map(b => {
      const isSelected = activeBarKey === b.key;
      return `
        <div
          onclick="window.selectDashboardBar('${b.key}')"
          class="flex flex-col items-center gap-3 cursor-pointer group"
          title="${b.label}: ${b.count} editais (clique para filtrar)"
        >
          <div class="bar-track-vertical group-hover:scale-105 transition">
            <div class="bar-fill-lime" style="height: ${b.pct}%"></div>
          </div>
          <span class="${
            isSelected
              ? 'px-2.5 py-0.5 rounded-full bg-[#b6f53b] text-[#14181f] text-[11px] font-extrabold shadow'
              : 'text-[11px] text-[#7e8694] font-semibold group-hover:text-white'
          }">
            ${b.label}
          </span>
        </div>
      `;
    }).join('');
  }

  // 1B. Card Branco "Direct messages" -> Editais FACEPE Ao Vivo
  const facepeDirectList = document.getElementById('facepeDirectList');
  const sourceFacepe = onlyOpenFacepeSwitch
    ? facepeEditais.filter(e => e.status === 'Aberto')
    : facepeEditais;

  const listToShow = (sourceFacepe.length ? sourceFacepe : facepeEditais).slice(0, 5);

  const areaAvatarIcons = {
    'Bolsas & Pós-Graduação': { bg: 'bg-[#f1f3f6]', icon: '🎓' },
    'Inovação & Startups': { bg: 'bg-[#f1f3f6]', icon: '🚀' },
    'Governo & Gestão Pública': { bg: 'bg-[#f1f3f6]', icon: '🏛️' },
    'Pesquisa Científica (APQ / Missões)': { bg: 'bg-[#f1f3f6]', icon: '🔬' },
    'Cooperação Internacional': { bg: 'bg-[#f1f3f6]', icon: '🌍' }
  };

  if (facepeDirectList) {
    facepeDirectList.innerHTML = listToShow.map((ed, idx) => {
      const av = areaAvatarIcons[ed.area] || { bg: 'bg-[#f1f3f6]', icon: '📄' };
      const badgeRight = ed.prorrogado
        ? `<span class="w-5 h-5 rounded-full bg-[#b6f53b] text-[#14181f] text-[10px] font-extrabold inline-flex items-center justify-center shrink-0" title="Prazo Prorrogado!">!</span>`
        : (ed.anexos?.length
            ? `<span class="w-5 h-5 rounded-full bg-[#14181f] text-white text-[10px] font-bold inline-flex items-center justify-center shrink-0" title="${ed.anexos.length} anexo(s)">${ed.anexos.length}</span>`
            : (idx === 0 ? `<span class="w-5 h-5 rounded-full bg-[#14181f] text-white text-[10px] font-bold inline-flex items-center justify-center shrink-0">1</span>` : ''));

      return `
        <div
          onclick="window.openDetailModal('${ed.id}')"
          class="py-3 flex items-center justify-between gap-3 cursor-pointer hover:bg-[#f9fafb] px-2 -mx-2 rounded-xl transition"
        >
          <div class="flex items-center gap-3 min-w-0">
            <div class="w-10 h-10 rounded-xl ${av.bg} flex items-center justify-center text-base shrink-0 shadow-inner">
              ${av.icon}
            </div>
            <div class="min-w-0">
              <div class="text-xs font-bold text-[#14181f] truncate">
                Edital ${escapeHtml(ed.numero)} • ${escapeHtml(ed.titulo.replace(/^Edital FACEPE nº \d+\/\d+\s*[–—-]\s*/i, ''))}
              </div>
              <div class="text-[11px] text-[#8a92a0] truncate mt-0.5">
                Prazo: ${formatDateBr(ed.prazoSubmissao)} • ${escapeHtml(ed.area)}
              </div>
            </div>
          </div>
          ${badgeRight}
        </div>
      `;
    }).join('');
  }

  // 1C. Card Branco de 4 Categorias com Seta Circular (Idêntico ao topo-direito da imagem)
  const categoryCard = document.getElementById('categoryQuickCard');
  if (categoryCard) {
    const categories = [
      {
        title: 'Pesquisa & Missões',
        count: `${appState.editais.filter(e => e.area === 'Pesquisa Científica (APQ / Missões)').length} editais`,
        highlightLime: false,
        action: "window.filterByArea('Pesquisa Científica (APQ / Missões)')",
        svg: `<svg class="w-5 h-5 text-[#14181f]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" stroke-width="1.8"/><path stroke-linecap="round" stroke-width="1.8" d="M3.6 9h16.8M3.6 15h16.8M12 3a15 15 0 010 18M12 3a15 15 0 000 18"/></svg>`
      },
      {
        title: 'Alertas & Prorrogações',
        count: `${appState.alerts.length} avisos ativos`,
        highlightLime: true,
        action: "window.switchTab('alertas')",
        svg: `<svg class="w-5 h-5 text-[#14181f]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/></svg>`
      },
      {
        title: 'Bolsas & Startups',
        count: `${appState.editais.filter(e => e.area === 'Bolsas & Pós-Graduação' || e.area === 'Inovação & Startups').length} chamadas`,
        highlightLime: false,
        action: "window.filterByArea('Bolsas & Pós-Graduação')",
        svg: `<svg class="w-5 h-5 text-[#14181f]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>`
      },
      {
        title: 'Favoritos & Pipeline',
        count: `${appState.favoritos.length} salvos • ${appState.pipeline.length} projetos`,
        highlightLime: false,
        action: "window.switchTab('pipeline')",
        svg: `<svg class="w-5 h-5 text-[#14181f]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/></svg>`
      }
    ];

    categoryCard.innerHTML = categories.map(cat => `
      <div onclick="${cat.action}" class="py-3 flex items-center justify-between gap-3 cursor-pointer group">
        <div class="flex items-center gap-3.5">
          <div class="w-9 h-9 rounded-full bg-[#f5f6f8] flex items-center justify-center shrink-0">
            ${cat.svg}
          </div>
          <div>
            <div class="text-xs font-bold text-[#14181f] group-hover:underline">${cat.title}</div>
            <div class="text-[11px] text-[#8a92a0]">${cat.count}</div>
          </div>
        </div>
        <button class="${cat.highlightLime ? 'circle-icon-lime' : 'circle-icon-dark'} !w-7 !h-7 text-xs font-bold">
          →
        </button>
      </div>
    `).join('');
  }

  // 1D. Ticker da última notícia oficial da FACEPE no card escuro largo
  const ticker = document.getElementById('latestFacepeTicker');
  const firstNews = (appState.noticiasFacepe || [])[0];
  if (ticker && firstNews) {
    ticker.innerHTML = `
      <div class="flex items-center gap-2 min-w-0">
        <span class="px-2 py-0.5 rounded-full bg-[#b6f53b] text-[#14181f] text-[10px] font-extrabold shrink-0">Notícia FACEPE</span>
        <a href="${escapeHtml(firstNews.link)}" target="_blank" rel="noopener" class="text-[#c5cbd6] hover:text-white truncate font-medium">
          ${escapeHtml(firstNews.titulo)}
        </a>
      </div>
      <span class="text-[#6c7483] shrink-0">${formatDateBr(firstNews.data)}</span>
    `;
  }
}

window.toggleFacepeOpenSwitch = function toggleFacepeOpenSwitch() {
  onlyOpenFacepeSwitch = !onlyOpenFacepeSwitch;
  const sw = document.getElementById('toggleOnlyOpenFacepe');
  if (sw) sw.classList.toggle('off', !onlyOpenFacepeSwitch);
  renderDashboard();
};

window.selectDashboardBar = function selectDashboardBar(key) {
  activeBarKey = key;
  renderDashboard();
  if (key === 'PE') {
    window.filterByFap('FACEPE');
  } else if (key === 'BR') {
    window.applyQuickFilter('federais');
    window.switchTab('editais');
  } else if (key === 'FAV') {
    window.applyQuickFilter('favoritos');
    window.switchTab('editais');
  } else {
    const mapReg = { NE: 'Nordeste', SE: 'Sudeste', NO: 'Norte', CO: 'Centro-Oeste', SUL: 'Sul' };
    if (mapReg[key]) window.filterByRegion(mapReg[key]);
  }
};

window.quickDashboardRegion = function quickDashboardRegion(mode, btnEl) {
  document.querySelectorAll('.dash-pill').forEach(b => b.classList.remove('active'));
  if (btnEl) btnEl.classList.add('active');
  if (mode === 'PE') {
    window.filterByFap('FACEPE');
  } else if (mode === 'Federal') {
    window.applyQuickFilter('federais');
    window.switchTab('editais');
  } else if (mode === 'Nordeste') {
    window.filterByRegion('Nordeste');
  } else {
    window.applyQuickFilter('reset');
    window.switchTab('editais');
  }
};

window.runQuickFormSearch = function runQuickFormSearch() {
  const kw = document.getElementById('quickFormKeyword')?.value || '';
  const uf = document.getElementById('quickFormUf')?.value || 'ALL';
  const area = document.getElementById('quickFormArea')?.value || 'ALL';
  const onlyOpen = document.getElementById('quickFormOnlyOpen')?.checked;

  onlyFavoritesFilter = false;
  regionQuickFilter = 'ALL';
  document.getElementById('filterSearch').value = kw;
  document.getElementById('filterUf').value = uf;
  document.getElementById('filterAgencia').value = 'ALL';
  document.getElementById('filterArea').value = area;
  document.getElementById('filterStatus').value = onlyOpen ? 'Aberto' : 'ALL';

  window.switchTab('editais');
  renderEditaisTab();
};

// ===================== 2. RENDER PAINEL DE EDITAIS =====================
function getFilteredEditais() {
  const search = (document.getElementById('filterSearch')?.value || '').trim().toLowerCase();
  const uf = document.getElementById('filterUf')?.value || 'ALL';
  const agencia = document.getElementById('filterAgencia')?.value || 'ALL';
  const area = document.getElementById('filterArea')?.value || 'ALL';
  const status = document.getElementById('filterStatus')?.value || 'ALL';
  const sort = document.getElementById('filterSort')?.value || 'recentes';

  let list = [...appState.editais];

  if (onlyFavoritesFilter) {
    list = list.filter(e => appState.favoritos.includes(e.id));
  }
  if (regionQuickFilter !== 'ALL') {
    list = list.filter(e => e.regiao === regionQuickFilter);
  }
  if (uf !== 'ALL') {
    list = list.filter(e => e.uf === uf);
  }
  if (agencia !== 'ALL') {
    list = list.filter(e => e.agencia === agencia);
  }
  if (area !== 'ALL') {
    list = list.filter(e => e.area === area);
  }
  if (status === 'PRORROGADO') {
    list = list.filter(e => e.prorrogado);
  } else if (status !== 'ALL') {
    list = list.filter(e => e.status === status);
  }
  if (search) {
    list = list.filter(e => {
      const hay = `${e.numero} ${e.titulo} ${e.agencia} ${e.uf} ${e.estado} ${e.area} ${e.resumo} ${e.publicoAlvo}`.toLowerCase();
      return hay.includes(search);
    });
  }

  if (sort === 'match') {
    list.sort((a, b) => (Number(b.matchScore) || 0) - (Number(a.matchScore) || 0));
  } else if (sort === 'recentes') {
    list.sort((a, b) => (b.dataPublicacao || '').localeCompare(a.dataPublicacao || ''));
  } else if (sort === 'prazo') {
    list.sort((a, b) => (a.prazoSubmissao || '9999').localeCompare(b.prazoSubmissao || '9999'));
  } else if (sort === 'valor') {
    list.sort((a, b) => (Number(b.valorNumerico) || 0) - (Number(a.valorNumerico) || 0));
  }

  return list;
}

function renderEditaisTab() {
  const filtered = getFilteredEditais();
  const countLabel = document.getElementById('editaisCountLabel');
  if (countLabel) {
    countLabel.textContent = `${filtered.length} oportunidades encontradas de ${appState.editais.length} monitoradas no Brasil`;
  }

  const grid = document.getElementById('editaisGrid');
  if (!grid) return;

  if (filtered.length === 0) {
    grid.innerHTML = `
      <div class="col-span-2 bento-light p-12 text-center space-y-3">
        <div class="text-base font-bold text-[#14181f]">Nenhum edital encontrado para este filtro</div>
        <p class="text-xs text-[#8a92a0]">Limpe os filtros ou cadastre um novo edital manualmente.</p>
        <button onclick="window.applyQuickFilter('reset')" class="btn-pill-dark">Limpar Filtros</button>
      </div>
    `;
    return;
  }

  grid.innerHTML = filtered.map(ed => {
    const isFav = appState.favoritos.includes(ed.id);
    const inPipeline = appState.pipeline.some(p => p.editalId === ed.id);
    const daysLeft = getDaysRemaining(ed.prazoSubmissao);

    const statusBadge = ed.status === 'Aberto'
      ? `<span class="px-3 py-1 rounded-full text-[11px] font-extrabold bg-[#b6f53b] text-[#14181f]">Aberto</span>`
      : `<span class="px-3 py-1 rounded-full text-[11px] font-semibold bg-[#f1f3f6] text-[#5a6270]">${escapeHtml(ed.status)}</span>`;

    const prorrogBadge = ed.prorrogado
      ? `<span class="px-2.5 py-1 rounded-full text-[11px] font-bold bg-[#14181f] text-[#b6f53b]">⚡ Prorrogado</span>`
      : '';

    const matchBadge = ed.matchScore
      ? `<span class="px-2.5 py-1 rounded-full text-[11px] font-extrabold ${ed.matchScore >= 85 ? 'bg-[#14181f] text-[#b6f53b]' : 'bg-[#f1f3f6] text-[#14181f]'}">${ed.matchScore}% Match</span>`
      : '';

    return `
      <article class="bento-light bento-hover p-6 flex flex-col justify-between gap-5">
        <div class="space-y-3.5">
          <!-- Topo do Card -->
          <div class="flex items-center justify-between gap-2">
            <div class="flex flex-wrap items-center gap-1.5">
              <span class="px-3 py-1 rounded-full text-xs font-extrabold bg-[#14181f] text-white">
                ${escapeHtml(ed.agencia)} • ${escapeHtml(ed.uf)}
              </span>
              <span class="px-2.5 py-1 rounded-full text-xs font-bold bg-[#f1f3f6] text-[#14181f]">
                Nº ${escapeHtml(ed.numero)}
              </span>
              ${statusBadge}
              ${prorrogBadge}
              ${matchBadge}
            </div>

            <button
              onclick="window.toggleFavorite('${ed.id}')"
              class="w-8 h-8 rounded-full inline-flex items-center justify-center text-sm transition ${
                isFav ? 'bg-[#14181f] text-[#b6f53b]' : 'bg-[#f1f3f6] text-[#8a92a0] hover:text-[#14181f]'
              }"
              title="Favoritar edital"
            >
              ★
            </button>
          </div>

          <!-- Título -->
          <h3
            onclick="window.openDetailModal('${ed.id}')"
            class="text-base font-extrabold text-[#14181f] hover:underline cursor-pointer leading-snug"
          >
            ${escapeHtml(ed.titulo)}
          </h3>

          <p class="text-xs text-[#68707e] leading-relaxed line-clamp-2">
            ${escapeHtml(ed.resumo)}
          </p>

          <!-- Metadados Clean -->
          <div class="grid grid-cols-2 gap-3 p-3.5 rounded-2xl bg-[#f6f7f9] text-xs">
            <div>
              <span class="text-[#8a92a0] block text-[11px]">Linha de Fomento</span>
              <strong class="text-[#14181f]">${escapeHtml(ed.area)}</strong>
            </div>
            <div>
              <span class="text-[#8a92a0] block text-[11px]">Prazo Final</span>
              <strong class="text-[#14181f]">${formatDateBr(ed.prazoSubmissao)}</strong>
              ${ed.status === 'Aberto' && daysLeft !== null && daysLeft >= 0 ? `<span class="text-[11px] font-bold text-[#5a6270]"> (${daysLeft}d)</span>` : ''}
            </div>
            <div class="col-span-2">
              <span class="text-[#8a92a0] block text-[11px]">Recursos / Bolsas</span>
              <strong class="text-[#14181f]">${escapeHtml(ed.valorEstimado)}</strong>
            </div>
          </div>
        </div>

        <!-- Rodapé com Botões Pílula + Círculo Seta (Fiel à imagem) -->
        <div class="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-[#f1f3f6]">
          <div class="flex items-center gap-2">
            <button onclick="window.openDetailModal('${ed.id}')" class="btn-pill-dark">
              <span>Detalhes ${ed.anexos?.length ? `(${ed.anexos.length})` : ''}</span>
            </button>
            <a href="${escapeHtml(ed.linkPdf)}" target="_blank" rel="noopener" class="btn-pill-outline-light" title="Baixar PDF Oficial">
              PDF Oficial ↗
            </a>
          </div>

          <div class="flex items-center gap-1.5">
            <button
              onclick="window.addToPipeline('${ed.id}')"
              class="${inPipeline ? 'btn-pill-lime' : 'btn-pill-outline-light'}"
            >
              ${inPipeline ? '✓ No Pipeline' : '+ Submeter'}
            </button>
            <button
              onclick="window.openEditEditalModal('${ed.id}')"
              class="circle-icon-dark"
              title="Editar edital"
            >
              ✎
            </button>
          </div>
        </div>
      </article>
    `;
  }).join('');
}

// ===================== 3. RENDER DIRETÓRIO DAS 27 FAPS + FEDERAIS & MAPA GEOGRÁFICO =====================
let selectedMapUf = 'PE';

const BRAZIL_GEO_MATRIX = [
  [null, 'RR', 'AP', null, null, null, null],
  ['AM', 'PA', 'MA', 'CE', 'RN', null, null],
  ['AC', 'RO', 'TO', 'PI', 'PB', 'PE', null],
  [null, 'MT', 'GO', 'DF', 'BA', 'AL', 'SE'],
  [null, 'MS', 'MG', 'ES', 'RJ', null, null],
  [null, null, 'SP', 'PR', null, null, null],
  [null, null, null, 'SC', 'RS', null, 'BR']
];

window.selectMapState = function selectMapState(uf) {
  selectedMapUf = uf;
  renderFapsDirectory();
};

function renderBrazilGeoMap() {
  const mapEl = document.getElementById('brazilGeoGridMap');
  const inspectorEl = document.getElementById('selectedStateInspector');
  if (!mapEl || !inspectorEl) return;

  mapEl.innerHTML = `
    <div class="grid grid-cols-7 gap-2 min-w-[440px]">
      ${BRAZIL_GEO_MATRIX.flat().map(cellUf => {
        if (!cellUf) {
          return `<div class="h-12 rounded-2xl bg-white/[0.02]"></div>`;
        }
        const fap = appState.faps.find(f => f.uf === cellUf);
        const count = appState.editais.filter(e => e.uf === cellUf).length;
        const isSelected = selectedMapUf === cellUf;
        const isPe = cellUf === 'PE';

        return `
          <button
            onclick="window.selectMapState('${cellUf}')"
            class="h-12 rounded-2xl px-2 flex flex-col items-center justify-center transition ${
              isSelected
                ? 'bg-[#b6f53b] text-[#14181f] shadow-lg scale-105 font-extrabold'
                : isPe
                  ? 'bg-white text-[#14181f] font-extrabold hover:bg-[#b6f53b]'
                  : 'bg-[#0d1015] text-white hover:bg-white/15 border border-white/10 font-bold'
            }"
            title="${fap?.estado || cellUf}: ${count} edital(is)"
          >
            <span class="text-xs leading-none">${cellUf === 'BR' ? 'FED' : cellUf}</span>
            <span class="text-[10px] opacity-75 mt-0.5">${count} ed.</span>
          </button>
        `;
      }).join('')}
    </div>
  `;

  const selectedFaps = appState.faps.filter(f => f.uf === selectedMapUf);
  const fap = selectedFaps[0] || appState.faps[0];
  const stateEditais = appState.editais.filter(e => e.uf === selectedMapUf);

  inspectorEl.innerHTML = `
    <div class="space-y-4">
      <div class="flex items-start justify-between gap-2 border-b border-[#f1f3f6] pb-3.5">
        <div>
          <div class="flex items-center gap-2">
            <span class="px-3 py-0.5 rounded-full text-xs font-extrabold bg-[#b6f53b] text-[#14181f]">
              ${escapeHtml(fap.uf)} • ${escapeHtml(fap.regiao)}
            </span>
            <h4 class="text-base font-extrabold text-[#14181f]">${escapeHtml(fap.sigla)}</h4>
          </div>
          <p class="text-xs text-[#68707e] mt-1 font-medium">${escapeHtml(fap.nome)}</p>
        </div>
        <span class="px-3 py-1 rounded-full bg-[#14181f] text-white text-xs font-bold shrink-0">
          ${stateEditais.length} edital(is)
        </span>
      </div>

      <div class="grid grid-cols-2 gap-2.5 text-xs bg-[#f6f7f9] p-3.5 rounded-2xl">
        <div>
          <span class="text-[#8a92a0] block text-[11px]">Plataforma Oficial</span>
          <strong class="text-[#14181f]">${escapeHtml(fap.plataformaSubmissao)}</strong>
        </div>
        <div>
          <span class="text-[#8a92a0] block text-[11px]">Orçamento Anual Est.</span>
          <strong class="text-[#14181f]">${escapeHtml(fap.orcamentoAnualEstimado || 'Consulte Portal')}</strong>
        </div>
      </div>

      <div class="space-y-2">
        <div class="text-xs font-bold text-[#14181f]">Oportunidades em destaque (${escapeHtml(fap.uf)}):</div>
        <div class="space-y-1.5 max-h-36 overflow-y-auto pr-1">
          ${stateEditais.slice(0, 4).map(ed => `
            <div onclick="window.openDetailModal('${ed.id}')" class="p-2.5 rounded-xl bg-[#f6f7f9] hover:bg-[#ebedf2] cursor-pointer flex items-center justify-between gap-2 text-xs transition">
              <span class="font-bold text-[#14181f] truncate">${escapeHtml(ed.numero)} — ${escapeHtml(ed.titulo)}</span>
              <span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white text-[#14181f] shrink-0">${formatDateBr(ed.prazoSubmissao)}</span>
            </div>
          `).join('')}
        </div>
      </div>
    </div>

    <div class="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-[#f1f3f6]">
      <div class="flex items-center gap-1.5">
        <button onclick="window.filterByFap('${escapeHtml(fap.sigla)}')" class="btn-pill-dark">
          Filtrar ${escapeHtml(fap.uf)} (${stateEditais.length})
        </button>
        <button onclick="window.pingFapPortal('${escapeHtml(fap.sigla)}')" class="btn-pill-outline-light" title="Testar disponibilidade do portal ao vivo">
          ${portalPingStatus[fap.sigla] ? `🟢 ${portalPingStatus[fap.sigla]}ms` : '⚡ Testar Portal'}
        </button>
      </div>
      <div class="flex items-center gap-1.5">
        <a href="${escapeHtml(fap.urlEditais)}" target="_blank" rel="noopener" class="btn-pill-outline-light">
          Portal ↗
        </a>
        <a href="${escapeHtml(fap.urlPlataforma || fap.siteOficial)}" target="_blank" rel="noopener" class="circle-icon-lime" title="Sistema de Submissão">
          →
        </a>
      </div>
    </div>
  `;
}

window.pingFapPortal = async function pingFapPortal(sigla) {
  showToast(`Testando conexão ao vivo com o portal da ${sigla}...`);
  try {
    const res = await fetch('/api/faps/ping', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sigla })
    });
    const data = await res.json();
    if (data.ok) {
      portalPingStatus[sigla] = data.latencyMs;
      renderBrazilGeoMap();
      showToast(
        data.portalOk
          ? `Portal ${sigla} (${data.uf}) Online! Tempo de resposta: ${data.latencyMs}ms.`
          : `Portal ${sigla} respondeu com instabilidade (${data.latencyMs}ms).`
      );
    }
  } catch (err) {
    showToast(`Erro ao testar portal: ${err.message}`);
  }
};

function renderFapsDirectory() {
  renderBrazilGeoMap();
  const pillsBar = document.getElementById('ufPillsBar');
  const search = (document.getElementById('fapSearchInput')?.value || '').trim().toLowerCase();

  const allUfs = ['ALL', ...new Set(appState.faps.map(f => f.uf))];
  if (pillsBar) {
    pillsBar.innerHTML = allUfs.map(uf => {
      const active = fapUfFilter === uf;
      return `
        <button
          onclick="window.setFapUfFilter('${uf}')"
          class="px-3 py-1 rounded-full text-xs font-bold transition ${
            active
              ? 'bg-[#14181f] text-white'
              : uf === 'PE'
                ? 'bg-[#b6f53b] text-[#14181f]'
                : 'bg-[#f1f3f6] text-[#5a6270] hover:text-[#14181f]'
          }"
        >
          ${uf === 'ALL' ? 'Todas UFs' : uf}
        </button>
      `;
    }).join('');
  }

  let faps = [...appState.faps];
  if (fapRegionFilter !== 'ALL') {
    faps = faps.filter(f => f.regiao === fapRegionFilter);
  }
  if (fapUfFilter !== 'ALL') {
    faps = faps.filter(f => f.uf === fapUfFilter);
  }
  if (search) {
    faps = faps.filter(f =>
      `${f.sigla} ${f.nome} ${f.uf} ${f.estado} ${f.regiao} ${f.plataformaSubmissao}`.toLowerCase().includes(search)
    );
  }

  const grid = document.getElementById('fapsGrid');
  if (!grid) return;

  grid.innerHTML = faps.map(fap => {
    const isFacepe = fap.sigla === 'FACEPE';
    return `
      <div class="${isFacepe ? 'bento-dark' : 'bento-light'} bento-hover p-6 flex flex-col justify-between gap-5">
        <div class="space-y-3">
          <div class="flex items-start justify-between gap-2">
            <div>
              <div class="flex items-center gap-2">
                <span class="px-2.5 py-0.5 rounded-full text-xs font-extrabold ${
                  isFacepe ? 'bg-[#b6f53b] text-[#14181f]' : 'bg-[#14181f] text-white'
                }">
                  ${escapeHtml(fap.uf)}
                </span>
                <h3 class="text-base font-extrabold ${isFacepe ? 'text-white' : 'text-[#14181f]'}">
                  ${escapeHtml(fap.sigla)}
                </h3>
              </div>
              <p class="text-xs font-medium ${isFacepe ? 'text-[#9aa2b1]' : 'text-[#68707e]'} mt-1">
                ${escapeHtml(fap.nome)}
              </p>
            </div>
            <span class="px-3 py-1 rounded-full text-xs font-bold ${
              isFacepe ? 'bg-white/10 text-[#b6f53b]' : 'bg-[#f1f3f6] text-[#14181f]'
            } shrink-0">
              ${fap.totalEditaisMonitorados} ed.
            </span>
          </div>

          <div class="p-3.5 rounded-2xl ${isFacepe ? 'bg-[#0d1015]' : 'bg-[#f6f7f9]'} space-y-1.5 text-xs">
            <div class="flex items-center justify-between">
              <span class="text-[#8a92a0]">Estado / Região</span>
              <strong class="${isFacepe ? 'text-white' : 'text-[#14181f]'}">${escapeHtml(fap.estado)} (${escapeHtml(fap.regiao)})</strong>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-[#8a92a0]">Plataforma</span>
              <strong class="${isFacepe ? 'text-[#b6f53b]' : 'text-[#14181f]'}">${escapeHtml(fap.plataformaSubmissao)}</strong>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-[#8a92a0]">Orçamento Est.</span>
              <span class="font-semibold ${isFacepe ? 'text-white' : 'text-[#14181f]'}">${escapeHtml(fap.orcamentoAnualEstimado || 'Consulte')}</span>
            </div>
          </div>
        </div>

        <div class="flex items-center justify-between gap-2 pt-3 border-t ${isFacepe ? 'border-white/10' : 'border-[#f1f3f6]'}">
          <button
            onclick="window.filterByFap('${escapeHtml(fap.sigla)}')"
            class="${isFacepe ? 'btn-pill-lime' : 'btn-pill-dark'}"
          >
            Ver Editais (${fap.totalEditaisMonitorados})
          </button>

          <div class="flex items-center gap-1.5">
            <a
              href="${escapeHtml(fap.urlEditais)}"
              target="_blank"
              rel="noopener"
              class="${isFacepe ? 'btn-pill-outline-dark' : 'btn-pill-outline-light'}"
            >
              Portal ↗
            </a>
            <a
              href="${escapeHtml(fap.urlPlataforma || fap.siteOficial)}"
              target="_blank"
              rel="noopener"
              class="${isFacepe ? 'circle-icon-lime' : 'circle-icon-dark'}"
              title="Abrir plataforma de submissão"
            >
              →
            </a>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// ===================== 4. RENDER PIPELINE KANBAN =====================
function renderPipelineKanban() {
  const summaryEl = document.getElementById('pipelineSummaryStats');
  const totalVal = appState.pipeline.reduce((acc, p) => acc + (Number(p.valorPleiteado) || 0), 0);

  if (summaryEl) {
    summaryEl.innerHTML = `
      <div class="px-4 py-2 rounded-full bg-[#0d1015] text-xs">
        <span class="text-[#8a92a0]">Volume Pleiteado:</span>
        <strong class="text-[#b6f53b] ml-1.5 text-sm">${formatCurrencyBRL(totalVal)}</strong>
      </div>
      <div class="px-4 py-2 rounded-full bg-white text-[#14181f] text-xs font-bold">
        ${appState.pipeline.length} Projetos Ativos
      </div>
    `;
  }

  const board = document.getElementById('kanbanBoard');
  if (!board) return;

  board.innerHTML = KANBAN_STAGES.map(stage => {
    const items = appState.pipeline.filter(p => p.estagio === stage.id);
    return `
      <div class="bento-tray space-y-3">
        <div class="flex items-center justify-between px-2 pt-1">
          <span class="px-3 py-1 rounded-full text-xs font-bold ${stage.badge}">
            ${stage.label}
          </span>
          <span class="w-6 h-6 rounded-full bg-white text-[#14181f] text-xs font-bold inline-flex items-center justify-center">
            ${items.length}
          </span>
        </div>

        <div class="space-y-3 min-h-[160px]">
          ${items.length === 0 ? `
            <div class="bento-light p-6 text-center text-xs text-[#8a92a0]">
              Nenhuma proposta nesta etapa
            </div>
          ` : items.map(item => {
            const ed = appState.editais.find(e => e.id === item.editalId) || {
              titulo: 'Edital Associado',
              agencia: 'FACEPE',
              uf: 'PE',
              numero: 'S/N',
              prazoSubmissao: '2026-12-01'
            };
            const doneCount = (item.checklist || []).filter(c => c.concluido).length;
            const totalChecks = (item.checklist || []).length || 1;

            return `
              <div class="bento-light p-4 space-y-3">
                <div class="flex items-center justify-between gap-1">
                  <span class="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-[#14181f] text-white">
                    ${escapeHtml(ed.agencia)} (${escapeHtml(ed.uf)}) • ${escapeHtml(ed.numero)}
                  </span>
                  <button
                    onclick="window.removePipelineItem('${item.id}')"
                    class="text-[#8a92a0] hover:text-[#14181f] text-xs font-bold"
                  >
                    ✕
                  </button>
                </div>

                <h4
                  onclick="window.openDetailModal('${ed.id}')"
                  class="text-xs font-extrabold text-[#14181f] hover:underline cursor-pointer leading-snug"
                >
                  ${escapeHtml(ed.titulo)}
                </h4>

                <div class="flex items-center justify-between text-[11px] bg-[#f6f7f9] px-3 py-2 rounded-xl">
                  <span class="text-[#68707e]">Prazo: <strong class="text-[#14181f]">${formatDateBr(ed.prazoSubmissao)}</strong></span>
                  <strong class="text-[#14181f]">${formatCurrencyBRL(item.valorPleiteado)}</strong>
                </div>

                <!-- Checklist -->
                <div class="space-y-1.5">
                  <div class="flex items-center justify-between text-[10px] font-semibold text-[#8a92a0]">
                    <span>Progresso</span>
                    <span>${doneCount}/${(item.checklist || []).length}</span>
                  </div>
                  <div class="w-full h-1.5 bg-[#ebedf0] rounded-full overflow-hidden">
                    <div class="h-full bg-[#14181f]" style="width: ${Math.round((doneCount / totalChecks) * 100)}%"></div>
                  </div>
                  <div class="space-y-1 pt-1">
                    ${(item.checklist || []).map((ck, idx) => `
                      <label class="flex items-start gap-2 text-[11px] text-[#14181f] cursor-pointer">
                        <input
                          type="checkbox"
                          ${ck.concluido ? 'checked' : ''}
                          onchange="window.toggleChecklistItem('${item.id}', ${idx})"
                          class="mt-0.5 accent-[#14181f] rounded"
                        />
                        <span class="${ck.concluido ? 'line-through text-[#8a92a0]' : ''}">${escapeHtml(ck.texto)}</span>
                      </label>
                    `).join('')}
                  </div>
                </div>

                <div class="pt-2 border-t border-[#f1f3f6] space-y-2">
                  <select
                    onchange="window.movePipelineStage('${item.id}', this.value)"
                    class="w-full bg-[#f3f5f8] rounded-full px-3 py-1.5 text-[11px] font-semibold text-[#14181f] focus:outline-none"
                  >
                    ${KANBAN_STAGES.map(s => `
                      <option value="${s.id}" ${s.id === item.estagio ? 'selected' : ''}>Etapa: ${s.label}</option>
                    `).join('')}
                  </select>
                  <button
                    onclick="window.openPipelineModal('${item.id}')"
                    class="w-full py-1.5 px-3 rounded-full text-[11px] font-bold bg-[#14181f] text-white hover:bg-[#252b36] transition flex items-center justify-center gap-1.5"
                  >
                    <span>🧮 Orçamento &amp; Ficha</span>
                  </button>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }).join('');
}

// ===================== MODAL DE ORÇAMENTO E FICHA DA PROPOSTA (KANBAN) =====================
function updatePipeTotalPreview() {
  const custeio = Number(document.getElementById('pipeRubricaCusteio')?.value) || 0;
  const capital = Number(document.getElementById('pipeRubricaCapital')?.value) || 0;
  const bolsas = Number(document.getElementById('pipeRubricaBolsas')?.value) || 0;
  const total = custeio + capital + bolsas;
  const el = document.getElementById('pipeTotalCalculated');
  if (el) el.textContent = formatCurrencyBRL(total);
  return total;
}

window.openPipelineModal = function openPipelineModal(pipeId) {
  const item = appState.pipeline.find(p => p.id === pipeId);
  if (!item) return;
  const ed = appState.editais.find(e => e.id === item.editalId);

  document.getElementById('pipeModalTitle').textContent = `Planejamento — ${ed?.agencia || 'FAP'} (${ed?.numero || ''})`;
  document.getElementById('pipeFormId').value = item.id;
  document.getElementById('pipeFormPesquisador').value = item.pesquisadorResponsavel || 'Coordenação do Projeto';
  document.getElementById('pipeFormInstituicao').value = item.instituicao || 'UFPE / UFRPE / UPE / ICT';

  const totalBase = Number(item.valorPleiteado) || 180000;
  document.getElementById('pipeRubricaCusteio').value = item.rubricaCusteio ?? Math.round(totalBase * 0.45);
  document.getElementById('pipeRubricaCapital').value = item.rubricaCapital ?? Math.round(totalBase * 0.25);
  document.getElementById('pipeRubricaBolsas').value = item.rubricaBolsas ?? Math.round(totalBase * 0.30);
  document.getElementById('pipeFormNotas').value = item.notas || '';
  document.getElementById('pipeNewCheckItem').value = '';

  updatePipeTotalPreview();
  document.getElementById('pipelineEditModal').classList.remove('hidden');
};

window.closePipelineModal = function closePipelineModal() {
  document.getElementById('pipelineEditModal').classList.add('hidden');
};

window.printPipelineProposal = function printPipelineProposal() {
  const pipeId = document.getElementById('pipeFormId').value;
  const item = appState.pipeline.find(p => p.id === pipeId);
  if (!item) return;
  const ed = appState.editais.find(e => e.id === item.editalId) || {};
  const custeio = Number(document.getElementById('pipeRubricaCusteio').value) || 0;
  const capital = Number(document.getElementById('pipeRubricaCapital').value) || 0;
  const bolsas = Number(document.getElementById('pipeRubricaBolsas').value) || 0;
  const total = custeio + capital + bolsas;

  const w = window.open('', '_blank', 'width=850,height=700');
  if (!w) return;
  w.document.write(`
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8" />
      <title>Ficha Técnica de Submissão — ${escapeHtml(ed.agencia || 'FAP')} ${escapeHtml(ed.numero || '')}</title>
      <style>
        body { font-family: Arial, sans-serif; color: #14181f; padding: 36px; line-height: 1.5; }
        h1 { font-size: 20px; margin-bottom: 4px; }
        .badge { display: inline-block; background: #14181f; color: #fff; padding: 4px 12px; border-radius: 99px; font-size: 12px; font-weight: bold; }
        .box { border: 1px solid #d5d9e0; border-radius: 14px; padding: 16px; margin-top: 16px; }
        table { width: 100%; border-collapse: collapse; margin-top: 10px; }
        th, td { border-bottom: 1px solid #e6e8ec; padding: 8px 4px; text-align: left; font-size: 13px; }
      </style>
    </head>
    <body>
      <span class="badge">RadarFAP Brasil • Ficha de Submissão</span>
      <h1>${escapeHtml(ed.titulo || 'Proposta de Pesquisa')}</h1>
      <p><strong>Agência / UF:</strong> ${escapeHtml(ed.agencia || '')} (${escapeHtml(ed.uf || '')}) • <strong>Prazo Final:</strong> ${formatDateBr(ed.prazoSubmissao)} • <strong>Plataforma:</strong> ${escapeHtml(ed.plataformaSubmissao || '')}</p>
      <div class="box">
        <strong>Coordenação:</strong> ${escapeHtml(document.getElementById('pipeFormPesquisador').value)}<br/>
        <strong>Instituição Executora (ICT):</strong> ${escapeHtml(document.getElementById('pipeFormInstituicao').value)}<br/>
        <strong>Observações:</strong> ${escapeHtml(document.getElementById('pipeFormNotas').value)}
      </div>
      <div class="box">
        <strong>Quadro Orçamentário Estimado</strong>
        <table>
          <tr><th>Rubrica</th><th>Valor Pleiteado</th></tr>
          <tr><td>Custeio &amp; Serviços de Terceiros</td><td>${formatCurrencyBRL(custeio)}</td></tr>
          <tr><td>Capital &amp; Equipamentos Permanentes</td><td>${formatCurrencyBRL(capital)}</td></tr>
          <tr><td>Bolsas de Pesquisa (IC / Pós / Apoio Técnico)</td><td>${formatCurrencyBRL(bolsas)}</td></tr>
          <tr><th>TOTAL PLEITEADO</th><th>${formatCurrencyBRL(total)}</th></tr>
        </table>
      </div>
      <div class="box">
        <strong>Checklist de Submissão</strong>
        <ul>
          ${(item.checklist || []).map(c => `<li>[${c.concluido ? 'X' : ' '}] ${escapeHtml(c.texto)}</li>`).join('')}
        </ul>
      </div>
      <script>window.onload = () => window.print();</script>
    </body>
    </html>
  `);
  w.document.close();
};

// ===================== 5. RENDER ALERTAS & LOG =====================
function renderAlertasTab() {
  const cfg = appState.alertConfig || {};
  const daysInput = document.getElementById('alertDaysInput');
  const prorrogCheck = document.getElementById('alertProrrogFacepe');
  const ufsContainer = document.getElementById('alertUfsCheckboxes');

  if (daysInput) daysInput.value = cfg.diasAntecedenciaVencimento || 20;
  if (prorrogCheck) prorrogCheck.checked = cfg.notificarProrrogacoesFacepe !== false;

  const allUfs = [...new Set(appState.faps.map(f => f.uf))];
  if (ufsContainer) {
    ufsContainer.innerHTML = allUfs.map(uf => {
      const checked = (cfg.ufsMonitoradas || []).includes(uf);
      return `
        <label class="flex items-center gap-1.5 p-1 rounded-lg hover:bg-white/5 cursor-pointer">
          <input type="checkbox" name="alertUf" value="${uf}" ${checked ? 'checked' : ''} class="accent-[#b6f53b] rounded" />
          <span class="${uf === 'PE' ? 'font-bold text-[#b6f53b]' : 'text-white'}">${uf}</span>
        </label>
      `;
    }).join('');
  }

  document.getElementById('activeAlertsSubtitle').textContent = `${appState.alerts.length} alertas`;

  const fullAlertsEl = document.getElementById('fullAlertsList');
  if (fullAlertsEl) {
    if (appState.alerts.length === 0) {
      fullAlertsEl.innerHTML = `<div class="py-8 text-center text-xs text-[#8a92a0]">Nenhum alerta pendente para os filtros configurados.</div>`;
    } else {
      fullAlertsEl.innerHTML = appState.alerts.map(a => `
        <div class="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div class="space-y-1">
            <div class="flex items-center gap-2">
              <span class="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold ${
                a.tipo === 'prorrogacao' ? 'bg-[#b6f53b] text-[#14181f]' : 'bg-[#14181f] text-white'
              }">
                ${a.tipo === 'prorrogacao' ? 'Prorrogação FACEPE' : 'Prazo Próximo'}
              </span>
              <h4 class="text-sm font-bold text-[#14181f]">${escapeHtml(a.titulo)}</h4>
            </div>
            <p class="text-xs text-[#68707e]">${escapeHtml(a.mensagem)}</p>
          </div>
          <div class="flex items-center gap-2 shrink-0">
            <button onclick="window.openDetailModal('${a.editalId}')" class="btn-pill-outline-light">
              Detalhes
            </button>
            <a href="${escapeHtml(a.link)}" target="_blank" rel="noopener" class="circle-icon-dark" title="Abrir edital">
              →
            </a>
          </div>
        </div>
      `).join('');
    }
  }

  const syncList = document.getElementById('syncHistoryList');
  if (syncList) {
    syncList.innerHTML = (appState.syncHistory || []).map(s => `
      <div class="p-4 rounded-2xl bg-[#f6f7f9] flex flex-wrap items-center justify-between gap-2 text-xs">
        <div>
          <span class="font-bold text-[#14181f]">● ${escapeHtml(s.origem)}</span>
          <p class="text-[#68707e] mt-0.5">${escapeHtml(s.detalhe || `${s.facepeCount} editais FACEPE | ${s.totalCount} total`)}</p>
        </div>
        <span class="px-3 py-1 rounded-full bg-white text-[#14181f] font-semibold">${new Date(s.timestamp).toLocaleString('pt-BR')}</span>
      </div>
    `).join('');
  }
}

// ===================== MODAL DE DETALHES & ANEXOS DA FACEPE =====================
window.openDetailModal = function openDetailModal(editalId) {
  const ed = appState.editais.find(e => e.id === editalId);
  if (!ed) return;

  const modal = document.getElementById('editalDetailModal');
  const header = document.getElementById('detailModalHeader');
  const body = document.getElementById('detailModalBody');

  header.innerHTML = `
    <div class="space-y-2">
      <div class="flex flex-wrap items-center gap-2">
        <span class="px-3 py-1 rounded-full text-xs font-extrabold bg-[#14181f] text-white">${escapeHtml(ed.agencia)} (${escapeHtml(ed.uf)})</span>
        <span class="px-3 py-1 rounded-full text-xs font-bold bg-[#f1f3f6] text-[#14181f]">Edital nº ${escapeHtml(ed.numero)}</span>
        <span class="px-3 py-1 rounded-full text-xs font-extrabold bg-[#b6f53b] text-[#14181f]">${escapeHtml(ed.status)}</span>
      </div>
      <h2 class="text-lg font-extrabold text-[#14181f] leading-snug">${escapeHtml(ed.titulo)}</h2>
    </div>
  `;

  const anexosHtml = (ed.anexos && ed.anexos.length > 0)
    ? `
      <div class="space-y-2.5">
        <h4 class="text-xs font-bold uppercase tracking-wider text-[#8a92a0]">Documentos Complementares, Erratas e Resultados (${ed.anexos.length})</h4>
        <div class="space-y-2">
          ${ed.anexos.map(an => `
            <a href="${escapeHtml(an.url)}" target="_blank" rel="noopener" class="flex items-center justify-between gap-3 p-3.5 rounded-2xl bg-[#f6f7f9] hover:bg-[#ebedf2] transition text-xs">
              <span class="text-[#14181f] font-bold">${escapeHtml(an.title)}</span>
              <span class="circle-icon-dark !w-7 !h-7">↗</span>
            </a>
          `).join('')}
        </div>
      </div>
    `
    : `<div class="p-3.5 rounded-2xl bg-[#f6f7f9] text-xs text-[#8a92a0]">Sem erratas ou adendos extras além do PDF principal do edital.</div>`;

  body.innerHTML = `
    <p class="text-sm text-[#4a5260] leading-relaxed bg-[#f6f7f9] p-4 rounded-2xl">
      ${escapeHtml(ed.resumo)}
    </p>

    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
      <div class="p-3.5 rounded-2xl bg-[#f6f7f9]">
        <span class="text-[#8a92a0] block">Estado / Instituição</span>
        <strong class="text-[#14181f]">${escapeHtml(ed.estado)} (${escapeHtml(ed.uf)}) — ${escapeHtml(ed.agencia)}</strong>
      </div>
      <div class="p-3.5 rounded-2xl bg-[#f6f7f9]">
        <span class="text-[#8a92a0] block">Linha de Fomento</span>
        <strong class="text-[#14181f]">${escapeHtml(ed.area)}</strong>
      </div>
      <div class="p-3.5 rounded-2xl bg-[#f6f7f9]">
        <span class="text-[#8a92a0] block">Publicação</span>
        <strong class="text-[#14181f]">${escapeHtml(ed.dataPublicacaoTexto || formatDateBr(ed.dataPublicacao))}</strong>
      </div>
      <div class="p-3.5 rounded-2xl bg-[#f6f7f9]">
        <span class="text-[#8a92a0] block">Prazo Final de Submissão</span>
        <strong class="text-[#14181f]">${formatDateBr(ed.prazoSubmissao)}</strong>
      </div>
      <div class="p-3.5 rounded-2xl bg-[#14181f] text-white sm:col-span-2 flex items-center justify-between">
        <div>
          <span class="text-[#8a92a0] block">Recursos &amp; Valores Estimados</span>
          <strong class="text-[#b6f53b] text-sm">${escapeHtml(ed.valorEstimado)}</strong>
        </div>
        <span class="px-3 py-1 rounded-full bg-white/10 text-xs font-bold">${escapeHtml(ed.plataformaSubmissao || 'Portal')}</span>
      </div>
    </div>

    ${anexosHtml}

    <div class="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-[#f1f3f6]">
      <div class="flex flex-wrap items-center gap-2">
        <a href="${escapeHtml(ed.linkPdf)}" target="_blank" rel="noopener" class="btn-pill-dark">
          Abrir Edital Oficial (PDF) ↗
        </a>
        <a href="${escapeHtml(ed.linkSubmissao)}" target="_blank" rel="noopener" class="btn-pill-lime">
          Submeter via ${escapeHtml(ed.plataformaSubmissao || 'Portal')} →
        </a>
      </div>

      <div class="flex items-center gap-2">
        <button onclick="window.downloadEditalIcs('${ed.id}')" class="btn-pill-outline-light" title="Salvar prazo no Google Calendar / Outlook">
          📅 Agendar (.ics)
        </button>
        <button onclick="window.addToPipeline('${ed.id}'); window.closeDetailModal();" class="btn-pill-outline-light">
          + Pipeline
        </button>
        <button onclick="window.closeDetailModal(); window.openEditEditalModal('${ed.id}');" class="circle-icon-dark" title="Editar">
          ✎
        </button>
      </div>
    </div>
  `;

  modal.classList.remove('hidden');
};

window.downloadEditalIcs = function downloadEditalIcs(editalId) {
  const ed = appState.editais.find(e => e.id === editalId);
  if (!ed) return;
  const dateClean = (ed.prazoSubmissao || '2026-12-01').replace(/-/g, '').slice(0, 8);
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//RadarFAP Brasil//PT-BR',
    'BEGIN:VEVENT',
    `UID:radarfap-${ed.id}@radarfap.br`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').split('.')[0]}Z`,
    `DTSTART;VALUE=DATE:${dateClean}`,
    `DTEND;VALUE=DATE:${dateClean}`,
    `SUMMARY:[Prazo FAP] ${ed.agencia} (${ed.uf}) - Edital ${ed.numero}`,
    `DESCRIPTION:${(ed.titulo || '').replace(/\n/g, ' ')} | Submissao: ${ed.linkSubmissao || ''} | PDF: ${ed.linkPdf || ''}`,
    `URL:${ed.linkSubmissao || ed.linkEdital || ''}`,
    'END:VEVENT',
    'END:VCALENDAR'
  ].join('\r\n');

  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `prazo-${ed.agencia.toLowerCase()}-${ed.numero.replace(/[^a-zA-Z0-9]/g, '-')}.ics`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Arquivo de calendário (.ics) baixado!');
};

window.closeDetailModal = function closeDetailModal() {
  document.getElementById('editalDetailModal').classList.add('hidden');
};

// ===================== EXPORTAÇÃO CSV PLANILHA =====================
window.exportEditaisCsv = function exportEditaisCsv() {
  const rows = [
    ['Agencia', 'UF', 'Numero', 'Titulo', 'Area', 'Status', 'Publicacao', 'Prazo_Submissao', 'Valor_Estimado', 'Link_PDF', 'Link_Submissao']
  ];
  for (const e of appState.editais) {
    rows.push([
      e.agencia,
      e.uf,
      e.numero,
      (e.titulo || '').replace(/;/g, ','),
      e.area,
      e.status,
      e.dataPublicacao,
      e.prazoSubmissao,
      (e.valorEstimado || '').replace(/;/g, ','),
      e.linkPdf,
      e.linkSubmissao
    ]);
  }
  const csvContent = '\uFEFF' + rows.map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';')).join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `radar-fap-editais-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Planilha CSV exportada com todos os editais!');
};

// ===================== SYNC, FAVORITOS, PIPELINE, CURADORIA =====================
window.triggerSync = async function triggerSync() {
  const btn = document.getElementById('btnSyncNow');
  const icon = document.getElementById('syncIcon');
  const txt = document.getElementById('syncBtnText');

  try {
    if (btn) btn.disabled = true;
    if (icon) icon.classList.add('spin-sync');
    if (txt) txt.textContent = 'Sincronizando...';

    const res = await fetch('/api/sync', { method: 'POST' });
    const data = await res.json();
    if (data.state) {
      appState = data.state;
      renderAll();
    }
    showToast(`Sincronizado com www2.facepe.br! ${data.syncResult?.facepeCount || 40} editais FACEPE ativos.`);
  } catch (err) {
    showToast(`Aviso ao sincronizar: ${err.message}`);
  } finally {
    if (btn) btn.disabled = false;
    if (icon) icon.classList.remove('spin-sync');
    if (txt) txt.textContent = 'Sincronizar FACEPE';
  }
};

window.toggleFavorite = async function toggleFavorite(editalId) {
  const res = await fetch('/api/favoritos/toggle', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ editalId })
  });
  const data = await res.json();
  if (data.state) {
    appState = data.state;
    renderAll();
    showToast('Favoritos atualizados!');
  }
};

window.addToPipeline = async function addToPipeline(editalId) {
  const ed = appState.editais.find(e => e.id === editalId);
  const res = await fetch('/api/pipeline', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      editalId,
      estagio: 'analise',
      valorPleiteado: ed?.valorNumerico && ed.valorNumerico <= 600000 ? ed.valorNumerico : 180000,
      notas: `Submissão planejada para ${ed?.agencia || 'FAP'} (${ed?.numero || ''}) via ${ed?.plataformaSubmissao || 'portal'}.`
    })
  });
  const data = await res.json();
  if (data.state) {
    appState = data.state;
    renderAll();
    showToast(`Edital ${ed?.numero || ''} adicionado ao Pipeline de Submissões!`);
  }
};

window.movePipelineStage = async function movePipelineStage(pipeId, novoEstagio) {
  const res = await fetch('/api/pipeline', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: pipeId, estagio: novoEstagio })
  });
  const data = await res.json();
  if (data.state) {
    appState = data.state;
    renderAll();
    showToast('Etapa atualizada no Kanban!');
  }
};

window.toggleChecklistItem = async function toggleChecklistItem(pipeId, checkIdx) {
  const item = appState.pipeline.find(p => p.id === pipeId);
  if (!item || !item.checklist) return;
  const updatedChecklist = item.checklist.map((c, i) =>
    i === checkIdx ? { ...c, concluido: !c.concluido } : c
  );
  const res = await fetch('/api/pipeline', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: pipeId, checklist: updatedChecklist })
  });
  const data = await res.json();
  if (data.state) {
    appState = data.state;
    renderAll();
  }
};

window.removePipelineItem = async function removePipelineItem(pipeId) {
  const res = await fetch(`/api/pipeline/${encodeURIComponent(pipeId)}`, { method: 'DELETE' });
  const data = await res.json();
  if (data.state) {
    appState = data.state;
    renderAll();
    showToast('Proposta removida do pipeline.');
  }
};

// ===================== FILTROS RÁPIDOS =====================
window.filterByFap = function filterByFap(sigla) {
  onlyFavoritesFilter = false;
  regionQuickFilter = 'ALL';
  document.getElementById('filterUf').value = 'ALL';
  document.getElementById('filterAgencia').value = sigla;
  document.getElementById('filterArea').value = 'ALL';
  document.getElementById('filterStatus').value = 'ALL';
  window.switchTab('editais');
  renderEditaisTab();
};

window.filterByRegion = function filterByRegion(regiao) {
  onlyFavoritesFilter = false;
  regionQuickFilter = regiao;
  document.getElementById('filterUf').value = 'ALL';
  document.getElementById('filterAgencia').value = 'ALL';
  window.switchTab('editais');
  renderEditaisTab();
};

window.filterByArea = function filterByArea(area) {
  onlyFavoritesFilter = false;
  regionQuickFilter = 'ALL';
  document.getElementById('filterArea').value = area;
  window.switchTab('editais');
  renderEditaisTab();
};

window.applyQuickFilter = function applyQuickFilter(mode) {
  onlyFavoritesFilter = false;
  regionQuickFilter = 'ALL';
  document.getElementById('filterSearch').value = '';
  document.getElementById('filterUf').value = 'ALL';
  document.getElementById('filterAgencia').value = 'ALL';
  document.getElementById('filterArea').value = 'ALL';
  document.getElementById('filterStatus').value = 'ALL';

  if (mode === 'all_open') {
    document.getElementById('filterStatus').value = 'Aberto';
  } else if (mode === 'facepe_only') {
    document.getElementById('filterAgencia').value = 'FACEPE';
  } else if (mode === 'federais') {
    document.getElementById('filterUf').value = 'BR';
  } else if (mode === 'favoritos') {
    onlyFavoritesFilter = true;
  }
  renderEditaisTab();
};

window.setFapRegionFilter = function setFapRegionFilter(reg) {
  fapRegionFilter = reg;
  fapUfFilter = 'ALL';
  document.querySelectorAll('.fap-reg-btn').forEach(btn => {
    const active = btn.dataset.reg === reg;
    btn.className = active ? 'fap-reg-btn btn-pill-dark' : 'fap-reg-btn btn-pill-outline-light';
  });
  renderFapsDirectory();
};

window.setFapUfFilter = function setFapUfFilter(uf) {
  fapUfFilter = uf;
  renderFapsDirectory();
};

// ===================== MODAL DE CURADORIA MANUAL =====================
window.openNewEditalModal = function openNewEditalModal() {
  document.getElementById('editalFormTitle').textContent = 'Cadastrar Novo Edital';
  document.getElementById('formEditalId').value = '';
  document.getElementById('formEditalAgencia').value = 'FACEPE';
  document.getElementById('formEditalNumero').value = '';
  document.getElementById('formEditalStatus').value = 'Aberto';
  document.getElementById('formEditalTitulo').value = '';
  document.getElementById('formEditalArea').value = 'Pesquisa Científica (APQ / Missões)';
  document.getElementById('formEditalDataPub').value = '2026-11-10';
  document.getElementById('formEditalPrazo').value = '2026-12-20';
  document.getElementById('formEditalValorTexto').value = '';
  document.getElementById('formEditalValorNum').value = '200000';
  document.getElementById('formEditalLinkPdf').value = 'https://www2.facepe.br/editais/';
  document.getElementById('formEditalLinkSub').value = 'https://agil.facepe.br/';
  document.getElementById('formEditalPublico').value = 'Pesquisadores doutores vinculados a ICTs';
  document.getElementById('formEditalResumo').value = '';
  document.getElementById('formEditalProrrogado').checked = false;

  document.getElementById('editalFormModal').classList.remove('hidden');
};

window.openEditEditalModal = function openEditEditalModal(editalId) {
  const ed = appState.editais.find(e => e.id === editalId);
  if (!ed) return;

  document.getElementById('editalFormTitle').textContent = `Editar Edital — ${ed.agencia} (${ed.numero})`;
  document.getElementById('formEditalId').value = ed.id;
  document.getElementById('formEditalAgencia').value = ed.agencia;
  document.getElementById('formEditalNumero').value = ed.numero || '';
  document.getElementById('formEditalStatus').value = ed.status || 'Aberto';
  document.getElementById('formEditalTitulo').value = ed.titulo || '';
  document.getElementById('formEditalArea').value = ed.area || 'Pesquisa Científica (APQ / Missões)';
  document.getElementById('formEditalDataPub').value = (ed.dataPublicacao || '2026-10-20').slice(0, 10);
  document.getElementById('formEditalPrazo').value = (ed.prazoSubmissao || '2026-12-15').slice(0, 10);
  document.getElementById('formEditalValorTexto').value = ed.valorEstimado || '';
  document.getElementById('formEditalValorNum').value = ed.valorNumerico || 150000;
  document.getElementById('formEditalLinkPdf').value = ed.linkPdf || '';
  document.getElementById('formEditalLinkSub').value = ed.linkSubmissao || '';
  document.getElementById('formEditalPublico').value = ed.publicoAlvo || '';
  document.getElementById('formEditalResumo').value = ed.resumo || '';
  document.getElementById('formEditalProrrogado').checked = Boolean(ed.prorrogado);

  document.getElementById('editalFormModal').classList.remove('hidden');
};

window.closeEditalFormModal = function closeEditalFormModal() {
  document.getElementById('editalFormModal').classList.add('hidden');
};

// ===================== INIT LISTENERS =====================
document.addEventListener('DOMContentLoaded', () => {
  fetchInitialState();

  document.querySelectorAll('header .pill-tab').forEach(btn => {
    btn.addEventListener('click', () => window.switchTab(btn.dataset.tab));
  });

  document.getElementById('btnSyncNow')?.addEventListener('click', () => window.triggerSync());
  document.getElementById('btnNewEdital')?.addEventListener('click', () => window.openNewEditalModal());

  ['filterSearch', 'filterUf', 'filterAgencia', 'filterArea', 'filterStatus', 'filterSort'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', () => renderEditaisTab());
      el.addEventListener('change', () => renderEditaisTab());
    }
  });

  document.getElementById('fapSearchInput')?.addEventListener('input', () => renderFapsDirectory());

  document.getElementById('editalCrudForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    const payload = {
      id: document.getElementById('formEditalId').value || undefined,
      agencia: document.getElementById('formEditalAgencia').value,
      numero: document.getElementById('formEditalNumero').value,
      status: document.getElementById('formEditalStatus').value,
      titulo: document.getElementById('formEditalTitulo').value,
      area: document.getElementById('formEditalArea').value,
      dataPublicacao: document.getElementById('formEditalDataPub').value,
      prazoSubmissao: document.getElementById('formEditalPrazo').value,
      valorEstimado: document.getElementById('formEditalValorTexto').value,
      valorNumerico: Number(document.getElementById('formEditalValorNum').value) || 150000,
      linkPdf: document.getElementById('formEditalLinkPdf').value,
      linkSubmissao: document.getElementById('formEditalLinkSub').value,
      publicoAlvo: document.getElementById('formEditalPublico').value,
      resumo: document.getElementById('formEditalResumo').value,
      prorrogado: document.getElementById('formEditalProrrogado').checked
    };

    const res = await fetch('/api/editais', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.state) {
      appState = data.state;
      renderAll();
      window.closeEditalFormModal();
      showToast('Edital salvo com sucesso!');
    }
  });

  document.getElementById('alertConfigForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    const checkedUfs = Array.from(document.querySelectorAll('input[name="alertUf"]:checked')).map(el => el.value);
    const dias = Number(document.getElementById('alertDaysInput').value) || 20;
    const prorrog = document.getElementById('alertProrrogFacepe').checked;

    const res = await fetch('/api/alerts/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ufsMonitoradas: checkedUfs,
        diasAntecedenciaVencimento: dias,
        notificarProrrogacoesFacepe: prorrog
      })
    });
    const data = await res.json();
    if (data.state) {
      appState = data.state;
      renderAll();
      showToast('Preferências de alerta salvas!');
    }
  });

  ['pipeRubricaCusteio', 'pipeRubricaCapital', 'pipeRubricaBolsas'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', () => updatePipeTotalPreview());
  });

  document.getElementById('pipelineEditForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    const pipeId = document.getElementById('pipeFormId').value;
    const item = appState.pipeline.find(p => p.id === pipeId);
    if (!item) return;

    const custeio = Number(document.getElementById('pipeRubricaCusteio').value) || 0;
    const capital = Number(document.getElementById('pipeRubricaCapital').value) || 0;
    const bolsas = Number(document.getElementById('pipeRubricaBolsas').value) || 0;
    const total = custeio + capital + bolsas;
    const newTask = (document.getElementById('pipeNewCheckItem').value || '').trim();

    const updatedChecklist = [...(item.checklist || [])];
    if (newTask) {
      updatedChecklist.push({ texto: newTask, concluido: false });
    }

    const res = await fetch('/api/pipeline', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: pipeId,
        pesquisadorResponsavel: document.getElementById('pipeFormPesquisador').value,
        instituicao: document.getElementById('pipeFormInstituicao').value,
        rubricaCusteio: custeio,
        rubricaCapital: capital,
        rubricaBolsas: bolsas,
        valorPleiteado: total,
        notas: document.getElementById('pipeFormNotas').value,
        checklist: updatedChecklist
      })
    });
    const data = await res.json();
    if (data.state) {
      appState = data.state;
      renderAll();
      window.closePipelineModal();
      showToast('Orçamento e planejamento da proposta salvos!');
    }
  });
});
