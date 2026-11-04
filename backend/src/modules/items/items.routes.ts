import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth';
import { listItems, createItem, getItem, updateItem, searchItems, getItemByBarcode,
  uploadItemImage, uploadItemImageMiddleware, listTaxRates } from './items.controller';

export const itemsRouter = Router();
itemsRouter.use(authenticate);
itemsRouter.get('/',             authorize('items:view'),   listItems);
itemsRouter.post('/',            authorize('items:create'), createItem);
itemsRouter.post('/upload-image', authorize('items:create'), uploadItemImageMiddleware, uploadItemImage);
itemsRouter.get('/search',       authorize('items:view'),   searchItems);
itemsRouter.get('/tax-rates',    authorize('items:view'),   listTaxRates);
itemsRouter.get('/barcode/:barcode', authorize('items:view'), getItemByBarcode);
itemsRouter.get('/:id',          authorize('items:view'),   getItem);
itemsRouter.put('/:id',          authorize('items:edit'),   updateItem);
