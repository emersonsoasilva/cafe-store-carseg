/**
 * O Express 5 já encaminha rejeições de Promise ao error handler automaticamente,
 * mas este wrapper explícito deixa o comportamento claro e mantém o projeto
 * compatível com versões do Express onde isso não é automático.
 * Uso: router.get('/rota', asyncHandler(controller.algumaFuncaoAsync));
 */
function asyncHandler(fn) {
  return function wrapped(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = asyncHandler;
