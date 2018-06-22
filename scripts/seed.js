#!/usr/bin/env node
'use strict';

require('dotenv').config();
const
  debug = require('debug')('seed'),
  { MongoClient } = require('mongodb');
var conn, db;
process.env.MONGO_SERVER = process.env.DYNO ? process.env.MONGO_SERVER_HEROKU : process.env.MONGO_SERVER_DEV;


MongoClient.connect(process.env.MONGO_SERVER)
  .then(client => (conn = client).db('jinxwords'))
  .then(result => (db = result).dropDatabase())
  .then(() => Promise.all([
    db.createCollection('players')
      .then(() => db.collection('players').createIndex({'name': 1}))
      .then(() => db.collection('players').createIndex({'room_id': 1}))
      .then(() => debug('Players welcomed')),
    db.createCollection('rooms').then(() => debug('Rooms warmed up')),
    db.createCollection('sessions').then(() => debug('Sessions dropped'))
  ])).catch(err => debug('*err %O', err)).then(() => conn && conn.close())
