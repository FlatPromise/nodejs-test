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

        if (missingStart === missingEnd) missingArray.push(missingStart);
        else {
          for (let i = missingStart; i <= missingEnd; i++) {
            missingArray.push(i);
          }
        }

        expectedPrintSeries = element['print_series'];
      }

      if (index === current_imei_block.length - 1 && missingArray.length > 0)
        jsonResult.results[element['IMEI']] = missingArray;
    });
  }
  res.send(JSON.stringify(jsonResult));
}

async function verifyMissing(req, res, sql) {
  const response = await fetch(
    `http://${req.headers.host}/api/collections/${req.params.targetDate}/missing`,
  );
  const receivedMissing = await response.json();

  if (receivedMissing.hasOwnProperty('error')) {
    return res.send(JSON.stringify(receivedMissing));
  }

  // selectCollectSQL = `SELECT crt.IMEI,
  //                      rut.MIN,
  //                      crt.print_series,
  //                      crt.entry_date,
  //                      crt.total_amount,
  //                      crt.vatable_sales,
  //                      crt.vat_amount,
  //                      crt.vat_exempt,
  //                      crt.zero_rated
  //                     FROM collection_reports_tb crt
  //                     LEFT JOIN ref_units_tb rut ON rut.IMEI = crt.IMEI
  //                     WHERE entry_date LIKE '${req.params.targetDate}%'
  //                      AND print_series > 0
  //                     ORDER BY crt.IMEI, crt.print_series`;
  selectCollectSQL = `SELECT  DISTINCT
                       crt.IMEI,
                       rut.MIN
                      FROM collection_reports_tb crt
                      LEFT JOIN ref_units_tb rut ON rut.IMEI = crt.IMEI
                      WHERE entry_date LIKE '${req.params.targetDate}%'
                       AND print_series > 0
                      ORDER BY crt.IMEI, crt.print_series`;
  const collectResults = await new Promise((resolve, reject) => {
    sql.query(selectCollectSQL, (err, rows, fields) => {
      if (err) reject(err);
      resolve(rows);
    });
  });

  let refUnitsTbl = {};
  collectResults.forEach((element) => {
    refUnitsTbl[element['IMEI']] = element['MIN'];
  });
  // used for SQL querying for `in` condition
  let inStringIMEI = Object.keys(refUnitsTbl).join(',');
  let inStringMIN = Object.values(refUnitsTbl).join(',');

  res.send(refUnitsTbl);
  selectEntriesSQL = ``;
  selectTransactionsSQL = ``;
}

module.exports = {
  getCollections,
  getMissing,
  verifyMissing,
};
