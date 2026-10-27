import {compare} from 'bcryptjs';
import mysql from 'mysql2/promise';
import {readFileSync} from 'node:fs';
export const schema=`CREATE TABLE IF NOT EXISTS morning_state (
 owner VARCHAR(254) NOT NULL PRIMARY KEY,
 payload JSON NULL,
 revision INT UNSIGNED NOT NULL DEFAULT 0,
 updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`;
export const accountSchema=`CREATE TABLE IF NOT EXISTS morning_accounts (
 user_id VARCHAR(254) NOT NULL PRIMARY KEY,
 password_hash VARCHAR(255) NOT NULL,
 created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`;
export function poolOptions(url,env=process.env){
 const uri=new URL(url);if(uri.protocol!=='mysql:')throw Error('DATABASE_URL must use mysql://');
 const database=decodeURIComponent(uri.pathname.slice(1));if(!database)throw Error('DATABASE_URL must include a database name.');
 if(uri.search)throw Error('Use MYSQL_SSL and MYSQL_SSL_CA for TLS settings instead of URL query parameters.');
 const options={host:uri.hostname,port:Number(uri.port||3306),user:decodeURIComponent(uri.username),password:decodeURIComponent(uri.password),database,connectionLimit:5,connectTimeout:10000,charset:'utf8mb4',timezone:'Z',multipleStatements:false};
 if(env.MYSQL_SSL==='true')options.ssl={rejectUnauthorized:true,...(env.MYSQL_SSL_CA?{ca:env.MYSQL_SSL_CA}:env.MYSQL_SSL_CA_FILE?{ca:readFileSync(env.MYSQL_SSL_CA_FILE,'utf8')}:{})};
 return options;
}
export async function createStore(url,owner,{env=process.env,poolFactory=mysql.createPool}={}){
 const pool=poolFactory(poolOptions(url,env));
 try{await pool.query(schema);await pool.query(accountSchema);
 if(env.BOOTSTRAP_USER_ID&&env.BOOTSTRAP_PASSWORD_HASH){if(env.BOOTSTRAP_USER_ID.length>254||!/^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(env.BOOTSTRAP_PASSWORD_HASH))throw Error('Invalid bootstrap account configuration');await pool.execute('INSERT INTO morning_accounts(user_id, password_hash) VALUES (?, ?) ON DUPLICATE KEY UPDATE user_id = user_id',[env.BOOTSTRAP_USER_ID,env.BOOTSTRAP_PASSWORD_HASH]);}
if(owner!==null)await pool.execute('INSERT INTO morning_state(owner) VALUES (?) ON DUPLICATE KEY UPDATE owner = owner',[owner]);}catch(error){await pool.end();throw error}
 return {
 async read(account=owner){await pool.execute('INSERT INTO morning_state(owner) VALUES (?) ON DUPLICATE KEY UPDATE owner = owner',[account]);const [rows]=await pool.execute('SELECT payload, revision, updated_at FROM morning_state WHERE owner = ?',[account]);const row=rows[0];if(!row)throw Error('Account state is missing.');return {...row,payload:typeof row.payload==='string'?JSON.parse(row.payload):row.payload}},
 async save(state,revision,account=owner){const [result]=await pool.execute('UPDATE morning_state SET payload = ?, revision = revision + 1, updated_at = CURRENT_TIMESTAMP(3) WHERE owner = ? AND revision = ?',[JSON.stringify(state),account,revision]);return result.affectedRows===1?{revision:revision+1}:null},
 async authenticate(userId,password){if(typeof userId!=='string'||!userId.trim()||userId.length>254||typeof password!=='string'||password.length>512)return null;let [rows]=await pool.execute('SELECT user_id, password_hash FROM morning_accounts WHERE user_id = ? LIMIT 1',[userId.trim()]);if(!rows.length){try{[rows]=await pool.execute('SELECT user_id, password_hash FROM users WHERE user_id = ? LIMIT 1',[userId.trim()])}catch(error){if(error.code!=='ER_NO_SUCH_TABLE')throw error;return null}}const user=rows[0];return user&&typeof user.password_hash==='string'&&await compare(password,user.password_hash)?String(user.user_id):null},
 close:()=>pool.end()
 };
}
