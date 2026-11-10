# RadarFAP Brasil — Sistema de Captação de Recursos para Pesquisas

Sistema Full-Stack em Node.js para monitoramento, curadoria e gestão de submissões de editais de fomento à pesquisa científica, tecnológica e de inovação no Brasil, com **integração e Web Scraping ao vivo do portal da FACEPE (`https://www2.facepe.br/`)** e cobertura completa das **27 Fundações Estaduais de Amparo à Pesquisa (FAPs)** e **4 Agências Federais/Nacionais (CNPq, FINEP, CAPES e CONFAP)**.

---

## Principais Funcionalidades

1. **Coletor Ao Vivo da FACEPE (`https://www2.facepe.br/editais/` e WP REST API)**:
   - Varre automaticamente os cards de editais publicados no portal da FACEPE.
   - Extrai número do edital, título, data de publicação, link direto do PDF principal e **todos os sub-arquivos complementares** (erratas, adendos, prorrogações e resultados preliminares/finais).
   - Monitora em tempo real os comunicados oficiais da FACEPE via API (`https://www2.facepe.br/wp-json/wp/v2/posts`).

2. **Diretório Nacional das 27 FAPs Estaduais + Agências Federais (31 Instituições)**:
   - Cobertura de todas as 27 Unidades Federativas do Brasil (`PE`, `SP`, `RJ`, `MG`, `ES`, `CE`, `BA`, `PB`, `RN`, `AL`, `SE`, `MA`, `PI`, `RS`, `PR`, `SC`, `DF`, `GO`, `MT`, `MS`, `AM`, `PA`, `TO`, `RO`, `AC`, `AP`, `RR`) mais `CNPq`, `FINEP`, `CAPES` e `CONFAP`.
   - Links diretos para a página de editais abertos e para a plataforma de submissão de cada estado (`AgilFAP`, `SAGe`, `PICC Carlos Chagas`, `Everest`, `Montenegro`, `SisFAPERJ`, `SIGFAP`, etc.).

3. **Painel de Editais com Filtros Avançados + Curadoria Manual**:
   - Filtros combinados por Estado (UF), Região, Agência, Linha de Fomento/Área, Status (`Aberto`, `Prorrogado`, `Em Julgamento / Resultado`, `Encerrado`) e busca por palavra-chave.
   - Cadastro e edição manual de editais para complementar os dados coletados automaticamente.

4. **Pipeline de Submissões (Quadro Kanban) & Favoritos**:
   - Gestão das propostas em 5 etapas: *Triagem/Interesse*, *Elegibilidade*, *Escrevendo Projeto*, *Documentação/AgilFAP* e *Submetido*.
   - Checklist interativo de documentos e cálculo automático do volume financeiro pleiteado.

5. **Central de Alertas Inteligentes**:
   - Alertas automáticos de prorrogações/adendos da FACEPE e avisos de editais com prazo de submissão próximo do vencimento nas UFs e áreas monitoradas.

---

## Como Executar

```bash
# Iniciar o servidor web (http://localhost:3000)
npm start

# Executar apenas a sincronização via linha de comando (opcional)
npm run sync
```

