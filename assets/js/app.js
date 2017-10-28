// Utils
function $ (sel, node) { return Array.prototype.slice.call( (node || document).querySelectorAll(sel) ) }
$.addEvents = function (obj, node) {
  for (var q in obj) for (var e in obj[q])
    for (var ns = q ? $(q, node) : [window, document], es = e.split(' '), i = 0; i < es.length; i++)
      typeof ns === 'undefined' || ns.forEach(n => n.addEventListener(es[i], obj[q][e].bind(n))) };
$.load = function (id, node) { (node || document.body).appendChild(document.importNode($("#" + id)[0].content, true)) };

// Game logic
var letters, list, found = [], left, score = 0, duration = 180;
function time (t) { return Math.floor(t / 60) + ":" + ("0" + t % 60).slice(-2) }
$.addEvents({
  "": {
    load: function () {
      $("#board").forEach(() => {

        // Page state: before game
        ({letters, list} = JSON.parse(sessionStorage.game));
        left = list.slice();
        let board = $("#board")[0], i;
        for (i = 0; i < 9; i++) $.load("cell", board);
        $("#numwords")[0].innerText = "Total words: " + list.length;
        $("#timer")[0].innerText = time(duration)

      })
    },
    unload: function () { $("#generate").forEach(g => g.classList.remove("loading")) }
  },
  "#generate": {
    click: function () {

      // Page state: retrieve game
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

      // Page state: begin game
      var interact = $("#interact")[0], cells = $("#board > *"), i;
      for (i = 0; i < 9; i++) cells[i].innerText = letters[i];
      interact.classList.add("active");
      var seconds = 0, ix = setInterval(() => {
        if (++seconds >= duration) {

          // Page state: complete game
          clearInterval(ix);
          interact.classList.remove("active");
          interact.classList.add("completed");
          $("#score")[0].innerText = "Score: " + score;
          $("#numwords")[0].innerText = "Words: " + found.length + " / " + list.length;
          let words = $("#words")[0];
          $.load("divider", words);
          left.forEach(wd => {
            $.load("word", words);
            $(".word", words.lastChild)[0].innerText = wd;
            $(".score", words.lastChild)[0].innerText = [0, 0, 0, 1, 1, 2, 3, 5, 8, 11][wd.length];
          })

        }
        $("#timer")[0].innerText = time(duration - seconds)
      }, 1000);
      $("input")[0].focus()

    }
  },
  "input": {
    keypress: function (e) {
      var wd = this.value.toUpperCase();
      if (e.key == "Enter") {
        var invalid = $("#invalid")[0];
        if (list.indexOf(wd) == -1) invalid.innerText = "Not accepted";
        else if (found.indexOf(wd) > -1) invalid.innerText = "Already found";
        else {

          // Page state: found word
          var words = $("#words")[0], wscore = [0, 0, 0, 1, 1, 2, 3, 5, 8, 11][wd.length];
          found = found.concat(left.splice(left.indexOf(wd), 1));
          score += wscore;
          $.load("word", words);
          $(".word", words.lastChild)[0].innerText = wd;
          $(".score", words.lastChild)[0].innerText = wscore;
          invalid.innerText = "";
          words.scrollLeft = words.scrollWidth - words.offsetWidth

        }
        this.value = ""
      }
    }
  }
})
