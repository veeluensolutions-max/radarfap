import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FAPS_CATALOG } from '../data/fapsCatalog.mjs';
import { INITIAL_NATIONAL_EDITAIS, INITIAL_PIPELINE_ITEMS, INITIAL_ALERT_CONFIG } from '../data/seedEditais.mjs';
import { DEFAULT_CERTIDOES } from '../data/certidoesCatalog.mjs';
import { INITIAL_USERS } from './authService.mjs';
import { scrapeFacepeEditais, scrapeFacepeNews, scrapeMultiFapPortals } from '../scrapers/facepeScraper.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BUNDLED_DATA_DIR = path.resolve(__dirname, '../../data');
const BUNDLED_DB_FILE = path.join(BUNDLED_DATA_DIR, 'database.json');

// Na Vercel (Serverless), o sistema de arquivos do bundle é read-only, exceto /tmp
const IS_SERVERLESS = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
const RUNTIME_DB_FILE = IS_SERVERLESS
  ? path.join(os.tmpdir(), 'radarfap-database.json')
  : BUNDLED_DB_FILE;

let memoryCacheDb = null;

function ensureDataDir() {
  if (!IS_SERVERLESS && !fs.existsSync(BUNDLED_DATA_DIR)) {
    try {
      fs.mkdirSync(BUNDLED_DATA_DIR, { recursive: true });
    } catch {}
  }
}

export function loadDatabase() {
  ensureDataDir();

  // 1. Tenta ler do arquivo de runtime (/tmp na Vercel ou data/database.json local)
  if (fs.existsSync(RUNTIME_DB_FILE)) {
    try {
      const raw = fs.readFileSync(RUNTIME_DB_FILE, 'utf-8');
      memoryCacheDb = JSON.parse(raw);
      return memoryCacheDb;
    } catch {}
  }

  // 2. Se estiver na Vercel e /tmp ainda não existir, carrega o database.json empacotado no repositório
  if (IS_SERVERLESS && fs.existsSync(BUNDLED_DB_FILE)) {
    try {
      const raw = fs.readFileSync(BUNDLED_DB_FILE, 'utf-8');
      memoryCacheDb = JSON.parse(raw);
      saveDatabase(memoryCacheDb);
      return memoryCacheDb;
    } catch {}
  }

  if (memoryCacheDb) {
    return memoryCacheDb;
  }

  const initialDb = {
    editais: [...INITIAL_NATIONAL_EDITAIS],
    favoritos: ['facepe-35-2026', 'facepe-31-2026', 'facepe-25-2026', 'cnpq-universal-2026'],
    pipeline: [...INITIAL_PIPELINE_ITEMS],
    alertConfig: { ...INITIAL_ALERT_CONFIG },
    noticiasFacepe: [
      {
        id: 'facepe-news-init-1',
        agencia: 'FACEPE',
        uf: 'PE',
        titulo: 'Pesquisadora pernambucana é contemplada em chamada de mobilidade acadêmica para a Itália apoiada pela Facepe',
        resumo: 'Chamada de mobilidade internacional fortalece parcerias científicas de Pernambuco com centros europeus.',
        data: '2026-11-09',
        link: 'https://www2.facepe.br/pesquisadora-pernambucana-e-contemplada-em-chamada-de-mobilidade-academica-para-a-italia-apoiada-pela-facepe/'
      },
      {
        id: 'facepe-news-init-2',
        agencia: 'FACEPE',
        uf: 'PE',
        titulo: 'Facepe anuncia prorrogação do edital Projetos Orientados a Missões (POM – nº 25/2026)',
        resumo: 'Pesquisadores têm novo prazo para submeter propostas estruturantes no sistema AgilFAP.',
        data: '2026-11-06',
        link: 'https://www2.facepe.br/facepe-anuncia-prorrogacao-do-edital-projetos-orientados-a-missoes-pom-no-25-2026/'
      },
      {
        id: 'facepe-news-init-3',
        agencia: 'FACEPE',
        uf: 'PE',
        titulo: 'Facepe prorroga inscrições do edital Cientista Arretado (31/2026)',
        resumo: '22ª Rodada do Programa Cientista Arretado recebe propostas de cooperação com o Governo de Pernambuco.',
        data: '2026-11-03',
        link: 'https://www2.facepe.br/facepe-prorroga-inscricoes-do-edital-cientista-arretado-31-2026/'
      }
    ],
    syncHistory: [
      {
        id: 'sync-init',
        timestamp: new Date().toISOString(),
        origem: 'Inicialização do Sistema + Base Nacional 27 UFs',
        facepeCount: 5,
        totalCount: INITIAL_NATIONAL_EDITAIS.length,
        status: 'sucesso'
      }
    ]
  };
  saveDatabase(initialDb);
  return initialDb;
}

export function saveDatabase(db) {
  memoryCacheDb = db;
  ensureDataDir();
  try {
    fs.writeFileSync(RUNTIME_DB_FILE, JSON.stringify(db, null, 2), 'utf-8');
  } catch (err) {
    console.warn('Aviso ao gravar em disco (mantendo em memória):', err.message);
  }
}

export async function syncFacepeAndPortals(limit = 35) {
  const db = loadDatabase();
  let scrapedEditais = [];
  let scrapedNews = [];
  let multiEditais = [];
  let multiNews = [];
  let syncStatus = 'sucesso';
  let errorMsg = null;

  try {
    scrapedEditais = await scrapeFacepeEditais(limit);
  } catch (err) {
    console.error('Aviso na coleta de editais da FACEPE:', err.message);
    syncStatus = 'parcial';
    errorMsg = err.message;
  }

  try {
    scrapedNews = await scrapeFacepeNews(10);
  } catch (err) {
    console.error('Aviso na coleta de notícias da FACEPE:', err.message);
  }

  try {
    const multi = await scrapeMultiFapPortals();
    multiEditais = multi.discoveredEditais || [];
    multiNews = multi.discoveredNews || [];
  } catch (err) {
    console.error('Aviso na coleta multi-FAP:', err.message);
  }

  const allIncomingEditais = [...scrapedEditais, ...multiEditais];

  if (allIncomingEditais.length > 0) {
    const existingById = new Map(db.editais.map(e => [e.id, e]));

    for (const novo of allIncomingEditais) {
      const prev = existingById.get(novo.id);
      if (prev && prev.curadoriaManual) {
        existingById.set(novo.id, {
          ...prev,
          anexos: novo.anexos?.length ? novo.anexos : prev.anexos,
          ultimaSincronizacao: novo.ultimaSincronizacao
        });
      } else if (prev) {
        existingById.set(novo.id, {
          ...prev,
          ...novo
        });
      } else {
        existingById.set(novo.id, novo);
      }
    }

    db.editais = Array.from(existingById.values());
  }

  if (scrapedNews.length > 0 || multiNews.length > 0) {
    db.noticiasFacepe = [...scrapedNews, ...multiNews.slice(0, 8)];
  }

  const facepeTotal = db.editais.filter(e => e.agencia === 'FACEPE' || e.uf === 'PE').length;

  const logEntry = {
    id: `sync-${Date.now()}`,
    timestamp: new Date().toISOString(),
    origem: 'Coletor Ao Vivo Multi-FAP (FACEPE + CONFAP + FAPEAM + FAPESC + FAPEAL + FUNDECT)',
    facepeExtraidosAgora: scrapedEditais.length,
    multiFapExtraidosAgora: multiEditais.length,
    facepeCount: facepeTotal,
    totalCount: db.editais.length,
    status: syncStatus,
    detalhe: errorMsg || `${scrapedEditais.length} editais da FACEPE + ${multiEditais.length} chamadas estaduais/nacionais e ${scrapedNews.length + multiNews.length} comunicados sincronizados ao vivo.`
  };

  db.syncHistory = [logEntry, ...(db.syncHistory || []).slice(0, 19)];
  saveDatabase(db);

  return {
    log: logEntry,
    facepeCount: facepeTotal,
    multiFapCount: multiEditais.length,
    totalEditais: db.editais.length,
    noticiasCount: db.noticiasFacepe.length
  };
}

export function computeAlerts(db) {
  const config = db.alertConfig || INITIAL_ALERT_CONFIG;
  const alerts = [];
  const today = new Date('2026-11-10T00:00:00Z');

  for (const edital of db.editais) {
    const isFav = (db.favoritos || []).includes(edital.id);
    const inPipe = (db.pipeline || []).some(p => p.editalId === edital.id);
    const ufMatch = (config.ufsMonitoradas || []).includes(edital.uf);
    const areaMatch = (config.areasInteresse || []).includes(edital.area);

    // 1. Alerta de prorrogação na FACEPE
    if (config.notificarProrrogacoesFacepe && edital.agencia === 'FACEPE' && edital.prorrogado && edital.status === 'Aberto') {
      alerts.push({
        id: `alert-prorrog-${edital.id}`,
        tipo: 'prorrogacao',
        severidade: 'alta',
        editalId: edital.id,
        agencia: edital.agencia,
        uf: edital.uf,
        titulo: `Prazo Prorrogado na FACEPE: Edital ${edital.numero}`,
        mensagem: `${edital.titulo} teve submissões prorrogadas (novo prazo estimado: ${edital.prazoSubmissao}). Confira os adendos oficiais.`,
        prazo: edital.prazoSubmissao,
        link: edital.linkPdf || edital.linkEdital
      });
    }

    // 2. Alerta de vencimento próximo para editais abertos
    if (edital.status === 'Aberto' && edital.prazoSubmissao) {
      const due = new Date(`${edital.prazoSubmissao}T12:00:00Z`);
      const diffDays = Math.ceil((due - today) / (1000 * 60 * 60 * 24));
      if (diffDays >= 0 && diffDays <= (config.diasAntecedenciaVencimento || 20)) {
        if (isFav || inPipe || (ufMatch && areaMatch)) {
          alerts.push({
            id: `alert-prazo-${edital.id}`,
            tipo: 'vencimento',
            severidade: diffDays <= 14 ? 'critica' : 'media',
            editalId: edital.id,
            agencia: edital.agencia,
            uf: edital.uf,
            diasRestantes: diffDays,
            titulo: `Encerra em ${diffDays} dias: ${edital.agencia} (${edital.uf}) – ${edital.numero}`,
            mensagem: `${edital.titulo}. Prazo limite de submissão: ${edital.prazoSubmissao} via ${edital.plataformaSubmissao || 'Portal Oficial'}.`,
            prazo: edital.prazoSubmissao,
            link: edital.linkSubmissao || edital.linkEdital
          });
        }
      }
    }
  }

  
  // 3. Alertas de Certidões Negativas Próximas de Vencer ou Vencidas
  const certList = db.certidoes || DEFAULT_CERTIDOES;
  for (const cert of certList) {
    if (cert.dataValidade) {
      const due = new Date(`${cert.dataValidade}T12:00:00Z`);
      const diffDays = Math.ceil((due - today) / (1000 * 60 * 60 * 24));
      if (diffDays <= 0) {
        alerts.unshift({
          id: `alert-cert-vencida-${cert.id}`,
          tipo: 'certidao',
          severidade: 'critica',
          titulo: `🚨 Certidão Vencida: ${cert.nome.slice(0, 45)}...`,
          mensagem: `A certidão expedida por ${cert.orgao} venceu em ${cert.dataValidade}. Risco de inabilitação imediata em editais FACEPE/FINEP!`,
          prazo: cert.dataValidade,
          link: cert.urlEmissao
        });
      } else if (diffDays <= 15) {
        alerts.push({
          id: `alert-cert-aviso-${cert.id}`,
          tipo: 'certidao',
          severidade: diffDays <= 7 ? 'alta' : 'media',
          diasRestantes: diffDays,
          titulo: `⏳ Certidão vence em ${diffDays} dias: ${cert.nome.slice(0, 40)}...`,
          mensagem: `Vencimento previsto para ${cert.dataValidade} (${cert.orgao}). Providencie a renovação online no portal oficial.`,
          prazo: cert.dataValidade,
          link: cert.urlEmissao
        });
      }
    }
  }

  return alerts.sort((a, b) => {
    const rank = { critica: 0, alta: 1, media: 2 };
    return (rank[a.severidade] ?? 3) - (rank[b.severidade] ?? 3);
  });
}

export const DEFAULT_RESEARCHER_PROFILE = {
  nomePesquisador: 'Prof. Dr. Coordenador Principal',
  nomeGrupo: 'Grupo de Pesquisa & Inovação (PE / Nacional)',
  instituicao: 'UFPE / UFRPE / UPE / ICT Parceira',
  naturezaVinculo: 'ICT Pública / Universidade',
  ufPrincipal: 'PE',
  incluirFederais: true,
  incluirOutrosEstados: true,
  titulacao: 'Doutorado',
  orcamentoAlvoMax: 500000,
  linhaTematicaProjeto: 'Soluções Científicas, IA e Inovação Aplicadas ao Desenvolvimento Regional',
  areasPrioritarias: [
    'Pesquisa Científica (APQ / Missões)',
    'Bolsas & Pós-Graduação',
    'Inovação & Startups',
    'Governo & Gestão Pública',
    'Cooperação Internacional'
  ],
  palavrasChave: ['pesquisa', 'bolsas', 'pós-graduação', 'inovação', 'startups', 'missões', 'cientista', 'universal', 'tecnologia']
};

export function computeMatchBreakdown(edital, profile = DEFAULT_RESEARCHER_PROFILE) {
  let score = 45;
  const reasons = [];

  // 1. Aderência Geográfica / Esfera
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

  // 2. Aderência por Linha de Fomento / Área
  if ((profile.areasPrioritarias || []).includes(edital.area)) {
    score += 15;
    reasons.push(`✓ Linha prioritária: ${edital.area}`);
  } else {
    reasons.push(`• Linha complementar: ${edital.area}`);
  }

  // 3. Natureza do Vínculo (ICT vs Startup/Empresa)
  const isStartupEdital = edital.area === 'Inovação & Startups' || /centelha|tecnova|subven|empresa|startup/i.test(edital.titulo);
  if (isStartupEdital) {
    if ((profile.naturezaVinculo || '').includes('Startup') || (profile.naturezaVinculo || '').includes('Empresa')) {
      score += 6;
      reasons.push('✓ Enquadramento direto para CNPJ / Startup Inovadora');
    } else {
      reasons.push('• Recomendado parceria ICT + Empresa/Startup ou spin-off acadêmica');
    }
  } else {
    reasons.push(`✓ Elegível para ${profile.naturezaVinculo || 'ICT / Universidade'} (${profile.titulacao || 'Doutorado'})`);
  }

  // 4. Aderência por Palavras-Chave no Título e Resumo
  const text = `${edital.titulo} ${edital.resumo} ${edital.publicoAlvo}`.toLowerCase();
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

  // 5. Bônus para editais abertos / prorrogados
  if (edital.status === 'Aberto') {
    score += 4;
  } else if (edital.status === 'Encerrado') {
    score -= 20;
    reasons.push('⚠ Submissões encerradas (útil como referência para próxima rodada)');
  }

  const finalScore = Math.max(18, Math.min(99, score));
  return {
    score: finalScore,
    reasons
  };
}

export function computeMatchScore(edital, profile = DEFAULT_RESEARCHER_PROFILE) {
  return computeMatchBreakdown(edital, profile).score;
}

export function getFullState() {
  const db = loadDatabase();
  const profile = { ...DEFAULT_RESEARCHER_PROFILE, ...(db.researcherProfile || {}) };
  const alerts = computeAlerts(db);

  const editaisWithMatch = db.editais.map(e => {
    const breakdown = computeMatchBreakdown(e, profile);
    return {
      ...e,
      matchScore: breakdown.score,
      matchRazoes: breakdown.reasons
    };
  });

  // Calcula contagem de editais por FAP / UF
  const fapsWithCounts = FAPS_CATALOG.map(fap => {
    const editaisDaFap = editaisWithMatch.filter(e => e.fapId === fap.id || e.agencia === fap.sigla);
    const abertosDaFap = editaisDaFap.filter(e => e.status === 'Aberto').length;
    return {
      ...fap,
      totalEditaisMonitorados: editaisDaFap.length,
      editaisAbertos: abertosDaFap
    };
  });

  return {
    editais: editaisWithMatch,
    faps: fapsWithCounts,
    favoritos: db.favoritos || [],
    pipeline: db.pipeline || [],
    alertConfig: db.alertConfig || INITIAL_ALERT_CONFIG,
    researcherProfile: profile,
    alerts,
    noticiasFacepe: db.noticiasFacepe || [],
    syncHistory: db.syncHistory || [],
    certidoes: db.certidoes || DEFAULT_CERTIDOES,
    users: (db.users || INITIAL_USERS).map(u => ({ id: u.id, nome: u.nome, email: u.email, role: u.role, instituicao: u.instituicao, ativo: u.ativo, criadoEm: u.criadoEm, ultimoAcesso: u.ultimoAcesso }))
  };
}

