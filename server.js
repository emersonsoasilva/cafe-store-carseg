const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const env = require('./src/config/env');
const { initDatabase } = require('./src/config/db');

const { generalApiLimiter } = require('./src/middleware/rateLimiters');
const { errorHandler, notFoundHandler } = require('./src/middleware/errorHandler');
const authRoutes = require('./src/routes/authRoutes');
const productRoutes = require('./src/routes/productRoutes');
const orderRoutes = require('./src/routes/orderRoutes');

const app = express();

// Necessário para que req.ip / express-rate-limit funcionem corretamente
// atrás de um proxy reverso (ex.: Nginx, Render, Heroku) em produção.
app.set('trust proxy', 1);

// --- Cabeçalhos de segurança (OWASP A05 - Security Misconfiguration) ---
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
      },
    },
    crossOriginResourcePolicy: { policy: 'same-site' },
  })
);
// Remove o header "X-Powered-By: Express" (evita divulgar a stack tecnológica).
app.disable('x-powered-by');

// --- CORS restrito a uma origem conhecida, com credenciais (cookies) ---
app.use(
  cors({
    origin: env.corsOrigin,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  })
);

app.use(cookieParser());
// Limite de tamanho do corpo da requisição: mitiga ataques de negação de
// serviço por payloads gigantes.
app.use(express.json({ limit: '100kb' }));

app.use('/api', generalApiLimiter);

app.use('/api/auth', authRoutes);
app.use('/api', productRoutes);
app.use('/api', orderRoutes);

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// Front-end estático de demonstração.
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api', notFoundHandler);
app.use(errorHandler);

async function start() {
  try {
    await initDatabase();
    app.listen(env.port, () => {
      console.log(`Cafe Store rodando em http://localhost:${env.port} (ambiente: ${env.nodeEnv})`);
    });
  } catch (err) {
    console.error('[startup-error] Falha ao inicializar o banco de dados PostgreSQL:', err.message);
    process.exit(1);
  }
}

start();
