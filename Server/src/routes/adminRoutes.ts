import { Router } from 'express';
import {
  createAdmin,
  getAdminStats,
  listAdmins,
} from '../controllers/adminController.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { asyncHandler } from '../utils/http.js';

export const adminRouter = Router();

adminRouter.use(authenticate);
adminRouter.get('/stats', requireRole('admin', 'superadmin'), asyncHandler(getAdminStats));
adminRouter.post('/users', requireRole('superadmin'), asyncHandler(createAdmin));
adminRouter.get('/users', requireRole('superadmin'), asyncHandler(listAdmins));
