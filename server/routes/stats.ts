import { Router } from 'express';
import { getDashboardStats } from '../services/stats-service.js';
import { listActivities } from '../services/activity-service.js';

export const statsRouter = Router();

statsRouter.get('/stats', async (_req, res) => {
  res.json(await getDashboardStats());
});

statsRouter.get('/activities', async (req, res) => {
  const limit = Number(req.query.limit ?? 20);
  res.json(await listActivities(Number.isFinite(limit) ? limit : 20));
});
