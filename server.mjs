import {inspectNaverTransport} from './naver-diagnostics.mjs';
import {credentialVault,normalizeConnection,withNaver,listNaver,readNaver,safeMailError} from './naver-mail.mjs';
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {createHmac,randomBytes,scryptSync,timingSafeEqual} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createStore} from './mysql-store.mjs';
import {validateBackup} from './state-schema.mjs';
const production=process.env.NODE_ENV==='production';
const existingUsers=process.env.AUTH_MODE==='mysql-existing';
const databaseUrl=process.env.DATABASE_URL||(process.env.DB_HOST&&process.env.DB_NAME?'mysql://'+encodeURIComponent(process.env.DB_USER||'')+':'+encodeURIComponent(process.env.DB_PASSWORD||'')+'@'+process.env.DB_HOST+':'+(process.env.DB_PORT||3306)+'/'+encodeURIComponent(process.env.DB_NAME):'');
const enabled=!!databaseUrl;
const email=(process.env.ADMIN_EMAIL||'').trim().toLowerCase();
const password=process.env.ADMIN_PASSWORD||'';
const secret=process.env.SESSION_SECRET||(!production?randomBytes(32).toString('hex'):'');
if(enabled&&((!existingUsers&&(!email||password.length<12))||secret.length<32))throw Error('Set ADMIN_EMAIL, ADMIN_PASSWORD (12+ chars), SESSION_SECRET (32+ chars).');
if(production&&!enabled)throw Error('DATABASE_URL is required for production cloud storage.');
let store=null,storeLoading=null,retryAfter=0;
async function ensureStore(){if(store)return store;if(storeLoading)return storeLoading;if(Date.now()<retryAfter)return null;storeLoading=createStore(databaseUrl,existingUsers?null:email).then(value=>{store=value;return value}).catch(error=>{retryAfter=Date.now()+30000;console.error('MySQL connection unavailable:',error.code||'connection_error');return null}).finally(()=>{storeLoading=null});return storeLoading;}
const passwordHash=scryptSync(password,secret,64);const attempts=new Map();
const mailBusy=new Set();const mailLastConnect=new Map();const mailVault=credentialVault(process.env.NAVER_CREDENTIAL_KEY||secret);
function sign(value){return createHmac('sha256',secret).update(value).digest('base64url')}
function session(req){const token=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('morning_session='))?.slice(16);if(!token)return false;const [data,sig]=token.split('.');if(!data||!sig||sig.length!==sign(data).length||!timingSafeEqual(Buffer.from(sig),Buffer.from(sign(data))))return false;try{const v=JSON.parse(Buffer.from(data,'base64url'));return typeof v.email==='string'&&(existingUsers||v.email===email)&&v.exp>Date.now()?v.email:false}catch{return false}}
function cookie(value,age=604800){return 'morning_session='+value+'; HttpOnly; SameSite=Strict; Path=/; Max-Age='+age+(production?'; Secure':'')}
function json(res,status,data,headers={}){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...headers});res.end(JSON.stringify(data))}
async function body(req){let s='';for await(const part of req){s+=part;if(Buffer.byteLength(s)>5000000){const e=Error('요청이 너무 큽니다.');e.status=413;throw e}}try{return JSON.parse(s)}catch{const e=Error('JSON 형식 오류');e.status=400;throw e}}
export const server=http.createServer(async(req,res)=>{res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');res.setHeader('Referrer-Policy','same-origin');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
 try{const url=new URL(req.url,'http://localhost');const path=url.pathname;
 if(path==='/healthz'){return json(res,200,{ok:true})}
 if(path.startsWith('/api/')){
 if(!enabled)return json(res,200,{enabled:false});
 if(!['GET','HEAD'].includes(req.method)){const origin=req.headers.origin;const expected=production?process.env.APP_ORIGIN:'http://'+req.headers.host;if(!expected||origin!==expected)return json(res,403,{error:'잘못된 요청 출처입니다.'});if(!req.headers['content-type']?.startsWith('application/json'))return json(res,415,{error:'JSON 요청이 필요합니다.'})}
 if(path==='/api/session'&&req.method==='GET')return json(res,200,{enabled:true,databaseReady:!!(await ensureStore()),authenticated:!!session(req),email:session(req)||undefined,loginMode:existingUsers?'existing':'admin'});
 if(path==='/api/login'&&req.method==='POST'){
 if(!await ensureStore())return json(res,503,{error:'MySQL 서버에 연결할 수 없습니다. 관리자에게 DB 연결 설정 확인을 요청하세요.'});
 const ip=req.socket.remoteAddress||'unknown';const now=Date.now();for(const [key,v]of attempts){if(v.until<now)attempts.delete(key)}const a=attempts.get(ip)||{count:0,until:now+900000};if(a.count>=10)return json(res,429,{error:'로그인 시도가 많습니다. 15분 후 다시 시도하세요.'});a.count++;attempts.set(ip,a);
 const v=await body(req);const correct=!existingUsers&&typeof v.password==='string'&&v.password.length<=512&&timingSafeEqual(scryptSync(v.password,secret,64),passwordHash);const loginOwner=existingUsers?await store.authenticate(v.email,v.password):(correct&&typeof v.email==='string'&&v.email.trim().toLowerCase()===email?email:null);if(!loginOwner)return json(res,401,{error:'이메일 또는 비밀번호를 확인하세요.'});attempts.delete(ip);const data=Buffer.from(JSON.stringify({email:loginOwner,exp:now+604800000})).toString('base64url');return json(res,200,{ok:true},{'Set-Cookie':cookie(data+'.'+sign(data))})}
 if(path==='/api/logout'&&req.method==='POST')return json(res,200,{ok:true},{'Set-Cookie':cookie('',0)});
 if(!session(req))return json(res,401,{error:'로그인이 필요합니다.'});
 if(path.startsWith('/api/naver/')){const owner=session(req);if(!await ensureStore())return json(res,503,{error:'서버 저장소에 연결할 수 없습니다.'});
 if(path==='/api/naver/connection'&&req.method==='GET'){const config=await store.mailConnection(owner);return json(res,200,{connected:!!config,email:config?.email})}
 if(path==='/api/naver/connection'&&req.method==='DELETE'){if(mailBusy.has(owner))return json(res,409,{error:'메일 조회가 끝난 뒤 연결을 해제하세요.'});await store.deleteMailConnection(owner);return json(res,200,{ok:true})}
 if(mailBusy.has(owner))return json(res,429,{error:'메일 조회가 진행 중입니다. 잠시 기다려 주세요.'});mailBusy.add(owner);try{
 if(path==='/api/naver/connection'&&req.method==='POST'){if(Date.now()-(mailLastConnect.get(owner)||0)<5000)return json(res,429,{error:'잠시 후 다시 연결하세요.'});mailLastConnect.set(owner,Date.now());const v=await body(req);const credentials=normalizeConnection(v.email,v.appPassword);await withNaver(credentials,async()=>true);await store.saveMailConnection(owner,credentials.email,mailVault.seal(owner,credentials));return json(res,200,{connected:true,email:credentials.email})}
 if(path==='/api/naver/diagnostics'&&req.method==='GET')return json(res,200,await inspectNaverTransport());
 const config=await store.mailConnection(owner);if(!config)return json(res,409,{error:'먼저 네이버 메일을 연결하세요.'});const credentials=mailVault.open(owner,config.encrypted_secret);
 if(path==='/api/naver/messages'&&req.method==='GET')return json(res,200,{...await withNaver(credentials,listNaver),fetchedAt:new Date().toISOString()});
 if(path==='/api/naver/message'&&req.method==='GET')return json(res,200,await withNaver(credentials,c=>readNaver(c,Number(url.searchParams.get('uid')),url.searchParams.get('validity'))));
 return json(res,404,{error:'없는 메일 API입니다.'});
 }catch(error){const safe=safeMailError(error);console.warn('Naver mail failure:',safe.diagnosticCode,'attempts:',Number(error.authAttempts)||0,'details:',JSON.stringify(error.authDiagnostics||[]));return json(res,safe.status,{error:safe.message,code:safe.diagnosticCode,details:error.authDiagnostics||[]})}finally{mailBusy.delete(owner)}}
 if(path==='/api/state'&&!await ensureStore())return json(res,503,{error:'MySQL 연결을 확인할 수 없습니다. 이 기기의 변경 사항을 백업하세요.'});
 if(path==='/api/state'&&req.method==='GET'){return json(res,200,await store.read(session(req)))}
 if(path==='/api/state'&&req.method==='PUT'){const v=await body(req);if(!Number.isInteger(v.revision)||v.revision<0)return json(res,400,{error:'저장 데이터 형식 오류'});try{v.state=validateBackup(v.state)}catch{return json(res,400,{error:'저장 데이터 형식 오류'})}const saved=await store.save(v.state,v.revision,session(req));if(!saved)return json(res,409,{error:'다른 기기에서 수정했습니다. 현재 기록을 백업한 뒤 서버 기록을 다시 불러오세요.'});return json(res,200,saved)}
 return json(res,404,{error:'없는 API입니다.'});}
 if(req.method!=='GET'&&req.method!=='HEAD')return json(res,405,{error:'지원하지 않는 요청입니다.'});if(!['/','/index.html'].includes(path))return json(res,404,{error:'없는 페이지입니다.'});const html=await readFile(fileURLToPath(new URL('./dist/index.html',import.meta.url)));res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-cache'});res.end(req.method==='HEAD'?undefined:html);
 }catch(e){console.error('Request failed:',e.code||e.status||'internal');json(res,e.status||500,{error:e.status?e.message:'서버에 연결할 수 없습니다. 잠시 후 다시 시도하세요.'})}});
server.listen(Number(process.env.PORT||3000),'0.0.0.0',()=>console.log('Morning Desk listening on '+(process.env.PORT||3000)));
process.on('SIGTERM',()=>server.close(()=>{store?.close().finally(()=>process.exit(0))||process.exit(0)}));

