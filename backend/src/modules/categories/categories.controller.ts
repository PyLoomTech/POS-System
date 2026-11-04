import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/database';
import { createError } from '../../middleware/errorHandler';

export async function listCategories(_req: Request, res: Response, next: NextFunction) {
  try {
    const cats = await prisma.category.findMany({ orderBy: { name: 'asc' }, include: { children: true } });
    return res.json(cats);
  } catch (err) { return next(err); }
}

export async function createCategory(req: Request, res: Response, next: NextFunction) {
  try {
    const { name, parentId } = z.object({ name: z.string().min(1), parentId: z.number().optional() }).parse(req.body);
    const cat = await prisma.category.create({ data: { name, parentId: parentId || null } });
    return res.status(201).json(cat);
  } catch (err) { return next(err); }
}

export async function updateCategory(req: Request, res: Response, next: NextFunction) {
  try {
    const id = Number(req.params.id);
    const { name, isActive } = req.body;
    const cat = await prisma.category.update({ where: { id }, data: { name, isActive } });
    return res.json(cat);
  } catch (err) { return next(err); }
}

export async function listBrands(_req: Request, res: Response, next: NextFunction) {
  try {
    return res.json(await prisma.brand.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } }));
  } catch (err) { return next(err); }
}

export async function createBrand(req: Request, res: Response, next: NextFunction) {
  try {
    const { name } = z.object({ name: z.string().min(1) }).parse(req.body);
    return res.status(201).json(await prisma.brand.create({ data: { name } }));
  } catch (err) { return next(err); }
}

export async function listUnits(_req: Request, res: Response, next: NextFunction) {
  try {
    return res.json(await prisma.unit.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } }));
  } catch (err) { return next(err); }
}

export async function createUnit(req: Request, res: Response, next: NextFunction) {
  try {
    const { name, abbreviation } = z.object({ name: z.string().min(1), abbreviation: z.string().optional() }).parse(req.body);
    return res.status(201).json(await prisma.unit.create({ data: { name, abbreviation } }));
  } catch (err) { return next(err); }
}
