import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth';
import { listCategories, createCategory, updateCategory, listBrands, createBrand, listUnits, createUnit } from './categories.controller';

export const categoriesRouter = Router();
categoriesRouter.use(authenticate);
categoriesRouter.get('/', authorize('items:view'), listCategories);
categoriesRouter.post('/', authorize('items:create'), createCategory);
categoriesRouter.put('/:id', authorize('items:edit'), updateCategory);
categoriesRouter.get('/brands', authorize('items:view'), listBrands);
categoriesRouter.post('/brands', authorize('items:create'), createBrand);
categoriesRouter.get('/units', authorize('items:view'), listUnits);
categoriesRouter.post('/units', authorize('items:create'), createUnit);
