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

app.get('/api/posts/friends/:user_id', async function (req, res) {
  // get all posts from user friends with user username and profile picture, also get the all comments, and likes from each post and check if user liked the post

  connection.query(
    'SELECT Posts.*, Users.username, Users.avatar, (SELECT COUNT(*) FROM Likes WHERE post_id = Posts.post_id) AS likes, (SELECT COUNT(*) FROM Comments WHERE post_id = Posts.post_id) AS comments, (SELECT COUNT(*) FROM Likes WHERE post_id = Posts.post_id AND user_id = ?) AS liked FROM Posts INNER JOIN Users ON Posts.user_id = Users.user_id WHERE Posts.user_id IN (SELECT friend_id FROM Friends WHERE user_id = ?) ORDER BY Posts.timestamp DESC',
    [req.params.user_id, req.params.user_id],
    (error, results) => {
      if (error) res.status(404).send({ message: 'Posts not found' });
      res.status(200).json({ data: results });
    }
  );
});
app.post('/api/posts/', async function (req, res) {
  // create new post
  connection.query(
    'INSERT INTO Posts (user_id, content) VALUES (?, ?)',
    [req.body.user_id, req.body.content],
    (error, results) => {
      if (error) res.status(404).send({ message: 'Posts not found' });
      res.status(200).json({ data: results });
    }
  );
});
app.get('/api/posts/:user_id/', async function (req, res) {
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
app.get('/api/post/:post_id', async function (req, res) {
  // get post by id with username and profile picture
  connection.query(
    'SELECT Posts.*, Users.username, Users.avatar FROM Posts INNER JOIN Users ON Posts.user_id = Users.user_id WHERE Posts.post_id = ?',
    [req.params.post_id],
    (error, results) => {
      if (error) res.status(404).send({ message: 'Post not found' });
      res.status(200).json({ data: results[0] });
    }
  );
});
app.get('/api/likes/:post_id', async function (req, res) {
  // get likes from post
  connection.query(
    'SELECT * FROM Likes WHERE post_id = ?',
    [req.params.post_id],
    (error, results) => {
      if (error) res.status(404).send({ message: 'Likes not found' });
      res.status(200).json({ data: results });
    }
  );
});

app.get('/api/comments/:post_id', async function (req, res) {
  // get comments from post
  connection.query(
    'SELECT Comments.*, Users.username FROM Comments INNER JOIN Users ON Comments.user_id = Users.user_id WHERE Comments.post_id = ? ORDER BY created_at DESC',
    [req.params.post_id],
    (error, results) => {
      if (error) res.status(404).send({ message: 'Comments not found' });
      res.status(200).json({ data: results });
    }
  );
});
app.post('/api/likes/:post_id/:user_id', async function (req, res) {
  // create new like
  connection.query(
    'INSERT INTO Likes (post_id, user_id) VALUES (?, ?)',
    [req.params.post_id, req.params.user_id],
    (error, results) => {
      if (error) throw error;
      res.send(results);
    }
  );
});
app.delete('/api/likes/:post_id/:user_id', async function (req, res) {
  // delete like
  connection.query(
    'DELETE FROM Likes WHERE post_id = ? AND user_id = ?',
    [req.params.post_id, req.params.user_id],
    (error, results) => {
      if (error) throw error;
      res.send(results);
    }
  );
});
app.post('/api/comments/', async function (req, res) {
  // create new comment
  connection.query(
    'INSERT INTO Comments (post_id, user_id, content,comment_id) VALUES (?, ?, ?,?)',
    [
      req.body.post_id,
      req.body.user_id,
      req.body.content,
      Math.floor(Math.random() * 10000000),
    ],
    (error, results) => {
      if (error) throw error;
      res.send(results);
    }
  );
});
app.post('/api/reply/:comment_id/:user_id', async function (req, res) {
  // create new reply
  connection.query(
    'INSERT INTO Replies (comment_id, user_id, content) VALUES (?, ?, ?)',
    [req.params.comment_id, req.params.user_id, req.body.content],
    (error, results) => {
      if (error) throw error;
      res.send(results);
    }
  );
});
app.get('/api/replies/:comment_id', async function (req, res) {
  // get replies from comment
  connection.query(
    'SELECT * FROM Replies WHERE comment_id = ?',
    [req.params.comment_id],
    (error, results) => {
      if (error) throw error;
      res.send(results);
    }
  );
});
app.get('/api/replyLikes/:reply_id', async function (req, res) {
  // get likes from reply
  connection.query(
    'SELECT * FROM RepliesLikes WHERE reply_id = ?',
    [req.params.reply_id],
    (error, results) => {
      if (error) throw error;
      res.send(results);
    }
  );
});
app.post('/api/replyLikes/:reply_id/:user_id', async function (req, res) {
  // create new reply like
  connection.query(
    'INSERT INTO RepliesLikes (reply_id, user_id) VALUES (?, ?)',
    [req.params.reply_id, req.params.user_id],
    (error, results) => {
      if (error) throw error;
      res.send(results);
    }
  );
});

app.listen(port, () => {
  console.log(`App running on port ${port}.`);
});
