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

  selectCollectSQL = `SELECT  DISTINCT
                       crt.IMEI,
                       rut.MIN
                      FROM collection_reports_tb crt
                      LEFT JOIN ref_units_tb rut ON rut.IMEI = crt.IMEI
                      WHERE entry_date LIKE '${req.params.targetDate}%'
                       AND print_series > 0
                      ORDER BY crt.IMEI, crt.print_series`;
  const collectResults = await new Promise((resolve, reject) => {
    sql.query(selectCollectSQL, async (err, rows, fields) => {
      if (err) reject(err);
      resolve(
        await new Promise((resolve, reject) => {
          let refUnitsTbl = {};
          rows.forEach((element) => {
            refUnitsTbl[element['IMEI']] = element['MIN'];
          });
          resolve(refUnitsTbl);
        }),
      );
    });
  });

  // used for SQL querying for `in` condition
  let inStringIMEI = Object.keys(collectResults).join(',');
  let inStringMIN = Object.values(collectResults).join(',');

  // res.send(JSON.stringify(refUnitsTbl));
  // res.send(JSON.stringify(receivedMissing));

  selectEntriesSQL = `SELECT rut.IMEI,
                             et.MIN,
                             et.print_series,
                             et.start_date,
                             rtt.vatable_sales,
                             rtt.vat_amount,
                             rtt.vat_exempt,
                             rtt.zero_rated,
                             rtt.effective_from,
                             rtt.effective_to
                      FROM entries_tb et
                      LEFT JOIN ref_ticket_types_tb rtt ON rtt.ticket_id = et.ticket_type
                      LEFT JOIN ref_units_tb rut ON rut.MIN = et.MIN
                      WHERE et.MIN IN (${inStringMIN})
                       AND et.start_date LIKE '${req.params.targetDate}%'
                       AND et.print_series > 0
                      ORDER BY et.MIN, et.print_series`;
  const entriesResults = await new Promise((resolve, reject) => {
    sql.query(selectEntriesSQL, (err, rows, fields) => {
      if (err) reject(err);
      resolve(rows);
    });
  });

  let entriesIMEI = {};
  entriesResults.forEach((entry) => {
    if (typeof entriesIMEI[entry['IMEI']] === 'undefined')
      entriesIMEI[entry['IMEI']] = [];
    entriesIMEI[entry['IMEI']].push(entry);
  });

  selectTransactionsSQL = `SELECT tlt.IMEI,
                                  rut.MIN,
                                  tlt.print_series,
                                  tlt.datetime,
                                  rtt.total_amount,
                                  rtt.vatable_sales,
                                  rtt.vat_amount,
                                  rtt.vat_exempt,
                                  rtt.zero_rated,
                                  rtt.effective_from,
                                  rtt.effective_to
                            FROM transaction_logs_tb tlt
                            LEFT JOIN ref_ticket_types_tb rtt ON rtt.ticket_id = tlt.ticket_type
                            LEFT JOIN ref_units_tb rut ON rut.IMEI = tlt.IMEI
                            WHERE rut.MIN IN (${inStringMIN})
                             AND tlt.datetime LIKE '${req.params.targetDate}%'
                             AND tlt.print_series > 0
                            ORDER BY rut.MIN, tlt.print_series`;
  const transactionResults = await new Promise((resolve, reject) => {
    sql.query(selectTransactionsSQL, (err, rows, fields) => {
      if (err) reject(err);
      resolve(rows);
    });
  });

  let transactionIMEI = {};
  transactionResults.forEach((transact) => {
    if (typeof transactionIMEI[transact['IMEI']] === 'undefined')
      transactionIMEI[transact['IMEI']] = [];
    transactionIMEI[transact['IMEI']].push(transact);
  });

  let rawData = {
    targetDate: req.params.targetDate,
    results: { inTransact: {}, inEntries: {}, noData: {} },
  };

  for (const current_collect_IMEI in receivedMissing.results) {
    let remainingToSearch = [];
    // receivedMissing.results[357...] = [1,2,3,...]
    receivedMissing.results[current_collect_IMEI].forEach(
      (collect_print_series) => {
        // if entries[] exists, search there first.

        if (Array.isArray(entriesIMEI[current_collect_IMEI])) {
          //check if found in entries
          for (let i = 0; i <= entriesIMEI[current_collect_IMEI].length; i++) {
            let entry_print_series =
              entriesIMEI[current_collect_IMEI][i].print_series;
            if (entry_print_series > collect_print_series) {
              //if not found, push to remainingToSearch to search in Transact
              //push to rawData noData for now for checking
              remainingToSearch.push(collect_print_series);
              break;
            }
            //if found in entries, push to found in entries in rawData
            if (entry_print_series === collect_print_series) {
              // create array in rawData according to IMEI and push there
              if (
                !Array.isArray(rawData.results.inEntries[current_collect_IMEI])
              )
                rawData.results.inEntries[current_collect_IMEI] = [];
              rawData.results.inEntries[current_collect_IMEI].push(
                collect_print_series,
              );
              break;
            }
          }
        } else {
          // check if transacts[] exists
          if (Array.isArray(transactionIMEI[current_collect_IMEI])) {
            for (
              let i = 0;
              i <= transactionIMEI[current_collect_IMEI].length;
              i++
            ) {
              let transaction_print_series =
                transactionIMEI[current_collect_IMEI][i].print_series;
              if (transaction_print_series > collect_print_series) {
                //if not found, data missing
                if (
                  !Array.isArray(rawData.results.noData[current_collect_IMEI])
                )
                  rawData.results.noData[current_collect_IMEI] = [];
                rawData.results.noData[current_collect_IMEI].push(
                  collect_print_series,
                );
                break;
              }

              //if found in transaction, push to found in transaction in rawData
              if (transaction_print_series === collect_print_series) {
                // create array in rawData according to IMEI and push there
                if (
                  !Array.isArray(
                    rawData.results.inTransact[current_collect_IMEI],
                  )
                )
                  rawData.results.inTransact[current_collect_IMEI] = [];
                rawData.results.inTransact[current_collect_IMEI].push(
                  collect_print_series,
                );
                break;
              }
            }
          }
          //if it doesn't exist all items are missing
          else {
            //due to the nature of the foreach, will iterate this every time
            if (!Array.isArray(rawData.results.noData[current_collect_IMEI]))
              rawData.results.noData[current_collect_IMEI] = [];
            rawData.results.noData[current_collect_IMEI].push(
              collect_print_series,
            );
          }
        }
      },
    );

    //if there are contents in remainingToSearch[], check in transactions
    if (
      remainingToSearch.length > 0 &&
      Array.isArray(transactionIMEI[current_collect_IMEI])
    ) {
      remainingToSearch.forEach((collect_print_series) => {
        if (Array.isArray(transactionIMEI[current_collect_IMEI])) {
          for (
            let i = 0;
            i <= transactionIMEI[current_collect_IMEI].length;
            i++
          ) {
            let transaction_print_series =
              transactionIMEI[current_collect_IMEI][i].print_series;
            if (transaction_print_series > collect_print_series) {
              //if not found, data missing
              if (!Array.isArray(rawData.results.noData[current_collect_IMEI]))
                rawData.results.noData[current_collect_IMEI] = [];
              rawData.results.noData[current_collect_IMEI].push(
                collect_print_series,
              );
              break;
            }

            //if found in transaction, push to found in transaction in rawData
            if (transaction_print_series === collect_print_series) {
              // create array in rawData according to IMEI and push there
              if (
                !Array.isArray(rawData.results.inTransact[current_collect_IMEI])
              )
                rawData.results.inTransact[current_collect_IMEI] = [];
              rawData.results.inTransact[current_collect_IMEI].push(
                collect_print_series,
              );
              break;
            }
          }
        }
      });
    }
    //else, all remaining to search are missing
    else {
      remainingToSearch.forEach((collect_print_series) => {
        //due to the nature of the foreach, will iterate this every time
        if (!Array.isArray(rawData.results.noData[current_collect_IMEI]))
          rawData.results.noData[current_collect_IMEI] = [];
        rawData.results.noData[current_collect_IMEI].push(collect_print_series);
      });
    }
  }
  res.send(JSON.stringify(consolidateKeys(rawData)));
}

function consecutivelyGroupItems(imeiArray) {
  const result = imeiArray.reduce((r, n) => {
    const lastSubArray = r[r.length - 1];

    if (!lastSubArray || lastSubArray[lastSubArray.length - 1] !== n - 1) {
      r.push([]);
    }

    r[r.length - 1].push(n);

    return r;
  }, []);
  return result;
}

function consolidateKeys(rawDataJSON) {
  let jsonResultsEntries = rawDataJSON.results.inEntries;
  let jsonResultsTransact = rawDataJSON.results.inTransact;
  let jsonResultsNoData = rawDataJSON.results.noData;
  let returnData = {
    targetDate: rawDataJSON.targetDate,
    results: { inTransact: {}, inEntries: {}, noData: {} },
  };

  for (const key in jsonResultsEntries) {
    if (!Array.isArray(returnData.results.inEntries[key]))
      returnData.results.inEntries[key] = [];
    let toConsolidate = consecutivelyGroupItems(jsonResultsEntries[key]);
    let toPush = [];
    toConsolidate.forEach((innerArray) => {
      toPush.push([innerArray[0], innerArray[innerArray.length - 1]]);
    });
    returnData.results.inEntries[key] = toPush;
  }

  for (const key in jsonResultsTransact) {
    if (!Array.isArray(returnData.results.inTransact[key]))
      returnData.results.inTransact[key] = [];
    let toConsolidate = consecutivelyGroupItems(jsonResultsTransact[key]);
    let toPush = [];
    toConsolidate.forEach((innerArray) => {
      toPush.push([innerArray[0], innerArray[innerArray.length - 1]]);
    });
    returnData.results.inTransact[key] = toPush;
  }

  for (const key in jsonResultsNoData) {
    if (!Array.isArray(returnData.results.noData[key]))
      returnData.results.noData[key] = [];
    let toConsolidate = consecutivelyGroupItems(jsonResultsNoData[key]);
    let toPush = [];
    toConsolidate.forEach((innerArray) => {
      toPush.push([innerArray[0], innerArray[innerArray.length - 1]]);
    });
    returnData.results.noData[key] = toPush;
  }

  return returnData;
}

module.exports = {
  getCollections,
  getMissing,
  verifyMissing,
};
