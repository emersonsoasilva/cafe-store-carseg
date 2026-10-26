// Carrega e valida as variáveis de ambiente uma única vez.
// Falhar rápido (fail fast) se segredos obrigatórios não existirem evita rodar
// o sistema em um estado inseguro (OWASP A05 - Security Misconfiguration).
require('dotenv').config();

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Variável de ambiente obrigatória ausente: ${name}`);
  }
  return value;
}

const env = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  jwtSecret: required('JWT_SECRET'),
  fieldEncryptionKey: required('FIELD_ENCRYPTION_KEY'),
  cookieSecure: process.env.COOKIE_SECURE === 'true',

  // --- PostgreSQL ---
  // DATABASE_URL tem prioridade; caso ausente, cai para as variáveis PG* padrão
  // (as mesmas reconhecidas nativamente pelas ferramentas de linha de comando
  // do Postgres, como psql), o que facilita rodar local vs. em provedores
  // gerenciados (Render, RDS, Supabase, Neon etc.).
  databaseUrl: process.env.DATABASE_URL || null,
  pgHost: process.env.PGHOST || 'localhost',
  pgPort: parseInt(process.env.PGPORT || '5432', 10),
  pgDatabase: process.env.PGDATABASE || 'cafestore',
  pgUser: process.env.PGUSER || 'cafestore_app',
  pgPassword: process.env.PGPASSWORD || '',
  pgSslEnabled: process.env.PGSSLMODE === 'require' || process.env.PGSSLMODE === 'true',
  pgPoolMax: parseInt(process.env.PG_POOL_MAX || '10', 10),
};

if (!env.databaseUrl && !process.env.PGPASSWORD) {
  throw new Error(
    'Configuração de banco ausente: defina DATABASE_URL ou PGPASSWORD (+ demais variáveis PG*) no .env.'
  );
}

if (env.jwtSecret.length < 32) {
  throw new Error('JWT_SECRET muito curto. Use pelo menos 32 caracteres aleatórios.');
}

if (!/^[0-9a-fA-F]{64}$/.test(env.fieldEncryptionKey)) {
  throw new Error('FIELD_ENCRYPTION_KEY deve ser uma string hex de 64 caracteres (32 bytes).');
}

module.exports = env;
