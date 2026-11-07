import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import fs from 'node:fs';
import path from 'node:path';
import { youtubeSearchHandler } from './server/youtubeSearch.js';

// Same YouTube search endpoint as server.js, so it works under `npm run dev` alone.
function youtubeSearchApi(): Plugin {
  return {
    name: 'youtube-search-api',
    configureServer(server) {
      server.middlewares.use('/api/youtube/search', youtubeSearchHandler);
    },
    configurePreviewServer(server) {
      server.middlewares.use('/api/youtube/search', youtubeSearchHandler);
    }
  };
}

// Dev only: the browser forwards its console here (see src/devLog.ts) and it is
// appended to .devlog/console.log, so errors from any browser can be read from disk.
function devConsoleLog(): Plugin {
  const file = path.resolve(__dirname, '.devlog/console.log');
  return {
    name: 'dev-console-log',
    apply: 'serve',
    configureServer(server) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      server.middlewares.use('/__devlog', (req, res) => {
        let body = '';
        req.on('data', (chunk) => (body += chunk));
        req.on('end', () => {
          fs.appendFileSync(file, body.trim() + '\n');
          res.statusCode = 204;
          res.end();
        });
      });
    }
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), devConsoleLog(), youtubeSearchApi()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true
      }
    }
  }
});
