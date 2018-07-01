#!/usr/bin/env node
'use strict';

// Init

require('dotenv').config();
process.env.DEBUG = { development: process.env.DEBUG_DEV, production: process.env.DEBUG_PROD }[process.env.NODE_ENV];
process.env.MONGO_SERVER = process.env.DYNO ? process.env.MONGO_SERVER_PROD : process.env.MONGO_SERVER_DEV;
const
  debug = require('debug')('app'),
  debugSrv = require('debug')('server'),
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

debugSrv('Server environment: %s', process.env.NODE_ENV);

// Db connect

(retryConn = () => MongoClient.connect(process.env.MONGO_SERVER, {autoReconnect: true})
  .then(client => {
    debugSrv('Connected to MongoDB');
    return app.db = client.on('close', e => debugSrv('*close %O', e.message))
      .on('reconnect', c => debugSrv('*reconnect %O', c.topology.s.host + ":" + c.topology.s.port))
      .db('jinxwords')
  })
  .catch(err => {
    debugSrv('*err %s', err.name);
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
  require('./controllers/gameController.js')(app);

  app.use((req, res) => res.redirect('/'));

  // Listen

  let server = app.listen(port, host, err => {
    if (err) throw err;
    debugSrv('Listening on port %d', server.address().port)
  })
}).catch(err => debug('*err %O', err))
