import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth';
import {
  getStockLevels, getStockLedger, getLowStockAlerts,
  createAdjustment, approveAdjustment
} from './inventory.controller';

export const inventoryRouter = Router();
inventoryRouter.use(authenticate);
inventoryRouter.get('/stock',          authorize('inventory:view'),   getStockLevels);
inventoryRouter.get('/stock/:itemId/ledger', authorize('inventory:view'), getStockLedger);
inventoryRouter.get('/low-stock',      authorize('inventory:view'),   getLowStockAlerts);
inventoryRouter.post('/adjustments',   authorize('inventory:create'), createAdjustment);
inventoryRouter.post('/adjustments/:id/approve', authorize('inventory:approve'), approveAdjustment);
