// Utilities
function $ (sel, node) { return Array.prototype.slice.call( (node || document).querySelectorAll(sel) ) }
$.addEvents = function (obj, node) {
  for (var q in obj) for (var e in obj[q])
    for (var ns = q ? $(q, node) : [window, document], es = e.split(' '), i = 0; i < es.length; i++)
      typeof ns === 'undefined' || ns.forEach(n => n.addEventListener(es[i], obj[q][e].bind(n))) };
$.load = function (id, query) {
  (typeof query === 'undefined' ? [document.body] : $(query))
    .forEach(n => n.appendChild(document.importNode($('template#' + id)[0].content, true))) };
$.Machine = function (state) {
  let es = {}, v = Object.values, r = Promise.resolve.bind(Promise);
  return Object.assign(this, {
    getState () { return state },
    on (e, fn) { (es[e] = es[e] || {})[fn.name] = fn; return this },
    emit (e, ...args) { return e in es && v(es[e]).reduce((s, fn) => (fn.apply(s, args), s), state) },
    emitAsync (e, ...args) { return e in es && v(es[e]).reduce((p, fn) => p.then(s => r(fn.apply(s, args)).then(() => s)), r(state)) },
    stop (e, fname = '') { e in es && delete es[e][fname]; return this } }) };

function debug (...args) { if (game.getState().debug) console.log.apply(null, args) }
function time (t) { return Math.floor(t / 60) + ":" + ("0" + t % 60).slice(-2) }
function shuffle (ary) { return ary.reduceRight((a, j, i) => ([a[i], a[j]] = [a[j = Math.floor(Math.random() * (i + 1))], a[i]], a), ary) }
function letters () {
  // https://en.oxforddictionaries.com/explore/which-letters-are-used-most
  let letter_weights = { 'E': 5688, 'A': 4331, 'R': 3864, 'I': 3845, 'O': 3651,
        'T': 3543, 'N': 3392, 'S': 2923, 'L': 2798, 'C': 2313, 'U': 1851, 'D': 1725,
        'P': 1614, 'M': 1536, 'H': 1531, 'G': 1259, 'B': 1056, 'F': 924, 'Y': 906,
        'W': 657, 'K': 561, 'V': 513, 'X': 148, 'Z': 139, 'J': 100, 'Q': 100 },
      cuml_weights = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')
        .reduce((acc, l) => acc.concat([acc[0] += letter_weights[l]]), [0]).slice(1, 27);
  return new Array(9).fill(0).map(() => {
    let r = cuml_weights[25] * Math.random();
    return 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[cuml_weights.findIndex(x => x >= r)]
  })
}


// UI logic
$.addEvents({
  '': {
    load: function () {
      game.emit('setworker', game.workerJS).worker.onmessage = e => game.emit('ready', e.data);
      for (var i = 0; i < 11; i++) $.load('cell', '.board');
      $('.board > :nth-last-child(2)')[0].textContent = 'SUBMIT';
      $('.board > :last-child')[0].textContent = 'DEL';
      $.addEvents({
        '.board > :nth-last-child(n+3)': { 'click touchend': function (e) {
          e.preventDefault();
          if ($('.interact.active').length && !$('.input.freeze').length && !this.classList.contains('pressed')) game.emit('type', this)
        } },
        '.board > :nth-last-child(2)': { 'click touchend': function (e) { e.preventDefault(); game.emit('submit') } },
        '.board > :last-child': { 'click touchend': function (e) { e.preventDefault(); game.emit('type') } },
        '.board > *': { 'click touchend': function (e) { e.preventDefault(); navigator.vibrate(10) } }
      })
    },
    keypress: function (e) {
      e.stopPropagation();
      if (!$('.interact.active').length || $('.input.freeze').length) return;
      let key = e.key.toUpperCase();
      if (key == 'ENTER') game.emit('submit');
      else if (key == 'BACKSPACE') game.emit('type');
      else shuffle($('.board > :nth-last-child(n+3):not(.pressed)')).find(x => x.textContent == key && game.emit('type', x))
    }
  },
  '.solo': { 'click touchend': function (e) { e.preventDefault(); game.emit('generate') } },
  '.multi': {'click touchend': function (e) { e.preventDefault(); game.emitAsync('connectmultiplayer') } },
  '.header': { 'click touchend': function (e) { e.preventDefault(); game.emit('leavemultiplayer') } },
  '.username > input': { keypress: function (e) {
    if (e.key == "Enter" && !this.validity.valueMissing && !this.validity.patternMismatch) game.emitAsync('setusername', this.value)
  } },
  '.username > .button': { 'click touchend': function (e) { e.preventDefault(); let input = $('.username > input')[0];
    if (!input.validity.valueMissing && !input.validity.patternMismatch) game.emitAsync('setusername', input.value)
  } },
  '.role .button': { 'click touchend': function (e) { e.preventDefault(); let input = $('.role > input')[0];
    if (!input.validity.valueMissing && !input.validity.patternMismatch) game.emitAsync('setroomname', input.value, this)
  } },
  '.uniques': { 'click touchend': function (e) { e.preventDefault(); game.emitAsync('votegametype', 'uniques') } },
  '.jinx': { 'click touchend': function (e) { e.preventDefault(); game.emitAsync('votegametype', 'jinx') } },
  '.start': { 'click touchend': function (e) { e.preventDefault(); if (!this.dataset.disabled) game.emit('start') } },
  '.lock': { 'click touchend': function (e) { e.preventDefault();
    if (!this.dataset.disabled) game.emitAsync('setroomstate', !this.classList.contains('locked'))
  } },
  '.exit': { 'click touchend': function (e)  { e.preventDefault(); game.emit('unsetgametype') } },
  '.newgame': { 'click touchend': function (e) { e.preventDefault(); game.emit('newgame') } },
});

/* TRY AFTER MULTIPLAYER
const
  $ = ( ... ), // -> Object.keys(window).filter(x => x.match(x) ... EventTarget.prototype.isPrototypeOf(x))
  game1 = new $.Machine({ a: 1, b: $('.sup').textContent });
$.targets({ -> treat based on Machine
  window: { load () {} }, 'game[\d]{1,2}': { setworker () {} }
}); // -> implied '}, window);'
$.queries({ -> treat based on addEvents
  '.generate': { 'click touchend' () {} }
});
$.targets({ open: fn }, ws)

**don't force it to become something that it's not trying to be**
*/

// Game logic
var game = new $.Machine(Object.seal({

      // All games
      worker: null,
      duration: 180,
      score: null,
      letters: null,
      list: null,
      found: null,
      validletters: null,
      wordbuffer: null,

      // All multiplayer
      ws: null,
      ownname: null,
      role: null,
      roomname: null,
      playerlist: null,
      gametype: null,
      voteAnimPipe: Promise.resolve(),
      consensusSpeed: 30,
      emoteset: null,
      gamestate: null,
      waiting: null,

      // Jinx
      roundDuration: 15,
      eliminated: null,
      jinxround: null,

      // Dev
      debug: false

    }))

    // Solo transforms
    // Creates a worker from plain JS and attaches it to game machine.
    .on('setworker', function (text) {
      this.worker = new Worker(URL.createObjectURL(new Blob([text], {type: 'application/javascript'})))
    })

    // Signals worker to send new game data.
    .on('generate', function () {
      let sc = $('.solo')[0].classList;
      if (sc.contains('loading')) return false;
      sc.add('loading');
      this.worker.postMessage(letters())
    })

    // Loads a new game based on game data.
    .on('ready', function (data) {
      if (!data.list.length) return this.worker.postMessage(letters());
      if (this.role == 'host') game.emit('returnletters', data.letters);
      if (this.role) {
        Object.assign(this, data);
        return game.emit('returngameinit', 'ok')
      } else {
        Object.assign(this, data, {
          score: 0,
          found: [],
          validletters: data.letters.slice(),
          wordbuffer: ''
        });
        $('.interact')[0].classList.remove('completed');
        $('.interact')[0].classList.add('ready');
        $('.solo')[0].classList.remove('loading');
        document.body.classList.add('play');
        $('.board > :nth-last-child(n+3)').forEach(x => x.textContent = null);
        $('.input')[0].textContent = '';
        $('.words > *').forEach(x => x.remove());
        $('.numwords')[0].textContent = 'Total words: ' + this.list.length;
      }
      $('.timer')[0].textContent = time(this.duration)
    })

    // Starts a new game.
    .on('start', function () {
      if (this.role == 'host') {
        if ($('.start')[0].classList.contains('loading')) return;
        $('.start')[0].classList.add('loading');
        this.ws.send(JSON.stringify({start: true}));
      } else if (!this.role) {
        $('.board > :nth-last-child(n+3)').forEach((x, i) => x.textContent = this.letters[i]);
        $('.interact')[0].classList.remove('ready');
        $('.interact')[0].classList.add('active');
        var timer = 0, ix = setInterval(() => {
          if (++timer >= this.duration) game.emit('complete', ix);
          $('.timer')[0].textContent = time(this.duration - timer)
        }, 1000)
      }
    })

    // Types a letter.
    .on('type', function (cell) {
      if (!$('.interact')[0].classList.contains('active')) return;
      if (cell) {
        var key = cell.textContent;
        if (!~this.validletters.indexOf(key)) return;
        cell.classList.add('pressed');
        this.validletters.splice(this.validletters.findIndex(x => x == key), 1);
        $('.input')[0].textContent = (this.wordbuffer += key)
      } else {
        var key = this.wordbuffer.slice(-1);
        if (!this.wordbuffer) return;
        shuffle($('.board > :nth-last-child(n+3).pressed')).find(x => x.textContent == key).classList.remove('pressed');
        this.validletters.push(key);
        $('.input')[0].textContent = this.wordbuffer = this.wordbuffer.slice(0, -1)
      }
    })

    // Attempts to submit a word as 'found'.
    .on('submit', function () {
      if ($('.input.freeze').length) return;
      var invalid = $('.interact > .invalid')[0], maybeClear = '';
      if (~this.found.indexOf(this.wordbuffer)) invalid.textContent = 'Already found';
      else if (!~this.list.indexOf(this.wordbuffer)) invalid.textContent = 'Not accepted';
      else game.emit('found', maybeClear = this.wordbuffer);
      this.validletters = this.letters.slice();
      $('.pressed').forEach(x => x.classList.remove('pressed'));
      $('.input')[0].textContent = this.gametype == 'jinx' ? maybeClear : '';
      this.wordbuffer = ''
    })

    // Accepts a found word from player.
    .on('found', function (word) {
      $('.interact > .invalid')[0].textContent = '';
      if (this.gametype == 'jinx') $('.input')[0].classList.add('freeze');
      if (this.gametype) this.ws.send(JSON.stringify({found: word}));
      else {
        var words = $('.words')[0], wscore = [0, 0, 0, 1, 1, 2, 3, 5, 8, 11][word.length];
        this.found.push(this.list.splice(this.list.indexOf(word), 1)[0]);
        this.score += wscore;
        $.load('word', '.words');
        $('.word', words.lastChild)[0].textContent = word;
        $('.score', words.lastChild)[0].textContent = wscore;
        words.scrollLeft = words.scrollWidth - words.offsetWidth
      }
    })

    // Finishes game and displays game info.
    .on('complete', function (ix) {
      clearInterval(ix);
      var interact = $('.interact')[0], words = $('.words')[0], write = function (wd) {
            $.load('word', '.' + [...this.classList].join('.'));
            $('.word', this.lastChild)[0].textContent = wd;
            return $('.score', this.lastChild)[0].textContent = [0, 0, 0, 1, 1, 2, 3, 5, 8, 11][wd.length]
          }, cmp = Intl.Collator ? Intl.Collator().compare : (a, b) => a > b;
      interact.classList.remove('active');
      interact.classList.add('completed');
      $('.interact > .invalid')[0].textContent = '';
      $('.pressed').forEach(x => x.classList.remove('pressed'));
      if (this.gametype == 'uniques') {
        write = write.bind(words);
        $('.words > *').forEach(x => x.remove());
        $.load('divider', '.words');
        words.lastChild.classList.add('repeats');
        this.gamestate.repeats.forEach(write);
        let list = this.gamestate.repeats.slice(), scores = [], temp;
        for (player in this.gamestate.playerwords) {
          $.load('divider', '.words');
          words.lastChild.classList.add('playerwords');
          temp = this.gamestate.playerwords[player].reduce((a, wd) => a + write(wd), 0);
          $('.playerwords').pop().textContent = player + ': ' + temp;
          scores.push([player, temp]);
          list = list.concat(this.gamestate.playerwords[player])
        }
        $.load('divider', '.words');
        this.list.filter(x => !~list.indexOf(x)).forEach(write);
        temp = scores.reduce((a, b) => a[0] && a[0][1] > b[1] ? a : a[0] && a[0][1] == b[1] ? [...a, b] : [b], []).map(x => x[0]);
        if (temp.length == 1) $('.finalscore')[0].textContent = 'Winner: ' + temp[0] + '!';
        if (temp.length > 1) $('.finalscore')[0].textContent = 'Tied: ' + temp.sort(cmp).join(', ');
        $('.numwords')[0].textContent = 'All words found: ' + list.length + ' / ' + (this.list.length + this.found.length)
      }
      else if (this.gametype == 'jinx') {
        $('.input')[0].classList.remove('freeze');
        let winners = Object.entries(this.gamestate).reduce((a, x) => {
          let x1 = { name: x[0], score: x[1][0].score };
          return a[0] && a[0].score > x[1][0].score ? a : a[0] && a[0].score == x[1][0].score ? [...a, x1] : [x1]
        }, []).map(x => x.name);
        $.load('column', '.jinx-words');
        $('.jinx-words > :last-child')[0].classList.add('remaining');
        this.list.forEach(write.bind($('.remaining')[0]));
        if (winners.length == 1)  $('.finalscore')[0].textContent = 'Winner: ' + winners[0] + '!';
        else if (winners.length > 1)  $('.finalscore')[0].textContent = 'Tied: ' + winners.sort(cmp).join(', ');
        $('.numwords')[0].textContent = 'All words found: ' + this.found.length + ' / ' + (this.list.length + this.found.length);
      }
      else if (!this.gametype) {
        $('.finalscore')[0].textContent = 'Score: ' + this.score;
        $('.numwords')[0].textContent = 'Words: ' + this.found.length + ' / ' + (this.list.length + this.found.length);
        $.load('divider', '.words');
        this.list.forEach(write.bind(words))
      }
      if (this.role == 'host') {
        this.waiting = this.playerlist.slice();
        $('.start')[0].dataset.disabled = true;
        $('.playerlist .name').forEach(x => x.dataset.disabled = true)
      }
      Object.assign(this, { letters: null, list: null })
    })


    // Multiplayer transforms
    // Creates multiplayer connection.
    .on('connectmultiplayer', function () {
      if ($('.multi')[0].classList.contains('loading')) return;
      return new Promise(resolve => {
        $('.multi')[0].classList.add('loading');
        $('.room')[0].classList.remove('hide');
        $('.actions > :not(.start)').forEach(x => x.classList.remove('hide'));
        if ('name' in localStorage) $('.username > input')[0].value = localStorage.name;
        var ws = this.ws = new WebSocket('wss://' + location.host);
        ws.onopen = () => {
          this.role = 'guest';
          $('.plurality')[0].classList.remove('active');
          $('.create-user')[0].classList.remove('hide');
          $('.welcome')[0].classList.add('hide');
          $('.desc-create')[0].classList.remove('hide');
          $('.multi')[0].classList.remove('loading');
          $('.username > input')[0].focus();
          this.playerlist = []
        };
        ws.onmessage = e => {
          let data = JSON.parse(e.data), kl = Object.keys(data).length,
              loadPlayers = list => list.forEach(name => {
                $.load('player', '.playerlist');
                $('.playerlist > :last-child > .name')[0].textContent = name;
                $.addEvents({
                  '.emote': {'click touchend': function (e) { e.preventDefault(); game.emit('addemote', this.textContent) }},
                  '.kick': {'click touchend': function (e) { e.preventDefault(); game.emit('kickplayer', this.previousSibling.textContent) }}
                }, $('.playerlist > :last-child')[0])
              })
          if ('status' in data) {
            if ('playerList' in data && Array.prototype.isPrototypeOf(data.playerList)) { // TODO: convert to an event, with loadPlayers
              if (data.status == 'Joined room' && kl == 2) {
                this.playerlist = this.playerlist.concat(data.playerList);
                if (!this.roomname) game.emit('returnroomname', 'ok');
                else $('.playercount')[0].textContent = this.playerlist.length;
                loadPlayers(data.playerList)
              }
              else if (data.status == 'Left room' && kl == 2) {
                this.playerlist = this.playerlist.filter(x => !~data.playerList.indexOf(x));
                if (this.waiting) {
                  this.waiting = this.waiting.filter(x => !~data.playerList.indexOf(x));
                  if (!this.waiting.length) delete $('.start')[0].dataset.disabled
                }
                $('.playercount')[0].textContent = this.playerlist.length;
                $('.playerlist .name').filter(n => ~data.playerList.indexOf(n.textContent))
                  .forEach(n => n.parentNode.remove())
              }
              debug(data.status, data.playerList)
            }
            else if (data.status == 'Starting game' && 'begintime' in data && kl == 2) {
              this.waiting = null;
              game.emit('startmultiplayer', data.begintime)
            }
            else if (data.status == 'Game over') {
              if (this.gametype == 'uniques' && 'repeats' in data && Array.prototype.isPrototypeOf(data.repeats) && 'playerwords' in data &&
                Object.values(data.playerwords).length && Object.values(data.playerwords).every(x => Array.prototype.isPrototypeOf(x)) && kl == 3) {
                delete data.status;
                game.emit('returngameover', data)
              }
              else if (this.gametype == 'jinx' && kl == 1) game.emit('returngameover')
            }
            else if (kl == 1) {
              if (data.status == 'connected') return debug(data.status)
              if (data.status == 'Username registered') game.emit('returnusername', 'ok');
              else if (data.status == 'Created room') game.emit('returnroomname', 'ok');
              else if (data.status == 'Vote acknowledged') game.emit('returnvote', 'ok');
              debug(data.status)
            }
          }
          else if ('update' in data) {
            if (data.update == 'vote') {
              if (['balance', 'delta', 'time', 'uniques', 'jinx'].every(x => x in data) && kl == 6) {
                delete data.update;
                game.emit('realtimevote', data);
              }
              else if ('gametype' in data && kl == 2) {
                this.gametype = data.gametype;
                game.emit('readymultiplayer')
              }
            }
            else if (data.update == 'gamedata' && 'letters' in data && kl == 2) this.worker.postMessage(data.letters);
            else if (data.update == 'Room lock state set' && 'lock' in data && kl == 2) game.emit('returnroomlock', 'ok', data.lock);
            else if (data.update == 'Gametype unset' && kl == 1) game.emit('unsetgametype');
            else if (data.update == 'Player emote' && 'emote' in data && 'player' in data && kl == 3) {
              game.emit('setemote', data.emote, data.player);
              debug('Emote', data.emote, data.player)
            }
            else if (data.update == 'Player ready' && 'name' in data && kl == 2) {
              this.waiting.splice(this.waiting.indexOf(data.name), 1);
              delete $('.playerlist .name').find(x => x.textContent == data.name).dataset.disabled;
              if (!this.waiting.length) delete $('.start')[0].dataset.disabled
            }
            else if (data.update == 'New host' && 'waiting' in data && Array.prototype.isPrototypeOf(data.waiting) && kl == 2) {
              game.emit('becomehost', data.waiting);
              debug('Role changed to host')
            }
          }
          else if ('gameevent' in data) {
            if (data.gameevent == 'word' && kl == 2) {
              if ('unique' in data) game.emit('uniquesfound', data.unique, 'unique');
              else if ('repeat' in data) game.emit('uniquesfound', data.repeat, 'repeat');
              else if ('remove' in data) game.emit('uniquesfound', data.remove, 'remove');
              debug('Game event', data);
            }
            else if (data.gameevent == 'Round over' && 'playerwords' in data && Object.values(data.playerwords).length &&
              Object.values(data.playerwords).every(x => 'found' in x && 'jinx' in x && Object.keys(x).length == 2) && kl == 2) {
              game.emit('jinxround', data.playerwords);
              debug('Jinx round', data.playerwords)
            }
          }
          else if ('gameerror' in data && kl == 1) debug(data.gameerror);
          else if ('error' in data && kl == 1) {
            if (data.error == 'Username taken') game.emit('returnusername', 'taken');
            else if (data.error == 'Room not found') game.emit('returnroomname', 'notfound');
            else if (data.error == 'Roomname taken') game.emit('returnroomname', 'taken');
            else if (data.error == 'Room is full') game.emit('returnroomname', 'full');
            else if (data.error == 'Game is in progress') game.emit('returnroomname', 'inprogress');
            else if (data.error == 'Voting ended') game.emit('returnvote', 'ended');
            else if (data.error == 'Player not found') game.emit('returnkick', 'notfound');
            debug(data.error)
          }
        }
        ws.onclose = ws.onerror = e => {
          debug('disconnected', e.code);
          this.ws = null;
          game.emit('leavemultiplayer')
        };
      })
    })

    // Destroys multiplayer connection.
    .on('leavemultiplayer', function () {
      $('.header')[0].classList.add('loading');
      if (this.ws) this.ws.close();
      else {
        Object.assign(this, {
          score: null, letters: null, list: null, found: null, validletters: null, wordbuffer: null,
          ownname: null, role: null, roomname: null, playerlist: null, gametype: null, gamestate: null
        });
        $('.host')[0].classList.add('hide');
        $('.playercount')[0].textContent = '';
        $('.playercount')[0].classList.add('hide');
        $('.loading').forEach(x => x.classList.remove('loading'));
        $('.plurality')[0].classList.add('active');
        $('.create-user')[0].classList.add('hide');
        $('.username')[0].classList.remove('hide');
        $('.role')[0].classList.add('hide');
        $('.invalid').forEach(x => x.textContent = '');
        $('.gametype')[0].classList.add('hide');
        $('.selected').forEach(x => x.classList.remove('selected'));
        $('.votecount').forEach(x => x.textContent = '');
        $('.consensus')[0].classList.remove('active');
        $('.welcome')[0].classList.remove('hide');
        $('.desc-create')[0].classList.add('hide');
        $('.desc-multi')[0].classList.add('hide');
        document.body.classList.remove('play');
        $('.content')[0].classList.remove('.countdown');
        $('.actions')[0].classList.remove('hide');
        $('.lock')[0].classList.add('hide');
        $('.room')[0].classList.add('hide');
        $('.playerlist > *').forEach(x => x.remove());
        $('.playerlist')[0].classList.remove('host');
        $('.interact')[0].classList.remove('completed', 'active');
        $('.interact')[0].classList.add('ready');
        $('.board > :nth-last-child(n+3)').forEach(x => x.textContent = null);
        $('.lock')[0].classList.remove('locked');
        $('.input')[0].textContent = '';
        $('.numwords')[0].textContent = '';
        $('.words > *').forEach(x => x.remove());
        $('.words')[0].classList.remove('jinx-mode');
        $('[data-disabled]').forEach(x => delete x.dataset.disabled);
        $('.roomname')[0].textContent = ''
      }
    })

    // Sets username for players in the same room to see. (Async)
    .on('setusername', function (username) {
      if ($('.username > .button')[0].classList.contains('loading')) return;
      $('.username > .button')[0].classList.add('loading');
      $('.create-user > .invalid')[0].textContent = '';
      return new Promise(resolve => {
        game.on('returnusername', function (v) {
          if (v == 'ok') {
            localStorage.name = $('.username > input')[0].value;
            $('.create-user > .invalid')[0].textContent = '';
            $('.username')[0].classList.add('hide');
            $('.role')[0].classList.remove('hide');
            $('.role > input')[0].focus();
            this.playerlist.push(this.ownname = username);
            game.emit('setemoteset')
          } else if (v == 'taken') $('.create-user > .invalid')[0].textContent = '*Username taken';
          $('.username > .button')[0].classList.remove('loading');
          resolve(game.stop('returnusername'))
        });
        this.ws.send(JSON.stringify({username}))
      })
    })

    // Room creation and membership. (Async)
    .on('setroomname', function (roomname, el) {
      if ($('.role .loading').length) return;
      el.classList.add('loading');
      this.role = el.firstChild.textContent == 'Host' ? 'host' : 'guest';
      $('.create-user > .invalid')[0].textContent = '';
      return (this.role == 'guest' ? Promise.resolve() : new Promise(resolve => {
        game.on('returnletters', resolve);
        this.worker.postMessage(letters())
      })).then(letters => new Promise(resolve => {
        game.stop('returnletters');
        game.on('returnroomname', function (v) {
          if (v == 'ok') {
            if (this.role == 'host') {
              this.worker.postMessage(letters);
              $('.host')[0].classList.remove('hide');
              $('.playerlist')[0].classList.add('host')
            } else if (this.role == 'guest') {
              $('.actions')[0].classList.add('hide')
            }
            $('.playercount')[0].classList.remove('hide');
            $('.playercount')[0].textContent = this.playerlist.length;
            $('.create-user > .invalid')[0].textContent = '';
            $('.role')[0].classList.add('hide');
            $('.username')[0].classList.remove('hide');
            $('.create-user')[0].classList.add('hide');
            $('.gametype')[0].classList.remove('hide');
            $('.desc-create')[0].classList.add('hide');
            $('.desc-multi')[0].classList.remove('hide');
            $('.roomname')[0].textContent = this.roomname = roomname
          } else if (v == 'notfound') $('.create-user > .invalid')[0].textContent = '*Room not found';
          else if (v == 'taken') $('.create-user > .invalid')[0].textContent = '*Roomname taken';
          else if (v == 'full') $('.create-user > .invalid')[0].textContent = '*Room is full';
          else if (v == 'inprogress') $('.create-user > .invalid')[0].textContent = '*Game is currently in progress';
          el.classList.remove('loading');
          resolve(game.stop('returnroomname'))
        });
        this.ws.send(JSON.stringify({ role: this.role, roomname, ...(letters ? {letters} : {}) }))
      }))
    })

    // Consensus gametype voting. (Async)
    .on('votegametype', function (gametype) {
      let buttonCL = $('.' + gametype)[0].classList;
      buttonCL.add('loading');
      return new Promise(resolve => {
        game.on('returnvote', { [gametype] (v) {
          if (v == 'ok') {
            $('.selected').forEach(x => x.classList.remove('selected'));
            buttonCL.add('selected');
            $('.consensus')[0].classList.add('active');
          }
          buttonCL.remove('loading');
          resolve(game.stop('returnvote', gametype))
        } }[gametype]);
        this.ws.send(JSON.stringify({gametype}))
      })
    })

    // Real time gametype voting consensus status. (Async)
    .on('realtimevote', function (data) {
      let left = $('.consensus > *')[0], raf = () => new Promise(requestAnimationFrame), bal, csp = this.consensusSpeed;
      $('.uniques > .votecount')[0].textContent = data.uniques;
      $('.jinx > .votecount')[0].textContent = data.jinx;
      debug('Real time vote', data)
      return this.voteAnimPipe = this.voteAnimPipe.then(raf).then(() => {
        left.classList.remove('left', 'right');
        left.style.transitionDuration = '';
        left.style.flex = bal = Math.min(1, Math.max(0, data.balance + (Date.now() - data.time) * data.delta / csp / 1e3))
      }).then(raf).then(() => {
        if (data.delta && bal != 0 && bal != 1) {
          left.style.transitionDuration = (data.delta < 0 ? bal * csp / 2 / -data.delta : csp / 2 / data.delta * (1 - bal)) + 's';
          left.classList.add((Math.sign(data.delta) + 1) / 2 ? 'right' : 'left')
        }
      })
    })

    // Enter multiplayer room lobby. (Async)
    .on('readymultiplayer', function () {
      return new Promise(resolve => {
        game.on('returngameinit', function (v) {
          if (v == 'ok') {
            Object.assign(this, { score: 0, found: [], validletters: this.letters.slice(), wordbuffer: '', gamestate: null });
            if (this.role == 'host') $('.actions')[0].classList.remove('hide');
            else if (this.role == 'guest') $('.actions')[0].classList.add('hide');
            $('.selected').forEach(x => x.classList.remove('selected'));
            $('.consensus')[0].classList.remove('active');
            $('.interact')[0].classList.remove('completed');
            $('.interact')[0].classList.add('ready');
            $('.newgame')[0].classList.remove('loading');
            document.body.classList.add('play');
            $('.board > :nth-last-child(n+3)').forEach(x => x.textContent = null);
            $('.input')[0].textContent = '';
            $('.words > *').forEach(x => x.remove());
            $('.numwords')[0].textContent = 'Total words: ' + this.list.length;
            if (this.gametype == 'uniques') {
              $('.timer')[0].textContent = time(this.duration);
            } else if (this.gametype == 'jinx') {
              $('.timer')[0].textContent = time(this.roundDuration);
              $('.words')[0].classList.add('jinx-mode')
            }
            debug('Game data ready')
          }
          resolve(game.stop('returngameinit'))
        });
        if (this.letters) game.emit('returngameinit', 'ok')
      })
    })

    // Room host actions.
    .on('setroomstate', function (lock) {
      if (this.role != 'host') return;
      $('.lock')[0].dataset.disabled = true;
      return new Promise(resolve => {
        game.on('returnroomlock', function (v, lock) {
          if (v == 'ok') $('.lock')[0].classList.toggle('locked');
          delete $('.lock')[0].dataset.disabled;
          resolve(game.stop('returnroomlock'))
        });
        this.ws.send(JSON.stringify({lock}))
      })
    })

    // Initialises emote set.
    .on('setemoteset', function () {
      let { emoteset } = localStorage;
      try { emoteset = JSON.parse(emoteset) }
      catch (e) { localStorage.emoteset = JSON.stringify(emoteset = [
        '😀', '😁', '😂', '😄', '😅', '😆', '😉', '😊', '😎', '😍', '🙂', '🤩',
        '🤔', '🤨', '😐', '😑', '😥', '😮', '😪', '😴', '😛', '😜', '😝', '😔',
        '🙁', '😞', '😤', '😢', '😭', '😨', '🤯', '😱', '😳', '😡', '😠', '😷',
        '🤓', '😈', '🤡', '💀', '👻', '👽', '💩', '😺', '👮', '🕵', '👸', '🎅'
      ]) }
      emoteset = this.emoteset = new Set(emoteset);
      $.load('player', '.playerlist');
      let pNode = $('.playerlist > :last-child')[0];
      $('.emote', pNode)[0].classList.add('hide');
      $('.name', pNode)[0].textContent = this.ownname;
      $('.kick', pNode)[0].remove();
      $.load('emotes', '.playerlist > :last-child');
      pNode.insertBefore($('.emotes')[0], $('.name', pNode)[0])
      $.addEvents({
        '.bubble > .wrapper > input': {
          change: function (e) { if (!this.validity.patternMismatch) this.value = (this.value.match(/^./u) || [''])[0] },
          keyup: function (e) { if (e.key == 'Enter' && !this.validity.patternMismatch) {
            game.emit('addemote', this.value);
            this.value = '';
          } else this.value = (this.value.match(/^./u) || [''])[0] }
        }
      });
      emoteset.forEach(char => {
        $.load('emote', '.playerlist > :last-child .bubble > .wrapper');
        $('.bubble > .wrapper > :last-child')[0].textContent = char
      });
      $('.bubble > .wrapper')[0].appendChild($('.bubble > .wrapper > input')[0]);
      $.addEvents({ '.bubble > .wrapper > .emote': { click: function (e) { e.preventDefault();
        $('.emotes > .emote')[0].classList.add('hide');
        game.emit('setemote', this.textContent)
      } } })
    })

    // Adds a character to the local emote list.
    .on('addemote', function (char) {
      if (typeof char == 'string' && char.match(/^.$/u) && !this.emoteset.has(char)) {
        this.emoteset.add(char);
        Object.assign(localStorage, { emoteset: JSON.stringify([...this.emoteset]) });
        $.load('emote', '.bubble > .wrapper');
        $('.bubble > .wrapper > :last-child')[0].textContent = char;
        $.addEvents({ '.bubble > .wrapper > :last-child': { click: function (e) { e.preventDefault();
          $('.bubble')[0].classList.add('hide');
          $('.emotes > .emote')[0].classList.add('hide');
          game.emit('setemote', this.textContent)
        } } });
        $('.bubble > .wrapper')[0].appendChild($('.bubble > .wrapper > input')[0])
      }
    })

    // Emotes to other players in the room.
    .on('setemote', function (char, player) {
      if (typeof char == 'string' && char.match(/^.$/u)) {
        let n = $('.playerlist .name').find(x => x.textContent == (player || this.ownname));
        if (n) {
          let e = n.parentNode.firstChild;
          e.textContent = char;
          e.classList.add('flash');
          setTimeout(() => e.classList.remove('flash'), 50);
          if (player == undefined) {
            e.classList.remove('hide');
            setTimeout(() => {
              e.classList.add('hide');
              $('.emotes > .emote').forEach(x => x.classList.remove('hide'));
            }, 6000);
            this.ws.send(JSON.stringify({emote: char}))
          }
        }
      }
    })

    // Kicks a player from the room.
    .on('kickplayer', function (player) {
      if (this.role == 'host') {
        let el = $('.playerlist .name').find(x => x.textContent == player);
        el.nextSibling.dataset.disabled = true;
        new Promise(resolve => {
          game.on('returnkick', function () {
            el.parentNode.remove()
            this.playerlist = this.playerlist.filter(x => !~data.playerList.indexOf(player));
            if (this.waiting) {
              this.waiting = this.waiting.filter(x => !~data.playerList.indexOf(player));
              if (!this.waiting.length) delete $('.start')[0].dataset.disabled
            }
            game.stop('returnkick')
          });
          this.ws.send(JSON.stringify({kick: player}))
        })
      }
    })

    // Returns to gametype voting screen
    .on('unsetgametype', function () {
      document.body.classList.remove('play');
      $('.words')[0].classList.remove('jinx-mode');
      $('.votecount').forEach(x => x.textContent = '');
      this.gametype = null;
      this.role == 'host' && this.ws.send(JSON.stringify({gametype: null}))
    })

    // Starts a multiplayer game. (Async)
    .on('startmultiplayer', function (begintime) {
      $('.content')[0].classList.add('countdown');
      $('.start')[0].classList.remove('loading');
      let countdown = begintime - Date.now(), c = Math.ceil(countdown / 1e3), iv;
      return new Promise(resolve => {
        c <= 0 ? resolve() : setTimeout(() => iv = setInterval((function cfn () {
          --c ? ($('.board > :nth-child(5)')[0].textContent = c) : resolve(clearInterval(iv));
          return cfn
        })(), 1e3), countdown % 1e3)
      }).then(() => {
        $('.content')[0].classList.remove('countdown');
        $('.board > :nth-last-child(n+3)').forEach((x, i) => x.textContent = this.letters[i]);
        $('.interact')[0].classList.remove('ready');
        $('.interact')[0].classList.add('active');
        if (this.gametype == 'jinx') {
          this.gamestate = this.playerlist.reduce((a, x) => (a[x] = [{score: 0}], a), {});
          $.load('column', '.words');
          this.playerlist.forEach(name => {
            $.load('word', '.column');
            $('.column > :last-child > .word')[0].textContent = name;
            $('.column > :last-child > .score')[0].textContent = 0
          });
          $.load('jinx-words', '.words')
        }
      }).then(() => new Promise(resolve => {
        let dur, timer = 0, wait = Promise.resolve(), resetTimer = remaining => {
          if (remaining == 0) return;
          if (this.gametype == 'uniques') timer = Math.ceil((Date.now() - begintime) / 1e3);
          else if (this.gametype == 'jinx') {
            if (!this.eliminated) $('.input')[0].classList.remove('freeze');
            if (remaining == 1) timer = 0;
            else {
              let timerExact = (Date.now() - begintime - this.roundDuration * this.jinxround++ * 1e3) / 1e3;
              wait = new Promise(r => setTimeout(r, ((timer = Math.ceil(timerExact)) - timerExact) * 1e3))
            }
          }
          wait = wait.then(() => {
            clearInterval(iv);
            iv = setInterval((function countdown () {
              $('.timer')[0].textContent = time(dur - timer);
              if (timer++ >= dur) clearInterval(iv);
              return countdown
            })(), 1e3);
          });
          return resetTimer
        };
        game.on('returngameover', function (gamestate) {
          if (gamestate) this.gamestate = gamestate;
          this.eliminated = false;
          clearInterval(iv);
          $('.timer')[0].textContent = time(0);
          resolve(game.stop('returngameover').stop('returnjinxroundover').emit('complete'))
        });
        if (this.gametype == 'uniques') {
          resetTimer();
          dur = this.duration
        } else if (this.gametype == 'jinx') {
          this.jinxround = 0;
          game.on('returnjinxroundover', resetTimer());
          dur = this.roundDuration
        }
      }))
    })

    // Uniques word-found event.
    .on('uniquesfound', function (word, event) {
      var wscore = [0, 0, 0, 1, 1, 2, 3, 5, 8, 11][word.length], words = $('.words')[0];
      if (event == 'remove') {
        this.score -= wscore;
        $('.word').find(x => x.textContent == word).parentNode.classList.add('strike')
      } else {
        this.found.push(this.list.splice(this.list.indexOf(word), 1)[0]);
        $.load('word', '.words');
        $('.word', words.lastChild)[0].textContent = word;
        $('.score', words.lastChild)[0].textContent = wscore
        words.scrollLeft = words.scrollWidth - words.offsetWidth
        if (event == 'unique') this.score += wscore;
        else if (event == 'repeat') words.lastChild.classList.add('strike')
      }
    })

    // Get ready for new game. (Async iff multiplayer)
    .on('newgame', function () {
      let nc = $('.newgame')[0].classList;
      if (nc.contains('loading')) return false;
      nc.add('loading');
      if (this.role) {
        this.ws.send(JSON.stringify({ready: true}));
        if (this.role == 'host') {
          return new Promise(resolve => {
            game.on('returnletters', resolve);
            this.worker.postMessage(letters())
          }).then(letters => {
            this.ws.send(JSON.stringify({ letters }))
            return game.stop('returnletters').emitAsync('readymultiplayer');
          })
        } else if (this.role == 'guest') return game.emitAsync('readymultiplayer')
      } else this.worker.postMessage(letters())
    })

    // You are now the room host. (Async iff triggered while waiting for previous host to ready up)
    .on('becomehost', function (waiting) {
      Object.assign(this, { role: 'host', waiting });
      if (waiting.length) $('.start')[0].dataset.disabled = true;
      $('.playerlist .name').forEach(x => ~waiting.indexOf(x.textContent) && (x.dataset.disabled = true));
      $('.host')[0].classList.remove('hide');
      $('.actions')[0].classList.remove('hide');
      $('.playerlist')[0].classList.add('host');
      if ($('.newgame')[0].classList.contains('loading')) return new Promise(resolve => {
        game.on('returnletters', resolve);
        this.worker.postMessage(letters())
      }).then(letters => {
        game.stop('returnletters');
        this.ws.send(JSON.stringify({ letters }))
      })
    })

    // Jinx round over event
    .on('jinxround', function (playerwords) {
      $('.input')[0].textContent = '';
      $.load('column', '.jinx-words');
      let words = [];
      $('.words > .column > *').forEach((p, i) => {
        $.load('word', '.jinx-words > :last-child');
        let playername = $('.word', p)[0].textContent, res = playerwords[playername];
        if (res) {
          if (res.found) {
            if (!~words.indexOf(res.found)) words.push(res.found);
            let cell = $('.jinx-words > :last-child > :last-child')[0],
                wdscore = [0, 0, 0, 1, 1, 2, 3, 5, 8, 11][res.found.length];
            $('.word', cell)[0].textContent = res.found;
            $('.score', cell)[0].textContent = wdscore;
            if (res.jinx) cell.classList.add('strike');
            else {
              this.gamestate[playername][0].score += wdscore;
              if (playername == this.ownname) this.score += wdscore;
              $('.score', p)[0].textContent = wdscore + Number($('.score', p)[0].textContent)
            }
            this.gamestate[playername].push(res);
          } else {
            var death = $('.jinx-words > :last-child > :last-child > .word')[0];
            death.classList.add('emoji');
            death.textContent = '💀';
            if (playername == this.ownname) {
              this.eliminated = true;
              $('.pressed').forEach(x => x.classList.remove('pressed'));
              $('.interact > .invalid')[0].textContent = '';
              $('.input')[0].classList.add('freeze')
            }
          }
        }
      });
      words.forEach(word => this.found.push(this.list.splice(this.list.indexOf(word), 1)[0]));
      game.emit('returnjinxroundover', Object.values(playerwords).filter(x => x.found).length)
    })

// Wordlist generator
game.workerJS = `
  var sowpods, list, letters, wait,
      getWords = letters => {
        list = sowpods.filter(word => {
          if (word.length > 9 || word.length < 3) return false;
          for (var w = word.split(''), i = 0, j; i < letters.length; i++)
            if (~(j = w.indexOf(letters[i])) && (w.splice(j, 1), !w.length)) break;
          return !w.length
        });
        postMessage({letters, list})
      };
  onmessage = e => new Promise(r => wait = {e, r});
  fetch(self.location.origin + '/sowpods.txt')
    .then(res => res.text()).then(text => {
      onmessage = (e, l) =>
        Array.prototype.isPrototypeOf(l = e.data) && l.join('').match(/^[A-Z]{9}$/) && getWords(l);
      sowpods = text.split(/\\r\\n|\\n/);
      if (wait) wait = wait.r(onmessage(wait.e))
    })
`;
