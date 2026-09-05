import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';
import {defineConfig, Plugin} from 'vite';

function dbConfigPlugin(): Plugin {
  return {
    name: 'pams-db-config-api',
    configureServer(server) {
      server.middlewares.use('/api/db-config', (req, res, next) => {
        if (req.method === 'GET') {
          try {
            const rootPath = path.resolve(process.cwd(), 'db_config.json');
            if (fs.existsSync(rootPath)) {
              const data = fs.readFileSync(rootPath, 'utf-8');
              res.setHeader('Content-Type', 'application/json');
              return res.end(data);
            }
          } catch (_) {}
          res.setHeader('Content-Type', 'application/json');
          return res.end(JSON.stringify({ syncStatus: 'Disconnected', gasUrl: '' }));
        }

        if (req.method === 'POST') {
          let body = '';
          req.on('data', chunk => {
            body += chunk;
          });
          req.on('end', () => {
            try {
              const parsed = JSON.parse(body);
              const rootPath = path.resolve(process.cwd(), 'db_config.json');
              const publicPath = path.resolve(process.cwd(), 'public/db_config.json');
              fs.writeFileSync(rootPath, JSON.stringify(parsed, null, 2), 'utf-8');
              fs.writeFileSync(publicPath, JSON.stringify(parsed, null, 2), 'utf-8');
              res.setHeader('Content-Type', 'application/json');
              return res.end(JSON.stringify({ success: true, config: parsed }));
            } catch (err: any) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              return res.end(JSON.stringify({ success: false, error: err.message || String(err) }));
            }
          });
          return;
        }

        next();
      });
    }
  };
}

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), dbConfigPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
