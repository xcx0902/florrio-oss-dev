#pragma once

#include "sim/math.hpp"

#include <array>
#include <chrono>
#include <cstddef>
#include <cstdint>
#include <optional>
#include <string>
#include <variant>
#include <vector>

namespace wave::sim {

using Tick = std::uint64_t;
using Microseconds = std::chrono::microseconds;

struct MatchId {
  std::uint64_t value = 0;
  bool operator==(const MatchId&) const = default;
};

struct PlayerId {
  std::uint64_t value = 0;
  bool operator==(const PlayerId&) const = default;
};

struct LifeId {
  MatchId match;
  PlayerId player;
  std::uint64_t generation = 0;
  bool operator==(const LifeId&) const = default;
};

struct EntityId {
  MatchId match;
  std::uint32_t slot = 0;
  std::uint64_t generation = 0;
  bool operator==(const EntityId&) const = default;
};

enum class Faction {
  team,
  garden
};
enum class Group {
  player,
  petal,
  main_mob,
  segment,
  summon,
  ant_hole,
  residual,
  count
};
enum class Mob {
  bee,
  ladybug,
  baby_ant,
  rock,
  centipede,
  worker_ant,
  dark_ladybug,
  evil_centipede,
  soldier_ant,
  spider,
  hornet,
  beetle,
  cactus,
  queen_ant,
  ant_hole,
  centipede_segment,
  evil_centipede_segment,
  desert_centipede,
  desert_centipede_segment,
  square,
  shiny_ladybug,
  scorpion,
  fire_ant,
  fire_ant_burrow,
  sandstorm,
  bubble,
  acid_bubble,
  shell,
  starfish,
  crab,
  jellyfish,
  digger,
  sponge,
  leech,
  leech_segment
};
enum class Petal {
  basic,
  rose,
  faster,
  leaf,
  stinger,
  peas,
  grapes,
  web,
  missile,
  egg,
  honey,
  cactus,
  none,
  light,
  rock,
  square,
  iris,
  wing,
  bubble,
  pollen,
  dandelion,
  antennae,
  heavy,
  yin_yang,
  salt,
  rice,
  corn,
  sand,
  pincer,
  yucca,
  magnet,
  yggdrasil,
  starfish,
  pearl,
  lightning,
  jelly,
  claw,
  shell,
  cutter,
  dahlia,
  uranium,
  sponge,
  soil,
  fangs,
  third_eye,
  stick
};
enum class Rarity {
  common,
  unusual,
  rare,
  epic,
  legendary,
  mythic
};
enum class LifeState {
  waiting,
  alive,
  ended
};
enum class Phase {
  waiting,
  spawning,
  clearing,
  ended
};
enum class SpawnState {
  pending,
  spawned,
  exhausted,
  cancelled
};
enum class SpawnOutcome {
  spawned,
  blocked,
  exhausted,
  cancelled
};
enum class SpawnFailure {
  occupied,
  attempt_limit,
  deadline
};
enum class TransitionReason {
  threshold,
  deadline,
  team_wipe,
  last_disconnect
};
enum class HealthKind {
  contact,
  heal,
  poison,
  shield,
  radiation,
  reflected,
  deferred
};
enum class DrawPurpose {
  special_roll,
  special_group,
  mob_kind,
  spawn_point
};

struct DamageSource {
  EntityId entity;
  std::optional<LifeId> owner;
  Faction faction = Faction::garden;
  std::optional<EntityId> instigator;
  bool operator==(const DamageSource&) const = default;
};

struct EntityView {
  EntityId id;
  Group group = Group::main_mob;
  Faction faction = Faction::garden;
  std::optional<Mob> mob;
  std::optional<Petal> petal;
  Rarity rarity = Rarity::common;
  std::optional<LifeId> owner;
  std::optional<EntityId> anchor;
  std::uint32_t origin_wave = 0;
  Vec2 position;
  Vec2 velocity;
  double radius = 0;
  double heading_rad = 0;
  double health = 0;
  double max_health = 0;
  Tick cooldown_ticks = 0;
  double shield = 0;
  bool poisoned = false;
  bool slowed = false;
  bool heal_blocked = false;
  std::optional<EntityId> damage_origin;
  bool operator==(const EntityView&) const = default;
};

struct PetalSlotView {
  std::optional<EntityId> entity;
  Tick reload_ticks = 0;
  // entity remains the first orbiting particle for W1/W2 consumers.
  std::vector<EntityId> entities;
  Tick reload_total_ticks = 0;
  bool operator==(const PetalSlotView&) const = default;
};

struct PlayerView {
  PlayerId id;
  LifeId life;
  std::optional<EntityId> body;
  LifeState state = LifeState::waiting;
  bool connected = true;
  std::vector<Petal> loadout;
  std::vector<PetalSlotView> petals;
  std::uint64_t credited_defeats = 0;
  std::vector<Rarity> loadout_rarities;
  double vision_multiplier = 1;
  double pickup_multiplier = 1;
  bool operator==(const PlayerView&) const = default;
};

struct SpawnSlot {
  Tick due_tick = 0;
  std::size_t batch = 0;
  Mob mob = Mob::bee;
  Rarity rarity = Rarity::common;
  std::uint32_t attempts = 0;
  SpawnState state = SpawnState::pending;
  std::optional<Tick> actual_tick;
  std::optional<EntityId> entity;
  bool operator==(const SpawnSlot&) const = default;
};

struct WaveCounts {
  std::size_t planned = 0;
  std::size_t pending = 0;
  std::size_t spawned = 0;
  std::size_t alive = 0;
  std::size_t defeated = 0;
  std::size_t exhausted = 0;
  std::size_t cancelled = 0;
  std::size_t carried = 0;
  std::size_t discarded = 0;
  bool operator==(const WaveCounts&) const = default;
};

struct WaveView {
  std::uint32_t number = 0;
  std::string rules_version;
  Tick start_tick = 0;
  Tick deadline_tick = 0;
  std::optional<Tick> spawn_complete_tick;
  bool special = false;
  std::vector<Mob> eligible;
  std::vector<SpawnSlot> plan;
  WaveCounts counts;
  bool operator==(const WaveView&) const = default;
};

struct MatchView {
  MatchId id;
  std::uint32_t seed = 0;
  Tick next_tick = 0;
  Microseconds step{};
  Microseconds broadcast_interval{};
  double arena_radius = 0;
  Tick petal_reload = 1;
  Phase phase = Phase::waiting;
  WaveView wave;
  std::optional<WaveView> previous_wave;
  std::vector<PlayerView> players;
  std::vector<EntityView> entities;
  std::array<std::size_t, static_cast<std::size_t>(Group::count)> population{};
  std::string catalog_version;
  std::string catalog_sha256;
};

struct Input {
  LifeId life;
  Vec2 move;
  bool attack = false;
  bool defend = false;
  std::optional<double> aim_angle;
  double aim_distance = 13;
};

struct Connection {
  PlayerId player;
  bool connected;
};

struct Equip {
  LifeId life;
  std::vector<Petal> loadout;
  std::vector<Rarity> rarities;
};

struct RandomDraw {
  DrawPurpose purpose;
  std::uint32_t value;
};

struct SpawnEvent {
  std::uint32_t wave;
  std::size_t slot;
  Tick due_tick;
  std::uint32_t attempt;
  SpawnOutcome outcome;
  std::optional<SpawnFailure> failure;
  std::optional<EntityId> entity;
  std::optional<Vec2> position;
};

struct Transition {
  std::uint32_t from;
  std::optional<std::uint32_t> to;
  TransitionReason reason;
};

struct HealthChange {
  EntityId target;
  DamageSource source;
  HealthKind kind;
  double amount;
  double health_after;
};

struct LifeChange {
  LifeId life;
  std::optional<EntityId> body;
  LifeState state;
  std::optional<Vec2> position = std::nullopt;
};

struct Defeat {
  EntityId entity;
  Group group;
  DamageSource source;
  std::optional<PlayerId> credit;
  std::optional<Mob> mob;
  Rarity rarity = Rarity::common;
  Vec2 position;
  std::uint32_t origin_wave = 0;
};

using EventData =
    std::variant<RandomDraw, SpawnEvent, Transition, HealthChange, LifeChange, Defeat>;
struct Event {
  Tick tick;
  EventData data;
};

}  // namespace wave::sim
