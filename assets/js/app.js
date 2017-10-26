// Utils
function $ (sel, node) { return Array.prototype.slice.call( (node || document).querySelectorAll(sel) ) }
$.addEvents = function (obj, node) {
  for (var q in obj) for (var e in obj[q])
    for (var ns = q ? $(q, node) : [window, document], es = e.split(' '), i = 0; i < es.length; i++)
      typeof ns === 'undefined' || ns.forEach(n => n.addEventListener(es[i], obj[q][e].bind(n)))
};
$.load = function (id, node) { (node || document.body).appendChild(document.importNode($("#" + id)[0].content, true)) };

// Game logic
var letters, list, found = [], score = 0, duration = 180;
$.addEvents({
  "": {
    load: function () {
      $("#board").forEach(() => {
        ({letters, list} = JSON.parse(sessionStorage.game));
        let board = $("#board")[0], i;
        for (i = 0; i < 9; i++) $.load("cell", board);
        $("#numwords")[0].innerText = "Total words: " + list.length;
        $("#timer")[0].innerText = new Date(duration * 1000).toUTCString().match(/\d\d:\d(\d:\d\d)/)[1]
      })
    },
    unload: function () { $("#generate").forEach(g => g.classList.remove("loading")) }
  },
  "#generate": {
    click: function () {
      if (this.classList.contains("loading")) return false;
      this.classList.add("loading");
      var opts;
      if ("uuid" in localStorage) {
        let data = new FormData();
        data.append("uuid", localStorage.uuid);
        opts = {method: "POST", body: data}
      }
      fetch("/game", opts)
        .then(res => res.json())
        .then(obj => {
          if ("uuid" in obj) {
            localStorage.uuid = obj.uuid;
            delete obj.uuid
          }
          if (Object.keys(obj).length) {
            sessionStorage.game = JSON.stringify(obj);
            window.location = "play"
          } else setTimeout(() => {
            this.classList.remove("loading");
            this.dispatchEvent(new Event("click"))
          }, 3000)
        })
    }
  },
  "#start": {
    click: function () {
      var interact = $("#interact")[0], cells = $("#board > *"), i;
      for (i = 0; i < 9; i++) cells[i].innerText = letters[i];
      interact.classList.add("active");
      var seconds = 0, ix = setInterval(() => {
        if (++seconds == duration) {
          clearInterval(ix);
          interact.classList.remove("active");
          interact.classList.add("completed");
          $("#score")[0].innerText = "Score: " + score;
          $("#numwords")[0].innerText = "Words: " + found.length + " / " + list.length
        }
        $("#timer")[0].innerText = new Date((duration - seconds) * 1000).toUTCString().match(/\d\d:\d(\d:\d\d)/)[1]
      }, 1000);
      $("input")[0].focus()
    }
  },
  "input": {
    keypress: function (e) {
      var ix, wd = this.value.toUpperCase();
      if (e.key == "Enter") {
        var invalid = $("#invalid")[0];
        if ((ix = list.indexOf(wd)) != -1) {
          if (found.indexOf(wd) == -1) {
            var words = $("#words")[0], wscore = [0, 0, 0, 1, 1, 2, 3, 5, 8, 11][wd.length];
            found.push(wd);
            score += wscore;
            $.load("word", words);
            $(".word", words.lastChild)[0].innerText = wd;
            $(".score", words.lastChild)[0].innerText = wscore;
            invalid.innerText = "";
            words.scrollLeft = words.scrollWidth - words.offsetWidth
          } else {
            invalid.innerText = "Already found"
          }
        } else {
          invalid.innerText = "Not accepted"
        }
        this.value = ""
      }
    }
  }
})
