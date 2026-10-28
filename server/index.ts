import { createServer } from 'node:http';
import { createApp } from './app.js';
import { config, ensureRuntimeDirectories } from './config.js';
import { logger } from './lib/logger.js';
import { prisma } from './lib/prisma.js';
import { getBotConfig } from './services/settings.js';
import { whatsappManager } from './services/whatsapp-manager.js';
import { rescheduleDailyRecap, stopScheduler } from './services/scheduler-service.js';
import { terminateOcrWorker } from './services/ocr/timemark-ocr.js';

async function main(): Promise<void> {
  ensureRuntimeDirectories();
  await prisma.$queryRaw`SELECT 1`;
  await getBotConfig();

  const app = createApp();
  const server = createServer(app);

  await whatsappManager.initialize();
  await rescheduleDailyRecap();

  server.listen(config.port, '0.0.0.0', () => {
    logger.info(
      {
        port: config.port,
        environment: config.nodeEnv,
        driver: config.waDriver,
        dashboard: config.isProduction ? `http://localhost:${config.port}` : config.appBaseUrl
      },
      'SIGAP API listening'
    );
    console.log(`\n  SIGAP API  →  http://localhost:${config.port}`);
    console.log(`  Health     →  http://localhost:${config.port}/api/health`);
    if (!config.isProduction) console.log(`  Dashboard  →  ${config.appBaseUrl}\n`);
  });

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'Shutting down SIGAP');
    stopScheduler();
    server.close(async () => {
      try {
        await whatsappManager.disconnect(false);
        await terminateOcrWorker();
        await prisma.$disconnect();
      } finally {
        process.exit(0);
      }
    });
    setTimeout(() => process.exit(1), 15_000).unref();
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('unhandledRejection', (reason) => {
    logger.error({ err: reason }, 'Unhandled promise rejection');
  });
  process.on('uncaughtException', (error) => {
    logger.fatal({ err: error }, 'Uncaught exception');
  });
}

main().catch(async (error) => {
  logger.fatal({ err: error }, 'Failed to start SIGAP API');
  await prisma.$disconnect().catch(() => undefined);
  process.exit(1);
});
