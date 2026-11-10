
const bcrypt = require('bcryptjs');
const { randomUUID } = require('crypto');
const { pool, withTransaction } = require('../config/db');
const { encryptField } = require('../utils/crypto');

const INTERVAL_MS = 1 * 60 * 100;
const state = {
  active: false,
  nextRunAt: null,
  lastRunAt: null,
  timer: null,
  running: false,
  counts: { users: 0, products: 0, purchases: 0, errors: 0 },
  history: [],
};

const firstNames = ['Ana', 'Bruno', 'Camila', 'Diego', 'Elisa', 'Felipe', 'Giovana', 'Henrique', 'Isabela', 'Lucas', 'Marina', 'Rafael'];
const lastNames = ['Almeida', 'Barbosa', 'Carvalho', 'Dias', 'Fernandes', 'Gomes', 'Lima', 'Martins', 'Oliveira', 'Pereira', 'Ribeiro', 'Souza'];
const origins = ['Sul de Minas, MG', 'Cerrado Mineiro, MG', 'Mogiana Paulista, SP', 'Vale do Paraíba, SP', 'Mantiqueira, MG'];
const roastLevels = ['claro', 'medio', 'escuro'];

function pick(list) { return list[Math.floor(Math.random() * list.length)]; }
function digits(n) { return Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join(''); }

function makeCpf() {
  const base = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
  const calc = (arr, factor) => {
    const sum = arr.reduce((total, digit, i) => total + digit * (factor - i), 0);
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };
  base.push(calc(base, 10));
  base.push(calc(base, 11));
  return base.join('');
}

async function createSimulatedUser() {
  const name = `${pick(firstNames)} ${pick(lastNames)} ${pick(lastNames)}`;
  const cpf = makeCpf();
  const suffix = `${Date.now()}${digits(4)}`;
  const email = `cliente.simulado.${suffix}@cafestore.test`;
  const passwordHash = bcrypt.hashSync(`CafeDemo${digits(5)}A!`, 10);
  const { rows } = await pool.query(
    `INSERT INTO users
      (public_id, name, email, password_hash, cpf_encrypted, cpf_last2, phone,
       address_street, address_city, address_state, address_zip, role)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'customer')
     RETURNING public_id, name, email`,
    [randomUUID(), name, email, passwordHash, encryptField(cpf), cpf.slice(-2),
      `(12) 9${digits(4)}-${digits(4)}`, `Rua dos Cafés, ${Math.floor(Math.random() * 900) + 100}`,
      'Caraguatatuba', 'SP', '11660-000']
  );
  return { type: 'user', message: `Cliente criado: ${rows[0].name} (${rows[0].email})`, details: rows[0] };
}

async function createSimulatedProduct() {
  const roast = pick(roastLevels);
  const weight = pick([250, 250, 500, 1000]);
  const name = `Café ${pick(['Bourbon', 'Catuaí', 'Mundo Novo', 'Arara', 'Geisha', 'Acaiá'])} ${pick(['Especial', 'Selecionado', 'Reserva', 'da Serra', 'Microlote'])} ${Date.now().toString().slice(-5)}`;
  const priceCents = Math.floor(Math.random() * 7000) + 2990;
  const stock = Math.floor(Math.random() * 35) + 10;
  const { rows } = await pool.query(
    `INSERT INTO products
      (public_id, name, description, origin, roast_level, weight_grams, price_cents, stock)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING public_id, name, price_cents, stock`,
    [randomUUID(), name, `Café fictício criado automaticamente para teste. Torra ${roast}.`,
      pick(origins), roast, weight, priceCents, stock]
  );
  return { type: 'product', message: `Produto cadastrado: ${rows[0].name} (estoque: ${rows[0].stock})`, details: rows[0] };
}

async function createSimulatedPurchase() {
  const { rows: customers } = await pool.query(
    `SELECT id, name FROM users WHERE role = 'customer' ORDER BY random() LIMIT 1`
  );
  const { rows: products } = await pool.query(
    `SELECT id, public_id, name, price_cents, stock FROM products
     WHERE active = true AND stock > 0 ORDER BY random() LIMIT 1`
  );
  if (!customers.length) throw new Error('Não há clientes disponíveis para realizar uma compra.');
  if (!products.length) throw new Error('Não há produtos ativos com estoque disponível.');

  const customer = customers[0];
  const product = products[0];
  const quantity = Math.min(product.stock, Math.floor(Math.random() * 2) + 1);

  const result = await withTransaction(async (client) => {
    const { rows: lockedRows } = await client.query(
      `SELECT * FROM products WHERE id = $1 AND active = true FOR UPDATE`, [product.id]
    );
    const locked = lockedRows[0];
    if (!locked || locked.stock < quantity) throw new Error('Estoque alterado durante a simulação; compra não realizada.');

    const { rows: userRows } = await client.query(
      `SELECT address_street, address_city, address_state, address_zip FROM users WHERE id = $1`,
      [customer.id]
    );
    const address = userRows[0];
    if (!address.address_street || !address.address_city || !address.address_state || !address.address_zip) {
      throw new Error('O cliente selecionado não possui endereço completo.');
    }

    const total = locked.price_cents * quantity;
    const { rows: orderRows } = await client.query(
      `INSERT INTO orders
       (public_id, user_id, status, total_cents, shipping_street, shipping_city, shipping_state, shipping_zip)
       VALUES ($1,$2,'pendente',$3,$4,$5,$6,$7) RETURNING public_id`,
      [randomUUID(), customer.id, total, address.address_street, address.address_city, address.address_state, address.address_zip]
    );
    await client.query(
      `INSERT INTO order_items (order_id, product_id, product_name, quantity, unit_price_cents)
       VALUES ((SELECT id FROM orders WHERE public_id = $1),$2,$3,$4,$5)`,
      [orderRows[0].public_id, locked.id, locked.name, quantity, locked.price_cents]
    );
    await client.query('UPDATE products SET stock = stock - $1 WHERE id = $2', [quantity, locked.id]);
    return { orderId: orderRows[0].public_id, customer: customer.name, product: locked.name, quantity, totalCents: total };
  });

  return {
    type: 'purchase',
    message: `Compra realizada: ${result.customer} comprou ${result.quantity}x ${result.product} (pedido ${result.orderId.slice(0, 8)}).`,
    details: result,
  };
}

async function runOne() {
  if (state.running) return;
  state.running = true;
  state.lastRunAt = new Date().toISOString();
  try {
    const action = pick([createSimulatedUser, createSimulatedProduct, createSimulatedPurchase]);
    const result = await action();
    const key = result.type === 'user' ? 'users' : result.type === 'product' ? 'products' : 'purchases';
    state.counts[key] += 1;
    addHistory({ ...result, status: 'success', at: state.lastRunAt });
  } catch (error) {
    state.counts.errors += 1;
    addHistory({ type: 'error', message: error.message || 'Falha na simulação.', status: 'error', at: state.lastRunAt });
  } finally {
    state.running = false;
  }
}

function addHistory(entry) {
  state.history.unshift(entry);
  state.history = state.history.slice(0, 50);
}

function scheduleNext() {
  if (!state.active) return;
  state.nextRunAt = new Date(Date.now() + INTERVAL_MS).toISOString();
  state.timer = setTimeout(async () => {
    state.timer = null;
    await runOne();
    scheduleNext();
  }, INTERVAL_MS);
}

function start() {
  if (state.active) return getStatus();
  state.active = true;
  scheduleNext();
  return getStatus();
}

function stop() {
  state.active = false;
  if (state.timer) clearTimeout(state.timer);
  state.timer = null;
  state.nextRunAt = null;
  return getStatus();
}

function getStatus() {
  return {
    active: state.active,
    running: state.running,
    intervalMs: INTERVAL_MS,
    nextRunAt: state.nextRunAt,
    lastRunAt: state.lastRunAt,
    counts: { ...state.counts },
    history: state.history,
  };
}

module.exports = { start, stop, getStatus };
