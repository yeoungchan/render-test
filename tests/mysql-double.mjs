// Test double for driver contracts; this does not emulate or execute MySQL SQL.
export function memoryPool(){
 const records=new Map();const users=new Map();const accounts=new Map();const mails=new Map();let closed=false;
 return {records,users,accounts,mails,get closed(){return closed},async query(sql){if(!sql.startsWith('CREATE TABLE IF NOT EXISTS morning_'))throw Error('Unexpected DDL');return [[],[]]},async execute(sql,args){
 if(sql.startsWith('SELECT email, encrypted_secret'))return [mails.has(args[0])?[mails.get(args[0])]:[],[]];
 if(sql.startsWith('INSERT INTO morning_naver_connections')){mails.set(args[0],{email:args[1],encrypted_secret:args[2]});return [{affectedRows:1},[]]}
 if(sql.startsWith('DELETE FROM morning_naver_connections')){mails.delete(args[0]);return [{affectedRows:1},[]]}
 if(sql.startsWith('SELECT user_id')){const u=(sql.includes('FROM morning_accounts')?accounts:users).get(args[0]);return [u?[u]:[],[]]}
 if(sql.startsWith('INSERT INTO morning_accounts')){if(!accounts.has(args[0]))accounts.set(args[0],{user_id:args[0],password_hash:args[1]});return [{affectedRows:1},[]]}
 if(sql.startsWith('INSERT INTO')){if(!records.has(args[0]))records.set(args[0],{payload:null,revision:0,updated_at:new Date()});return [{affectedRows:1},[]]}
 if(sql.startsWith('SELECT payload')){const row=records.get(args[0]);return [row?[structuredClone(row)]:[],[]]}
 if(sql.startsWith('UPDATE morning_state SET payload')){const [payload,owner,revision]=args;const row=records.get(owner);if(!row||row.revision!==revision)return [{affectedRows:0},[]];row.payload=payload;row.revision++;row.updated_at=new Date();return [{affectedRows:1},[]]}
 throw Error('Unexpected SQL')},async end(){closed=true}};
}
