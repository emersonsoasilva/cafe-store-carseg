const { pool } = require('../config/db');

const SENSITIVE_KEYS = new Set(['password', 'senha', 'token', 'cpf', 'authorization', 'cookie']);

/** Remove recursivamente campos sensíveis antes de logar (defesa em profundidade). */
function redact(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  const clone = Array.isArray(obj) ? [] : {};
  for (const [key, value] of Object.entries(obj)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
      clone[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      clone[key] = redact(value);
    } else {
      clone[key] = value;
    }
  }
  return clone;
}

/**
 * Grava eventos de segurança relevantes (login, falha de login, reset de senha,
 * mudanças de pedido) para permitir detecção de abuso e investigação posterior
 * (OWASP A09 - Security Logging and Monitoring Failures).
 *
 * Propositalmente assíncrona mas "fire-and-forget": os chamadores não
 * precisam de `await` (não faz sentido atrasar a resposta ao cliente por
 * causa do log), mas qualquer falha de gravação é capturada e reportada no
 * console em vez de virar uma rejeição de Promise não tratada.
 */
async function auditLog(eventType, { userId = null, ip = null, details = {} } = {}) {
  const safeDetails = redact(details);
  // Também loga no console em desenvolvimento para visibilidade imediata.
  console.log(`[audit] ${eventType}`, redact({ userId, ip, ...details }));
  try {
    await pool.query(
      'INSERT INTO audit_log (user_id, event_type, ip, details) VALUES ($1, $2, $3, $4)',
      [userId, eventType, ip, JSON.stringify(safeDetails)]
    );
  } catch (err) {
    console.error('[audit-log-error]', err.message);
  }
}

module.exports = { auditLog, redact };
