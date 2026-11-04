import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth';
import { listSuppliers, createSupplier, getSupplier, updateSupplier, getSupplierLedger } from './suppliers.controller';

export const suppliersRouter = Router();
suppliersRouter.use(authenticate);
suppliersRouter.get('/', authorize('suppliers:view'), listSuppliers);
suppliersRouter.post('/', authorize('suppliers:create'), createSupplier);
suppliersRouter.get('/:id', authorize('suppliers:view'), getSupplier);
suppliersRouter.put('/:id', authorize('suppliers:edit'), updateSupplier);
suppliersRouter.get('/:id/ledger', authorize('suppliers:view'), getSupplierLedger);
