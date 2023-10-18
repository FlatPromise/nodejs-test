async function getEntries(req, res, sql) {
  let jsonResult = { results: {} };
  jsonResult.targetDate = req.params.targetDate;

  if (/^\d{4}-\d{2}$/.test(req.params.targetDate)) {
    let sqlQuery = `SELECT MIN,
                           plate_no,
                           ticket_type,
                           start_date,
                           print_series
                    FROM entries_tb 
                    WHERE start_date LIKE '${req.params.targetDate}%'
                     AND print_series > 0 
                    ORDER BY MIN,print_series`;

    try {
      const results = await new Promise((resolve, reject) => {
        sql.query(sqlQuery, (err, rows, fields) => {
          if (err) reject(err);
          resolve(rows);
        });
      });

      await new Promise((resolve, reject) => {
        let last_MIN = 0;
        let array = [];
        results.forEach((row, index, this_array) => {
          if (last_MIN === 0) last_MIN = row['MIN'];

          if (last_MIN != row['MIN']) {
            jsonResult.results[last_MIN] = array;
            array = [];
            last_MIN = row['MIN'];
          } else if (index === this_array.length - 1) {
            jsonResult.results[last_MIN] = array;
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
    `http://${req.headers.host}/api/entries/${req.params.targetDate}`,
  );
  let receivedJson = await response.json();

  if (receivedJson.hasOwnProperty('error')) {
    return res.send(JSON.stringify(receivedJson));
  }

  let jsonResult = { targetDate: receivedJson.targetDate, results: {} };

  for (const current_min in receivedJson.results) {
    let current_min_block = receivedJson.results[current_min];
    let expectedPrintSeries = 0;
    let missingArray = [];

    current_min_block.forEach((element, index) => {
      expectedPrintSeries++;

      if (expectedPrintSeries - 1 === element['print_series'])
        expectedPrintSeries = element['print_series'];
      else if (expectedPrintSeries != element['print_series']) {
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

      if (index === current_min_block.length - 1 && missingArray.length > 0) {
        jsonResult.results[element['MIN']] = missingArray;
      }
    });
  }
  res.send(JSON.stringify(jsonResult));
}

async function verifyMissing(req, res, sql) {
  const response = await fetch(
    `http://${req.headers.host}/api/entries/${req.params.targetDate}/missing`,
  );
  const receivedMissing = await response.json();

  if (receivedMissing.hasOwnProperty('error')) {
    return res.send(JSON.stringify(receivedMissing));
  }

  let selectEntriesSQL = `SELECT DISTINCT et.MIN,
                                          rut.IMEI
                          FROM entries_tb et
                          LEFT JOIN ref_units_tb rut ON rut.MIN = et.MIN
                          WHERE start_date LIKE '${req.params.targetDate}%'
                           AND print_series > 0
                          ORDER BY et.MIN`;
  const entriesResults = await new Promise((resolve, reject) => {
    sql.query(selectEntriesSQL, async (err, rows, fields) => {
      if (err) reject(err);
      resolve(
        await new Promise((resolve, reject) => {
          let refUnitsTbl = {};
          rows.forEach((element) => {
            refUnitsTbl[element['MIN']] = element['IMEI'];
          });
          resolve(refUnitsTbl);
        }),
      );
    });
  });

  let inStringIMEI = Object.values(entriesResults).join(',');
  let inStringMIN = Object.keys(entriesResults).join(',');

  let selectCollectSQL = `SELECT rut.MIN,
                                 crt.IMEI,
                                 crt.print_series,
                                 crt.entry_date,
                                 crt.vatable_sales,
                                 crt.vat_amount,
                                 crt.vat_exempt,
                                 rtt.zero_rated,
                                 rtt.effective_from,
                                 rtt.effective_to
                          FROM collection_reports_tb crt
                          LEFT JOIN ref_ticket_types_tb rtt ON rtt.ticket_id = crt.ticket_id
                          LEFT JOIN ref_units_tb rut ON rut.IMEI = crt.IMEI
                          WHERE crt.IMEI IN (${inStringIMEI})
                           AND crt.entry_date LIKE '${req.params.targetDate}%'
                           AND crt.print_series > 0
                          ORDER BY rut.MIN, crt.print_series`;
  const collectResults = await new Promise((resolve, reject) => {
    sql.query(selectCollectSQL, (err, rows, fields) => {
      if (err) reject(err);
      resolve(rows);
    });
  });

  let collectMIN = {};
  collectResults.forEach((collect) => {
    if (typeof collectMIN[collect['MIN']] === 'undefined')
      collectMIN[collect['MIN']] = [];
    collectMIN[collect['MIN']].push(collect);
  });

  let selectTransactionsSQL = `SELECT tlt.IMEI,
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

  let transactionMIN = {};
  transactionResults.forEach((transact) => {
    if (typeof transactionMIN[transact['IMEI']] === 'undefined')
      transactionMIN[transact['MIN']] = [];
    transactionMIN[transact['MIN']].push(transact);
  });

  let rawData = {
    targetDate: req.params.targetDate,
    results: { inTransact: {}, inEntries: {}, noData: {} },
  };

  for (const current_entries_min in receivedMissing.results) {
    let remainingToSearch = [];

    receivedMissing.results[current_entries_min].forEach(
      (entries_print_series) => {
        if (Array.isArray(collectMIN[current_entries_min])) {
          for (let i = 0; i <= collectMIN[current_entries_min].length; i++) {
            let collect_print_series =
              collectMIN[current_entries_min][i].print_series;
            console.log('a');
            if (collect_print_series > entries_print_series) {
              remainingToSearch.push(collect_print_series);
              break;
            }
            if (collect_print_series === entries_print_series) {
              if (
                !Array.isArray(rawData.results.inEntries[current_entries_min])
              )
                rawData.results.inEntries[current_entries_min] = [];
              rawData.results.inEntries[current_collect_IMEI].push(
                collect_print_series,
              );
              break;
            }
          }
        } else {
          if (Array.isArray(transactionMIN[current_entries_min])) {
            for (
              let i = 0;
              i <= transactionMIN[current_entries_min].length;
              i++
            ) {
              let transaction_print_series =
                transactionMIN[current_entries_min][i].print_series;

              if (transaction_print_series > entries_print_series) {
                if (!Array.isArray(rawData.results.noData[current_entries_min]))
                  rawData.results.noData[current_entries_min] = [];
                rawData.results.noData[current_entries_min].push(
                  entries_print_series,
                );
                break;
              }

              if (transaction_print_series === entries_print_series) {
                if (
                  !Array.isArray(
                    rawData.results.inTransact[current_entries_min],
                  )
                )
                  rawData.results.inTransact[current_entries_min] = [];
                rawData.results.inTransact[current_entries_min].push(
                  entries_print_series,
                );
                break;
              }
            }
          }
        }

        // if (
        //   remainingToSearch.length > 0 &&
        //   Array.isArray(transactionMIN[current_entries_min])
        // ) {
        //   remainingToSearch.forEach((entries_print_series) => {
        //     if (Array.isArray(transactionMIN[current_entries_min])) {
        //       for (
        //         let i = 0;
        //         i <= transactionMIN[current_entries_min].length;
        //         i++
        //       ) {
        //         if (Array.isArray(transactionMIN[current_entries_min])) {
        //           for (
        //             let i = 0;
        //             i <= transactionMIN[current_entries_min].length;
        //             i++
        //           ) {
        //             let transaction_print_series =
        //               transactionMIN[current_entries_min][i].print_series;

        //             if (transaction_print_series > entries_print_series) {
        //               if (
        //                 !Array.isArray(
        //                   rawData.results.noData[current_entries_min],
        //                 )
        //               )
        //                 rawData.results.noData[current_entries_min] = [];
        //               rawData.results.noData[current_entries_min].push(
        //                 entries_print_series,
        //               );
        //               break;
        //             }

        //             if (transaction_print_series === entries_print_series) {
        //               if (
        //                 !Array.isArray(
        //                   rawData.results.inTransact[current_entries_min],
        //                 )
        //               )
        //                 rawData.results.inTransact[current_entries_min] = [];
        //               rawData.results.inTransact[current_entries_min].push(
        //                 entries_print_series,
        //               );
        //               break;
        //             }
        //           }
        //         }
        //       }
        //     }
        //   });
        // }
      },
    );
  }
  res.send(JSON.stringify(rawData));
}

module.exports = {
  getEntries,
  getMissing,
  verifyMissing,
};
