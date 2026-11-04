import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../config/database';
import { createError } from '../../middleware/errorHandler';

export async function getCompanySettings(_req: Request, res: Response, next: NextFunction) {
  try {
    const settings = await prisma.companySettings.findFirst();
    return res.json(settings || {});
  } catch (err) { return next(err); }
}

export async function updateCompanySettings(req: Request, res: Response, next: NextFunction) {
  try {
    const existing = await prisma.companySettings.findFirst();
    let settings;
    if (existing) {
      settings = await prisma.companySettings.update({ where: { id: existing.id }, data: req.body });
    } else {
      settings = await prisma.companySettings.create({ data: req.body });
    }
    return res.json(settings);
  } catch (err) { return next(err); }
}

export async function getSettings(_req: Request, res: Response, next: NextFunction) {
  try {
    const settings = await prisma.appSetting.findMany();
    const map: Record<string, string | null> = {};
    for (const s of settings) map[s.key] = s.value;
    return res.json(map);
  } catch (err) { return next(err); }
}

export async function updateSettings(req: Request, res: Response, next: NextFunction) {
  try {
    const updates = req.body as Record<string, string>;
    for (const [key, value] of Object.entries(updates)) {
      await prisma.appSetting.upsert({
        where: { key },
        update: { value },
        create: { key, value },
      });
    }
    return res.json({ message: 'Settings updated.' });
  } catch (err) { return next(err); }
}
