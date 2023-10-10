const { json } = require('express');
const fetch = require('node-fetch');

async function getCollections(req, res, sql) {
  let jsonResult = { results: {} };
  jsonResult.targetDate = req.params.targetDate;

  if (/\d{4}-\d{2}/.test(req.params.targetDate)) {
    let sqlQuery = `SELECT *
                      FROM collection_reports_tb 
                      WHERE entry_date LIKE '${req.params.targetDate}%' 
                      ORDER BY IMEI,print_series`;

    try {
      const results = await new Promise((resolve, reject) => {
        sql.query(sqlQuery, (err, rows, fields) => {
          if (err) reject(err);
          resolve(rows);
        });
      });

      await new Promise((resolve, reject) => {
        let last_IMEI = 0;
        let array = [];
        results.forEach((row, index, this_array) => {
          if (last_IMEI === 0) last_IMEI = row['IMEI'];

          if (last_IMEI != row['IMEI']) {
            jsonResult.results[last_IMEI] = array;
            array = [];
            last_IMEI = row['IMEI'];
          } else if (index === this_array.length - 1) {
            jsonResult.results[last_IMEI] = array;
          }
          array.push(row);
        });
        resolve(jsonResult);
        res.send(JSON.stringify(jsonResult));
      });
    } catch (error) {
      console.log(error);
    }
  } else {
    jsonResult.error = 'bad date';
    res.send(JSON.stringify(jsonResult));
  }
}

async function getMissing(req, res) {
  let response = await fetch(
    `http://${req.headers.host}/api/collections/${req.params.targetDate}`,
  );
  let receivedJson = await response.json();

  if (receivedJson.hasOwnProperty('error')) {
    return res.send(JSON.stringify(receivedJson));
  }

  let jsonResult = { targetDate: receivedJson.targetDate, results: {} };

  for (const current_imei in receivedJson.results) {
    let current_imei_block = receivedJson.results[current_imei];
    let expectedPrintSeries = 0;
    let missingArray = [];
    current_imei_block.forEach((element, index) => {
      expectedPrintSeries++;

      if (expectedPrintSeries != element['print_series']) {
        let missingStart = expectedPrintSeries;
        let missingEnd = element['print_series'] - 1;
        missingArray.push([missingStart, missingEnd]);
        expectedPrintSeries = element['print_series'];
      }

      if (index === current_imei_block.length - 1 && missingArray.length > 0)
        jsonResult.results[element['IMEI']] = missingArray;
    });
  }
  res.send(JSON.stringify(jsonResult));
}

module.exports = {
  getCollections,
  getMissing,
};
