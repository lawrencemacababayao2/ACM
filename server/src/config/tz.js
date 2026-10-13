// Pin the running Node process to Philippine Standard Time.
//
// Every timestamp in this app is a local wall-clock value: the DB supplies
// NOW()/CURRENT_TIMESTAMP, the server parses schedule strings with `new Date()`,
// and the admin/mobile UIs render the stored string as-is. A development machine
// is already on PHT so it all lines up, but production hosts (Fly.io, most
// containers/VPS) run in UTC, which pushed every stored and parsed time 8 hours
// behind. Import this module FIRST so the timezone is set before any other
// module touches Date.
process.env.TZ = 'Asia/Manila';
