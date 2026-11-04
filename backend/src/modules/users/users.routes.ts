import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth';
import {
  listUsers, createUser, getUser, updateUser, deactivateUser, resetPassword, listRoles,
  listPermissions, updateRolePermissions
} from './users.controller';

export const usersRouter = Router();
usersRouter.use(authenticate);

usersRouter.get('/roles',      authorize('users:view'),   listRoles);
usersRouter.put('/roles/:id/permissions', authorize('users:edit'), updateRolePermissions);
usersRouter.get('/permissions', authorize('users:view'),  listPermissions);
usersRouter.get('/',           authorize('users:view'),   listUsers);
usersRouter.post('/',          authorize('users:create'), createUser);
usersRouter.get('/:id',        authorize('users:view'),   getUser);
usersRouter.put('/:id',        authorize('users:edit'),   updateUser);
usersRouter.patch('/:id/deactivate', authorize('users:edit'), deactivateUser);
usersRouter.post('/:id/reset-password', authorize('users:edit'), resetPassword);
