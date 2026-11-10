import { syncFacepeAndPortals } from '../services/databaseService.mjs';

async function main() {
  console.log('Iniciando sincronização ao vivo com https://www2.facepe.br/editais/ e FAPs...');
  const result = await syncFacepeAndPortals(40);
  console.log('Sincronização concluída com sucesso:', JSON.stringify(result, null, 2));
}

main().catch(err => {
  console.error('Erro na sincronização:', err);
  process.exit(1);
});

