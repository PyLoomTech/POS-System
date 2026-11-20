import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth';
import {
  getSettings,
  updateSettings,
  getCompanySettings,
  getCompanySettingOptions,
  updateCompanySettings,
  uploadCompanyAsset,
  uploadCompanyAssetMiddleware,
  validateCompanyAsset,
  listPrintTemplates,
  getPrintTemplate,
  createPrintTemplate,
  updatePrintTemplate,
  publishPrintTemplate,
  deletePrintTemplate,
  restorePrintTemplateVersion,
  previewPrintTemplate,
} from './settings.controller';

export const settingsRouter = Router();
settingsRouter.use(authenticate);
settingsRouter.get('/company',  getCompanySettings);
settingsRouter.get('/company/options', authorize('settings:view'), getCompanySettingOptions);
settingsRouter.put('/company',  authorize('settings:edit'), updateCompanySettings);
settingsRouter.post(
  '/company/assets/:asset',
  authorize('settings:edit'),
  validateCompanyAsset,
  uploadCompanyAssetMiddleware,
  uploadCompanyAsset,
);
settingsRouter.get('/print-templates', authorize('settings:view'), listPrintTemplates);
settingsRouter.post('/print-templates', authorize('settings:edit'), createPrintTemplate);
settingsRouter.get('/print-templates/:id/preview', authorize('settings:view'), previewPrintTemplate);
settingsRouter.get('/print-templates/:id', authorize('settings:view'), getPrintTemplate);
settingsRouter.put('/print-templates/:id', authorize('settings:edit'), updatePrintTemplate);
settingsRouter.post('/print-templates/:id/publish', authorize('settings:edit'), publishPrintTemplate);
settingsRouter.post('/print-templates/:id/restore', authorize('settings:edit'), restorePrintTemplateVersion);
settingsRouter.delete('/print-templates/:id', authorize('settings:edit'), deletePrintTemplate);
settingsRouter.get('/',         authorize('settings:view'), getSettings);
settingsRouter.put('/',         authorize('settings:edit'), updateSettings);
