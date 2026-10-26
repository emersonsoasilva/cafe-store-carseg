const { v4: uuidv4 } = require('uuid');
const { pool } = require('../config/db');
const { auditLog } = require('../utils/logger');

function toPublicProduct(p) {
  return {
    id: p.public_id,
    name: p.name,
    description: p.description,
    origin: p.origin,
    roastLevel: p.roast_level,
    weightGrams: p.weight_grams,
    priceCents: p.price_cents,
    priceFormatted: (p.price_cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
    stock: p.stock,
    active: p.active,
  };
}

/** GET /api/products - catálogo público (somente produtos ativos) */
async function list(req, res) {
  const { rows } = await pool.query('SELECT * FROM products WHERE active = true ORDER BY name ASC');
  res.json({ products: rows.map(toPublicProduct) });
}

/** GET /api/products/:id */
async function getOne(req, res) {
  const { rows } = await pool.query('SELECT * FROM products WHERE public_id = $1', [req.params.id]);
  const product = rows[0];
  if (!product || !product.active) {
    return res.status(404).json({ error: 'Produto não encontrado.' });
  }
  return res.json({ product: toPublicProduct(product) });
}

/** GET /api/admin/products - inclui inativos (uso administrativo) */
async function listAdmin(req, res) {
  const { rows } = await pool.query('SELECT * FROM products ORDER BY id DESC');
  res.json({ products: rows.map(toPublicProduct) });
}

/** POST /api/admin/products */
async function create(req, res) {
  const { name, description, origin, roastLevel, weightGrams, priceCents, stock } = req.body;
  const { rows } = await pool.query(
    `INSERT INTO products (public_id, name, description, origin, roast_level, weight_grams, price_cents, stock)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [uuidv4(), name, description || null, origin || null, roastLevel, weightGrams, priceCents, stock]
  );
  const product = rows[0];
  auditLog('product_created', { userId: req.user.id, details: { productId: product.public_id } });
  res.status(201).json({ product: toPublicProduct(product) });
}

/** PUT /api/admin/products/:id */
async function update(req, res) {
  const { rows: existingRows } = await pool.query('SELECT * FROM products WHERE public_id = $1', [req.params.id]);
  const product = existingRows[0];
  if (!product) return res.status(404).json({ error: 'Produto não encontrado.' });

  const fields = ['name', 'description', 'origin', 'roastLevel', 'weightGrams', 'priceCents', 'stock', 'active'];
  const dbFieldMap = {
    name: 'name',
    description: 'description',
    origin: 'origin',
    roastLevel: 'roast_level',
    weightGrams: 'weight_grams',
    priceCents: 'price_cents',
    stock: 'stock',
    active: 'active',
  };

  const setClauses = [];
  const values = [];
  let paramIndex = 1;
  for (const field of fields) {
    if (req.body[field] !== undefined) {
      setClauses.push(`${dbFieldMap[field]} = $${paramIndex}`);
      values.push(req.body[field]);
      paramIndex += 1;
    }
  }
  if (setClauses.length === 0) {
    return res.status(400).json({ error: 'Nenhum campo para atualizar foi informado.' });
  }
  values.push(product.id);

  const { rows } = await pool.query(
    `UPDATE products SET ${setClauses.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
    values
  );

  auditLog('product_updated', { userId: req.user.id, details: { productId: product.public_id } });
  res.json({ product: toPublicProduct(rows[0]) });
}

/** DELETE /api/admin/products/:id - soft delete (mantém histórico de pedidos íntegro) */
async function remove(req, res) {
  const { rows } = await pool.query(
    'UPDATE products SET active = false WHERE public_id = $1 RETURNING public_id',
    [req.params.id]
  );
  if (rows.length === 0) return res.status(404).json({ error: 'Produto não encontrado.' });
  auditLog('product_deactivated', { userId: req.user.id, details: { productId: req.params.id } });
  res.status(204).send();
}

module.exports = { list, getOne, listAdmin, create, update, remove, toPublicProduct };
