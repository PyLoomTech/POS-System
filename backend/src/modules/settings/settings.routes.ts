import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth';
import { getSettings, updateSettings, getCompanySettings, updateCompanySettings } from './settings.controller';

export const settingsRouter = Router();
settingsRouter.use(authenticate);
settingsRouter.get('/company',  getCompanySettings);
settingsRouter.put('/company',  authorize('settings:edit'), updateCompanySettings);
settingsRouter.get('/',         authorize('settings:view'), getSettings);
settingsRouter.put('/',         authorize('settings:edit'), updateSettings);
