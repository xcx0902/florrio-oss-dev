#include "engine/sim/player_motion.hpp"
#include <cmath>
namespace engine {
void add_motion_control(MotionState& state, float angle, float strength, float scale, double dt) {
  using namespace motion_config;
  const float behavior_scale = static_cast<float>(scale * static_cast<float>(kControlScale));
  const double base = static_cast<float>(dt * static_cast<double>(behavior_scale) * 0.001);
  const float impulse = static_cast<float>(
      strength < kMaxStrength
          ? base * static_cast<double>(static_cast<float>(strength * kStrengthScale))
          : base);
  const float radians = static_cast<float>(std::fmod(static_cast<double>(angle), kAngleModulus));
  const float cosine = static_cast<float>(std::cos(static_cast<double>(radians)));
  const float sine = static_cast<float>(std::sin(static_cast<double>(radians)));
  state.vx += static_cast<float>(cosine * impulse);
  state.vy += static_cast<float>(sine * impulse);
}
MotionIntegration motion_integration(double dt) {
  const double damping = std::pow(motion_config::kDamping, dt);
  return {damping, motion_config::kDragScale - damping * motion_config::kDragScale};
}
void integrate_linear_motion(MotionState& s, double ax, double ay, double dt, bool bounded,
                             double half_width, double half_height, double radius,
                             const MotionIntegration& rates, MotionState* unbounded) {
  using namespace motion_config;
  const double damping = rates.damping, drag = rates.drag;
  s.x = static_cast<float>((drag * s.vx + dt * ax) + static_cast<double>(s.x));
  s.y = static_cast<float>((drag * s.vy + dt * ay) + static_cast<double>(s.y));
  s.vx = damping * s.vx;
  s.vy = damping * s.vy;
  if (unbounded) {
    *unbounded = s;
  }
  if (bounded) {
    const double x = half_width - radius, y = half_height - radius;
    if (s.x > x) {
      s.x = static_cast<float>(x);
      s.vx = 0;
    }
    if (s.x < -x) {
      s.x = static_cast<float>(-x);
      s.vx = 0;
    }
    if (s.y > y) {
      s.y = static_cast<float>(y);
      s.vy = 0;
    }
    if (s.y < -y) {
      s.y = static_cast<float>(-y);
      s.vy = 0;
    }
  }
  if (std::fabs(s.vx) < kVelocityEpsilon) {
    s.vx = 0;
  }
  if (std::fabs(s.vy) < kVelocityEpsilon) {
    s.vy = 0;
  }
}
}  // namespace engine
