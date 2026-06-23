// Cross-platform script runner — used by npm run hola/bye/sync/pr/nueva-tarea
const { spawnSync } = require('child_process');
const script = process.argv[2];
const extra  = process.argv.slice(3); // args extra (ej: nombre de rama en nueva-tarea)
const isWin  = process.platform === 'win32';
const cmd    = isWin ? 'powershell' : 'bash';
const file   = isWin ? `scripts/${script}.ps1` : `scripts/${script}.sh`;
const base   = isWin ? ['-ExecutionPolicy', 'Bypass', '-File', file] : [file];
const args   = base.concat(extra);
const result = spawnSync(cmd, args, { stdio: 'inherit' });
process.exit(result.status ?? 1);
