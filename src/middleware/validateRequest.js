const { validationResult } = require('express-validator');

/**
 * Centraliza a checagem de erros de validação (OWASP A03 - Injection e
 * validação de entrada em geral). Sempre usado depois das regras do
 * express-validator nas rotas.
 */
function validateRequest(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Dados inválidos.',
      details: errors.array().map((e) => ({ field: e.path, message: e.msg })),
    });
  }
  return next();
}

module.exports = validateRequest;
