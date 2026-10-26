const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { pool, withTransaction } = require('../config/db');
const env = require('../config/env');
const { encryptField, generateOpaqueToken, hashToken } = require('../utils/crypto');
const { sendPasswordResetEmail } = require('../utils/mailer');
const { auditLog } = require('../utils/logger');

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_DURATION_MINUTES = 15;
const ACCESS_TOKEN_TTL = '30m';
const RESET_TOKEN_TTL_MINUTES = 15;

function toPublicUser(user) {
  return {
    id: user.public_id,
    name: user.name,
    email: user.email,
    role: user.role,
    phone: user.phone,
    address: {
      street: user.address_street,
      city: user.address_city,
      state: user.address_state,
      zip: user.address_zip,
    },
  };
}

function setAuthCookies(res, user) {
  const accessToken = jwt.sign({ sub: user.id, role: user.role }, env.jwtSecret, {
    expiresIn: ACCESS_TOKEN_TTL,
  });
  // csrf_token: legível por JS de propósito (double-submit cookie pattern).
  const csrfToken = crypto.randomBytes(24).toString('hex');

  const commonOpts = {
    secure: env.cookieSecure, // true em produção atrás de HTTPS
    sameSite: 'lax',
    path: '/',
  };

  res.cookie('access_token', accessToken, { ...commonOpts, httpOnly: true, maxAge: 30 * 60 * 1000 });
  res.cookie('csrf_token', csrfToken, { ...commonOpts, httpOnly: false, maxAge: 30 * 60 * 1000 });
  return { accessToken, csrfToken };
}

function clearAuthCookies(res) {
  res.clearCookie('access_token');
  res.clearCookie('csrf_token');
}

/** POST /api/auth/register */
async function register(req, res) {
  const { name, email, password, cpf, phone, street, city, state, zip } = req.body;
  const normalizedEmail = email.trim().toLowerCase();

  const existing = await pool.query('SELECT id FROM users WHERE email = $1', [normalizedEmail]);
  if (existing.rows.length > 0) {
    // Mensagem propositalmente genérica: evita confirmar a um atacante que
    // aquele e-mail já está cadastrado (mitiga enumeração de usuários).
    return res.status(409).json({ error: 'Não foi possível concluir o cadastro com os dados informados.' });
  }

  const cpfDigits = cpf.replace(/\D/g, '');
  const passwordHash = bcrypt.hashSync(password, 12);
  const publicId = uuidv4();

  const { rows } = await pool.query(
    `INSERT INTO users
       (public_id, name, email, password_hash, cpf_encrypted, cpf_last2, phone,
        address_street, address_city, address_state, address_zip, role)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'customer')
     RETURNING *`,
    [
      publicId,
      name.trim(),
      normalizedEmail,
      passwordHash,
      encryptField(cpfDigits),
      cpfDigits.slice(-2),
      phone || null,
      street,
      city,
      state,
      zip,
    ]
  );
  const user = rows[0];

  auditLog('user_registered', { userId: user.id, ip: req.ip });

  setAuthCookies(res, user);
  return res.status(201).json({ user: toPublicUser(user) });
}

/** POST /api/auth/login */
async function login(req, res) {
  const { email, password } = req.body;
  const normalizedEmail = email.trim().toLowerCase();
  const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [normalizedEmail]);
  const user = rows[0];

  const genericError = () => res.status(401).json({ error: 'E-mail ou senha inválidos.' });

  if (!user) {
    // Ainda assim fazemos um hash "fantasma" para que o tempo de resposta seja
    // parecido ao de um login com usuário existente, dificultando a
    // enumeração de contas por análise de tempo (timing attack).
    bcrypt.hashSync('senha-invalida-de-referencia', 12);
    auditLog('login_failed_unknown_email', { ip: req.ip });
    return genericError();
  }

  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    auditLog('login_blocked_account_locked', { userId: user.id, ip: req.ip });
    return res.status(423).json({
      error: `Conta temporariamente bloqueada por excesso de tentativas. Tente novamente após ${new Date(
        user.locked_until
      ).toISOString()}.`,
    });
  }

  const passwordOk = bcrypt.compareSync(password, user.password_hash);
  if (!passwordOk) {
    const attempts = user.failed_login_attempts + 1;
    let lockedUntil = null;
    if (attempts >= MAX_FAILED_ATTEMPTS) {
      lockedUntil = new Date(Date.now() + LOCK_DURATION_MINUTES * 60 * 1000);
    }
    await pool.query('UPDATE users SET failed_login_attempts = $1, locked_until = $2 WHERE id = $3', [
      attempts,
      lockedUntil,
      user.id,
    ]);
    auditLog('login_failed_bad_password', { userId: user.id, ip: req.ip, details: { attempts } });
    return genericError();
  }

  // Login bem-sucedido: zera contador de tentativas e bloqueio.
  await pool.query('UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = $1', [user.id]);
  auditLog('login_success', { userId: user.id, ip: req.ip });

  setAuthCookies(res, user);
  return res.json({ user: toPublicUser(user) });
}

/** POST /api/auth/logout */
function logout(req, res) {
  clearAuthCookies(res);
  return res.status(204).send();
}

/** GET /api/auth/me */
async function me(req, res) {
  const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
  const user = rows[0];
  const publicUser = toPublicUser(user);
  publicUser.cpfMascarado = `***.***.***-${user.cpf_last2}`;
  return res.json({ user: publicUser });
}

/** POST /api/auth/forgot-password */
async function forgotPassword(req, res) {
  const { email } = req.body;
  const normalizedEmail = email.trim().toLowerCase();
  const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [normalizedEmail]);
  const user = rows[0];

  // Resposta sempre genérica e com o mesmo formato, exista ou não o e-mail:
  // evita que a rota seja usada para descobrir quais e-mails estão cadastrados.
  const genericResponse = () =>
    res.json({ message: 'Se este e-mail estiver cadastrado, você receberá instruções de recuperação em instantes.' });

  if (!user) {
    auditLog('password_reset_requested_unknown_email', { ip: req.ip });
    return genericResponse();
  }

  const { token, tokenHash } = generateOpaqueToken();
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60 * 1000);

  await pool.query(
    'INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
    [user.id, tokenHash, expiresAt]
  );

  const resetUrl = `${env.corsOrigin}/reset-password.html?token=${token}`;
  sendPasswordResetEmail({ to: user.email, name: user.name, resetUrl });
  auditLog('password_reset_requested', { userId: user.id, ip: req.ip });

  return genericResponse();
}

/** POST /api/auth/reset-password */
async function resetPassword(req, res) {
  const { token, newPassword } = req.body;
  const tokenHash = hashToken(token);

  const { rows } = await pool.query('SELECT * FROM password_reset_tokens WHERE token_hash = $1', [tokenHash]);
  const record = rows[0];

  if (!record || record.used_at || new Date(record.expires_at) < new Date()) {
    auditLog('password_reset_invalid_token', { ip: req.ip });
    return res.status(400).json({ error: 'Link de recuperação inválido ou expirado.' });
  }

  const passwordHash = bcrypt.hashSync(newPassword, 12);

  await withTransaction(async (client) => {
    await client.query(
      'UPDATE users SET password_hash = $1, failed_login_attempts = 0, locked_until = NULL WHERE id = $2',
      [passwordHash, record.user_id]
    );
    // Token de uso único: marca como usado imediatamente.
    await client.query('UPDATE password_reset_tokens SET used_at = now() WHERE id = $1', [record.id]);
    // Invalida quaisquer outros tokens de reset pendentes para o mesmo usuário.
    await client.query(
      'UPDATE password_reset_tokens SET used_at = now() WHERE user_id = $1 AND used_at IS NULL',
      [record.user_id]
    );
  });

  auditLog('password_reset_completed', { userId: record.user_id, ip: req.ip });
  return res.json({ message: 'Senha redefinida com sucesso. Faça login com a nova senha.' });
}

module.exports = { register, login, logout, me, forgotPassword, resetPassword };
