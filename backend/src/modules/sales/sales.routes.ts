import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth';
import {
  createSalesInvoice, getSalesInvoice, listSalesInvoices,
  cancelSalesInvoice, getDailySummary
} from './sales.controller';

export const salesRouter = Router();
salesRouter.use(authenticate);
salesRouter.get('/',              authorize('sales:view'),   listSalesInvoices);
salesRouter.post('/',             authorize('sales:create'), createSalesInvoice);
salesRouter.get('/daily-summary', authorize('sales:view'),   getDailySummary);
salesRouter.get('/:id',           authorize('sales:view'),   getSalesInvoice);
salesRouter.post('/:id/cancel',   authorize('sales:cancel'), cancelSalesInvoice);
