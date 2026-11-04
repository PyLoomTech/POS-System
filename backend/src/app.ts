import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'path';
import { rateLimit } from 'express-rate-limit';

import { errorHandler } from './middleware/errorHandler';
import { authRouter } from './modules/auth/auth.routes';
import { usersRouter } from './modules/users/users.routes';
import { customersRouter } from './modules/customers/customers.routes';
import { suppliersRouter } from './modules/suppliers/suppliers.routes';
import { categoriesRouter } from './modules/categories/categories.routes';
import { itemsRouter } from './modules/items/items.routes';
import { inventoryRouter } from './modules/inventory/inventory.routes';
import { purchasesRouter } from './modules/purchases/purchases.routes';
import { salesRouter } from './modules/sales/sales.routes';
import { returnsRouter } from './modules/returns/returns.routes';
import { paymentsRouter } from './modules/payments/payments.routes';
import { accountingRouter } from './modules/accounting/accounting.routes';
import { reportsRouter } from './modules/reports/reports.routes';
import { settingsRouter } from './modules/settings/settings.routes';
import { dashboardRouter } from './modules/dashboard/dashboard.routes';

// Prisma returns BigInt for large primary keys; teach JSON how to serialize them.
(BigInt.prototype as any).toJSON = function (this: bigint) {
  return this.toString();
};

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Security ────────────────────────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// ─── Rate Limiting ───────────────────────────────────────────
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  message: { error: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(globalLimiter);

// ─── Body Parsing ────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ─── Logging ─────────────────────────────────────────────────
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

// ─── Static Files ────────────────────────────────────────────
const uploadDir = process.env.UPLOAD_DIR || 'D:/Pyloom POS System/uploads';
app.use('/uploads', express.static(uploadDir));

// ─── API Routes ──────────────────────────────────────────────
const API = '/api/v1';

app.use(`${API}/auth`, authRouter);
app.use(`${API}/users`, usersRouter);
app.use(`${API}/customers`, customersRouter);
app.use(`${API}/suppliers`, suppliersRouter);
app.use(`${API}/categories`, categoriesRouter);
app.use(`${API}/items`, itemsRouter);
app.use(`${API}/inventory`, inventoryRouter);
app.use(`${API}/purchases`, purchasesRouter);
app.use(`${API}/sales`, salesRouter);
app.use(`${API}/returns`, returnsRouter);
app.use(`${API}/payments`, paymentsRouter);
app.use(`${API}/accounting`, accountingRouter);
app.use(`${API}/reports`, reportsRouter);
app.use(`${API}/settings`, settingsRouter);
app.use(`${API}/dashboard`, dashboardRouter);

// ─── Health Check ────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'Pyloom POS API',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    timezone: process.env.TIMEZONE || 'Asia/Kathmandu',
    currency: process.env.CURRENCY || 'NPR',
  });
});

// ─── 404 Handler ─────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// ─── Error Handler ────────────────────────────────────────────
app.use(errorHandler);

// ─── Start Server ────────────────────────────────────────────
app.listen(PORT, () => {
  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║     Pyloom POS — Backend API Server     ║');
  console.log('║     Powered by Pyloom Technologies      ║');
  console.log('╠══════════════════════════════════════════╣');
  console.log(`║  Running on: http://localhost:${PORT}        ║`);
  console.log(`║  Environment: ${process.env.NODE_ENV || 'development'}            ║`);
  console.log(`║  Currency: ${process.env.CURRENCY || 'NPR'}                     ║`);
  console.log('╚══════════════════════════════════════════╝\n');
});

export default app;
