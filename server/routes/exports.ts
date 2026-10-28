import { Router } from 'express';
import { format } from 'date-fns';
import {
  buildDailyXlsx,
  buildWaText,
  getDailyBundle,
  linksCsv,
  sprinCsv,
  timemarkCsv,
  turjawaliCsv
} from '../services/export-service.js';

export const exportsRouter = Router();

function dateParam(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function disposition(filename: string): string {
  return `attachment; filename="${filename.replace(/[^\w.\-]/g, '_')}"`;
}

exportsRouter.get('/daily.xlsx', async (req, res) => {
  const bundle = await getDailyBundle(dateParam(req.query.date));
  const buffer = await buildDailyXlsx(bundle);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', disposition(`SIGAP-Rekap-${bundle.date}.xlsx`));
  res.send(buffer);
});

exportsRouter.get('/daily.txt', async (req, res) => {
  const bundle = await getDailyBundle(dateParam(req.query.date));
  const text = buildWaText(bundle);
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Content-Disposition', disposition(`SIGAP-Rekap-WA-${bundle.date}.txt`));
  res.send(text);
});

exportsRouter.get('/links.csv', async (req, res) => {
  const bundle = await getDailyBundle(dateParam(req.query.date));
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', disposition(`SIGAP-Link-${bundle.date}.csv`));
  res.send(`\uFEFF${linksCsv(bundle.links)}`);
});

exportsRouter.get('/timemark.csv', async (req, res) => {
  const bundle = await getDailyBundle(dateParam(req.query.date));
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', disposition(`SIGAP-Timemark-${bundle.date}.csv`));
  res.send(`\uFEFF${timemarkCsv(bundle.timemarks)}`);
});

exportsRouter.get('/sprin.csv', async (req, res) => {
  const bundle = await getDailyBundle(dateParam(req.query.date));
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', disposition(`SIGAP-Personel-Sprin-${bundle.date}.csv`));
  res.send(`\uFEFF${sprinCsv(bundle)}`);
});

exportsRouter.get('/turjawali.csv', async (req, res) => {
  const bundle = await getDailyBundle(dateParam(req.query.date));
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', disposition(`SIGAP-Turjawali-${bundle.date}.csv`));
  res.send(`\uFEFF${turjawaliCsv(bundle.turjawali)}`);
});

exportsRouter.get('/filename', async (req, res) => {
  const bundle = await getDailyBundle(dateParam(req.query.date));
  res.json({
    date: bundle.date,
    label: format(new Date(`${bundle.date}T12:00:00`), 'dd-MM-yyyy'),
    counts: bundle.counts
  });
});
