import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../config/database';
import { createError } from './errorHandler';

export interface AuthRequest extends Request {
  user?: {
    id: number;
    username: string;
    roleId: number;
    roleName: string;
  };
}

export async function authenticate(
  req: AuthRequest,
  _res: Response,
  next: NextFunction
) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return next(createError('No token provided. Please login.', 401));
    }

    const token = authHeader.substring(7);
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error('JWT_SECRET not configured');

    let payload: any;
    try {
      payload = jwt.verify(token, secret);
    } catch {
      return next(createError('Invalid or expired token. Please login again.', 401));
    }

    // Verify user still exists and is active
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      include: { role: true },
    });

    if (!user || user.status !== 'active') {
      return next(createError('Account not found or deactivated.', 401));
    }

    req.user = {
      id: user.id,
      username: user.username,
      roleId: user.roleId,
      roleName: user.role.name,
    };

    return next();
  } catch (err) {
    return next(err);
  }
}

export function authorize(...permissionStrings: string[]) {
  return async (req: AuthRequest, _res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return next(createError('Authentication required.', 401));
      }

      // Super Administrator bypasses all permission checks
      if (req.user.roleName === 'Super Administrator') {
        return next();
      }

      if (permissionStrings.length === 0) return next();

      // Check if user's role has ANY of the required permissions
      const role = await prisma.role.findUnique({
        where: { id: req.user.roleId },
        include: {
          rolePermissions: {
            include: { permission: true },
          },
        },
      });

      if (!role) return next(createError('Role not found.', 403));

      const userPermissions = role.rolePermissions.map(
        (rp) => `${rp.permission.module}:${rp.permission.action}`
      );

      const hasPermission = permissionStrings.some((p) =>
        userPermissions.includes(p)
      );

      if (!hasPermission) {
        return next(
          createError(
            `Access denied. Required permissions: ${permissionStrings.join(' or ')}`,
            403
          )
        );
      }

      return next();
    } catch (err) {
      return next(err);
    }
  };
}
