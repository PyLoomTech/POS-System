import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { prisma } from '../../config/database';
import { AuthRequest } from '../../middleware/auth';
import { createError } from '../../middleware/errorHandler';

const loginSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, 'Password must be at least 8 characters'),
});

function generateTokens(userId: number, username: string, roleId: number) {
  const secret = process.env.JWT_SECRET!;
  const accessOptions: jwt.SignOptions = {
    expiresIn: (process.env.JWT_EXPIRES_IN || '8h') as jwt.SignOptions['expiresIn'],
  };
  const refreshOptions: jwt.SignOptions = {
    expiresIn: (process.env.JWT_REFRESH_EXPIRES_IN || '7d') as jwt.SignOptions['expiresIn'],
  };
  const accessToken = jwt.sign({ userId, username, roleId }, secret, accessOptions);
  const refreshToken = jwt.sign({ userId, type: 'refresh' }, secret, refreshOptions);
  return { accessToken, refreshToken };
}

export async function login(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(createError(parsed.error.issues[0].message, 400));
    }
    const { username, password } = parsed.data;

    const user = await prisma.user.findUnique({
      where: { username: username.toLowerCase().trim() },
      include: { role: true },
    });

    // Lock check
    if (user?.lockedUntil && user.lockedUntil > new Date()) {
      const minutesLeft = Math.ceil(
        (user.lockedUntil.getTime() - Date.now()) / 60000
      );
      return next(
        createError(
          `Account is temporarily locked. Try again in ${minutesLeft} minute(s).`,
          423
        )
      );
    }

    if (!user || user.status !== 'active') {
      // Generic message to prevent user enumeration
      return next(createError('Invalid username or password.', 401));
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);

    if (!isValid) {
      const attempts = user.loginAttempts + 1;
      const updates: any = { loginAttempts: attempts };
      if (attempts >= 5) {
        updates.lockedUntil = new Date(Date.now() + 15 * 60 * 1000);
        updates.loginAttempts = 0;
      }
      await prisma.user.update({ where: { id: user.id }, data: updates });
      return next(createError('Invalid username or password.', 401));
    }

    // Reset failed attempts on success
    await prisma.user.update({
      where: { id: user.id },
      data: { loginAttempts: 0, lockedUntil: null, lastLogin: new Date() },
    });

    const { accessToken, refreshToken } = generateTokens(
      user.id,
      user.username,
      user.roleId
    );

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        username: user.username,
        action: 'LOGIN',
        entity: 'users',
        entityId: String(user.id),
        ipAddress: req.ip || null,
      },
    });

    return res.json({
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        username: user.username,
        fullName: user.fullName,
        email: user.email,
        role: {
          id: user.role.id,
          name: user.role.name,
        },
      },
    });
  } catch (err) {
    return next(err);
  }
}

export async function logout(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    if (req.user) {
      await prisma.auditLog.create({
        data: {
          userId: req.user.id,
          username: req.user.username,
          action: 'LOGOUT',
          entity: 'users',
          entityId: String(req.user.id),
          ipAddress: req.ip || null,
        },
      });
    }
    return res.json({ message: 'Logged out successfully.' });
  } catch (err) {
    return next(err);
  }
}

export async function me(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      include: {
        role: {
          include: {
            rolePermissions: {
              include: { permission: true },
            },
          },
        },
      },
    });

    if (!user) return next(createError('User not found.', 404));

    const permissions = user.role.rolePermissions.map(
      (rp) => `${rp.permission.module}:${rp.permission.action}`
    );

    return res.json({
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      email: user.email,
      role: {
        id: user.role.id,
        name: user.role.name,
        isSystem: user.role.isSystem,
      },
      permissions,
    });
  } catch (err) {
    return next(err);
  }
}

export async function changePassword(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const parsed = changePasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(createError(parsed.error.issues[0].message, 400));
    }
    const { currentPassword, newPassword } = parsed.data;

    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user) return next(createError('User not found.', 404));

    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) return next(createError('Current password is incorrect.', 400));

    const hash = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: hash },
    });

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        username: user.username,
        action: 'CHANGE_PASSWORD',
        entity: 'users',
        entityId: String(user.id),
        ipAddress: req.ip || null,
      },
    });

    return res.json({ message: 'Password changed successfully.' });
  } catch (err) {
    return next(err);
  }
}

export async function refreshToken(req: Request, res: Response, next: NextFunction) {
  try {
    const { token } = req.body;
    if (!token) return next(createError('Refresh token required.', 400));

    const secret = process.env.JWT_SECRET!;
    let payload: any;
    try {
      payload = jwt.verify(token, secret);
    } catch {
      return next(createError('Invalid or expired refresh token.', 401));
    }

    if (payload.type !== 'refresh') {
      return next(createError('Invalid token type.', 401));
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      include: { role: true },
    });

    if (!user || user.status !== 'active') {
      return next(createError('Account not found or deactivated.', 401));
    }

    const { accessToken, refreshToken: newRefresh } = generateTokens(
      user.id,
      user.username,
      user.roleId
    );

    return res.json({ accessToken, refreshToken: newRefresh });
  } catch (err) {
    return next(err);
  }
}
