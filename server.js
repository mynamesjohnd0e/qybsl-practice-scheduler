const express = require('express');
const cors    = require('cors');
const fs      = require('fs');
const path    = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;
const DB   = path.join(__dirname, 'bookings.json');

const DIVISIONS = {
  'Instructional': 8,
  'Farm 8':        6,
  'Farm 9':        8,
  'Minors':        5,
  'Majors':        6,
  'Babe Ruth':     4
};
const TOTAL_TEAMS = 37;

// ── File I/O helpers ────────────────────────────────────────────────────────
function readDB() {
  try {
    return JSON.parse(fs.readFileSync(DB, 'utf8'));
  } catch (_) {
    return [];
  }
}

function writeDB(data) {
  fs.writeFileSync(DB, JSON.stringify(data, null, 2));
}

// ── Middleware ───────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// ── Routes ───────────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ ok: true, count: readDB().length, ts: new Date().toISOString() });
});

app.get('/api/bookings', (req, res) => {
  res.json(readDB());
});

app.post('/api/bookings', (req, res) => {
  const { coach, sponsor, division, team, field, day, slot, color } = req.body;

  if (!coach || !division || !team || !field || !day || !slot) {
    return res.status(400).json({ error: 'Missing required fields.' });
  }

  const bookings = readDB();
  const teamId   = division + '-' + team;
  const teamLabel = sponsor
    ? `${sponsor} (${division} #${team})`
    : `${division} Team ${team}`;

  // Slot conflict check
  const conflict = bookings.find(b => b.field === field && b.day === day && b.slot === slot);
  if (conflict) {
    return res.status(409).json({
      error: 'conflict',
      message: `That field and time is already taken by ${conflict.teamLabel} (Coach: ${conflict.coach}).`
    });
  }

  // Duplicate team check
  const duplicate = bookings.find(b => b.teamId === teamId);
  if (duplicate) {
    return res.status(409).json({
      error: 'duplicate',
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

  bookings.push(booking);
  writeDB(bookings);
  res.status(201).json(booking);
});

app.delete('/api/bookings/:id', (req, res) => {
  const bookings = readDB();
  const idx = bookings.findIndex(b => String(b.id) === String(req.params.id));
  if (idx === -1) {
    return res.status(404).json({ error: 'Not found.' });
  }
  bookings.splice(idx, 1);
  writeDB(bookings);
  res.json({ ok: true });
});

// ── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`QYBSL Scheduler running on port ${PORT}`);
  console.log(`Bookings on disk: ${readDB().length}`);
});
