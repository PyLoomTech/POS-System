import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth';
import { closeShift, getCurrentShift, listShifts, openShift } from './shifts.controller';

export const shiftsRouter = Router();
shiftsRouter.use(authenticate);
shiftsRouter.get('/current', authorize('shifts:view'), getCurrentShift);
shiftsRouter.post('/', authorize('shifts:open'), openShift);
shiftsRouter.get('/', authorize('shifts:view'), listShifts);
shiftsRouter.post('/:id/close', authorize('shifts:close'), closeShift);
