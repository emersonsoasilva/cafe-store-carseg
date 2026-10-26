const jwt = require('jsonwebtoken');
const env = require('../config/env');
const { pool } = require('../config/db');

/**
 * Exige um usuário autenticado. O token é lido de um cookie httpOnly (não
 * acessível via JavaScript no navegador, mitigando roubo por XSS) ou,
 * alternativamente, do header Authorization para uso via API/Postman.
 */
async function requireAuth(req, res, next) {
  const cookieToken = req.cookies && req.cookies.access_token;
  const headerToken = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const token = cookieToken || headerToken;

  if (!token) {
    return res.status(401).json({ error: 'Não autenticado. Faça login novamente.' });
  }

  try {
    const payload = jwt.verify(token, env.jwtSecret);
    // Revalida o usuário no banco a cada requisição: se ele foi desativado
    // ou teve o papel alterado, o token antigo não deve mais valer (evita
    // "confused deputy" com tokens de longa duração / A01 Broken Access Control).
    const { rows } = await pool.query(
      'SELECT id, public_id, name, email, role FROM users WHERE id = $1',
      [payload.sub]
    );
    const user = rows[0];

    if (!user) {
      return res.status(401).json({ error: 'Sessão inválida.' });
    }

    req.user = user;
    return next();
  } catch (err) {
    if (err instanceof jwt.JsonWebTokenError || err instanceof jwt.TokenExpiredError) {
      return res.status(401).json({ error: 'Sessão expirada ou inválida.' });
    }
    return next(err);
  }
}

/** Exige um dos papéis informados (ex.: requireRole('admin')). */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Você não tem permissão para acessar este recurso.' });
    }
    return next();
  };
}

/**
 * Validação do token CSRF (padrão "double submit cookie"): o cliente precisa
 * enviar, em requisições que alteram estado, o mesmo valor que recebeu em um
 * cookie legível por JS (não-httpOnly) — um atacante em outro domínio não
 * consegue ler esse cookie nem forjar o header, o que mitiga CSRF mesmo
 * usando cookies de sessão.
 */
function requireCsrf(req, res, next) {
  const cookieCsrf = req.cookies && req.cookies.csrf_token;
  const headerCsrf = req.headers['x-csrf-token'];
  if (!cookieCsrf || !headerCsrf || cookieCsrf !== headerCsrf) {
    return res.status(403).json({ error: 'Token CSRF ausente ou inválido.' });
  }
  return next();
}

module.exports = { requireAuth, requireRole, requireCsrf };
