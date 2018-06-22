#!/usr/bin/env node
'use strict';

// Init

require('dotenv').config();
const
  debug = require('debug')('words'),
  debugDb = require('debug')('db'),
  express = require('express'),
  RateLimit = require('express-rate-limit'),
  helmet = require('helmet'),
  compression = require('compression'),
  { MongoClient } = require('mongodb'),
  session = require('express-session'),
  MongoStore = require('connect-mongo')(session),
  bodyParser = require('body-parser'),
  app = express(),
  expressWs = require('express-ws')(app),
  debugWs = require('debug')('ws');
var
  retryConn,
  port = process.env.PORT || 8000,
  host = process.env.HOST || '0.0.0.0';
process.env.MONGO_SERVER = process.env.DYNO ? process.env.MONGO_SERVER_HEROKU : process.env.MONGO_SERVER_DEV;

// Db connect

(retryConn = () => MongoClient.connect(process.env.MONGO_SERVER, {autoReconnect: true})
  .then(client => {
    debugDb('Connected to MongoDB');
    return app.db = client.on('close', e => debugDb('*close %O', e.message))
      .on('reconnect', c => debugDb('*reconnect %O', c.topology.s.host + ":" + c.topology.s.port))
      .db('jinxwords')
  })
  .catch(err => {
    debugDb('*err %s', err.name);
    return new Promise(resolve => setTimeout(resolve, 1000)).then(retryConn)
  })
)().then(db => {

  // Middleware

  app.enable('trust proxy');

  var limiter = new RateLimit({
    windowMs: 15*60*1000,
    delayAfter: 100,
    delayMs: 3*1000,
    max: 200,
    message: "Flood limit"
  });

  app.use(helmet());
  app.use(compression());
  app.use(session({
    resave: false,
    saveUninitialized: false,
    secret: process.env.SECRET,
    name: 'sessionId',
    store: new MongoStore({ db }),
    cookie: {
      secure: true
    },
    rolling: true,
    unset: 'destroy',
    proxy: true
  }));

  app.use(bodyParser.urlencoded({ extended: true }));
  app.use(express.static('public'));

  app.use(limiter);

  // Controllers

  app.use(require('./controllers/wsController.js'));
  app.on('updategame', require('./controllers/gameController.js'));

  app.use((req, res) => res.redirect('/'));

  // Listen

  return new Promise((resolve, reject, server) => server = app.listen(port, host, err => {
    if (err) return reject(err);
    resolve(server)
  })).then(server => debug('Listening on port %d', server.address().port))
}).catch(err => debug('*err %O', err))
