const { v4: uuidv4 } = require('uuid');
const { pool, withTransaction } = require('../config/db');
const { auditLog } = require('../utils/logger');

const STATUS_FLOW = ['pendente', 'pago', 'em_separacao', 'enviado', 'entregue'];

function toPublicOrder(order, items) {
  return {
    id: order.public_id,
    status: order.status,
    totalCents: order.total_cents,
    totalFormatted: (order.total_cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
    shippingAddress: {
      street: order.shipping_street,
      city: order.shipping_city,
      state: order.shipping_state,
      zip: order.shipping_zip,
    },
    trackingCode: order.tracking_code,
    createdAt: order.created_at,
    updatedAt: order.updated_at,
    items: items.map((i) => ({
      productName: i.product_name,
      quantity: i.quantity,
      unitPriceCents: i.unit_price_cents,
      subtotalCents: i.unit_price_cents * i.quantity,
    })),
  };
}

/**
 * POST /api/orders - cria um pedido (compra).
 * Toda a operação roda em uma transação: valida estoque, debita estoque e
 * grava o pedido de forma atômica. Usamos "SELECT ... FOR UPDATE" para
 * travar a linha do produto durante a transação — isso evita que duas
 * compras simultâneas leiam o mesmo estoque "antigo" e vendam mais unidades
 * do que existem (condição de corrida), algo que o Postgres, ao contrário do
 * SQLite de arquivo único, permite acontecer sem esse cuidado explícito,
 * já que aceita conexões/transações verdadeiramente concorrentes.
 */
async function createOrder(req, res) {
  const { items, shipping } = req.body;

  try {
    const result = await withTransaction(async (client) => {
      let totalCents = 0;
      const resolvedItems = [];

      for (const item of items) {
        const { rows } = await client.query(
          'SELECT * FROM products WHERE public_id = $1 AND active = true FOR UPDATE',
          [item.productId]
        );
        const product = rows[0];

        if (!product) {
          const err = new Error(`Produto ${item.productId} não encontrado ou indisponível.`);
          err.status = 400;
          throw err;
        }
        if (product.stock < item.quantity) {
          const err = new Error(`Estoque insuficiente para "${product.name}". Disponível: ${product.stock}.`);
          err.status = 409;
          throw err;
        }

        totalCents += product.price_cents * item.quantity;
        resolvedItems.push({ product, quantity: item.quantity });
      }

      const orderPublicId = uuidv4();
      const { rows: orderRows } = await client.query(
        `INSERT INTO orders
           (public_id, user_id, status, total_cents, shipping_street, shipping_city, shipping_state, shipping_zip)
         VALUES ($1, $2, 'pendente', $3, $4, $5, $6, $7)
         RETURNING *`,
        [orderPublicId, req.user.id, totalCents, shipping.street, shipping.city, shipping.state, shipping.zip]
      );
      const order = orderRows[0];

      const savedItems = [];
      for (const ri of resolvedItems) {
        const { rows: itemRows } = await client.query(
          `INSERT INTO order_items (order_id, product_id, product_name, quantity, unit_price_cents)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING *`,
          [order.id, ri.product.id, ri.product.name, ri.quantity, ri.product.price_cents]
        );
        savedItems.push(itemRows[0]);
        await client.query('UPDATE products SET stock = stock - $1 WHERE id = $2', [ri.quantity, ri.product.id]);
      }

      return { order, savedItems };
    });

    auditLog('order_created', {
      userId: req.user.id,
      details: { orderId: result.order.public_id, totalCents: result.order.total_cents },
    });

    return res.status(201).json({ order: toPublicOrder(result.order, result.savedItems) });
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error(err);
    return res.status(status).json({ error: err.message || 'Não foi possível concluir o pedido.' });
  }
}

/** GET /api/orders - pedidos do próprio usuário autenticado */
async function listMyOrders(req, res) {
  const { rows: orders } = await pool.query(
    'SELECT * FROM orders WHERE user_id = $1 ORDER BY created_at DESC',
    [req.user.id]
  );
  const result = [];
  for (const order of orders) {
    const { rows: items } = await pool.query('SELECT * FROM order_items WHERE order_id = $1', [order.id]);
    result.push(toPublicOrder(order, items));
  }
  res.json({ orders: result });
}

/**
 * GET /api/orders/:id - detalhe de um pedido.
 * Checagem de posse (ownership check): um cliente só pode ver o próprio
 * pedido; administradores podem ver qualquer pedido. Isso evita IDOR
 * (Insecure Direct Object Reference, parte da OWASP A01).
 */
async function getOrder(req, res) {
  const { rows } = await pool.query('SELECT * FROM orders WHERE public_id = $1', [req.params.id]);
  const order = rows[0];
  if (!order) return res.status(404).json({ error: 'Pedido não encontrado.' });
  if (order.user_id !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Você não tem permissão para ver este pedido.' });
  }
  const { rows: items } = await pool.query('SELECT * FROM order_items WHERE order_id = $1', [order.id]);
  res.json({ order: toPublicOrder(order, items) });
}

/** POST /api/orders/:id/cancel - cliente cancela o próprio pedido enquanto ainda não foi enviado */
async function cancelOrder(req, res) {
  const { rows } = await pool.query('SELECT * FROM orders WHERE public_id = $1', [req.params.id]);
  const order = rows[0];
  if (!order) return res.status(404).json({ error: 'Pedido não encontrado.' });
  if (order.user_id !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Você não tem permissão para cancelar este pedido.' });
  }
  if (['enviado', 'entregue', 'cancelado'].includes(order.status)) {
    return res.status(409).json({ error: `Pedido no status "${order.status}" não pode mais ser cancelado.` });
  }

  await withTransaction(async (client) => {
    const { rows: items } = await client.query('SELECT * FROM order_items WHERE order_id = $1', [order.id]);
    for (const item of items) {
      await client.query('UPDATE products SET stock = stock + $1 WHERE id = $2', [item.quantity, item.product_id]);
    }
    await client.query("UPDATE orders SET status = 'cancelado', updated_at = now() WHERE id = $1", [order.id]);
  });

  auditLog('order_cancelled', { userId: req.user.id, details: { orderId: order.public_id } });
  res.json({ message: 'Pedido cancelado e itens devolvidos ao estoque.' });
}

/**
 * PATCH /api/admin/orders/:id/status - avança o status de venda/entrega
 * (uso administrativo: pago -> em_separacao -> enviado -> entregue).
 */
async function updateOrderStatus(req, res) {
  const { status, trackingCode } = req.body;
  const { rows } = await pool.query('SELECT * FROM orders WHERE public_id = $1', [req.params.id]);
  const order = rows[0];
  if (!order) return res.status(404).json({ error: 'Pedido não encontrado.' });

  if (order.status === 'cancelado') {
    return res.status(409).json({ error: 'Pedido cancelado não pode ter o status alterado.' });
  }
  if (!STATUS_FLOW.includes(status)) {
    return res.status(400).json({ error: 'Status inválido.' });
  }

  const { rows: updatedRows } = await pool.query(
    `UPDATE orders
     SET status = $1, tracking_code = COALESCE($2, tracking_code), updated_at = now()
     WHERE id = $3
     RETURNING *`,
    [status, trackingCode || null, order.id]
  );

  auditLog('order_status_updated', {
    userId: req.user.id,
    details: { orderId: order.public_id, newStatus: status },
  });

  const { rows: items } = await pool.query('SELECT * FROM order_items WHERE order_id = $1', [order.id]);
  res.json({ order: toPublicOrder(updatedRows[0], items) });
}

/** GET /api/admin/orders - visão administrativa de todos os pedidos */
async function listAllOrders(req, res) {
  const { rows: orders } = await pool.query('SELECT * FROM orders ORDER BY created_at DESC');
  const result = [];
  for (const order of orders) {
    const { rows: items } = await pool.query('SELECT * FROM order_items WHERE order_id = $1', [order.id]);
    result.push(toPublicOrder(order, items));
  }
  res.json({ orders: result });
}

module.exports = {
  createOrder,
  listMyOrders,
  getOrder,
  cancelOrder,
  updateOrderStatus,
  listAllOrders,
};
