const fetch = require('node-fetch');
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
// connection.query('SELECT 1 + 1 AS solution', (err, rows, fields) => {
//   if (err) throw err;

//   console.log('The solution is: ', rows[0].solution);
// });
// connection.end();
// connection.resume();

app.get('/api/collections/:targetDate', (req, res) => {
  collections_callback.getCollections(req, res, connection);
});

app.get('/api/collections/:targetDate/missing', async (req, res) => {
  // const fetchResult = await fetch(
  //   `http://localhost:3000/api/collections/${req.params.targetDate}`,
  // );

  fetch(`http://localhost:3000/api/collections/${req.params.targetDate}`)
    .then((res) => res.text())
    .then((text) => console.log(text));
});

app.get('/api/entries/:targetDate', (req, res) => {
  entries_callback.getEntries(req, res, connection);
});

app.get('/', (req, res) => {
  res.send('Hello World');
});

app.listen(port, () => {
  console.log(`App listening on port ${port}`);
});
