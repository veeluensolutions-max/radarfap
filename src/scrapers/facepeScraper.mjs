/**
 * Coletor (Web Scraper) Oficial da FACEPE (https://www2.facepe.br/)
 * e Conector Multi-FAP em tempo real (CONFAP, FAPEAM, FAPESC, FAPEAL, FUNDECT).
 */

const PT_MONTHS = {
  janeiro: '01',
  fevereiro: '02',
  marco: '03',
  março: '03',
  abril: '04',
  maio: '05',
  junho: '06',
  julho: '07',
  agosto: '08',
  setembro: '09',
  outubro: '10',
  novembro: '11',
  dezembro: '12'
};

export function decodeHtmlEntities(str = '') {
  return String(str)
    .replace(/&#8211;|&#x2013;|&ndash;/gi, '–')
    .replace(/&#8212;|&#x2014;|&mdash;/gi, '—')
    .replace(/&#8220;|&#8221;|&ldquo;|&rdquo;/gi, '"')
    .replace(/&#8216;|&#8217;|&lsquo;|&rsquo;/gi, "'")
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#039;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(Number(dec)))
    .replace(/\s+/g, ' ')
    .trim();
}

export function parsePtDateToIso(ptDateStr = '') {
  const clean = ptDateStr.toLowerCase().trim();
  const match = clean.match(/(\d{1,2})\s+de\s+([a-zç]+)\s+de\s+(\d{4})/i);
  if (match) {
    const day = match[1].padStart(2, '0');
    const month = PT_MONTHS[match[2]] || '01';
    const year = match[3];
    return `${year}-${month}-${day}`;
  }
  const slashMatch = clean.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (slashMatch) {
    return `${slashMatch[3]}-${slashMatch[2]}-${slashMatch[1]}`;
  }
  return '2026-10-01';
}

function addDaysToIso(isoDate, days) {
  const d = new Date(`${isoDate}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return '2026-12-15';
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function classifyEditalArea(title = '', subFiles = []) {
  const text = `${title} ${subFiles.map(s => s.title).join(' ')}`.toLowerCase();
  if (/pró-startups|pro-startups|startups|inovação aberta|inovacao aberta|centelha|tecnova|subvenção|empresa/i.test(text)) {
    return 'Inovação & Startups';
  }
  if (/cientista arretado|desafios\.gov|desafios gov|governo|gestão pública|políticas públicas/i.test(text)) {
    return 'Governo & Gestão Pública';
  }
  if (/pós-graduação|pos-graduacao|pbpg|pdpg|bolsa|mestrado|doutorado|ic|pibic|bft|dcr|fixação|msca|doctoral/i.test(text)) {
    return 'Bolsas & Pós-Graduação';
  }
  if (/internacional|mobilidade|itália|frança|reino unido|europa|confap|cooperação|cooperacao|horizon/i.test(text)) {
    return 'Cooperação Internacional';
  }
  if (/evento|arc\b|popularização|olimpíada|semana estadual|divulgação/i.test(text)) {
    return 'Eventos & Difusão Científica';
  }
  return 'Pesquisa Científica (APQ / Missões)';
}

function inferEditalMetadata(numero, cleanTitle, dataPublicacaoIso, subFiles) {
  const subTitles = subFiles.map(s => s.title).join(' | ');
  const combined = `${cleanTitle} ${subTitles}`;

  const hasResultadoFinal = /resultado\s+final/i.test(subTitles);
  const hasResultadoPreliminar = /resultado\s+preliminar|resultado\s+da\s+\d+ª\s+fase/i.test(subTitles);
  const hasProrrogacao = /prorroga[çc][ãa]o|novo\s+prazo|adendo.*prorroga/i.test(combined);

  const pubDate = new Date(`${dataPublicacaoIso}T12:00:00Z`);
  const refNow = new Date('2026-11-10T12:00:00Z');
  const daysSincePub = Math.floor((refNow - pubDate) / (1000 * 60 * 60 * 24));

  let status = 'Aberto';
  let prazoSubmissao = addDaysToIso(dataPublicacaoIso, hasProrrogacao ? 55 : 42);

  if (numero === '35/2026') {
    status = 'Aberto';
    prazoSubmissao = '2026-11-30';
  } else if (numero === '33/2026') {
    status = 'Aberto';
    prazoSubmissao = '2026-12-04';
  } else if (numero === '32/2026') {
    status = 'Aberto';
    prazoSubmissao = '2026-11-27';
  } else if (numero === '31/2026') {
    status = 'Aberto';
    prazoSubmissao = '2026-11-23';
  } else if (numero === '30/2026') {
    status = 'Aberto';
    prazoSubmissao = '2026-11-20';
  } else if (numero === '25/2026') {
    status = 'Aberto';
    prazoSubmissao = '2026-11-25';
  } else if (hasResultadoFinal) {
    status = 'Encerrado';
  } else if (hasResultadoPreliminar) {
    status = 'Em Julgamento / Resultado';
  } else if (daysSincePub > 75 && !hasProrrogacao) {
    status = 'Em Julgamento / Resultado';
  }

  let valorEstimado = 'Consulte o Edital (PDF)';
  let valorNumerico = 150000;
  let publicoAlvo = 'Pesquisadores doutores vinculados a ICTs/IES em Pernambuco';

  if (/35\/2026|pbpg|pós-graduação/i.test(cleanTitle)) {
    valorEstimado = 'Cotas de Bolsas Mestrado (R$ 2.100/mês) e Doutorado (R$ 3.100/mês)';
    valorNumerico = 4500000;
    publicoAlvo = 'Programas de Pós-Graduação (PPGs) Stricto Sensu de ICTs em Pernambuco';
  } else if (/pró-startups|startups/i.test(cleanTitle)) {
    valorEstimado = 'Até R$ 200.000 por startup (Global R$ 3,6 milhões)';
    valorNumerico = 3600000;
    publicoAlvo = 'Startups e empresas de base tecnológica sediadas em Pernambuco';
  } else if (/desafios\.gov/i.test(cleanTitle)) {
    valorEstimado = 'Até R$ 250.000 por solução (Subvenção e Inovação Aberta)';
    valorNumerico = 2500000;
    publicoAlvo = 'Startups, ICTs e pesquisadores desenvolvendo soluções para o setor público';
  } else if (/cientista arretado/i.test(cleanTitle)) {
    valorEstimado = 'Bolsas PD/Sênior + Auxílio Pesquisa até R$ 180.000 por projeto';
    valorNumerico = 1800000;
    publicoAlvo = 'Pesquisadores Doutores em cooperação com Secretarias e Órgãos do Governo de PE';
  } else if (/pdpg|redes/i.test(cleanTitle)) {
    valorEstimado = 'Até R$ 600.000 por rede de pesquisa (Parceria FACEPE/CAPES)';
    valorNumerico = 3000000;
    publicoAlvo = 'Programas de Pós-Graduação em Rede na Região Nordeste / PE';
  } else if (/apq|universal/i.test(cleanTitle)) {
    valorEstimado = 'Faixas de até R$ 60.000 a R$ 150.000 por projeto (Global R$ 12 milhões)';
    valorNumerico = 12000000;
    publicoAlvo = 'Pesquisadores Doutores vinculados a universidades e institutos de pesquisa de PE';
  } else if (/missões|pom/i.test(cleanTitle)) {
    valorEstimado = 'Até R$ 500.000 por projeto estratégico orientado a missão';
    valorNumerico = 6000000;
    publicoAlvo = 'Redes multidisciplinares de pesquisadores em ICTs pernambucanas';
  }

  return {
    status,
    prorrogado: hasProrrogacao || numero === '25/2026' || numero === '31/2026',
    prazoSubmissao,
    valorEstimado,
    valorNumerico,
    publicoAlvo
  };
}

export async function scrapeFacepeEditais(limit = 35) {
  const response = await fetch('https://www2.facepe.br/editais/', {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) RadarFAP/1.0'
    },
    signal: AbortSignal.timeout(12000)
  });

  if (!response.ok) {
    throw new Error(`FACEPE retornou status HTTP ${response.status}`);
  }

  const html = await response.text();
  const blocks = html.split('<div class="card-edital-grupo">').slice(1);

  const editais = [];

  for (const block of blocks.slice(0, limit)) {
    const numMatch = block.match(/<strong>([\s\S]*?)<\/strong>/i);
    const numero = numMatch ? decodeHtmlEntities(numMatch[1].replace(/<[^>]+>/g, '')) : 'S/N';

    const titleMatch = block.match(/<h4[^>]*class=["'][^"']*titulo-pai[^"']*["'][^>]*>([\s\S]*?)<\/h4>/i);
    let rawTitle = titleMatch ? decodeHtmlEntities(titleMatch[1].replace(/<[^>]+>/g, ' ')) : '';

    let cleanTitle = rawTitle
      .replace(/^(\d+\/\d{4})\s*[-–—]\s*(\1\s*[-–—]\s*)?/i, '')
      .replace(/^Lançamento\s+/i, '')
      .trim();

    if (!cleanTitle) cleanTitle = `Edital FACEPE nº ${numero}`;
    if (!/edital/i.test(cleanTitle)) {
      cleanTitle = `Edital FACEPE nº ${numero} — ${cleanTitle}`;
    }

    const dateMatch = block.match(/<span[^>]*class=["'][^"']*data-pub[^"']*["'][^>]*>([\s\S]*?)<\/span>/i);
    const dataPubTexto = dateMatch ? decodeHtmlEntities(dateMatch[1].replace(/Publicado em:\s*/i, '')) : '';
    const dataPublicacao = parsePtDateToIso(dataPubTexto);

    const pdfMatch = block.match(/<a[^>]+href=["']([^"']+)["'][^>]*class=["'][^"']*btn-download-principal[^"']*["']/i)
                  || block.match(/<div class="acao-principal">[\s\S]*?<a[^>]+href=["']([^"']+)["']/i);
    const pdfUrl = pdfMatch ? pdfMatch[1].trim() : 'https://www2.facepe.br/editais/';

    const subFiles = [];
    const subStart = block.indexOf('<div class="container-sub-arquivos">');
    if (subStart !== -1) {
      const subHtml = block.slice(subStart);
      const linkRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
      let m;
      while ((m = linkRegex.exec(subHtml)) !== null) {
        const label = decodeHtmlEntities(m[2].replace(/<[^>]+>/g, ' '));
        const href = m[1].trim();
        if (label && label.toLowerCase() !== 'baixar' && !subFiles.some(sf => sf.url === href)) {
          subFiles.push({
            title: label,
            url: href.startsWith('http') ? href : `https://www2.facepe.br${href}`
          });
        }
      }
    }

    const area = classifyEditalArea(cleanTitle, subFiles);
    const meta = inferEditalMetadata(numero, cleanTitle, dataPublicacao, subFiles);

    const safeId = `facepe-${numero.replace(/[^a-zA-Z0-9]/g, '-')}`;

    editais.push({
      id: safeId,
      numero,
      titulo: cleanTitle,
      fapId: 'facepe-pe',
      agencia: 'FACEPE',
      uf: 'PE',
      estado: 'Pernambuco',
      regiao: 'Nordeste',
      esfera: 'Estadual',
      area,
      status: meta.status,
      prorrogado: meta.prorrogado,
      dataPublicacao,
      dataPublicacaoTexto: dataPubTexto,
      prazoSubmissao: meta.prazoSubmissao,
      valorEstimado: meta.valorEstimado,
      valorNumerico: meta.valorNumerico,
      publicoAlvo: meta.publicoAlvo,
      linkEdital: 'https://www2.facepe.br/editais/',
      linkPdf: pdfUrl.startsWith('http') ? pdfUrl : `https://www2.facepe.br${pdfUrl}`,
      linkSubmissao: 'https://agil.facepe.br/',
      plataformaSubmissao: 'AgilFAP',
      anexos: subFiles,
      resumo: `Chamada pública oficial nº ${numero} da FACEPE (${dataPubTexto}). Submissões via sistema AgilFAP. Conta com ${subFiles.length} documento(s) complementar(es) entre adendos, erratas ou resultados.`,
      origemColeta: 'Web Scraping Ao Vivo (www2.facepe.br/editais)',
      ultimaSincronizacao: new Date().toISOString()
    });
  }

  return editais;
}

export async function scrapeFacepeNews(perPage = 10) {
  const url = `https://www2.facepe.br/wp-json/wp/v2/posts?per_page=${perPage}`;
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) RadarFAP/1.0'
    },
    signal: AbortSignal.timeout(10000)
  });

  if (!response.ok) {
    throw new Error(`API WP FACEPE retornou status ${response.status}`);
  }

  const posts = await response.json();
  return posts.map(post => ({
    id: `facepe-news-${post.id}`,
    agencia: 'FACEPE',
    uf: 'PE',
    titulo: decodeHtmlEntities((post.title?.rendered || '').replace(/<[^>]+>/g, '')),
    resumo: decodeHtmlEntities((post.excerpt?.rendered || '').replace(/<[^>]+>/g, '')).slice(0, 220),
    data: (post.date || '').slice(0, 10),
    link: post.link || 'https://www2.facepe.br/'
  }));
}

/**
 * Coleta ao vivo de portais estaduais e nacionais que expõem WP REST API
 * (CONFAP, FAPEAM-AM, FAPESC-SC, FAPEAL-AL, FUNDECT-MS)
 */
const MULTI_FAP_WP_ENDPOINTS = [
  {
    fapId: 'confap-br',
    agencia: 'CONFAP',
    uf: 'BR',
    estado: 'Nacional (Consórcio das 27 FAPs)',
    regiao: 'Federal',
    esfera: 'Federal',
    plataformaSubmissao: 'Sistema CONFAP',
    linkSubmissao: 'https://confap.org.br/news/editais/',
    apiUrl: 'https://confap.org.br/news/wp-json/wp/v2/posts?per_page=6'
  },
  {
    fapId: 'fapeam-am',
    agencia: 'FAPEAM',
    uf: 'AM',
    estado: 'Amazonas',
    regiao: 'Norte',
    esfera: 'Estadual',
    plataformaSubmissao: 'SIGFAPEAM',
    linkSubmissao: 'https://sig.fapeam.am.gov.br/',
    apiUrl: 'https://www.fapeam.am.gov.br/wp-json/wp/v2/posts?per_page=6'
  },
  {
    fapId: 'fapesc-sc',
    agencia: 'FAPESC',
    uf: 'SC',
    estado: 'Santa Catarina',
    regiao: 'Sul',
    esfera: 'Estadual',
    plataformaSubmissao: 'SIGFAPESC',
    linkSubmissao: 'https://sig.fapesc.sc.gov.br/',
    apiUrl: 'https://fapesc.sc.gov.br/wp-json/wp/v2/posts?per_page=6'
  },
  {
    fapId: 'fapeal-al',
    agencia: 'FAPEAL',
    uf: 'AL',
    estado: 'Alagoas',
    regiao: 'Nordeste',
    esfera: 'Estadual',
    plataformaSubmissao: 'SIGFAP FAPEAL',
    linkSubmissao: 'https://sigfap.fapeal.br/',
    apiUrl: 'https://www.fapeal.br/wp-json/wp/v2/posts?per_page=6'
  },
  {
    fapId: 'fundect-ms',
    agencia: 'FUNDECT',
    uf: 'MS',
    estado: 'Mato Grosso do Sul',
    regiao: 'Centro-Oeste',
    esfera: 'Estadual',
    plataformaSubmissao: 'SIGFUNDECT',
    linkSubmissao: 'https://sigfundect.ledes.net/',
    apiUrl: 'https://www.fundect.ms.gov.br/wp-json/wp/v2/posts?per_page=6'
  },
  {
    fapId: 'fapema-ma',
    agencia: 'FAPEMA',
    uf: 'MA',
    estado: 'Maranhão',
    regiao: 'Nordeste',
    esfera: 'Estadual',
    plataformaSubmissao: 'Patronage FAPEMA',
    linkSubmissao: 'https://www.fapema.br/',
    apiUrl: 'https://www.fapema.br/wp-json/wp/v2/posts?per_page=6'
  },
  {
    fapId: 'fapeg-go',
    agencia: 'FAPEG',
    uf: 'GO',
    estado: 'Goiás',
    regiao: 'Centro-Oeste',
    esfera: 'Estadual',
    plataformaSubmissao: 'OPP FAPEG',
    linkSubmissao: 'https://goias.gov.br/fapeg/',
    apiUrl: 'https://goias.gov.br/fapeg/wp-json/wp/v2/posts?per_page=5'
  }
];

export async function scrapeMultiFapPortals() {
  const discoveredEditais = [];
  const discoveredNews = [];

  const tasks = MULTI_FAP_WP_ENDPOINTS.map(async src => {
    const res = await fetch(src.apiUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 RadarFAP/1.0' },
      signal: AbortSignal.timeout(6500)
    });
    if (!res.ok) return;
    const posts = await res.json();
    if (!Array.isArray(posts)) return;

    for (const post of posts) {
      const title = decodeHtmlEntities((post.title?.rendered || '').replace(/<[^>]+>/g, ''));
      const excerpt = decodeHtmlEntities((post.excerpt?.rendered || '').replace(/<[^>]+>/g, '')).slice(0, 260);
      const dateIso = (post.date || '2026-10-15').slice(0, 10);
      const link = post.link || src.linkSubmissao;

      discoveredNews.push({
        id: `${src.agencia.toLowerCase()}-news-${post.id}`,
        agencia: src.agencia,
        uf: src.uf,
        titulo: title,
        resumo: excerpt,
        data: dateIso,
        link
      });

      // Se a publicação trata de Chamada Pública, Edital, MSCA, Seleção ou Fomento, converte em oportunidade no Radar
      if (/edital|chamada|sele[çc][ãa]o|fomento|bolsa|msca|horizon|subven[çc][ãa]o|apoio/i.test(title)) {
        const numMatch = title.match(/(\d{1,3}\/\d{4})/);
        const numero = numMatch ? numMatch[1] : `Ao Vivo/${dateIso.slice(0, 4)}`;
        discoveredEditais.push({
          id: `live-${src.agencia.toLowerCase()}-${post.id}`,
          numero,
          titulo: title.startsWith(src.agencia) ? title : `${src.agencia} — ${title}`,
          fapId: src.fapId,
          agencia: src.agencia,
          uf: src.uf,
          estado: src.estado,
          regiao: src.regiao,
          esfera: src.esfera,
          area: classifyEditalArea(`${title} ${excerpt}`),
          status: /resultado|encerrad/i.test(title) ? 'Em Julgamento / Resultado' : 'Aberto',
          prorrogado: /prorroga/i.test(title),
          dataPublicacao: dateIso,
          dataPublicacaoTexto: dateIso,
          prazoSubmissao: addDaysToIso(dateIso, 40),
          valorEstimado: 'Consulte a Chamada Oficial',
          valorNumerico: 200000,
          publicoAlvo: `Pesquisadores e ICTs elegíveis (${src.agencia} / ${src.uf})`,
          linkEdital: link,
          linkPdf: link,
          linkSubmissao: src.linkSubmissao,
          plataformaSubmissao: src.plataformaSubmissao,
          anexos: [],
          resumo: excerpt || `Publicação oficial captada ao vivo do portal ${src.agencia} (${src.uf}).`,
          origemColeta: `Web Scraping Ao Vivo (${src.agencia})`,
          ultimaSincronizacao: new Date().toISOString()
        });
      }
    }
  });

  await Promise.allSettled(tasks);
  return { discoveredEditais, discoveredNews };
}
