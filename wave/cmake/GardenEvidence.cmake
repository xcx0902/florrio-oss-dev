# Generate the typed W1 inputs from the dated W0 rule pack at configure time.
set(garden_evidence "${CMAKE_CURRENT_SOURCE_DIR}/data/evidence/20221030/rules.json")
set_property(
  DIRECTORY
  APPEND
  PROPERTY CMAKE_CONFIGURE_DEPENDS "${garden_evidence}"
)
file(READ "${garden_evidence}" evidence_json)
string(JSON evidence_version GET "${evidence_json}" version)
string(JSON rule_count LENGTH "${evidence_json}" rules)
math(EXPR last_rule "${rule_count} - 1")
foreach(index RANGE ${last_rule})
  string(
    JSON
    id
    GET
    "${evidence_json}"
    rules
    ${index}
    id
  )
  string(JSON "rule_${id}" GET "${evidence_json}" rules ${index})
endforeach()

function(garden_get output id)
  string(JSON value GET "${rule_${id}}" ${ARGN})
  set("${output}"
      "${value}"
      PARENT_SCOPE
  )
endfunction()

function(garden_bool output id)
  garden_get(value "${id}" ${ARGN})
  if(value)
    set("${output}"
        "true"
        PARENT_SCOPE
    )
  else()
    set("${output}"
        "false"
        PARENT_SCOPE
    )
  endif()
endfunction()

function(garden_mobs output names)
  string(JSON count LENGTH "${names}")
  math(EXPR last "${count} - 1")
  set(mobs "")
  foreach(index RANGE ${last})
    string(JSON name GET "${names}" ${index})
    string(TOLOWER "${name}" name)
    string(REPLACE " " "_" name "${name}")
    list(APPEND mobs "Mob::${name}")
  endforeach()
  set("${output}"
      "${mobs}"
      PARENT_SCOPE
  )
endfunction()

garden_get(threshold wave.advance.remaining currentValue)
garden_get(special_chance wave.special.chance currentValue)
garden_bool(special_first wave.special.firstWave currentValue)
garden_bool(next_wave_respawn respawn.nextWave currentValue)
garden_bool(deadline_advances wave.advance.deadline currentValue deadlineAdvancesAfterSpawn)
garden_get(starting_wave match.startingWave currentValue freshProfile)
garden_get(schedule wave.spawn.gardenEarlySchedule currentValue)
garden_get(groups wave.special.gardenPool candidate)

string(JSON count LENGTH "${schedule}")
math(EXPR last "${count} - 1")
set(eligible "")
set(waves_cpp "")
foreach(index RANGE ${last})
  string(JSON wave GET "${schedule}" ${index} wave)
  if(index EQUAL 0 AND NOT wave EQUAL starting_wave)
    message(FATAL_ERROR "Garden schedule must start at wave ${starting_wave}")
  endif()
  garden_get(names wave.spawn.gardenEarlyEligibility candidate "${wave}")
  garden_mobs(new_mobs "${names}")
  list(APPEND eligible ${new_mobs})
  list(JOIN eligible ", " mob_cpp)

  string(JSON rarity GET "${schedule}" ${index} rarity)
  string(TOLOWER "${rarity}" rarity)
  string(JSON deadline GET "${schedule}" ${index} deadlineSeconds)
  string(JSON batch_count LENGTH "${schedule}" ${index} batches)
  math(EXPR last_batch "${batch_count} - 1")
  set(batches "")
  set(budget 0)
  foreach(batch RANGE ${last_batch})
    string(
      JSON
      at
      GET
      "${schedule}"
      ${index}
      batches
      ${batch}
      atSeconds
    )
    string(
      JSON
      amount
      GET
      "${schedule}"
      ${index}
      batches
      ${batch}
      count
    )
    math(EXPR budget "${budget} + ${amount}")
    list(APPEND batches "{seconds(${at}), ${amount}}")
  endforeach()
  list(JOIN batches ", " batch_cpp)
  string(APPEND waves_cpp "      {${wave}, {${mob_cpp}}, Rarity::${rarity}, ${budget},\n"
         "       {${batch_cpp}}, seconds(${deadline})},\n"
  )
endforeach()

string(JSON count LENGTH "${groups}")
math(EXPR last "${count} - 1")
set(groups_cpp "")
foreach(index RANGE ${last})
  string(JSON names GET "${groups}" ${index})
  garden_mobs(mobs "${names}")
  list(JOIN mobs ", " mob_cpp)
  string(APPEND groups_cpp "      {${mob_cpp}},\n")
endforeach()

configure_file("${CMAKE_CURRENT_LIST_DIR}/garden_evidence.hpp.in" garden_evidence.hpp @ONLY)
