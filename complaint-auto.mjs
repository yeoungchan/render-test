import {prepareRows} from './complaints.mjs';
export const AUTO_SENDERS=['kjy@ksnet.co.kr','jmh4147@ksnet.co.kr'];
export function automaticRows(message){
 if(message.truncated)throw Error('큰 메일은 원문 확인이 필요합니다.');
 if(!/민원/.test(message.text||''))return null;
 const result=message.complaints;
 if(!result?.rows?.length||result.rows.length>=100||(result.warnings||[]).some(w=>!w.startsWith('원문 회신기한:')))throw Error('표가 없거나 불완전합니다. 원문을 확인하세요.');
 const rows=result.rows.map(r=>[...r]);prepareRows(rows);
 // Never infer a missing year. Preserve the original deadline in the memo.
 const hint=(result.warnings||[]).find(w=>w.startsWith('원문 회신기한:'));
 if(hint)for(const row of rows)row[14]=hint;
 return rows;
}
export function createAuto({getStore,connect,read,credentials,sheets,owner,busy}){
 let running=false;
 const empty=()=>({enabled:false,logs:[],total:0});
 const record=(state,data)=>{state.logs=[{at:new Date().toISOString(),...data},...(state.logs||[])].slice(0,50)};
 async function status(){const store=await getStore();if(!store)throw Error('저장소 연결 실패');return await store.autoRead(owner)||empty()}
 async function configure(enabled){const store=await getStore();if(!store)throw Error('저장소 연결 실패');if(busy.has(owner))throw Error('메일 조회 후 다시 시도하세요.');busy.add(owner);try{return await store.withComplaintLock(async()=>{let state=await store.autoRead(owner)||empty();if(enabled&&!state.validity){await sheets.inspect();const auth=await credentials(store);const baseline=await connect(auth,async c=>({validity:String(c.mailbox.uidValidity),cursor:Number(c.mailbox.uidNext)-1}));if(!Number.isSafeInteger(baseline.cursor)||baseline.cursor<0)throw Error('메일 시작 위치 확인 실패');state={...state,...baseline,mailEmail:auth.email,startedAt:new Date().toISOString()}}state.enabled=enabled;state.error=null;await store.autoSave(owner,state);return state})}finally{busy.delete(owner)}}
 async function run(){if(running||busy.has(owner))return;running=true;busy.add(owner);let store;try{store=await getStore();if(!store)return;return await store.withComplaintLock(async()=>{const state=await store.autoRead(owner);if(!state?.enabled)return;try{const auth=await credentials(store);if(state.mailEmail&&state.mailEmail!==auth.email)throw Error('메일함 번호 또는 연결 계정이 변경되었습니다. 관리자 확인이 필요합니다.');const batch=await connect(auth,async c=>{if(String(c.mailbox.uidValidity)!==state.validity)throw Error('메일함 번호가 변경되었습니다. 관리자 확인이 필요합니다.');if(Number(c.mailbox.uidNext)-1<=state.cursor)return [];const items=[];const end=Math.min(state.cursor+25,Number(c.mailbox.uidNext)-1);for await(const m of c.fetch(`${state.cursor+1}:${end}`,{uid:true,envelope:true},{uid:true})){if(m.uid>state.cursor)items.push({uid:m.uid,match:(m.envelope?.from||[]).some(f=>AUTO_SENDERS.includes(f.address?.toLowerCase()))})}return {items:items.sort((a,b)=>a.uid-b.uid),end}});
 if(batch.items)for(const item of batch.items){if(item.match){const message=await connect(auth,c=>read(c,item.uid,state.validity));let rows;try{rows=automaticRows(message)}catch(e){record(state,{uid:item.uid,status:'확인 필요',message:e.message});state.cursor=item.uid;await store.autoSave(owner,state);continue}if(rows){const result=await sheets.write(rows);state.total=(state.total||0)+result.added;record(state,{uid:item.uid,status:rows.some(r=>r[14])?'등록 완료 · 회신기한 확인 필요':'등록 완료',added:result.added,duplicates:result.duplicates});}}state.cursor=item.uid;await store.autoSave(owner,state)}
 if(batch.end)state.cursor=batch.end;state.error=null;state.lastChecked=new Date().toISOString();
 }catch(e){state.error='자동 처리 실패: 연결 상태 또는 시트 양식을 확인하세요. 다음 주기에 재시도합니다.';if(/메일함 번호/.test(e.message)){state.enabled=false;state.error=e.message}state.lastAttempt=new Date().toISOString();}await store.autoSave(owner,state);return state;});}catch(e){if(e.status!==409)console.warn('Complaint automation unavailable');}finally{running=false;busy.delete(owner)}}
 return {status,configure,run};
}
