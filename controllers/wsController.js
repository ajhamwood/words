require('dotenv').config();
const
  debug = require('debug')('app'),
  debugWs = require('debug')('ws'),
  express = require('express'),
  { ObjectId } = require('mongodb'),
  router = express.Router();

router.ws('/', (ws, req) => {
  ws.on('message', async function (msg) {
    if (!msg) return;
    try { msg = JSON.parse(msg) }
    catch (e) {
      debug('*err %O', e.message);
      return ws.send(JSON.stringify({error: 'Bad message'}))
    }
    debugWs('*msg %O', msg);
    let kl = Object.keys(msg).length, test;

    // API routes
    if ('username' in msg && kl == 1) {
      if (msg.username.match(/^[A-Za-z0-9]{1,15}$/)) {
        if (await req.app.db.collection('players').find({ name: msg.username }).count() > 0)
          ws.send(JSON.stringify({error: 'Username taken'}));
        else req.app.emit('updategame', { ...msg, ws })
      } else ws.send(JSON.stringify({error: 'Bad username'}))
    }

    else if ('role' in msg && 'roomname' in msg) {
      if (msg.role.match(/^(guest|host)$/) && msg.roomname.match(/^[A-Za-z0-9]{1,15}$/)) {

        if (msg.role == 'host' && 'letters' in msg && kl == 3) {
          if (!Array.prototype.isPrototypeOf(msg.letters) || !msg.letters.join('').match(/^[A-Z]{9}$/))
            ws.send(JSON.stringify({error: 'Bad letters'}))
          else if (await req.app.db.collection('rooms').find({ name: msg.roomname }).count() > 0)
            ws.send(JSON.stringify({error: 'Roomname taken'}));
          else req.app.emit('updategame', { host: ws, roomname: msg.roomname, letters: msg.letters })
        }

        else if (msg.role == 'guest' && kl == 2) {
          let maybeRoom = await req.app.db.collection('rooms').find({ name: msg.roomname }).toArray();
          if (maybeRoom.length == 0) ws.send(JSON.stringify({error: 'Room not found'}));
          else if (maybeRoom[0].lock) ws.send(JSON.stringify({error: 'Room is full'}));
          else if (maybeRoom[0].phase == 'play') ws.send(JSON.stringify({error: 'Game is in progress'}));
          else {
            ws.room_id = maybeRoom[0]._id;
            req.app.emit('updategame', { guest: ws })
          }
        }

      } else ws.send(JSON.stringify({error: 'Bad room'}))
    }

    else if ('gametype' in msg && kl == 1) {
      if (msg.gametype.match(/^(uniques|jinx)$/)) {
        if ((await req.app.db.collection('rooms').find({ _id: ws.room_id }).toArray())[0].phase != 'voting')
          ws.send(JSON.stringify({error: 'Voting ended'}));
        else req.app.emit('updategame', { ...msg, voter: ws });
      } else ws.send(JSON.stringify({error: 'Bad gametype'}))
    }

    else if ('lock' in msg && typeof msg.lock == 'boolean' && kl == 1) {
      if ((await req.app.db.collection('players').find({ _id: ws.id }).toArray())[0].role != 'host')
        ws.send(JSON.stringify({error: 'Invalid action'}));
      else req.app.emit('updategame', { ws, lock: !!msg.lock })
    }

    else if ('emote' in msg && kl == 1) {
      if (msg.emote.match(/^.$/u)) req.app.emit('updategame', { ...msg, ws });
      else ws.send(JSON.stringify({error: 'Bad emote'}))
    }

    else if ('kick' in msg && kl == 1) {
      if ((await req.app.db.collection('players').find({ _id: ws.id }).toArray())[0].role != 'host')
        ws.send(JSON.stringify({error: 'Invalid action'}));
      else req.app.emit('updategame', { ...msg, ws })
    }

    else if ('start' in msg && kl == 1) {
      if ((await req.app.db.collection('players').find({ _id: ws.id }).toArray())[0].role != 'host' ||
        (await req.app.db.collection('rooms').find({ _id: ws.room_id }).toArray())[0].phase != 'ready')
        ws.send(JSON.stringify({error: 'Invalid action'}));
      else req.app.emit('updategame', { ...msg, ws })
    }

    else if ('found' in msg && kl == 1) {
      test = async word => {
        let { letters } = (await req.app.db.collection('rooms').find({ _id: ws.room_id }).toArray())[0].gamedata;
        if (word.length > 9 || word.length < 3) return false;
        for (var w = word.split(''), i = 0, j; i < letters.length; i++)
          if (~(j = w.indexOf(letters[i])) && (w.splice(j, 1), !w.length)) break;
        return !w.length
      }
      if ((await req.app.db.collection('rooms').find({ _id: ws.room_id }).toArray())[0].phase != 'play')
        ws.send(JSON.stringify({error: 'Play has ended'}));
      else if (typeof msg.found == 'string' && test(msg.found)) req.app.emit('updategame', { ...msg, ws });
      else ws.send(JSON.stringify({error: 'Bad word'}))
    }

    else if ('letters' in msg && kl == 1) {
      if ((await req.app.db.collection('players').find({ _id: ws.id }).toArray())[0].role != 'host' ||
        (await req.app.db.collection('rooms').find({ _id: ws.room_id }).toArray())[0].phase != 'ready')
        ws.send(JSON.stringify({error: 'Invalid action'}));
      else if (Array.prototype.isPrototypeOf(msg.letters) && msg.letters.join('').match(/^[A-Z]{9}$/))
        req.app.emit('updategame', { ...msg, ws });
      else ws.send(JSON.stringify({error: 'Bad letters'}))
    }

    else if ('ready' in msg && kl == 1) {
      if ((await req.app.db.collection('rooms').find({ _id: ws.room_id }).toArray())[0].phase != 'ready')
        ws.send(JSON.stringify({error: 'Invalid action'}));
      else req.app.emit('updategame', { ...msg, ws })
    } else ws.send(JSON.stringify({error: 'Bad message'}))
  });

  ws.on('close', async function (e) {
    req.app.emit('updategame', { leave: ws });
    clearInterval(iv);
    debugWs('Close: %s %O', ws.id, e)
  });

  ws.on('error', function (e) {
    debugWs('Error: %s %O', ws.id, e)
  });

  ws.isAlive = true;
  ws.on('pong', () => ws.isAlive = true);
  var iv = setInterval(() => ws.isAlive ? (ws.ping(), ws.isAlive = false) : ws.terminate(), 30000);

  req.app.db.collection('players').insert({ name: null, role: null, room_id: null, voted: null, found: null, round: null, score: null, ready: null })
    .then(r => debugWs('Open: %s', ws.id = ObjectId(r.insertedIds[0])));
  ws.send(JSON.stringify({status: 'connected'}))
});

module.exports = router
