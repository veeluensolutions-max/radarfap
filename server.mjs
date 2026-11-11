import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadDatabase,
  saveDatabase,
  getFullState,
  syncFacepeAndPortals
} from './src/services/databaseService.mjs';
import { FAPS_CATALOG } from './src/data/fapsCatalog.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.join(__dirname, 'public');
const PORT = Number(process.env.PORT) || 3000;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(JSON.stringify(payload));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', chunk => {
      raw += chunk;
      if (raw.length > 2 * 1024 * 1024) {
        reject(new Error('Payload muito grande'));
      }
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(new Error('JSON inválido'));
      }
    });
    req.on('error', reject);
  });
}

// Clientes conectados via Server-Sent Events (SSE) para atualização em tempo real
const sseClients = new Set();
const AUTO_SYNC_INTERVAL_MS = 3 * 60 * 1000; // 3 minutos
let lastAutoSyncIso = new Date().toISOString();

function broadcastRealtimeEvent(type, extra = {}) {
  const payload = JSON.stringify({
    type,
    timestamp: new Date().toISOString(),
    lastSync: lastAutoSyncIso,
    state: getFullState(),
    ...extra
  });
  for (const clientRes of sseClients) {
    try {
      clientRes.write(`data: ${payload}\n\n`);
    } catch {
      sseClients.delete(clientRes);
    }
  }
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      });
      return res.end();
    }

    const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = urlObj.pathname;

    // ===================== STREAM EM TEMPO REAL (SSE) =====================
    if (pathname === '/api/events' && req.method === 'GET') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*'
      });
      res.write(`data: ${JSON.stringify({ type: 'connected', timestamp: new Date().toISOString(), lastSync: lastAutoSyncIso })}\n\n`);
      sseClients.add(res);
      req.on('close', () => sseClients.delete(res));
      return;
    }

    // ===================== ROTAS DA API =====================
    if (pathname === '/api/state' && req.method === 'GET') {
      return sendJson(res, 200, { ...getFullState(), lastAutoSyncIso, autoSyncIntervalSec: AUTO_SYNC_INTERVAL_MS / 1000 });
    }

    if (pathname === '/api/sync' && req.method === 'POST') {
      const syncResult = await syncFacepeAndPortals(40);
      lastAutoSyncIso = new Date().toISOString();
      broadcastRealtimeEvent('sync_completed', { syncResult });
      return sendJson(res, 200, {
        ok: true,
        syncResult,
        lastAutoSyncIso,
        state: getFullState()
      });
    }

    if (pathname === '/api/editais' && req.method === 'POST') {
      const body = await parseBody(req);
      if (!body.titulo || !body.agencia) {
        return sendJson(res, 400, { error: 'Título e Agência são obrigatórios.' });
      }
      const db = loadDatabase();
      const fapRef = FAPS_CATALOG.find(f => f.sigla === body.agencia || f.id === body.fapId || f.uf === body.uf);

      const editalId = body.id || `manual-${Date.now()}`;
      const existingIdx = db.editais.findIndex(e => e.id === editalId);

      const editalObj = {
        id: editalId,
        numero: body.numero || 'S/N',
        titulo: body.titulo,
        fapId: fapRef ? fapRef.id : (body.fapId || 'custom'),
        agencia: body.agencia,
        uf: body.uf || (fapRef ? fapRef.uf : 'PE'),
        estado: body.estado || (fapRef ? fapRef.estado : 'Pernambuco'),
        regiao: body.regiao || (fapRef ? fapRef.regiao : 'Nordeste'),
        esfera: body.esfera || (fapRef ? fapRef.esfera : 'Estadual'),
        area: body.area || 'Pesquisa Científica (APQ / Missões)',
        status: body.status || 'Aberto',
        prorrogado: Boolean(body.prorrogado),
        dataPublicacao: body.dataPublicacao || new Date().toISOString().slice(0, 10),
        dataPublicacaoTexto: body.dataPublicacaoTexto || body.dataPublicacao || 'Recente',
        prazoSubmissao: body.prazoSubmissao || '2026-12-15',
        valorEstimado: body.valorEstimado || 'Consulte o Edital',
        valorNumerico: Number(body.valorNumerico) || 150000,
        publicoAlvo: body.publicoAlvo || 'Pesquisadores e ICTs elegíveis',
        linkEdital: body.linkEdital || (fapRef ? fapRef.urlEditais : 'https://www2.facepe.br/editais/'),
        linkPdf: body.linkPdf || body.linkEdital || (fapRef ? fapRef.urlEditais : 'https://www2.facepe.br/editais/'),
        linkSubmissao: body.linkSubmissao || (fapRef ? fapRef.urlPlataforma : 'https://agil.facepe.br/'),
        plataformaSubmissao: body.plataformaSubmissao || (fapRef ? fapRef.plataformaSubmissao : 'Portal da Agência'),
        anexos: Array.isArray(body.anexos) ? body.anexos : [],
        resumo: body.resumo || 'Edital cadastrado/atualizado via curadoria manual no RadarFAP.',
        curadoriaManual: true,
        origemColeta: 'Curadoria Manual / Edição Direta',
        ultimaSincronizacao: new Date().toISOString()
      };

      if (existingIdx >= 0) {
        db.editais[existingIdx] = { ...db.editais[existingIdx], ...editalObj };
      } else {
        db.editais.unshift(editalObj);
      }

      saveDatabase(db);
      return sendJson(res, 200, { ok: true, edital: editalObj, state: getFullState() });
    }

    if (pathname.startsWith('/api/editais/') && req.method === 'DELETE') {
      const id = decodeURIComponent(pathname.replace('/api/editais/', ''));
      const db = loadDatabase();
      db.editais = db.editais.filter(e => e.id !== id);
      db.favoritos = (db.favoritos || []).filter(fid => fid !== id);
      db.pipeline = (db.pipeline || []).filter(p => p.editalId !== id);
      saveDatabase(db);
      return sendJson(res, 200, { ok: true, state: getFullState() });
    }

    if (pathname === '/api/favoritos/toggle' && req.method === 'POST') {
      const { editalId } = await parseBody(req);
      const db = loadDatabase();
      db.favoritos = db.favoritos || [];
      if (db.favoritos.includes(editalId)) {
        db.favoritos = db.favoritos.filter(id => id !== editalId);
      } else {
        db.favoritos.push(editalId);
      }
      saveDatabase(db);
      return sendJson(res, 200, { ok: true, state: getFullState() });
    }

    if (pathname === '/api/pipeline' && req.method === 'POST') {
      const body = await parseBody(req);
      const db = loadDatabase();
      db.pipeline = db.pipeline || [];

      const existingIdx = db.pipeline.findIndex(
        p => p.id === body.id || (body.editalId && p.editalId === body.editalId)
      );

      if (existingIdx >= 0) {
        const current = db.pipeline[existingIdx];
        db.pipeline[existingIdx] = {
          ...current,
          ...body,
          atualizadoEm: new Date().toISOString()
        };
      } else {
        db.pipeline.push({
          ...body,
          id: `pipe-${Date.now()}`,
          editalId: body.editalId,
          estagio: body.estagio || 'favorito',
          pesquisadorResponsavel: body.pesquisadorResponsavel || 'Pesquisador Principal',
          instituicao: body.instituicao || 'ICT / Universidade',
          valorPleiteado: Number(body.valorPleiteado) || 150000,
          prioridade: body.prioridade || 'Alta',
          notas: body.notas || 'Acompanhar cronograma e documentação exigida pelo edital.',
          checklist: Array.isArray(body.checklist)
            ? body.checklist
            : [
                { texto: 'Ler edital completo e anexos/adendos', concluido: false },
                { texto: 'Verificar elegibilidade e Currículo Lattes', concluido: false },
                { texto: 'Elaborar proposta técnica e orçamento', concluido: false },
                { texto: 'Submeter na plataforma oficial da FAP', concluido: false }
              ],
          atualizadoEm: new Date().toISOString()
        });
      }

      saveDatabase(db);
      return sendJson(res, 200, { ok: true, state: getFullState() });
    }

    if (pathname.startsWith('/api/pipeline/') && req.method === 'DELETE') {
      const id = decodeURIComponent(pathname.replace('/api/pipeline/', ''));
      const db = loadDatabase();
      db.pipeline = (db.pipeline || []).filter(p => p.id !== id && p.editalId !== id);
      saveDatabase(db);
      return sendJson(res, 200, { ok: true, state: getFullState() });
    }

    if (pathname === '/api/alerts/config' && req.method === 'GET') {
    const db = loadDatabase(); return sendJson(res, 200, { ok: true, config: db.alertConfig || {} });
  }

  if (pathname === '/api/alerts/config' && req.method === 'POST') {
      const body = await parseBody(req);
      const db = loadDatabase();
      db.alertConfig = {
        ...(db.alertConfig || {}),
        ...body
      };
      saveDatabase(db);
      return sendJson(res, 200, { ok: true, state: getFullState() });
    }

    if (pathname === '/api/profile' && req.method === 'POST') {
      const body = await parseBody(req);
      const db = loadDatabase();
      db.researcherProfile = {
        ...(db.researcherProfile || {}),
        ...body
      };
      saveDatabase(db);
      return sendJson(res, 200, { ok: true, state: getFullState() });
    }

    if (pathname === '/api/alerts/test-webhook' && req.method === 'POST') {
      const { webhookUrl, whatsappNumber, telegramChatId, telegramBotToken } = await parseBody(req);
      const state = getFullState();
      const topEditais = (state.editais || [])
        .filter(e => e.status === 'Aberto')
        .sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0))
        .slice(0, 3);

      const messageText = [
        `🔔 *RadarFAP Brasil — Boletim de Oportunidades & Alertas*`,
        `👤 Coordenação: ${state.researcherProfile?.nomePesquisador || 'Pesquisador'} (${state.researcherProfile?.ufPrincipal || 'PE'})`,
        `🚨 Alertas Ativos: ${state.alerts?.length || 0} aviso(s)`,
        `⭐ Top Editais Abertos (Maior % Match):`,
        ...topEditais.map(e => `• [${e.matchScore || 80}%] ${e.agencia} (${e.uf}) Nº ${e.numero}: ${e.titulo.slice(0, 80)}... (Prazo: ${e.prazoSubmissao})`),
        `🌐 Acesse o painel: https://radarfap.vercel.app`
      ].join('\n');

      let webhookDispatched = false;
      let webhookStatus = 200;
      let telegramDispatched = false;

      // Disparo Telegram Bot API nativo se configurado
      if (telegramChatId && (telegramBotToken || process.env.TELEGRAM_BOT_TOKEN)) {
        try {
          const token = (telegramBotToken || process.env.TELEGRAM_BOT_TOKEN).trim();
          const tgRes = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: telegramChatId.trim(),
              text: messageText,
              parse_mode: 'Markdown'
            }),
            signal: AbortSignal.timeout(7000)
          });
          telegramDispatched = tgRes.ok;
        } catch {
          telegramDispatched = false;
        }
      }

      // Disparo Webhook (Slack, Discord, n8n, Z-API, Evolution WhatsApp API)
      if (webhookUrl && /^https?:\/\//i.test(webhookUrl.trim())) {
        try {
          const whRes = await fetch(webhookUrl.trim(), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              text: messageText,
              content: messageText,
              phone: whatsappNumber ? whatsappNumber.replace(/\D/g, '') : undefined,
              number: whatsappNumber ? whatsappNumber.replace(/\D/g, '') : undefined,
              message: messageText,
              source: 'RadarFAP Brasil',
              timestamp: new Date().toISOString(),
              alertsCount: state.alerts?.length || 0,
              topEditais
            }),
            signal: AbortSignal.timeout(7000)
          });
          webhookStatus = whRes.status;
          webhookDispatched = whRes.ok || whRes.status < 400;
        } catch {
          webhookDispatched = false;
        }
      }

      const waClean = (whatsappNumber || '').replace(/\D/g, '');
      const waDirectLink = waClean
        ? `https://api.whatsapp.com/send?phone=${waClean}&text=${encodeURIComponent(messageText)}`
        : `https://api.whatsapp.com/send?text=${encodeURIComponent(messageText)}`;

      const tgDirectLink = `https://t.me/share/url?url=${encodeURIComponent('https://radarfap.vercel.app')}&text=${encodeURIComponent(messageText)}`;

      return sendJson(res, 200, {
        ok: true,
        webhookDispatched,
        webhookStatus,
        telegramDispatched,
        waDirectLink,
        tgDirectLink,
        messageText,
        dispatchedAt: new Date().toLocaleTimeString('pt-BR')
      });
    }

    if (pathname === '/api/faps/ping' && req.method === 'POST') {
      const { sigla, uf } = await parseBody(req);
      const fap = FAPS_CATALOG.find(f => f.sigla === sigla || f.uf === uf) || FAPS_CATALOG[0];
      const start = Date.now();
      let portalOk = false;
      let statusCode = 0;

      try {
        const checkRes = await fetch(fap.urlEditais || fap.siteOficial, {
          method: 'GET',
          headers: { 'User-Agent': 'Mozilla/5.0 RadarFAP-HealthCheck/1.0' },
          signal: AbortSignal.timeout(6000)
        });
        statusCode = checkRes.status;
        portalOk = checkRes.ok || checkRes.status < 500;
      } catch {
        portalOk = false;
      }

      const latencyMs = Date.now() - start;
      return sendJson(res, 200, {
        ok: true,
        sigla: fap.sigla,
        uf: fap.uf,
        portalOk,
        statusCode,
        latencyMs,
        checkedAt: new Date().toLocaleTimeString('pt-BR')
      });
    }

    // ===================== ARQUIVOS ESTÁTICOS =====================
    let filePath = pathname === '/' ? path.join(PUBLIC_DIR, 'index.html') : path.join(PUBLIC_DIR, pathname);
    if (!filePath.startsWith(PUBLIC_DIR)) {
      res.writeHead(403);
      return res.end('Acesso negado');
    }

    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      filePath = path.join(PUBLIC_DIR, 'index.html');
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    const content = fs.readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content);
  } catch (err) {
    console.error('Erro no servidor:', err);
    sendJson(res, 500, { error: err.message || 'Erro interno no servidor' });
  }
});

server.listen(PORT, async () => {
  console.log(`\n==================================================================`);
  console.log(`🚀 RadarFAP Brasil — Captação de Recursos para Pesquisas`);
  console.log(`🌐 Servidor ativo em: http://localhost:${PORT}`);
  console.log(`🔗 Conectado ao portal FACEPE: https://www2.facepe.br/editais/`);
  console.log(`==================================================================\n`);

  // Sincronização imediata ao iniciar + Agendador contínuo em tempo real (a cada 3 min)
  syncFacepeAndPortals(35)
    .then(r => {
      lastAutoSyncIso = new Date().toISOString();
      broadcastRealtimeEvent('auto_sync', { syncResult: r });
      console.log(`[Auto-Sync Inicial] ${r.facepeCount} editais da FACEPE | Total: ${r.totalEditais} editais ativos no radar.`);
    })
    .catch(e => console.warn(`[Auto-Sync Aviso] Operando com base local:`, e.message));

  setInterval(async () => {
    try {
      const r = await syncFacepeAndPortals(35);
      lastAutoSyncIso = new Date().toISOString();
      broadcastRealtimeEvent('auto_sync', { syncResult: r });
      console.log(`[Auto-Sync Tempo Real] Atualizado às ${new Date().toLocaleTimeString('pt-BR')} — Total: ${r.totalEditais} editais.`);
    } catch (err) {
      console.warn('[Auto-Sync Tempo Real] Aviso:', err.message);
    }
  }, AUTO_SYNC_INTERVAL_MS);
});

