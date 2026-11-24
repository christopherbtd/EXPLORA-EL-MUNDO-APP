/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import 'dotenv/config';
import express from 'express';
import type { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  getCountryByCode,
  getCountrySuggestions,
  searchCountries,
} from './server/countriesService.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;

async function startServer() {
  const app = express();
  app.use(express.json());

  // API: Autocomplete suggestions
  app.get('/api/countries/suggest', async (req: Request, res: Response) => {
    try {
      const query = typeof req.query.q === 'string' ? req.query.q : '';
      const limitParam = typeof req.query.limit === 'string' ? Number(req.query.limit) : 8;
      const limit = Number.isFinite(limitParam) ? limitParam : 8;

      if (!query.trim()) {
        res.json({ query: '', suggestions: [] });
        return;
      }

      const suggestions = await getCountrySuggestions(query, limit);
      res.json({ query, suggestions });
    } catch (error) {
      console.error('Error fetching country suggestions:', error);
      res.status(503).json({
        error: 'No se pudo conectar con el servicio de países. Inténtalo nuevamente.',
      });
    }
  });

  // API: Full search
  app.get('/api/countries/search', async (req: Request, res: Response) => {
    try {
      const query = typeof req.query.q === 'string' ? req.query.q : '';
      if (!query.trim()) {
        res.json({ query: '', results: [], total: 0 });
        return;
      }

      const results = await searchCountries(query);
      res.json({ query, results, total: results.length });
    } catch (error) {
      console.error('Error searching countries:', error);
      res.status(503).json({
        error: 'No se pudo conectar con el servicio de países. Verifica tu conexión e inténtalo nuevamente.',
      });
    }
  });

  // API: Single country by ISO code (cca3 or cca2)
  app.get('/api/countries/:code', async (req: Request, res: Response) => {
    try {
      const code = typeof req.params.code === 'string' ? req.params.code : '';
      const country = await getCountryByCode(code);
      if (!country) {
        res.status(404).json({ error: 'País no encontrado.' });
        return;
      }
      res.json({ country });
    } catch (error) {
      console.error('Error fetching country by code:', error);
      res.status(503).json({
        error: 'No se pudo conectar con el servicio de países. Inténtalo nuevamente.',
      });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      const indexPath = path.join(distDir, 'index.html');
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(404).send('Not found');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Explora el Mundo server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
