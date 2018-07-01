require('dotenv').config();
const
  debug = require('debug')('app'),
  debugWs = require('debug')('ws'),
  express = require('express'),
  router = express.Router();

router.ws('/', (ws, req) => {
  const
    Rooms = require('../models/roomModel.js')(req.app),
    Players = require('../models/playerModel.js')(req.app);

  ws.on('message', function (msg) {
    if (!msg) return;
    try { msg = JSON.parse(msg) }
    catch (e) {
      debug('*err %O', e.message);
      return ws.send(JSON.stringify({error: 'Bad message'}))
    }
    debugWs('*msg from %s: %O', ws.id, msg);
    let kl = Object.keys(msg).length, test;

    // API routes
    if ('username' in msg && kl == 1) {
      if (!msg.username.match(/^[A-Za-z0-9]{1,15}$/)) ws.send(JSON.stringify({error: 'Bad username'}));
      else if (Players.find({ name: msg.username }).size == 0) req.app.emit('username', ws, msg.username);
      else ws.send(JSON.stringify({error: 'Username taken'}))
    }
    else if ('role' in msg && 'roomname' in msg) {
      if (msg.role.match(/^(guest|host)$/) && msg.roomname.match(/^[A-Za-z0-9]{1,15}$/)) {
        if (msg.role == 'host' && 'letters' in msg && kl == 3) {
          if (!Array.prototype.isPrototypeOf(msg.letters) || !msg.letters.join('').match(/^[A-Z]{9}$/))
            ws.send(JSON.stringify({error: 'Bad letters'}));
          else if (Rooms.find({ name: msg.roomname }).size == 0) req.app.emit('host', ws, msg.roomname, msg.letters);
          else ws.send(JSON.stringify({error: 'Roomname taken'}))
        }
        else if (msg.role == 'guest' && kl == 2) {
          let maybeRoom = [...Rooms.find({ name: msg.roomname }).values()];
          if (maybeRoom.length == 0) ws.send(JSON.stringify({error: 'Room not found'}));
          else if (maybeRoom[0].lock) ws.send(JSON.stringify({error: 'Room is full'}));
          else if (maybeRoom[0].phase == 'play') ws.send(JSON.stringify({error: 'Game is in progress'}));
          else req.app.emit('guest', ws, maybeRoom[0]._id.toString(), msg.roomname)
        }
      } else ws.send(JSON.stringify({error: 'Bad room'}))
    }
    else if ('gametype' in msg && kl == 1) {
      if (msg.gametype == null) {
        if (Players.find(ws).role == 'host' && Rooms.find(ws.room_id).phase == 'ready') req.app.emit('unsetgametype', ws);
        else ws.send(JSON.stringify({error: 'Invalid action'}))
      }
      else if (typeof msg.gametype == 'string' && msg.gametype.match(/^(uniques|jinx)$/)) {
        if (Rooms.find(ws.room_id).phase == 'voting') req.app.emit('votegametype', ws, msg.gametype);
        else ws.send(JSON.stringify({error: 'Voting ended'}))
      } else ws.send(JSON.stringify({error: 'Bad gametype'}))
    }
    else if ('lock' in msg && typeof msg.lock == 'boolean' && kl == 1) {
      if (Players.find(ws).role == 'host') req.app.emit('lock', ws, !!msg.lock);
      else ws.send(JSON.stringify({error: 'Invalid action'}))
    }
    else if ('emote' in msg && kl == 1) {
      if (msg.emote.match(/^.$/u)) req.app.emit('emote', ws, msg.emote);
      else ws.send(JSON.stringify({error: 'Bad emote'}))
    }
    else if ('kick' in msg && kl == 1) {
      if (Players.find(ws).role == 'host') req.app.emit('kick', ws, msg.kick);
      else ws.send(JSON.stringify({error: 'Invalid action'}))
    }
    else if ('start' in msg && kl == 1) {
      if (Players.find(ws).role == 'host' && Rooms.find(ws.room_id).phase == 'ready') req.app.emit('start', ws);
      else ws.send(JSON.stringify({error: 'Invalid action'}))
    }
    else if ('found' in msg && kl == 1) {
      test = word => {
        let { letters } = Rooms.find(ws.room_id).gamedata;
        if (word.length > 9 || word.length < 3) return false;
        for (var w = word.split(''), i = 0, j; i < letters.length; i++)
          if (~(j = w.indexOf(letters[i])) && (w.splice(j, 1), !w.length)) break;
        return !w.length
      }
      if (Rooms.find(ws.room_id).phase != 'play') ws.send(JSON.stringify({error: 'Play has ended'}));
      else if (typeof msg.found == 'string' && test(msg.found)) req.app.emit('found', ws, msg.found);
      else ws.send(JSON.stringify({error: 'Bad word'}))
    }
    else if ('letters' in msg && kl == 1) {
      if (Players.find(ws).role != 'host' || Rooms.find(ws.room_id).phase != 'ready') ws.send(JSON.stringify({error: 'Invalid action'}));
      else if (Array.prototype.isPrototypeOf(msg.letters) && msg.letters.join('').match(/^[A-Z]{9}$/)) req.app.emit('letters', ws, msg.letters);
      else ws.send(JSON.stringify({error: 'Bad letters'}))
    }
    else if ('ready' in msg && kl == 1) {
      if (Rooms.find(ws.room_id).phase == 'ready') req.app.emit('ready', ws);
      else ws.send(JSON.stringify({error: 'Invalid action'}))
    } else ws.send(JSON.stringify({error: 'Bad message'}))
  });

  ws.on('close', async function (e) {
    req.app.emit('leave', ws);
    clearInterval(iv);
    debugWs('Close: %s %O', ws.id, e)
  });

  ws.on('error', function (e) { debugWs('Error: %s %O', ws.id, e) });

  ws.isAlive = true;
  ws.on('pong', () => ws.isAlive = true);
  var iv = setInterval(() => ws.isAlive ? (ws.ping(), ws.isAlive = false) : ws.terminate(), 30000);

  Players.insert(ws, { name: null, role: null, room_id: null, voted: null, found: null, round: null, score: null, ready: null })
    .then(id => debugWs('Open: %s', id));
  ws.send(JSON.stringify({status: 'connected'}))
});

module.exports = router
