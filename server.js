'use strict';

const path = require('path');
const { createApp } = require('./src/app');

const PORT = process.env.PORT || 3000;
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, 'data', 'stories.json');

const app = createApp(DATA_FILE);

app.listen(PORT, () => {
  console.log(`Agile Tracker server käivitatud: http://localhost:${PORT}`);
  console.log(`Andmefail: ${DATA_FILE}`);
});
