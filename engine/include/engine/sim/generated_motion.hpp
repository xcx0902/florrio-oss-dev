// Generated from schema/multiplayer.yaml. Do not edit.
#pragma once
namespace engine::motion_config {
inline constexpr double kDamping = 0.992;
inline constexpr double kDragScale = 124.99999999999989;
inline constexpr double kControlScale = 2.5;
inline constexpr double kStrengthScale = 0.004999999888241291;
inline constexpr double kMaxStrength = 200;
inline constexpr double kAngleModulus = 6.283185307179586;
inline constexpr double kVelocityEpsilon = 2.220446049250313e-16;
inline constexpr double kInputEventMinMs = 25;
inline constexpr double kResyncAfterMs = 1000;
inline constexpr double kHistoryLimit = 256;
inline constexpr double kReplayTicks = 4;
inline constexpr double kCorrectionMs = 100;
inline constexpr double kInitialDelayMs = 100;
inline constexpr double kMinDelayMs = 50;
inline constexpr double kMaxDelayMs = 200;
inline constexpr double kExtrapolateMs = 50;
inline constexpr double kTeleportRadii = 4;
inline constexpr double kTeleportMinimum = 100;
inline constexpr double kSnapshotLimit = 8;
inline constexpr double kClockSamples = 20;
inline constexpr double kMaxRttMs = 2000;
inline constexpr double kPingIntervalMs = 1000;
}
