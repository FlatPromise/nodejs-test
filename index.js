const express = require('express');
const mysql = require('mysql');
const entries_callback = require('./entries_callback');

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
  let jsonResult = { results: {} };
  jsonResult.targetDate = req.params.targetDate;

  if (/\d{4}-\d{2}/.test(req.params.targetDate)) {
    jsonResult.targetDate = req.params.targetDate;
    let sqlQuery = `SELECT * FROM collection_reports_tb 
                    WHERE entry_date LIKE '${req.params.targetDate}%' 
                    ORDER BY IMEI,print_series`;

    let last_imei = 0;
    let array = [];
    connection.query(sqlQuery, (err, rows, fields) => {
      // jsonResult.results = rows;
      // res.send(jsonResult);

      rows.forEach((row) => {
        if (last_imei === 0) last_imei = row['IMEI'];

        if (last_imei != row['IMEI']) {
          jsonResult.results[last_imei] = array;
          array = [];
          last_imei = row['IMEI'];
        }
        array.push(row);
      });
      res.send(jsonResult);
    });
  } else {
    jsonResult.error = 'bad date input';
    res.send(jsonResult);
  }
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
