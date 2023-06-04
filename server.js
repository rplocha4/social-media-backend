const express = require('express');
const bodyParser = require('body-parser');
const dbConfig = require('./config');
const mysql = require('mysql');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const multer = require('multer');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: 'http://localhost:3000',
  },
});

const users = {};
io.listen(3001);
io.on('connection', (socket) => {
  console.log('a user connected');
  socket.emit('id', { id: socket.id });
  socket.on('username', ({ username }) => {
    socket.username = username;
    users[username] = socket.id;
  });
  socket.on('typing', ({ receiver, sender }) => {
    if (users[receiver]) {
      io.to(users[receiver]).emit('typing', {
        sender,
      });
    }
  });
  socket.on('stop typing', ({ receiver, sender }) => {
    if (users[receiver]) {
      io.to(users[receiver]).emit('stop typing', {
        sender,
      });
    }
  });

  socket.on('chat message', ({ receiver, message, sender }) => {
    if (users[receiver]) {
      io.to(users[receiver]).emit('chat message', {
        message,
        senderMsg: sender,
      });
    }
  });
  socket.on('disconnect', () => {
    console.log('user disconnected');
  });
});

app.use(cors());
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

const storage = multer.memoryStorage();
const upload = multer({ storage });

function convertAvatars(results) {
  for (let i = 0; i < results.length; i++) {
    results[i].avatar =
      results[i].avatar &&
      'data:image/jpeg;base64,' + results[i].avatar.toString('base64');
  }
  return results;
}

function convertImages(results) {
  if (results === undefined) return [results];
  for (let i = 0; i < results.length; i++) {
    results[i].imageFile = results[i].image;
    results[i].image =
      results[i].image &&
      'data:image/jpeg;base64,' + results[i].image.toString('base64');
    results[i].avatar =
      results[i].avatar &&
      'data:image/jpeg;base64,' + results[i].avatar.toString('base64');
    results[i].background_image =
      results[i].background_image &&
      'data:image/jpeg;base64,' +
        results[i].background_image.toString('base64');
  }
  return results;
}

app.post('/api/auth/register', async function (req, res) {
  // create new user
  // check if username already exists
  connection.query(
    'SELECT * FROM Users WHERE email = ?',
    [req.body.email],
    (error, results) => {
      if (results.length > 0) {
        res.status(400).send({ message: 'Email already exists' });
      } else {
        bcrypt.hash(req.body.password, 10, (err, hash) => {
          if (err) {
            return res.status(500).json({
              error: err,
            });
          } else {
            connection.query(
              'INSERT INTO Users (username, email, password) VALUES (?, ?, ?)',
              [req.body.username, req.body.email, hash],
              (error, results) => {
                if (error) res.status(500).send({ message: 'Server error' });
                res.status(201).json({ message: 'User successfully created' });
              }
            );
          }
        });
      }
    }
  );
});

app.post('/api/auth/login', async function (req, res) {
  // login user
  // check if username exists
  console.log(req.body);
  connection.query(
    'SELECT * FROM Users WHERE username = ?',
    [req.body.username],
    (error, results) => {
      if (results.length > 0) {
        // check if password is correct
        bcrypt.compare(
          req.body.password,
          results[0]['password'],
          (bErr, bResult) => {
            // wrong password
            if (bErr) {
              res.status(401).json({
                message: 'Wrong password',
              });
            }
            // correct password
            if (bResult) {
              const token = jwt.sign(
                {
                  username: results[0].username,
                  userId: results[0].user_id,
                },
                'secret',
                {
                  expiresIn: '7d',
                }
              );
              res.status(200).json({
                message: 'Auth successful',
                token: token,
                user: results[0],
                avatar:
                  results[0].avatar &&
                  'data:image/jpeg;base64,' +
                    results[0].avatar.toString('base64'),
              });
            }
            // wrong password
            else {
              res.status(401).json({
                message: 'Wrong password',
              });
            }
          }
        );
      }
      // username not found
      else {
        res.status(401).json({
          message: 'User not found',
        });
      }
    }
  );
});

app.post('/api/follow/:user_id', async function (req, res) {
  // follow user
  // check if user is already following
  connection.query(
    'SELECT * FROM followers WHERE user_id = ? AND follower_id = ?',
    [req.params.user_id, req.body.user_id],
    (error, results) => {
      if (results.length > 0) {
        res.status(400).send({ message: 'Already following' });
      } else {
        connection.query(
          'INSERT INTO followers (user_id, follower_id) VALUES (?, ?)',
          [req.params.user_id, req.body.user_id],
          (error, results) => {
            if (error) res.status(500).send({ message: 'Server error' });
            res.status(201).json({ message: 'User successfully followed' });
          }
        );
      }
    }
  );
});

app.delete('/api/follow/:user_id', async function (req, res) {
  // unfollow user
  // check if user is already following
  connection.query(
    'SELECT * FROM followers WHERE user_id = ? AND follower_id = ?',
    [req.params.user_id, req.body.user_id],
    (error, results) => {
      if (results.length > 0) {
        connection.query(
          'DELETE FROM followers WHERE user_id = ? AND follower_id = ?',
          [req.params.user_id, req.body.user_id],
          (error, results) => {
            if (error) res.status(500).send({ message: 'Server error' });
            res.status(201).json({ message: 'User successfully unfollowed' });
          }
        );
      } else {
        res.status(400).send({ message: 'Not following' });
      }
    }
  );
});

app.get('/api/followers/:user_id', async function (req, res) {
  // get all followers of user
  connection.query(
    'SELECT * FROM followers WHERE user_id = ?',
    [req.params.user_id],
    (error, results) => {
      if (error) res.status(500).send({ message: 'Server error' });
      res.status(200).json({ followers: results });
    }
  );
});

app.get('/api/following/:user_id', async function (req, res) {
  // get all users user is following
  connection.query(
    'SELECT * FROM followers WHERE follower_id = ?',
    [req.params.user_id],
    (error, results) => {
      if (error) res.status(500).send({ message: 'Server error' });
      res.status(200).json({ following: results });
    }
  );
});

app.get('/api/posts/friends/:user_id', async function (req, res) {
  // get all posts from user friends and self with user username and profile picture, also get the all comments, and likes from each post and check if user liked the post
  connection.query(
    'SELECT Posts.*, Users.username, Users.avatar, (SELECT COUNT(*) FROM Likes WHERE post_id = Posts.post_id) AS likes, (SELECT COUNT(*) FROM Comments WHERE post_id = Posts.post_id) AS comments, (SELECT COUNT(*) FROM Likes WHERE post_id = Posts.post_id AND user_id = ?) AS liked FROM Posts INNER JOIN Users ON Posts.user_id = Users.user_id WHERE Posts.user_id IN (SELECT friend_id FROM Friends WHERE user_id = ?) OR Posts.user_id = ? ORDER BY Posts.timestamp DESC',
    [req.params.user_id, req.params.user_id, req.params.user_id],
    (error, results) => {
      if (error) res.status(404).send({ message: 'Posts not found' });

      results = convertImages(results);
      res.status(200).json({ data: results });
    }
  );

  // connection.query(
  //   'SELECT Posts.*, Users.username, Users.avatar, (SELECT COUNT(*) FROM Likes WHERE post_id = Posts.post_id) AS likes, (SELECT COUNT(*) FROM Comments WHERE post_id = Posts.post_id) AS comments, (SELECT COUNT(*) FROM Likes WHERE post_id = Posts.post_id AND user_id = ?) AS liked FROM Posts INNER JOIN Users ON Posts.user_id = Users.user_id WHERE Posts.user_id IN (SELECT friend_id FROM Friends WHERE user_id = ?) ORDER BY Posts.timestamp DESC',
  //   [req.params.user_id, req.params.user_id],
  //   (error, results) => {
  //     if (error) res.status(404).send({ message: 'Posts not found' });
  //     res.status(200).json({ data: results });
  //   }
  // );
});
app.post('/api/posts/', upload.single('image'), async function (req, res) {
  // create new post with or without image
  let file = req.file;
  if (file !== undefined) {
    file = file.buffer;
  }

  connection.query(
    'INSERT INTO Posts (user_id, content,image) VALUES (?, ?,?)',
    [req.body.user_id, req.body.content, file],
    (error, results) => {
      if (error) res.status(404).send({ message: 'Posts not found' });
      res.status(200).json({ data: results });
    }
  );
});
app.get('/api/posts/:username/', async function (req, res) {
  //find user_id by username and then get all posts from user_id
  // find user_id by username
  // convert image to base64
  const token = req.headers.authorization.split(' ')[1];
  const decoded = jwt.verify(token, 'secret');
  const username = decoded.username;

  // connection.query(
  //   'SELECT Posts.*, Users.username, Users.avatar, (SELECT COUNT(*) FROM Likes WHERE post_id = Posts.post_id) AS likes, (SELECT COUNT(*) FROM Comments WHERE post_id = Posts.post_id) AS comments, (SELECT COUNT(*) FROM Likes WHERE post_id = Posts.post_id AND user_id = (SELECT user_id FROM Users WHERE username = ?)) AS liked FROM Posts INNER JOIN Users ON Posts.user_id = Users.user_id WHERE Posts.user_id = (SELECT user_id FROM Users WHERE username = ?) ORDER BY Posts.timestamp DESC',
  //   [username, req.params.username],
  //   (error, results) => {
  //     if (error) res.status(404).send({ message: 'Posts not found' });
  //     res.status(200).json({ data: results });
  //   }
  // );
  connection.query(
    'SELECT Posts.*, Users.username, Users.avatar, (SELECT COUNT(*) FROM Likes WHERE post_id = Posts.post_id) AS likes, (SELECT COUNT(*) FROM Comments WHERE post_id = Posts.post_id) AS comments, (SELECT COUNT(*) FROM Likes WHERE post_id = Posts.post_id AND user_id = (SELECT user_id FROM Users WHERE username = ?)) AS liked FROM Posts INNER JOIN Users ON Posts.user_id = Users.user_id WHERE Posts.user_id = (SELECT user_id FROM Users WHERE username = ?) ORDER BY Posts.timestamp DESC',
    [username, req.params.username],
    (error, results) => {
      if (error) res.status(404).send({ message: 'Posts not found' });

      results = convertImages(results);

      res.status(200).json({ data: results });
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
      results = convertImages(results);

      res.status(200).json({ data: results[0] });
    }
  );
});

app.put(
  '/api/post/:post_id',
  upload.single('image'),
  async function (req, res) {
    console.log('asd');
    // update post with or without image
    let file = req.file;
    if (file !== undefined) {
      file = file.buffer;
    }
    connection.query(
      'UPDATE Posts SET content = ?, image = ? WHERE post_id = ?',
      [req.body.content, file, req.params.post_id],
      (error, results) => {
        if (error) res.status(404).send({ message: 'Posts not found' });
        res.status(200).json({ data: results });
      }
    );
  }
);
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

app.get('/api/user/likes/:username', async function (req, res) {
  // find user_id by username and then get all posts that user liked
  const token = req.headers.authorization.split(' ')[1];
  const decoded = jwt.verify(token, 'secret');
  const username = decoded.username;
  connection.query(
    'SELECT Posts.*, Users.username, Users.avatar, (SELECT COUNT(*) FROM Likes WHERE post_id = Posts.post_id) AS likes, (SELECT COUNT(*) FROM Comments WHERE post_id = Posts.post_id) AS comments, (SELECT COUNT(*) FROM Likes WHERE post_id = Posts.post_id AND user_id = (SELECT user_id FROM Users WHERE username = ?)) AS liked FROM Posts INNER JOIN Users ON Posts.user_id = Users.user_id WHERE Posts.post_id IN (SELECT post_id FROM Likes WHERE user_id = (SELECT user_id FROM Users WHERE username = ?)) ORDER BY Posts.timestamp DESC',
    [username, req.params.username],
    (error, results) => {
      if (error) res.status(404).send({ message: 'Likes not found' });
      results = convertImages(results);

      res.status(200).json({ data: results });
    }
  );
});

app.get('/api/user/comments/:username', async function (req, res) {
  // find user_id by username and then get all posts that user commented on
  const token = req.headers.authorization.split(' ')[1];
  const decoded = jwt.verify(token, 'secret');
  const username = decoded.username;
  connection.query(
    'SELECT Posts.*, Users.username, Users.avatar, (SELECT COUNT(*) FROM Likes WHERE post_id = Posts.post_id) AS likes, (SELECT COUNT(*) FROM Comments WHERE post_id = Posts.post_id) AS comments, (SELECT COUNT(*) FROM Likes WHERE post_id = Posts.post_id AND user_id = (SELECT user_id FROM Users WHERE username = ?)) AS liked FROM Posts INNER JOIN Users ON Posts.user_id = Users.user_id WHERE Posts.post_id IN (SELECT post_id FROM Comments WHERE user_id = (SELECT user_id FROM Users WHERE username = ?)) ORDER BY Posts.timestamp DESC',
    [username, req.params.username],
    (error, results) => {
      if (error) res.status(404).send({ message: 'Comments not found' });
      results = convertImages(results);

      res.status(200).json({ data: results });
    }
  );
});

app.get('/api/search/:search', async function (req, res) {
  // search for users by username return 10 results
  connection.query(
    'SELECT * FROM Users WHERE username LIKE ? LIMIT 10',
    ['%' + req.params.search + '%'],
    (error, results) => {
      if (error) res.status(404).send({ message: 'Users not found' });
      results = convertAvatars(results);
      res.status(200).json({ data: results });
    }
  );
});

app.get('/api/comments/:post_id', async function (req, res) {
  // get comments from post
  connection.query(
    'SELECT Comments.*, Users.username, Users.avatar FROM Comments INNER JOIN Users ON Comments.user_id = Users.user_id WHERE Comments.post_id = ? ORDER BY created_at DESC',
    [req.params.post_id],
    (error, results) => {
      if (error) res.status(404).send({ message: 'Comments not found' });
      results = convertImages(results);
      res.status(200).json({ data: results });
    }
  );
});

app.delete('/api/comments/:comment_id', async function (req, res) {
  // delete comment
  // const token = req.headers.authorization.split(' ')[1];
  // const decoded = jwt.verify(token, 'secret');
  // if (decoded.userId != req.body.user_id) return;
  connection.query(
    'DELETE FROM Comments WHERE comment_id = ?',
    [req.params.comment_id],
    (error, results) => {
      if (error) throw error;
      res.send(results);
    }
  );
});
app.delete('/api/posts/:post_id', async function (req, res) {
  // delete post
  // const token = req.headers.authorization.split(' ')[1];
  // const decoded = jwt.verify(token, 'secret');
  // if (decoded.userId != req.body.user_id) return;
  connection.query(
    'DELETE FROM Posts WHERE post_id = ?',
    [req.params.post_id],
    (error, results) => {
      if (error) throw error;
      res.send(results);
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

app.get('/api/user/:username', async function (req, res) {
  // get user by username with  count of people that user follows and count of people that follow user
  connection.query(
    'SELECT Users.*, (SELECT COUNT(*) FROM followers WHERE follower_id = (SELECT user_id FROM Users WHERE username = ?)) AS following, (SELECT COUNT(*) FROM followers WHERE user_id = (SELECT user_id FROM Users WHERE username = ?)) AS followers FROM Users WHERE username = ?',
    [req.params.username, req.params.username, req.params.username],
    (error, results) => {
      if (error) res.status(404).send({ message: 'User not found' });
      results = convertImages(results);

      res.status(200).json({ data: results[0] });
    }
  );
});

// app.get('/api/friends/:user_id', async function (req, res) {
//   // get friends from user
//   connection.query(
//     'SELECT Users.* FROM Users INNER JOIN Friends ON Users.user_id = Friends.friend_id WHERE Friends.user_id = ?',
//     [req.params.user_id],
//     (error, results) => {
//       if (error) res.status(404).send({ message: 'Friends not found' });
//       res.status(200).json({ data: results });
//     }
//   );
// });

// app.get('/api/followers/:user_id', async function (req, res) {
//   // get followers from user
//   connection.query(
//     'SELECT Users.* FROM Users INNER JOIN Friends ON Users.user_id = Friends.follower_id WHERE Friends.user_id = ?',
//     [req.params.user_id],
//     (error, results) => {
//       if (error) res.status(404).send({ message: 'Friends not found' });
//       res.status(200).json({ data: results });
//     }
//   );
// });

// app.get('/api/following/:user_id', async function (req, res) {
//   // get following from user
//   connection.query(
//     'SELECT Users.* FROM Users INNER JOIN Friends ON Users.user_id = Friends.user_id WHERE Friends.follower_id = ?',
//     [req.params.user_id],
//     (error, results) => {
//       if (error) res.status(404).send({ message: 'Following not found' });
//       res.status(200).json({ data: results });
//     }
//   );
// });

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
app.post('/api/comments/', upload.single('image'), async function (req, res) {
  // create new comment
  let file = req.file;
  if (file !== undefined) {
    file = file.buffer;
  }
  connection.query(
    'INSERT INTO Comments (post_id, user_id, content, comment_id, image) VALUES (?, ?, ?, ?,?)',
    [
      req.body.post_id,
      req.body.user_id,
      req.body.content,
      Math.floor(Math.random() * 10000000),
      file,
    ],
    (error, results) => {
      if (error) throw error;
      res.send(results);
    }
  );
});

app.get('/api/userid/:username', async function (req, res) {
  console.log('asd');
  connection.query(
    'SELECT * FROM Users WHERE username = ?',
    [req.params.username],
    (error, results) => {
      if (error) res.status(404).send({ message: 'User not found' });
    }
  );
});

app.put('/api/user/', upload.single('image'), async function (req, res) {
  // update users avatar or background image if it is not null
  const token = req.headers.authorization.split(' ')[1];
  const decoded = jwt.verify(token, 'secret');
  const userId = decoded.userId;

  if (req.body.user_id != userId) return;
  if (req.body.avatar === 'true') {
    connection.query(
      'UPDATE Users SET avatar = ? WHERE user_id = ?',
      [req.file.buffer, userId],
      (error, results) => {
        if (error) throw error;
        const avatar =
          'data:image/png;base64,' + req.file.buffer.toString('base64');
        res.send({ avatar });
      }
    );
  }
  if (req.body.background_image === 'true') {
    connection.query(
      'UPDATE Users SET background_image = ? WHERE user_id = ?',
      [req.file.buffer, userId],
      (error, results) => {
        if (error) throw error;
        res.send(results);
      }
    );
  }
});

app.get('/api/messages/:user1_id/:user2_id', async function (req, res) {
  // find conversation between two users and get all messages from that conversation
  connection.query(
    'SELECT * FROM conversations WHERE (user1_id = ? AND user2_id  = ?) OR (user1_id = ? AND user2_id  = ?)',
    [
      req.params.user1_id,
      req.params.user2_id,
      req.params.user2_id,
      req.params.user1_id,
    ],
    (error, results) => {
      if (error) throw error;
      if (results.length === 0) {
        res.send([]);
      } else {
        connection.query(
          'SELECT * FROM messages WHERE conversation_id = ?',
          [results[0].conversation_id],
          (error, results) => {
            if (error) throw error;
            res.send(results);
          }
        );
      }
    }
  );
});

app.get('/api/conversations/:user_id', async function (req, res) {
  // find all conversations from user return username and profile picture from other user
  connection.query(
    'SELECT * FROM conversations WHERE user1_id = ? OR user2_id = ?',
    [req.params.user_id, req.params.user_id],
    (error, results) => {
      if (error) throw error;
      console.log(results);
      if (results.length === 0) {
        res.send([]);
      } else {
        const data = [];
        for (let i = 0; i < results.length; i++) {
          connection.query(
            'SELECT * FROM Users WHERE user_id = ?',
            [
              results[i].user1_id === parseInt(req.params.user_id)
                ? results[i].user2_id
                : results[i].user1_id,
            ],
            (error, results2) => {
              if (error) throw error;
              results2 = convertAvatars(results2);
              data.push(results2[0]);
              if (data.length === results.length) {
                res.send(data);
              }
            }
          );
        }
      }
    }
  );
});

app.post('/api/messages/', async function (req, res) {
  // create new message
  // check if conversation between users already exists if not create new conversation and add message to it
  console.log(req.body);
  connection.query(
    'SELECT * FROM conversations WHERE (user1_id = ? AND user2_id  = ?) OR (user1_id = ? AND user2_id  = ?)',
    [
      req.body.user1_id,
      req.body.user2_id,
      req.body.user2_id,
      req.body.user1_id,
    ],
    (error, results) => {
      if (error) throw error;
      if (results.length === 0) {
        connection.query(
          'INSERT INTO conversations (user1_id, user2_id) VALUES (?, ?)',
          [req.body.user1_id, req.body.user2_id],

          (error, results) => {
            console.log(results);
            if (error) throw error;
            connection.query(
              'INSERT INTO messages (conversation_id, sender_id, message) VALUES (?, ?, ?)',
              [results.insertId, req.body.user1_id, req.body.message],
              (error, results) => {
                if (error) throw error;
                res.send(results);
              }
            );
          }
        );
      } else {
        connection.query(
          'INSERT INTO messages (conversation_id, sender_id, message) VALUES (?, ?, ?)',

          [results[0].conversation_id, req.body.user1_id, req.body.message],
          (error, results) => {
            if (error) throw error;
            res.send(results);
          }
        );
      }
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
