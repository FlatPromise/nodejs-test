const fs = require('node:fs');
const express = require('express');
const mysql = require('mysql');
const entries_callback = require('./entries_callback');
const collections_callback = require('./collections_callback');

const app = express();
const connection = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'mapa_data',
});
const port = 3000;

connection.connect();
// connection.end();
// connection.resume();

app.get('/api/collections/:targetDate', (req, res) => {
  collections_callback.getCollections(req, res, connection);
});

app.get('/api/collections/:targetDate/missing', (req, res) => {
  collections_callback.getMissing(req, res);
});

app.get('/api/collections/:targetDate/missing/verify', (req, res) => {
  collections_callback.verifyMissing(req, res, connection);
});

app.get('/api/entries/:targetDate', (req, res) => {
  entries_callback.getEntries(req, res, connection);
});

app.get('/api/entries/:targetDate/missing', (req, res) => {
  entries_callback.getMissing(req, res);
});

app.get('/api/entries/:targetDate/missing/verify', (req, res) => {
  entries_callback.verifyMissing(req, res, connection);
});

app.get('/test', (req, res) => {
  res.send('this is a test get');
});

app.get('/', (req, res) => {
  res.send('Hello World');
});

app.listen(port, () => {
  console.log(`App listening on port ${port}`);
});
