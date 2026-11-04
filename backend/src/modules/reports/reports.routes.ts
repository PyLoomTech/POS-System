import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth';
import {
  getSalesSummary, getSalesByItem, getSalesByCategory, getProfitAndLoss,
  getStockValuation, getVatReport, getReceivables, getPayables, getDayBook,
} from './reports.controller';

export const reportsRouter = Router();
reportsRouter.use(authenticate);

reportsRouter.get('/sales-summary',   authorize('reports:view'), getSalesSummary);
reportsRouter.get('/sales-by-item',   authorize('reports:view'), getSalesByItem);
reportsRouter.get('/sales-by-category', authorize('reports:view'), getSalesByCategory);
reportsRouter.get('/profit-loss',     authorize('reports:view'), getProfitAndLoss);
reportsRouter.get('/stock-valuation', authorize('reports:view'), getStockValuation);
reportsRouter.get('/vat-report',      authorize('reports:view'), getVatReport);
reportsRouter.get('/receivables',     authorize('reports:view'), getReceivables);
reportsRouter.get('/payables',        authorize('reports:view'), getPayables);
reportsRouter.get('/day-book',        authorize('reports:view'), getDayBook);
