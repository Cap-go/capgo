#!/usr/bin/perl
# Minimal HTTP server (perl-base only) for the control Worker:
# GET /health -> output of health.sh as JSON.
use strict;
use warnings;
use IO::Socket::INET;

# A client that disconnects mid-response must not kill the server.
$SIG{PIPE} = 'IGNORE';

my $server = IO::Socket::INET->new(LocalPort => 8080, Listen => 16, ReuseAddr => 1, Proto => 'tcp')
  or die "health server listen: $!";
while (my $client = $server->accept) {
  # Bound each request so one stalled client or psql cannot block later ones.
  eval {
    local $SIG{ALRM} = sub { die "timeout\n" };
    alarm 10;
    my $request = <$client> // '';
    while (my $header = <$client>) { last if $header =~ /^\r?\n$/ }
    my ($path) = $request =~ m{^\S+\s+(\S+)};
    my ($status, $body) = ('404 Not Found', '{"error":"not found"}');
    if (defined $path && $path =~ m{^/(health|ping)\b}) {
      $body = `timeout 8 /opt/capgo/health.sh`;
      $body = '{"error":"health check timed out"}' if $body eq '';
      $status = '200 OK';
    }
    print $client "HTTP/1.1 $status\r\nContent-Type: application/json\r\nContent-Length: " . length($body)
      . "\r\nConnection: close\r\n\r\n$body";
    alarm 0;
  };
  alarm 0;
  close $client;
}
