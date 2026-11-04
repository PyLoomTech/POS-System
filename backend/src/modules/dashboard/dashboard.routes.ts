import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { getDashboardStats, getAnalytics } from './dashboard.controller';

export const dashboardRouter = Router();
dashboardRouter.use(authenticate);
dashboardRouter.get('/stats',     getDashboardStats);
dashboardRouter.get('/analytics', getAnalytics);
