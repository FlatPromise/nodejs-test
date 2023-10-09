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
        res.send(jsonResult);
      });
    } catch (error) {
      console.log(error);
    }
  } else {
    jsonResult.error = 'bad date';
    res.send(jsonResult);
  }
}

module.exports = {
  getCollections,
};
