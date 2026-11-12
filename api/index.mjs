import { hashPassword, generateToken, verifyToken, INITIAL_USERS } from '../src/services/authService.mjs';
import { DEFAULT_CERTIDOES } from '../src/data/certidoesCatalog.mjs';
import {
  loadDatabase,
  saveDatabase,
  getFullState,
  syncFacepeAndPortals
} from '../src/services/databaseService.mjs';
import { FAPS_CATALOG } from '../src/data/fapsCatalog.mjs';

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
  if (req.body && typeof req.body === 'object') {
    return Promise.resolve(req.body);
  }
  if (typeof req.body === 'string' && req.body.trim()) {
    try {
      return Promise.resolve(JSON.parse(req.body));
    } catch {
      return Promise.resolve({});
    }
  }
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', chunk => {
      raw += chunk;
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        resolve({});
      }
    });
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  try {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      });
      return res.end();
    }

    const urlObj = new URL(req.url, `https://${req.headers.host || 'localhost'}`);
    const rewrittenSubpath = urlObj.searchParams.get('__path');
    const rawPathname = rewrittenSubpath
      ? `/api/${rewrittenSubpath.replace(/^\/+/, '')}`
      : urlObj.pathname;
    const pathname = rawPathname === '/api/index.mjs' ? '/api/state' : rawPathname.replace(/\/+$/, '');

    if (pathname === '/api/events' && req.method === 'GET') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'Access-Control-Allow-Origin': '*'
      });
      res.write(
        `data: ${JSON.stringify({
          type: 'connected',
          timestamp: new Date().toISOString(),
          lastSync: new Date().toISOString(),
          state: getFullState()
        })}\n\n`
      );
      return res.end();
    }

    if (pathname === '/api/state' && req.method === 'GET') {
      return sendJson(res, 200, {
        ...getFullState(),
        lastAutoSyncIso: new Date().toISOString(),
        autoSyncIntervalSec: 180
      });
    }

    if (pathname === '/api/sync' && (req.method === 'POST' || req.method === 'GET')) {
      const syncResult = await syncFacepeAndPortals(40);
      return sendJson(res, 200, {
        ok: true,
        syncResult,
        lastAutoSyncIso: new Date().toISOString(),
        state: getFullState()
      });
    }

    if (pathname === '/api/editais' && req.method === 'POST') {
      const body = await parseBody(req);
      if (!body.titulo || !body.agencia) {
        return sendJson(res, 400, { error: 'Título e Agência são obrigatórios.' });
      }
      const db = loadDatabase();
      const fapRef = FAPS_CATALOG.find(
        f => f.sigla === body.agencia || f.id === body.fapId || f.uf === body.uf
      );

      const editalId = body.id || `manual-${Date.now()}`;
      const existingIdx = db.editais.findIndex(e => e.id === editalId);

      const editalObj = {
        id: editalId,
        numero: body.numero || 'S/N',
        titulo: body.titulo,
        fapId: fapRef ? fapRef.id : body.fapId || 'custom',
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

    // ===================== AUTENTICAÇÃO E GESTÃO DE USUÁRIOS =====================
    if (pathname === '/api/auth/login' && req.method === 'POST') {
      const { email, password } = await parseBody(req);
      if (!email || !password) {
        return sendJson(res, 400, { error: 'E-mail e senha são obrigatórios.' });
      }

      const db = loadDatabase();
      if (!Array.isArray(db.users) || db.users.length === 0) {
        db.users = [...INITIAL_USERS];
        saveDatabase(db);
      }

      const user = db.users.find(u => u.email.toLowerCase() === String(email).trim().toLowerCase());
      if (!user) {
        return sendJson(res, 401, { error: 'Credenciais inválidas ou usuário não encontrado.' });
      }

      if (user.ativo === false) {
        return sendJson(res, 403, { error: 'Usuário desativado pelo administrador.' });
      }

      const passHash = hashPassword(password);
      if (user.passwordHash !== passHash) {
        return sendJson(res, 401, { error: 'Credenciais inválidas.' });
      }

      user.ultimoAcesso = new Date().toISOString();
      saveDatabase(db);

      const token = generateToken(user);
      const safeUser = { id: user.id, nome: user.nome, email: user.email, role: user.role, instituicao: user.instituicao };
      return sendJson(res, 200, { ok: true, token, user: safeUser, state: getFullState() });
    }

    if (pathname === '/api/auth/me' && req.method === 'GET') {
      const authHeader = req.headers.authorization || '';
      const token = authHeader.replace(/^Bearer\s+/i, '');
      const verified = verifyToken(token);
      if (!verified) {
        return sendJson(res, 401, { error: 'Sessão expirada ou não autenticada.' });
      }

      const db = loadDatabase();
      const usersList = db.users || INITIAL_USERS;
      const user = usersList.find(u => u.id === verified.userId);
      if (!user || user.ativo === false) {
        return sendJson(res, 401, { error: 'Usuário não localizado ou inativo.' });
      }

      const safeUser = { id: user.id, nome: user.nome, email: user.email, role: user.role, instituicao: user.instituicao };
      return sendJson(res, 200, { ok: true, user: safeUser });
    }

    if (pathname === '/api/auth/change-password' && req.method === 'POST') {
      const { email, currentPassword, newPassword } = await parseBody(req);
      if (!email || !currentPassword || !newPassword) {
        return sendJson(res, 400, { error: 'E-mail, senha atual e nova senha são obrigatórios.' });
      }

      if (String(newPassword).length < 6) {
        return sendJson(res, 400, { error: 'A nova senha deve ter no mínimo 6 caracteres.' });
      }

      const db = loadDatabase();
      if (!Array.isArray(db.users)) db.users = [...INITIAL_USERS];

      const user = db.users.find(u => u.email.toLowerCase() === String(email).trim().toLowerCase());
      if (!user) {
        return sendJson(res, 404, { error: 'Usuário não encontrado.' });
      }

      if (user.passwordHash !== hashPassword(currentPassword)) {
        return sendJson(res, 401, { error: 'Senha atual incorreta.' });
      }

      user.passwordHash = hashPassword(newPassword);
      user.ultimoAcesso = new Date().toISOString();
      saveDatabase(db);

      const token = generateToken(user);
      const safeUser = { id: user.id, nome: user.nome, email: user.email, role: user.role, instituicao: user.instituicao };
      return sendJson(res, 200, { ok: true, message: 'Senha alterada com sucesso!', token, user: safeUser });
    }

    if (pathname === '/api/auth/admin/users' && req.method === 'POST') {
      const body = await parseBody(req);
      const { action } = body;
      const db = loadDatabase();
      if (!Array.isArray(db.users)) db.users = [...INITIAL_USERS];

      if (action === 'create') {
        const { nome, email, password, role, instituicao } = body;
        if (!nome || !email || !password) {
          return sendJson(res, 400, { error: 'Nome, e-mail e senha inicial são obrigatórios.' });
        }

        const cleanEmail = String(email).trim().toLowerCase();
        if (db.users.some(u => u.email.toLowerCase() === cleanEmail)) {
          return sendJson(res, 400, { error: 'Já existe um usuário cadastrado com este e-mail.' });
        }

        const newUser = {
          id: `user-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          nome: String(nome).trim(),
          email: cleanEmail,
          passwordHash: hashPassword(password),
          role: role === 'admin' ? 'admin' : 'pesquisador',
          instituicao: String(instituicao || 'Instituição de Pesquisa / ICT').trim(),
          ativo: true,
          criadoEm: new Date().toISOString(),
          ultimoAcesso: null
        };
        db.users.push(newUser);
        saveDatabase(db);
        return sendJson(res, 200, { ok: true, message: 'Usuário criado com sucesso!', state: getFullState() });
      }

      if (action === 'reset-password') {
        const { userId, newPassword } = body;
        const user = db.users.find(u => u.id === userId);
        if (!user) {
          return sendJson(res, 404, { error: 'Usuário não encontrado.' });
        }

        const tempPass = newPassword || 'mudar123';
        user.passwordHash = hashPassword(tempPass);
        saveDatabase(db);
        return sendJson(res, 200, { ok: true, message: `Senha do usuário resetada com sucesso para: ${tempPass}`, tempPass, state: getFullState() });
      }

      if (action === 'toggle-active') {
        const { userId } = body;
        const user = db.users.find(u => u.id === userId);
        if (!user) return sendJson(res, 404, { error: 'Usuário não encontrado.' });
        if (user.email === 'admin@radarfap.br') {
          return sendJson(res, 400, { error: 'O administrador principal não pode ser desativado.' });
        }
        user.ativo = user.ativo === false ? true : false;
        saveDatabase(db);
        return sendJson(res, 200, { ok: true, message: `Usuário ${user.ativo ? 'ativado' : 'desativado'} com sucesso.`, state: getFullState() });
      }

      if (action === 'delete') {
        const { userId } = body;
        const user = db.users.find(u => u.id === userId);
        if (!user) return sendJson(res, 404, { error: 'Usuário não encontrado.' });
        if (user.email === 'admin@radarfap.br') {
          return sendJson(res, 400, { error: 'O administrador principal não pode ser removido.' });
        }
        db.users = db.users.filter(u => u.id !== userId);
        saveDatabase(db);
        return sendJson(res, 200, { ok: true, message: 'Usuário removido com sucesso.', state: getFullState() });
      }

      return sendJson(res, 400, { error: 'Ação não suportada.' });
    }

    if (pathname === '/api/certidoes' && req.method === 'GET') {
      const db = loadDatabase();
      return sendJson(res, 200, { ok: true, certidoes: db.certidoes || DEFAULT_CERTIDOES });
    }

    if (pathname === '/api/certidoes' && req.method === 'POST') {
      const body = await parseBody(req);
      const db = loadDatabase();
      if (!Array.isArray(db.certidoes)) {
        db.certidoes = [...DEFAULT_CERTIDOES];
      }

      if (Array.isArray(body.certidoes)) {
        db.certidoes = body.certidoes;
      } else if (body.id) {
        const idx = db.certidoes.findIndex(c => c.id === body.id);
        if (idx >= 0) {
          db.certidoes[idx] = { ...db.certidoes[idx], ...body };
        } else {
          db.certidoes.push({
            id: body.id || `cert-${Date.now()}`,
            nome: body.nome || 'Certidão Institucional',
            orgao: body.orgao || 'Órgão Expedidor',
            tipo: body.tipo || 'Federal',
            obrigatoria: body.obrigatoria !== false,
            numeroCertidao: body.numeroCertidao || 'S/N',
            dataEmissao: body.dataEmissao || new Date().toISOString().slice(0, 10),
            dataValidade: body.dataValidade || '2027-01-30',
            urlEmissao: body.urlEmissao || 'https://www.gov.br/',
            descricao: body.descricao || 'Certidão de regularidade fiscal/jurídica.'
          });
        }
      }

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

      return sendJson(res, 200, {
        ok: true,
        sigla: fap.sigla,
        uf: fap.uf,
        portalOk,
        statusCode,
        latencyMs: Date.now() - start,
        checkedAt: new Date().toLocaleTimeString('pt-BR')
      });
    }

    return sendJson(res, 404, { error: `Rota não encontrada: ${pathname}` });
  } catch (err) {
    console.error('Erro na API Serverless:', err);
    return sendJson(res, 500, { error: err.message || 'Erro interno no servidor' });
  }
}

