export const ATTENDANCE_RADIUS_METERS = 50;
export function coordinates(latitude:unknown,longitude:unknown): {latitude:number;longitude:number} {
 if(typeof latitude!=='number'||typeof longitude!=='number'||!Number.isFinite(latitude)||!Number.isFinite(longitude)||Math.abs(latitude)>90||Math.abs(longitude)>180)throw new Error('Valid latitude and longitude are required.');
 return {latitude,longitude};
}
export function distanceMeters(a:{latitude:number;longitude:number},b:{latitude:number;longitude:number}) {
 const radians=(n:number)=>n*Math.PI/180;
 const dLat=radians(b.latitude-a.latitude),dLon=radians(b.longitude-a.longitude);
 const h=Math.sin(dLat/2)**2+Math.cos(radians(a.latitude))*Math.cos(radians(b.latitude))*Math.sin(dLon/2)**2;
 return 6371000*2*Math.asin(Math.sqrt(Math.min(1,Math.max(0,h))));
}
export function checkpointCode() {
 // Rejection sampling avoids modulo bias.
 let n:number;do {n=crypto.getRandomValues(new Uint32Array(1))[0];}while(n>=4294000000);
 return String(n%1000000).padStart(6,'0');
}
