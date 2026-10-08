import {env} from 'cloudflare:workers';
import {actor} from '../../../lib/lab';
import {runReminders} from '../../../lib/email';
export async function POST(req:Request){try{const secret=(env as any).REMINDER_JOB_SECRET;const supplied=req.headers.get('authorization');if(!secret||supplied!==`Bearer ${secret}`){if(req.headers.get('origin')&&req.headers.get('origin')!==new URL(req.url).origin)throw new Error('Invalid origin.');const u=await actor();if(u.role!=='admin')return Response.json({error:'Lecturer access required.'},{status:403});}return Response.json(await runReminders());}catch(e:any){return Response.json({error:e.message},{status:400});}}
