import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth';
import {
  createPurchaseInvoice, listPurchaseInvoices, getPurchaseInvoice
} from './purchases.controller';

export const purchasesRouter = Router();
purchasesRouter.use(authenticate);
purchasesRouter.get('/',    authorize('purchases:view'),   listPurchaseInvoices);
purchasesRouter.post('/',   authorize('purchases:create'), createPurchaseInvoice);
purchasesRouter.get('/:id', authorize('purchases:view'),   getPurchaseInvoice);
