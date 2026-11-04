import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { login, logout, me, changePassword, refreshToken } from './auth.controller';
import { authenticate } from '../../middleware/auth';

export const authRouter = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many login attempts. Please wait 15 minutes.' },
});

authRouter.post('/login', authLimiter, login);
authRouter.post('/logout', authenticate, logout);
authRouter.get('/me', authenticate, me);
authRouter.post('/change-password', authenticate, changePassword);
authRouter.post('/refresh', refreshToken);
