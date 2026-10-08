// Run under a process supervisor for unattended reminders. Never expose the job secret in browser code.
const base=process.env.LAB_URL,secret=process.env.REMINDER_JOB_SECRET;
if(!base||!secret)throw new Error('Set LAB_URL and REMINDER_JOB_SECRET in the worker environment.');
const url=new URL('/api/reminders',base);if(url.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(url.hostname))throw new Error('Use HTTPS for a hosted platform.');
async function tick(){try{const r=await fetch(url,{method:'POST',headers:{Authorization:`Bearer ${secret}`},signal:AbortSignal.timeout(50000)});if(!r.ok)console.error('Reminder check failed:',r.status);else console.log(new Date().toISOString(),await r.json());}catch{console.error('Reminder service unavailable. Will check again in one minute.');}setTimeout(tick,60000);}await tick();
