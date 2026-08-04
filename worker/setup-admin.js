
import {createHash} from 'node:crypto';
const username=process.argv[2]||'admin';
const password=process.argv[3];
if(!password){console.error('Usage: node setup-admin.js admin YOUR_PASSWORD');process.exit(1)}
const hash=createHash('sha256').update(password).digest('hex');
console.log(`INSERT INTO users(username,password_hash,role) VALUES('${username.replaceAll("'","''")}','${hash}','ADMIN');`);
