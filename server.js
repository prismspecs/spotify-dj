import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { youtubeSearchHandler } from './server/youtubeSearch.js';
import { createDebugLog } from './server/debugLog.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// No CORS: the site and its API share one origin, and other sites
// shouldn't be able to use this server's YouTube search.
app.use(express.json());

// Serve static frontend build if present
app.use(express.static(path.join(__dirname, 'dist')));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

app.get('/api/youtube/search', youtubeSearchHandler);

// Browser debug log, only when DEBUG_LOG_KEY is set (see server/debugLog.js).
const debugLog = createDebugLog();
app.post('/api/log', debugLog.receive);
app.get('/api/log', debugLog.read);

// For any other request in production, return index.html
app.get('*', (req, res) => {
  const indexPath = path.join(__dirname, 'dist', 'index.html');
  res.sendFile(indexPath, (err) => {
    if (err) {
      res.status(200).send('Spotify DJ API Server is running. Start Vite dev server with "npm run dev".');
    }
  });
});

app.listen(PORT, () => {
  console.log(`Spotify DJ server listening on http://localhost:${PORT}`);
  console.log(`Browser debug log: ${process.env.DEBUG_LOG_KEY ? 'on' : 'off (set DEBUG_LOG_KEY to turn it on)'}`);
});
