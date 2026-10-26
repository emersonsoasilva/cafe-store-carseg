const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const env = require('./env');
const { encryptField } = require('../utils/crypto');

// --- Pool de conexões ---
// Um Pool (e não uma única conexão) permite atender requisições concorrentes
// sem serializar o acesso ao banco; o node-postgres gerencia a reutilização
// e o encerramento de conexões ociosas automaticamente.
const poolConfig = env.databaseUrl
  ? { connectionString: env.databaseUrl }
  : {
      host: env.pgHost,
      port: env.pgPort,
      database: env.pgDatabase,
      user: env.pgUser,
      password: env.pgPassword,
    };

if (env.pgSslEnabled) {
  // rejectUnauthorized:false é comum em provedores gerenciados cujo
  // certificado não está na cadeia padrão do Node; ajuste conforme o seu
  // provedor caso queira validação estrita do certificado.
  poolConfig.ssl = { rejectUnauthorized: false };
}

poolConfig.max = env.pgPoolMax;

const pool = new Pool(poolConfig);

pool.on('error', (err) => {
  // Erros em clientes ociosos do pool (ex.: conexão derrubada pelo servidor)
  // não devem derrubar o processo Node inteiro.
  console.error('[pg-pool-error]', err.message);
});

/**
 * Executa uma função dentro de uma transação real (BEGIN/COMMIT/ROLLBACK)
 * usando um único client dedicado do pool. Use sempre que uma operação
 * precisar de múltiplas escritas atômicas (ex.: criar pedido + debitar
 * estoque), para nunca deixar o banco em um estado parcialmente aplicado.
 *
 * Uso:
 *   const resultado = await withTransaction(async (client) => {
 *     await client.query('UPDATE ...');
 *     return algumValor;
 *   });
 */
async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function initSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGSERIAL PRIMARY KEY,
      public_id UUID UNIQUE NOT NULL,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      cpf_encrypted TEXT NOT NULL,
      cpf_last2 TEXT NOT NULL,
      phone TEXT,
      address_street TEXT,
      address_city TEXT,
      address_state TEXT,
      address_zip TEXT,
      role TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('customer', 'admin')),
      failed_login_attempts INTEGER NOT NULL DEFAULT 0,
      locked_until TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TIMESTAMPTZ NOT NULL,
      used_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS products (
      id BIGSERIAL PRIMARY KEY,
      public_id UUID UNIQUE NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      origin TEXT,
      roast_level TEXT CHECK (roast_level IN ('claro', 'medio', 'escuro')),
      weight_grams INTEGER NOT NULL DEFAULT 250,
      price_cents INTEGER NOT NULL,
      stock INTEGER NOT NULL DEFAULT 0,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS orders (
      id BIGSERIAL PRIMARY KEY,
      public_id UUID UNIQUE NOT NULL,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      status TEXT NOT NULL DEFAULT 'pendente'
        CHECK (status IN ('pendente', 'pago', 'em_separacao', 'enviado', 'entregue', 'cancelado')),
      total_cents INTEGER NOT NULL,
      shipping_street TEXT NOT NULL,
      shipping_city TEXT NOT NULL,
      shipping_state TEXT NOT NULL,
      shipping_zip TEXT NOT NULL,
      tracking_code TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id BIGSERIAL PRIMARY KEY,
      order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      product_id BIGINT NOT NULL REFERENCES products(id),
      product_name TEXT NOT NULL,
      quantity INTEGER NOT NULL CHECK (quantity > 0),
      unit_price_cents INTEGER NOT NULL
    );

    -- Trilha de auditoria (OWASP A09 - Security Logging and Monitoring Failures).
    -- Nunca gravamos senha, token em texto puro ou CPF aqui.
    CREATE TABLE IF NOT EXISTS audit_log (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
      event_type TEXT NOT NULL,
      ip TEXT,
      details JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
    CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
    CREATE INDEX IF NOT EXISTS idx_reset_tokens_user ON password_reset_tokens(user_id);
    CREATE INDEX IF NOT EXISTS idx_reset_tokens_hash ON password_reset_tokens(token_hash);
  `);
}

async function seedIfEmpty() {
  const { rows } = await pool.query('SELECT COUNT(*)::int AS c FROM users');
  if (rows[0].c > 0) return;

  // Dados 100% fictícios para fins de demonstração/teste.
  const fakeUsers = [
    {
      name: 'Admin da Loja',
      email: 'admin@cafestore.test',
      password: 'Admin@Cafe123!',
      cpf: '11144477735',
      phone: '(12) 90000-0001',
      address_street: 'Rua das Torrefações, 100',
      address_city: 'Caraguatatuba',
      address_state: 'SP',
      address_zip: '11660-000',
      role: 'admin',
    },
    {
      name: 'Maria Fictícia da Silva',
      email: 'maria.silva@exemplo.test',
      password: 'CafeComLeite@2024',
      cpf: '52998224725',
      phone: '(11) 98888-1234',
      address_street: 'Av. dos Grãos, 45, Apto 12',
      address_city: 'São Paulo',
      address_state: 'SP',
      address_zip: '01310-000',
      role: 'customer',
    },
    {
      name: 'João Fictício Pereira',
      email: 'joao.pereira@exemplo.test',
      password: 'ExpressoForte#7',
      cpf: '39053344705',
      phone: '(21) 97777-5678',
      address_street: 'Rua do Cerrado Mineiro, 789',
      address_city: 'Rio de Janeiro',
      address_state: 'RJ',
      address_zip: '20040-000',
      role: 'customer',
    },
  ];

  await withTransaction(async (client) => {
    for (const u of fakeUsers) {
      const passwordHash = bcrypt.hashSync(u.password, 12);
      const cpfDigits = u.cpf.replace(/\D/g, '');
      await client.query(
        `INSERT INTO users
           (public_id, name, email, password_hash, cpf_encrypted, cpf_last2, phone,
            address_street, address_city, address_state, address_zip, role)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          uuidv4(),
          u.name,
          u.email,
          passwordHash,
          encryptField(cpfDigits),
          cpfDigits.slice(-2),
          u.phone,
          u.address_street,
          u.address_city,
          u.address_state,
          u.address_zip,
          u.role,
        ]
      );
    }
  });

  const products = [
    {
      name: 'Café Bourbon Amarelo',
      description: 'Grãos de Bourbon Amarelo, notas de caramelo e frutas amarelas.',
      origin: 'Sul de Minas, MG',
      roast_level: 'medio',
      weight_grams: 250,
      price_cents: 3490,
      stock: 40,
    },
    {
      name: 'Café Catuaí Vermelho',
      description: 'Doçura equilibrada com acidez cítrica suave.',
      origin: 'Cerrado Mineiro, MG',
      roast_level: 'claro',
      weight_grams: 250,
      price_cents: 3290,
      stock: 55,
    },
    {
      name: 'Café Mundo Novo Torra Escura',
      description: 'Corpo encorpado, ideal para espresso, notas de chocolate amargo.',
      origin: 'Mogiana Paulista, SP',
      roast_level: 'escuro',
      weight_grams: 500,
      price_cents: 5990,
      stock: 25,
    },
    {
      name: 'Café Geisha Especial',
      description: 'Edição limitada, notas florais e de jasmim, processo natural.',
      origin: 'Carmo de Minas, MG',
      roast_level: 'claro',
      weight_grams: 250,
      price_cents: 8990,
      stock: 12,
    },
    {
      name: 'Café Orgânico Descafeinado',
      description: 'Descafeinado por processo de água (Swiss Water), sabor suave.',
      origin: 'Vale do Paraíba, SP',
      roast_level: 'medio',
      weight_grams: 250,
      price_cents: 3790,
      stock: 30,
    },
  ];

  await withTransaction(async (client) => {
    for (const p of products) {
      await client.query(
        `INSERT INTO products
           (public_id, name, description, origin, roast_level, weight_grams, price_cents, stock)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [uuidv4(), p.name, p.description, p.origin, p.roast_level, p.weight_grams, p.price_cents, p.stock]
      );
    }
  });
}

/** Chamado uma vez na subida do servidor (ver server.js). */
async function initDatabase() {
  await initSchema();
  await seedIfEmpty();
}

module.exports = { pool, withTransaction, initDatabase };
