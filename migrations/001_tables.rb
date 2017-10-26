Sequel.migration do
  change do
    create_table :games do
      primary_key :id
      String :letters, null: false
      String :words, null: false
      Bool :fresh, null: false
    end

    create_table :players do
      primary_key :id
      String :uuid, null: false
    end

    create_table :games_players do
      String :game_id, null: false
      String :player_id, null: false
    end
  end
end
