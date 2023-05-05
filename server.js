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
app.get('/api/posts/friends/:user_id', function (req, res) {
  // get all posts from user friends
  connection.query(
    'SELECT * FROM Posts WHERE user_id IN (SELECT friend_id FROM Friends WHERE user_id = ?)',
    [req.params.user_id],
    (error, results) => {
      if (error) throw error;
      res.send(results);
    }
  );
});
app.post('/api/posts/:user_id', function (req, res) {
  // create new post
  connection.query(
    'INSERT INTO Posts (user_id, content) VALUES (?, ?)',
    [req.params.user_id, req.body.content],
    (error, results) => {
      if (error) throw error;
      res.send(results);
    }
  );
});
app.get('/api/posts/:user_id/', function (req, res) {
  // get all posts from user
  connection.query(
    'SELECT * FROM Posts WHERE user_id = ?',
    [req.params.user_id],
    (error, results) => {
      if (error) throw error;
      res.send(results);
    }
  );
});
app.get('/api/post/:post_id', function (req, res) {
  // get post by id
  connection.query(
    'SELECT * FROM Posts WHERE post_id = ?',
    [req.params.post_id],
    (error, results) => {
      if (error) throw error;
      res.send(results);
    }
  );
});

app.listen(port, () => {
  console.log(`App running on port ${port}.`);
});
