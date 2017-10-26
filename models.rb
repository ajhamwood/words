class Player < Sequel::Model
  many_to_many :games
end

class Game < Sequel::Model
  many_to_many :players
end
