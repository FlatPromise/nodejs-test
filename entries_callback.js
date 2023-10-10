async function getEntries(req, res, sql) {
  let jsonResult = { results: {} };
  jsonResult.targetDate = req.params.targetDate;

  if (/\d{4}-\d{2}/.test(req.params.targetDate)) {
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

        missingArray.push([missingStart, missingEnd]);
        expectedPrintSeries = element['print_series'];
      }

      if (index === current_min_block.length - 1 && missingArray.length > 0) {
        jsonResult.results[element['MIN']] = missingArray;
      }
    });
  }
  res.send(JSON.stringify(jsonResult));
}

module.exports = {
  getEntries,
  getMissing,
};
