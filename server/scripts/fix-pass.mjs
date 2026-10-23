import 'dotenv/config';
import bcrypt from 'bcryptjs';
import mysql from 'mysql2/promise';
const conn = await mysql.createConnection({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'acm'
});
const [rows] = await conn.query("SELECT id,role,email,mobile_number,password_hash FROM users WHERE mobile_number='09262879243' OR role='super_admin' ORDER BY role='super_admin' DESC");
console.log(rows.map(r => ({ id: r.id, role: r.role, mobile: r.mobile_number })));
const hash = await bcrypt.hash('lawrence123', 10);
const id = rows.find(r => r.mobile_number === '09262879243')?.id || rows[0]?.id;
if (id) {
  await conn.query('UPDATE users SET password_hash=? WHERE id=?', [hash, id]);
  console.log('updated', id);
}
await conn.end();
