const express = require('express');
const { body, param } = require('express-validator');
const validateRequest = require('../middleware/validateRequest');
const { requireAuth, requireRole, requireCsrf } = require('../middleware/auth');
const productController = require('../controllers/productController');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();

// --- Rotas públicas (qualquer visitante pode navegar pelo catálogo) ---
router.get('/products', asyncHandler(productController.list));
router.get(
  '/products/:id',
  [param('id').isUUID().withMessage('Identificador de produto inválido.')],
  validateRequest,
  asyncHandler(productController.getOne)
);

// --- Rotas administrativas (RBAC: apenas role "admin") ---
const productRules = [
  body('name').trim().isLength({ min: 2, max: 150 }).escape(),
  body('description').optional({ checkFalsy: true }).trim().isLength({ max: 1000 }).escape(),
  body('origin').optional({ checkFalsy: true }).trim().isLength({ max: 150 }).escape(),
  body('roastLevel').isIn(['claro', 'medio', 'escuro']).withMessage('Nível de torra inválido.'),
  body('weightGrams').isInt({ min: 1, max: 50000 }).toInt(),
  body('priceCents').isInt({ min: 1, max: 100000000 }).toInt(),
  body('stock').isInt({ min: 0, max: 1000000 }).toInt(),
];

router.get('/admin/products', requireAuth, requireRole('admin'), asyncHandler(productController.listAdmin));

router.post(
  '/admin/products',
  requireAuth,
  requireRole('admin'),
  requireCsrf,
  productRules,
  validateRequest,
  asyncHandler(productController.create)
);

router.put(
  '/admin/products/:id',
  requireAuth,
  requireRole('admin'),
  requireCsrf,
  [
    param('id').isUUID(),
    body('name').optional().trim().isLength({ min: 2, max: 150 }).escape(),
    body('description').optional({ checkFalsy: true }).trim().isLength({ max: 1000 }).escape(),
    body('origin').optional({ checkFalsy: true }).trim().isLength({ max: 150 }).escape(),
    body('roastLevel').optional().isIn(['claro', 'medio', 'escuro']),
    body('weightGrams').optional().isInt({ min: 1, max: 50000 }).toInt(),
    body('priceCents').optional().isInt({ min: 1, max: 100000000 }).toInt(),
    body('stock').optional().isInt({ min: 0, max: 1000000 }).toInt(),
    body('active').optional().isBoolean().toBoolean(),
  ],
  validateRequest,
  asyncHandler(productController.update)
);

router.delete(
  '/admin/products/:id',
  requireAuth,
  requireRole('admin'),
  requireCsrf,
  [param('id').isUUID()],
  validateRequest,
  asyncHandler(productController.remove)
);

module.exports = router;
