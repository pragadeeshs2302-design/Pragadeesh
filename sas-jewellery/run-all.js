// Starts backend (port 5000) and frontend (port 3000) together
const { spawn } = require('child_process'), path = require('path'), fs = require('fs');
if (!fs.existsSync(path.join(__dirname, 'backend', 'node_modules', 'mongoose'))) {
  console.error('\n  Dependencies are not installed yet. Run this once:\n\n      npm run setup\n\n  then run:  npm start\n');
  process.exit(1);
}
for (const d of ['backend', 'frontend']) {
  const f = d === 'backend' ? 'server.js' : 'serve.js';
  spawn(process.execPath, [f], { cwd: path.join(__dirname, d), stdio: 'inherit' });
}
