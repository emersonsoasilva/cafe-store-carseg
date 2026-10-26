const express = require('express');
const { body } = require('express-validator');
const validateRequest = require('../middleware/validateRequest');
const { requireAuth, requireCsrf } = require('../middleware/auth');
const { loginLimiter, forgotPasswordLimiter, registerLimiter } = require('../middleware/rateLimiters');
const authController = require('../controllers/authController');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();

// Validação de CPF (algoritmo oficial dos dígitos verificadores) para
// garantir que só armazenamos valores estruturalmente válidos.
function isValidCpf(value) {
  const cpf = String(value).replace(/\D/g, '');
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const calcDigit = (base) => {
    let sum = 0;
    for (let i = 0; i < base.length; i++) sum += parseInt(base[i], 10) * (base.length + 1 - i);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  const d1 = calcDigit(cpf.slice(0, 9));
  const d2 = calcDigit(cpf.slice(0, 9) + d1);
  return cpf === cpf.slice(0, 9) + String(d1) + String(d2);
}

// Detecta sequências numéricas de 3+ dígitos consecutivos, crescentes
// (123, 2345...) ou decrescentes (321, 9876...), em qualquer posição da
// senha — não precisa ser a senha inteira, basta conter o trecho.
function hasSequentialDigits(value, runLength = 3) {
  for (let i = 0; i <= value.length - runLength; i++) {
    const slice = value.slice(i, i + runLength);
    if (!/^\d+$/.test(slice)) continue;

    let ascending = true;
    let descending = true;
    for (let j = 1; j < slice.length; j++) {
      const diff = slice.charCodeAt(j) - slice.charCodeAt(j - 1);
      if (diff !== 1) ascending = false;
      if (diff !== -1) descending = false;
    }
    if (ascending || descending) return true;
  }
  return false;
}

// Política de senha forte. Observação: a OWASP recomenda, em geral, NÃO
// restringir caracteres (permitir qualquer Unicode, espaços, símbolos) para
// não reduzir a entropia possível da senha. As regras abaixo (sem cedilha,
// sem aspas simples, sem espaço, sem sequência numérica) foram incluídas por
// decisão específica deste projeto, mesmo contrariando essa recomendação.
function passwordRule(fieldName = 'password') {
  return body(fieldName)
    .isString()
    .isLength({ min: 10, max: 128 })
    .withMessage('A senha deve ter entre 10 e 128 caracteres.')
    .matches(/[a-z]/)
    .withMessage('A senha deve conter ao menos uma letra minúscula.')
    .matches(/[A-Z]/)
    .withMessage('A senha deve conter ao menos uma letra maiúscula.')
    .matches(/[0-9]/)
    .withMessage('A senha deve conter ao menos um número.')
    .custom((value) => !/[çÇ]/.test(value))
    .withMessage('A senha não pode conter a letra "ç"/"Ç".')
    .custom((value) => !/'/.test(value))
    .withMessage('A senha não pode conter aspas simples (\').')
    .custom((value) => !/\s/.test(value))
    .withMessage('A senha não pode conter espaços.')
    .custom((value) => !hasSequentialDigits(value))
    .withMessage('A senha não pode conter sequências numéricas (ex.: 123, 2345, 4321).');
}

router.post(
  '/register',
  registerLimiter,
  [
    body('name').trim().isLength({ min: 2, max: 120 }).escape(),
    body('email').trim().isEmail().withMessage('E-mail inválido.').normalizeEmail(),
    passwordRule('password'),
    body('cpf').custom(isValidCpf).withMessage('CPF inválido.'),
    body('phone').optional({ checkFalsy: true }).trim().isLength({ max: 30 }).escape(),
    body('street').trim().isLength({ min: 3, max: 200 }).escape(),
    body('city').trim().isLength({ min: 2, max: 100 }).escape(),
    body('state').trim().isLength({ min: 2, max: 2 }).escape(),
    body('zip').trim().isLength({ min: 5, max: 12 }).escape(),
  ],
  validateRequest,
  asyncHandler(authController.register)
);

router.post(
  '/login',
  loginLimiter,
  [
    body('email').trim().isEmail().withMessage('E-mail inválido.').normalizeEmail(),
    body('password').isString().notEmpty().withMessage('Senha é obrigatória.'),
  ],
  validateRequest,
  asyncHandler(authController.login)
);

router.post('/logout', requireAuth, requireCsrf, authController.logout);

router.get('/me', requireAuth, asyncHandler(authController.me));

router.post(
  '/forgot-password',
  forgotPasswordLimiter,
  [body('email').trim().isEmail().withMessage('E-mail inválido.').normalizeEmail()],
  validateRequest,
  asyncHandler(authController.forgotPassword)
);

router.post(
  '/reset-password',
  forgotPasswordLimiter,
  [
    body('token').isString().isLength({ min: 32 }).withMessage('Token inválido.'),
    passwordRule('newPassword'),
  ],
  validateRequest,
  asyncHandler(authController.resetPassword)
);

module.exports = router;
