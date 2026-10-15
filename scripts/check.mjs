import { readFile, readdir, access } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
const manifest=JSON.parse(await readFile('extension/manifest.json','utf8'));
if(manifest.manifest_version!==3)throw new Error('Expected Manifest V3');
const entries=[manifest.side_panel.default_path,manifest.background.service_worker,...manifest.content_scripts.flatMap(s=>s.js),...Object.values(manifest.icons||{})];
for(const file of entries)await access(path.join('extension',file));
async function checkJS(dir){for(const item of await readdir(dir,{withFileTypes:true})){const file=path.join(dir,item.name);if(item.isDirectory())await checkJS(file);else if(file.endsWith('.js')||file.endsWith('.mjs')){const result=spawnSync(process.execPath,['--check',file],{stdio:'inherit'});if(result.status!==0)process.exit(result.status||1);}}}
await checkJS('extension');await checkJS('scripts');
const html=await readFile('extension/sidepanel.html','utf8');
if(/<script[^>]*>\s*[^<\s]/i.test(html)||/\son(?:click|load|submit)=/i.test(html))throw new Error('Inline script is incompatible with extension CSP');
console.log('Manifest, referenced assets, JavaScript syntax, and extension CSP checks passed.');
