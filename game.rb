# Generate game
require 'json'

module Words
  class Game
    def initialize
      @out = nil
      # https://en.oxforddictionaries.com/explore/which-letters-are-used-most
      letter_weights = { 'E' => 5688, 'A' => 4331, 'R' => 3864, 'I' => 3845, 'O' => 3651, 'T' => 3543,
        'N' => 3392, 'S' => 2923, 'L' => 2798, 'C' => 2313, 'U' => 1851, 'D' => 1725,
        'P' => 1614, 'M' => 1536, 'H' => 1531, 'G' => 1259, 'B' => 1056, 'F' => 924,
        'Y' => 906, 'W' => 657, 'K' => 561, 'V' => 513, 'X' => 148, 'Z' => 139, 'J' => 100, 'Q' => 100 }

      cuml_letters = ('A'..'Z').to_a.reduce([0]) do |acc, nxt|
        acc[0] = acc[0] + letter_weights[nxt]
        acc.push(acc[0])
      end.drop(1)

      letters = Array.new(9) do
        r = rand(cuml_letters[25])
        ('A'..'Z').first( cuml_letters.index {|x| x >= r } + 1 ).last
      end

      list = []
      Thread.new do
        File.foreach("data/sowpods.txt") do |word|
          if word.length < 5 then next end
          word.chomp!
          w = word.split('')
          letters.each do |e|
            if i = w.index(e) then
              w.delete_at(i)
              if w.empty? then
                list.push(word)
                break
              end
            end
          end
        end
        @out << JSON.generate({'letters' => letters, 'list' => list})
        @out.close()
      end

    end

    def stream sink
      @out = sink
    end
  end
end
