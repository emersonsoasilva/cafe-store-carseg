const rateLimit = require('express-rate-limit');

/**
 * Limites de taxa por IP para rotas sensíveis a força bruta e enumeração
 * (OWASP A07 - Identification and Authentication Failures).
 * Além do limite por IP, o login também usa bloqueio de conta (ver
 * authController), formando duas camadas de defesa.
 */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas tentativas de login. Tente novamente mais tarde.' },
});

const forgotPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas solicitações de recuperação de senha. Tente novamente mais tarde.' },
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas contas criadas a partir deste endereço. Tente novamente mais tarde.' },
});

const generalApiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = { loginLimiter, forgotPasswordLimiter, registerLimiter, generalApiLimiter };
