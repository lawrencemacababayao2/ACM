import { Router } from 'express';
import { pool } from '../config/db.js';
import { getSmsCredits } from '../services/sms.js';
import { auth, adminOnly } from '../middleware/auth.js';
import { wrap } from '../lib/utils.js';
import { trainingLifecycle, programLifecycle } from '../lib/lifecycle.js';

const router = Router();

// GET /api/dashboard  (admin stats)
router.get('/', auth, adminOnly, wrap(async (req, res) => {
  const [[bCounts]] = await pool.query(
    `SELECT COUNT(*) AS total,
            SUM(status = 'pending') AS pending
     FROM beneficiaries`
  );
  const [[rCounts]] = await pool.query(
    `SELECT COUNT(*) AS total,
            SUM(status = 'pending') AS pending
     FROM requests`
  );
  const [[aCount]] = await pool.query("SELECT COUNT(*) AS c FROM announcements WHERE status = 'published'");

  // Upcoming = upcoming + ongoing: a session running today is the nearest thing
  // to "next" and belongs on the card. The legacy status column is just publish
  // state for non-cancelled rows, so lifecycles are derived the same way the
  // admin lists compute them.
  const [pubTrainings] = await pool.query(
    `SELECT event_date, start_time, end_time, status
     FROM trainings WHERE publish_status = 'published'`
  );
  const activeTrainings = pubTrainings.filter((t) => {
    const phase = trainingLifecycle(t);
    return phase === 'upcoming' || phase === 'ongoing';
  });
  const upcomingTrainings = activeTrainings.length;
  let nextTrainingDate = null;
  if (activeTrainings.length) {
    const soonest = activeTrainings.slice().sort((a, b) =>
      String(a.event_date).localeCompare(String(b.event_date)) ||
      String(a.start_time || '').localeCompare(String(b.start_time || ''))
    )[0];
    nextTrainingDate = soonest.event_date;
  }

  // Programs follow the same rule: upcoming + ongoing, derived from the single
  // schedule DATETIME the programs table carries, exactly as the admin list does.
  const [pubPrograms] = await pool.query(
    `SELECT schedule, end_at, cancelled
     FROM programs WHERE status = 'published'`
  );
  const activePrograms = pubPrograms.filter((p) => {
    const phase = programLifecycle(p);
    return phase === 'upcoming' || phase === 'ongoing';
  });
  const upcomingPrograms = activePrograms.length;

  const [[smsAgg]] = await pool.query(
    `SELECT
       SUM(status = 'sent') AS sent,
       SUM(status = 'log') AS logged,
       SUM(status = 'failed') AS failed
     FROM notifications`
  );

  const [[today]] = await pool.query(
    `SELECT
       (SELECT COUNT(*) FROM beneficiaries WHERE DATE(created_at) = CURDATE())     AS beneficiaries,
       (SELECT COUNT(*) FROM requests       WHERE DATE(created_at) = CURDATE())     AS requests,
       (SELECT COUNT(*) FROM announcements  WHERE DATE(created_at) = CURDATE())     AS announcements,
       (SELECT COUNT(*) FROM notifications  WHERE status IN ('sent', 'log')
          AND DATE(sent_at) = CURDATE())                                            AS smsSent`
  );

  const [recentRequests] = await pool.query(
    `SELECT r.*, b.first_name, b.last_name FROM requests r
     LEFT JOIN beneficiaries b ON b.id = r.beneficiary_id
     ORDER BY r.created_at DESC, r.id DESC LIMIT 8`
  );
const [recentAnnouncements] = await pool.query(
  "SELECT * FROM announcements WHERE status = 'published' ORDER BY created_at DESC, id DESC LIMIT 8"
);

  res.json({
    beneficiaries: { total: Number(bCounts.total) || 0, pending: Number(bCounts.pending) || 0 },
    requests: { total: Number(rCounts.total) || 0, pending: Number(rCounts.pending) || 0 },
    announcements: Number(aCount.c) || 0,
    upcomingTrainings: Number(upcomingTrainings) || 0,
    upcomingPrograms: Number(upcomingPrograms) || 0,
    sms: {
      sent: (Number(smsAgg.sent) || 0) + (Number(smsAgg.logged) || 0),
      failed: Number(smsAgg.failed) || 0,
      credits: await getSmsCredits(),
    },
    today: {
      beneficiaries: Number(today.beneficiaries) || 0,
      requests: Number(today.requests) || 0,
      announcements: Number(today.announcements) || 0,
      smsSent: Number(today.smsSent) || 0,
    },
    nextTrainingDate: nextTrainingDate || null,
    recentRequests,
    recentAnnouncements,
  });
}));

export default router;
