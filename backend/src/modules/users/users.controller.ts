import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../../config/database';
import { createError } from '../../middleware/errorHandler';
import { AuthRequest } from '../../middleware/auth';

const createUserSchema = z.object({
  username: z.string().min(3).max(50).toLowerCase().trim(),
  fullName: z.string().min(2).max(255),
  email: z.string().email().optional().nullable(),
  password: z.string().min(8),
  roleId: z.number().int().positive(),
});

const updateUserSchema = z.object({
  fullName: z.string().min(2).max(255).optional(),
  email: z.string().email().optional().nullable(),
  roleId: z.number().int().positive().optional(),
  status: z.enum(['active', 'inactive']).optional(),
});

export async function listUsers(_req: Request, res: Response, next: NextFunction) {
  try {
    const users = await prisma.user.findMany({
      include: { role: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return res.json(users.map(u => ({
      id: u.id, username: u.username, fullName: u.fullName,
      email: u.email, status: u.status, role: u.role,
      lastLogin: u.lastLogin, createdAt: u.createdAt,
    })));
  } catch (err) { return next(err); }
}

export async function createUser(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const parsed = createUserSchema.safeParse(req.body);
    if (!parsed.success) return next(createError(parsed.error.issues[0].message, 400));
    const data = parsed.data;

    const exists = await prisma.user.findUnique({ where: { username: data.username } });
    if (exists) return next(createError('Username already taken.', 409));

    const hash = await bcrypt.hash(data.password, 12);
    const user = await prisma.user.create({
      data: {
        username: data.username,
        fullName: data.fullName,
        email: data.email || null,
        passwordHash: hash,
        roleId: data.roleId,
        createdBy: req.user?.id,
      },
      include: { role: { select: { id: true, name: true } } },
    });

    await prisma.auditLog.create({
      data: { userId: req.user?.id, username: req.user?.username, action: 'CREATE_USER',
        entity: 'users', entityId: String(user.id),
        newValues: { username: user.username, roleId: user.roleId } },
    });

    return res.status(201).json({
      id: user.id, username: user.username, fullName: user.fullName,
      email: user.email, status: user.status, role: user.role,
    });
  } catch (err) { return next(err); }
}

export async function getUser(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: Number(req.params.id) },
      include: { role: { select: { id: true, name: true } } },
    });
    if (!user) return next(createError('User not found.', 404));
    return res.json({
      id: user.id, username: user.username, fullName: user.fullName,
      email: user.email, status: user.status, role: user.role,
      lastLogin: user.lastLogin, createdAt: user.createdAt,
    });
  } catch (err) { return next(err); }
}

export async function updateUser(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const id = Number(req.params.id);
    const parsed = updateUserSchema.safeParse(req.body);
    if (!parsed.success) return next(createError(parsed.error.issues[0].message, 400));

    const old = await prisma.user.findUnique({ where: { id } });
    if (!old) return next(createError('User not found.', 404));

    const user = await prisma.user.update({ where: { id }, data: parsed.data,
      include: { role: { select: { id: true, name: true } } } });

    await prisma.auditLog.create({
      data: { userId: req.user?.id, username: req.user?.username, action: 'UPDATE_USER',
        entity: 'users', entityId: String(id),
        oldValues: { fullName: old.fullName, roleId: old.roleId, status: old.status },
        newValues: parsed.data },
    });

    return res.json({ id: user.id, username: user.username, fullName: user.fullName,
      email: user.email, status: user.status, role: user.role });
  } catch (err) { return next(err); }
}

export async function deactivateUser(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const id = Number(req.params.id);
    if (id === req.user?.id) return next(createError('Cannot deactivate your own account.', 400));
    await prisma.user.update({ where: { id }, data: { status: 'inactive' } });
    await prisma.auditLog.create({
      data: { userId: req.user?.id, username: req.user?.username, action: 'DEACTIVATE_USER',
        entity: 'users', entityId: String(id) },
    });
    return res.json({ message: 'User deactivated successfully.' });
  } catch (err) { return next(err); }
}

export async function resetPassword(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const id = Number(req.params.id);
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 8)
      return next(createError('New password must be at least 8 characters.', 400));

    const hash = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({ where: { id }, data: { passwordHash: hash, loginAttempts: 0, lockedUntil: null } });

    await prisma.auditLog.create({
      data: { userId: req.user?.id, username: req.user?.username, action: 'RESET_PASSWORD',
        entity: 'users', entityId: String(id) },
    });
    return res.json({ message: 'Password reset successfully.' });
  } catch (err) { return next(err); }
}

export async function listRoles(_req: Request, res: Response, next: NextFunction) {
  try {
    const roles = await prisma.role.findMany({
      orderBy: { name: 'asc' },
      include: { rolePermissions: { include: { permission: true } } },
    });
    return res.json(roles.map(r => ({
      id: r.id,
      name: r.name,
      description: r.description,
      isSystem: r.isSystem,
      permissions: r.rolePermissions.map(rp => `${rp.permission.module}:${rp.permission.action}`),
    })));
  } catch (err) { return next(err); }
}

export async function listPermissions(_req: Request, res: Response, next: NextFunction) {
  try {
    const permissions = await prisma.permission.findMany({
      orderBy: [{ module: 'asc' }, { action: 'asc' }],
    });
    return res.json(permissions.map(p => ({ id: p.id, module: p.module, action: p.action })));
  } catch (err) { return next(err); }
}

const rolePermissionsSchema = z.object({
  permissions: z.array(z.string().min(1).max(100)).max(300),
});

export async function updateRolePermissions(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const roleId = Number(req.params.id);
    const parsed = rolePermissionsSchema.safeParse(req.body);
    if (!parsed.success) return next(createError(parsed.error.issues[0].message, 400));

    const role = await prisma.role.findUnique({ where: { id: roleId } });
    if (!role) return next(createError('Role not found.', 404));
    if (role.name === 'Super Administrator') {
      return next(createError('Super Administrator always has every permission and cannot be edited.', 400));
    }

    const permissions = await prisma.permission.findMany();
    const idByKey = new Map(permissions.map(p => [`${p.module}:${p.action}`, p.id]));

    const unknown = parsed.data.permissions.filter(key => !idByKey.has(key));
    if (unknown.length) return next(createError(`Unknown permission(s): ${unknown.join(', ')}`, 400));

    const permissionIds = parsed.data.permissions.map(key => idByKey.get(key)!);

    await prisma.$transaction([
      prisma.rolePermission.deleteMany({ where: { roleId } }),
      ...(permissionIds.length
        ? [prisma.rolePermission.createMany({
            data: permissionIds.map(permissionId => ({ roleId, permissionId })),
            skipDuplicates: true,
          })]
        : []),
    ]);

    await prisma.auditLog.create({
      data: {
        userId: req.user?.id, username: req.user?.username,
        action: 'UPDATE_ROLE_PERMISSIONS', entity: 'roles', entityId: String(roleId),
        newValues: { role: role.name, permissions: parsed.data.permissions },
      },
    });

    return res.json({ id: role.id, name: role.name, permissions: parsed.data.permissions });
  } catch (err) { return next(err); }
}
