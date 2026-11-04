import { Request, Response, NextFunction } from 'express';

export interface AppError extends Error {
  statusCode?: number;
  code?: string;
}

export function errorHandler(
  err: AppError,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  const status = err.statusCode || 500;
  const message = err.message || 'Internal Server Error';

  // Prisma errors
  if (err.code === 'P2002') {
    return res.status(409).json({
      error: 'A record with this value already exists.',
      code: 'DUPLICATE',
    });
  }
  if (err.code === 'P2025') {
    return res.status(404).json({
      error: 'Record not found.',
      code: 'NOT_FOUND',
    });
  }
  if (err.code === 'P2003') {
    return res.status(400).json({
      error: 'Foreign key constraint violation.',
      code: 'CONSTRAINT_VIOLATION',
    });
  }

  if (process.env.NODE_ENV === 'development') {
    console.error('ERROR:', err);
  }

  return res.status(status).json({
    error: message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
}

export function createError(message: string, statusCode = 400): AppError {
  const err: AppError = new Error(message);
  err.statusCode = statusCode;
  return err;
}
