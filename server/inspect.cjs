const mysql = require("mysql2/promise");
(async () => {
  try {
    const c = await mysql.createConnection({ host: "127.0.0.1", port: 3307, user: "root", password: "" });
    const [users] = await c.query("SELECT User, Host, plugin FROM mysql.user ORDER BY Host, User");
    console.log("--- current accounts ---");
    users.forEach(r => console.log("  user:", r.User, "| host:", r.Host, "| plugin:", r.plugin));
    const [dbs] = await c.query("SELECT Db, User, Host FROM mysql.db");
    console.log("--- db grants ---");
    dbs.forEach(r => console.log("  db:", r.Db, "| user:", r.User, "| host:", r.Host));
    await c.end();
  } catch (e) { console.log("FAIL:", e.code, e.sqlMessage || e.message); }
})();
