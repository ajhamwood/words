require('dotenv').config();
const debug = require('debug')('app'),
  { ObjectId } = require('mongodb');

let iv, consensusSpeed = 30, duration = 180000, roundDuration = 15000;
module.exports = function (app) {
  const
    Rooms = require('../models/roomModel.js')(app),
    Players = require('../models/playerModel.js')(app);

  function consensus (r, balance, delta, time, dt, uniques, jinx) {
    let room = Rooms.find(r), bal = balance + dt * delta / consensusSpeed / 1e3;
    Rooms.update(r, { $set: { 'gametype.balance': bal } });
    debug('*vote balance %d %d in room %s', bal, delta = (jinx - uniques) / 2, r);
    let timer = delta < 0 ? bal * consensusSpeed * 500 / -delta : delta > 0 ? consensusSpeed * 500 / delta * (1 - bal) : 0;
    room.players.forEach((p, pws) => p.voted &&
      pws.send(JSON.stringify({ update: 'vote', balance: Math.floor(bal * 1e3) / 1e3, delta, time, uniques, jinx })));
    iv && clearTimeout(iv);
    iv = timer && setTimeout(async () => {
      let gametype = delta < 0 ? 'uniques' : 'jinx',
          { letters } = (await Rooms.findOneAndUpdate(r,
            { $set: { gametype, phase: 'ready', 'gamedata.found': null, ...(delta < 0 ? { 'gamedata.repeats': null } : {}) } },
            { projection: { 'gamedata.letters': 1 } }
          )).value.gamedata;
      debug('*consensus: %s in room %s', gametype, r);
      room.players.forEach((_, pws) => {
        pws.send(JSON.stringify({ update: 'vote', gametype }));
        pws.send(JSON.stringify({ update: 'gamedata', letters }))
      })
    }, timer)
  }

  function jinxround (r, found, playerwords, lastPlayer) {
    let room = Rooms.find(r), roundComplete = () => {
          Rooms.update(r, { $set: { gamedata: { letters: null, begintime: null, found: null }, phase: 'ready' } });
          Players.update([...room.players.keys()], { $set: { found: null, round: null, score: null, ready: false } }, { multi: 1 });
          room.players.forEach((_, pws) => {
            typeof lastPlayer == 'string' && pws.send(JSON.stringify({ gameevent: 'Round over', playerwords: { [lastPlayer]: { found: '', jinx: false } } }));
            pws.send(JSON.stringify({ status: 'Game over' }))
          });
          debug('*Jinx game over in room %s', r)
        }, leaders = [...room.players.values()].reduce((a, x) => a[0] && a[0].score > x.score ? a : a[0] && a[0].score == x.score ? [...a, x] : [x], []);
    Rooms.update(r, { $addToSet: { 'gamedata.found': { $each: found } } });
    room.players.forEach((_, pws) => pws.send(JSON.stringify({ gameevent: 'Round over', playerwords })));
    if (typeof lastPlayer == 'string') {
      clearInterval(iv); clearTimeout(iv);
      if (leaders.length == 1 && leaders[0].round != null) roundComplete();
      else iv = setTimeout(roundComplete, roundDuration)
    } else if (lastPlayer == 0 || lastPlayer == 1 && leaders.length == 1 && leaders[0].round != null) roundComplete(clearInterval(iv))
  }

  // Player submits username
  app.on('username', function (ws, username) {
    Players.update(ws, { $set: { name: username } });
    ws.send(JSON.stringify({status: 'Username registered'}))
  });

  // Player created new room as host
  app.on('host', async function (ws, roomname, letters) {
    let r = ws.room_id = await Rooms.insert({ name: roomname, phase: 'voting', lock: false,
          gametype: { uniques: 0, jinx: 0, empty: 1, time: Date.now(), balance: .5 },
          gamedata: { letters, begintime: null }
        });
    ws.send(JSON.stringify({status: 'Created room'}));
    Players.update(ws, { $set: { role: 'host', ready: true, room_id: r } });
    Rooms.find(r).players = new Map([[ws, Players.find(ws)]]);
    debug('*created room %s', r)
  });

  // Player joins a room
  app.on('guest', function (ws, r, roomname) {
    let room = Rooms.find(ws.room_id = r), player = Players.find(ws);
    if (room.phase == 'voting') Rooms.update(r, { $inc: { 'gametype.empty': 1 } });
    ws.send(JSON.stringify({ status: 'Joined room', playerList: [...room.players.values()].map(data => data.name) }));
    if (room.phase == 'ready') {
      ws.send(JSON.stringify({ update: 'gamedata', letters: room.gamedata.letters }));
      ws.send(JSON.stringify({ update: 'vote', gametype: room.gametype }))
    }
    Players.update(ws, { $set: { role: 'guest', ready: true, room_id: r } });
    room.players.forEach((_, pws) => pws.send(JSON.stringify({ status: 'Joined room', playerList: [player.name] })));
    room.players.set(ws, player)
  });

  // Player leaves a room
  app.on('leave', async function (ws) {
    let r = ws.room_id, room = Rooms.find(r), player = Players.find(ws);
    Players.remove(ws);
    if (!r) return;
    room.players.delete(ws);
    if (room.players.size == 0) Rooms.remove(r);
    else {
      room.players.forEach((_, pws) => pws.send(JSON.stringify({ status: 'Left room', playerList: [player.name] }))); //BUG: errors if simultaneous drop out
      if (room.phase == 'voting') {
        let time = Date.now(), value = (await Rooms.findOneAndUpdate(r,
              { $inc: (player.voted ? { ['gametype.' + player.voted]: -1 } : { 'gametype.empty': -1 }),
                $set: { 'gametype.time': time } }
            )).value.gametype, jinx = value.jinx, uniques = value.uniques, delta = (jinx - uniques) / 2;
        if (player.voted == 'uniques') uniques--;
        else if (player.voted == 'jinx') jinx--;
        consensus(r, value.balance, delta, time, time - value.time, uniques, jinx);
      }
      if (player.role == 'host') { // BUG: if last players leave room simultaneously
        let [readyPlayers, waitingPlayers] = [...room.players.entries()].reduce((a, x) => (x[1].ready ? a[0].push(x) : a[1].push(x), a), [[], []]);
        if (readyPlayers.length == 0) return;
        let newHost = readyPlayers[Math.floor(readyPlayers.length * Math.random())][0],
            waiting = room.phase == 'ready' ? waitingPlayers.map(x => x[1].name) : [];
        newHost.send(JSON.stringify({ update: 'New host', waiting }));
        Players.update(newHost, { $set: { role: 'host' } })
      }
    }
  });

  // Player votes on the gametype in their room
  app.on('votegametype', async function (ws, gametype) {
    let r = ws.room_id, room = Rooms.find(r),
        { voted } = (await Players.findOneAndUpdate(ws, { $set: { voted: gametype } })).value,
        voteChanged = voted == Players.find(ws).voted,
        { uniques, jinx } = { [gametype]: 1 - voteChanged, [(gametype == 'uniques' ? 'jinx': 'uniques')]: (voted == null || voteChanged) - 1 },
        time = Date.now(), value = (await Rooms.findOneAndUpdate(r,
          { $inc: { 'gametype.uniques': uniques, 'gametype.jinx': jinx, 'gametype.empty': -(voted == null) },
            $set: { 'gametype.time': time } }
        )).value.gametype, delta = (value.jinx - value.uniques) / 2;
    uniques += value.uniques; jinx += value.jinx;
    consensus(r, value.balance, delta, time, time - value.time, uniques, jinx);
    ws.send(JSON.stringify({status: 'Vote acknowledged'}))
  });

  // Host triggers a new vote for gametype
  app.on('unsetgametype', function (ws) {
    let r = ws.room_id, room = Rooms.find(r), empty = room.players.size;
    Players.update([...room.players.keys()], { $set: { voted: null, found: null, score: null } }, { multi: 1 });
    room.players.forEach((p, pws) => {
      p.role != 'host' && pws.send(JSON.stringify({update: 'Gametype unset'}));
      if (!p.ready) pws.close()
    });
    Rooms.update(ws.room_id, { $set: {
      gametype: { uniques: 0, jinx: 0, empty, time: Date.now(), balance: .5 },
      gamedata: { letters: room.gamedata.letters, begintime: null }, phase: 'voting' }
    })
  });

  // Host sets lock state of room
  app.on('lock', function (ws, lock) {
    Rooms.update(ws.room_id, { $set: { lock } });
    ws.send(JSON.stringify({update: 'Room lock state set', lock}))
  });

  // Player sets their emote
  app.on('emote', function (ws, emote) {
    Rooms.find(ws.room_id).players.forEach((_, pws) => pws != ws && pws.send(JSON.stringify({ update: 'Player emote', player: Players.find(ws).name, emote })))
  });

  // Host kicks a player out of the room
  app.on('kick', async function (ws, kick) {
    let result = await Players.findOneAndUpdate({ name: kick }, { $set: { room_id: null } });
    if (!result) return ws.send(JSON.stringify({error: 'Player not found'}));
    [...Rooms.find(result.value.room_id.toString()).players.keys()].find(pws => pws.id.equals(result.value._id)).close()
  });

  // Host requests to start the game
  app.on('start', function (ws) {
    let begintime = Date.now() + 3500, r = ws.room_id, room = Rooms.find(r);
    if (room.gametype == 'uniques') {
      setTimeout(async () => {
        let playerwords = [...room.players.values()].reduce((a, d) => Object.assign(a, { [d.name]: [...d.found] }), {});
        room.players.forEach((_, pws) => pws.send(JSON.stringify({ status: 'Game over', repeats: [...room.gamedata.repeats.values()], playerwords })));
        Rooms.update(r, { $set: { gamedata: { letters: null, begintime: null, repeats: null, found: null }, phase: 'ready' } });
        Players.update([...room.players.keys()], { $set: { found: null, ready: false } }, { multi: 1 });
        debug('*Uniques game over in room %s', r)
      }, duration + 3500 );
      Rooms.update(r, { $set: { 'gamedata.begintime': begintime, 'gamedata.found': new Set(), 'gamedata.repeats': new Set(), phase: 'play' }})
      Players.update([...room.players.keys()], { $set: { found: new Set() } }, { multi: 1 });
    }
    else if (room.gametype == 'jinx') {
      setTimeout(() => {
        iv = setInterval(async () => {
          let group = [...room.players.entries()].reduce((a, x) => (x[1].round == null || ((a[x[1].round] = a[x[1].round] || []).push(x)), a), {}),
              eliminated = [], alive = [], playerwords = {};
          for (let found in group) {
            if (found == '') eliminated = eliminated.concat(group[found].map(res => res[0]));
            else alive = alive.concat(group[found].map(res => res[0]));
            if (group[found].length > 1) group[found].forEach(res => playerwords[res[1].name] = { found, jinx: true });
            else playerwords[group[found][0][1].name] = { found, jinx: false }
          }
          Players.update(eliminated, { $set: { round: null } }, { multi: 1 });
          alive.forEach(p => Players.update(p, { $set: { round: '' }, $inc: { score: [0, 0, 0, 1, 1, 2, 3, 5, 8, 11][Players.find(p).round.length] } }));
          let found = Object.keys(group).filter(x => x != '');
          jinxround(r, found, playerwords, alive.length)
        }, roundDuration)
      }, 3500);
      Rooms.update(r, { $set: { 'gamedata.begintime': begintime, 'gamedata.found': new Set(), phase: 'play' } });
      Players.update([...room.players.keys()], { $set: { found: [], round: '', score: 0 } }, { multi: 1 });
    }
    room.players.forEach((_, pws) => pws.send(JSON.stringify({ status: 'Starting game', begintime })))
  });

  // Player finds a word
  app.on('found', function (ws, found) {
    let r = ws.room_id, room = Rooms.find(r), player = Players.find(ws);
    if (room.gametype == 'uniques') {
      if (player.found.has(found)) ws.send(JSON.stringify({ gameerror: 'Word already found'}));
      else if (room.gamedata.found.has(found)) {
        [...room.players.entries()].filter(x => x[1].found.has(found)).forEach(x => x[0].send(JSON.stringify({ gameevent: 'word', remove: found })));
        ws.send(JSON.stringify({ gameevent: 'word', repeat: found }));
        Players.update([...room.players.keys()], { $pull: { found } }, { multi: 1 });
        Rooms.update(r, { $addToSet: { 'gamedata.repeats': found } })
      } else {
        ws.send(JSON.stringify({ gameevent: 'word', unique: found }))
        Players.update(ws, { $addToSet: { found } });
        Rooms.update(r, { $addToSet: { 'gamedata.found': found } })
      }
    } else if (room.gametype == 'jinx') {
      if (player.round == null) ws.send(JSON.stringify({ gameerror: 'You have already been eliminated' }));
      else if (room.gamedata.found.has(found)) ws.send(JSON.stringify({ gameerror: 'Word already found' }));
      else if (player.round) ws.send(JSON.stringify({ gameerror: 'Word already submitted' }));
      else if ([...room.players.values()].filter(x => x.round == null).length == room.players.size - 1) {
        Players.update(ws, { $set: { round: '' }, $push: { found }, $inc: { score: [0, 0, 0, 1, 1, 2, 3, 5, 8, 11][found.length] } });
        jinxround(r, [found], { [player.name]: { found, jinx: false } }, player.name)
      } else Players.update(ws, { $set: { round: found }, $push: { found } })
    }
  });

  // Host provides game letters
  app.on('letters', function (ws, letters) {
    let r = ws.room_id;
    Rooms.update(r, { $set: { 'gamedata.letters': letters } });
    Rooms.find(r).players.forEach((_, pws) => pws != ws && pws.send(JSON.stringify({ update: 'gamedata', letters })))
  });

  // Player indicates they are ready for the next game
  app.on('ready', function (ws) {
    let r = ws.room_id, room = Rooms.find(r);
    Players.update(ws, { $set: { ready: true } });
    if ([...room.players.values()].filter(x => x.role == 'host').length == 0) {
      ws.send(JSON.stringify({update: 'New host', waiting: [...room.players.entries()].reduce((a, x) => (x[1].ready || a.push(x[1].name), a), [])}));
      Players.update(ws, { $set: { role: 'host' } })
    } else room.players.forEach((p, pws) => p.role == 'host' && pws.send(JSON.stringify({ update: 'Player ready', name: Players.find(ws).name })))
  })

}
