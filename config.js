require('dotenv').config();
const config = {
  db: {
    host: 'db4free.net',
    user: 'socialmediaapp',
    password: process.env.SQL_PASSWORD,
    database: 'socialmediaapp',
  },
  listPerPage: 10,
};
module.exports = config;
