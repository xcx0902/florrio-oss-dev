#include "florr/server/metrics.hpp"
#include <sstream>
namespace florr::server {
std::string Metrics::json() const {
  std::ostringstream o;
  o<<"{\"connections\":"<<connections<<",\"pending\":"<<pending<<",\"rooms\":"<<rooms<<",\"players\":"<<players
   <<",\"accepted\":"<<accepted<<",\"rejected\":"<<rejected<<",\"teardowns\":"<<teardowns<<",\"joins\":"<<joins
   <<",\"resumes\":"<<resumes<<",\"leaves\":"<<leaves<<",\"ticks\":"<<ticks<<",\"overloads\":"<<overloads
   <<",\"discardedWallMs\":"<<discardedWallMs<<",\"rateRejected\":"<<rateRejected<<",\"bytesSent\":"<<bytesSent
   <<",\"maxTickMicros\":"<<maxTickMicros<<",\"closed\":{";
  constexpr const char* labels[]={"NORMAL","HTTP","TIMEOUT","READ","WRITE","PROTOCOL","SLOW_CONSUMER","STOPPING"};
  for(std::size_t i=0;i<closed.size();++i) {if(i)o<<',';o<<'"'<<labels[i]<<"\":"<<closed[i];}
  o<<"}}";return o.str();
}
} // namespace florr::server
