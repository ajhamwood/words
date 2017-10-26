require 'roda'
require 'sequel'
require 'securerandom'
require_relative 'game'

module Words
  Sequel.extension :migration
  DB = Sequel.sqlite
  Sequel::Migrator.run(DB, 'migrations')
  Sequel::Model.plugin :timestamps
  require_relative 'models'

  @@freshlock = false

  class App < Roda
    plugin :default_headers,
      'Content-Type'=>'text/html',
      #'Content-Security-Policy'=>"default-src 'self' http://localhost:3000",
      #'Strict-Transport-Security'=>'max-age=16070400;',
      'X-Frame-Options'=>'deny',
      'X-Content-Type-Options'=>'nosniff',
      'X-XSS-Protection'=>'1; mode=block'
    #plugin :csrf
    plugin :render
    plugin :assets, css: "app.css", js: "app.js"
    plugin :json

    def self.keepfresh
      if DB[:games].where(fresh: true).count < 2 then
        @@freshlock = true
        GameGenerator.new
      else
        @@freshlock = false
      end
    end
    keepfresh

    route do |r|
      r.assets

      r.root do
        view 'index'
      end

      r.is "play" do
        view 'play'
      end

      r.is 'game' do
        r.get do
          response['Content-Type'] = 'application/json'
          res = {:uuid => SecureRandom.uuid}
          player = DB[:players].insert uuid: res[:uuid]
          game = Game.order { random.function }.first
          if game then
            player.add_game(game)
            game.update(fresh: false)
            App::keepfresh unless @@freshlock
            res = res.merge({:letters => JSON.parse(game.letters), :list => JSON.parse(game.words)})
          end
          JSON.generate(res)
        end

        r.post do
          response['Content-Type'] = 'application/json'
          res = {}
          player = Player.where(uuid: r.params["uuid"]).first
          if !player then
            res = {:uuid => SecureRandom.uuid}
            player = Player.create uuid: res[:uuid]
          end
          game = Game.except(player.games_dataset).order { random.function }.first
          if game then
            game.update(fresh: false)
            game.add_player(player)
            App::keepfresh unless @@freshlock
            res = res.merge({:letters => JSON.parse(game.letters), :list => JSON.parse(game.words)})
          end
          JSON.generate(res)
        end
      end
    end

  end
end
