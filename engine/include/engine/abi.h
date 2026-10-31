#pragma once
#include <stdint.h>
#ifdef __cplusplus
#include <cstdint>
extern "C" {
#endif
void sp_server_init(void);
void sp_server_send(const uint8_t* data, uint32_t length);
void sp_server_think(void);
void sp_server_flush(void);
uint32_t sp_server_entity_count(void);
uint32_t sp_server_output_count(void);
const uint8_t* sp_server_output_data(uint32_t index);
uint32_t sp_server_output_size(uint32_t index);
uint32_t sp_server_player_handle(void);
uint32_t sp_server_player_valid(void);
uint32_t sp_server_debug_set_entity_field(uint32_t handle, uint32_t field, double value);
uint32_t sp_server_debug_spawn_mob(uint32_t type_id, float x, float y);
uint32_t sp_server_debug_set_loadout_slot(uint32_t slot, uint32_t type_id);
#ifdef __cplusplus
}
#endif
