require('dotenv').config();
const debug = require('debug')('words');

let iv, roomData = {}, playerData = new Map(), consensusSpeed = 30;
module.exports = async function updategame (opts) {
  let kl = Object.keys(opts).length;

  // Player submits username
  if ('username' in opts && 'ws' in opts && kl == 2) {
    await this.db.collection('players').update({ _id: opts.ws.id }, { $set: { name: opts.username }});
    opts.ws.send(JSON.stringify({status: 'Username registered'}));
    playerData.set(opts.ws, { name: opts.username })
  }

  // Player created new room as host
  else if ('host' in opts && 'roomname' in opts && 'letters' in opts && kl == 3) {
    let result = await this.db.collection('rooms').insert({ name: opts.roomname, phase: 'voting', lock: false,
          gametype: { uniques: 0, jinx: 0, empty: 1, time: Date.now(), balance: .5 },
          gamedata: { letters: opts.letters, begintime: null }
        }), r = opts.host.room_id = result.insertedIds[0];
    await this.db.collection('players').update({ _id: opts.host.id }, { $set: { role: 'host', ready: true, room_id: opts.host.room_id }});
    opts.host.send(JSON.stringify({status: 'Created room'}));
    roomData[r] = { players: new Map([[opts.host, Object.assign(playerData.get(opts.host), {
      role: 'host', voted: null, ready: true, found: null, round: null
    })]]), phase: 'voting', letters: opts.letters, name: opts.roomname }
  }

  // Player joins a room
  else if ('guest' in opts && kl == 1) {
    await this.db.collection('players').update({ _id: opts.guest.id }, { $set: { role: 'guest', ready: true, room_id: opts.guest.room_id }});
    let r = opts.guest.room_id.toString(), { players } = roomData[r], player = playerData.get(opts.guest);
    if (roomData[r].phase == 'voting') await this.db.collection('rooms').update({ _id: opts.guest.room_id }, { $inc: { 'gametype.empty': 1 } });
    opts.guest.send(JSON.stringify({ status: 'Joined room', playerList: [...players.values()].map(data => data.name) }));
    if (roomData[r].phase == 'ready') {
      opts.guest.send(JSON.stringify({ update: 'gamedata', letters: roomData[r].letters }));
      opts.guest.send(JSON.stringify({ update: 'vote', gametype: roomData[r].gametype }))
    }
    players.forEach((_, ws) => ws.send(JSON.stringify({ status: 'Joined room', playerList: [player.name] })));
    players.set(opts.guest, Object.assign(player, { role: 'guest', voted: null, ready: true, room: roomData[r] }))
  }

  // Player leaves a room
  else if ('leave' in opts && kl == 1) {
    await this.db.collection('players').remove({ _id: opts.leave.id });
    if (!opts.leave.room_id) return;
    let r = opts.leave.room_id.toString(), { players } = roomData[r], player = players.get(opts.leave);
    players.delete(opts.leave);
    if (players.size == 0) {
      await this.db.collection('rooms').remove({ _id: opts.leave.room_id });
      delete roomData[r]
    } else {
      players.forEach((_, ws) => ws.send(JSON.stringify({ status: 'Left room', playerList: [player.name] })));
      if (roomData[r].phase == 'voting') {
        let time = Date.now(), value = (await this.db.collection('rooms').findOneAndUpdate(
              { _id: opts.leave.room_id, phase: 'voting' },
              { $inc: (player.voted ? { ['gametype.' + player.voted]: -1 } : { 'gametype.empty': -1 }),
                $set: { 'gametype.time': time } }
            )).value.gametype
            dt = time - value.time, dg = (value.jinx - value.uniques) / 2,
            bal = value.balance + dt * dg / consensusSpeed / 1e3,
            jinx = value.jinx, uniques = value.uniques;
        await this.db.collection('rooms').update({ _id: opts.leave.room_id }, { $set: { 'gametype.balance': bal } });
        player.voted == 'uniques' ? uniques-- : jinx--;
        debug('*vote balance %d %d', bal, dg = (jinx - uniques) / 2);
        players.forEach((_, ws) => ws.send(JSON.stringify({ update: 'vote', balance: Math.floor(bal * 1e3) / 1e3, delta: dg, time, uniques, jinx })));
        let timer = dg < 0 ? bal * consensusSpeed * 500 / -dg : dg > 0 ? consensusSpeed * 500 / dg * (1 - bal) : 0;
        iv && clearTimeout(iv);
        iv = timer && setTimeout(async () => { //dg, room_id
          let gametype = dg < 0 ? 'uniques' : 'jinx';
          Object.assign(roomData[r], { phase: 'ready', gametype });
          let { letters } = (await this.db.collection('rooms').findOneAndUpdate({ _id: opts.leave.room_id },
            { $set: { gametype, phase: 'ready', 'gamedata.found': null, ...(dg < 0 ? { 'gamedata.repeats': null } : {}) } },
            { projection: { 'gamedata.letters': 1 } }
          )).value.gametype;
          debug('*consensus: %s', gametype);
          players.forEach((_, ws) => {
            ws.send(JSON.stringify({ update: 'vote', gametype }));
            ws.send(JSON.stringify({ update: 'gamedata', letters }))
          })
        }, timer)
      }
      if (player.role == 'host') { // BUG: if last players leave room simultaneously
        let [readyPlayers, waitingPlayers] = [...players.entries()].reduce((a, x) => (x[1].ready ? a[0].push(x) : a[1].push(x), a), [[], []]);
        if (readyPlayers.length == 0) return roomData[r].hostless = true;
        let newHost = readyPlayers[Math.floor(readyPlayers.length * Math.random())][0],
            waiting = roomData[r].phase == 'ready' ? waitingPlayers.map(x => x[1].name) : [];
        newHost.send(JSON.stringify({update: 'New host', waiting}));
        await this.db.collection('players').update({ _id: newHost.id }, { $set: { role: 'host' } });
        players.get(newHost).role = 'host'
      }
    }
  }

  // Player votes on the gametype in their room
  else if ('gametype' in opts && 'voter' in opts && kl == 2) {
    let r = opts.voter.room_id.toString(),
        { players } = roomData[r], player = players.get(opts.voter),
        { voted } = (await this.db.collection('players').findOneAndUpdate(
          { _id: opts.voter.id },
          { $set: { voted: opts.gametype } }
        )).value,
        voteChanged = voted == (player.voted = opts.gametype),
        { uniques, jinx } = {
          [opts.gametype]: 1 - voteChanged,
          [(opts.gametype == 'uniques' ? 'jinx': 'uniques')]: (voted == null || voteChanged) - 1
        },
        time = Date.now(), value = (await this.db.collection('rooms').findOneAndUpdate(
          { _id: opts.voter.room_id },
          { $inc: { 'gametype.uniques': uniques, 'gametype.jinx': jinx, 'gametype.empty': -(voted == null) },
            $set: { 'gametype.time': time } }
        )).value.gametype,
        dt = time - value.time, dg = (value.jinx - value.uniques) / 2,
        bal = value.balance + dt * dg / consensusSpeed / 1e3;
    uniques += value.uniques; jinx += value.jinx;
    await this.db.collection('rooms').update({ _id: opts.voter.room_id }, { $set: { 'gametype.balance': bal } });
    dg += !voteChanged * (2 * (opts.gametype == 'jinx') - 1) / (1 + (voted == null));
    debug('*vote balance %d %d', bal, dg);
    let timer = dg < 0 ? bal * consensusSpeed * 500 / -dg : dg > 0 ? consensusSpeed * 500 / dg * (1 - bal) : 0;
    opts.voter.send(JSON.stringify({status: 'Vote acknowledged'}));
    players.forEach((p, ws) => p.voted && ws.send(JSON.stringify({ update: 'vote', balance: Math.floor(bal * 1e3) / 1e3, delta: dg, time, uniques, jinx })));
    iv && clearTimeout(iv);
    iv = timer && setTimeout(async () => {
      let gametype = dg < 0 ? 'uniques' : 'jinx';
      Object.assign(roomData[r], { phase: 'ready', gametype });
      let { letters } = (await this.db.collection('rooms').findOneAndUpdate({ _id: opts.voter.room_id },
        { $set: { gametype, phase: 'ready', 'gamedata.found': null, ...(dg < 0 ? { 'gamedata.repeats': null } : {}) } },
        { projection: { 'gamedata.letters': 1 } }
      )).value.gamedata;
      debug('*consensus: %s', gametype);
      players.forEach((_, ws) => {
        ws.send(JSON.stringify({ update: 'vote', gametype }));
        ws.send(JSON.stringify({ update: 'gamedata', letters }))
      })
    }, timer)
  }

  // Host sets lock state of room
  else if ('lock' in opts && 'ws' in opts && kl == 2) {
    await this.db.collection('rooms').update({ _id: opts.ws.room_id }, { $set: { lock: !!opts.lock }});
    opts.ws.send(JSON.stringify({update: 'Room lock state set', lock: !!opts.lock}))
  }

  // Player sets their emote
  else if ('emote' in opts && 'ws' in opts && kl == 2) {
    let { name } = (await this.db.collection('players').find({ _id: opts.ws.id }).toArray())[0];
    roomData[opts.ws.room_id.toString()].players
      .forEach((_, ws) => ws != opts.ws && ws.send(JSON.stringify({ update: 'Player emote', player: name, emote: opts.emote })))
  }

  // Host kicks a player out of the room
  else if ('kick' in opts && 'ws' in opts && kl == 2) {
    let result = (await this.db.collection('players').findOneAndUpdate({ name: opts.kick }, { $set: { room_id: null } }));
    if (!result) return ws.send(JSON.stringify({error: 'Player not found'}));
    [...roomData[result.value.room_id.toString()].players.keys()].find(ws => ws.id.equals(result.value._id)).close()
  }

  // Host requests to start the game
  else if ('start' in opts && 'ws' in opts && kl == 2) {
    let begintime = Date.now() + 3500, r = opts.ws.room_id.toString(),
        { players } = roomData[r], ids = [...players.keys()].map(ws => ws.id);

    if (roomData[r].gametype == 'uniques') {
      setTimeout(async () => {
        await this.db.collection('rooms').update(
          { _id: opts.ws.room_id },
          { $set: { gamedata: { letters: [], begintime: null, repeats: [], found: [] }, phase: 'ready' } }
        ),
        playerwords = (await this.db.collection('players').find({ _id: { $in: ids } }, { projection: { name: 1, found: 1 } }).toArray())
          .reduce((a, d) => Object.assign(a, { [d.name]: d.found }), {}); // Db or Model?
        players.forEach((player, ws) => {
          ws.send(JSON.stringify({ status: 'Game over', repeats: [...roomData[r].repeats.values()], playerwords }));
          player.ready = false
        });
        await this.db.collection('players').update({ _id: { $in: ids } }, { $set: { found: [], ready: false } }, { multi: 1 });
        debug('*Uniques game over in room %s', roomData[r].name)
      }, 183500 );
      await this.db.collection('rooms').update(
        { _id: opts.ws.room_id },
        { $set: { 'gamedata.begintime': begintime, 'gamedata.found': [], 'gamedata.repeats': [], phase: 'play' }}
      );
      await this.db.collection('players').update({ _id: { $in: ids } }, { $set: { found: [] }}, { multi: 1 });
      Object.assign(roomData[r], { found: new Set(), repeats: new Set(), phase: 'play' });
      players.forEach(player => player.found = new Set())
    }

    else if (roomData[r].gametype == 'jinx') {
      setTimeout(() => {
        iv = setInterval(async () => {
          let group = (await this.db.collection('players').find({ _id: { $in: ids }}, { projection: { round: 1, name: 1 } }).toArray())
                .reduce((a, x) => (x.round == null || ((a[x.round] = a[x.round] || []).push(x)), a), {}), playerwords = {},
              eliminated = (group[''] || []).map(res => res._id);
          for (let found in group) {
            if (group[found].length > 1) group[found].forEach(res => playerwords[res.name] = { found, jinx: true });
            else playerwords[group[found][0].name] = { found, jinx: false }
          }
          await this.db.collection('players').update({ _id: { $in: eliminated } }, { $set: { round: null } }, { multi: 1 });
          await this.db.collection('players').update({ _id: { $nin: eliminated }, round: { $ne: null } }, { $set: { round: '' } }, { multi: 1 });
          await this.db.collection('rooms').update({ _id: opts.ws.room_id }, {
            $push: { 'gamedata.found': { $each: Object.keys(group).filter(x => x != '') } }
          });
          players.forEach((p, ws) => {
            ws.send(JSON.stringify({ gameevent: 'Round over', playerwords }));
            p.round = p.round == null || ~eliminated.findIndex(r => r.equals(ws.id)) ? null : ''
          });
          Object.keys(group).forEach(x => roomData[r].found.add(x));
          if (Object.values(playerwords).every(x => x.found == '')) {
            clearInterval(iv);
            await this.db.collection('rooms').update({ _id: opts.ws.room_id }, {
              $set: { gamedata: { letters: [], begintime: null, found: [] }, phase: 'ready' }
            });
            await this.db.collection('players').update({ _id: { $in: ids } }, { $set: { found: [], ready: false } }, { multi: 1 });
            players.forEach((player, ws) => {
              ws.send(JSON.stringify({ status: 'Game over' }))
              player.ready = false
            });
            roomData[r].phase = 'ready'
            debug('*Jinx game over in room %s', roomData[r].name)
          }
        }, 10000)
      }, 3500);
      await this.db.collection('rooms').update(
        { _id: opts.ws.room_id },
        { $set: { 'gamedata.begintime': begintime, 'gamedata.found': [], phase: 'play' }}
      );
      Object.assign(roomData[r], { found: new Set(), phase: 'play' });
      await this.db.collection('players').update({ _id: { $in: ids } }, { $set: { found: [], round: '' } }, { multi: 1 });
      players.forEach(player => Object.assign(player, { found: [], round: '' }))
    }

    players.forEach((_, ws) => ws.send(JSON.stringify({ status: 'Starting game', begintime })))
  }

  // Player finds a word
  else if ('found' in opts && 'ws' in opts && kl == 2) {
    let r = opts.ws.room_id.toString(), { players } = roomData[r];
    if (roomData[r].gametype == 'uniques') {
      if (players.get(opts.ws).found.has(opts.found))
        opts.ws.send(JSON.stringify({ gameerror: 'Word already found'}));
      else if (roomData[r].found.has(opts.found)) {
        let ids = [...players.entries()].filter(x => x[1].found.delete(opts.found))
          .map(x => (x[0].send(JSON.stringify({ gameevent: 'word', remove: opts.found })), x[0].id));
        roomData[r].repeats.add(opts.found);
        opts.ws.send(JSON.stringify({ gameevent: 'word', repeat: opts.found }));
        await this.db.collection('players').update({ _id: { $in: ids } }, { $pull: { found: opts.found } }, { multi: 1 });
        await this.db.collection('rooms').update({ _id: opts.ws.room_id }, { $addToSet: { 'gamedata.repeats': opts.found }})
      } else {
        roomData[r].found.add(opts.found);
        players.get(opts.ws).found.add(opts.found);
        opts.ws.send(JSON.stringify({ gameevent: 'word', unique: opts.found }))
        await this.db.collection('players').update({ _id: opts.ws.id }, { $push: { found: opts.found } });
        await this.db.collection('rooms').update({ _id: opts.ws.room_id }, { $push: { 'gamedata.found': opts.found }})
      }
    } else if (roomData[r].gametype == 'jinx') {
      if (playerData.get(opts.ws).round == null) opts.ws.send(JSON.stringify({ gameerror: 'You have already been eliminated' }));
      else if (roomData[r].found.has(opts.found)) opts.ws.send(JSON.stringify({ gameerror: 'Word already found' }));
      else if (playerData.get(opts.ws).round) opts.ws.send(JSON.stringify({ gameerror: 'Word already submitted' }));
      else {
        await this.db.collection('players').update({ _id: opts.ws.id }, { $set: { round: opts.found }, $push: { found: opts.found }});
        let player = players.get(opts.ws);
        player.found.push(player.round = opts.found)
      }
    }
  }

  // Host provides game letters
  else if ('letters' in opts && 'ws' in opts && kl == 2) {
    let r = opts.ws.room_id.toString(), { letters } = opts;
    await this.db.collection('rooms').update({ _id: opts.ws.room_id }, { $set: { 'gamedata.letters': letters }});
    roomData[r].players.forEach((_, ws) => ws != opts.ws && ws.send(JSON.stringify({ update: 'gamedata', letters })));
    Object.assign(roomData[r], { letters })
  }

  // Player indicates they are ready for the next game
  else if ('ready' in opts && 'ws' in opts && kl == 2) {
    await this.db.collection('players').update({ _id: opts.ws.id }, { $set: { ready: true } });
    playerData.get(opts.ws).ready = true;
    let r = opts.ws.room_id.toString(), { players } = roomData[r];
    if (roomData[r].hostless) {
      delete roomData[r].hostless;
      let waiting = [...players.entries()].reduce((a, x) => (x[1].ready || a.push(x[1].name), a), []);
      opts.ws.send(JSON.stringify({update: 'New host', waiting}));
      await this.db.collection('players').update({ _id: opts.ws.id }, { $set: { role: 'host' } });
      players.get(opts.ws).role = 'host'
    } else roomData[opts.ws.room_id.toString()].players
      .forEach((player, ws) => player.role == 'host' && ws.send(JSON.stringify({ update: 'Player ready', name: playerData.get(opts.ws).name })))
  }
}
