import crypto from 'node:crypto';

export function hashPassword(plainText = '') {
  return crypto.createHash('sha256').update(String(plainText).trim()).digest('hex');
}

export function generateToken(user) {
  const payload = {
    userId: user.id,
    email: user.email,
    role: user.role,
    expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000 // 7 dias
  };
  const jsonStr = JSON.stringify(payload);
  const b64 = Buffer.from(jsonStr, 'utf-8').toString('base64url');
  const sig = crypto.createHmac('sha256', process.env.AUTH_SECRET || 'radarfap-secret-key-2026').update(b64).digest('hex');
  return `${b64}.${sig}`;
}

export function verifyToken(tokenStr = '') {
  if (!tokenStr || typeof tokenStr !== 'string') return null;
  const parts = tokenStr.split('.');
  if (parts.length !== 2) return null;
  const [b64, sig] = parts;
  const expectedSig = crypto.createHmac('sha256', process.env.AUTH_SECRET || 'radarfap-secret-key-2026').update(b64).digest('hex');
  if (sig !== expectedSig) return null;

  try {
    const raw = Buffer.from(b64, 'base64url').toString('utf-8');
    const payload = JSON.parse(raw);
    if (payload.expiresAt && payload.expiresAt < Date.now()) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export const INITIAL_USERS = [
  {
    id: 'user-admin-default',
    nome: 'Administrador do Sistema',
    email: 'admin@radarfap.br',
    passwordHash: hashPassword('admin123'),
    role: 'admin', // 'admin' ou 'pesquisador'
    instituicao: 'FACEPE / RadarFAP Geral',
    ativo: true,
    criadoEm: '2026-11-10T10:00:00Z',
    ultimoAcesso: new Date().toISOString()
  },
  {
    id: 'user-pesquisador-demo',
    nome: 'Prof. Dr. Pesquisador',
    email: 'pesquisador@radarfap.br',
    passwordHash: hashPassword('pesquisador123'),
    role: 'pesquisador',
    instituicao: 'UFPE / Laboratórios Multiusuários',
    ativo: true,
    criadoEm: '2026-11-10T10:00:00Z',
    ultimoAcesso: new Date().toISOString()
  }
];
