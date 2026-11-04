import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth';
import {
  listCustomers, createCustomer, getCustomer, updateCustomer,
  getCustomerLedger, getCustomerStatement, getWalkinCustomer,
  uploadCustomerDocumentMiddleware, uploadCustomerDocument, exportCustomersExcel
} from './customers.controller';

export const customersRouter = Router();
customersRouter.use(authenticate);

customersRouter.get('/',                    authorize('customers:view'),   listCustomers);
customersRouter.post('/',                   authorize('customers:create'), createCustomer);
customersRouter.post('/upload-document',    authorize('customers:create', 'customers:edit'),
  uploadCustomerDocumentMiddleware, uploadCustomerDocument);
customersRouter.get('/export/excel',        authorize('customers:view'),   exportCustomersExcel);
customersRouter.get('/walk-in',             authorize('customers:view'),   getWalkinCustomer);
customersRouter.get('/:id',                 authorize('customers:view'),   getCustomer);
customersRouter.put('/:id',                 authorize('customers:edit'),   updateCustomer);
customersRouter.get('/:id/ledger',          authorize('customers:view'),   getCustomerLedger);
customersRouter.get('/:id/statement',       authorize('customers:view'),   getCustomerStatement);
