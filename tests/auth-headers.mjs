import {AsyncLocalStorage} from 'node:async_hooks';
export const requestContext=new AsyncLocalStorage();
export async function cookies(){return {get(name){const value=requestContext.getStore()?.[name];return value?{value}:undefined;}};}
