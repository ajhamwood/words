require 'roda'

module Words
  class App < Roda
    plugin :render
    plugin :assets, css: "app.css", js: "app.js"
    plugin :streaming
    game = nil

    route do |r|
      r.assets

      r.root do
        view "index"
      end

      r.is "play" do
        view "play"
      end

      r.is "game" do
        response['Content-Type'] = 'text/event-stream;charset=UTF-8'
        game = Game.new
        stream(:loop => true) do |out|
          game.stream(out)
        end
      end
    end
  end
end
