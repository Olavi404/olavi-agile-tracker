'use strict';

const express = require('express');
const path = require('path');
const { createStore } = require('./dataStore');
const { createStoriesRouter } = require('./routes/stories');

function createApp(dataFilePath) {
  const store = createStore(dataFilePath);
  const app = express();

  app.use(express.json());

  // Vigase JSON body korral tagasta arusaadav 400 vastus (mitte Express'i vaikimisi HTML viga)
  app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'Päringu keha ei ole korrektne JSON.' });
    }
    next(err);
  });

  // Lihtne tervisekontroll (monitooringu/deploy-kontrolli jaoks)
  app.get('/api/health', (req, res) => {
    res.status(200).json({ status: 'ok', uptime: process.uptime() });
  });

  app.use('/api/stories', createStoriesRouter(store));

  // Tundmatu API tee -> JSON 404, mitte HTML
  app.use('/api', (req, res) => {
    res.status(404).json({ error: 'Sellist API teed ei eksisteeri.' });
  });

  app.use(express.static(path.join(__dirname, '..', 'public')));

  // Üldine viimane veakäsitleja
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: 'Serveris tekkis ootamatu viga.' });
  });

  return app;
}

module.exports = { createApp };
