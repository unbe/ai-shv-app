import { spawn } from 'child_process';

console.log('[Dev] Starting SHV Backend API on port 3001...');
const backend = spawn('node', ['server/index.js'], { stdio: 'inherit' });

console.log('[Dev] Starting Vite Dev Server on port 3000...');
const vite = spawn('npx', ['vite', '--host', '0.0.0.0', '--port', '3000'], { stdio: 'inherit' });

const shutdown = () => {
  console.log('[Dev] Shutting down servers...');
  backend.kill();
  vite.kill();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
