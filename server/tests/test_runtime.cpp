#include "support.hpp"
#include "engine/sim/combat.hpp"
#include <fstream>
#include <sstream>

using namespace florr::server;
using namespace florr::server::test;
namespace {
std::string defaults() {std::ifstream f(FLORR_SOURCE_DIR "/server/config/default.json");std::ostringstream out;out<<f.rdbuf();return out.str();}
template<class F> bool rejects(F call) {try {call();return false;}catch(const std::invalid_argument&){return true;}}
std::string replace(std::string s,std::string_view from,std::string_view to) {const auto p=s.find(from);REQUIRE(p!=std::string::npos);s.replace(p,from.size(),to);return s;}
void strict_config() {
  const auto json=defaults();const auto config=parse_config(json);
#define CHECK_DEFAULT(name,value,min,max) REQUIRE(config.name==value); {auto c=config;c.name=0;REQUIRE(rejects([&]{validate_config(c);}));c=config;c.name=static_cast<std::uint32_t>(max)+1;REQUIRE(rejects([&]{validate_config(c);}));}
  FLORR_SERVER_NUMBERS(CHECK_DEFAULT)
#undef CHECK_DEFAULT
  REQUIRE(config.listenAddress=="127.0.0.1" && config.allowedOrigins.empty() && !config.allowMissingOrigin);
  for(const auto& bad:{replace(json,"\"tickMs\": 50","\"tickMs\": \"50\""),replace(json,"\"tickMs\": 50","\"tickMs\": 50.0"),
      replace(json,"\"tickMs\": 50","\"tickMs\": 050"),replace(json,"\"tickMs\": 50","\"tickMs\": -50"),
      replace(json,"\"tickMs\": 50","\"tickMs\": 50,\"tickMs\":50"),replace(json,"\"tickMs\": 50","\"tickMs\": 50,\"tick\\u004ds\":50"),
      replace(json,"\"tickMs\": 50","\"typo\": 50"),replace(json,"\"tickMs\": 50,",""),json+"x",std::string(65537,' '),
      replace(json,"\"perMessageCompression\": false","\"perMessageCompression\": true"),
      replace(json,"\"maxPendingHandshakes\": 16","\"maxPendingHandshakes\": 65"),
      replace(json,"\"allowedOrigins\": []","\"allowedOrigins\": [\"*\"]"),
      replace(json,"\"allowedOrigins\": []","\"allowedOrigins\": [\"https://ui.test/path\"]"),
      replace(json,"\"allowMissingOrigin\": false","\"allowMissingOrigin\": 0")}) REQUIRE(rejects([&]{(void)parse_config(bad);}));
  auto c=config;c.allowedOrigins={"https://ui.test","http://localhost:5173","https://[::1]:443"};validate_config(c);
  REQUIRE(allows_origin(c,"https://ui.test",true));REQUIRE(!allows_origin(c,"https://other.test",true));
  REQUIRE(!allows_origin(c,"",false));c.allowMissingOrigin=true;REQUIRE(allows_origin(c,"",false));
}
void fixed_clock_and_buckets() {
  FixedTickScheduler clock(0,50,4);unsigned count=0;
  for(unsigned now=0;now<=2000;++now)count+=clock.poll(now).ticks;
  REQUIRE(count==40 && clock.next()==2050);
  const auto lag=clock.poll(2500);REQUIRE(lag.ticks==4 && lag.discardedMs==300 && lag.overloaded);
  REQUIRE(clock.next()==2550 && clock.poll(2500).ticks==0);
  TokenBucket bucket(40,10,0);
  for(unsigned i=0;i<10;++i)REQUIRE(bucket.consume(0));
  REQUIRE(!bucket.consume(0));REQUIRE(bucket.consume(25));REQUIRE(!bucket.consume(25));REQUIRE(bucket.consume(1000));
}
void admission_capacity_and_no_hello_side_effect() {
  Harness h;Recorder a,b,c,d,e;
  h.join(a,1);REQUIRE(!h.rooms.find("room"));a.session->deactivate();h.step();REQUIRE(!h.rooms.find("room"));
  h.join(b,2);h.join(c,3);h.step();REQUIRE(h.world().players().size()==2);
  REQUIRE(b.last<wire::Welcome>().playerId!=c.last<wire::Welcome>().playerId);
  b.session->deactivate();h.step();h.join(d,4);h.step();REQUIRE(d.errors.back()==wire::ErrorCode::RoomFull);
  h.join(e,5,hello("other"));h.step();REQUIRE(h.metrics.rooms==2);
  Recorder full;h.join(full,6,hello("third"));h.step();REQUIRE(full.errors.back()==wire::ErrorCode::RoomFull);
  h.rooms.overloaded(true);REQUIRE(!h.rooms.ready());Recorder refused;h.join(refused,7);REQUIRE(!refused.errors.empty());h.rooms.overloaded(false);
  auto wrong=hello();wrong.catalogHash=std::string(64,'0');Recorder bad;h.join(bad,8,wrong);REQUIRE(bad.errors.back()==wire::ErrorCode::Catalog);
  h.rooms.stop();REQUIRE(h.metrics.rooms==0 && h.metrics.players==0);
}
void independent_sequences_latest_input_and_ttl() {
  Harness h;Recorder a,b;h.join(a,1);h.join(b,2);h.step();h.spawn(a);h.spawn(b);h.step();
  const auto start=h.world().tick();
  for(unsigned i=1;i<=10;++i)a.receive(wire::Input{i,1,static_cast<std::uint32_t>(start),1,0,static_cast<float>(i)},h.now);
  b.receive(wire::Input{1,1,static_cast<std::uint32_t>(start),2,3.14F,200},h.now);
  REQUIRE(h.world().tick()==start);h.step();
  REQUIRE(a.last<wire::Snapshot>().lastAppliedInputSeq==10 && b.last<wire::Snapshot>().lastAppliedInputSeq==1);
  REQUIRE(a.last<wire::Snapshot>().inputAppliedTick==start && a.last<wire::Snapshot>().selfState.strength==10);
  h.step(3);REQUIRE(!a.last<wire::Snapshot>().selfState.inputNeutral);h.step();
  REQUIRE(a.last<wire::Snapshot>().selfState.inputNeutral && b.last<wire::Snapshot>().selfState.inputNeutral);
  REQUIRE(h.world().tick()==start+5);
}
void commands_bounded_idempotent_and_old_life() {
  Harness h;Recorder a;h.join(a,1);h.step();
  for(unsigned seq=1;seq<=8;++seq)a.receive(command(seq,wire::CommandKind::Spawn),h.now);
  h.step();REQUIRE(a.count<wire::CommandResult>()==4);REQUIRE(a.last<wire::Snapshot>().selfState.lifeEpoch==1);
  h.step();REQUIRE(a.count<wire::CommandResult>()==8 && a.last<wire::CommandResult>().code==wire::ResultCode::StaleLife);
  a.receive(command(1,wire::CommandKind::Spawn),h.now);REQUIRE(a.last<wire::CommandResult>().code==wire::ResultCode::Ok);
  REQUIRE(h.world().players().size()==1 && a.last<wire::Snapshot>().selfState.lifeEpoch==1);
  a.receive(command(9,wire::CommandKind::Suicide,1),h.now);h.step();
  a.receive(command(10,wire::CommandKind::Spawn,1),h.now);h.step();REQUIRE(a.last<wire::CommandResult>().code==wire::ResultCode::Cooldown);
  const auto spawnAt=a.last<wire::CommandResult>().nextSpawnTick;REQUIRE(spawnAt);
  while(h.world().tick()<*spawnAt)h.step();
  h.spawn(a,11,1);h.step();REQUIRE(a.last<wire::Snapshot>().selfState.lifeEpoch==2);
}
void rates_and_chat_sender() {
  Harness h;Recorder a,b;h.join(a,1);h.join(b,2);h.step();h.spawn(a);h.spawn(b);h.step();
  auto chat=command(2,wire::CommandKind::Chat);chat.text="hello";a.receive(chat,h.now);h.step();
  const auto& events=b.last<wire::Snapshot>().events;REQUIRE(events.size()==1 && events.front().actorPlayerId==a.last<wire::Welcome>().playerId);
  const auto tick=h.world().tick();
  for(unsigned i=1;i<=13;++i)a.receive(wire::Input{i,1,static_cast<std::uint32_t>(tick),0,0,1},h.now);
  REQUIRE(!a.session->active() && b.session->active() && h.world().tick()==tick);
  b.receive(wire::Input{1,1,static_cast<std::uint32_t>(tick),0,0,2},h.now);h.step();
  REQUIRE(b.last<wire::Snapshot>().lastAppliedInputSeq==1 && h.metrics.rateRejected==3);
}
void resume_rotation_race_and_late_callback() {
  Harness h;Recorder a,b,race;h.join(a,1);h.step();h.spawn(a);h.step();const auto old=a.last<wire::Welcome>();
  auto resume=hello();resume.resumeToken=old.resumeToken;h.join(b,2,resume);h.join(race,3,resume);h.step();
  const auto welcome=b.last<wire::Welcome>();
  REQUIRE(welcome.playerId==old.playerId && welcome.sessionEpoch!=old.sessionEpoch && welcome.resumeToken!=old.resumeToken);
  REQUIRE(!a.session->active() && !race.errors.empty() && h.world().players().size()==1);
  const auto& snap=b.last<wire::Snapshot>();REQUIRE(snap.full && snap.snapshotSeq==1 && snap.controlledHandle);
  a.session->receive({old.sessionEpoch,wire::Input{1,1,0,3,0,200}},h.now);h.step();REQUIRE(b.last<wire::Snapshot>().lastAppliedInputSeq==0);
  auto wrongRoom=resume;wrongRoom.roomId="other";Recorder cross;h.join(cross,4,wrongRoom);h.step();REQUIRE(!cross.errors.empty() && !h.rooms.find("other"));
}
void disconnected_death_and_full_resume() {
  Harness h;Recorder a,b;h.join(a,1);h.step();h.spawn(a);h.step();
  auto resume=hello();resume.resumeToken=a.last<wire::Welcome>().resumeToken;
  a.session->deactivate();h.step();
  // Test-only domain fixture at a room boundary: a disconnected body remains
  // damageable. No transport or production debug endpoint performs injection.
  auto& world=const_cast<engine::World&>(h.world());const auto id=engine::PlayerId{a.last<wire::Welcome>().playerId};
  engine::kill_entity(world,world.players().get(id)->player(),{});const auto death=world.players().get(id)->death;
  REQUIRE(world.players().get(id)->life==engine::PlayerLife::kCorpse);
  h.step(22);h.join(b,2,resume);h.step();
  const auto& restored=b.last<wire::Snapshot>();REQUIRE(restored.full && !restored.controlledHandle && restored.selfState.lifeEpoch==1);
  REQUIRE(restored.selfState.deathScore==death.score.value && restored.selfState.cameraX==death.position.x.value);
}
void leave_grace_cleanup_and_room_recreation() {
  Harness h;h.config.reconnectGraceTicks=5;h.config.emptyRoomTtlTicks=3;
  Recorder a;h.join(a,1);h.step();h.spawn(a);h.step();const auto welcome=a.last<wire::Welcome>();
  a.receive(command(2,wire::CommandKind::Leave),h.now);
  REQUIRE(a.session->leaving());a.receive(wire::Input{1,1,2,3,0,200},h.now);h.step();
  REQUIRE(h.world().players().size()==1 && !a.session->active());
  h.step(4);REQUIRE(h.world().players().size()==1);h.step();REQUIRE(h.world().players().size()==0);
  REQUIRE(h.world().entities().active_count()==0 && h.metrics.leaves==1);h.step(3);REQUIRE(!h.rooms.find("room"));
  Recorder invalid;auto resume=hello();resume.resumeToken=welcome.resumeToken;h.join(invalid,2,resume);h.step();REQUIRE(!invalid.errors.empty());
  Recorder fresh;h.join(fresh,3);h.step();REQUIRE(fresh.last<wire::Welcome>().roomEpoch!=welcome.roomEpoch);
}
void room_rng_and_event_isolation() {
  Harness h,reference;Recorder a,b,c;h.join(a,1,hello("a"));h.join(b,2,hello("b"));reference.join(c,1,hello("b"));h.step();reference.step();
  h.spawn(a);h.spawn(b);reference.spawn(c);h.step();reference.step();
  auto chat=command(2,wire::CommandKind::Chat);chat.text="only-a";a.receive(chat,h.now);
  for(unsigned i=0;i<12;++i) {h.step();reference.step();}
  REQUIRE(h.world("b").random().state()==reference.world("b").random().state());
  REQUIRE(h.world("b").rng_draws()==reference.world("b").rng_draws());
  REQUIRE(h.world("b").rng().state()==reference.world("b").rng().state());
  REQUIRE(b.last<wire::Snapshot>().events.empty());
  const auto tick=h.world("b").tick();a.session->deactivate();h.step();REQUIRE(h.world("b").tick()==tick+1 && b.session->active());
}
void heartbeat_wall_clock_and_invalid_epoch() {
  Harness h;Recorder a;h.join(a,1);h.step();const auto epoch=a.session->epoch();
  a.session->poll(h.now+5000);REQUIRE(a.count<wire::Ping>()==1);const auto ping=a.last<wire::Ping>();
  a.receive(wire::Pong{ping.nonce+1,ping.serverTick,ping.monotonicMs},h.now+5001);
  a.session->poll(h.now+19999);REQUIRE(a.session->active());a.session->poll(h.now+20000);REQUIRE(!a.session->active());
  Recorder b;h.join(b,2);h.step();b.session->poll(h.now+5000);const auto valid=b.last<wire::Ping>();
  b.receive(wire::Pong{valid.nonce,valid.serverTick,valid.monotonicMs},h.now+5001);
  b.session->poll(h.now+20000);REQUIRE(b.session->active());
  b.session->receive({epoch,wire::Ping{1,0,0}},h.now+20001);REQUIRE(!b.session->active());
}
void no_observers_still_advance_and_default_grace() {
  Harness h;Recorder a;h.join(a,1);h.step();h.spawn(a);h.step();a.session->deactivate();
  const auto tick=h.world().tick();h.step(200);REQUIRE(h.world().tick()==tick+200 && h.world().players().size()==1);
  h.step();REQUIRE(h.world().players().size()==0);
}
void exact_grace_admission_and_counter_drain() {
  Harness h;h.config.initialMaxPlayersPerRoom=1;h.config.reconnectGraceTicks=2;
  Recorder a,b;h.join(a,1);h.step();a.session->deactivate();h.step(2);
  // The next boundary expires A before deciding whether B fits.
  h.join(b,2);h.step();REQUIRE(b.session->bound() && h.world().players().size()==1);
  b.session->peer()->replication.snapshotSeq=wire::kCounterDrainAt-2;
  const auto oldRoom=b.last<wire::Welcome>().roomEpoch;h.step();REQUIRE(!h.rooms.find("room") && !b.session->active());
  Recorder c;h.join(c,3);h.step();REQUIRE(c.last<wire::Welcome>().roomEpoch!=oldRoom);
}
}
int main() {
  const std::pair<const char*,void(*)()> tests[]={
    {"strict_config",strict_config},{"fixed_clock_and_buckets",fixed_clock_and_buckets},
    {"admission_capacity_and_no_hello_side_effect",admission_capacity_and_no_hello_side_effect},
    {"independent_sequences_latest_input_and_ttl",independent_sequences_latest_input_and_ttl},
    {"commands_bounded_idempotent_and_old_life",commands_bounded_idempotent_and_old_life},
    {"rates_and_chat_sender",rates_and_chat_sender},{"resume_rotation_race_and_late_callback",resume_rotation_race_and_late_callback},
    {"disconnected_death_and_full_resume",disconnected_death_and_full_resume},{"leave_grace_cleanup_and_room_recreation",leave_grace_cleanup_and_room_recreation},
    {"room_rng_and_event_isolation",room_rng_and_event_isolation},{"heartbeat_wall_clock_and_invalid_epoch",heartbeat_wall_clock_and_invalid_epoch},
    {"no_observers_still_advance_and_default_grace",no_observers_still_advance_and_default_grace},
    {"exact_grace_admission_and_counter_drain",exact_grace_admission_and_counter_drain}};
  unsigned index=0;for(const auto& [name,run]:tests){run();std::cout<<"ok "<<++index<<" - "<<name<<'\n';}
  std::cout<<"1.."<<index<<'\n';
}
