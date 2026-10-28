import { Router } from 'express';
import { statsRouter } from './stats.js';
import { timemarkRouter } from './timemark.js';
import { sprinRouter } from './sprin.js';
import { linksRouter } from './links.js';
import { settingsRouter } from './settings.js';
import { whatsappRouter } from './whatsapp.js';
import { exportsRouter } from './exports.js';
import { reportsRouter } from './reports.js';
import { eventsRouter } from './events.js';

export const apiRouter = Router();

apiRouter.use('/events', eventsRouter);
apiRouter.use(statsRouter);
apiRouter.use('/timemark', timemarkRouter);
apiRouter.use('/sprin', sprinRouter);
apiRouter.use('/links', linksRouter);
apiRouter.use('/settings', settingsRouter);
apiRouter.use('/wa', whatsappRouter);
apiRouter.use('/exports', exportsRouter);
apiRouter.use('/reports', reportsRouter);
