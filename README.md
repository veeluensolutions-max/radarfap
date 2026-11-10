<p align="center">
  <img src="public/logo-full.svg" alt="RadarFAP Brasil — Captação de Recursos para Pesquisas" width="440" />
</p>

# RadarFAP Brasil — Sistema Inteligente de Captação de Recursos para Pesquisas

Plataforma web full-stack de inteligência e gestão de fomento científico e tecnológico integrada ao vivo ao portal da **FACEPE (`https://www2.facepe.br/editais/`)**, às **27 Fundações Estaduais de Amparo à Pesquisa (FAPs)** de todos os estados brasileiros e às **4 agências nacionais (`CNPq`, `FINEP`, `CAPES`, `CONFAP`)**.

---

## Principais Módulos e Funcionalidades

1. **Coletor Web Ao Vivo (FACEPE + Multi-FAP):**
   - Extração em tempo real dos blocos de editais de `https://www2.facepe.br/editais/` (incluindo PDFs principais, erratas, adendos e resultados) e da API REST oficial de comunicados (`wp-json/wp/v2/posts`).
   - Varredura paralela de portais estaduais e nacionais (`CONFAP`, `FAPEAM`, `FAPESC`, `FAPEAL`, `FUNDECT`, `FAPEMA`, `FAPEG`).
2. **Perfil do Pesquisador / ICT & Motor de Elegibilidade (`% Match`):**
   - Configuração personalizada da coordenação, instituição (`UFPE`, `UFRPE`, `UPE`, ICTs ou Startups), UF sede, titulação, linhas de fomento e palavras-chave.
   - Cálculo instantâneo de `% Match` (`18%–99%`) com diagnóstico detalhado de elegibilidade em cada edital.
3. **Estúdio Gerador de Plano de Trabalho (Padrão AgilFAP / CNPq / FAPs):**
   - Gera automaticamente minutas estruturadas em 9 seções (Identificação, Resumo Executivo, Justificativa & ODS, Objetivos, Metodologia/Work Packages, Cronograma Físico por Trimestres, Memória de Cálculo por Rubricas, Resultados e Checklist Documental).
4. **Comparador Estratégico Lado a Lado (`⚖️`):**
   - Compare simultaneamente até 3 editais confrontando `% Match`, prazos, valores, plataformas e anexos.
5. **Gestão de Submissões (Pipeline Kanban) & Simulador de Bolsas:**
   - Quadro Kanban em 5 etapas com calculadora de orçamento (`Custeio`, `Capital`, `Bolsas`) e **Simulador Oficial de Cotas de Bolsas** (`BIC`, `Mestrado`, `Doutorado`, `BCT-I/II`, `BFD/DCR`).
   - Emissão de **Relatório Executivo do Portfólio em PDF** e compartilhamento rápido da carteira via link único (`?carteira=...`) ou arquivo `.json`.
6. **Mapa Geográfico Interativo das 27 UFs & Ping de Portais Ao Vivo:**
   - Matriz cartográfica interativa dos 27 estados + esfera federal com verificador de latência e disponibilidade dos portais oficiais em tempo real.
7. **Central de Alertas Ativos, Agenda `.ics` & Conector Nuvem Supabase:**
   - Notificações nativas no navegador, integração via Webhook (`Slack / Discord / n8n / WhatsApp API`), exportação de prazos para Google Calendar/Outlook (`.ics`) e sincronização opcional com **Supabase Cloud**.

---

## Como Executar Localmente

```bash
# Iniciar servidor local na porta 3000 (com stream SSE e auto-sync)
npm start

# Executar coleta ao vivo via linha de comando
npm run sync
```

## Deploy na Vercel (Serverless)

O projeto conta com suporte nativo a **Vercel Serverless Functions** (`api/index.mjs` e `vercel.json`), incluindo agendamento diário (`Vercel Cron`) e persistência híbrida (`Serverless + localStorage + Link Compartilhável + Supabase Opcional`).
