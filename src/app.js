const helmet = require('helmet');
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const expressPino = require('express-pino-logger');

const logger = require('./logger');
const db = require('./models/db');
const { getResponses } = require('./models/response');
const { getInjections } = require('./models/injection');
const { getActions } = require('./models/action');
const migrate = require('./util/migrate');
const config = require('./config');
const transformValidationErrors = require('./util/transformValidationErrors');

const app = express();

app.use(helmet());
app.use(cors());
app.use(
  expressPino({
    logger,
  }),
);
app.use(bodyParser.json());

app.get('/', async (req, res) => {
  try {
    await db.raw('SELECT 1;');
  } catch (_) {
    res.status(500);
    res.send({ status: 'not ok' });
    return;
  }
  res.status(200);
  res.send({
    status: 'ok',
  });
});

// STATIC DB data is exposed via REST api

app.get('/mitigations', async (req, res) => {
  const records = await db('mitigation');
  res.json(records);
});

app.get('/systems', async (req, res) => {
  const records = await db('system');
  res.json(records);
});

app.get('/injections', async (req, res) => {
  const records = await getInjections();
  res.json(records);
});

app.get('/responses', async (req, res) => {
  const records = await getResponses();
  res.json(records);
});

app.get('/actions', async (req, res) => {
  const records = await getActions();
  res.json(records);
});

app.get('/curveballs', async (req, res) => {
  const records = await db('curveball');
  res.json(records);
});

app.post('/migrate', async (req, res) => {
  const { password, apiKey, tableId } = req.body;
  if (password === config.migrationPassword) {
    try {
      await migrate(apiKey, tableId);
      res.send();
    } catch (err) {
      if (err.error === 'AUTHENTICATION_REQUIRED') {
        res.status(400).send({
          apiKey: 'Invalid airtable api key',
        });
      } else if (err.error === 'NOT_FOUND') {
        res.status(400).send({
          tableId: 'Invalid airtable base id',
        });
      } else if (
        err.validation ||
        (Array.isArray(err) && err.every((e) => e.validation))
      ) {
        const errors = transformValidationErrors(err);
        res.status(400).send({
          validation: true,
          message: err.message,
          errors,
        });
      } else {
        console.log(500);
        res.status(500).send({
          message:
            'There was an internal server error during the migration! Please contact the developers to fix it.',
        });
      }
      logger.error(err);
    }
  } else {
    res.status(400).json({
      password: 'Invalid master password',
    });
  }
});

module.exports = app;
