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
    origin: 'https://social-media-backend-tfft.onrender.com',
  },
});

const users = {};
io.listen(443);
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
  socket.on('like', ({ author, liker }) => {
    if (users[author]) {
      io.to(users[author]).emit('like', {
        liker,
      });
    }
  });
  socket.on('comment', ({ author, commenter }) => {
    if (users[author]) {
      io.to(users[author]).emit('comment', {
        commenter,
      });
    }
  });
  socket.on('follow', ({ author, follower }) => {
    if (users[author]) {
      io.to(users[author]).emit('follow', {
        follower,
      });
    }
  });
  socket.on('mention', ({ author, username }) => {
    if (users[username]) {
      io.to(users[username]).emit('mention', {
        mentioner: author,
      });
    }
  });

  socket.on('disconnect', () => {
    console.log('user disconnected');
  });
});

app.use(cors());
const port = process.env.PORT;
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
  console.log(req.body);
  connection.query(
    'SELECT * FROM Users WHERE email = ?',
    [req.body.email],
    (error, results) => {
      if (results?.length > 0) {
        return res.status(400).send({ message: 'Email already exists' }); // Add return statement here
      } else {
        bcrypt.hash(req.body.password, 10, (err, hash) => {
          if (err) {
            return res.status(500).json({
              error: err,
            });
          } else {
            connection.query(
              'INSERT INTO Users (username, email, password, private) VALUES (?, ?, ?, ?)',
              [req.body.username, req.body.email, hash, 0],
              (error, results) => {
                if (error)
                  return res.status(500).send({ message: 'Server error' }); // Add return statement here
                return res
                  .status(201)
                  .json({ message: 'User successfully created' }); // Add return statement here
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
      if (results?.length > 0) {
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
      if (results?.length > 0) {
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
      if (results?.length > 0) {
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
    'SELECT * FROM Users WHERE user_id IN (SELECT follower_id FROM followers WHERE user_id = ?)',
    [req.params.user_id],
    (error, results) => {
      if (error) res.status(500).send({ message: 'Server error' });
      results = convertAvatars(results);

      res.status(200).json({ followers: results });
    }
  );
});

app.get('/api/following/:user_id', async function (req, res) {
  // get all users user is following
  connection.query(
    'SELECT * FROM Users WHERE user_id IN (SELECT user_id FROM followers WHERE follower_id = ?)',
    [req.params.user_id],
    (error, results) => {
      if (error) res.status(500).send({ message: 'Server error' });
      results = convertAvatars(results);
      res.status(200).json({ following: results });
    }
  );
});

app.get('/api/posts/friends/:user_id', async function (req, res) {
  // get all posts from user friends and self with user username and profile picture, also get the all comments, and likes from each post and check if user liked the post
  connection.query(
    'SELECT Posts.*, Users.username, Users.avatar, (SELECT COUNT(*) FROM Likes WHERE post_id = Posts.post_id) AS likes, (SELECT COUNT(*) FROM Comments WHERE post_id = Posts.post_id) AS comments, (SELECT COUNT(*) FROM Likes WHERE post_id = Posts.post_id AND user_id = ?) AS liked FROM Posts INNER JOIN Users ON Posts.user_id = Users.user_id WHERE Posts.user_id IN (SELECT user_id FROM followers WHERE follower_id = ?) OR Posts.user_id = ? ORDER BY Posts.timestamp DESC',
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
    'INSERT INTO Posts (user_id, content, image) VALUES (?, ?,?)',
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
    // update post with or without image
    let file = req.file;
    let blob = undefined;
    if (file !== undefined) {
      file = file.buffer;
    }
    // console.log(req.body);

    // if (req.body.img) {
    //   const buffer = Buffer.from(req.body.img);
    //   blob = new Blob([buffer]);
    //   console.log(blob);
    // }
    connection.query(
      'UPDATE Posts SET content = ?, image = ? WHERE post_id = ?',
      [req.body.content, file ? file : blob, req.params.post_id],
      (error, results) => {
        if (error) res.status(404).send({ message: 'Posts not found' });
        res.status(200).json({ data: results });
      }
    );
  }
);

app.put(
  '/api/comment/:comment_id',
  upload.single('image'),
  async function (req, res) {
    // update comment with or without image
    let file = req.file;
    if (file !== undefined) {
      file = file.buffer;
    }
    connection.query(
      'UPDATE Comments SET content = ?, image = ? WHERE comment_id = ?',
      [req.body.content, file, req.params.comment_id],
      (error, results) => {
        if (error) res.status(404).send({ message: 'Comments not found' });
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

app.get('/api/users/', async function (req, res) {
  console.log('asd');
  // get all users
  connection.query('SELECT * FROM Users', (error, results) => {
    if (error) res.status(404).send({ message: 'Users not found' });
    res.status(200).json({ data: results });
  });
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
      [req.file.buffer, req.body.user_id],
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

app.put('/api/users/:userId', (req, res) => {
  const userId = req.params.userId;
  const updates = req.body;
  console.log(updates);

  let query = 'UPDATE Users SET';
  const values = [];

  Object.keys(updates).forEach((key, index) => {
    query += ` ${key} = ?,`;
    values.push(updates[key]);
  });

  query = query.slice(0, -1);

  query += ' WHERE user_id = ?';
  values.push(userId);

  connection.query(query, values, (err, results) => {
    if (err) {
      console.error('Error executing MySQL query:', err);
      return res.status(500).send('Error updating user');
    }

    if (results.affectedRows === 0) {
      return res.status(404).send('User not found');
    }

    return res.status(200).send('User updated successfully');
  });
});
app.delete('/api/users/:userId', (req, res) => {
  const userId = req.params.userId;

  const deleteGroupRequestsQuery =
    'DELETE FROM GroupRequests WHERE user_id = ?';
  const deleteUserQuery = 'DELETE FROM Users WHERE user_id = ?';

  connection.beginTransaction((err) => {
    if (err) {
      console.error('Error starting database transaction:', err);
      return res.status(500).send('Error deleting user');
    }

    connection.query(deleteGroupRequestsQuery, [userId], (err, results) => {
      if (err) {
        console.error('Error deleting group requests:', err);
        connection.rollback(() => {
          res.status(500).send('Error deleting user');
        });
      }

      connection.query(deleteUserQuery, [userId], (err, results) => {
        if (err) {
          console.error('Error deleting user:', err);
          connection.rollback(() => {
            res.status(500).send('Error deleting user');
          });
        }

        connection.commit((err) => {
          if (err) {
            console.error('Error committing transaction:', err);
            connection.rollback(() => {
              res.status(500).send('Error deleting user');
            });
          }

          res.status(200).send('User deleted successfully');
        });
      });
    });
  });
});

app.post('/api/reports', (req, res) => {
  const { user_id, post_id, comment_id, report_reason } = req.body;
  console.log(req.body);

  const query = `
    INSERT INTO Reports (user_id, post_id, comment_id, report_reason, created_at)
    VALUES (?, ?, ?, ?, NOW())
  `;
  const values = [user_id, post_id, comment_id, report_reason];

  connection.query(query, values, (err, results) => {
    if (err) {
      console.error('Error executing MySQL query:', err);
      res.status(500).send('Error creating report');
    } else {
      res.status(201).send('Report created successfully');
    }
  });
});

app.get('/api/reported-posts', (req, res) => {
  const query = `
    SELECT
      p.post_id,
      p.content AS content,
      p.image AS image,
      r.report_id,
      r.report_reason,
      r.created_at,
      u.user_id,
      u.username,
      u.avatar
    FROM
      Posts p
      INNER JOIN Reports r ON p.post_id = r.post_id
      LEFT JOIN Users u ON u.user_id = r.user_id
  `;

  connection.query(query, (err, results) => {
    if (err) {
      console.error('Error executing MySQL query:', err);
      res.status(500).send('Error fetching reported posts');
    } else {
      const reportedPosts = results.reduce((acc, row) => {
        const postId = row.post_id;

        if (!acc[postId]) {
          acc[postId] = {
            post_id: postId,
            content: row.content,
            image: row.image
              ? 'data:image/png;base64,' + row.image.toString('base64')
              : null,
            reports: [],
          };
        }

        if (row.report_id) {
          acc[postId].reports.push({
            report_id: row.report_id,
            report_reason: row.report_reason,
            created_at: row.created_at,
            user: {
              user_id: row.user_id,
              username: row.username,
              avatar: row.avatar
                ? 'data:image/png;base64,' + row.avatar.toString('base64')
                : null,
            },
          });
        }

        return acc;
      }, {});

      const reportedPostsArray = Object.values(reportedPosts);
      res.json(reportedPostsArray);
    }
  });
});
app.get('/api/reported-comments', (req, res) => {
  const query = `
    SELECT
      c.comment_id,
      c.content AS content,
      c.image AS image,
      r.report_id,
      r.report_reason,
      r.created_at,
      u.user_id,
      u.username,
      u.avatar
    FROM
      Comments c
      INNER JOIN Reports r ON c.comment_id = r.comment_id
      LEFT JOIN Users u ON u.user_id = r.user_id
  `;

  connection.query(query, (err, results) => {
    if (err) {
      console.error('Error executing MySQL query:', err);
      res.status(500).send('Error fetching reported comments');
    } else {
      const reportedComments = results.reduce((acc, row) => {
        const commentId = row.comment_id;

        if (!acc[commentId]) {
          acc[commentId] = {
            comment_id: commentId,
            content: row.content,
            image: row.image
              ? 'data:image/png;base64,' + row.image.toString('base64')
              : null,
            reports: [],
          };
        }

        if (row.report_id) {
          acc[commentId].reports.push({
            report_id: row.report_id,
            report_reason: row.report_reason,
            created_at: row.created_at,
            user: {
              user_id: row.user_id,
              username: row.username,
              avatar: row.avatar
                ? 'data:image/png;base64,' + row.avatar.toString('base64')
                : null,
            },
          });
        }

        return acc;
      }, {});

      const reportedCommentsArray = Object.values(reportedComments);
      res.json(reportedCommentsArray);
    }
  });
});

app.put('/api/user/:user_id', async function (req, res) {
  //update user privacy
  connection.query(
    'UPDATE Users SET private = ? WHERE user_id = ?',
    [req.body.setPrivate, req.params.user_id],
    (error, results) => {
      if (error) throw error;
      res.send(results);
    }
  );
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
      if (results?.length === 0) {
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
      if (results?.length === 0) {
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
      if (results?.length === 0) {
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

app.get('/api/events', (req, res) => {
  const query = `
    SELECT e.id, e.name AS event_name, e.date, e.description, e.image, u.user_id AS user_id, u.username AS username, u.avatar AS avatar 
    FROM events e
    LEFT JOIN user_event ue ON e.id = ue.event_id
    LEFT JOIN Users u ON ue.user_id = u.user_id
  `;

  connection.query(query, (err, results) => {
    if (err) {
      console.error('Error executing MySQL query:', err);
      res.status(500).send('Error fetching events');
    } else {
      const eventsWithUsers = results.reduce((events, row) => {
        const event = events.find((event) => event.id === row.id);

        if (event) {
          event.users.push({
            user_id: row.user_id,
            username: row.username,
            avatar: row.avatar
              ? 'data:image/png;base64,' + row.avatar.toString('base64')
              : '',
          });
        } else {
          events.push({
            id: row.id,
            name: row.event_name,
            date: row.date,
            description: row.description,
            image: row.image,
            users: [
              {
                user_id: row.user_id,
                username: row.username,
                avatar: row.avatar
                  ? 'data:image/png;base64,' + row.avatar.toString('base64')
                  : '',
              },
            ],
          });
        }

        return events;
      }, []);
      res.json(
        eventsWithUsers.map((event) => {
          return {
            id: event.id,
            name: event.name,
            date: event.date,
            image: event.image,
            description: event.description,
            users: event.users.filter((user) => user.user_id !== null),
          };
        })
      );
    }
  });
});

app.post('/api/events', (req, res) => {
  const { name, date, description, image } = req.body;

  const query =
    'INSERT INTO events (name, date, description, image) VALUES (?, ?, ?, ?)';
  const values = [name, date, description, image];

  connection.query(query, values, (err, results) => {
    if (err) {
      console.error('Error executing MySQL query:', err);
      res.status(500).send('Error creating event');
    } else {
      res.status(201).send('Event created successfully');
    }
  });
});
app.post('/api/events/:eventId/join', (req, res) => {
  const eventId = req.params.eventId;
  const { user_id } = req.body;

  const query = 'INSERT INTO user_event (user_id, event_id) VALUES (?, ?)';
  const values = [user_id, eventId];

  connection.query(query, values, (err, results) => {
    if (err) {
      console.error('Error executing MySQL query:', err);
      res.status(500).send('Error joining event');
    } else {
      res.status(201).send('Joined event successfully');
    }
  });
});

app.post('/api/events/:eventId/resign', (req, res) => {
  const eventId = req.params.eventId;
  const { user_id } = req.body;

  const query = 'DELETE FROM user_event WHERE user_id = ? AND event_id = ?';
  const values = [user_id, eventId];

  connection.query(query, values, (err, results) => {
    if (err) {
      console.error('Error executing MySQL query:', err);
      res.status(500).send('Error resigning from event');
    } else {
      res.status(200).send('Resigned from event successfully');
    }
  });
});
app.get('/api/users/:user_id/events', (req, res) => {
  const user_id = req.params.user_id;

  const query = `
    SELECT e.id, e.name AS event_name, e.date, e.description, e.image, u.user_id AS user_id, u.username AS username, u.avatar AS avatar 
    FROM events e
    INNER JOIN user_event ue ON e.id = ue.event_id
    LEFT JOIN Users u ON ue.user_id = u.user_id
    WHERE u.user_id = ?
  `;
  const values = [user_id];

  connection.query(query, values, (err, results) => {
    if (err) {
      console.error('Error executing MySQL query:', err);
      res.status(500).send('Error fetching user events');
    } else {
      const eventsWithUsers = results.reduce((events, row) => {
        const event = events.find((event) => event.id === row.id);

        if (event) {
          event.users.push({
            user_id: row.user_id,
            username: row.username,
            avatar: row.avatar
              ? 'data:image/png;base64,' + row.avatar.toString('base64')
              : '',
          });
        } else {
          events.push({
            id: row.id,
            name: row.event_name,
            date: row.date,
            description: row.description,
            image: row.image,
            users: [
              {
                user_id: row.user_id,
                username: row.username,
                avatar: row.avatar
                  ? 'data:image/png;base64,' + row.avatar.toString('base64')
                  : '',
              },
            ],
          });
        }

        return events;
      }, []);
      res.json(
        eventsWithUsers.map((event) => {
          return {
            id: event.id,
            name: event.name,
            date: event.date,
            image: event.image,
            description: event.description,
            users: event.users.filter((user) => user.user_id !== null),
          };
        })
      );
    }
  });
});

app.post('/api/groups', upload.single('image'), async (req, res) => {
  const { name, admin_id } = req.body;

  const groupQuery =
    'INSERT INTO `Groups` (group_name, admin_id, background_image) VALUES (?, ?, ?)';
  const groupValues = [name, admin_id, req.file.buffer];

  connection.query(groupQuery, groupValues, (groupErr, groupResults) => {
    if (groupErr) {
      console.error('Error executing MySQL query:', groupErr);
      return res.status(500).send('Error creating group');
    }

    const groupId = groupResults.insertId;

    const userQuery =
      'INSERT INTO group_users (group_id, user_id) VALUES (?, ?)';
    const userValues = [groupId, admin_id];

    connection.query(userQuery, userValues, (userErr, userResults) => {
      if (userErr) {
        console.error('Error executing MySQL query:', userErr);
        return res.status(500).send('Error adding user to the group');
      }

      res.status(201).send('Group created successfully');
    });
  });
});

app.get('/api/groups/:userId', async (req, res) => {
  const userId = req.params.userId;
  const query = `
    SELECT g.group_id, g.group_name, g.background_image, IF(ug.user_id IS NULL, 0, 1) AS is_member
    FROM \`Groups\` g
    LEFT JOIN group_users ug ON g.group_id = ug.group_id AND ug.user_id = ?
  `;

  connection.query(query, [userId], (err, results) => {
    if (err) {
      console.error('Error executing MySQL query:', err);
      return res.status(500).send('Error fetching groups');
    }

    const groups = results.map((row) => ({
      group_id: row.group_id,
      group_name: row.group_name,
      background_image:
        'data:image/png;base64,' + row.background_image.toString('base64'),
      is_member: row.is_member === 1,
    }));

    res.json(groups);
  });
});

// Endpoint to get a single group by ID with users and posts
app.get('/api/group/:groupId', (req, res) => {
  const groupId = req.params.groupId;

  const query = `
    SELECT
      g.group_id,
      g.admin_id,
      g.group_name,
      g.background_image,
      u.user_id,
      u.username,
      u.avatar AS avatar,
      up.user_id AS post_user_id,
      up.username AS post_username,
      up.avatar AS post_avatar,
      gp.post_id,
      gp.user_id AS post_user_id2,
      gp.content,
      gp.image
    FROM
      \`Groups\` g
      LEFT JOIN group_users gu ON g.group_id = gu.group_id
      LEFT JOIN Users u ON gu.user_id = u.user_id
      LEFT JOIN Group_Posts gp ON g.group_id = gp.group_id
      LEFT JOIN Users up ON gp.user_id = up.user_id
      
    WHERE
      g.group_id = ?
    ORDER BY
      gp.timestamp DESC
  `;

  connection.query(query, [groupId], (err, results) => {
    if (err) {
      console.error('Error executing MySQL query:', err);
      return res.status(500).send('Error fetching group');
    }

    if (results?.length === 0) {
      return res.status(404).send('Group not found');
    }

    const group = {
      id: results[0].group_id,
      name: results[0].group_name,
      admin_id: results[0].admin_id,
      background_image:
        'data:image/png;base64,' +
        results[0].background_image.toString('base64'),
      users: [],
      posts: [],
    };

    results.forEach((row) => {
      console.log(row);
      if (row.user_id) {
        if (!group.users.find((user) => user.id === row.user_id)) {
          group.users.push({
            id: row.user_id,
            username: row.username,
            avatar: 'data:image/png;base64,' + row.avatar.toString('base64'),
          });
        }
      }

      if (row.post_id) {
        if (!group.posts.find((post) => post.id === row.post_id)) {
          group.posts.push({
            id: row.post_id,
            content: row.content,
            image: row.image
              ? 'data:image/png;base64,' + row.image.toString('base64')
              : '',
            author: {
              id: row.post_user_id,
              username: row.post_username,
              avatar:
                'data:image/png;base64,' + row.post_avatar.toString('base64'),
            },
          });
        }
      }
    });

    return res.json(group);
  });
});

app.post('/api/groups/:groupId/request', (req, res) => {
  const groupId = req.params.groupId;
  const { user_id } = req.body;

  const query =
    'INSERT INTO GroupRequests (user_id, group_id, status) VALUES (?, ?, ?)';
  const values = [user_id, groupId, 'pending'];

  connection.query(query, values, (err, results) => {
    if (err) {
      console.error('Error executing MySQL query:', err);
      res.status(500).send('Error sending join request');
    } else {
      res.status(201).send('Join request sent successfully');
    }
  });
});

app.put('/api/groups/:groupId/request/:requestId', (req, res) => {
  const groupId = req.params.groupId;
  const requestId = req.params.requestId;
  const decision = req.body.decision;

  const user_id = req.body.user_id;

  const updateRequestQuery =
    'UPDATE GroupRequests SET status = ? WHERE request_id = ?';
  connection.query(
    updateRequestQuery,
    [decision, requestId],
    (err, updateRequestResults) => {
      if (err) {
        console.error('Error executing MySQL query:', err);
        return res.status(500).send('Error updating join request');
      }

      if (updateRequestResults.affectedRows === 0) {
        return res.status(404).send('Join request not found');
      }

      if (decision === 'accepted') {
        const addUserToGroupQuery =
          'INSERT INTO group_users (group_id, user_id) VALUES (?, ?)';
        connection.query(
          addUserToGroupQuery,
          [groupId, user_id],
          (err, addUserToGroupResults) => {
            if (err) {
              console.error('Error executing MySQL query:', err);
              return res.status(500).send('Error adding user to group');
            }

            return res
              .status(200)
              .send(
                'Join request accepted and user added to the group successfully'
              );
          }
        );
      } else {
        return res.status(200).send('Join request rejected');
      }
    }
  );
});

app.get('/api/groups/:groupId/members/:userId', (req, res) => {
  const groupId = req.params.groupId;
  const userId = req.params.userId;

  const query = `
    SELECT COUNT(*) AS count
    FROM group_users
    WHERE group_id = ? AND user_id = ?
  `;

  connection.query(query, [groupId, userId], (err, results) => {
    if (err) {
      console.error('Error executing MySQL query:', err);
      return res.status(500).send('Error checking user membership');
    }

    const count = results[0].count;

    return res.json({
      inGroup: count > 0,
    });
  });
});

app.get('/api/groups/:groupId/users/:userId/requests', (req, res) => {
  const groupId = req.params.groupId;
  const userId = req.params.userId;

  const query =
    'SELECT * FROM GroupRequests WHERE group_id = ? AND user_id = ?';
  connection.query(query, [groupId, userId], (err, results) => {
    if (err) {
      console.error('Error executing MySQL query:', err);
      return res.status(500).send('Error checking join request');
    }

    const hasSentRequest =
      results.map((result) => result.status === 'pending')?.length > 0;
    return res.json({ hasSentRequest });
  });
});

app.get('/api/groups/:groupId/requests', (req, res) => {
  const groupId = req.params.groupId;

  const query = `
    SELECT gr.request_id, gr.status, u.user_id, u.username, u.avatar
    FROM GroupRequests gr
    INNER JOIN Users u ON gr.user_id = u.user_id
    WHERE gr.group_id = ?
  `;
  const values = [groupId];

  connection.query(query, values, (err, results) => {
    if (err) {
      console.error('Error executing MySQL query:', err);
      res.status(500).send('Error fetching join requests');
    } else {
      const joinRequests = results.map((row) => ({
        request_id: row.request_id,
        status: row.status,
        user_id: row.user_id,
        username: row.username,
        avatar: row.avatar
          ? 'data:image/png;base64,' + row.avatar.toString('base64')
          : '',
      }));
      res.json(joinRequests);
    }
  });
});
app.delete('/api/groups/:groupId/users/:userId', (req, res) => {
  const groupId = req.params.groupId;
  const userId = req.params.userId;

  const deleteQuery =
    'DELETE FROM group_users WHERE group_id = ? AND user_id = ?';
  connection.query(deleteQuery, [groupId, userId], (err, deleteResults) => {
    if (err) {
      console.error('Error executing MySQL query:', err);
      return res.status(500).send('Error removing user from group');
    }
    if (deleteResults.affectedRows === 0) {
      return res.status(404).send('User not found in the group');
    }

    return res.status(200).send('User removed from group successfully');
  });
});

app.delete('/api/groups/:groupId/requests/:userId', (req, res) => {
  const groupId = req.params.groupId;
  const userId = req.params.userId;

  const query = `
    DELETE FROM GroupRequests
    WHERE group_id = ? AND user_id = ?
  `;

  connection.query(query, [groupId, userId], (err, results) => {
    if (err) {
      console.error('Error executing MySQL query:', err);
      return res.status(500).send('Error canceling request');
    }

    if (results.affectedRows === 0) {
      return res.status(404).send('Request not found');
    }

    return res.status(204).send('Request canceled successfully');
  });
});

app.get('/api/groups/:groupId/users', (req, res) => {
  const groupId = req.params.groupId;

  const query = `
    SELECT u.user_id, u.username, u.avatar
    FROM Users u
    INNER JOIN group_users gu ON u.user_id = gu.user_id
    WHERE gu.group_id = ?
  `;
  const values = [groupId];

  connection.query(query, values, (err, results) => {
    if (err) {
      console.error('Error executing MySQL query:', err);
      res.status(500).send('Error fetching users');
    } else {
      const users = results.map((row) => ({
        user_id: row.user_id,
        username: row.username,
        avatar: row.avatar
          ? 'data:image/png;base64,' + row.avatar.toString('base64')
          : '',
      }));
      res.json(users);
    }
  });
});

app.post(
  '/api/groups/:groupId/posts',
  upload.single('image'),
  async (req, res) => {
    const groupId = req.params.groupId;
    const { user_id, content } = req.body;
    console.log(req.file);

    let file = req.file;
    if (file !== undefined) {
      file = file.buffer;
    }

    const query =
      'INSERT INTO Group_Posts (group_id, user_id, content, image) VALUES (?, ?, ?,?)';
    const values = [groupId, user_id, content, file];

    connection.query(query, values, (err, results) => {
      if (err) {
        console.error('Error executing MySQL query:', err);
        res.status(500).send('Error creating post');
      } else {
        res.status(201).send('Post created successfully');
      }
    });
  }
);

app.get('/api/groups/:groupId/posts', (req, res) => {
  const groupId = req.params.groupId;

  const query = 'SELECT * FROM Posts WHERE group_id = ?';
  const values = [groupId];

  connection.query(query, values, (err, results) => {
    if (err) {
      console.error('Error executing MySQL query:', err);
      res.status(500).send('Error fetching posts');
    } else {
      res.json(convertImages);
    }
  });
});

server.listen(port, () => {
  console.log(`App running on port ${port}.`);
});
