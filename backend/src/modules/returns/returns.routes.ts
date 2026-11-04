import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth';
import {
  listSalesReturns, getSalesReturn, createSalesReturn,
  listPurchaseReturns, createPurchaseReturn,
} from './returns.controller';

export const returnsRouter = Router();
returnsRouter.use(authenticate);

returnsRouter.get('/sales',      authorize('returns:view'), listSalesReturns);
returnsRouter.get('/sales/:id',  authorize('returns:view'), getSalesReturn);
returnsRouter.post('/sales',     authorize('returns:create', 'sales:return'), createSalesReturn);

returnsRouter.get('/purchases',  authorize('returns:view'), listPurchaseReturns);
returnsRouter.post('/purchases', authorize('returns:create'), createPurchaseReturn);
