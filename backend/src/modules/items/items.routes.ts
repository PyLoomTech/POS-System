import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth';
import { confirmItemImport, getItemImport, previewItemImport, uploadItemImportFile } from './itemImport.controller';
import { listItems, createItem, getItem, updateItem, searchItems, getItemByBarcode,
  uploadItemImage, uploadItemImageMiddleware, listTaxRates, listPriceLists, createPriceList } from './items.controller';

export const itemsRouter = Router();
itemsRouter.use(authenticate);
itemsRouter.post('/import/preview', authorize('items:create'), uploadItemImportFile, previewItemImport);
itemsRouter.post('/import/confirm', authorize('items:create'), confirmItemImport);
itemsRouter.get('/import/:batchId', authorize('items:view'), getItemImport);
itemsRouter.get('/',             authorize('items:view'),   listItems);
itemsRouter.post('/',            authorize('items:create'), createItem);
itemsRouter.post('/upload-image', authorize('items:create'), uploadItemImageMiddleware, uploadItemImage);
itemsRouter.get('/search',       authorize('items:view'),   searchItems);
itemsRouter.get('/tax-rates',    authorize('items:view'),   listTaxRates);
itemsRouter.get('/price-lists',  authorize('items:view'),   listPriceLists);
itemsRouter.post('/price-lists', authorize('items:create'), createPriceList);
itemsRouter.get('/barcode/:barcode', authorize('items:view'), getItemByBarcode);
itemsRouter.get('/:id',          authorize('items:view'),   getItem);
itemsRouter.put('/:id',          authorize('items:edit'),   updateItem);
