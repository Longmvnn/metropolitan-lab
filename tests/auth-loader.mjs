import {registerHooks} from 'node:module';
import {readFileSync,existsSync} from 'node:fs';
import ts from 'typescript';
registerHooks({
 resolve(specifier,context,next){
  if(specifier==='cloudflare:workers')return {url:new URL('./auth-worker.mjs',import.meta.url).href,shortCircuit:true};
  if(specifier==='next/headers')return {url:new URL('./auth-headers.mjs',import.meta.url).href,shortCircuit:true};
  if(specifier.endsWith('/lib/email')||specifier==='./email')return {url:new URL('./auth-mail.mjs',import.meta.url).href,shortCircuit:true};
  if(specifier.startsWith('.')&&context.parentURL){const url=new URL(specifier,context.parentURL);if(!url.pathname.endsWith('.ts')&&existsSync(new URL(url.href+'.ts')))return {url:url.href+'.ts',shortCircuit:true};}
  return next(specifier,context);
 },
 load(url,context,next){if(url.endsWith('.ts'))return {format:'module',source:ts.transpileModule(readFileSync(new URL(url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText,shortCircuit:true};return next(url,context);}
});
