// Cross-platform script runner — used by npm run hola/bye/sync/pr
const { spawnSync } = require('child_process');
const script = process.argv[2];
const isWin  = process.platform === 'win32';
const cmd    = isWin ? 'powershell' : 'bash';
const file   = isWin ? `scripts/${script}.ps1` : `scripts/${script}.sh`;
const args   = isWin ? ['-ExecutionPolicy', 'Bypass', '-File', file] : [file];
const result = spawnSync(cmd, args, { stdio: 'inherit' });
process.exit(result.status ?? 1);
