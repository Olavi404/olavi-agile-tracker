'use strict';

const path = require('path');
const { createApp } = require('./src/app');

const PORT = process.env.PORT || 3000;
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, 'data', 'stories.json');

const app = createApp(DATA_FILE);

const server = app.listen(PORT, () => {
  console.log(`Agile Tracker server käivitatud: http://localhost:${PORT}`);
  console.log(`Andmefail: ${DATA_FILE}`);
});

// Serveri korrektne sulgemine (nt Ctrl+C või konteineri peatamine),
// et pooleliolevad päringud jõuaksid lõpetada enne protsessi väljumist.
function shutdown(signal) {
  console.log(`\n${signal} saadud, suletakse serverit...`);
  server.close(() => {
    console.log('Server suletud.');
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
