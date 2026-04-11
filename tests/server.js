/**
 * Simple static file server for testing
 * Serves the repo root so tests can access /src and /examples
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

// MIME types with charset for text types
const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

/**
 * Create and start test server
 * @param {number} port - Port to listen on
 * @returns {Promise<http.Server>} Server instance
 */
export function createServer(port = 8765) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      // Remove query string
      let filePath = req.url.split('?')[0];
      
      // Default to index.html for directory requests
      if (filePath === '/') {
        filePath = '/index.html';
      }
      
      // Resolve to file system path
      const fullPath = path.join(rootDir, filePath);
      
      // Security check: ensure path is within rootDir
      const resolvedPath = path.resolve(fullPath);
      const resolvedRoot = path.resolve(rootDir);
      if (!resolvedPath.startsWith(resolvedRoot)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }
      
      // Check if file exists
      fs.stat(resolvedPath, (err, stats) => {
        if (err || !stats.isFile()) {
          res.writeHead(404);
          res.end('Not Found');
          return;
        }
        
        // Determine content type
        const ext = path.extname(resolvedPath).toLowerCase();
        const contentType = mimeTypes[ext] || 'application/octet-stream';
        
        // Read and serve file
        fs.readFile(resolvedPath, (err, data) => {
          if (err) {
            res.writeHead(500);
            res.end('Internal Server Error');
            return;
          }
          
          res.writeHead(200, {
            'Content-Type': contentType,
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
            'Pragma': 'no-cache',
            'Expires': '0'
          });
          res.end(data);
        });
      });
    });
    
    server.listen(port, () => {
      console.log(`[TestServer] Listening on http://localhost:${port}`);
      resolve(server);
    });
    
    server.on('error', reject);
  });
}

/**
 * Stop server gracefully
 * @param {http.Server} server - Server instance
 */
export function stopServer(server) {
  return new Promise((resolve) => {
    server.close(() => {
      console.log('[TestServer] Stopped');
      resolve();
    });
  });
}

// If run directly (not imported), start server
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = process.argv[2] ? parseInt(process.argv[2]) : 8765;
  createServer(port).catch(err => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
}
