/**
 * RadarFAP Brasil — Integração nativa direta com a REST API do Supabase
 * Não depende de bibliotecas externas adicionais, funcionando perfeitamente
 * no Node.js 18+, Vercel Serverless e no Frontend.
 */

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://bnfkztjbpcfyqtzdddbg.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_GvNp5uv8mHP-6oA8fSRu3Q_hFmE5-MG';

function getHeaders() {
  return {
    'Content-Type': 'application/json',
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Prefer': 'resolution=merge-duplicates'
  };
}

/**
 * Salva ou atualiza um usuário individual no Supabase (tabela radarfap_users e radarfap_workspaces)
 */
export async function syncUserToSupabase(user) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return false;
  const cleanUrl = SUPABASE_URL.replace(/\/$/, '');

  const payloadUser = {
    id: user.id,
    nome: user.nome,
    email: user.email.toLowerCase(),
    role: user.role,
    instituicao: user.instituicao,
    ativo: user.ativo !== false,
    trial_active: user.trialActive !== false,
    trial_expires_at: user.trialExpiresAt,
    ultimo_acesso: user.ultimoAcesso || new Date().toISOString()
  };

  // 1. Tenta salvar na tabela individual radarfap_users (se existir)
  try {
    await fetch(`${cleanUrl}/rest/v1/radarfap_users?on_conflict=id`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payloadUser)
    });
  } catch (err) {
    console.warn('[Supabase] Aviso ao gravar radarfap_users:', err.message);
  }

  // 2. Garante gravação segura no workspace central compartilhado (radarfap_workspaces)
  try {
    // Primeiro lê o estado atual do workspace no Supabase para mesclar o novo usuário
    const getRes = await fetch(`${cleanUrl}/rest/v1/radarfap_workspaces?id=eq.default-workspace&select=*`, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`
      }
    });

    let currentUsers = [];
    let currentData = {};
    if (getRes.ok) {
      const rows = await getRes.json();
      if (rows?.[0]?.data) {
        currentData = rows[0].data;
        currentUsers = Array.isArray(currentData.users) ? currentData.users : [];
      }
    }

    // Mescla o usuário cadastrado mantendo outros usuários intactos
    const userMap = new Map(currentUsers.map(u => [u.id || u.email, u]));
    userMap.set(user.id, {
      ...payloadUser,
      passwordHash: user.passwordHash // sincroniza hash de senha para login multi-dispositivo
    });

    const updatedUsers = Array.from(userMap.values());
    currentData.users = updatedUsers;

    await fetch(`${cleanUrl}/rest/v1/radarfap_workspaces?on_conflict=id`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        id: 'default-workspace',
        updated_at: new Date().toISOString(),
        data: currentData
      })
    });

    return true;
  } catch (err) {
    console.warn('[Supabase] Falha ao sincronizar workspace:', err.message);
    return false;
  }
}

/**
 * Puxa todos os usuários cadastrados diretamente do Supabase
 */
export async function fetchUsersFromSupabase() {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;
  const cleanUrl = SUPABASE_URL.replace(/\/$/, '');

  try {
    const res = await fetch(`${cleanUrl}/rest/v1/radarfap_workspaces?id=eq.default-workspace&select=*`, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`
      }
    });

    if (res.ok) {
      const rows = await res.json();
      const users = rows?.[0]?.data?.users;
      if (Array.isArray(users) && users.length > 0) {
        return users;
      }
    }
  } catch (err) {
    console.warn('[Supabase] Erro ao carregar usuários:', err.message);
  }
  return null;
}

export { SUPABASE_URL, SUPABASE_KEY };
