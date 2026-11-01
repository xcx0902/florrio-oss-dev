#include "network_support.hpp"
#include <sys/wait.h>
#include <sys/stat.h>
#include <fcntl.h>
#include <unistd.h>
#include <csignal>
#include <fstream>
#include <sstream>
#include <charconv>

using namespace florr::server;using namespace florr::server::test;
namespace {
pid_t liveChild=0;
void run_signal(const char* server,int signal) {
  // A real exec of the production binary exercises signal_set and CLI/config,
  // separately from the in-process transport and fake-clock tests.
  char directory[]="/tmp/florr-m05-process-XXXXXX";REQUIRE(::mkdtemp(directory));
  const std::string configPath=std::string(directory)+"/config.json",logPath=std::string(directory)+"/server.log";
  std::ifstream input(FLORR_SOURCE_DIR "/server/config/default.json");std::ostringstream contents;contents<<input.rdbuf();auto config=contents.str();
  asio::io_context io;tcp::acceptor probe(io,{asio::ip::make_address("127.0.0.1"),0});const auto port=probe.local_endpoint().port();probe.close();
  auto replace=[&](std::string_view from,std::string to){const auto at=config.find(from);REQUIRE(at!=std::string::npos);config.replace(at,from.size(),to);};
  replace("\"listenPort\": 8787","\"listenPort\": "+std::to_string(port));replace("\"allowMissingOrigin\": false","\"allowMissingOrigin\": true");
  replace("\"shutdownDrainMs\": 5000","\"shutdownDrainMs\": 100");
  {std::ofstream out(configPath);out<<config;}
  const auto child=::fork();REQUIRE(child>=0);
  if(child==0) {
    const auto log=::open(logPath.c_str(),O_WRONLY|O_CREAT|O_TRUNC,0600);if(log<0)_exit(127);
    (void)::dup2(log,STDOUT_FILENO);(void)::dup2(log,STDERR_FILENO);::close(log);
    ::execl(server,server,"--config",configPath.c_str(),static_cast<char*>(nullptr));_exit(127);
  }
  liveChild=child;
  struct Guard {pid_t child;~Guard(){if(child>0){::kill(child,SIGKILL);::waitpid(child,nullptr,0);}}}guard{child};
  bool started=false;
  for(unsigned attempt=0;attempt<200;++attempt) {
    std::ifstream log(logPath);std::ostringstream text;text<<log.rdbuf();if(text.str().find("\"event\":\"started\"")!=std::string::npos){started=true;break;}
    std::this_thread::sleep_for(std::chrono::milliseconds(5));
  }
  REQUIRE(started);REQUIRE(request(port,"/readyz").result()==http::status::ok);Client a(port),b(port);a.join();b.join();
  REQUIRE(a.welcome.playerId!=b.welcome.playerId);a.spawn();b.spawn();
  REQUIRE(::kill(child,signal)==0);REQUIRE(a.next<wire::Error>().code==wire::ErrorCode::Stopping);a.drain_close();
  int status=0;bool exited=false;
  for(unsigned attempt=0;attempt<200;++attempt) {
    if(::waitpid(child,&status,WNOHANG)==child){exited=true;guard.child=0;liveChild=0;break;}
    std::this_thread::sleep_for(std::chrono::milliseconds(5));
  }
  REQUIRE(exited && WIFEXITED(status) && WEXITSTATUS(status)==0);
  std::ifstream log(logPath);std::ostringstream output;output<<log.rdbuf();const auto text=output.str();
  REQUIRE(text.find("\"protocol\":2")!=std::string::npos && text.find("\"build\":\"")!=std::string::npos);
  REQUIRE(text.find("\"event\":\"stopped\"")!=std::string::npos && text.find("\"connections\":0")!=std::string::npos);
  auto counter=[&](std::string_view name) {
    const auto key="\""+std::string(name)+"\":";const auto at=text.find(key);REQUIRE(at!=std::string::npos);
    std::uint64_t value=0;const auto [end,error]=std::from_chars(text.data()+at+key.size(),text.data()+text.size(),value);
    (void)end;REQUIRE(error==std::errc{});return value;
  };
  REQUIRE(counter("teardowns")>=3 && counter("teardowns")==counter("accepted") && counter("players")==0);
  REQUIRE(text.find("resumeToken")==std::string::npos && text.find(directory)==std::string::npos);
  ::unlink(configPath.c_str());::unlink(logPath.c_str());::rmdir(directory);
}
}
int main(int argc,char** argv) {
  REQUIRE(argc==2);
  std::atexit([]{if(liveChild>0){::kill(liveChild,SIGKILL);::waitpid(liveChild,nullptr,0);}});
  run_signal(argv[1],SIGTERM);std::cout<<"ok 1 - production exec, dual sockets, SIGTERM and bounded drain\n";
  run_signal(argv[1],SIGINT);std::cout<<"ok 2 - production exec, dual sockets, SIGINT and bounded drain\n1..2\n";
}
