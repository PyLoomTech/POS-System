import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth';
import {
  exportReportXlsx, getSalesRegister, getSalesReturnRegister,
  getSalesSummary, getSalesByItem, getSalesByCategory, getSalesByCustomer, getSalesByCashier,
  getPurchaseSummary, getLowStock, getInventoryMovements, getProfitAndLoss, getStockValuation,
  getVatReport, getReceivables, getPayables, getDayBook,
} from './reports.controller';
import { getWorkspaceOptions, getWorkspaceReport } from './workspaceReports.controller';

export const reportsRouter = Router();
reportsRouter.use(authenticate);

reportsRouter.post('/export/xlsx', authorize('reports:view'), exportReportXlsx);
reportsRouter.get('/sales-summary',   authorize('reports:view'), getSalesSummary);
reportsRouter.get('/sales-register', authorize('reports:view'), getSalesRegister);
reportsRouter.get('/sales-by-item',   authorize('reports:view'), getSalesByItem);
reportsRouter.get('/sales-by-category', authorize('reports:view'), getSalesByCategory);
reportsRouter.get('/sales-by-customer', authorize('reports:view'), getSalesByCustomer);
reportsRouter.get('/sales-by-cashier', authorize('reports:view'), getSalesByCashier);
reportsRouter.get('/sales-return-register', authorize('reports:view'), getSalesReturnRegister);
reportsRouter.get('/purchase-summary', authorize('reports:view'), getPurchaseSummary);
reportsRouter.get('/low-stock', authorize('reports:view'), getLowStock);
reportsRouter.get('/inventory-movements', authorize('reports:view'), getInventoryMovements);
reportsRouter.get('/profit-loss',     authorize('reports:view'), getProfitAndLoss);
reportsRouter.get('/stock-valuation', authorize('reports:view'), getStockValuation);
reportsRouter.get('/vat-report',      authorize('reports:view'), getVatReport);
reportsRouter.get('/receivables',     authorize('reports:view'), getReceivables);
reportsRouter.get('/payables',        authorize('reports:view'), getPayables);
reportsRouter.get('/day-book',        authorize('reports:view'), getDayBook);
reportsRouter.get('/workspace/:report', authorize('reports:view'), getWorkspaceReport);
reportsRouter.get('/workspace-options/:type', authorize('reports:view'), getWorkspaceOptions);
