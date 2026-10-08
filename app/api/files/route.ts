import {writableSemester,assertTargetWritable,enrolled,recordCourse} from '../../../lib/academic';
import {validateShapefileZip} from '../../../lib/resources';
import {actor,all,get,put,uid,now,bucket,fileShared,log} from '../../../lib/lab';
const ext=(name:string)=>name.toLowerCase().split('.').pop()||'';
const DOCS=['pdf','docx','doc'],IMAGES=['jpg','jpeg','png','webp'],MAPS=[...IMAGES,'tif','tiff','zip'];
const MATERIALS=['pdf','docx','doc','pptx','ppt','xlsx','csv',...IMAGES,'zip'];
const letterTypes=['Absence/excuse letter','Apology letter','Extension request','Other'];
function allow(files:File[],types:string[],label:string){for(const f of files)if(!types.includes(ext(f.name)))throw new Error(`${f.name}: ${label} must be ${types.map(t=>t.toUpperCase()).join(', ')}.`);}
// Map and studio briefs (and the older map/studio types) also accept images and ZIP packages.
const submissionTypes=(a:any)=>a.accept==='documents-images-zip'||['Maps / images','Studio package'].includes(a.type)?[...DOCS,...MAPS]:DOCS;
export async function GET(req:Request){try{const u=await actor(),params=new URL(req.url).searchParams,records=await all();
 const avatar=params.get('avatar');if(avatar){const peers=records.some((g:any)=>g.kind==='group'&&(g.members||[]).includes(u.id)&&(g.members||[]).includes(avatar));if(u.role!=='admin'&&avatar!==u.id&&!peers)return new Response('Access denied',{status:403});const obj=await bucket().get('avatars/'+avatar);if(!obj)return new Response('Not found',{status:404});return new Response(obj.body,{headers:{'Content-Type':'image/jpeg','Cache-Control':'private, max-age=300','X-Content-Type-Options':'nosniff'}});}
 const id=params.get('id')||'',r=await get(id);if(!r||r.kind!=='file')return new Response('Access denied',{status:403});const course=recordCourse(r,records);if(u.role!=='admin'&&course&&!enrolled(records,u.id,r.semester,course))return new Response('Access denied',{status:403});if(!fileShared(r,u,records))return new Response('Access denied',{status:403});const obj=await bucket().get(r.key);if(!obj)return new Response('File not found',{status:404});return new Response(obj.body,{headers:{'Content-Type':'application/octet-stream','Content-Disposition':`attachment; filename="${r.filename.replace(/[^a-zA-Z0-9._-]/g,'_')}"`,'X-Content-Type-Options':'nosniff','Cache-Control':'private, no-store'}});}catch{return new Response('File unavailable',{status:503});}}
async function store(files:File[],meta:any){const ids:string[]=[];for(const file of files){const fid=uid(),key='files/'+fid;await bucket().put(key,await file.arrayBuffer(),{httpMetadata:{contentType:'application/octet-stream'}});await put('file',fid,{...meta,filename:file.name,key,size:file.size,uploaded:now()});ids.push(fid);}return ids;}
export async function POST(req:Request){try{
 if(req.headers.get('origin')&&req.headers.get('origin')!==new URL(req.url).origin)throw new Error('Invalid origin.');const u=await actor(),f=await req.formData(),assessment=String(f.get('assessment')||''),group=String(f.get('group')||''),files=f.getAll('files').filter(x=>x instanceof File&&x.size>0) as File[],records=await all();
 const admin=u.role==='admin';
 // Profile photo: cropped client-side to a small square JPEG.
 if(f.get('avatar')==='true'){const photo=files[0];if(!photo||photo.size>2*1024*1024||!['image/jpeg','image/png','image/webp'].includes(photo.type))throw new Error('Choose a JPG, PNG or WebP photo up to 2 MB.');await bucket().put('avatars/'+u.id,await photo.arrayBuffer(),{httpMetadata:{contentType:'image/jpeg'}});const profile=await get('profile:'+u.id);await put('profile','profile:'+u.id,{...(profile||{}),owner:u.id,email:profile?.email||u.email,photo:now()},profile?.revision);return Response.json({ok:true});}
 const term=await writableSemester(String(f.get('semester')||'')||undefined);
 if(!files.length||files.length>12||files.some(f=>f.size>20*1024*1024)||files.reduce((s,f)=>s+f.size,0)>45*1024*1024)throw new Error('Choose 1–12 files, up to 20 MB each and 45 MB per upload.');
 const field=(k:string,max=200)=>String(f.get(k)||'').trim().slice(0,max);
 // Letters & requests: a student's own letter, visible only to them and lecturers.
 if(f.get('letter')==='true'){
  const type=field('type'),subject=field('subject',120),message=field('message',2000),course=field('course');if(!letterTypes.includes(type))throw new Error('Choose a letter type.');if(!subject)throw new Error('Add a short subject.');if(files.length>3)throw new Error('Attach up to 3 files.');allow(files,[...DOCS,...IMAGES],'Letters');if(course&&!admin&&!enrolled(records,u.id,term.id,course))throw new Error('Choose one of your courses.');
  const id=uid(),ids=await store(files,{owner:u.id,group:'',letter:id,author:u.name});await put('letter',id,{owner:u.id,author:u.name,type,subject,message,course,files:ids,status:'Received',reply:'',submitted:now()});await log(u.name,'Sent letter',id,null,{type,subject});return Response.json({ok:true});
 }
 // Course materials: lecturer notes, slides and readings attached to a teaching week.
 if(f.get('material')==='true'){
  if(!admin)throw new Error('Only lecturers can add course materials.');const course=field('course'),week=Number(f.get('week')),title=field('title',160);if(!records.some((r:any)=>r.kind==='course'&&r.code===course))throw new Error('Choose an existing course.');if(!(week>=1&&week<=52))throw new Error('Choose a teaching week.');if(!title)throw new Error('Give this material a title.');allow(files,MATERIALS,'Course materials');
  const id=uid(),ids=await store(files,{owner:u.id,group:'',material:id,author:u.name,course});await put('material',id,{title,course,week,notes:field('notes',1000),url:'',files:ids,published:f.get('published')!=='off',author:u.name});await log(u.name,'Added material',id,null,{title,week});return Response.json({ok:true});
 }
 // A test or quiz paper students download and answer.
 const brief=field('brief');if(brief){if(!admin)throw new Error('Lecturer access required.');const a=await get(brief);if(!a||a.kind!=='assessment')throw new Error('Assessment not found.');await assertTargetWritable(a);allow(files,[...DOCS,...IMAGES],'Test and quiz papers');const ids=await store(files,{owner:u.id,group:'',brief:a.id,author:u.name,course:a.course});await put('assessment',a.id,{...a,files:[...(a.files||[]),...ids]},a.revision);return Response.json({ok:true});}
 const resourceUpload=String(f.get('resource')||'')==='true';
 if(resourceUpload){
  if(!admin)throw new Error('Only lecturers can publish teaching files.');const title=String(f.get('title')||'').trim(),category=String(f.get('category')||'Document'),course=String(f.get('course')||'Both courses');if(!title)throw new Error('Give this resource a title.');if(!records.some((r:any)=>r.kind==='course'&&r.code===course))throw new Error('Choose an existing course.');const source=String(f.get('source')||'');if(source&&!/^https?:\/\//.test(source))throw new Error('Source must be a web URL.');if(!['Shapefile','Lecture notes','Timetable','Student roster','Document'].includes(category))throw new Error('Choose a supported file category.');
  const oldId=String(f.get('resourceId')||''),old=oldId?await get(oldId):null;if(oldId&&(!old||old.kind!=='resource'))throw new Error('Resource not found.');if(old)await assertTargetWritable(old);if(old&&old.category!==category)throw new Error('A new version must use the same category.');const checks=[];for(const file of files){if(category==='Shapefile'){if(!file.name.toLowerCase().endsWith('.zip'))throw new Error('Upload shapefiles as ZIP packages.');checks.push(validateShapefileZip(await file.arrayBuffer()));}}
  const id=old?.id||uid(),version=Number(old?.version||0)+1,ids=[];for(const file of files){const fid=uid(),key='files/'+fid;await bucket().put(key,await file.arrayBuffer());await put('file',fid,{owner:u.id,group:'',filename:file.name,key,size:file.size,resource:id,version,uploaded:now(),author:u.name});ids.push(fid);}
  await put('resource',id,{title,category,course,description:String(f.get('description')||''),source,crs:String(f.get('crs')||''),published:category!=='Student roster'&&f.get('published')==='on',files:[...(old?.files||[]),...ids],version,checks,updated:now(),author:u.name},old?.revision);return Response.json({ok:true});
 }
 const g=group?await get(group):null;if(group&&(!g||g.kind!=='group'||!admin&&!(g.members||[]).includes(u.id)))throw new Error('Group access denied.');
 const a=assessment?await get(assessment):null;if(assessment&&(!a||a.kind!=='assessment'||!a.published))throw new Error('Assessment is not open.');if(a&&(a.mode==='Group')!==!!group)throw new Error('Choose the correct individual or group submission workflow.');
 if(a&&['Online quiz','Paper test'].includes(a.type))throw new Error(a.type==='Online quiz'?'Answer this quiz online.':'This test is sat in class; there is nothing to upload.');
 if(a){await assertTargetWritable(a);if(!admin&&!enrolled(records,u.id,term.id,a.course))throw new Error('You are not enrolled in this course.');allow(files,submissionTypes(a),'Submissions for this brief');}if(g)await assertTargetWritable(g);
 const past=a?records.filter((r:any)=>r.kind==='submission'&&r.assessment===assessment&&(group?r.group===group:r.owner===u.id&&!r.group)):[];
 // Resubmission is open until the deadline; a first submission after it is still accepted and marked late.
 if(a?.due&&Date.now()>Date.parse(a.due)&&past.length)throw new Error('The deadline has passed, so your latest submission stands. Contact your lecturer if you need an extension.');
 const submission=uid(),ids=await store(files,{owner:u.id,group,submission:assessment?submission:'',author:u.name});
 if(a)await put('submission',submission,{owner:u.id,group,assessment,title:a.title,files:ids,submitted:now(),version:past.length+1,late:!!a.due&&Date.now()>Date.parse(a.due),note:String(f.get('note')||''),feedback:'',author:u.name});
 if(group)await put('activity',uid(),{owner:u.id,group,title:`${u.name} uploaded ${files.length} file(s)${a?' for '+a.title:''}`});return Response.json({ok:true});
 }catch(e:any){console.error('Upload failed',e);return Response.json({error:e.message||'Upload failed. Your files have not been submitted.'},{status:400});}}
