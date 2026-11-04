import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth';
import {
  listAccounts, createAccount, updateAccount, getAccountLedger,
  listJournalEntries, createJournalEntry, getTrialBalance,
  listFiscalPeriods, createFiscalPeriod, closeFiscalPeriod,
} from './accounting.controller';

export const accountingRouter = Router();
accountingRouter.use(authenticate);

accountingRouter.get('/accounts',          authorize('accounting:view'), listAccounts);
accountingRouter.post('/accounts',         authorize('accounting:post'), createAccount);
accountingRouter.put('/accounts/:id',      authorize('accounting:post'), updateAccount);
accountingRouter.get('/accounts/:id/ledger', authorize('accounting:view'), getAccountLedger);

accountingRouter.get('/journal',           authorize('accounting:view'), listJournalEntries);
accountingRouter.post('/journal',          authorize('accounting:journal', 'accounting:post'), createJournalEntry);

accountingRouter.get('/trial-balance',     authorize('accounting:view'), getTrialBalance);

accountingRouter.get('/fiscal-periods',    authorize('accounting:view'), listFiscalPeriods);
accountingRouter.post('/fiscal-periods',   authorize('accounting:post'), createFiscalPeriod);
accountingRouter.post('/fiscal-periods/:id/close', authorize('accounting:post'), closeFiscalPeriod);
