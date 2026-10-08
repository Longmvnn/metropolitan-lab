// Coursework contributions supplied by the lecturer; university examinations are outside this app.
export const courseworkMaximum=(course:string)=>course==='UP 406'?30:course==='UP 417'?60:100;
export const schemeSignature=(assessments:any[])=>JSON.stringify(assessments.map(a=>[a.id,a.weight===''||a.weight===undefined||a.weight===null?'':Number(a.weight)]).sort((a,b)=>String(a[0]).localeCompare(String(b[0]))));
export function schemeFor(settings:any,course:string,assessments?:any[]){
 const scheme=settings.schemes?.[course]||{approved:!!settings.approved,policy:settings.policy||''};
 const maximum=courseworkMaximum(course);
 const complete=!assessments||(assessments.length>0&&assessments.every(a=>a.weight!==''&&a.weight!==undefined&&a.weight!==null&&Number.isFinite(Number(a.weight))&&Number(a.weight)>=0&&Number(a.weight)<=maximum)&&Math.abs(assessments.reduce((sum,a)=>sum+Number(a.weight),0)-maximum)<0.01);
 return !complete||(assessments&&scheme.signature&&scheme.signature!==schemeSignature(assessments))?{...scheme,approved:false}:scheme;
}
export function validateScheme(assessments:any[],entries:any[],approved:boolean,course:string){
 if(!Array.isArray(entries)||entries.length!==assessments.length)throw new Error('The assessment list changed. Refresh Settings and try again.');
 const ids=new Set(entries.map(e=>e.id));
 if(ids.size!==entries.length||assessments.some(a=>!ids.has(a.id)))throw new Error('The assessment list changed. Refresh Settings and try again.');
 const maximum=courseworkMaximum(course);
 let total=0;
 const weights=new Map<string,number|string>();
 for(const a of assessments){
  const entry=entries.find(e=>e.id===a.id);
  if(entry.revision!==a.revision)throw new Error('An assessment changed. Refresh Settings and try again.');
  const empty=entry.weight===''||entry.weight===null||entry.weight===undefined;
  const value=empty?'':Number(entry.weight);
  if(value!==''&&(!Number.isFinite(value)||value<0||value>maximum))throw new Error(`Each weight must be between 0 and ${maximum}%.`);
  if(approved&&empty)throw new Error('Enter a weight for every published assessment before confirming.');
  weights.set(a.id,value);total+=Number(value);
 }
 if(approved&&(!assessments.length||Math.abs(total-maximum)>=0.01))throw new Error(`Published assessment weights must total ${maximum}% before confirming.`);
 return weights;
}
