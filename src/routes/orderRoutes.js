const express = require('express');
const { body, param } = require('express-validator');
const validateRequest = require('../middleware/validateRequest');
const { requireAuth, requireRole, requireCsrf } = require('../middleware/auth');
const orderController = require('../controllers/orderController');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();

const createOrderRules = [
  body('items').isArray({ min: 1, max: 50 }).withMessage('O pedido precisa ter ao menos 1 item.'),
  body('items.*.productId').isUUID().withMessage('Identificador de produto inválido.'),
  body('items.*.quantity').isInt({ min: 1, max: 1000 }).toInt(),
  body('shipping.street').trim().isLength({ min: 3, max: 200 }).escape(),
  body('shipping.city').trim().isLength({ min: 2, max: 100 }).escape(),
  body('shipping.state').trim().isLength({ min: 2, max: 2 }).escape(),
  body('shipping.zip').trim().isLength({ min: 5, max: 12 }).escape(),
];

router.post(
  '/orders',
  requireAuth,
  requireCsrf,
  createOrderRules,
  validateRequest,
  asyncHandler(orderController.createOrder)
);
router.get('/orders', requireAuth, asyncHandler(orderController.listMyOrders));
router.get(
  '/orders/:id',
  requireAuth,
  [param('id').isUUID()],
  validateRequest,
  asyncHandler(orderController.getOrder)
);
router.post(
  '/orders/:id/cancel',
  requireAuth,
  requireCsrf,
  [param('id').isUUID()],
  validateRequest,
  asyncHandler(orderController.cancelOrder)
);

// --- Administração de vendas/entregas ---
router.get('/admin/orders', requireAuth, requireRole('admin'), asyncHandler(orderController.listAllOrders));
router.patch(
  '/admin/orders/:id/status',
  requireAuth,
  requireRole('admin'),
  requireCsrf,
  [
    param('id').isUUID(),
    body('status').isIn(['pendente', 'pago', 'em_separacao', 'enviado', 'entregue']),
    body('trackingCode').optional({ checkFalsy: true }).trim().isLength({ max: 60 }).escape(),
  ],
  validateRequest,
  asyncHandler(orderController.updateOrderStatus)
);

module.exports = router;
