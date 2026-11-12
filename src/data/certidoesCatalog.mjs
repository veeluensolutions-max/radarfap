export const DEFAULT_CERTIDOES = [
  {
    id: 'cnd-receita-federal',
    nome: 'Certidão Negativa de Débitos Relativos a Créditos Tributários Federais e à Dívida Ativa da União (CND PGFN/RFB)',
    orgao: 'Receita Federal / Procuradoria-Geral da Fazenda Nacional (PGFN)',
    tipo: 'Federal',
    obrigatoria: true,
    numeroCertidao: 'RFB-2026/894120',
    dataEmissao: '2026-09-15',
    dataValidade: '2027-03-14',
    urlEmissao: 'https://servicos.receita.fazenda.gov.br/Servicos/certidaointernet/PJ/Emitir',
    descricao: 'Comprova regularidade fiscal perante a União. Exigência padrão para celebração de convênios, termos de outorga e repasses FACEPE/FINEP/CNPq.',
    arquivoNome: 'cnd_receita_federal_2026.pdf'
  },
  {
    id: 'crf-fgts',
    nome: 'Certificado de Regularidade do FGTS (CRF Caixa)',
    orgao: 'Caixa Econômica Federal',
    tipo: 'Trabalhista / Federal',
    obrigatoria: true,
    numeroCertidao: 'CRF-20261025-0041',
    dataEmissao: '2026-10-25',
    dataValidade: '2026-11-24',
    urlEmissao: 'https://consulta-crf.caixa.gov.br/consultacrf/pages/consultaEmpregador.jsf',
    descricao: 'Comprova regularidade com o Fundo de Garantia por Tempo de Serviço. Validade curta de 30 dias.',
    arquivoNome: 'crf_fgts_caixa.pdf'
  },
  {
    id: 'cndt-trabalhista',
    nome: 'Certidão Negativa de Débitos Trabalhistas (CNDT)',
    orgao: 'Tribunal Superior do Trabalho (TST) / Justiça do Trabalho',
    tipo: 'Trabalhista',
    obrigatoria: true,
    numeroCertidao: 'TST-CNDT-77412/2026',
    dataEmissao: '2026-08-10',
    dataValidade: '2027-02-06',
    urlEmissao: 'https://cndt-certidao.tst.jus.br/inicio.faces',
    descricao: 'Atesta inexistência de débitos inadimplidos perante a Justiça do Trabalho. Validade legal de 180 dias.',
    arquivoNome: 'cndt_tst_2026.pdf'
  },
  {
    id: 'cnd-estadual-sefaz-pe',
    nome: 'Certidão de Regularidade Fiscal Estadual (SEFAZ-PE)',
    orgao: 'Secretaria da Fazenda de Pernambuco (SEFAZ-PE)',
    tipo: 'Estadual',
    obrigatoria: true,
    numeroCertidao: 'SEFAZ-PE-2026/5129',
    dataEmissao: '2026-10-01',
    dataValidade: '2026-12-30',
    urlEmissao: 'https://efisco.sefaz.pe.gov.br/',
    descricao: 'Obrigatória para outorga de recursos estaduais FACEPE e contrapartida de instituições/empresas sediadas em Pernambuco.',
    arquivoNome: 'cnd_sefaz_pe.pdf'
  },
  {
    id: 'cnd-municipal',
    nome: 'Certidão Negativa de Tributos Mobiliários e Imobiliários Municipais',
    orgao: 'Prefeitura Municipal / Secretaria de Finanças Local',
    tipo: 'Municipal',
    obrigatoria: false,
    numeroCertidao: 'PMC-2026-9931',
    dataEmissao: '2026-07-20',
    dataValidade: '2027-01-16',
    urlEmissao: 'https://recifeemdia.recife.pe.gov.br/',
    descricao: 'Regularidade tributária municipal para sede da instituição executora ou empresa parceira.',
    arquivoNome: 'cnd_municipal_recife.pdf'
  },
  {
    id: 'cadin-federal-estadual',
    nome: 'Comprovante de Inexistência de Registro no CADIN Estadual / Federal',
    orgao: 'Banco Central (BACEN) / Tesouro Nacional / SEFAZ',
    tipo: 'Financeiro / Crédito',
    obrigatoria: true,
    numeroCertidao: 'SISBACEN-CADIN-2026-09',
    dataEmissao: '2026-10-15',
    dataValidade: '2026-11-14',
    urlEmissao: 'https://www.bcb.gov.br/',
    descricao: 'Consulta prévia obrigatória antes de qualquer empenho ou liberação de parcelas financeiras da FAP.',
    arquivoNome: 'consulta_cadin_regular.pdf'
  },
  {
    id: 'ceis-cnep-inidoneos',
    nome: 'Certidão de Cadastro Nacional de Empresas Inidôneas e Suspensas (CEIS / CNEP)',
    orgao: 'Controladoria-Geral da União (CGU)',
    tipo: 'Transparência / Integridade',
    obrigatoria: true,
    numeroCertidao: 'CGU-CEIS-2026/8831',
    dataEmissao: '2026-10-05',
    dataValidade: '2026-12-04',
    urlEmissao: 'https://portaldatransparencia.gov.br/sancoes/consulta',
    descricao: 'Comprova que a instituição e seus dirigentes não possuem sanções impeditivas de contratar com a administração pública.',
    arquivoNome: 'certidao_ceis_cgu.pdf'
  }
];

