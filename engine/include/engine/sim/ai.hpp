#pragma once
#include "engine/model/world.hpp"

namespace engine {

/** Read-only diagnostics for AI timer draws (R01 attribution). */
namespace ai_debug {
extern std::uint32_t last_timer_handle;
extern std::uint32_t timer_fires;
} // namespace ai_debug

class SpatialQuery;

/** Original function 168 gates: arena position, AI range, live health, owner
 * leash and controlling-root separation. */
[[nodiscard]] bool target_eligible(const World& world, const Entity& seeker,
                                   const Entity& target);

/** Original function 196: nearby untargeted AI acquire the attacker. Returns
 * the number of AI records that changed target. */
std::size_t alert_nearby(World& world, EntityHandle attacker, f32 radius);

/** Original function 197: nearest eligible actor with player/aggressive
 * priority. Returns an invalid handle when no target is in range. */
[[nodiscard]] EntityHandle find_target(const World& world, EntityHandle seeker);
/** Same selection with a caller-built spatial index (one rebuild per AI pass). */
[[nodiscard]] EntityHandle find_target(const World& world, const SpatialQuery& query,
                                       EntityHandle seeker);

/** Original function 198: closest live player with an open carried-petal slot.
 * The current domain model has one player profile, so this selects the local
 * player when it is inside the strict 70-unit radius and has a free slot. */
[[nodiscard]] EntityHandle find_pickup_recipient(const World& world, EntityHandle source);

/** Advance mob AI: validate/acquire targets, accelerate toward them, and use a
 * deterministic wander when idle. */
void update_ai(World& world, double delta_milliseconds);

/** Fill the AI record from the recovered family profile. */
void configure_mob_ai(Entity& entity, f32 radius, f32 speed, bool aggressive,
                      bool can_alert);

/** Recovered family profiles (original 205/208/210/415/115). These write the
 * exact health/radius/contact/speed/range/leash values, the 92-byte AI behavior
 * block and the family flags. */
void configure_ladybug(Entity& entity, int variant, ServerRng& rng);
void configure_ant(Entity& entity, std::uint8_t caste, ServerRng& rng);
void configure_centipede(Entity& entity, bool evil, bool head, ServerRng& rng);
void configure_beetle(Entity& entity, bool massive, ServerRng& rng);
/** Recovered non-family initializers: Spider, Bee, Hornet and Square. */
void configure_spider(Entity& entity, ServerRng& rng);
void configure_bee(Entity& entity, ServerRng& rng);
void configure_hornet(Entity& entity, ServerRng& rng);
void configure_square(Entity& entity, ServerRng& rng);

/** Original 426: assign the attacker to this damaged entity's AI when it has no
 * target, and propagate through the entity's damage callbacks. */
std::size_t alert_to_attacker(World& world, EntityHandle target, EntityHandle attacker);

/** Follow owner/parent links to the controlling root. */
[[nodiscard]] EntityHandle controlling_root(const World& world, EntityHandle handle);

/** Original 168/162 root equality, including the shared wild-mob manager.
 * Player-owned pets resolve through their player, rather than that manager. */
[[nodiscard]] bool same_controlling_root(const World& world, EntityHandle first,
                                         EntityHandle second);

} // namespace engine
