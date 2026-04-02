#!/usr/bin/env node
/**
 * QYBSL Bookings CSV Exporter
 *
 * Usage (local):
 *   node scripts/export-csv.js                         # reads backup/bookings.json
 *   node scripts/export-csv.js https://your-app.onrender.com  # fetches live
 */

const fs   = require('fs');
const path = require('path');
const https = require('https');
const http  = require('http');

const FIELDS = {
  'orourke-large': { name: "O'Rourke (Large)",   loc: '549 Quarry St'       },
  'orourke-small': { name: "O'Rourke (Small)",   loc: '549 Quarry St'       },
  'bishop':        { name: 'Bishop Field',        loc: '108 Holbrook Rd'     },
  'coletta':       { name: 'Coletta/Merrymount',  loc: 'Merrymount Park'     },
  'pond':          { name: 'Pond Street',         loc: 'Pond St, off Rte 3A' },
  'brill':         { name: 'Brill Field',         loc: '29 Island Ave'       },
  'faxon':         { name: 'Faxon Park',          loc: '70 Faxon Park Rd'    },
  'perkins':       { name: 'Perkins',             loc: '4 Agawam Rd'         },
  'snug':          { name: 'Snug Harbor',         loc: '333 Palmer St'       },
  'pageant':       { name: 'Pageant Field',       loc: '1 Merrymount Pkwy'   },
  'welcomeyoung':  { name: 'Welcome Young',       loc: '73 Sagamore St'      },
  'labrecque':     { name: 'LaBrecque Field',     loc: '1000 Sea St'         },
};

const DIV_ORDER = ['Instructional','Farm 8','Farm 9','Minors','Majors','Babe Ruth','Softball'];

const DAYF = { Mon:'Monday', Tue:'Tuesday', Wed:'Wednesday', Thu:'Thursday', Fri:'Friday', Sat:'Saturday', Sun:'Sunday' };
const SLOTF = { '8am':'Early Morning (8am–10am)', '10am':'Late Morning (10am–12pm)', '12pm':'Early Afternoon (12pm–2pm)', '2pm':'Late Afternoon (2pm–4pm)', '4pm':'Early Evening (4pm–6pm)', '6pm':'Evening (6pm–8pm)' };

function csvRow(fields) {
  return fields.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',');
}

function toCSV(bookings) {
  const sorted = [...bookings].sort((a, b) => {
    const ai = DIV_ORDER.indexOf(a.division);
    const bi = DIV_ORDER.indexOf(b.division);
    return ai !== bi ? ai - bi : a.team - b.team;
  });

  const header = csvRow(['Division','Team #','Sponsor/Team Name','Coach','Field','Location','Day','Time Slot','Booking ID','Created At']);
  const rows = sorted.map(b => {
    const f = FIELDS[b.field] || { name: b.field, loc: '' };
    return csvRow([
      b.division,
      b.team,
      b.teamLabel,
      b.coach,
      f.name,
      f.loc,
      DAYF[b.day]  || b.day,
      SLOTF[b.slot] || b.slot,
      b.id,
      b.createdAt,
    ]);
  });

  return [header, ...rows].join('\r\n');
}

function fetchURL(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    lib.get(url, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('Invalid JSON from server')); }
      });
    }).on('error', reject);
  });
}

async function main() {
  const baseURL = process.argv[2];
  let bookings;

  if (baseURL) {
    const url = baseURL.replace(/\/$/, '') + '/api/bookings';
    console.log(`Fetching from ${url}…`);
    bookings = await fetchURL(url);
    // Also save a fresh bookings.json backup
    fs.mkdirSync(path.join(__dirname, '..', 'backup'), { recursive: true });
    fs.writeFileSync(
      path.join(__dirname, '..', 'backup', 'bookings.json'),
      JSON.stringify(bookings, null, 2)
    );
    console.log(`Saved ${bookings.length} booking(s) to backup/bookings.json`);
  } else {
    const localPath = path.join(__dirname, '..', 'backup', 'bookings.json');
    if (!fs.existsSync(localPath)) {
      console.error('No backup/bookings.json found. Pass a URL as argument or run after a fetch.');
      process.exit(1);
    }
    bookings = JSON.parse(fs.readFileSync(localPath, 'utf8'));
    console.log(`Loaded ${bookings.length} booking(s) from backup/bookings.json`);
  }

  if (!bookings.length) {
    console.log('No bookings to export.');
    return;
  }

  const csv = toCSV(bookings);
  const outPath = path.join(__dirname, '..', 'backup', 'QYBSL_Practice_Schedule_2026.csv');
  fs.writeFileSync(outPath, csv);
  console.log(`CSV written to backup/QYBSL_Practice_Schedule_2026.csv (${bookings.length} rows)`);
}

main().catch(e => { console.error(e.message); process.exit(1); });
