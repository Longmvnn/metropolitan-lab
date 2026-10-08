'use client';
export function currentLocation():Promise<{latitude:number;longitude:number;accuracy:number}> {
 return new Promise((resolve,reject)=>{
  if(!navigator.geolocation){reject(new Error('Your browser does not support location.'));return;}
  navigator.geolocation.getCurrentPosition(
   ({coords})=>resolve({latitude:coords.latitude,longitude:coords.longitude,accuracy:coords.accuracy}),
   error=>reject(new Error(error.code===1?'Allow location access to verify attendance.':error.code===3?'Location timed out. Please try again.':'Your location is unavailable. Enable precise location and try again.')),
   {enableHighAccuracy:true,timeout:15000,maximumAge:0},
  );
 });
}
