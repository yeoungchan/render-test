import {parseDocument} from 'htmlparser2';
import {createHash} from 'node:crypto';
export const HEADERS=['접수일자','카드사','민원인(주문자)','승인일자','금액','승인번호','거래번호','민원사유','유형','상점명','상점 ID','회신기한','처리상태','담당자','처리메모'];
export const STATUSES=['접수','확인 중','회신 대기','처리 완료','보류'];
const text=n=>n.type==='text'?n.data:['script','style'].includes(n.name)?'':(n.children||[]).map(text).join(n.name==='br'?'\n':'');
const norm=s=>String(s).replace(/\s/g,'');
function descendants(n,name){return (n.children||[]).flatMap(c=>[...(c.name===name?[c]:[]),...descendants(c,name)])}
export function extractComplaints(html,plain=''){
 const doc=parseDocument(typeof html==='string'?html.slice(0,262144):'');const records=[];const warnings=[];
 for(const table of descendants(doc,'table')){const rows=descendants(table,'tr').map(tr=>(tr.children||[]).filter(c=>['td','th'].includes(c.name)));
 let map=null;for(const cells of rows){const values=cells.map(c=>text(c).trim());const candidate=HEADERS.slice(0,11).map(h=>values.findIndex(v=>norm(v)===norm(h)));
 if(candidate.every(i=>i>=0)){map=candidate;continue}if(!map||!values.some(Boolean))continue;
 if(cells.some(c=>Number(c.attribs?.rowspan||1)>1||Number(c.attribs?.colspan||1)>1)||map.some(i=>i>=cells.length)){warnings.push('병합 셀이 있는 행은 자동 추출하지 않았습니다. 원문을 확인하세요.');continue}
 const row=[...map.map(i=>values[i]),'','접수','',''];for(const i of [0,3])if(/^\d{8}$/.test(row[i]))row[i]=row[i].replace(/(\d{4})(\d{2})(\d{2})/,'$1-$2-$3');records.push(row);if(records.length>=100)break;}if(records.length>=100)break;}
 const deadline=(plain||text(doc)).match(/(?:회신기한|회신기간)\s*[:：]?\s*([^\n]{1,60})/);
 if(!records.length)warnings.push('본문에서 일치하는 표를 찾지 못했습니다. 이미지·첨부파일 표는 아직 지원하지 않습니다.');
 if(deadline)warnings.push('원문 회신기한: '+deadline[1].trim()+' — 연도를 포함해 직접 확인·입력하세요.');
 return {headers:HEADERS,rows:records,warnings:[...new Set(warnings)]};
}
function dateSerial(value,time=false){const pattern=time?/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/:/^(\d{4})-(\d{2})-(\d{2})$/;const m=value.match(pattern);if(!m)throw Error('날짜는 YYYY-MM-DD, 회신기한은 YYYY-MM-DD HH:mm 형식으로 입력하세요.');const [y,mo,d,h=0,mi=0]=m.slice(1).map(Number);const dt=new Date(Date.UTC(y,mo-1,d,h,mi));if(dt.getUTCFullYear()!==y||dt.getUTCMonth()!==mo-1||dt.getUTCDate()!==d||h>23||mi>59)throw Error('유효하지 않은 날짜입니다.');return dt.getTime()/86400000+25569;}
export function prepareRows(rows){if(!Array.isArray(rows)||!rows.length||rows.length>100)throw Error('1~100건을 선택하세요.');return rows.map((r,index)=>{if(!Array.isArray(r)||r.length!==15||r.some(v=>typeof v!=='string'||v.length>4000))throw Error('행 형식이 올바르지 않습니다.');r=r.map(v=>v.trim());if([0,1,2,3,4,5,6,7,10].some(i=>!r[i]))throw Error(`${index+1}행의 필수 항목이 비어 있습니다.`);if(!STATUSES.includes(r[12]))throw Error('처리상태를 확인하세요.');const amount=r[4].replace(/,/g,'');if(!/^\d+(\.\d{1,2})?$/.test(amount)||!Number.isSafeInteger(Number(amount)*100))throw Error('금액을 확인하세요.');const key=createHash('sha256').update(JSON.stringify([r[1],r[3],r[5],r[6],r[10]])).digest('hex');const values=r.map((v,i)=>[0,3].includes(i)?{numberValue:dateSerial(v)}:i===4?{numberValue:Number(amount)}:i===11&&v?{numberValue:dateSerial(v,true)}:{stringValue:v});return {key,values:[...values,{stringValue:key}]}})}
