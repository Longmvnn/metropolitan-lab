import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const run=(file,args)=>{
 const result=spawnSync(file,args,{cwd:root,stdio:'inherit',env:{...process.env,WRANGLER_SEND_METRICS:'false',WRANGLER_LOG_PATH:resolve(root,'.wrangler/logs')}});
 if(result.error)throw result.error;
 if(result.status!==0)process.exit(result.status??1);
};
// Keep this file valid JSON (a supported subset of JSONC).
const source=JSON.parse(readFileSync(resolve(root,'wrangler.jsonc'),'utf8'));
const database=source.d1_databases?.find(binding=>binding.binding==='DB');
if(!database?.database_id||database.database_id==='00000000-0000-4000-8000-000000000000')throw new Error('Set the production DB binding in wrangler.jsonc before shipping.');
if(!source.r2_buckets?.some(binding=>binding.binding==='BUCKET'&&binding.bucket_name))throw new Error('Set the production BUCKET binding in wrangler.jsonc before shipping.');
run(process.execPath,['./node_modules/typescript/bin/tsc','--noEmit']);
run(process.execPath,['--import','./tests/auth-loader.mjs','--test','tests/auth.test.mjs']);
run(process.execPath,['scripts/run-framework.mjs','build']);
const configPath=resolve(root,'dist/server/wrangler.json');
const generated=JSON.parse(readFileSync(configPath,'utf8'));
// The Vite preview uses placeholder resources. Replace them with the configured
// production resources without deleting required database/storage bindings.
generated.name=source.name;
generated.d1_databases=source.d1_databases.map(binding=>({...binding,migrations_dir:resolve(root,binding.migrations_dir||'drizzle')}));
generated.r2_buckets=source.r2_buckets;
generated.vars={...generated.vars,...source.vars};
writeFileSync(configPath,JSON.stringify(generated,null,2)+'\n');
const wrangler='./node_modules/wrangler/bin/wrangler.js';
if(process.argv.includes('--dry-run')) {
 run(process.execPath,[wrangler,'deploy','--dry-run','--config',configPath]);
} else {
 run(process.execPath,[wrangler,'d1','migrations','apply','DB','--remote','--config',configPath]);
 run(process.execPath,[wrangler,'deploy','--config',configPath]);
}
