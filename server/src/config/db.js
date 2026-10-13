import './tz.js';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

export const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'acm',
  waitForConnections: true,
  connectionLimit: 10,
  dateStrings: true,
  // Write JS Date params as Philippine wall-clock, regardless of the host clock.
  timezone: '+08:00',
});

// The `timezone` option only affects client-side conversion; the session itself
// still uses the DB server's zone (UTC on PlanetScale and most managed MySQL)
// for NOW()/CURRENT_TIMESTAMP and TIMESTAMP columns. Pin every pooled connection
// so production stores the same local time the app reads back.
pool.on('connection', (conn) => {
  conn.query("SET time_zone = '+08:00'");
});