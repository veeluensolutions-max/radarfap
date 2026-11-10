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
  } catch {}

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
let onlyHighMatchFilter = false;

const ALL_FOMENTO_AREAS = [
  'Pesquisa Científica (APQ / Missões)',
  'Bolsas & Pós-Graduação',
  'Inovação & Startups',
  'Governo & Gestão Pública',
  'Cooperação Internacional',
  'Eventos & Difusão Científica'
];

function computeClientMatchBreakdown(edital, profile = {}) {
  let score = 45;
  const reasons = [];
  const userUf = profile.ufPrincipal || 'PE';

  if (edital.uf === userUf) {
    score += 28;
    reasons.push(`✓ Sede na mesma UF do seu perfil (${userUf} • ${edital.agencia})`);
  } else if (edital.uf === 'BR' && profile.incluirFederais !== false) {
    score += 22;
    reasons.push(`✓ Chamada Nacional elegível em todo o país (${edital.agencia})`);
  } else if (edital.regiao === 'Nordeste' && userUf === 'PE') {
    score += 14;
    reasons.push(`✓ Cooperação Regional Nordeste (${edital.agencia}/${edital.uf})`);
  } else if (profile.incluirOutrosEstados !== false) {
    score += 8;
    reasons.push(`⚠ Exige ICT sediada ou co-execução em ${edital.uf} (${edital.agencia})`);
  } else {
    score -= 12;
    reasons.push(`⚠ Fora da UF prioritária configurada (${userUf})`);
  }

  if ((profile.areasPrioritarias || ALL_FOMENTO_AREAS).includes(edital.area)) {
    score += 15;
    reasons.push(`✓ Linha prioritária: ${edital.area}`);
  } else {
    reasons.push(`• Linha complementar: ${edital.area}`);
  }

  const isStartupEdital = edital.area === 'Inovação & Startups' || /centelha|tecnova|subven|empresa|startup/i.test(edital.titulo || '');
  if (isStartupEdital) {
    if ((profile.naturezaVinculo || '').includes('Startup') || (profile.naturezaVinculo || '').includes('Empresa')) {
      score += 6;
      reasons.push('✓ Enquadramento direto para CNPJ / Startup Inovadora');
    } else {
      reasons.push('• Recomendado parceria ICT + Empresa/Startup ou spin-off');
    }
  } else {
    reasons.push(`✓ Elegível para ${profile.naturezaVinculo || 'ICT Pública / Universidade'} (${profile.titulacao || 'Doutorado'})`);
  }

  const text = `${edital.titulo || ''} ${edital.resumo || ''} ${edital.publicoAlvo || ''}`.toLowerCase();
  const kws = profile.palavrasChave || [];
  const matchedKws = [];
  for (const kw of kws) {
    const cleanKw = (kw || '').toLowerCase().trim();
    if (cleanKw && text.includes(cleanKw)) {
      matchedKws.push(kw.trim());
    }
  }
  score += Math.min(12, matchedKws.length * 4);
  if (matchedKws.length > 0) {
    reasons.push(`✓ Temas compatíveis: ${matchedKws.slice(0, 3).join(', ')}`);
  }

  if (edital.status === 'Aberto') {
    score += 4;
  } else if (edital.status === 'Encerrado') {
    score -= 20;
    reasons.push('⚠ Submissões encerradas (referência histórica)');
  }

  return {
    score: Math.max(18, Math.min(99, score)),
    reasons
  };
}

function recalculateClientSideMatches() {
  const profile = appState.researcherProfile || {};
  appState.editais = (appState.editais || []).map(ed => {
    const bd = computeClientMatchBreakdown(ed, profile);
    return {
      ...ed,
      matchScore: bd.score,
      matchRazoes: bd.reasons
    };
  });
}

function saveWorkspaceBackup() {
  try {
    const manualEditais = (appState.editais || []).filter(e => e.curadoriaManual);
    const backup = {
      favoritos: appState.favoritos || [],
      pipeline: appState.pipeline || [],
      alertConfig: appState.alertConfig || {},
      researcherProfile: appState.researcherProfile || {},
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
    if (Array.isArray(backup.favoritos)) {
      appState.favoritos = backup.favoritos;
    }
    if (Array.isArray(backup.pipeline) && backup.pipeline.length > 0) {
      appState.pipeline = backup.pipeline;
    }
    if (backup.researcherProfile && typeof backup.researcherProfile === 'object') {
      appState.researcherProfile = {
        ...(appState.researcherProfile || {}),
        ...backup.researcherProfile
      };
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
  let loadedState = null;
  try {
    const res = await fetch('/api/state');
    if (res.ok) {
      const json = await res.json();
      if (json && Array.isArray(json.editais) && json.editais.length > 0) {
        loadedState = json;
      }
    }
  } catch {}

  if (!loadedState) {
    try {
      const fallbackRes = await fetch('/data/initial-state.json');
      if (fallbackRes.ok) {
        loadedState = await fallbackRes.json();
      }
    } catch {}
  }

  if (loadedState) {
    appState = {
      ...appState,
      ...loadedState,
      editais: Array.isArray(loadedState.editais) ? loadedState.editais : [],
      faps: Array.isArray(loadedState.faps) ? loadedState.faps : [],
      favoritos: Array.isArray(loadedState.favoritos) ? loadedState.favoritos : [],
      pipeline: Array.isArray(loadedState.pipeline) ? loadedState.pipeline : [],
      alerts: Array.isArray(loadedState.alerts) ? loadedState.alerts : [],
      noticiasFacepe: Array.isArray(loadedState.noticiasFacepe) ? loadedState.noticiasFacepe : [],
      syncHistory: Array.isArray(loadedState.syncHistory) ? loadedState.syncHistory : []
    };
  }

  mergeWorkspaceBackup();
  recalculateClientSideMatches();
  if (appState.lastAutoSyncIso) {
    updateRealtimeBadge(appState.lastAutoSyncIso);
  }
  if (typeof window.applySavedBentoLayout === 'function') {
    window.applySavedBentoLayout();
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
  const profUfSelect = document.getElementById('profUfPrincipal');

  const ufs = [...new Set(appState.faps.map(f => f.uf))];

  if (profUfSelect && profUfSelect.options.length === 0) {
    ufs.filter(u => u !== 'BR').forEach(uf => {
      const fap = appState.faps.find(f => f.uf === uf);
      const opt = document.createElement('option');
      opt.value = uf;
      opt.textContent = `${uf} — ${fap?.estado || uf} (${fap?.sigla || ''})`;
      profUfSelect.appendChild(opt);
    });
  }

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
  recalculateClientSideMatches();
  saveWorkspaceBackup();
  document.getElementById('badgeTotalEditais').textContent = appState.editais.length;
  document.getElementById('badgePipelineCount').textContent = appState.pipeline.length;
  document.getElementById('badgeAlertsCount').textContent = appState.alerts.length;

  const prof = appState.researcherProfile || {};
  const headerProfLbl = document.getElementById('headerProfileBtnLabel');
  if (headerProfLbl) {
    headerProfLbl.textContent = `🎯 Perfil & Match (${prof.ufPrincipal || 'PE'})`;
  }

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

  const dashPillBrasil = document.getElementById('dashPillBrasil');
  if (dashPillBrasil) {
    dashPillBrasil.textContent = `Brasil (${totalEditais})`;
  }

  const quickSearchSub = document.getElementById('quickSearchSubtitle');
  if (quickSearchSub) {
    quickSearchSub.textContent = `Filtre instantaneamente os ${totalEditais} editais abertos e em andamento na FACEPE e nas 27 FAPs do país.`;
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

  if (onlyHighMatchFilter) {
    list = list.filter(e => (Number(e.matchScore) || 0) >= 80);
  }
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

  if (sort === 'custom') {
    const customOrder = window.getCustomEditaisOrder ? window.getCustomEditaisOrder() : [];
    const orderMap = new Map(customOrder.map((id, idx) => [id, idx]));
    list.sort((a, b) => {
      const idxA = orderMap.has(a.id) ? orderMap.get(a.id) : 99999;
      const idxB = orderMap.has(b.id) ? orderMap.get(b.id) : 99999;
      if (idxA !== idxB) return idxA - idxB;
      return (Number(b.matchScore) || 0) - (Number(a.matchScore) || 0);
    });
  } else if (sort === 'match') {
    list.sort((a, b) => (Number(b.matchScore) || 0) - (Number(a.matchScore) || 0));
  } else if (sort === 'recentes') {
    list.sort((a, b) => (b.dataPublicacao || '').localeCompare(a.dataPublicacao || ''));
  } else if (sort === 'prazo') {
    list.sort((a, b) => (a.prazoSubmissao || '9999').localeCompare(b.prazoSubmissao || '9999'));
  } else if (sort === 'valor') {
    list.sort((a, b) => (Number(b.valorNumerico) || 0) - (Number(a.valorNumerico) || 0));
  }

  // Editais fixados no topo (📌) vêm sempre primeiro
  const pinnedIds = window.getPinnedEditaisIds ? window.getPinnedEditaisIds() : [];
  if (pinnedIds.length > 0) {
    list.sort((a, b) => {
      const pinA = pinnedIds.includes(a.id) ? 0 : 1;
      const pinB = pinnedIds.includes(b.id) ? 0 : 1;
      return pinA - pinB;
    });
  }

  return list;
}

function renderEditaisTab() {
  const filtered = getFilteredEditais();
  const countLabel = document.getElementById('editaisCountLabel');
  if (countLabel) {
    countLabel.textContent = `${filtered.length} oportunidades encontradas de ${appState.editais.length} monitoradas no Brasil`;
  }

  const profileBanner = document.getElementById('activeProfileBanner');
  if (profileBanner) {
    const prof = appState.researcherProfile || {};
    const highMatchCount = appState.editais.filter(e => (Number(e.matchScore) || 0) >= 80 && e.status === 'Aberto').length;
    profileBanner.innerHTML = `
      <div class="flex flex-wrap items-center gap-2.5">
        <span class="px-2.5 py-0.5 rounded-full bg-[#b6f53b] text-[#14181f] text-[11px] font-extrabold">Perfil Ativo</span>
        <span class="text-white font-bold">${escapeHtml(prof.nomePesquisador || 'Prof. Dr. Coordenador')}</span>
        <span class="text-[#7e8694]">•</span>
        <span class="text-[#c5cbd6]">${escapeHtml(prof.instituicao || 'UFPE / UFRPE / UPE')} (${escapeHtml(prof.ufPrincipal || 'PE')})</span>
        <span class="text-[#7e8694]">•</span>
        <span class="text-[#b6f53b] font-semibold">${highMatchCount} editais abertos com Alto Match (≥80%)</span>
      </div>
      <button onclick="window.openProfileModal()" class="btn-pill-outline-dark !py-1.5 !px-3.5 text-xs">
        ⚙ Configurar Perfil &amp; Elegibilidade
      </button>
    `;
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
      ? `<span class="px-2.5 py-1 rounded-full text-[11px] font-extrabold ${ed.matchScore >= 85 ? 'bg-[#14181f] text-[#b6f53b]' : 'bg-[#f1f3f6] text-[#14181f]'}" title="${escapeHtml((ed.matchRazoes || []).join(' | '))}">${ed.matchScore}% Match</span>`
      : '';

    const topReason = (ed.matchRazoes && ed.matchRazoes[0]) ? ed.matchRazoes[0] : '';
    const isPinned = (window.getPinnedEditaisIds ? window.getPinnedEditaisIds() : []).includes(ed.id);
    const isWide = (window.getWideEditaisIds ? window.getWideEditaisIds() : []).includes(ed.id);

    return `
      <article
        draggable="true"
        data-edital-id="${ed.id}"
        ondragstart="window.onEditalDragStart(event, '${ed.id}')"
        ondragover="window.onEditalDragOver(event)"
        ondragleave="window.onEditalDragLeave(event)"
        ondrop="window.onEditalDrop(event, '${ed.id}')"
        ondragend="window.onEditalDragEnd(event)"
        class="interactive-card bento-light bento-hover p-6 flex flex-col justify-between gap-5 ${isWide ? 'md:col-span-2' : ''} ${isPinned ? 'ring-2 ring-[#14181f]' : ''}"
      >
        <div class="space-y-3.5">
          <!-- Topo do Card com Controles Interativos de Movimento -->
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

            <div class="flex items-center gap-1">
              <div class="card-interactive-toolbar card-toolbar-light" onclick="event.stopPropagation()">
                <span class="card-drag-grip" title="Arraste para reorganizar ou solte na aba Submissões">⋮⋮</span>
                <button type="button" onclick="window.moveEditalCard('${ed.id}', -1)" class="card-ctrl-btn" title="Mover card para trás">←</button>
                <button type="button" onclick="window.moveEditalCard('${ed.id}', 1)" class="card-ctrl-btn" title="Mover card para frente">→</button>
                <button type="button" onclick="window.toggleWideEditalCard('${ed.id}')" class="card-ctrl-btn" title="Expandir/Compactar largura do card">↔</button>
                <button type="button" onclick="window.togglePinEdital('${ed.id}')" class="card-ctrl-btn ${isPinned ? 'bg-[#14181f] text-[#b6f53b]' : ''}" title="Fixar este edital no topo">📌</button>
              </div>
              <button
                onclick="window.toggleCompareEdital('${ed.id}')"
                class="w-8 h-8 rounded-full inline-flex items-center justify-center text-xs font-bold transition ${
                  (window.compareSelectedIds || []).includes(ed.id)
                    ? 'bg-[#b6f53b] text-[#14181f] shadow'
                    : 'bg-[#f1f3f6] text-[#8a92a0] hover:text-[#14181f]'
                }"
                title="Selecionar para comparar lado a lado (até 3 editais)"
              >
                ⚖️
              </button>
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
            ${topReason ? `
              <div class="col-span-2 pt-1.5 border-t border-[#e8ebf0] text-[11px] font-semibold text-[#14181f] flex items-center justify-between">
                <span>${escapeHtml(topReason)}</span>
                <button onclick="window.openWorkplanModal('${ed.id}')" class="text-[#14181f] underline decoration-[#b6f53b] decoration-2 font-extrabold hover:opacity-80">
                  ✨ Gerar Plano
                </button>
              </div>
            ` : ''}
          </div>
        </div>

        <!-- Rodapé com Botões Pílula + Círculo Seta (Fiel à imagem) -->
        <div class="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-[#f1f3f6]">
          <div class="flex items-center gap-2">
            <button onclick="window.openDetailModal('${ed.id}')" class="btn-pill-dark">
              <span>Detalhes ${ed.anexos?.length ? `(${ed.anexos.length})` : ''}</span>
            </button>
            <button onclick="window.openWorkplanModal('${ed.id}')" class="btn-pill-outline-light" title="Gerar Plano de Trabalho estruturado para o AgilFAP / FAP">
              ✨ Plano
            </button>
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

  if (typeof window.renderCompareFloatingBar === 'function') {
    window.renderCompareFloatingBar();
  }
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

  const customFapsOrder = window.getCustomFapsOrder ? window.getCustomFapsOrder() : [];
  if (customFapsOrder.length > 0) {
    const fapOrderMap = new Map(customFapsOrder.map((sigla, idx) => [sigla, idx]));
    faps.sort((a, b) => {
      const idxA = fapOrderMap.has(a.sigla) ? fapOrderMap.get(a.sigla) : 9999;
      const idxB = fapOrderMap.has(b.sigla) ? fapOrderMap.get(b.sigla) : 9999;
      return idxA - idxB;
    });
  }

  const grid = document.getElementById('fapsGrid');
  if (!grid) return;

  grid.innerHTML = faps.map(fap => {
    const isFacepe = fap.sigla === 'FACEPE';
    return `
      <div
        draggable="true"
        data-fap-sigla="${escapeHtml(fap.sigla)}"
        ondragstart="window.onFapDragStart(event, '${escapeHtml(fap.sigla)}')"
        ondragover="window.onFapDragOver(event)"
        ondragleave="window.onFapDragLeave(event)"
        ondrop="window.onFapDrop(event, '${escapeHtml(fap.sigla)}')"
        ondragend="window.onFapDragEnd(event)"
        class="interactive-card ${isFacepe ? 'bento-dark' : 'bento-light'} bento-hover p-6 flex flex-col justify-between gap-5"
      >
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
            <div class="flex items-center gap-1.5 shrink-0">
              <div class="card-interactive-toolbar ${isFacepe ? 'card-toolbar-dark' : 'card-toolbar-light'}" onclick="event.stopPropagation()">
                <span class="card-drag-grip" title="Arraste para organizar a ordem das FAPs">⋮⋮</span>
                <button type="button" onclick="window.moveFapCard('${escapeHtml(fap.sigla)}', -1)" class="card-ctrl-btn" title="Mover para trás">←</button>
                <button type="button" onclick="window.moveFapCard('${escapeHtml(fap.sigla)}', 1)" class="card-ctrl-btn" title="Mover para frente">→</button>
              </div>
              <span class="px-3 py-1 rounded-full text-xs font-bold ${
                isFacepe ? 'bg-white/10 text-[#b6f53b]' : 'bg-[#f1f3f6] text-[#14181f]'
              }">
                ${fap.totalEditaisMonitorados} ed.
              </span>
            </div>
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
      <div
        data-kanban-stage="${stage.id}"
        ondragover="window.onKanbanColDragOver(event, '${stage.id}')"
        ondragleave="window.onKanbanColDragLeave(event)"
        ondrop="window.onKanbanColDrop(event, '${stage.id}')"
        class="bento-tray space-y-3 transition-all"
      >
        <div class="flex items-center justify-between px-2 pt-1">
          <span class="px-3 py-1 rounded-full text-xs font-bold ${stage.badge}">
            ${stage.label}
          </span>
          <span class="w-6 h-6 rounded-full bg-white text-[#14181f] text-xs font-bold inline-flex items-center justify-center">
            ${items.length}
          </span>
        </div>

        <div class="space-y-3 min-h-[180px]">
          ${items.length === 0 ? `
            <div class="bento-light p-6 text-center text-xs text-[#8a92a0] border-2 border-dashed border-[#d5d9e0]">
              Arraste um card para esta etapa
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
              <div
                draggable="true"
                data-pipe-id="${item.id}"
                ondragstart="window.onKanbanCardDragStart(event, '${item.id}')"
                ondragover="window.onKanbanCardDragOver(event)"
                ondragleave="window.onKanbanCardDragLeave(event)"
                ondrop="window.onKanbanCardDrop(event, '${item.id}', '${stage.id}')"
                ondragend="window.onKanbanCardDragEnd(event)"
                class="interactive-card bento-light bento-hover p-4 space-y-3"
              >
                <div class="flex items-center justify-between gap-1">
                  <div class="flex items-center gap-1.5">
                    <span class="card-drag-grip bg-[#f1f3f6] text-[#5a6270] hover:bg-[#14181f] hover:text-[#b6f53b]" title="Arraste para outra coluna ou posição">⋮⋮</span>
                    <span class="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-[#14181f] text-white">
                      ${escapeHtml(ed.agencia)} (${escapeHtml(ed.uf)}) • ${escapeHtml(ed.numero)}
                    </span>
                  </div>
                  <button
                    onclick="window.removePipelineItem('${item.id}')"
                    class="text-[#8a92a0] hover:text-[#14181f] text-xs font-bold"
                    title="Remover proposta do Kanban"
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
                  <div class="grid grid-cols-2 gap-1.5">
                    <button
                      onclick="window.openPipelineModal('${item.id}')"
                      class="py-1.5 px-2.5 rounded-full text-[11px] font-bold bg-[#14181f] text-white hover:bg-[#252b36] transition flex items-center justify-center gap-1"
                    >
                      <span>🧮 Orçamento</span>
                    </button>
                    <button
                      onclick="window.openWorkplanModal('${ed.id}')"
                      class="py-1.5 px-2.5 rounded-full text-[11px] font-extrabold bg-[#b6f53b] text-[#14181f] hover:brightness-95 transition flex items-center justify-center gap-1"
                      title="Gerar Plano de Trabalho para o AgilFAP / FAP"
                    >
                      <span>✨ Plano</span>
                    </button>
                  </div>
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
      <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
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
      <div style="margin-bottom: 12px;"><img src="/logo-full.svg" alt="RadarFAP Brasil" style="height: 44px;" /></div>
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
  const webhookInput = document.getElementById('alertWebhookUrl');
  const notifBadge = document.getElementById('browserNotifStatusBadge');

  if (daysInput) daysInput.value = cfg.diasAntecedenciaVencimento || 20;
  if (prorrogCheck) prorrogCheck.checked = cfg.notificarProrrogacoesFacepe !== false;
  if (webhookInput && cfg.webhookUrl !== undefined) webhookInput.value = cfg.webhookUrl || '';

  if (notifBadge && 'Notification' in window) {
    if (Notification.permission === 'granted') {
      notifBadge.textContent = 'Ativo • Desktop';
      notifBadge.className = 'px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-[#b6f53b] text-[#14181f]';
    } else if (Notification.permission === 'denied') {
      notifBadge.textContent = 'Bloqueado no Navegador';
      notifBadge.className = 'px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-white/10 text-[#9aa2b1]';
    }
  }

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

  const timelineEl = document.getElementById('deadlinesTimelineList');
  if (timelineEl) {
    const userUf = appState.researcherProfile?.ufPrincipal || 'PE';
    const upcoming = [...(appState.editais || [])]
      .filter(e => e.status === 'Aberto' && e.prazoSubmissao)
      .sort((a, b) => (a.prazoSubmissao || '9999').localeCompare(b.prazoSubmissao || '9999'))
      .filter(e =>
        (appState.favoritos || []).includes(e.id) ||
        (appState.pipeline || []).some(p => p.editalId === e.id) ||
        e.uf === userUf ||
        e.uf === 'BR'
      )
      .slice(0, 6);

    timelineEl.innerHTML = upcoming.map(ed => {
      const days = getDaysRemaining(ed.prazoSubmissao);
      const isUrgent = days !== null && days <= 15;
      return `
        <div onclick="window.openDetailModal('${ed.id}')" class="p-3.5 rounded-2xl bg-[#f6f7f9] hover:bg-[#ebedf2] cursor-pointer flex items-center justify-between gap-2 transition">
          <div class="min-w-0">
            <div class="flex items-center gap-1.5">
              <span class="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-[#14181f] text-white">${escapeHtml(ed.agencia)} (${escapeHtml(ed.uf)})</span>
              <span class="text-xs font-bold text-[#14181f] truncate">Nº ${escapeHtml(ed.numero)}</span>
            </div>
            <p class="text-[11px] text-[#5a6270] truncate mt-1">${escapeHtml(ed.titulo)}</p>
          </div>
          <div class="text-right shrink-0">
            <span class="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold ${
              isUrgent ? 'bg-[#14181f] text-[#b6f53b]' : 'bg-white text-[#14181f]'
            }">
              ${days !== null ? `${days}d` : formatDateBr(ed.prazoSubmissao)}
            </span>
            <div class="text-[10px] text-[#8a92a0] mt-0.5">${formatDateBr(ed.prazoSubmissao)}</div>
          </div>
        </div>
      `;
    }).join('');
  }

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

    <!-- Diagnóstico de Elegibilidade e Aderência ao Perfil -->
    <div class="p-4 rounded-2xl bg-[#14181f] text-white space-y-3">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div class="flex items-center gap-2">
          <span class="px-3 py-1 rounded-full bg-[#b6f53b] text-[#14181f] text-xs font-extrabold">${ed.matchScore || 80}% Match com seu Perfil</span>
          <span class="text-xs text-[#9aa2b1]">Diagnóstico de Enquadramento &amp; Elegibilidade</span>
        </div>
        <button onclick="window.closeDetailModal(); window.openWorkplanModal('${ed.id}');" class="btn-pill-lime !py-1.5 !px-3.5 text-xs">
          ✨ Gerar Plano de Trabalho (${escapeHtml(ed.plataformaSubmissao || 'AgilFAP')})
        </button>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-[#d5d9e2]">
        ${(ed.matchRazoes || []).map(r => `
          <div class="px-3 py-2 rounded-xl bg-white/5 border border-white/10">${escapeHtml(r)}</div>
        `).join('')}
      </div>
    </div>

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
  appState.favoritos = appState.favoritos || [];
  if (appState.favoritos.includes(editalId)) {
    appState.favoritos = appState.favoritos.filter(id => id !== editalId);
  } else {
    appState.favoritos.push(editalId);
  }
  saveWorkspaceBackup();
  renderAll();
  showToast('Favoritos atualizados!');

  try {
    await fetch('/api/favoritos/toggle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ editalId })
    });
  } catch {}
};

window.addToPipeline = async function addToPipeline(editalId, targetStage = 'analise') {
  const ed = appState.editais.find(e => e.id === editalId);
  appState.pipeline = appState.pipeline || [];
  const existing = appState.pipeline.find(p => p.editalId === editalId);

  if (existing) {
    existing.estagio = targetStage;
    existing.atualizadoEm = new Date().toISOString();
  } else {
    appState.pipeline.push({
      id: `pipe-${Date.now()}`,
      editalId,
      estagio: targetStage,
      pesquisadorResponsavel: appState.researcherProfile?.nomePesquisador || 'Coordenação Principal',
      instituicao: appState.researcherProfile?.instituicao || 'UFPE / UFRPE / UPE / ICT',
      valorPleiteado: ed?.valorNumerico && ed.valorNumerico <= 600000 ? ed.valorNumerico : 180000,
      prioridade: 'Alta',
      notas: `Submissão planejada para ${ed?.agencia || 'FAP'} (${ed?.numero || ''}) via ${ed?.plataformaSubmissao || 'portal'}.`,
      checklist: [
        { texto: 'Ler edital completo e anexos/adendos', concluido: false },
        { texto: 'Verificar elegibilidade e Currículo Lattes', concluido: false },
        { texto: 'Elaborar proposta técnica e orçamento', concluido: false },
        { texto: 'Submeter na plataforma oficial da FAP', concluido: false }
      ],
      atualizadoEm: new Date().toISOString()
    });
  }

  saveWorkspaceBackup();
  renderAll();
  showToast(`Edital ${ed?.numero || ''} adicionado ao Pipeline de Submissões!`);

  try {
    await fetch('/api/pipeline', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        editalId,
        estagio: targetStage,
        valorPleiteado: ed?.valorNumerico && ed.valorNumerico <= 600000 ? ed.valorNumerico : 180000,
        notas: `Submissão planejada para ${ed?.agencia || 'FAP'} (${ed?.numero || ''}) via ${ed?.plataformaSubmissao || 'portal'}.`
      })
    });
  } catch {}
};

window.movePipelineStage = async function movePipelineStage(pipeId, novoEstagio) {
  const item = (appState.pipeline || []).find(p => p.id === pipeId);
  if (item) {
    item.estagio = novoEstagio;
    item.atualizadoEm = new Date().toISOString();
  }
  saveWorkspaceBackup();
  renderAll();
  const stageObj = KANBAN_STAGES.find(s => s.id === novoEstagio);
  showToast(`Card movido para "${stageObj ? stageObj.label : novoEstagio}"!`);

  try {
    await fetch('/api/pipeline', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: pipeId, estagio: novoEstagio })
    });
  } catch {}
};

window.toggleChecklistItem = async function toggleChecklistItem(pipeId, checkIdx) {
  const item = appState.pipeline.find(p => p.id === pipeId);
  if (!item || !item.checklist) return;
  const updatedChecklist = item.checklist.map((c, i) =>
    i === checkIdx ? { ...c, concluido: !c.concluido } : c
  );
  item.checklist = updatedChecklist;
  saveWorkspaceBackup();
  renderAll();

  try {
    await fetch('/api/pipeline', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: pipeId, checklist: updatedChecklist })
    });
  } catch {}
};

window.removePipelineItem = async function removePipelineItem(pipeId) {
  appState.pipeline = (appState.pipeline || []).filter(p => p.id !== pipeId);
  saveWorkspaceBackup();
  renderAll();
  showToast('Proposta removida do pipeline.');

  try {
    await fetch(`/api/pipeline/${encodeURIComponent(pipeId)}`, { method: 'DELETE' });
  } catch {}
};

// ===================== FILTROS RÁPIDOS =====================
window.filterByFap = function filterByFap(sigla) {
  onlyFavoritesFilter = false;
  onlyHighMatchFilter = false;
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
  onlyHighMatchFilter = false;
  regionQuickFilter = regiao;
  document.getElementById('filterUf').value = 'ALL';
  document.getElementById('filterAgencia').value = 'ALL';
  window.switchTab('editais');
  renderEditaisTab();
};

window.filterByArea = function filterByArea(area) {
  onlyFavoritesFilter = false;
  onlyHighMatchFilter = false;
  regionQuickFilter = 'ALL';
  document.getElementById('filterArea').value = area;
  window.switchTab('editais');
  renderEditaisTab();
};

window.applyQuickFilter = function applyQuickFilter(mode) {
  onlyFavoritesFilter = false;
  onlyHighMatchFilter = false;
  regionQuickFilter = 'ALL';
  document.getElementById('filterSearch').value = '';
  document.getElementById('filterUf').value = 'ALL';
  document.getElementById('filterAgencia').value = 'ALL';
  document.getElementById('filterArea').value = 'ALL';
  document.getElementById('filterStatus').value = 'ALL';

  if (mode === 'high_match') {
    onlyHighMatchFilter = true;
    document.getElementById('filterStatus').value = 'Aberto';
    document.getElementById('filterSort').value = 'match';
  } else if (mode === 'all_open') {
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
    const webhookUrl = (document.getElementById('alertWebhookUrl')?.value || '').trim();

    const res = await fetch('/api/alerts/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ufsMonitoradas: checkedUfs,
        diasAntecedenciaVencimento: dias,
        notificarProrrogacoesFacepe: prorrog,
        webhookUrl
      })
    });
    const data = await res.json();
    if (data.state) {
      appState = data.state;
      renderAll();
      showToast('Preferências de alerta e Webhook salvos!');
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

  document.getElementById('researcherProfileForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    const checkedAreas = Array.from(document.querySelectorAll('input[name="profArea"]:checked')).map(el => el.value);
    const rawKws = document.getElementById('profPalavrasChave').value || '';
    const kws = rawKws.split(',').map(k => k.trim()).filter(Boolean);

    const updatedProfile = {
      nomePesquisador: document.getElementById('profNomePesquisador').value.trim() || 'Prof. Dr. Coordenador Principal',
      instituicao: document.getElementById('profInstituicao').value.trim() || 'UFPE / UFRPE / UPE / ICT',
      ufPrincipal: document.getElementById('profUfPrincipal').value || 'PE',
      naturezaVinculo: document.getElementById('profNaturezaVinculo').value || 'ICT Pública / Universidade',
      titulacao: document.getElementById('profTitulacao').value || 'Doutorado',
      linhaTematicaProjeto: document.getElementById('profLinhaTematica').value.trim() || 'Soluções Científicas e Tecnológicas Aplicadas ao Desenvolvimento Regional',
      areasPrioritarias: checkedAreas.length > 0 ? checkedAreas : ALL_FOMENTO_AREAS,
      palavrasChave: kws,
      incluirFederais: document.getElementById('profIncluirFederais').checked,
      incluirOutrosEstados: document.getElementById('profIncluirOutrosEstados').checked
    };

    appState.researcherProfile = updatedProfile;
    recalculateClientSideMatches();
    saveWorkspaceBackup();

    try {
      const res = await fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedProfile)
      });
      if (res.ok) {
        const data = await res.json();
        if (data.state) {
          appState = data.state;
          mergeWorkspaceBackup();
          recalculateClientSideMatches();
        }
      }
    } catch {}

    renderAll();
    window.closeProfileModal();
    showToast(`Perfil salvo! Scores de % Match recalculados para ${updatedProfile.ufPrincipal}.`);
  });
});

// ===================== MODAL PERFIL DO PESQUISADOR / ICT =====================
window.openProfileModal = function openProfileModal() {
  const prof = appState.researcherProfile || {};
  document.getElementById('profNomePesquisador').value = prof.nomePesquisador || 'Prof. Dr. Coordenador Principal';
  document.getElementById('profInstituicao').value = prof.instituicao || 'UFPE / UFRPE / UPE / ICT Parceira';
  document.getElementById('profUfPrincipal').value = prof.ufPrincipal || 'PE';
  document.getElementById('profNaturezaVinculo').value = prof.naturezaVinculo || 'ICT Pública / Universidade';
  document.getElementById('profTitulacao').value = prof.titulacao || 'Doutorado';
  document.getElementById('profLinhaTematica').value = prof.linhaTematicaProjeto || 'Soluções Científicas, IA e Inovação Aplicadas ao Desenvolvimento Regional';
  document.getElementById('profPalavrasChave').value = (prof.palavrasChave || ['pesquisa', 'bolsas', 'pós-graduação', 'inovação', 'startups', 'missões']).join(', ');
  document.getElementById('profIncluirFederais').checked = prof.incluirFederais !== false;
  document.getElementById('profIncluirOutrosEstados').checked = prof.incluirOutrosEstados !== false;

  const areasContainer = document.getElementById('profAreasCheckboxes');
  if (areasContainer) {
    const activeAreas = prof.areasPrioritarias || ALL_FOMENTO_AREAS;
    areasContainer.innerHTML = ALL_FOMENTO_AREAS.map(area => {
      const checked = activeAreas.includes(area);
      return `
        <label class="flex items-center gap-2 p-1.5 rounded-xl hover:bg-white/5 cursor-pointer">
          <input type="checkbox" name="profArea" value="${escapeHtml(area)}" ${checked ? 'checked' : ''} class="accent-[#b6f53b] rounded" />
          <span class="text-white font-medium">${escapeHtml(area)}</span>
        </label>
      `;
    }).join('');
  }

  document.getElementById('researcherProfileModal').classList.remove('hidden');
};

window.closeProfileModal = function closeProfileModal() {
  document.getElementById('researcherProfileModal').classList.add('hidden');
};

// ===================== ESTÚDIO GERADOR DE PLANO DE TRABALHO (AGILFAP / CNPQ / FAPS) =====================
window.openWorkplanFromPipelineModal = function openWorkplanFromPipelineModal() {
  const pipeId = document.getElementById('pipeFormId').value;
  const item = appState.pipeline.find(p => p.id === pipeId);
  if (!item) return;
  window.closePipelineModal();
  window.openWorkplanModal(item.editalId);
};

window.openWorkplanModal = function openWorkplanModal(editalId) {
  const ed = appState.editais.find(e => e.id === editalId) || appState.editais[0];
  if (!ed) return;

  const prof = appState.researcherProfile || {};
  const pipeItem = appState.pipeline.find(p => p.editalId === ed.id);

  document.getElementById('wpEditalId').value = ed.id;
  document.getElementById('wpTargetAgencyBadge').textContent = `${ed.agencia} • ${ed.uf} (${ed.plataformaSubmissao || 'Portal'})`;
  document.getElementById('wpModalEditalTitle').textContent = `${ed.numero} — ${ed.titulo}`;

  const cleanEditalFocus = (ed.titulo || '')
    .replace(/^Edital\s+[A-Z]+\s+nº\s*[\d/]+\s*[–—-]\s*/i, '')
    .trim();

  const defaultProjectTitle = pipeItem?.tituloProjeto ||
    `${prof.linhaTematicaProjeto || 'Pesquisa e Desenvolvimento Aplicado'} em Alinhamento ao ${cleanEditalFocus || ed.titulo}`;

  const defaultBudget = pipeItem?.valorPleiteado ||
    (ed.valorNumerico && ed.valorNumerico <= 600000 ? ed.valorNumerico : 180000);

  document.getElementById('wpProjectTitle').value = defaultProjectTitle;
  document.getElementById('wpBudgetTotal').value = defaultBudget;
  document.getElementById('wpDurationMonths').value = '24';
  document.getElementById('wpCoordinator').value = pipeItem?.pesquisadorResponsavel || prof.nomePesquisador || 'Prof. Dr. Coordenador Principal';
  document.getElementById('wpInstitution').value = pipeItem?.instituicao || prof.instituicao || 'UFPE / UFRPE / UPE / ICT Executora';

  if (pipeItem?.planoTrabalhoRascunho) {
    document.getElementById('wpDraftTextarea').value = pipeItem.planoTrabalhoRascunho;
  } else {
    window.regenerateWorkplanDraft();
  }

  document.getElementById('workplanStudioModal').classList.remove('hidden');
};

window.closeWorkplanModal = function closeWorkplanModal() {
  document.getElementById('workplanStudioModal').classList.add('hidden');
};

window.regenerateWorkplanDraft = function regenerateWorkplanDraft() {
  const editalId = document.getElementById('wpEditalId').value;
  const ed = appState.editais.find(e => e.id === editalId) || {};
  const prof = appState.researcherProfile || {};

  const projectTitle = document.getElementById('wpProjectTitle').value || 'Proposta de Pesquisa e Inovação';
  const totalBudget = Number(document.getElementById('wpBudgetTotal').value) || 180000;
  const months = Number(document.getElementById('wpDurationMonths').value) || 24;
  const coordinator = document.getElementById('wpCoordinator').value || 'Coordenação do Projeto';
  const institution = document.getElementById('wpInstitution').value || 'ICT Executora';

  const custeio = Math.round(totalBudget * 0.45);
  const capital = Math.round(totalBudget * 0.25);
  const bolsas = totalBudget - custeio - capital;
  const trimestres = Math.max(4, Math.round(months / 3));
  const kws = (prof.palavrasChave || ['pesquisa científica', 'inovação tecnológica', 'sustentabilidade', 'impacto regional']).slice(0, 5).join(', ');

  const draft = [
    `================================================================================`,
    `PLANO DE TRABALHO E PROPOSTA TÉCNICA — PADRÃO ${ (ed.plataformaSubmissao || 'AGILFAP / FAP').toUpperCase() }`,
    `================================================================================`,
    ``,
    `1. IDENTIFICAÇÃO E ENQUADRAMENTO DA PROPOSTA`,
    `• Chamada Pública / Edital: ${ed.titulo || ''} (Nº ${ed.numero || 'S/N'})`,
    `• Agência de Fomento / UF: ${ed.agencia || 'FACEPE'} (${ed.estado || 'Pernambuco'} - ${ed.uf || 'PE'})`,
    `• Linha de Fomento: ${ed.area || 'Pesquisa Científica (APQ / Missões)'}`,
    `• Plataforma de Submissão: ${ed.plataformaSubmissao || 'Sistema AgilFAP'} (${ed.linkSubmissao || 'https://agil.facepe.br/'})`,
    `• Prazo Limite do Edital: ${formatDateBr(ed.prazoSubmissao)}`,
    `• Título do Projeto: ${projectTitle}`,
    `• Coordenador(a) Responsável: ${coordinator} (${prof.titulacao || 'Doutorado'})`,
    `• Instituição Executora: ${institution} (${prof.naturezaVinculo || 'ICT Pública / Universidade'})`,
    `• Prazo de Execução: ${months} meses (${trimestres} trimestres)`,
    `• Valor Global Pleiteado: ${formatCurrencyBRL(totalBudget)}`,
    ``,
    `2. RESUMO EXECUTIVO (PADRÃO AGILFAP / PLATAFORMA LATTES)`,
    `Esta proposta visa desenvolver e validar soluções técnico-científicas voltadas a "${projectTitle}", em estrita consonância com as diretrizes do ${ed.titulo || 'edital'} promovido pela ${ed.agencia || 'FACEPE'}. O projeto articula competências em ${kws}, estruturando entregas aplicadas com alto potencial de transferência tecnológica, formação de recursos humanos qualificados e fortalecimento do ecossistema de ciência, tecnologia e inovação de ${ed.estado || 'Pernambuco'} (${ed.uf || 'PE'}).`,
    `Palavras-chave: ${kws}.`,
    ``,
    `3. JUSTIFICATIVA, RELEVÂNCIA REGIONAL E ADERÊNCIA AO EDITAL`,
    `• Aderência à Chamada (${ed.matchScore || 88}% Match): O edital prioriza "${ed.resumo || 'o fortalecimento da pesquisa e inovação'}". A instituição executora (${institution}) dispõe de infraestrutura laboratorial e equipe com histórico comprovado na área.`,
    `• Impacto Socioeconômico e Científico em ${ed.uf || 'PE'}: O projeto endereça gargalos estratégicos regionais, gerando indicadores mensuráveis de produção científica, inovação aberta e apoio a políticas públicas/setor produtivo.`,
    `• Alinhamento aos Objetivos de Desenvolvimento Sustentável (ODS/ONU): Contribuição direta aos ODS 4 (Educação de Qualidade), ODS 8 (Trabalho Decente e Crescimento Econômico) e ODS 9 (Indústria, Inovação e Infraestrutura).`,
    ``,
    `4. OBJETIVO GERAL E OBJETIVOS ESPECÍFICOS`,
    `[Objetivo Geral]`,
    `Conceber, desenvolver, validar em ambiente operacional e difundir os resultados do projeto "${projectTitle}" ao longo de ${months} meses, atendendo integralmente às metas técnicas do Edital ${ed.numero || ''} da ${ed.agencia || 'FACEPE'}.`,
    ``,
    `[Objetivos Específicos]`,
    `• OE1 (Diagnóstico e Arquitetura Metodológica): Realizar o levantamento sistemático do estado da arte, requisitos técnicos e protocolos experimentais nos primeiros ${Math.round(months * 0.25)} meses.`,
    `• OE2 (Desenvolvimento Experimental / Tecnológico): Executar a coleta de dados, modelagem e implementação do protótipo/metodologia central do projeto.`,
    `• OE3 (Validação Empírica e Indicadores de Desempenho): Testar a solução junto ao público-alvo (${ed.publicoAlvo || 'ICTs e parceiros'}) com métricas reprodutíveis.`,
    `• OE4 (Difusão Científica, Propriedade Intelectual e Relatório Técnico): Publicar artigos em periódicos de alto impacto, registrar ativos junto ao NIT institucional e consolidar a prestação de contas no ${ed.plataformaSubmissao || 'AgilFAP'}.`,
    ``,
    `5. METODOLOGIA E PACOTES DE TRABALHO (WORK PACKAGES)`,
    `• WP1 — Gestão Científica, Comitê de Ética e Governança (Mês 1 ao Mês ${months}): Coordenação técnica, alinhamento de bolsistas e relatórios parciais/finais.`,
    `• WP2 — Modelagem Teórica, Coleta de Dados e Requisitos (Mês 1 ao Mês ${Math.round(months * 0.35)}): Revisão sistemática e preparação da base experimental.`,
    `• WP3 — Desenvolvimento, Experimentação e Integração (Mês ${Math.round(months * 0.25)} ao Mês ${Math.round(months * 0.75)}): Execução laboratorial/computacional e testes iterativos.`,
    `• WP4 — Validação, Transferência de Tecnologia e Publicações (Mês ${Math.round(months * 0.65)} ao Mês ${months}): Seminário de resultados, submissão de artigos/patentes e entrega do Relatório Técnico Final.`,
    ``,
    `6. CRONOGRAMA FÍSICO DE EXECUÇÃO (${months} MESES / ${trimestres} TRIMESTRES)`,
    `• Etapa 1 (1º ao ${Math.round(trimestres * 0.25)}º Trimestre): Estruturação da equipe, seleção de bolsistas, revisão da literatura e especificação detalhada (Vinculado ao OE1 / WP1 e WP2).`,
    `• Etapa 2 (${Math.round(trimestres * 0.25) + 1}º ao ${Math.round(trimestres * 0.5)}º Trimestre): Aquisição de itens de custeio/capital, implementação dos experimentos e Relatório Técnico Parcial (Vinculado ao OE2 / WP3).`,
    `• Etapa 3 (${Math.round(trimestres * 0.5) + 1}º ao ${Math.round(trimestres * 0.75)}º Trimestre): Testes de validação, análise estatística/computacional e ajustes da solução (Vinculado ao OE3 / WP3).`,
    `• Etapa 4 (${Math.round(trimestres * 0.75) + 1}º ao ${trimestres}º Trimestre): Redação de artigos científicos, workshop de disseminação e Prestação de Contas Final no ${ed.plataformaSubmissao || 'AgilFAP'} (Vinculado ao OE4 / WP4).`,
    ``,
    `7. MEMÓRIA DE CÁLCULO ORÇAMENTÁRIA POR RUBRICAS (${formatCurrencyBRL(totalBudget)})`,
    `• A) CUSTEIO E SERVIÇOS DE TERCEIROS (45% — ${formatCurrencyBRL(custeio)}):`,
    `  - Material de consumo laboratorial, reagentes, licenças de software/nuvem, serviços técnicos especializados, passagens e diárias para trabalho de campo/eventos científicos.`,
    `• B) CAPITAL E EQUIPAMENTOS PERMANENTES (25% — ${formatCurrencyBRL(capital)}):`,
    `  - Estações de processamento de alto desempenho, instrumentação científica e equipamentos multiusuários incorporáveis ao patrimônio da ${institution}.`,
    `• C) BOLSAS DE PESQUISA E EXTENSÃO TECNOLÓGICA (30% — ${formatCurrencyBRL(bolsas)}):`,
    `  - Cotas de bolsas (${ed.agencia === 'FACEPE' ? 'Modalidades BCT / BFD / BIC / DCR conforme tabela vigente da FACEPE' : 'Modalidades IC / Mestrado / Doutorado / Apoio Técnico conforme tabela da agência'}) pelo período de ${months} meses.`,
    `• TOTAL PLEITEADO: ${formatCurrencyBRL(totalBudget)}`,
    ``,
    `8. RESULTADOS ESPERADOS E INDICADORES DE IMPACTO`,
    `• Produção Bibliográfica: Mínimo de 2 a 4 artigos submetidos a periódicos Qualis A / indexados (Scopus/Web of Science).`,
    `• Formação de Recursos Humanos: Orientação de pesquisadores, estudantes de pós-graduação e iniciação científica.`,
    `• Inovação / Produto Técnico: 1 protótipo, software registrado, processo tecnológico ou nota técnica executiva entregue à sociedade/setor produtivo.`,
    ``,
    `9. CHECKLIST DE DOCUMENTAÇÃO OBRIGATÓRIA (${ed.plataformaSubmissao || 'AGILFAP'})`,
    `[ ] Formulário eletrônico preenchido integralmente no sistema ${ed.plataformaSubmissao || 'AgilFAP'} (${ed.linkSubmissao || ''})`,
    `[ ] Currículo Lattes atualizado do(a) Coordenador(a) e da equipe executora`,
    `[ ] Carta de Anuência institucional assinada pelo representante legal da ${institution}`,
    `[ ] Certidões de regularidade institucional e ausência de inadimplência junto à ${ed.agencia || 'FACEPE'}`,
    `[ ] Plano de Trabalho das Bolsas solicitadas com atividades individualizadas por bolsista`
  ].join('\n');

  document.getElementById('wpDraftTextarea').value = draft;
};

window.copyWorkplanToClipboard = async function copyWorkplanToClipboard() {
  const text = document.getElementById('wpDraftTextarea')?.value || '';
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    showToast('Plano de Trabalho copiado para a área de transferência! Pronto para colar no AgilFAP.');
  } catch {
    const ta = document.getElementById('wpDraftTextarea');
    ta.select();
    document.execCommand('copy');
    showToast('Plano de Trabalho copiado!');
  }
};

window.downloadWorkplanFile = function downloadWorkplanFile() {
  const editalId = document.getElementById('wpEditalId').value;
  const ed = appState.editais.find(e => e.id === editalId) || {};
  const text = document.getElementById('wpDraftTextarea')?.value || '';
  const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `plano-de-trabalho-${(ed.agencia || 'fap').toLowerCase()}-${(ed.numero || 'edital').replace(/[^a-zA-Z0-9]/g, '-')}.md`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Documento do Plano de Trabalho (.md) baixado!');
};

window.printWorkplanDocument = function printWorkplanDocument() {
  const editalId = document.getElementById('wpEditalId').value;
  const ed = appState.editais.find(e => e.id === editalId) || {};
  const projectTitle = document.getElementById('wpProjectTitle').value || 'Plano de Trabalho';
  const text = document.getElementById('wpDraftTextarea')?.value || '';

  const w = window.open('', '_blank', 'width=900,height=760');
  if (!w) return;
  w.document.write(`
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8" />
      <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
      <title>Plano de Trabalho — ${escapeHtml(projectTitle)}</title>
      <style>
        body { font-family: 'Segoe UI', Arial, sans-serif; color: #14181f; padding: 40px; max-width: 820px; margin: 0 auto; line-height: 1.55; }
        .header { border-bottom: 3px solid #14181f; padding-bottom: 14px; margin-bottom: 20px; }
        .badge { display: inline-block; background: #14181f; color: #b6f53b; padding: 4px 12px; border-radius: 99px; font-size: 11px; font-weight: bold; }
        pre { white-space: pre-wrap; word-wrap: break-word; font-family: 'Segoe UI', Arial, sans-serif; font-size: 13px; background: #f8f9fb; padding: 20px; border-radius: 12px; border: 1px solid #dcdfe5; }
      </style>
    </head>
    <body>
      <div class="header">
        <div style="margin-bottom: 10px;"><img src="/logo-full.svg" alt="RadarFAP Brasil" style="height: 44px;" /></div>
        <span class="badge">RadarFAP Brasil • Minuta Oficial de Submissão (${escapeHtml(ed.agencia || 'FACEPE')} - ${escapeHtml(ed.uf || 'PE')})</span>
        <h1 style="font-size: 18px; margin: 10px 0 4px;">${escapeHtml(projectTitle)}</h1>
        <div style="font-size: 12px; color: #5a6270;">Referência: ${escapeHtml(ed.titulo || '')} • Prazo: ${formatDateBr(ed.prazoSubmissao)}</div>
      </div>
      <pre>${escapeHtml(text)}</pre>
      <script>window.onload = () => window.print();</script>
    </body>
    </html>
  `);
  w.document.close();
};

window.saveWorkplanToPipeline = async function saveWorkplanToPipeline() {
  const editalId = document.getElementById('wpEditalId').value;
  const ed = appState.editais.find(e => e.id === editalId);
  if (!ed) return;

  const projectTitle = document.getElementById('wpProjectTitle').value;
  const totalBudget = Number(document.getElementById('wpBudgetTotal').value) || 180000;
  const coordinator = document.getElementById('wpCoordinator').value;
  const institution = document.getElementById('wpInstitution').value;
  const draftText = document.getElementById('wpDraftTextarea').value;

  const custeio = Math.round(totalBudget * 0.45);
  const capital = Math.round(totalBudget * 0.25);
  const bolsas = totalBudget - custeio - capital;

  const existingPipe = appState.pipeline.find(p => p.editalId === editalId);

  const payload = {
    id: existingPipe?.id,
    editalId,
    estagio: existingPipe?.estagio || 'elaboracao',
    tituloProjeto: projectTitle,
    pesquisadorResponsavel: coordinator,
    instituicao: institution,
    valorPleiteado: totalBudget,
    rubricaCusteio: custeio,
    rubricaCapital: capital,
    rubricaBolsas: bolsas,
    planoTrabalhoRascunho: draftText,
    notas: `Plano de Trabalho estruturado (${projectTitle}) salvo para submissão via ${ed.plataformaSubmissao || 'AgilFAP'}.`
  };

  const res = await fetch('/api/pipeline', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  if (data.state) {
    appState = data.state;
    // Garante que os campos extras também fiquem no estado local e localStorage
    const targetPipe = appState.pipeline.find(p => p.editalId === editalId);
    if (targetPipe) {
      targetPipe.tituloProjeto = projectTitle;
      targetPipe.planoTrabalhoRascunho = draftText;
      targetPipe.rubricaCusteio = custeio;
      targetPipe.rubricaCapital = capital;
      targetPipe.rubricaBolsas = bolsas;
    }
    renderAll();
    window.closeWorkplanModal();
    showToast(`Plano de Trabalho e orçamento salvos na etapa "Escrevendo Projeto" do Kanban!`);
  }
};

// ===================== NOTIFICAÇÕES NATIVAS, WEBHOOK, BACKUP JSON & RELATÓRIO EXECUTIVO =====================
window.enableBrowserNotifications = async function enableBrowserNotifications() {
  if (!('Notification' in window)) {
    showToast('Seu navegador não suporta notificações nativas.');
    return;
  }
  const permission = await Notification.requestPermission();
  renderAlertasTab();
  if (permission === 'granted') {
    showToast('Alertas Desktop ativados com sucesso!');
    window.sendTestBrowserNotification();
  } else {
    showToast('Permissão de notificação não concedida pelo navegador.');
  }
};

window.sendTestBrowserNotification = function sendTestBrowserNotification() {
  const topEdital = [...(appState.editais || [])]
    .filter(e => e.status === 'Aberto')
    .sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0))[0];

  const title = `RadarFAP Brasil • ${appState.alerts?.length || 0} Alertas Ativos`;
  const body = topEdital
    ? `Destaque (${topEdital.matchScore}% Match): ${topEdital.agencia} Nº ${topEdital.numero} — Prazo: ${formatDateBr(topEdital.prazoSubmissao)}`
    : 'Monitoramento em tempo real ativo para FACEPE e 27 FAPs.';

  if ('Notification' in window && Notification.permission === 'granted') {
    try {
      new Notification(title, { body });
    } catch {}
  }
  showToast(`🔔 ${title}: ${body}`);
};

window.testAlertWebhook = async function testAlertWebhook() {
  const webhookUrl = (document.getElementById('alertWebhookUrl')?.value || '').trim();
  showToast('Preparando disparo do boletim de oportunidades...');
  try {
    const res = await fetch('/api/alerts/test-webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ webhookUrl })
    });
    const data = await res.json();
    if (webhookUrl && data.webhookDispatched) {
      showToast(`Boletim enviado com sucesso para o Webhook às ${data.dispatchedAt}!`);
    } else if (webhookUrl && !data.webhookDispatched) {
      showToast(`Aviso: o endpoint de Webhook retornou erro ou bloqueio (${data.webhookStatus}).`);
    } else {
      await navigator.clipboard?.writeText(data.messageText || '');
      showToast('Boletim executivo gerado e copiado para a área de transferência! (Informe uma URL para envio automático)');
    }
  } catch (err) {
    showToast(`Erro ao testar boletim: ${err.message}`);
  }
};

window.exportWorkspaceJson = function exportWorkspaceJson() {
  const payload = {
    version: '2.0',
    exportedAt: new Date().toISOString(),
    researcherProfile: appState.researcherProfile || {},
    favoritos: appState.favoritos || [],
    pipeline: appState.pipeline || [],
    alertConfig: appState.alertConfig || {},
    manualEditais: (appState.editais || []).filter(e => e.curadoriaManual)
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `radarfap-carteira-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Carteira de projetos e perfil exportados em .JSON!');
};

window.triggerImportWorkspaceJson = function triggerImportWorkspaceJson() {
  const input = document.getElementById('importWorkspaceInput');
  if (input) {
    input.value = '';
    input.click();
  }
};

window.handleImportWorkspaceFile = function handleImportWorkspaceFile(event) {
  const file = event.target?.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async e => {
    try {
      const imported = JSON.parse(String(e.target?.result || '{}'));
      if (imported.researcherProfile) {
        appState.researcherProfile = { ...(appState.researcherProfile || {}), ...imported.researcherProfile };
        fetch('/api/profile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(appState.researcherProfile)
        }).catch(() => {});
      }
      if (Array.isArray(imported.favoritos)) {
        appState.favoritos = [...new Set([...(appState.favoritos || []), ...imported.favoritos])];
      }
      if (Array.isArray(imported.pipeline)) {
        const pipeMap = new Map((appState.pipeline || []).map(p => [p.id, p]));
        for (const item of imported.pipeline) {
          pipeMap.set(item.id, item);
          fetch('/api/pipeline', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(item)
          }).catch(() => {});
        }
        appState.pipeline = Array.from(pipeMap.values());
      }
      if (imported.alertConfig) {
        appState.alertConfig = { ...(appState.alertConfig || {}), ...imported.alertConfig };
      }
      if (Array.isArray(imported.manualEditais)) {
        const edMap = new Map((appState.editais || []).map(ed => [ed.id, ed]));
        for (const me of imported.manualEditais) {
          edMap.set(me.id, me);
        }
        appState.editais = Array.from(edMap.values());
      }
      saveWorkspaceBackup();
      renderAll();
      showToast('Carteira de projetos importada e sincronizada com sucesso!');
    } catch {
      showToast('Arquivo JSON inválido. Verifique o arquivo exportado pelo RadarFAP.');
    }
  };
  reader.readAsText(file);
};

window.printPortfolioReport = function printPortfolioReport() {
  const prof = appState.researcherProfile || {};
  const pipe = appState.pipeline || [];

  let totalPortfolio = 0;
  let totalCusteio = 0;
  let totalCapital = 0;
  let totalBolsas = 0;

  const enrichedRows = pipe.map(item => {
    const ed = appState.editais.find(e => e.id === item.editalId) || {};
    const val = Number(item.valorPleiteado) || 150000;
    const cust = item.rubricaCusteio ?? Math.round(val * 0.45);
    const cap = item.rubricaCapital ?? Math.round(val * 0.25);
    const bol = item.rubricaBolsas ?? (val - cust - cap);

    totalPortfolio += val;
    totalCusteio += cust;
    totalCapital += cap;
    totalBolsas += bol;

    const stageObj = KANBAN_STAGES.find(s => s.id === item.estagio) || { label: item.estagio };
    const done = (item.checklist || []).filter(c => c.concluido).length;
    const totalCk = (item.checklist || []).length || 1;

    return {
      item,
      ed,
      val,
      cust,
      cap,
      bol,
      stageLabel: stageObj.label,
      progressPct: Math.round((done / totalCk) * 100)
    };
  });

  const w = window.open('', '_blank', 'width=960,height=780');
  if (!w) return;
  w.document.write(`
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8" />
      <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
      <title>Relatório Executivo de Captação — RadarFAP Brasil</title>
      <style>
        body { font-family: 'Segoe UI', Arial, sans-serif; color: #14181f; padding: 36px; line-height: 1.5; }
        .top-bar { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #14181f; padding-bottom: 16px; margin-bottom: 24px; }
        .badge { display: inline-block; background: #14181f; color: #b6f53b; padding: 4px 12px; border-radius: 99px; font-size: 11px; font-weight: bold; }
        .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 24px; }
        .kpi-card { background: #f6f7f9; border: 1px solid #dcdfe5; border-radius: 14px; padding: 14px; }
        .kpi-card strong { display: block; font-size: 18px; margin-top: 4px; color: #14181f; }
        table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 12px; }
        th { background: #14181f; color: #ffffff; padding: 10px 8px; text-align: left; }
        td { border-bottom: 1px solid #dcdfe5; padding: 10px 8px; vertical-align: top; }
      </style>
    </head>
    <body>
      <div class="top-bar">
        <div>
          <div style="margin-bottom: 10px;"><img src="/logo-full.svg" alt="RadarFAP Brasil" style="height: 46px;" /></div>
          <span class="badge">RadarFAP Brasil • Relatório Executivo de Portfólio de Captação</span>
          <h1 style="font-size: 22px; margin: 8px 0 4px;">Carteira de Projetos e Submissões em Fomento</h1>
          <div style="font-size: 13px; color: #5a6270;">
            <strong>Coordenação:</strong> ${escapeHtml(prof.nomePesquisador || 'Coordenação Principal')} •
            <strong>Instituição:</strong> ${escapeHtml(prof.instituicao || 'UFPE / UFRPE / UPE / ICT')} (${escapeHtml(prof.ufPrincipal || 'PE')})
          </div>
        </div>
        <div style="text-align: right; font-size: 12px; color: #5a6270;">
          Emitido em: ${new Date().toLocaleDateString('pt-BR')}<br/>
          <strong>${enrichedRows.length} propostas ativas</strong>
        </div>
      </div>

      <div class="kpi-grid">
        <div class="kpi-card">
          <span style="font-size: 11px; color: #68707e;">Volume Global Pleiteado</span>
          <strong>${formatCurrencyBRL(totalPortfolio)}</strong>
        </div>
        <div class="kpi-card">
          <span style="font-size: 11px; color: #68707e;">Total Custeio (45%)</span>
          <strong>${formatCurrencyBRL(totalCusteio)}</strong>
        </div>
        <div class="kpi-card">
          <span style="font-size: 11px; color: #68707e;">Total Capital (25%)</span>
          <strong>${formatCurrencyBRL(totalCapital)}</strong>
        </div>
        <div class="kpi-card">
          <span style="font-size: 11px; color: #68707e;">Total Bolsas (30%)</span>
          <strong>${formatCurrencyBRL(totalBolsas)}</strong>
        </div>
      </div>

      <h2 style="font-size: 15px; margin-bottom: 6px;">Detalhamento das Propostas no Pipeline Kanban</h2>
      <table>
        <thead>
          <tr>
            <th>Agência / Edital</th>
            <th>Título do Projeto / Chamada</th>
            <th>Etapa Kanban</th>
            <th>Prazo Final</th>
            <th>Custeio / Capital / Bolsas</th>
            <th>Total Pleiteado</th>
          </tr>
        </thead>
        <tbody>
          ${enrichedRows.map(r => `
            <tr>
              <td><strong>${escapeHtml(r.ed.agencia || 'FAP')} (${escapeHtml(r.ed.uf || 'PE')})</strong><br/>Nº ${escapeHtml(r.ed.numero || 'S/N')}</td>
              <td>
                <strong>${escapeHtml(r.item.tituloProjeto || r.ed.titulo || 'Proposta')}</strong><br/>
                <span style="color: #68707e;">Coord.: ${escapeHtml(r.item.pesquisadorResponsavel || prof.nomePesquisador || '')} • Checklist: ${r.progressPct}%</span>
              </td>
              <td>${escapeHtml(r.stageLabel)}</td>
              <td><strong>${formatDateBr(r.ed.prazoSubmissao)}</strong><br/>via ${escapeHtml(r.ed.plataformaSubmissao || 'Portal')}</td>
              <td>
                Cust: ${formatCurrencyBRL(r.cust)}<br/>
                Cap: ${formatCurrencyBRL(r.cap)}<br/>
                Bol: ${formatCurrencyBRL(r.bol)}
              </td>
              <td><strong>${formatCurrencyBRL(r.val)}</strong></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      <script>window.onload = () => window.print();</script>
    </body>
    </html>
  `);
  w.document.close();
};

// ===================== COMPARADOR LADO A LADO DE EDITAIS, SIMULADOR DE BOLSAS & LINK COMPARTILHÁVEL =====================
window.compareSelectedIds = [];

window.toggleCompareEdital = function toggleCompareEdital(editalId) {
  const idx = window.compareSelectedIds.indexOf(editalId);
  if (idx >= 0) {
    window.compareSelectedIds.splice(idx, 1);
  } else {
    if (window.compareSelectedIds.length >= 3) {
      showToast('Selecione no máximo 3 editais por vez para comparação lado a lado.');
      return;
    }
    window.compareSelectedIds.push(editalId);
  }
  renderEditaisTab();
};

window.clearCompareSelection = function clearCompareSelection() {
  window.compareSelectedIds = [];
  renderEditaisTab();
};

window.renderCompareFloatingBar = function renderCompareFloatingBar() {
  const bar = document.getElementById('compareFloatingBar');
  if (!bar) return;
  const ids = window.compareSelectedIds || [];
  if (ids.length === 0) {
    bar.classList.add('hidden');
    return;
  }
  bar.classList.remove('hidden');
  const selectedEditais = ids.map(id => appState.editais.find(e => e.id === id)).filter(Boolean);

  bar.innerHTML = `
    <div class="flex flex-wrap items-center gap-2">
      <span class="px-3 py-1 rounded-full bg-[#b6f53b] text-[#14181f] text-xs font-extrabold">
        ⚖️ Comparador (${selectedEditais.length}/3)
      </span>
      ${selectedEditais.map(e => `
        <span class="px-3 py-1 rounded-full bg-white/10 text-white text-xs font-semibold flex items-center gap-1.5">
          <span>${escapeHtml(e.agencia)} Nº ${escapeHtml(e.numero)} (${e.matchScore || 80}%)</span>
          <button onclick="window.toggleCompareEdital('${e.id}')" class="text-[#9aa2b1] hover:text-white font-bold">✕</button>
        </span>
      `).join('')}
    </div>
    <div class="flex items-center gap-2">
      <button onclick="window.clearCompareSelection()" class="btn-pill-outline-dark !py-1.5 !px-3 text-xs">
        Limpar
      </button>
      <button onclick="window.openCompareModal()" class="btn-pill-lime !py-1.5 !px-4 text-xs">
        ⚖️ Comparar Lado a Lado (${selectedEditais.length})
      </button>
    </div>
  `;
};

window.openCompareModal = function openCompareModal() {
  const ids = window.compareSelectedIds || [];
  const list = ids.map(id => appState.editais.find(e => e.id === id)).filter(Boolean);
  if (list.length === 0) {
    showToast('Selecione pelo menos 1 ou 2 editais clicando no botão ⚖️ do card.');
    return;
  }

  const body = document.getElementById('compareModalBody');
  const modal = document.getElementById('compareEditaisModal');
  if (!body || !modal) return;

  body.innerHTML = `
    <div class="grid grid-cols-1 md:grid-cols-${Math.max(2, list.length)} gap-4 min-w-[600px]">
      ${list.map(ed => {
        const daysLeft = getDaysRemaining(ed.prazoSubmissao);
        return `
          <div class="p-5 rounded-3xl bg-[#f6f7f9] border border-[#dcdfe5] flex flex-col justify-between gap-4">
            <div class="space-y-3">
              <div class="flex items-center justify-between gap-2">
                <span class="px-3 py-1 rounded-full bg-[#14181f] text-white text-xs font-extrabold">
                  ${escapeHtml(ed.agencia)} • ${escapeHtml(ed.uf)}
                </span>
                <span class="px-3 py-1 rounded-full bg-[#b6f53b] text-[#14181f] text-xs font-extrabold">
                  ${ed.matchScore || 80}% Match
                </span>
              </div>

              <h4 class="text-sm font-extrabold text-[#14181f] leading-snug">
                Nº ${escapeHtml(ed.numero)} — ${escapeHtml(ed.titulo)}
              </h4>

              <div class="space-y-2 text-xs bg-white p-3.5 rounded-2xl border border-[#ebedf2]">
                <div class="flex justify-between">
                  <span class="text-[#8a92a0]">Status:</span>
                  <strong class="text-[#14181f]">${escapeHtml(ed.status)} ${ed.prorrogado ? '(Prorrogado)' : ''}</strong>
                </div>
                <div class="flex justify-between">
                  <span class="text-[#8a92a0]">Prazo Final:</span>
                  <strong class="text-[#14181f]">${formatDateBr(ed.prazoSubmissao)} ${daysLeft !== null ? `(${daysLeft}d)` : ''}</strong>
                </div>
                <div class="flex justify-between">
                  <span class="text-[#8a92a0]">Linha:</span>
                  <strong class="text-[#14181f] text-right">${escapeHtml(ed.area)}</strong>
                </div>
                <div class="flex justify-between">
                  <span class="text-[#8a92a0]">Recursos:</span>
                  <strong class="text-[#14181f] text-right">${escapeHtml(ed.valorEstimado)}</strong>
                </div>
                <div class="flex justify-between">
                  <span class="text-[#8a92a0]">Plataforma:</span>
                  <strong class="text-[#14181f]">${escapeHtml(ed.plataformaSubmissao || 'Portal')}</strong>
                </div>
                <div class="flex justify-between">
                  <span class="text-[#8a92a0]">Anexos / Erratas:</span>
                  <strong class="text-[#14181f]">${(ed.anexos || []).length} doc(s)</strong>
                </div>
              </div>

              <div class="space-y-1 text-[11px] text-[#4a5260]">
                <strong class="text-[#14181f] block">Diagnóstico de Elegibilidade:</strong>
                ${(ed.matchRazoes || []).map(r => `<div>${escapeHtml(r)}</div>`).join('')}
              </div>
            </div>

            <div class="pt-3 border-t border-[#dcdfe5] flex flex-wrap items-center justify-between gap-2">
              <button onclick="window.closeCompareModal(); window.openWorkplanModal('${ed.id}');" class="btn-pill-dark flex-1 text-xs">
                ✨ Gerar Plano (${escapeHtml(ed.plataformaSubmissao || 'FAP')})
              </button>
              <button onclick="window.addToPipeline('${ed.id}')" class="btn-pill-lime text-xs">
                + Kanban
              </button>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;

  modal.classList.remove('hidden');
};

window.closeCompareModal = function closeCompareModal() {
  document.getElementById('compareEditaisModal')?.classList.add('hidden');
};

window.addSimulatedBolsaToRubrica = function addSimulatedBolsaToRubrica() {
  const select = document.getElementById('simBolsaModalidade');
  const valMensal = Number(select?.value) || 3500;
  const labelModalidade = select?.options[select.selectedIndex]?.text?.split('(')[0]?.trim() || 'Bolsa';
  const qtd = Math.max(1, Number(document.getElementById('simBolsaQtd')?.value) || 1);
  const meses = Math.max(1, Number(document.getElementById('simBolsaMeses')?.value) || 12);

  const subtotalBolsa = valMensal * qtd * meses;
  const inputBolsas = document.getElementById('pipeRubricaBolsas');
  if (inputBolsas) {
    inputBolsas.value = (Number(inputBolsas.value) || 0) + subtotalBolsa;
  }

  const notasEl = document.getElementById('pipeFormNotas');
  if (notasEl) {
    const notaBolsa = `[Bolsa Calculada: ${qtd}x ${labelModalidade} por ${meses}m = ${formatCurrencyBRL(subtotalBolsa)}]`;
    notasEl.value = notasEl.value ? `${notasEl.value}\n${notaBolsa}` : notaBolsa;
  }

  const previewLbl = document.getElementById('bolsaPreviewCalc');
  if (previewLbl) {
    previewLbl.textContent = `+ ${formatCurrencyBRL(subtotalBolsa)} adicionado`;
  }

  updatePipeTotalPreview();
  showToast(`Adicionado ${qtd}x ${labelModalidade} (${meses} meses = ${formatCurrencyBRL(subtotalBolsa)}) na rubrica Bolsas!`);
};

window.copyShareablePortfolioLink = async function copyShareablePortfolioLink() {
  try {
    const compactPayload = {
      p: appState.researcherProfile || {},
      f: appState.favoritos || [],
      k: (appState.pipeline || []).map(item => ({
        id: item.id,
        editalId: item.editalId,
        estagio: item.estagio,
        tituloProjeto: item.tituloProjeto,
        pesquisadorResponsavel: item.pesquisadorResponsavel,
        instituicao: item.instituicao,
        valorPleiteado: item.valorPleiteado,
        rubricaCusteio: item.rubricaCusteio,
        rubricaCapital: item.rubricaCapital,
        rubricaBolsas: item.rubricaBolsas,
        notas: item.notas
      }))
    };
    const encoded = btoa(encodeURIComponent(JSON.stringify(compactPayload)));
    const shareUrl = `${window.location.origin}${window.location.pathname}?carteira=${encoded}`;
    await navigator.clipboard.writeText(shareUrl);
    showToast('🔗 Link da Carteira copiado! Envie para qualquer pesquisador da sua equipe abrir na Vercel.');
  } catch (err) {
    showToast(`Erro ao gerar link compartilhável: ${err.message}`);
  }
};

// Restaura automaticamente uma carteira compartilhada via URL (?carteira=...)
try {
  const params = new URLSearchParams(window.location.search);
  const sharedParam = params.get('carteira');
  if (sharedParam) {
    const decoded = JSON.parse(decodeURIComponent(atob(sharedParam)));
    const existingRaw = localStorage.getItem(LOCAL_STORAGE_KEY);
    const currentBackup = existingRaw ? JSON.parse(existingRaw) : {};
    const mergedBackup = {
      ...currentBackup,
      researcherProfile: decoded.p || currentBackup.researcherProfile,
      favoritos: decoded.f || currentBackup.favoritos || [],
      pipeline: decoded.k || currentBackup.pipeline || []
    };
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(mergedBackup));
    window.history.replaceState({}, document.title, window.location.pathname);
    setTimeout(() => showToast('🔗 Carteira compartilhada pela equipe carregada com sucesso!'), 900);
  }
} catch {}

window.downloadAllDeadlinesIcs = function downloadAllDeadlinesIcs() {
  const userUf = appState.researcherProfile?.ufPrincipal || 'PE';
  const relevant = (appState.editais || []).filter(e =>
    e.status === 'Aberto' &&
    ((appState.favoritos || []).includes(e.id) ||
      (appState.pipeline || []).some(p => p.editalId === e.id) ||
      e.uf === userUf)
  );

  const events = relevant.map(ed => {
    const dateClean = (ed.prazoSubmissao || '2026-12-01').replace(/-/g, '').slice(0, 8);
    return [
      'BEGIN:VEVENT',
      `UID:radarfap-multi-${ed.id}@radarfap.br`,
      `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').split('.')[0]}Z`,
      `DTSTART;VALUE=DATE:${dateClean}`,
      `DTEND;VALUE=DATE:${dateClean}`,
      `SUMMARY:[Prazo FAP] ${ed.agencia} (${ed.uf}) - Edital ${ed.numero}`,
      `DESCRIPTION:${(ed.titulo || '').replace(/\n/g, ' ')} | Submissao: ${ed.linkSubmissao || ''}`,
      'END:VEVENT'
    ].join('\r\n');
  });

  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//RadarFAP Brasil Cronograma Completo//PT-BR',
    ...events,
    'END:VCALENDAR'
  ].join('\r\n');

  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `cronograma-radarfap-${userUf.toLowerCase()}.ics`;
  a.click();
  URL.revokeObjectURL(url);
  showToast(`Calendário unificado (.ics) exportado com ${relevant.length} prazos!`);
};

window.syncToSupabaseCloud = async function syncToSupabaseCloud(mode = 'push') {
  const urlInput = document.getElementById('supabaseUrlInput')?.value?.trim() || localStorage.getItem('radarfap_sb_url') || '';
  const keyInput = document.getElementById('supabaseKeyInput')?.value?.trim() || localStorage.getItem('radarfap_sb_key') || '';
  const badge = document.getElementById('supabaseStatusBadge');

  if (!urlInput || !keyInput) {
    showToast('Informe a URL e a Anon Key do seu projeto Supabase (ou use "🔗 Compartilhar Link" / "💾 Exportar .json" sem precisar de conta).');
    return;
  }

  localStorage.setItem('radarfap_sb_url', urlInput);
  localStorage.setItem('radarfap_sb_key', keyInput);
  const cleanUrl = urlInput.replace(/\/$/, '');

  try {
    if (mode === 'push') {
      const payload = {
        id: 'default-workspace',
        updated_at: new Date().toISOString(),
        data: {
          researcherProfile: appState.researcherProfile || {},
          favoritos: appState.favoritos || [],
          pipeline: appState.pipeline || [],
          alertConfig: appState.alertConfig || {}
        }
      };
      const res = await fetch(`${cleanUrl}/rest/v1/radarfap_workspaces?on_conflict=id`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: keyInput,
          Authorization: `Bearer ${keyInput}`,
          Prefer: 'resolution=merge-duplicates'
        },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        if (badge) {
          badge.textContent = 'Sincronizado • Supabase';
          badge.className = 'px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-[#b6f53b] text-[#14181f]';
        }
        showToast('☁️ Carteira salva na nuvem Supabase com sucesso!');
      } else {
        showToast(`Aviso Supabase (${res.status}): crie a tabela "radarfap_workspaces" (id text PK, data jsonb, updated_at timestamptz).`);
      }
    } else {
      const res = await fetch(`${cleanUrl}/rest/v1/radarfap_workspaces?id=eq.default-workspace&select=*`, {
        headers: {
          apikey: keyInput,
          Authorization: `Bearer ${keyInput}`
        }
      });
      if (res.ok) {
        const rows = await res.json();
        const cloudData = rows?.[0]?.data;
        if (cloudData) {
          if (cloudData.researcherProfile) appState.researcherProfile = cloudData.researcherProfile;
          if (Array.isArray(cloudData.favoritos)) appState.favoritos = cloudData.favoritos;
          if (Array.isArray(cloudData.pipeline)) appState.pipeline = cloudData.pipeline;
          if (cloudData.alertConfig) appState.alertConfig = cloudData.alertConfig;
          saveWorkspaceBackup();
          renderAll();
          showToast('☁️ Carteira restaurada da nuvem Supabase!');
        } else {
          showToast('Nenhum workspace salvo ainda na tabela radarfap_workspaces.');
        }
      }
    }
  } catch (err) {
    showToast(`Erro ao conectar ao Supabase: ${err.message}`);
  }
};

// ===================== MOTOR INTERATIVO DE CARDS (DRAG & DROP, REORDENAÇÃO, REDIMENSIONAMENTO E FIXAÇÃO) =====================
const BENTO_LAYOUT_STORAGE_KEY = 'radarfap_bento_layout_v1';
const CUSTOM_EDITAIS_STORAGE_KEY = 'radarfap_custom_editais_order_v1';
const PINNED_EDITAIS_STORAGE_KEY = 'radarfap_pinned_editais_v1';
const WIDE_EDITAIS_STORAGE_KEY = 'radarfap_wide_editais_v1';
const CUSTOM_FAPS_STORAGE_KEY = 'radarfap_custom_faps_order_v1';

const DEFAULT_BENTO_CONFIG = {
  'captacao': { colSpan: 5, rowSpan: 2, minimized: false },
  'facepe-live': { colSpan: 4, rowSpan: 2, minimized: false },
  'categorias': { colSpan: 3, rowSpan: 1, minimized: false },
  'ritmo': { colSpan: 3, rowSpan: 1, minimized: false },
  'acesso-pe': { colSpan: 3, rowSpan: 1, minimized: false },
  'agencias-nac': { colSpan: 3, rowSpan: 1, minimized: false },
  'busca-rapida': { colSpan: 6, rowSpan: 1, minimized: false }
};

const BENTO_COL_CLASSES = [
  'lg:col-span-3',
  'lg:col-span-4',
  'lg:col-span-5',
  'lg:col-span-6',
  'lg:col-span-8',
  'lg:col-span-12'
];

const BENTO_ROW_CLASSES = ['lg:row-span-1', 'lg:row-span-2'];

let draggedBentoId = null;
let draggedEditalId = null;
let draggedFapSigla = null;
let draggedPipeId = null;
let isLayoutEditMode = false;

function getSavedBentoLayout() {
  try {
    const raw = localStorage.getItem(BENTO_LAYOUT_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function applyCardSpanClasses(widgetEl, colSpan, rowSpan, minimized) {
  if (!widgetEl) return;
  BENTO_COL_CLASSES.forEach(cls => widgetEl.classList.remove(cls));
  BENTO_ROW_CLASSES.forEach(cls => widgetEl.classList.remove(cls));

  const validCol = [3, 4, 5, 6, 8, 12].includes(Number(colSpan)) ? Number(colSpan) : 4;
  const validRow = Number(rowSpan) === 2 && !minimized ? 2 : 1;

  widgetEl.classList.add(`lg:col-span-${validCol}`);
  widgetEl.classList.add(`lg:row-span-${validRow}`);
  widgetEl.dataset.colSpan = String(validCol);
  widgetEl.dataset.rowSpan = String(validRow);
  widgetEl.classList.toggle('is-minimized', Boolean(minimized));
}

window.saveCurrentBentoLayout = function saveCurrentBentoLayout() {
  const grid = document.getElementById('bentoDashboardGrid');
  if (!grid) return;
  const widgets = Array.from(grid.querySelectorAll('.bento-widget[data-bento-id]'));
  const order = widgets.map(w => w.dataset.bentoId);
  const cards = {};

  widgets.forEach(w => {
    const id = w.dataset.bentoId;
    const def = DEFAULT_BENTO_CONFIG[id] || { colSpan: 4, rowSpan: 1 };
    cards[id] = {
      colSpan: Number(w.dataset.colSpan) || def.colSpan,
      rowSpan: Number(w.dataset.rowSpan) || def.rowSpan,
      minimized: w.classList.contains('is-minimized')
    };
  });

  try {
    localStorage.setItem(BENTO_LAYOUT_STORAGE_KEY, JSON.stringify({ order, cards }));
  } catch {}
};

window.applySavedBentoLayout = function applySavedBentoLayout() {
  const grid = document.getElementById('bentoDashboardGrid');
  if (!grid) return;
  const saved = getSavedBentoLayout();

  const widgetsMap = new Map();
  Array.from(grid.querySelectorAll('.bento-widget[data-bento-id]')).forEach(w => {
    widgetsMap.set(w.dataset.bentoId, w);
  });

  const targetOrder = (saved && Array.isArray(saved.order) && saved.order.length > 0)
    ? saved.order
    : Object.keys(DEFAULT_BENTO_CONFIG);

  targetOrder.forEach(id => {
    const el = widgetsMap.get(id);
    if (el) {
      grid.appendChild(el);
      const def = DEFAULT_BENTO_CONFIG[id] || { colSpan: 4, rowSpan: 1, minimized: false };
      const cfg = (saved && saved.cards && saved.cards[id]) ? saved.cards[id] : def;
      applyCardSpanClasses(el, cfg.colSpan ?? def.colSpan, cfg.rowSpan ?? def.rowSpan, Boolean(cfg.minimized));
    }
  });
};

window.toggleLayoutEditMode = function toggleLayoutEditMode() {
  isLayoutEditMode = !isLayoutEditMode;
  document.body.classList.toggle('layout-edit-mode', isLayoutEditMode);
  const btn = document.getElementById('btnToggleLayoutEdit');
  if (btn) {
    if (isLayoutEditMode) {
      btn.className = 'px-3.5 py-1.5 rounded-full text-xs font-extrabold bg-[#b6f53b] text-[#14181f] shadow transition inline-flex items-center gap-1.5';
      btn.innerHTML = '<span>✓ Concluir Organização</span>';
      showToast('✋ Modo Organizar Ativo! Arraste qualquer card, use ← → para mover ou ↔ para redimensionar.');
    } else {
      btn.className = 'px-3.5 py-1.5 rounded-full text-xs font-bold bg-[#f1f3f6] text-[#14181f] hover:bg-[#14181f] hover:text-[#b6f53b] transition inline-flex items-center gap-1.5';
      btn.innerHTML = '<span>✋ Organizar Layout</span>';
      showToast('✨ Layout personalizado salvo automaticamente!');
    }
  }
};

window.onBentoDragStart = function onBentoDragStart(event, bentoId) {
  draggedBentoId = bentoId;
  const el = event.currentTarget;
  if (el) {
    setTimeout(() => el.classList.add('card-dragging'), 10);
  }
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', `bento:${bentoId}`);
  }
};

window.onBentoDragOver = function onBentoDragOver(event, targetId) {
  if (!draggedBentoId || draggedBentoId === targetId) return;
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
  event.currentTarget?.classList.add('card-drop-target');
};

window.onBentoDragLeave = function onBentoDragLeave(event) {
  event.currentTarget?.classList.remove('card-drop-target');
};

window.onBentoDrop = function onBentoDrop(event, targetId) {
  event.preventDefault();
  event.stopPropagation();
  const targetEl = event.currentTarget;
  if (targetEl) targetEl.classList.remove('card-drop-target');

  if (!draggedBentoId || draggedBentoId === targetId) return;
  const grid = document.getElementById('bentoDashboardGrid');
  if (!grid) return;

  const draggedEl = grid.querySelector(`.bento-widget[data-bento-id="${draggedBentoId}"]`);
  const dropEl = grid.querySelector(`.bento-widget[data-bento-id="${targetId}"]`);
  if (!draggedEl || !dropEl) return;

  const children = Array.from(grid.children);
  const dragIdx = children.indexOf(draggedEl);
  const dropIdx = children.indexOf(dropEl);

  if (dragIdx < dropIdx) {
    grid.insertBefore(draggedEl, dropEl.nextSibling);
  } else {
    grid.insertBefore(draggedEl, dropEl);
  }

  draggedEl.classList.remove('card-dragging');
  draggedBentoId = null;
  window.saveCurrentBentoLayout();
  showToast('✨ Card reposicionado e salvo no seu layout!');
};

window.onBentoDragEnd = function onBentoDragEnd(event) {
  event.currentTarget?.classList.remove('card-dragging');
  document.querySelectorAll('.card-drop-target').forEach(el => el.classList.remove('card-drop-target'));
  draggedBentoId = null;
};

window.moveBentoCard = function moveBentoCard(bentoId, direction) {
  const grid = document.getElementById('bentoDashboardGrid');
  if (!grid) return;
  const widgets = Array.from(grid.querySelectorAll('.bento-widget[data-bento-id]'));
  const idx = widgets.findIndex(w => w.dataset.bentoId === bentoId);
  if (idx < 0) return;

  const targetIdx = idx + direction;
  if (targetIdx < 0 || targetIdx >= widgets.length) return;

  const currentEl = widgets[idx];
  const neighborEl = widgets[targetIdx];

  if (direction < 0) {
    grid.insertBefore(currentEl, neighborEl);
  } else {
    grid.insertBefore(currentEl, neighborEl.nextSibling);
  }

  window.saveCurrentBentoLayout();
  showToast('Posição do card atualizada!');
};

window.cycleBentoCardSize = function cycleBentoCardSize(bentoId) {
  const grid = document.getElementById('bentoDashboardGrid');
  if (!grid) return;
  const widgetEl = grid.querySelector(`.bento-widget[data-bento-id="${bentoId}"]`);
  if (!widgetEl) return;

  const sizes = [3, 4, 5, 6, 8, 12];
  const currentCol = Number(widgetEl.dataset.colSpan) || DEFAULT_BENTO_CONFIG[bentoId]?.colSpan || 4;
  const nextCol = sizes[(sizes.indexOf(currentCol) + 1) % sizes.length];
  const currentRow = Number(widgetEl.dataset.rowSpan) || DEFAULT_BENTO_CONFIG[bentoId]?.rowSpan || 1;
  const isMin = widgetEl.classList.contains('is-minimized');

  applyCardSpanClasses(widgetEl, nextCol, currentRow, isMin);
  window.saveCurrentBentoLayout();
  showToast(`↔ Largura do card ajustada para ${nextCol}/12 colunas!`);
};

window.toggleMinimizeBentoCard = function toggleMinimizeBentoCard(bentoId) {
  const grid = document.getElementById('bentoDashboardGrid');
  if (!grid) return;
  const widgetEl = grid.querySelector(`.bento-widget[data-bento-id="${bentoId}"]`);
  if (!widgetEl) return;

  const willMinimize = !widgetEl.classList.contains('is-minimized');
  const currentCol = Number(widgetEl.dataset.colSpan) || DEFAULT_BENTO_CONFIG[bentoId]?.colSpan || 4;
  const defaultRow = DEFAULT_BENTO_CONFIG[bentoId]?.rowSpan || 1;

  applyCardSpanClasses(widgetEl, currentCol, willMinimize ? 1 : defaultRow, willMinimize);
  window.saveCurrentBentoLayout();
};

window.applyBentoPreset = function applyBentoPreset(presetName) {
  const grid = document.getElementById('bentoDashboardGrid');
  if (!grid) return;

  let preset = null;
  if (presetName === 'facepe_focus') {
    preset = {
      order: ['facepe-live', 'busca-rapida', 'captacao', 'acesso-pe', 'categorias', 'ritmo', 'agencias-nac'],
      cards: {
        'facepe-live': { colSpan: 6, rowSpan: 2, minimized: false },
        'busca-rapida': { colSpan: 6, rowSpan: 1, minimized: false },
        'captacao': { colSpan: 6, rowSpan: 1, minimized: false },
        'acesso-pe': { colSpan: 3, rowSpan: 1, minimized: false },
        'categorias': { colSpan: 3, rowSpan: 1, minimized: false },
        'ritmo': { colSpan: 3, rowSpan: 1, minimized: false },
        'agencias-nac': { colSpan: 3, rowSpan: 1, minimized: false }
      }
    };
  } else if (presetName === 'expanded') {
    preset = {
      order: ['captacao', 'facepe-live', 'busca-rapida', 'ritmo', 'categorias', 'acesso-pe', 'agencias-nac'],
      cards: {
        'captacao': { colSpan: 6, rowSpan: 2, minimized: false },
        'facepe-live': { colSpan: 6, rowSpan: 2, minimized: false },
        'busca-rapida': { colSpan: 12, rowSpan: 1, minimized: false },
        'ritmo': { colSpan: 6, rowSpan: 1, minimized: false },
        'categorias': { colSpan: 6, rowSpan: 1, minimized: false },
        'acesso-pe': { colSpan: 6, rowSpan: 1, minimized: false },
        'agencias-nac': { colSpan: 6, rowSpan: 1, minimized: false }
      }
    };
  }

  if (preset) {
    localStorage.setItem(BENTO_LAYOUT_STORAGE_KEY, JSON.stringify(preset));
    window.applySavedBentoLayout();
    showToast(presetName === 'facepe_focus' ? '🔬 Layout "Foco FACEPE" aplicado!' : '📐 Layout "Visão Expandida" aplicado!');
  }
};

window.resetBentoLayout = function resetBentoLayout() {
  localStorage.removeItem(BENTO_LAYOUT_STORAGE_KEY);
  localStorage.removeItem(CUSTOM_EDITAIS_STORAGE_KEY);
  localStorage.removeItem(PINNED_EDITAIS_STORAGE_KEY);
  localStorage.removeItem(WIDE_EDITAIS_STORAGE_KEY);
  localStorage.removeItem(CUSTOM_FAPS_STORAGE_KEY);
  window.applySavedBentoLayout();
  renderAll();
  showToast('🔄 Layout original restaurado em todos os painéis!');
};

// ===================== DRAG & DROP DE EDITAIS + SOLTAR NA ABA SUBMISSÕES =====================
window.getCustomEditaisOrder = function getCustomEditaisOrder() {
  try {
    return JSON.parse(localStorage.getItem(CUSTOM_EDITAIS_STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
};

window.getPinnedEditaisIds = function getPinnedEditaisIds() {
  try {
    return JSON.parse(localStorage.getItem(PINNED_EDITAIS_STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
};

window.getWideEditaisIds = function getWideEditaisIds() {
  try {
    return JSON.parse(localStorage.getItem(WIDE_EDITAIS_STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
};

window.onEditalDragStart = function onEditalDragStart(event, editalId) {
  draggedEditalId = editalId;
  const el = event.currentTarget;
  if (el) setTimeout(() => el.classList.add('card-dragging'), 10);
  document.getElementById('headerTabPipeline')?.classList.add('tab-drop-ready');
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', `edital:${editalId}`);
  }
};

window.onEditalDragOver = function onEditalDragOver(event) {
  if (!draggedEditalId) return;
  event.preventDefault();
  event.currentTarget?.classList.add('card-drop-target');
};

window.onEditalDragLeave = function onEditalDragLeave(event) {
  event.currentTarget?.classList.remove('card-drop-target');
};

window.onEditalDrop = function onEditalDrop(event, targetEditalId) {
  event.preventDefault();
  event.stopPropagation();
  event.currentTarget?.classList.remove('card-drop-target');
  document.getElementById('headerTabPipeline')?.classList.remove('tab-drop-ready');

  if (!draggedEditalId || draggedEditalId === targetEditalId) return;

  const currentList = getFilteredEditais().map(e => e.id);
  const fromIdx = currentList.indexOf(draggedEditalId);
  const toIdx = currentList.indexOf(targetEditalId);
  if (fromIdx < 0 || toIdx < 0) return;

  currentList.splice(fromIdx, 1);
  currentList.splice(toIdx, 0, draggedEditalId);

  localStorage.setItem(CUSTOM_EDITAIS_STORAGE_KEY, JSON.stringify(currentList));
  const sortSelect = document.getElementById('filterSort');
  if (sortSelect) sortSelect.value = 'custom';

  draggedEditalId = null;
  renderEditaisTab();
  showToast('✨ Ordem personalizada dos editais atualizada!');
};

window.onEditalDragEnd = function onEditalDragEnd(event) {
  event.currentTarget?.classList.remove('card-dragging');
  document.getElementById('headerTabPipeline')?.classList.remove('tab-drop-ready');
  document.querySelectorAll('.card-drop-target').forEach(el => el.classList.remove('card-drop-target'));
  draggedEditalId = null;
};

window.moveEditalCard = function moveEditalCard(editalId, direction) {
  const currentList = getFilteredEditais().map(e => e.id);
  const idx = currentList.indexOf(editalId);
  const targetIdx = idx + direction;
  if (idx < 0 || targetIdx < 0 || targetIdx >= currentList.length) return;

  currentList.splice(idx, 1);
  currentList.splice(targetIdx, 0, editalId);
  localStorage.setItem(CUSTOM_EDITAIS_STORAGE_KEY, JSON.stringify(currentList));

  const sortSelect = document.getElementById('filterSort');
  if (sortSelect) sortSelect.value = 'custom';
  renderEditaisTab();
};

window.togglePinEdital = function togglePinEdital(editalId) {
  const pinned = window.getPinnedEditaisIds();
  const idx = pinned.indexOf(editalId);
  if (idx >= 0) {
    pinned.splice(idx, 1);
    showToast('Edital desafixado do topo.');
  } else {
    pinned.unshift(editalId);
    showToast('📌 Edital fixado no topo do painel!');
  }
  localStorage.setItem(PINNED_EDITAIS_STORAGE_KEY, JSON.stringify(pinned));
  renderEditaisTab();
};

window.toggleWideEditalCard = function toggleWideEditalCard(editalId) {
  const wide = window.getWideEditaisIds();
  const idx = wide.indexOf(editalId);
  if (idx >= 0) {
    wide.splice(idx, 1);
  } else {
    wide.push(editalId);
  }
  localStorage.setItem(WIDE_EDITAIS_STORAGE_KEY, JSON.stringify(wide));
  renderEditaisTab();
};

window.onPipelineTabDragOver = function onPipelineTabDragOver(event) {
  if (!draggedEditalId) return;
  event.preventDefault();
  event.currentTarget?.classList.add('card-drop-target');
};

window.onPipelineTabDragLeave = function onPipelineTabDragLeave(event) {
  event.currentTarget?.classList.remove('card-drop-target');
};

window.onPipelineTabDrop = function onPipelineTabDrop(event) {
  event.preventDefault();
  event.currentTarget?.classList.remove('card-drop-target');
  event.currentTarget?.classList.remove('tab-drop-ready');
  if (!draggedEditalId) return;
  const idToAdd = draggedEditalId;
  draggedEditalId = null;
  window.addToPipeline(idToAdd, 'analise');
};

// ===================== DRAG & DROP DO DIRETÓRIO DE 27 FAPS =====================
window.getCustomFapsOrder = function getCustomFapsOrder() {
  try {
    return JSON.parse(localStorage.getItem(CUSTOM_FAPS_STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
};

window.onFapDragStart = function onFapDragStart(event, sigla) {
  draggedFapSigla = sigla;
  const el = event.currentTarget;
  if (el) setTimeout(() => el.classList.add('card-dragging'), 10);
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', `fap:${sigla}`);
  }
};

window.onFapDragOver = function onFapDragOver(event) {
  if (!draggedFapSigla) return;
  event.preventDefault();
  event.currentTarget?.classList.add('card-drop-target');
};

window.onFapDragLeave = function onFapDragLeave(event) {
  event.currentTarget?.classList.remove('card-drop-target');
};

window.onFapDrop = function onFapDrop(event, targetSigla) {
  event.preventDefault();
  event.stopPropagation();
  event.currentTarget?.classList.remove('card-drop-target');
  if (!draggedFapSigla || draggedFapSigla === targetSigla) return;

  const currentOrder = window.getCustomFapsOrder().length
    ? window.getCustomFapsOrder()
    : (appState.faps || []).map(f => f.sigla);

  const fromIdx = currentOrder.indexOf(draggedFapSigla);
  const toIdx = currentOrder.indexOf(targetSigla);
  if (fromIdx < 0 || toIdx < 0) return;

  currentOrder.splice(fromIdx, 1);
  currentOrder.splice(toIdx, 0, draggedFapSigla);
  localStorage.setItem(CUSTOM_FAPS_STORAGE_KEY, JSON.stringify(currentOrder));

  draggedFapSigla = null;
  renderFapsDirectory();
  showToast('✨ Ordem das FAPs personalizada!');
};

window.onFapDragEnd = function onFapDragEnd(event) {
  event.currentTarget?.classList.remove('card-dragging');
  document.querySelectorAll('.card-drop-target').forEach(el => el.classList.remove('card-drop-target'));
  draggedFapSigla = null;
};

window.moveFapCard = function moveFapCard(sigla, direction) {
  const currentOrder = window.getCustomFapsOrder().length
    ? window.getCustomFapsOrder()
    : (appState.faps || []).map(f => f.sigla);

  const idx = currentOrder.indexOf(sigla);
  const targetIdx = idx + direction;
  if (idx < 0 || targetIdx < 0 || targetIdx >= currentOrder.length) return;

  currentOrder.splice(idx, 1);
  currentOrder.splice(targetIdx, 0, sigla);
  localStorage.setItem(CUSTOM_FAPS_STORAGE_KEY, JSON.stringify(currentOrder));
  renderFapsDirectory();
};

// ===================== DRAG & DROP DO KANBAN DE SUBMISSÕES =====================
window.onKanbanCardDragStart = function onKanbanCardDragStart(event, pipeId) {
  draggedPipeId = pipeId;
  const el = event.currentTarget;
  if (el) setTimeout(() => el.classList.add('card-dragging'), 10);
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', `pipe:${pipeId}`);
  }
};

window.onKanbanCardDragOver = function onKanbanCardDragOver(event) {
  if (!draggedPipeId) return;
  event.preventDefault();
  event.currentTarget?.classList.add('card-drop-target');
};

window.onKanbanCardDragLeave = function onKanbanCardDragLeave(event) {
  event.currentTarget?.classList.remove('card-drop-target');
};

window.onKanbanCardDrop = function onKanbanCardDrop(event, targetPipeId, stageId) {
  event.preventDefault();
  event.stopPropagation();
  event.currentTarget?.classList.remove('card-drop-target');
  document.querySelectorAll('.kanban-col-drop-target').forEach(el => el.classList.remove('kanban-col-drop-target'));

  if (!draggedPipeId) return;
  const pipeList = [...(appState.pipeline || [])];
  const fromIdx = pipeList.findIndex(p => p.id === draggedPipeId);
  const toIdx = pipeList.findIndex(p => p.id === targetPipeId);

  if (fromIdx >= 0) {
    const [moved] = pipeList.splice(fromIdx, 1);
    moved.estagio = stageId;
    moved.atualizadoEm = new Date().toISOString();
    if (toIdx >= 0) {
      pipeList.splice(toIdx, 0, moved);
    } else {
      pipeList.push(moved);
    }
    appState.pipeline = pipeList;
    window.movePipelineStage(moved.id, stageId);
  }
  draggedPipeId = null;
};

window.onKanbanCardDragEnd = function onKanbanCardDragEnd(event) {
  event.currentTarget?.classList.remove('card-dragging');
  document.querySelectorAll('.card-drop-target, .kanban-col-drop-target').forEach(el => {
    el.classList.remove('card-drop-target', 'kanban-col-drop-target');
  });
  draggedPipeId = null;
};

window.onKanbanColDragOver = function onKanbanColDragOver(event, stageId) {
  if (!draggedPipeId && !draggedEditalId) return;
  event.preventDefault();
  event.currentTarget?.classList.add('kanban-col-drop-target');
};

window.onKanbanColDragLeave = function onKanbanColDragLeave(event) {
  event.currentTarget?.classList.remove('kanban-col-drop-target');
};

window.onKanbanColDrop = function onKanbanColDrop(event, stageId) {
  event.preventDefault();
  event.currentTarget?.classList.remove('kanban-col-drop-target');

  if (draggedPipeId) {
    const id = draggedPipeId;
    draggedPipeId = null;
    window.movePipelineStage(id, stageId);
  } else if (draggedEditalId) {
    const edId = draggedEditalId;
    draggedEditalId = null;
    window.addToPipeline(edId, stageId);
  }
};

