#pragma once
#include "engine/sim/generated_motion.hpp"
namespace engine {
/** No World, collision, combat or clock ownership. Positions narrow to f32;
 * velocity and additive acceleration retain the original f64 chain. */
struct MotionState { float x = 0, y = 0; double vx = 0, vy = 0; };
void add_motion_control(MotionState& state, float angle, float strength, float scale, double dt);
struct MotionIntegration { double damping, drag; };
[[nodiscard]] MotionIntegration motion_integration(double dt);
void integrate_linear_motion(MotionState& state, double ax, double ay, double dt,
                             bool bounded, double half_width, double half_height, double radius,
                             const MotionIntegration& rates, MotionState* unbounded = nullptr);
} // namespace engine
