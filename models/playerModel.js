require('dotenv').config();
const
  debug = require('debug')('models'),
  { ObjectId } = require('mongodb'),
  Model = require('./baseModel.js');
let playerData = new Map();

function lookup (key) {
  return [...playerData.entries()].filter(([_, v]) => Object.entries(key).every(([k1, v1]) => v[k1] == v1)).map(x => x[0])
}

module.exports = app => {
  return Object.assign(new Model(), {
    find (key) {
      return 'id' in key ? playerData.get(key) : new Map(lookup(key).map(x => [x, playerData.get(x)]))
    },
    insert (key, query) {
      playerData.set(key, query);
      debug('#insert player %s %O', key.id, playerData.get(key))
      return this.pipe(() => app.db.collection('players').insert(query).then(r => key.id = ObjectId(r.insertedIds[0])))
    },
    update (key, query, options) {
      if (options && options.multi) {
        if ('$set' in query) for (let k1 in query['$set']) {
          let set = query['$set'][k1];
          if (Set.prototype.isPrototypeOf(set)) {
            key.forEach(k => playerData.get(k)[k1] = new Set([...set]));
            delete query['$set'][k1];
            query['$set'][k1] = [...set]
          } else if (Array.prototype.isPrototypeOf(set)) key.forEach(k => playerData.get(k)[k1] = [...set]);
          else key.forEach(k => playerData.get(k)[k1] = set)
        };
        if ('$push' in query) for (let k1 in query['$push']) key.forEach(k => playerData.get(k)[k1].push(query['$push'][k1]));
        if ('$pull' in query) for (let k1 in query['$pull']) key.forEach(k => {
          let d = playerData.get(k)[k1], toPull = query['$pull'][k1];
          'delete' in d ? d.delete(toPull) : d.splice(d.indexOf(toPull), 1)
        });
        if ('$inc' in query) for (let k1 in query['$inc']) key.forEach(k => playerData.get(k)[k1] += query['$inc'][k1]);
        debug('#update player %O', new Map(key.map(x => [x.id, playerData.get(x)])));
        return this.pipe(() => app.db.collection('players').update({ _id: { $in: key.map(k => k.id) } }, query, { multi: 1 }))
      } else {
        if ('$set' in query) Object.assign(playerData.get(key), query['$set']);
        if ('$push' in query) for (let k in query['$push']) playerData.get(key)[k].push(query['$push'][k]);
        if ('$addToSet' in query) for (let k in query['$addToSet']) {
          let d = playerData.get(key)[k], toAdd = query['$addToSet'][k];
          'add' in d ? d.add(toAdd) : (~d.indexOf(toAdd) || d.push(toAdd)) //will fail if toAdd is an array
        }
        if ('$pull' in query) for (let k in query['$pull']) {
          let d = playerData.get(key)[k], toPull = query['$pull'][k];
          'delete' in d ? d.delete(toPull) : d.splice(d.indexOf(toPull), 1)
        }
        if ('$inc' in query) for (let k in query['$inc']) playerData.get(key)[k] += query['$inc'][k];
        debug('#update player %s %O', key.id, playerData.get(key));
        return this.pipe(() => app.db.collection('players').update({ _id: key.id }, query))
      }
    },
    remove (key) {
      players = 'id' in key ? [key] : lookup(key);
      players.forEach(p => playerData.delete(p));
      debug('#remove player %s', players.map(x => x.id));
      return this.pipe(() => app.db.collection('players').remove({ _id: { $in: players.map(x => x.id) } }))
    },
    findOneAndUpdate (key, query) {
      players = 'id' in key ? [key] : lookup(key);
      if ('$set' in query) Object.assign(playerData.get(players[0]), query['$set']);
      debug('#findOneAndUpdate player %s %O', players[0].id, playerData.get(players[0]));
      return this.pipe(() => app.db.collection('players').findOneAndUpdate({ _id: players[0].id }, query))
    }
  })
}
