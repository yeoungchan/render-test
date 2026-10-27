import assert from 'node:assert/strict';
import mysql from 'mysql2/promise';
import {memoryPool} from './mysql-double.mjs';
mysql.createPool=()=>memoryPool();
Object.assign(process.env,{DATABASE_URL:'mysql://test:test@localhost/test',ADMIN_EMAIL:'owner@example.test',ADMIN_PASSWORD:'test-only-password-123',SESSION_SECRET:'test-only-session-secret-at-least-32-characters',PORT:'0',NODE_ENV:'development'});
const {server}=await import('../server.mjs');
if(!server.listening)await new Promise(r=>server.once('listening',r));const origin='http://127.0.0.1:'+server.address().port;
let cookie='';async function call(path,method='GET',body,auth=true,requestOrigin=origin){return fetch(origin+path,{method,headers:{...(auth&&cookie?{Cookie:cookie}:{}),...(method!=='GET'?{'Content-Type':'application/json',Origin:requestOrigin}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})})}
try{
 assert.equal((await call('/api/state')).status,401);assert.equal((await call('/api/naver/connection')).status,401);
 assert.equal((await call('/api/login','POST',{email:'owner@example.test',password:'wrong'})).status,401);
 assert.equal((await call('/api/login','POST',{email:'owner@example.test',password:'test-only-password-123'},true,'https://evil.example')).status,403);
 const login=await call('/api/login','POST',{email:'owner@example.test',password:'test-only-password-123'});assert.equal(login.status,200);cookie=login.headers.get('set-cookie').split(';')[0];assert(login.headers.get('set-cookie').includes('HttpOnly'));
 assert.equal((await (await call('/api/session')).json()).authenticated,true);assert.equal((await (await call('/api/naver/connection')).json()).connected,false);assert.equal((await call('/api/naver/messages')).status,409);assert.equal((await call('/api/naver/connection','POST',{email:'evil@example.test',appPassword:'test'})).status,400);
 const empty=await (await call('/api/state')).json();assert.equal(empty.payload,null);assert.equal(empty.revision,0);
 const state={events:[],tasks:[{id:'task1',title:'기기 간 동기화',done:false,priority:'높음'}],routines:[],routineChecks:{},settings:{},brief:'확인',saved:''};
 let response=await call('/api/state','PUT',{state,revision:0});assert.equal(response.status,200);assert.equal((await response.json()).revision,1);
 assert.deepEqual((await (await call('/api/state')).json()).payload,state);
 assert.equal((await call('/api/state','PUT',{state,revision:0})).status,409);
 assert.equal((await call('/api/state','PUT',{state:{},revision:1})).status,400);
 assert.equal((await call('/.env')).status,404);assert.equal((await call('/server.mjs')).status,404);
 assert.equal((await call('/api/logout','POST',{})).status,200);
 console.log('PASS auth required, bad credentials, origin validation, secure session attributes, driver-double state round-trip, stale-write conflict, invalid payload, private file denial');
}finally{await new Promise(r=>server.close(r));}

