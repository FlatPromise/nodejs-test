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

module.exports = {
  getEntries,
};
