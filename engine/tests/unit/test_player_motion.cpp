#include "engine/sim/player_motion.hpp"
#include "../support/multiplayer.hpp"
#include "engine/sim/movement.hpp"
#include <cmath>
#include <cstdlib>
#include <iomanip>
#include <iostream>
using namespace engine;
#define CHECK(x)                             \
  do {                                       \
    if (!(x)) {                              \
      std::cerr << __LINE__ << ": " #x "\n"; \
      std::exit(1);                          \
    }                                        \
  } while (false)
// Frozen pre-extraction arithmetic, independent of the generated parameters.
MotionState reference(MotionState s, float angle, float strength, float scale, double ax, double ay,
                      double width, double height) {
  const float behavior = static_cast<float>(scale * 2.5F);
  const double base = static_cast<float>(50.0 * static_cast<double>(behavior) * 0.001);
  const float impulse = static_cast<float>(
      strength < 200.0
          ? base * static_cast<double>(static_cast<float>(strength * 0.004999999888241291))
          : base);
  const float normalized =
      static_cast<float>(std::fmod(static_cast<double>(angle), 6.283185307179586));
  s.vx +=
      static_cast<float>(static_cast<float>(std::cos(static_cast<double>(normalized))) * impulse);
  s.vy +=
      static_cast<float>(static_cast<float>(std::sin(static_cast<double>(normalized))) * impulse);
  const double damping = std::pow(0.992, 50.0),
               drag = 124.99999999999989 - damping * 124.99999999999989;
  s.x = static_cast<float>((drag * s.vx + 50.0 * ax) + static_cast<double>(s.x));
  s.y = static_cast<float>((drag * s.vy + 50.0 * ay) + static_cast<double>(s.y));
  s.vx = damping * s.vx;
  s.vy = damping * s.vy;
  if (s.x > width * .5 - 25) {
    s.x = static_cast<float>(width * .5 - 25);
    s.vx = 0;
  }
  if (s.x < -(width * .5 - 25)) {
    s.x = static_cast<float>(-(width * .5 - 25));
    s.vx = 0;
  }
  if (s.y > height * .5 - 25) {
    s.y = static_cast<float>(height * .5 - 25);
    s.vy = 0;
  }
  if (s.y < -(height * .5 - 25)) {
    s.y = static_cast<float>(-(height * .5 - 25));
    s.vy = 0;
  }
  if (std::fabs(s.vx) < 2.220446049250313e-16) {
    s.vx = 0;
  }
  if (std::fabs(s.vy) < 2.220446049250313e-16) {
    s.vy = 0;
  }
  return s;
}
void print(MotionState s) {
  std::cout << "{\"x\":" << s.x << ",\"y\":" << s.y << ",\"vx\":" << s.vx << ",\"vy\":" << s.vy
            << '}';
}
int main(int argc, char** argv) {
  const bool fixture = argc == 2 && std::string_view(argv[1]) == "--fixture";
  std::cout << std::setprecision(17);
  if (fixture) {
    std::cout << '[';
  }
  for (unsigned scenario = 0; scenario < 8; ++scenario) {
    MotionState state{scenario == 3 ? 24970.0F : 13.125F, scenario == 4 ? -1970.0F : -12.25F,
                      scenario == 5 ? 0.12345678912345 : 0.0, -0.031234567891234};
    const double ax = scenario == 5 ? 0.000123456789 : 0, ay = scenario == 5 ? -0.000987654321 : 0;
    for (unsigned phase = 0; phase < 80; ++phase) {
      const float angle = scenario == 4   ? -1.57079632679F
                          : scenario == 6 ? -19.654321F
                          : phase < 40    ? 0.73125F
                                          : -2.15F;
      const float strength = phase >= 60 ? 0 : scenario == 1 ? 100 : 200;
      const float scale = scenario == 2 ? .25F : scenario == 7 && phase < 40 ? .025F : 1;
      const auto initial = state;
      add_motion_control(state, angle, strength, scale, 50);
      integrate_linear_motion(state, ax, ay, 50, true, 25000, 2000, 25, motion_integration(50));
      const auto expected = reference(initial, angle, strength, scale, ax, ay, 50000, 4000);
      CHECK(state.x == expected.x && state.y == expected.y && state.vx == expected.vx &&
            state.vy == expected.vy);
      if (fixture) {
        if (scenario || phase) {
          std::cout << ',';
        }
        std::cout << "{\"scenario\":" << scenario << ",\"phase\":" << phase << ",\"initial\":";
        print(initial);
        std::cout << ",\"input\":{\"angle\":" << angle << ",\"strength\":" << strength
                  << "},\"parameters\":{\"motionScale\":" << scale << ",\"accelerationX\":" << ax
                  << ",\"accelerationY\":" << ay
                  << ",\"arenaWidth\":50000,\"arenaHeight\":4000,\"radius\":25},\"expected\":";
        print(expected);
        std::cout << '}';
      }
    }
  }
  // The real domain invokes the same extracted calculation without changing a
  // native single-player trajectory (the M00 frozen fixture covers full World).
  auto world = test::make_world();
  const auto id = test::join_player(*world, "Motion", {});
  auto* player = world->players().get(id);
  auto* body = world->entities().get(player->player());
  MotionState expected{};
  for (unsigned phase = 0; phase < 80; ++phase) {
    const float strength = phase < 40 ? 200 : 0;
    CHECK(apply_player_input(*world, id, player->life_epoch, 0, f32(.73125F), f32(strength)));
    apply_player_controls(*world, *player, 50);
    integrate_movement(*world, 50);
    world->advance_tick(50);
    expected = reference(expected, .73125F, strength, 1, 0, 0, world->width().value,
                         world->height().value);
    CHECK(body->position.x.value == expected.x && body->position.y.value == expected.y);
    CHECK(body->velocity.x == expected.vx && body->velocity.y == expected.vy);
  }
  if (fixture) {
    std::cout << "]\n";
  } else {
    std::cout
        << "TAP version 13\n1..2\nok 1 - 640 frozen motion steps\nok 2 - native player trajectory unchanged\n";
  }
}
