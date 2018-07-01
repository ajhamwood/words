require('dotenv').config();
const
  debug = require('debug')('models'),
  { ObjectId } = require('mongodb'),
  Model = require('./baseModel.js');
let roomData = new Map();

function lookup (key) {
  return [...roomData.entries()].filter(([_, v]) => Object.entries(key).every(([k1, v1]) => v[k1] == v1)).map(x => x[0])
}
function subdoc (key, obj, s) { return [(s = key.split('.')).pop(), s.reduce((a, x) => a[x], obj)] }

module.exports = app => {
  return Object.assign(new Model(), {
    find (key) {
      return typeof key == 'string' ? roomData.get(key) : new Map(lookup(key).map(x => [x, roomData.get(x)]))
    },
    insert (query) {
      return this.pipe(() => app.db.collection('rooms').insert(query).then(r => {
        let room_id = ObjectId(r.insertedIds[0]).toString();
        roomData.set(room_id, query);
        debug('#insert room %s %O', room_id, roomData.get(room_id));
        return room_id
      }))
    },
    update (key, query) {
      if ('$set' in query) for (let k in query['$set']) {
        let [prop, sd] = subdoc(k, roomData.get(key)), set = query['$set'][k];
        sd[prop] = set;
        if (Set.prototype.isPrototypeOf(set)) {
          delete query['$set'][k];
          query['$set'][k] = [...set]
        }
      }
      if ('$push' in query) for (let k in query['$push']) {
        let [prop, sd] = subdoc(k, roomData.get(key)), toPush = query['$push'][k];
        if (typeof toPush == 'object' && '$each' in toPush) sd[prop] = sd[prop].concat(toPush['$each']);
        else sd[prop].push(toPush)
      }
      if ('$addToSet' in query) for (let k in query['$addToSet']) {
        let [prop, sd] = subdoc(k, roomData.get(key)), toAdd = query['$addToSet'][k];
        if ('add' in sd[prop]) {
          if (typeof toAdd == 'object' && '$each' in toAdd) toAdd['$each'].forEach(x => sd[prop].add(x));
          else sd[prop].add(toAdd);
        } else {
          if (typeof toAdd == 'object' && '$each' in toAdd) toAdd['$each'].forEach(x => ~sd[prop].indexOf(x) || sd[prop].push(x));
          else ~sd[prop].indexOf(toAdd) || sd[prop].push(toAdd)
        }
      }
      if ('$inc' in query) for (let k in query['$inc']) {
        let [prop, sd] = subdoc(k, roomData.get(key));
        sd[prop] += query['$inc'][k]
      }
      debug('#update room %s %O', key, roomData.get(key));
      return this.pipe(() => app.db.collection('rooms').update({ _id: ObjectId(key) }, query))
    },
    remove (key) {
      roomData.delete(key);
      debug('#remove room %s', key);
      return this.pipe(() => app.db.collection('rooms').remove({ _id: ObjectId(key) }))
    },
    findOneAndUpdate (key, query, options) {
      if ('$set' in query) for (let k in query['$set']) {
        let [prop, sd] = subdoc(k, roomData.get(key));
        sd[prop] = query['$set'][k]
      }
      if ('$inc' in query) for (let k in query['$inc']) {
        let [prop, sd] = subdoc(k, roomData.get(key));
        sd[prop] += query['$inc'][k]
      }
      debug('#findOneAndUpdate room %s %O', key, roomData.get(key));
      return this.pipe(() => app.db.collection('rooms').findOneAndUpdate({ _id: ObjectId(key) }, query, options))
    }
  })
}
