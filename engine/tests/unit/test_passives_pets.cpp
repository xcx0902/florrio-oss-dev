#include <iterator>
#include "engine/model/catalog.hpp"
#include "engine/net/worker_api.hpp"
#include "engine/sim/ai.hpp"
#include "engine/sim/combat.hpp"
#include "engine/sim/effects.hpp"
#include "engine/sim/movement.hpp"
#include "engine/sim/passives.hpp"
#include "engine/sim/petals.hpp"
#include "engine/sim/pets.hpp"
#include "engine/sim/player.hpp"
#include "engine/sim/spawn.hpp"
#include "engine/sim/tick.hpp"
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <initializer_list>
#include <string_view>

namespace {
using namespace engine;
void require(bool condition, const char* message) {
  if (condition) return;
  std::fprintf(stderr, "passives/pets: %s\n", message);
  std::exit(1);
}
EntityHandle setup(World& world, std::initializer_list<std::uint16_t> types) {
  world.initialize();
  world.set_auto_populate(false);
  auto profile = make_default_profile();
  const auto owner = spawn_player_default(world, "passive-pet", profile, false);
  require(owner.valid(), "player spawns");
  world.entities().get(owner)->set_position(Vec2{});
  world.loadout().clear();
  std::uint8_t slot = 0;
  for (auto type : types) require(world.loadout().equip(slot++, type), "slot equips");
  require(spawn_loadout_petals(world) >= types.size(), "configured petals spawn");
  return owner;
}
void rotation_and_heaviest() {
  for (const auto types : {std::initializer_list<std::uint16_t>{1}, {2}, {14}, {14,14},
                          {26}, {26,26}, {14,26}, {28}, {14,28}, {28,28}}) {
    World world;
    setup(world, types);
    std::uint32_t faster = 0, yin = 0;
    for (auto type : types) { faster += type == 14U; yin += type == 28U; }
    advance_loadout_orbit_phase(world, 50.0);
    const auto direction = yin == 0U ? 1.0 : yin == 1U ? -1.0 : 0.0;
    require(world.loadout().orbit_phase() == f32::from_double((2.5 + 0.8*faster)*direction*0.05),
      "original shared phase including Faster and unchanged Heaviest");
    if (*types.begin() == 14U) {
      world.loadout().set_pending(0, 0, true);
      world.loadout().set_orbit_phase(f32(0.0F));
      advance_loadout_orbit_phase(world, 50.0);
      require(world.loadout().orbit_phase() == f32::from_double((2.5+0.8*(faster-1))*direction*0.05),
        "pending Faster contributes no bonus");
    }
  }
  World world;
  setup(world, {26});
  require(world.entities().get(world.loadout().handle(0,0))->mass == f32(4.0F),
    "original Heaviest mass is four");
  world.apply_input(1U, f32(0.0F), f32(0.0F));
  update_petal_orbits(world, 50.0);
  require(world.petals()[0].orbit_radius == f32(100.0F), "Heaviest attack ring is 100");
}
void passive_health() {
  struct Case { std::uint16_t type; float maximum; float health; };
  // Direct original 145 + one 654 tick; health starts at 50/100.
  for (const auto fixture : {Case{1,100.0F,50.02083206176758F},
      Case{32,100.0F,50.07083511352539F}, Case{13,120.0F,60.025001525878906F},
      Case{21,120.0F,60.025001525878906F}, Case{33,140.0F,70.02916717529297F}}) {
    World world;
    const auto owner = setup(world, {fixture.type});
    auto* player = world.entities().get(owner);
    player->health = f32(50.0F);
    regenerate_players(world, 50.0);
    require(player->max_health == f32(fixture.maximum), "original Cactus max health per slot");
    require(player->health == f32(fixture.health), "original rounded rescale and passive healing");
    world.loadout().set_pending(0,0,true);
    const auto old_health = player->health, old_maximum = player->max_health;
    regenerate_players(world,50.0);
    const f32 expected = (f32(100.0F)*old_health)/old_maximum + f32::from_double(50.0*100.0/240000.0);
    require(player->max_health == f32(100.0F) && player->health == expected,
      "pending suppresses Leaf/Cactus and preserves health ratio");
  }
  World world;
  const auto owner = setup(world, {13,21,33,32,32});
  auto* player = world.entities().get(owner);
  player->health = f32(50.0F);
  regenerate_players(world,50.0);
  require(player->max_health == f32(180.0F), "Cactus stacks across active slots");
  require(player->health == f32::from_double(90.0 + static_cast<double>(f32::from_double(0.0375+0.1).value)),
    "two Leafs add two health per second");
  require(apply_effect(world,owner,EffectType::kHealBlock,f32(1.0F),1000.0), "heal block applies");
  const auto before = player->health;
  regenerate_players(world,50.0);
  require(player->health == (player->max_health*before)/player->max_health,
    "heal veto suppresses base and Leaf recovery");
  player->health = f32(0.0F);
  regenerate_players(world,50.0);
  require(player->health == f32(0.0F), "Leaf never revives a dead player");
  // Reserve slots are not counted; type33 contributes once despite three petals.
  world.profile().set_level(1);
  require(world.loadout().equip(5,13), "reserve Cactus equips");
  require(equipped_max_health_bonus(world,1) == f32(80.0F), "reserve Cactus adds nothing");
  require(equipped_max_health_bonus(world,15) == f32(100.0F), "unlocking slot includes its Cactus");
  World capped;
  const auto capped_owner = setup(capped, {32});
  capped.entities().get(capped_owner)->health = f32(99.99F);
  regenerate_players(capped,50.0);
  require(capped.entities().get(capped_owner)->health == f32(100.0F), "Leaf caps at maximum health");
  World rewards;
  const auto reward_owner = setup(rewards,{13});
  rewards.entities().get(reward_owner)->health = f32(50.0F);
  award_player_experience(rewards,f32(4.0F));
  require(rewards.entities().get(reward_owner)->max_health
    == player_level_max_health(rewards.profile().level())+f32(20.0F),
    "level reward keeps equipped Cactus maximum");
}
void egg_slot_and_recharge(std::uint16_t type, double delay, std::uint16_t mob_type) {
  World world;
  const auto owner = setup(world, {type});
  const auto egg = world.loadout().handle(0,0);
  world.set_time_ms(delay);
  update_petal_orbits(world,50.0);
  require(world.loadout().handle(0,0) == egg, "no hatch at exact delay");
  world.set_time_ms(delay+1.0);
  update_petal_orbits(world,1.0);
  const auto pet = world.loadout().handle(0,0);
  require(pet.valid() && pet != egg, "hatch replaces equipped handle");
  const auto* hatchling = world.entities().get(pet);
  require(hatchling != nullptr && hatchling->kind == EntityKind::kMob
    && hatchling->type_id == mob_type, "original hatchling species");
  require(hatchling->owner == owner.raw && hatchling->ai.owner == owner,
    "pet owner and AI leash owner are the player");
  require(hatchling->ai.radius == f32(1000.0F) && hatchling->ai.guard_radius == f32(300.0F)
    && hatchling->ai.leash == f32(1000.0F), "original Egg AI overrides");
  require(world.entities().get(egg)->health == f32(0.0F), "Egg health is consumed");
  require(world.petals().empty(), "pet does not orbit as an Egg");
  require(refresh_loadout_petals(world,5000.0) == 0U && world.loadout().handle(0,0) == pet,
    "living pet blocks recharging and duplicate hatches");
  require(world.loadout().slots()[0].recharge_remaining_ms == 0.0
    && world.loadout().recharge_progress()[0] == 65535U, "living pet keeps its ready slot");
  require(damage_entity(world,pet,world.entities().get(pet)->health).died,
    "pet dies through the actual damage and corpse path");
  require(world.loadout().handle(0,0) == pet,
    "pet death retains its slot until the next equipped-slot sweep");
  require(refresh_loadout_petals(world,50.0) == 0U && !world.loadout().handle(0,0).valid(),
    "pet death starts Egg recharge in the slot sweep");
  require(world.loadout().slots()[0].recharge_remaining_ms == 950.0,
    "first recharge tick counts 50 ms after death");
  require(refresh_loadout_petals(world,949.0) == 0U, "no Egg one ms before recharge completes");
  world.set_time_ms(delay+6001.0);
  require(refresh_loadout_petals(world,1.0) == 1U, "Egg returns after catalog recharge");
  require(world.entities().get(world.loadout().handle(0,0))->type_id == type, "respawns an Egg");
  require(world.petals()[0].behavior_started_at_ms == world.time_ms(), "fresh Egg hatch clock");
}
void pet_targeting_and_guard() {
  World world;
  const auto owner = setup(world, {22});
  world.set_time_ms(1001.0);
  update_petal_orbits(world,1.0);
  const auto pet = world.loadout().handle(0,0);
  auto* friendly = world.entities().get(pet);
  const auto wild = spawn_entity_from_defaults(world,EntityKind::kMob,9,Vec2(f32(100.0F),f32(0.0F)));
  const auto other_wild = spawn_entity_from_defaults(world,EntityKind::kMob,9,Vec2(f32(120.0F),f32(0.0F)));
  require(target_eligible(world,*friendly,*world.entities().get(wild)), "pet can target wild mob");
  require(!target_eligible(world,*friendly,*world.entities().get(owner)), "pet rejects owner");
  require(!target_eligible(world,*world.entities().get(wild),*world.entities().get(other_wild)),
    "wild mobs retain shared manager allegiance");
  require(find_target(world,pet) == wild, "pet acquires nearest eligible mob");
  update_ai(world,50.0);
  require(friendly->ai.target == wild && friendly->velocity.x > 0.0, "pet attacks through chase AI");
  friendly->ai.target = EntityHandle{};
  friendly->ai.aggressive = false;
  friendly->ai.guard_active = true;
  friendly->ai.guard_point = friendly->position;
  update_ai(world,50.0);
  require(!friendly->ai.guard_active, "guard arrival clears the chase state");
  // An owned, idle pet outside its guard radius chooses a point throughout the
  // full circle. The old fraction*angle-scale bug restricted it to +X.
  friendly->set_position(Vec2(f32(400.0F),f32(0.0F)));
  world.random().seed(12345U);
  update_ai(world,50.0);
  require(friendly->ai.guard_active && std::abs(friendly->ai.guard_point.y.value) > 1.0F,
    "guard point uses a full-circle random angle");
}

void egg_full_ticks() {
  for (const auto type : {22U,23U}) {
    World world;
    setup(world,{static_cast<std::uint16_t>(type)});
    const auto egg = world.loadout().handle(0,0);
    const int ticks = type == 22U ? 20 : 50;
    for (int index=0; index<ticks; ++index) tick(world,50.0);
    require(world.loadout().handle(0,0) == egg, "real tick keeps Egg at exact hatch time");
    tick(world,50.0);
    const auto pet = world.loadout().handle(0,0);
    require(pet.valid() && pet != egg && world.entities().get(pet)->kind == EntityKind::kMob,
      "real tick replaces Egg with a pet in orbit phase");
    for (int index=0; index<30; ++index) tick(world,50.0);
    require(world.loadout().handle(0,0) == pet && world.petals().empty(),
      "real ticks never hatch duplicate pets while the pet lives");
  }
}

void pet_contacts() {
  enum class Pair { kWild, kSibling, kOwner, kWildPair };
  for (const auto pair : {Pair::kWild,Pair::kSibling,Pair::kOwner,Pair::kWildPair}) {
    World world;
    const auto owner = setup(world,{22});
    world.set_time_ms(1001.0);
    update_petal_orbits(world,1.0);
    const auto pet = world.loadout().handle(0,0);
    world.entities().get(owner)->set_position(Vec2(f32(-500.0F),f32(0.0F)));
    world.entities().get(pet)->set_position(Vec2(f32(300.0F),f32(0.0F)));
    EntityHandle first = pet;
    EntityHandle second = owner;
    if (pair == Pair::kWildPair) {
      world.entities().get(pet)->set_position(Vec2(f32(-500.0F),f32(0.0F)));
      first = spawn_entity_from_defaults(world,EntityKind::kMob,9,Vec2(f32(300.0F),f32(0.0F)));
    }
    if (pair == Pair::kOwner) {
      world.entities().get(owner)->set_position(Vec2(f32(310.0F),f32(0.0F)));
    } else {
      second = spawn_entity_from_defaults(world,EntityKind::kMob,9,Vec2(f32(310.0F),f32(0.0F)));
      if (pair == Pair::kSibling) world.entities().get(second)->owner = owner.raw;
    }
    auto* a = world.entities().get(first);
    auto* b = world.entities().get(second);
    require(a != nullptr && b != nullptr, "contact pair exists");
    const auto health_a = a->health, health_b = b->health;
    const auto damage_a = a->contact_damage, damage_b = b->contact_damage;
    const bool hostile = pair == Pair::kWild;
    require(same_controlling_root(world,first,second) != hostile,
      "contact allegiance uses the pet owner or shared wild manager");
    const auto contacts = resolve_contacts(world);
    if (hostile) require(contacts > 0U, "pet and wild mob make contact");
    require(a->health == (hostile ? health_a-damage_b : health_a),
      "only hostile pet/wild contact damages the first body");
    require(b->health == (hostile ? health_b-damage_a : health_b),
      "pet damages a wild mob while owner, sibling and wild pairs stay harmless");
  }
}

void pet_full_tick_damage() {
  for (const auto type : {22U,23U}) {
    World world;
    const auto owner = setup(world,{static_cast<std::uint16_t>(type)});
    const int hatch_ticks = type == 22U ? 21 : 51;
    for (int index=0; index<hatch_ticks; ++index) tick(world,50.0);
    const auto pet = world.loadout().handle(0,0);
    auto* friendly = world.entities().get(pet);
    require(friendly != nullptr && friendly->kind == EntityKind::kMob,
      "full-tick damage fixture hatches a pet");
    world.entities().get(owner)->set_position(Vec2(f32(-500.0F),f32(0.0F)));
    friendly->set_position(Vec2(f32(300.0F),f32(0.0F)));
    friendly->velocity = {};
    const auto wild = spawn_entity_from_defaults(world,EntityKind::kMob,9,
      Vec2(f32(310.0F),f32(0.0F)));
    auto* enemy = world.entities().get(wild);
    const auto pet_health = friendly->health, wild_health = enemy->health;
    tick(world,50.0);
    require(friendly->ai.target == wild, "full tick lets the pet acquire a wild mob");
    require(friendly->health < pet_health && enemy->health < wild_health,
      "full tick exchanges pet/wild contact damage");
  }
}

void zone_disables_equipped_pets() {
  for (const auto type : {22U,23U}) {
    World world;
    const auto owner = setup(world,{static_cast<std::uint16_t>(type)});
    const int hatch_ticks = type == 22U ? 21 : 51;
    for (int index=0; index<hatch_ticks; ++index) tick(world,50.0);
    const auto pet = world.loadout().handle(0,0);
    require(world.entities().get(pet)->kind == EntityKind::kMob && world.petals().empty(),
      "zone fixture starts with a living equipped pet outside the orbit list");
    world.profile().set_level(60U);
    world.entities().get(owner)->set_position_x(f32(-24000.0F));
    world.set_zone_timer_ms(f32(44950.0F));
    tick(world,50.0);
    const auto* corpse = world.entities().get(pet);
    require(world.zone_petals_disabled() && world.zone_timer_ms() == f32(45000.0F),
      "zone timer reaches its unchanged 45-second cap");
    require(corpse != nullptr && corpse->health == f32(0.0F) && corpse->death_processed,
      "full-tick zone disable kills the pet through the ordinary corpse path");
    require(!world.loadout().handle(0,0).valid() && !world.loadout().slots()[0].instances[0].valid(),
      "zone sweep releases both equipped pet handle views");
    require(world.loadout().slots()[0].recharge_remaining_ms == 950.0,
      "zone defeat starts the original 50-ms recharge tick");
    require(world.loadout().recharge_progress()[0] == 0U,
      "disabled-zone field61 cache publishes zero even as Egg recharge advances");
    for (int index=0; index<19; ++index) tick(world,50.0);
    require(!world.loadout().handle(0,0).valid()
      && world.loadout().slots()[0].recharge_remaining_ms == 0.0 && world.petals().empty(),
      "disabled slots finish charging but never spawn another Egg or pet");
    require(world.loadout().recharge_progress()[0] == 0U,
      "a fully charged disabled slot still publishes zero");
    world.entities().get(owner)->set_position_x(f32(24000.0F));
    tick(world,50.0);
    const auto replacement = world.loadout().handle(0,0);
    require(!world.zone_petals_disabled() && world.zone_timer_ms() == f32(44995.0F),
      "safe-zone timer keeps its original 0.1 decay");
    require(replacement.valid() && world.entities().get(replacement)->kind == EntityKind::kPetal
      && world.entities().get(replacement)->type_id == type,
      "leaving zone restriction permits the recharged Egg to spawn");
    require(world.loadout().recharge_progress()[0] == 65535U,
      "re-enabling a charged Egg restores the ready field61 cache");
  }
}

void discard_hatched_pet_before_owner_death() {
  for (const auto type : {22U,23U}) {
    WorkerApi api;
    api.init(false);
    auto& world = api.world();
    const auto owner = setup(world,{static_cast<std::uint16_t>(type)});
    world.profile().set_inventory(0U,static_cast<std::uint16_t>(type));
    const int hatch_ticks = type == 22U ? 21 : 51;
    for (int index=0; index<hatch_ticks; ++index) tick(world,50.0);
    const auto pet = world.loadout().handle(0U,0U);
    const auto* hatchling = world.entities().get(pet);
    require(hatchling != nullptr && hatchling->kind == EntityKind::kMob && hatchling->health.value > 0.0F,
      "opcode8 fixture starts with a living equipped pet");
    const std::array<std::uint8_t,4> key{0x11,0x22,0x33,0x44};
    const auto discard = [&api,&key](std::uint32_t sequence,std::uint8_t expected_type) {
      ByteWriter writer;
      writer.write_varint32(sequence); writer.write_varint32(8U);
      writer.write_u8(0U); writer.write_u8(expected_type);
      auto packet = writer.bytes();
      apply_packet_xor(packet,key);
      require(api.send(packet,key), "opcode8 packet parses");
    };
    discard(1U,1U);
    require(world.loadout().handle(0U,0U) == pet && world.entities().get(pet)->health.value > 0.0F,
      "mismatched discard leaves the equipped pet alive");
    discard(2U,static_cast<std::uint8_t>(type));
    const auto* corpse = world.entities().get(pet);
    require(corpse != nullptr && corpse->health == f32(0.0F) && corpse->death_processed,
      "opcode8 damages the hatchling before clearing its equipped handle");
    require(!world.loadout().handle(0U,0U).valid() && world.loadout().slots()[0].type_id == 0U
      && world.profile().inventory(0U) == 0U, "discard clears the slot and profile");
    require(world.profile().backpack_count() == 1U && world.profile().backpack()[0] == type,
      "discard retains the Egg type in the backpack");
    require(damage_entity(world,owner,world.entities().get(owner)->health).died,
      "owner subsequently dies through the ordinary damage path");
    for (int index=0; index<21; ++index) tick(world,50.0);
    require(world.entities().get(pet) == nullptr,
      "discarded pet is reaped and cannot survive the owner's death");
    for (const auto& entity : world.entities().entities())
      require(!entity.active || entity.kind != EntityKind::kMob || entity.owner != owner.raw
        || entity.health.value <= 0.0F, "no live discarded hatchling escapes owner death");
  }
}

void zone_reenable_partial_recharge() {
  World world;
  const auto owner = setup(world,{22});
  for (int index=0; index<21; ++index) tick(world,50.0);
  world.profile().set_level(60U);
  world.entities().get(owner)->set_position_x(f32(-24000.0F));
  world.set_zone_timer_ms(f32(44950.0F));
  tick(world,50.0);
  require(world.loadout().recharge_progress()[0] == 0U,
    "partial-recharge fixture publishes zero while disabled");
  world.entities().get(owner)->set_position_x(f32(24000.0F));
  tick(world,50.0);
  require(!world.zone_petals_disabled() && !world.loadout().handle(0U,0U).valid(),
    "leaving restriction before recharge completes does not spawn early");
  require(world.loadout().slots()[0].recharge_remaining_ms == 900.0
    && world.loadout().recharge_progress()[0] == 6553U,
    "re-enabling restores actual 100/1000-ms progress instead of a stale zero or ready cache");
}
} // namespace

int main(int argc, char** argv) {
  if (argc == 2 && std::string_view(argv[1]) == "--contacts") {
    pet_contacts();
    pet_full_tick_damage();
    std::puts("ok - pet/wild damage and owner/sibling/wild allegiance");
    return 0;
  }
  if (argc == 2 && std::string_view(argv[1]) == "--zone") {
    zone_disables_equipped_pets();
    zone_reenable_partial_recharge();
    std::puts("ok - zone disable kills equipped pets through real engine ticks");
    return 0;
  }
  if (argc == 2 && std::string_view(argv[1]) == "--discard") {
    discard_hatched_pet_before_owner_death();
    std::puts("ok - opcode8 kills the equipped pet before clearing its handle");
    return 0;
  }
  rotation_and_heaviest();
  std::puts("ok 1 - original Faster phase and Heaviest mass/orbit");
  passive_health();
  std::puts("ok 2 - Leaf and Cactus exact health, readiness, stacking and veto");
  egg_slot_and_recharge(22U,1000.0,9U);
  egg_slot_and_recharge(23U,2500.0,12U);
  std::puts("ok 3 - both Egg strict hatch boundaries and recharge after pet death");
  pet_targeting_and_guard();
  std::puts("ok 4 - pet targeting, guard arrival and random guard direction");
  egg_full_ticks();
  std::puts("ok 5 - Egg timing and one living pet through real engine ticks");
  pet_contacts();
  pet_full_tick_damage();
  std::puts("ok 6 - pet/wild damage and owner/sibling/wild allegiance");
  zone_disables_equipped_pets();
  zone_reenable_partial_recharge();
  std::puts("ok 7 - zone disable kills equipped pets through real engine ticks");
  discard_hatched_pet_before_owner_death();
  std::puts("ok 8 - hatched pet discard followed by owner death");
  return 0;
}
