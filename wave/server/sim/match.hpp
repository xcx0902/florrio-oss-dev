#pragma once

#include "sim/entity_pool.hpp"

#include <random>
#include <span>

namespace wave::sim {

class Match {
 public:
  Match(MatchId id, std::uint32_t seed, Rules rules);
  Match(const Match&) = delete;
  Match& operator=(const Match&) = delete;

  // Admission before tick zero. Connections and life-scoped inputs apply on the next step.
  bool add_player(PlayerId id, Vec2 start = {}, std::vector<Petal> loadout = {Petal::basic},
                  std::vector<Rarity> rarities = {});
  bool equip(PlayerId id, std::vector<Petal> loadout, std::vector<Rarity> rarities = {});
  bool equip(PlayerId id, std::size_t slot, Petal kind, Rarity rarity = Rarity::common);
  bool set_loadout(PlayerId id, std::vector<Petal> loadout, std::vector<Rarity> rarities = {}) {
    return equip(id, std::move(loadout), std::move(rarities));
  }
  bool queue(Input input);
  bool queue(Connection connection);
  bool queue(Equip equip);
  bool step();

  [[nodiscard]] MatchView view() const;
  [[nodiscard]] std::span<const Event> events() const { return events_; }

 private:
  friend struct FixtureAccess;

  struct Player {
    PlayerView view;
    Vec2 spawn;
    Vec2 move;
    bool attack = false;
    bool defend = false;
    std::vector<Tick> petal_ready;
    double orbit_phase = 0;
    Tick orbit_updated = std::numeric_limits<Tick>::max();
  };

  struct Impact {
    EntityId target;
    DamageSource source;
    HealthKind kind = HealthKind::contact;
    double amount = 0;
    double poison_per_tick = 0;
    Tick poison_ticks = 0;
    double slow_multiplier = 1;
    Tick slow_ticks = 0;
    bool consume_source = false;
  };

  using Command = std::variant<Input, Connection, Equip>;

  [[nodiscard]] Player* player(PlayerId id);
  [[nodiscard]] EntityId add_entity(EntityView view, BodyRules body);
  void reap_player(Player& player, LifeState state);
  void spawn_player(Player& player);
  void refresh_petals();
  [[nodiscard]] bool valid_loadout(const std::vector<Petal>& loadout,
                                   const std::vector<Rarity>& rarities) const;
  void replace_loadout(Player& player, std::vector<Petal> loadout, std::vector<Rarity> rarities);
  [[nodiscard]] BodyRules petal_body(Petal kind, Rarity rarity) const;
  [[nodiscard]] Tick reload_ticks(Petal kind, Rarity rarity) const;
  void detach_petal(EntityId id);
  void consume_petal(EntityId id);
  void update_effects();
  void finish_projectiles();
  void apply_commands();
  void move_entities();
  void update_orbits();
  void resolve_contacts();
  void apply_impacts();
  void reap_deaths();

  [[nodiscard]] std::uint32_t draw(DrawPurpose purpose);
  [[nodiscard]] std::size_t choose(std::size_t size, DrawPurpose purpose);
  void open_wave(std::size_t index, Tick start);
  void spawn_due();
  [[nodiscard]] std::optional<Vec2> spawn_point(double radius);
  void settle_wave(bool advancing);
  void adjudicate();
  void transition(TransitionReason reason, bool advancing);

  void emit(EventData data) { events_.push_back({tick_, std::move(data)}); }

  MatchId id_;
  std::uint32_t seed_;
  const Rules rules_;
  detail::EntityPool entities_;
  std::mt19937 rng_;
  Tick tick_ = 0;
  Phase phase_ = Phase::waiting;
  std::vector<Player> players_;
  std::vector<Command> commands_;
  std::vector<Impact> impacts_;
  std::vector<Event> events_;
  std::size_t wave_index_ = 0;
  WaveView wave_;
  std::optional<WaveView> previous_wave_;
  std::optional<TransitionReason> arrival_;
};

}  // namespace wave::sim
