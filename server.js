const express = require('express');
const bodyParser = require('body-parser');
const dbConfig = require('./config');
const mysql = require('mysql');

const app = express();
const port = 3000;
app.use(bodyParser.json());
app.use(
  bodyParser.urlencoded({
    extended: true,
  })
);
const connection = mysql.createConnection({
  host: dbConfig.db.host,
  user: dbConfig.db.user,
  password: dbConfig.db.password,
  database: dbConfig.db.database,
});
connection.connect((error) => {
  if (error) throw error;
  console.log('Successfully connected to the database.');
});
app.get('/users', function (req, res) {});
app.listen(port, () => {
  console.log(`App running on port ${port}.`);
});
