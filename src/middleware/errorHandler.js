const env = require('../config/env');

/**
 * Handler de erro central: nunca expõe stack trace ou mensagens internas do
 * banco de dados ao cliente (isso vazaria detalhes de implementação úteis a
 * um atacante — OWASP A05 Security Misconfiguration). Detalhes completos vão
 * apenas para o log do servidor.
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  console.error('[erro-nao-tratado]', err);
  const status = err.status || 500;
  const message = status < 500 ? err.message : 'Erro interno do servidor.';
  const body = { error: message };
  if (!env.isProduction && status >= 500) {
    body.debug = err.message;
  }
  res.status(status).json(body);
}

function notFoundHandler(req, res) {
  res.status(404).json({ error: 'Recurso não encontrado.' });
}

module.exports = { errorHandler, notFoundHandler };
