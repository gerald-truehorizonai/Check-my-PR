import { mkdir, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
await mkdir('artifacts',{recursive:true});
await rm('artifacts/check-my-pr-extension.zip',{force:true});
const result=spawnSync('zip',['-qr','../artifacts/check-my-pr-extension.zip','.'],{cwd:'extension',stdio:'inherit'});
if(result.status!==0)process.exit(result.status||1);
console.log('Load unpacked: extension/');console.log('Packaged: artifacts/check-my-pr-extension.zip');
