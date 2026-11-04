import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth';
import {
  listPayments, getPayment, createPayment,
  getCustomerOutstanding, getSupplierOutstanding,
} from './payments.controller';

export const paymentsRouter = Router();
paymentsRouter.use(authenticate);

paymentsRouter.get('/outstanding/customers', authorize('payments:view'), getCustomerOutstanding);
paymentsRouter.get('/outstanding/suppliers', authorize('payments:view'), getSupplierOutstanding);
paymentsRouter.get('/',     authorize('payments:view'),   listPayments);
paymentsRouter.get('/:id',  authorize('payments:view'),   getPayment);
paymentsRouter.post('/',    authorize('payments:create'), createPayment);
