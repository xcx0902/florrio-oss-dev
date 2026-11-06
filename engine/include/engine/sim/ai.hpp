#pragma once
#include "engine/model/world.hpp"

namespace engine {

/** Read-only diagnostics for AI timer draws: the last handle that armed a timer
 * and how many timers have fired. */
namespace ai_debug {
extern std::uint32_t last_timer_handle;
extern std::uint32_t timer_fires;
}  // namespace ai_debug

class SpatialQuery;

/** Target eligibility gates: arena position, AI range, live health, owner
 * leash and controlling-root separation. */
[[nodiscard]] bool target_eligible(const World& world, const Entity& seeker, const Entity& target);

/** Nearby untargeted AI acquire the attacker. Returns
 * the number of AI records that changed target. */
std::size_t alert_nearby(World& world, EntityHandle attacker, f32 radius);

/** Nearest eligible actor with player/aggressive
 * priority. Returns an invalid handle when no target is in range. */
[[nodiscard]] EntityHandle find_target(const World& world, EntityHandle seeker);
/** Same selection with a caller-built spatial index (one rebuild per AI pass). */
[[nodiscard]] EntityHandle find_target(const World& world, const SpatialQuery& query,
                                       EntityHandle seeker);
[[nodiscard]] EntityHandle find_target(const World& world, const SpatialQuery& query,
                                       EntityHandle seeker, std::vector<EntityHandle>& candidates);

/** Closest live player with an open carried-petal slot.
 * The current domain model has one player profile, so this selects the local
 * player when it is inside the strict 70-unit radius and has a free slot. */
[[nodiscard]] EntityHandle find_pickup_recipient(const World& world, EntityHandle source);

/** Advance mob AI: validate/acquire targets, accelerate toward them, and use a
 * deterministic wander when idle. */
void update_ai(World& world, double delta_milliseconds);

/** Fill the AI record from the family profile. */
void configure_mob_ai(Entity& entity, f32 radius, f32 speed, bool aggressive, bool can_alert);

/** Family profiles for Ladybug, Ant, Centipede and Beetle. Each initializer
 * writes the family's health, contact damage, body radius, speed and range
 * values, plus its AI flags. */
void configure_ladybug(Entity& entity, int variant, ServerRng& rng);
void configure_ant(Entity& entity, std::uint8_t caste, ServerRng& rng);
void configure_centipede(Entity& entity, bool evil, bool head, ServerRng& rng);
void configure_beetle(Entity& entity, bool massive, ServerRng& rng);
/** Non-family initializers: Spider, Bee, Hornet and Square. */
void configure_spider(Entity& entity, ServerRng& rng);
void configure_bee(Entity& entity, ServerRng& rng);
void configure_hornet(Entity& entity, ServerRng& rng);
void configure_square(Entity& entity, ServerRng& rng);

/** Assign the attacker to a damaged entity's AI when it has no target, then
 * repeat the same aggression gates over every descendant. Returns the number of
 * AI records that changed target. */
std::size_t alert_to_attacker(World& world, EntityHandle target, EntityHandle attacker);

/** Follow owner/parent links to the controlling root. */
[[nodiscard]] EntityHandle controlling_root(const World& world, EntityHandle handle);

/** Root equality with one shared wild-mob controller: two unowned mob roots count
 * as the same controller, while player-owned pets resolve through their player. */
[[nodiscard]] bool same_controlling_root(const World& world, EntityHandle first,
                                         EntityHandle second);

}  // namespace engine
