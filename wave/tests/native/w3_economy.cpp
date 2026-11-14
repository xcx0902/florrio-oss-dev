#include "app/economy_queue.hpp"
#include "app/room_manager.hpp"
#include "catalog/catalog.hpp"

#include <algorithm>
#include <atomic>
#include <chrono>
#include <filesystem>
#include <future>
#include <iostream>
#include <stdexcept>
#include <set>

namespace wave::sim {
struct FixtureAccess {
  static EntityId spawn(Match& match, Group group, Mob mob, Vec2 position) {
    EntityView entity;
    entity.group = group;
    entity.mob = mob;
    entity.position = position;
    entity.origin_wave = match.wave_.number;
    return match.add_entity(entity, {.radius = 1, .health = 10});
  }
  static void kill(Match& match, EntityId id, LifeId owner) {
    auto& entity = *match.entities_.get(id);
    entity.view.health = 0;
    entity.fatal_hit = DamageSource{{}, owner, Faction::team};
  }
  static void position(Match& match, EntityId id, Vec2 position) {
    match.entities_.get(id)->view.position = position;
  }
};
}  // namespace wave::sim

namespace {
using namespace wave;
void check(bool value, const char* message) {
  if (!value) {
    throw std::runtime_error(message);
  }
}
struct Database {
  std::filesystem::path path =
      std::filesystem::temp_directory_path() /
      ("wave-w3-economy-" +
       std::to_string(std::chrono::steady_clock::now().time_since_epoch().count()) + ".sqlite");
  ~Database() {
    std::error_code error;
    for (const auto& suffix : {"", "-wal", "-shm"}) {
      std::filesystem::remove(path.string() + suffix, error);
    }
  }
};
sim::Rules rules() {
  auto result = sim::scenario_rules(sim::Biome::garden);
  result.catalog = nullptr;  // Deterministic combat fixture; economics uses the dated catalog.
  result.progressive_waves = false;
  result.residual = sim::ResidualPolicy::discard;
  result.arena_radius = 500;
  result.player = {.radius = 2, .health = 1000};
  result.petals[0] = {.radius = 1, .health = 100};
  result.petals[1] = {.radius = 1, .health = 100};
  result.orbit_rad_per_second = 0;
  result.contact_knockback_speed = 0;
  result.special_chance = 0;
  result.mobs = {{sim::Mob::ladybug, {.radius = 1, .health = 100}},
                 {sim::Mob::rock, {.radius = 1, .health = 100}}};
  result.waves = {{1, {sim::Mob::ladybug}, sim::Rarity::common, 1, {{0, 1}}, 100},
                  {2, {sim::Mob::rock}, sim::Rarity::common, 1, {{0, 1}}, 16}};
  result.spawn_points = {{400, 0}};
  result.remaining_threshold = 0;
  result.advance_on_deadline = true;
  return result;
}
sim::PlayerView player(const app::RoomManager& rooms, const app::Member& member) {
  const auto view = rooms.room(member)->match->view();
  return *std::ranges::find(view.players, member.id, &sim::PlayerView::id);
}
store::Count count(const store::Profile& profile, store::Item item) {
  const auto found = profile.inventory.find(item);
  return found == profile.inventory.end() ? 0 : found->second;
}
void squad_opening_wave() {
  store::Options options;
  options.allow_test_seed = true;
  const auto db = std::make_shared<store::Store>(":memory:", options);
  const auto first = db->create_guest();
  const auto second = db->create_guest();
  for (const auto& [profile, waves] :
       {std::pair{first, std::array{99u, 44u, 70u}}, std::pair{second, std::array{9u, 80u, 17u}}}) {
    store::TestSeed seed;
    seed.inventory = profile.inventory;
    seed.slots = profile.slots;
    seed.highest_waves = waves;
    (void)db->seed_for_testing(profile.guest_token, seed);
  }
  app::RoomManager rooms(std::nullopt, 20221030, {}, db);
  auto& a = rooms.admit(first.guest_token, 1, sim::Biome::ocean);
  auto& b = rooms.admit(second.guest_token, 2, sim::Biome::ocean);
  check(rooms.command(a, wire::CreateSquad{true}, {}) &&
            rooms.command(b, wire::JoinSquad{a.room}, {}) &&
            rooms.command(a, wire::Ready{true}, {}) && rooms.command(b, wire::Ready{true}, {}),
        "two Ocean squad members ready");
  rooms.step();
  const auto view = rooms.room(a)->match->view();
  check(view.biome == sim::Biome::ocean && view.wave.number == 11,
        "opening wave is floor(two thirds of the lowest Ocean record)");
}

void queue_bound() {
  app::EconomyQueue queue(2);
  std::promise<void> started, release;
  auto gate = release.get_future().share();
  std::size_t completed = 0;
  const auto thread = std::this_thread::get_id();
  const auto finish = [&](std::exception_ptr error) {
    check(!error, "worker succeeds");
    check(std::this_thread::get_id() == thread, "completion belongs to polling executor");
    ++completed;
  };
  check(queue.submit(
            [&] {
              started.set_value();
              gate.wait();
            },
            finish),
        "first bounded job accepted");
  started.get_future().wait();
  check(queue.submit([] {}, finish), "second bounded job accepted");
  check(!queue.submit([] {}, finish) && queue.pending() == 2,
        "running job counts against hard queue bound");
  release.set_value();
  const auto deadline = std::chrono::steady_clock::now() + std::chrono::seconds(2);
  while (queue.pending() && std::chrono::steady_clock::now() < deadline) {
    queue.wait(std::chrono::milliseconds(10));
    queue.poll();
  }
  check(completed == 2 && queue.pending() == 0, "bounded queue drains on executor");
}

void commands() {
  Database file;
  struct Gate {
    std::atomic<bool> enabled = false;
    std::atomic<bool> stopped = false;
    std::promise<void> reached, release;
    std::shared_future<void> ready = release.get_future().share();
  };
  auto gate = std::make_shared<Gate>();
  store::Options options;
  options.allow_test_seed = true;
  options.random_word = [] { return 0; };
  options.fault = [gate](store::FaultPoint point) {
    if (point == store::FaultPoint::before_commit && gate->enabled &&
        !gate->stopped.exchange(true)) {
      gate->reached.set_value();
      gate->ready.wait();
    }
  };
  auto db = std::make_shared<store::Store>(file.path.string(), options);
  const auto guest = db->create_guest();
  const store::Item rose{*catalog::client_petal(sim::Petal::rose), 0};
  store::TestSeed seed;
  seed.inventory = guest.inventory;
  seed.inventory[rose] = 11;
  seed.slots = guest.slots;
  seed.slots[0] = rose;
  seed.slots[8] = rose;
  const auto seeded = db->seed_for_testing(guest.guest_token, seed);
  app::RoomManager rooms(rules(), 7, {}, db);
  auto& member = rooms.admit(guest.guest_token, 1);
  gate->enabled = true;
  check(rooms.command(member, wire::Craft{false, 2, rose.kind, 0}, {}, "1:1"), "craft queued");
  const bool waiting =
      gate->reached.get_future().wait_for(std::chrono::seconds(2)) == std::future_status::ready;
  if (!waiting) {
    gate->release.set_value();
  }
  check(waiting, "craft reaches transaction barrier on worker");
  wire::Equip equipment;
  const auto n = store::unlocked_main_slots(seeded.level);
  for (std::size_t i = 0; i < n; ++i) {
    for (const auto [client, stored] : {std::pair{i, i}, std::pair{n + i, 8 + i}}) {
      if (seeded.slots[stored]) {
        equipment.slots[client] = {seeded.slots[stored]->kind, seeded.slots[stored]->rarity};
      }
    }
  }
  check(rooms.command(member, equipment, {}, "1:2"), "equipment queued behind blocked craft");
  for (std::size_t i = 2; i < app::RoomManager::storage_capacity; ++i) {
    check(rooms.request_profile(
              "", [](auto) {}, false),
          "profile read fits remaining queue capacity");
  }
  check(rooms.storage_pending() == app::RoomManager::storage_capacity &&
            !rooms.request_profile(
                "", [](auto) {}, false),
        "The room manager rejects job65 while job1 is blocked in SQLite");
  check(rooms.command(member, wire::Ready{true}, {}), "Ready accepted behind blocked craft");
  rooms.step();
  const bool hidden =
      member.profile == seeded && member.craft_results.empty() && !rooms.room(member);
  gate->release.set_value();
  check(hidden, "no inventory, result or Ready admission published before COMMIT");
  check(rooms.wait_storage(), "ordered craft/equip/Ready pipeline drains");
  check(member.craft_results.size() == 1 &&
            member.craft_results.back().second.code == store::Code::ok &&
            member.craft_results.back().second.craft.successes == 1 &&
            count(*member.profile, rose) == 6,
        "wire keep subtracts two equipped copies and emits one committed craft result");
  check(rooms.room(member) && rooms.room(member)->match && member.profile->slots[8] == rose,
        "compact original reserve index adapts to stable Store slot8 before Ready");
  rooms.step();
  const auto life = player(rooms, member).life;
  auto stale = life;
  ++stale.generation;
  check(!rooms.command(member, equipment, stale, "1:3"), "stale-life economic command rejected");
  const auto version = member.profile->version;
  check(rooms.command(member, equipment, {}, "reconnect:startup") && rooms.storage_pending() == 0 &&
            member.profile->version == version && player(rooms, member).life == life,
        "startup equipment cache can synchronize an active life before its first ACK");
  auto changed_cache = equipment;
  changed_cache.slots[0] = {1, 0};
  check(!rooms.command(member, changed_cache, {}, "reconnect:changed") &&
            !rooms.command(member, wire::Craft{false, 2, rose.kind, 0}, {}, "reconnect:craft"),
        "pre-ACK synchronization cannot change equipment or craft");
  check(rooms.command(member, wire::Craft{false, 2, rose.kind, 0}, life, "1:1") &&
            rooms.wait_storage(),
        "same reliable key can replay after later equipment commit");
  check(member.profile->version == version && count(*member.profile, rose) == 6 &&
            member.craft_results.back().second.replayed,
        "replay neither consumes twice nor regresses newer committed profile");
  const auto basic = std::pair<std::uint32_t, std::uint8_t>{1, 0};
  const auto rose_wire = std::pair{rose.kind, std::uint8_t{0}};
  const wire::Swap swap{1, static_cast<std::uint8_t>(n), basic, rose_wire};
  const auto inventory = member.profile->inventory;
  check(rooms.command(member, swap, life, "1:swap") && rooms.wait_storage(),
        "original pre-swap pair queued");
  check(member.profile->slots[1] == rose && member.profile->slots[8] == store::Item{1, 0} &&
            member.profile->inventory == inventory,
        "old values validated then exchanged without changing inventory totals");
  const auto swapped_version = member.profile->version;
  check(rooms.command(member, swap, life, "1:swap") && rooms.wait_storage() &&
            member.profile->version == swapped_version && member.profile->slots[1] == rose,
        "same swap request key replays instead of swapping back");
  check(rooms.command(member, swap, life, "1:stale-swap") && rooms.wait_storage() &&
            member.profile->version == swapped_version && member.profile->slots[1] == rose,
        "new request with stale old slot values cannot overwrite authoritative equipment");
  auto invalid = equipment;
  invalid.slots[0] = {46, 0};
  check(!rooms.command(member, invalid, life, "1:4"),
        "unknown petal identity rejected before Store mutation");
}

void command_faults() {
  for (const auto point : {store::FaultPoint::after_inventory, store::FaultPoint::before_commit,
                           store::FaultPoint::after_commit}) {
    std::atomic<bool> armed = false;
    store::Options options;
    options.allow_test_seed = true;
    options.random_word = [] { return 0; };
    options.fault = [&](store::FaultPoint reached) {
      if (reached == point && armed.exchange(false)) {
        throw std::runtime_error("W3 injected transaction interruption");
      }
    };
    auto db = std::make_shared<store::Store>(":memory:", options);
    const auto guest = db->create_guest();
    store::TestSeed seed;
    seed.inventory = guest.inventory;
    seed.slots = guest.slots;
    const store::Item rose{*catalog::client_petal(sim::Petal::rose), 0};
    seed.inventory[rose] = 15;
    const auto profile = db->seed_for_testing(guest.guest_token, seed);
    app::RoomManager rooms(rules(), 7, {}, db);
    auto& member = rooms.admit(guest.guest_token, 1);
    armed = true;
    check(rooms.command(member, wire::Craft{false, 0, rose.kind, 0}, {}, "fault:1") &&
              rooms.command(member, wire::Craft{false, 0, rose.kind, 0}, {}, "fault:2") &&
              rooms.wait_storage(),
          "queue retries same immutable command after interrupted transaction");
    check(
        member.craft_results.size() == 2 &&
            member.craft_results.front().second.code == store::Code::ok &&
            member.craft_results.back().second.code == store::Code::ok &&
            count(*member.profile, rose) == 5 && member.profile->version == profile.version + 2,
        "interrupted transaction retries before next mutation without duplicate consumption or avoidable conflict");
    check(member.craft_results.front().second.replayed ==
              (point == store::FaultPoint::after_commit),
          "lost committed acknowledgement retries durable result instead of RNG");
    check(rooms.storage_error().find("W3 injected") != std::string::npos,
          "last storage exception remains observable for host diagnostics");
  }
}
void economy() {
  Database file;
  std::string a_token, b_token, match_key;
  store::Profile a_saved, b_saved;
  {
    std::atomic<unsigned> reward_commits = 0;
    std::atomic<bool> fail_second_reward = false;
    store::Options options;
    options.allow_test_seed = true;
    options.fault = [&](store::FaultPoint point) {
      if (point == store::FaultPoint::before_commit && fail_second_reward &&
          ++reward_commits == 2) {
        fail_second_reward = false;
        throw std::runtime_error("W3 interruption between kill and completed-wave transactions");
      }
    };
    auto db = std::make_shared<store::Store>(file.path.string(), options);
    auto a_profile = db->create_guest(), b_profile = db->create_guest();
    store::TestSeed seed;
    seed.inventory = a_profile.inventory;
    seed.slots = a_profile.slots;
    seed.xp = catalog::xp_thresholds()[1] - 1;
    a_profile = db->seed_for_testing(a_profile.guest_token, seed);
    b_profile = db->seed_for_testing(b_profile.guest_token, seed);
    a_token = a_profile.guest_token;
    b_token = b_profile.guest_token;
    app::RoomManager rooms(rules(), 7, {}, db);  // First MT word is below the adopted Rose chance.
    bool callback = false;
    check(
        rooms.request_profile(
            a_token, [&](auto profile) { callback = profile && profile->guest_token == a_token; }),
        "async profile read accepted");
    check(!callback, "cache callback does not run before poll");
    check(rooms.wait_storage() && callback, "cache callback runs from poll");
    auto& a = rooms.admit(a_token, 1);
    auto& b = rooms.admit(b_token, 2);
    check(a.id.value == std::uint64_t(a_profile.guest_id),
          "persistent guest id used by the room manager");
    check(rooms.command(a, wire::CreateSquad{true}, {}) &&
              rooms.command(b, wire::JoinSquad{a.room}, {}) &&
              rooms.command(a, wire::Ready{true}, {}) && rooms.command(b, wire::Ready{true}, {}),
          "two persistent guests start shared match");
    rooms.step();
    auto& match = *rooms.room(a)->match;
    match_key = rooms.room(a)->economy_id;
    auto owner = player(rooms, a).life;
    check(a.profile->highest_wave == 0, "entering wave does not set highest completed wave");
    for (const auto group :
         {sim::Group::segment, sim::Group::segment, sim::Group::ant_hole, sim::Group::summon}) {
      const auto id = sim::FixtureAccess::spawn(match, group, sim::Mob::centipede, {200, 0});
      sim::FixtureAccess::kill(match, id, owner);
    }
    rooms.step();
    check(rooms.wait_storage() && a.profile->xp == seed.xp && b.profile->xp == seed.xp,
          "segments, ant holes and summons do not duplicate root XP or drops");
    auto view = match.view();
    const auto root =
        *std::ranges::find(view.entities, sim::Group::main_mob, &sim::EntityView::group);
    sim::FixtureAccess::position(match, root.id, {200, 0});
    sim::FixtureAccess::kill(match, root.id, owner);
    fail_second_reward = true;
    rooms.step();
    check(rooms.wait_storage(), "kill and completed wave commit");
    const auto* definition = catalog::dated().mob(sim::Mob::ladybug, sim::Rarity::common);
    check(a.profile->xp == seed.xp + definition->xp && b.profile->xp == a.profile->xp,
          "connected living teammates each receive one full shared kill XP");
    check(a.profile->level == 2 && b.profile->level == 2,
          "shared authoritative kill crosses catalog level boundary");
    check(a.profile->highest_wave == 1 && b.profile->highest_wave == 1,
          "completed wave persisted independently of XP");
    check(a.profile->version == a_profile.version + 2 &&
              b.profile->version == b_profile.version + 2 &&
              rooms.storage_error().find("between kill") != std::string::npos,
          "partial tick retry replays shared kill once and commits separate wave once");
    const store::Item discovery{definition->client_id, 0};
    check(a.profile->discoveries.contains(discovery) && b.profile->discoveries.contains(discovery),
          "mob gallery discovery shared with eligible teammates");
    const auto& drops = rooms.room(a)->drops;
    check(drops.size() == 2 && drops[0].item == store::Item{5, 0} &&
              drops[1].item == store::Item{2, 1} && drops[0].position != drops[1].position,
          "the Common Rose and Unusual Light from one defeat occupy distinct ground positions");
    check(rooms.room(a)->pickups.empty(), "ground drops are not yet pickup animations");
    const auto item = drops.front().item;
    const auto second_item = drops.back().item;
    check(count(*a.profile, item) == 0 && count(*b.profile, item) == 0,
          "out of pickup range never grants inventory");
    sim::FixtureAccess::position(match, *player(rooms, a).body, {190, 0});
    sim::FixtureAccess::position(match, *player(rooms, b).body, {200, 0});
    const auto pickup_tick = drops.front().available_tick;
    while (match.view().phase != sim::Phase::ended && match.view().next_tick <= pickup_tick) {
      rooms.step();
    }
    check(rooms.wait_storage(), "pickup claim commits");
    check(count(*a.profile, item) == 0 && count(*b.profile, item) == 1 &&
              count(*a.profile, second_item) == 0 && count(*b.profile, second_item) == 1 &&
              rooms.room(a)->drops.empty(),
          "two claimants award the nearer one exactly one item");
    const auto& pickups = rooms.room(a)->pickups;
    check(pickups.size() == 2 && pickups[0].drop.item == item &&
              pickups[1].drop.item == second_item &&
              std::ranges::all_of(pickups,
                                  [&](const app::Room::Pickup& pickup) {
                                    return pickup.target == player(rooms, b).body &&
                                           pickup.destination == sim::Vec2{200, 0};
                                  }),
          "committed drops animate toward the same recipient who received the items");
    for (unsigned i = 0; i < 8; ++i) {
      rooms.step();
    }
    check(rooms.wait_storage() && a.profile->highest_wave == 1 && b.profile->highest_wave == 1,
          "deadline and repeated ticks do not credit an uncompleted wave or duplicate rewards");
    check(count(*b.profile, item) == 1 && a.profile->xp == seed.xp + definition->xp,
          "drop and root rewards remain single after repeated polling");
    a_saved = *a.profile;
    b_saved = *b.profile;
  }
  {
    auto recovered = std::make_shared<store::Store>(file.path.string());
    app::RoomManager restarted(rules(), 7, {}, recovered);
    auto& a = restarted.admit(a_token, 10);
    auto& b = restarted.admit(b_token, 11);
    check(a.profile == a_saved && b.profile == b_saved,
          "new store and room manager recover complete committed profiles");
    check(restarted.command(a, wire::Ready{true}, {}), "recovered guest starts new match");
    check(restarted.room(a)->economy_id != match_key,
          "restart cannot reuse durable reward match key");
  }
}

void complete_drops_and_magnet() {
  for (unsigned tier = 0; tier < 6; ++tier) {
    for (const bool magnet : {false, true}) {
      auto db = std::make_shared<store::Store>(":memory:", store::Options{.allow_test_seed = true});
      auto guest = db->create_guest();
      if (magnet) {
        store::TestSeed seed;
        seed.inventory = guest.inventory;
        seed.inventory[{29, 0}] = 1;
        seed.slots = guest.slots;
        seed.slots[0] = store::Item{29, 0};
        guest = db->seed_for_testing(guest.guest_token, seed);
      }
      auto r = rules();
      r.catalog = &catalog::dated();
      r.waves[0].rarity = static_cast<sim::Rarity>(tier);
      app::RoomManager rooms(r, 7, {}, db);
      auto& member = rooms.admit(guest.guest_token, 1);
      check(rooms.command(member, wire::Ready{true}, {}), "dated pickup fixture starts");
      rooms.step();
      auto& match = *rooms.room(member)->match;
      const auto view = match.view();
      const auto root =
          *std::ranges::find(view.entities, sim::Group::main_mob, &sim::EntityView::group);
      // Outside normal range, inside Common Magnet range.
      sim::FixtureAccess::position(match, root.id, {20, 0});
      sim::FixtureAccess::kill(match, root.id, player(rooms, member).life);
      rooms.step();
      for (unsigned i = 0; i < 10; ++i) {
        rooms.step();
      }
      check(rooms.wait_storage(), "complete catalog kill and pickup commit");
      if (magnet) {
        check(rooms.room(member)->drops.empty(),
              "Magnet actually collects beyond normal pickup range");
        if (tier == 0) {
          check(count(*member.profile, {5, 0}) == 1 && count(*member.profile, {2, 1}) == 1,
                "Magnet grants both independent outputs once");
        }
      } else {
        std::set<std::uint32_t> kinds;
        for (const auto& drop : rooms.room(member)->drops) {
          check(kinds.insert(drop.item.kind).second,
                "each petal kind chooses at most one output rarity");
          check(std::ranges::any_of(catalog::drop_table(),
                                    [&](const auto& rule) {
                                      return rule.mob == sim::Mob::ladybug &&
                                             static_cast<unsigned>(rule.mob_rarity) == tier &&
                                             catalog::client_petal(rule.petal) == drop.item.kind &&
                                             static_cast<unsigned>(rule.rarity) == drop.item.rarity;
                                    }),
                "all six input rarities select only their own complete drop table");
        }
        if (tier == 0) {
          check(kinds.size() == 2, "separate drop kinds are not normalized into one distribution");
        }
      }
    }
  }
}

void eligibility() {
  auto db = std::make_shared<store::Store>(":memory:");
  app::RoomManager rooms(rules(), 7, {}, db);
  auto& a = rooms.admit("", 1);
  auto& b = rooms.admit("", 2);
  rooms.command(a, wire::CreateSquad{true}, {});
  rooms.command(b, wire::JoinSquad{a.room}, {});
  rooms.command(a, wire::Ready{true}, {});
  rooms.command(b, wire::Ready{true}, {});
  rooms.step();
  auto& match = *rooms.room(a)->match;
  const auto life = player(rooms, a).life;
  rooms.disconnect(b.token, 2);
  const auto view = match.view();
  const auto root =
      *std::ranges::find(view.entities, sim::Group::main_mob, &sim::EntityView::group);
  sim::FixtureAccess::kill(match, root.id, life);
  rooms.step();
  check(rooms.wait_storage(), "solo eligible recipient commit");
  const auto xp = catalog::dated().mob(sim::Mob::ladybug, sim::Rarity::common)->xp;
  check(a.profile->xp == xp && b.profile->xp == 0 && b.profile->highest_wave == 0 &&
            b.profile->discoveries.empty(),
        "disconnected living body is ineligible for shared reward and completed wave");
  rooms.admit(b.token, 3);
  rooms.step();
  const auto old = player(rooms, b);
  sim::FixtureAccess::kill(match, *old.body, life);
  rooms.step();
  check(player(rooms, b).state == sim::LifeState::waiting,
        "second guest waits after authoritative death");
  const auto next = match.view();
  const auto target =
      std::ranges::find(next.entities, sim::Group::main_mob, &sim::EntityView::group)->id;
  // A detached projectile/summon retaining an earlier life cannot award XP to
  // its now-dead owner or share an otherwise unauthenticated defeat.
  sim::FixtureAccess::kill(match, target, old.life);
  rooms.step();
  check(rooms.wait_storage() && a.profile->xp == xp && b.profile->xp == 0,
        "dead or stale owner life cannot mint a shared kill reward");
}

void terminal_snapshot() {
  const store::Item rose{*catalog::client_petal(sim::Petal::rose), 0};
  const auto xp = catalog::dated().mob(sim::Mob::ladybug, sim::Rarity::common)->xp;
  {
    auto fixture = rules();
    fixture.waves.resize(1);
    fixture.spawn_points = {{2, 0}};  // First Basic particle is at -12 +14.
    fixture.mobs[0].body.health = 1;
    fixture.petals[0].contact_damage = 10;
    auto db = std::make_shared<store::Store>(":memory:");
    app::RoomManager rooms(fixture, 7, {}, db);
    auto& member = rooms.admit("", 1);
    rooms.command(member, wire::Ready{true}, {});
    rooms.step();
    check(rooms.room(member)->match->view().phase == sim::Phase::ended,
          "first tick can clear final wave");
    check(rooms.wait_storage() && member.profile->xp == xp && member.profile->highest_wave == 1 &&
              count(*member.profile, rose) == 1,
          "terminal life snapshot preserves first-tick survivor XP, wave and in-range pickup");
  }
  {
    auto fixture = rules();
    fixture.waves.resize(1);
    fixture.player.speed_per_second = 40;
    auto db = std::make_shared<store::Store>(":memory:");
    app::RoomManager rooms(fixture, 7, {}, db);
    auto& member = rooms.admit("", 1);
    rooms.command(member, wire::Ready{true}, {});
    rooms.step();
    auto& match = *rooms.room(member)->match;
    const auto alive = player(rooms, member);
    sim::FixtureAccess::position(match, *alive.body, {0, 0});
    const auto view = match.view();
    const auto root =
        std::ranges::find(view.entities, sim::Group::main_mob, &sim::EntityView::group)->id;
    sim::FixtureAccess::position(match, root, {app::RoomManager::pickup_distance, 0});
    sim::FixtureAccess::kill(match, root, alive.life);
    check(rooms.command(member, wire::Move{0, 3.14159265358979323846f, 100}, alive.life),
          "final tick movement queued");
    rooms.step();
    check(rooms.wait_storage() && member.profile->xp == xp && member.profile->highest_wave == 1 &&
              count(*member.profile, rose) == 0 && rooms.room(member)->drops.size() == 2,
          "pickup uses actual final movement position, not stale before-tick in-range coordinates");
  }
}

void shutdown_drain() {
  Database file;
  std::string token;
  store::Profile initial;
  std::size_t callbacks = 0;
  bool callbacks_on_executor = true;
  const auto executor = std::this_thread::get_id();
  const auto begun = std::chrono::steady_clock::now();
  {
    std::atomic<bool> delay = false;
    std::promise<void> reached;
    store::Options options;
    options.fault = [&](store::FaultPoint point) {
      if (point == store::FaultPoint::before_commit && delay.exchange(false)) {
        reached.set_value();
        std::this_thread::sleep_for(std::chrono::milliseconds(5300));
      }
    };
    auto db = std::make_shared<store::Store>(file.path.string(), options);
    initial = db->create_guest();
    token = initial.guest_token;
    auto fixture = rules();
    fixture.waves.resize(1);
    app::RoomManager rooms(fixture, 7, {}, db);
    auto& member = rooms.admit(token, 1);
    check(rooms.command(member, wire::Ready{true}, {}), "shutdown fixture starts match");
    rooms.step();
    const auto life = player(rooms, member).life;
    wire::Equip equipment;
    const auto n = store::unlocked_main_slots(initial.level);
    for (std::size_t i = 0; i < n; ++i) {
      if (initial.slots[i]) {
        equipment.slots[i] = {initial.slots[i]->kind, initial.slots[i]->rarity};
      }
    }
    delay = true;
    check(rooms.command(member, equipment, life, "shutdown:equip"),
          "slow shutdown mutation accepted");
    check(reached.get_future().wait_for(std::chrono::seconds(2)) == std::future_status::ready,
          "worker reaches 5.3 second transaction delay");
    for (std::size_t i = 1; i < app::RoomManager::storage_capacity; ++i) {
      check(rooms.request_profile(
                token,
                [&](auto profile) {
                  callbacks_on_executor &=
                      std::this_thread::get_id() == executor && profile.has_value();
                  ++callbacks;
                },
                false),
            "shutdown fills remaining queue capacity");
    }
    auto& match = *rooms.room(member)->match;
    const auto view = match.view();
    const auto root =
        std::ranges::find(view.entities, sim::Group::main_mob, &sim::EntityView::group)->id;
    sim::FixtureAccess::position(match, root, {200, 0});
    sim::FixtureAccess::kill(match, root, life);
    rooms.step();
    check(rooms.storage_pending() == app::RoomManager::storage_capacity + 1,
          "kill/wave batch retained outside full worker submission queue");
    check(!rooms.wait_storage(std::chrono::milliseconds(20)) && member.profile == initial &&
              callbacks == 0,
          "timed barrier retains slow transaction and unsubmitted reward batch");
    // No more explicit polling: destruction must deliver all 64 accepted jobs
    // and submit the retained kill/wave batch after the delayed job commits.
  }
  check(std::chrono::steady_clock::now() - begun >= std::chrono::seconds(5) &&
            callbacks == app::RoomManager::storage_capacity - 1 && callbacks_on_executor,
        "destructor drains beyond five seconds with executor-only completions");
  store::Store recovered(file.path.string());
  const auto profile = recovered.recover_guest(token);
  const auto* mob = catalog::dated().mob(sim::Mob::ladybug, sim::Rarity::common);
  check(profile && profile->xp == initial.xp + mob->xp && profile->highest_wave == 1 &&
            profile->discoveries.contains({mob->client_id, 0}) &&
            profile->version == initial.version + 3 && profile->inventory == initial.inventory &&
            profile->slots == initial.slots,
        "new Store recovers exactly one equipment, kill and wave commit after delayed shutdown");
}

void shutdown_failure() {
  std::atomic<bool> fail = false;
  std::atomic<unsigned> failures = 0;
  store::Options options;
  options.allow_test_seed = true;
  options.random_word = [] { return 0; };
  options.fault = [&](store::FaultPoint point) {
    if (point == store::FaultPoint::before_commit && fail) {
      ++failures;
      throw std::runtime_error("W3 persistent shutdown storage failure");
    }
  };
  auto db = std::make_shared<store::Store>(":memory:", options);
  const auto guest = db->create_guest();
  const store::Item rose{*catalog::client_petal(sim::Petal::rose), 0};
  store::TestSeed seed;
  seed.inventory = guest.inventory;
  seed.inventory[rose] = 15;
  seed.slots = guest.slots;
  const auto initial = db->seed_for_testing(guest.guest_token, seed);
  app::RoomManager rooms(rules(), 7, {}, db);
  auto& member = rooms.admit(guest.guest_token, 1);
  fail = true;
  check(rooms.command(member, wire::Craft{false, 0, rose.kind, 0}, {}, "shutdown:1") &&
            rooms.command(member, wire::Craft{false, 0, rose.kind, 0}, {}, "shutdown:2"),
        "persistent failure fixture queues ordered mutations");
  std::string error;
  const auto begun = std::chrono::steady_clock::now();
  try {
    rooms.drain_storage();
  } catch (const std::runtime_error& failure) {
    error = failure.what();
  }
  fail = false;  // Repair before assertions, so even a failed assertion can drain.
  check(error.find("W3 persistent shutdown storage failure") != std::string::npos &&
            failures == 8 && std::chrono::steady_clock::now() - begun >= std::chrono::seconds(1),
        "persistent drain failure is explicit and bounded with retry backoff");
  check(rooms.storage_pending() == 2 && member.profile == initial && member.craft_results.empty(),
        "failed explicit drain preserves ordered work without publishing uncommitted success");
  rooms.drain_storage();
  check(!rooms.storage_pending() && member.craft_results.size() == 2 &&
            count(*member.profile, rose) == 5 && member.profile->version == initial.version + 2,
        "repair and drain retries preserve both commands and commit each exactly once");
}
}  // namespace

int main() {
  try {
    queue_bound();
    squad_opening_wave();
    commands();
    command_faults();
    economy();
    complete_drops_and_magnet();
    eligibility();
    terminal_snapshot();
    shutdown_drain();
    shutdown_failure();
    std::cout
        << "W3-02 shared XP, root-only rewards, nearest pickup, level, completed wave, bounded I/O, shutdown and recovery passed\n";
  } catch (const std::exception& error) {
    std::cerr << "W3-02: " << error.what() << '\n';
    return 1;
  }
}
