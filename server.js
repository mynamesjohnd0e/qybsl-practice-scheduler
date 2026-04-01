const express = require('express');
const cors    = require('cors');
const fs      = require('fs');
const path    = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;
const DB   = path.join(__dirname, 'bookings.json');

// ── Storage mode ─────────────────────────────────────────────────────────────
// When FIRESTORE_PROJECT_ID is set (Cloud Run), use Firestore.
// Otherwise fall back to local bookings.json (Render, local dev).
const USE_FIRESTORE = !!process.env.FIRESTORE_PROJECT_ID;
let firestoreDB = null;

if (USE_FIRESTORE) {
  const { Firestore } = require('@google-cloud/firestore');
  firestoreDB = new Firestore({ projectId: process.env.FIRESTORE_PROJECT_ID });
  console.log(`Storage: Firestore (project: ${process.env.FIRESTORE_PROJECT_ID})`);
} else {
  console.log('Storage: local file (bookings.json)');
}

const DIVISIONS = {
  'Instructional': 8,
  'Farm 8':        6,
  'Farm 9':        8,
  'Minors':        5,
  'Majors':        6,
  'Babe Ruth':     4
};
const TOTAL_TEAMS = 37;

// ── Storage helpers ───────────────────────────────────────────────────────────
async function readDB() {
  if (USE_FIRESTORE) {
    const snap = await firestoreDB.collection('bookings').get();
    return snap.docs.map(d => d.data());
  }
  try {
    return JSON.parse(fs.readFileSync(DB, 'utf8'));
  } catch (_) {
    return [];
  }
}

async function addToDB(booking) {
  if (USE_FIRESTORE) {
    await firestoreDB.collection('bookings').doc(String(booking.id)).set(booking);
  } else {
    const data = await readDB();
    data.push(booking);
    fs.writeFileSync(DB, JSON.stringify(data, null, 2));
  }
}

async function deleteFromDB(id) {
  if (USE_FIRESTORE) {
    const ref = firestoreDB.collection('bookings').doc(String(id));
    const doc = await ref.get();
    if (!doc.exists) return false;
    await ref.delete();
    return true;
  }
  const data = await readDB();
  const idx = data.findIndex(b => String(b.id) === String(id));
  if (idx === -1) return false;
  data.splice(idx, 1);
  fs.writeFileSync(DB, JSON.stringify(data, null, 2));
  return true;
}

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// ── Routes ────────────────────────────────────────────────────────────────────
app.get('/api/health', async (req, res) => {
  try {
    const bookings = await readDB();
    res.json({
      ok:      true,
      count:   bookings.length,
      ts:      new Date().toISOString(),
      storage: USE_FIRESTORE ? 'firestore' : 'file'
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/api/bookings', async (req, res) => {
  try {
    res.json(await readDB());
  } catch (e) {
    console.error('readDB error:', e);
    res.status(500).json({ error: 'Failed to read bookings.' });
  }
});

app.post('/api/bookings', async (req, res) => {
  const { coach, sponsor, division, team, field, day, slot, color } = req.body;

  if (!coach || !division || !team || !field || !day || !slot) {
    return res.status(400).json({ error: 'Missing required fields.' });
  }

  try {
    const bookings = await readDB();
    const teamId   = division + '-' + team;
    const teamLabel = sponsor
      ? `${sponsor} (${division} #${team})`
      : `${division} Team ${team}`;

    // Slot conflict check
    const conflict = bookings.find(b => b.field === field && b.day === day && b.slot === slot);
    if (conflict) {
      return res.status(409).json({
        error:   'conflict',
        message: `That field and time is already taken by ${conflict.teamLabel} (Coach: ${conflict.coach}).`
      });
    }

    // Duplicate team check
    const duplicate = bookings.find(b => b.teamId === teamId);
    if (duplicate) {
      return res.status(409).json({
        error:   'duplicate',
        message: `${teamId} already has a confirmed slot.`
      });
    }

    const booking = {
      id:        Date.now(),
      teamId,
      teamLabel,
      coach,
      sponsor:   sponsor || '',
      division,
      team:      parseInt(team),
      field,
      day,
      slot,
      color:     color || '#1B3A6B',
      createdAt: new Date().toISOString()
    };

    await addToDB(booking);
    res.status(201).json(booking);
  } catch (e) {
    console.error('POST /api/bookings error:', e);
    res.status(500).json({ error: 'Failed to save booking.' });
  }
});

app.delete('/api/bookings/:id', async (req, res) => {
  try {
    const found = await deleteFromDB(req.params.id);
    if (!found) return res.status(404).json({ error: 'Not found.' });
    res.json({ ok: true });
  } catch (e) {
    console.error('DELETE /api/bookings error:', e);
    res.status(500).json({ error: 'Failed to delete booking.' });
  }
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`QYBSL Scheduler running on port ${PORT}`);
  readDB()
    .then(data => console.log(`Bookings in storage: ${data.length}`))
    .catch(() => console.log('Could not read initial bookings count'));
});
