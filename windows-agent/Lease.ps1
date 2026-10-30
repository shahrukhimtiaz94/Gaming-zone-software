# Pure session timer policy shared by the agent and its offline tests.
# All times here are milliseconds from the same monotonic Stopwatch, not wall time.
function New-NexusLease {
 return @{ Deadline=0.0; SessionId=$null; SessionEnd=$null }
}
function Clear-NexusLease($Lease) {
 $Lease.Deadline=0.0; $Lease.SessionId=$null; $Lease.SessionEnd=$null
}
function Test-NexusLeaseExpired($Lease, [double]$Elapsed) {
 return $Elapsed -ge $Lease.Deadline
}
function Set-NexusLease($Lease, $Reply, [int]$Device, [double]$SentAt, [double]$Elapsed) {
 # A malformed authenticated response is not an unlock grant.
 Clear-NexusLease $Lease
 if ([int]$Reply.device -ne $Device) { throw 'Device mismatch' }
 if ($null -eq $Reply.session) { return }
 $remaining=[double]$Reply.session.remainingMs
 if ([double]::IsNaN($remaining) -or [double]::IsInfinity($remaining) -or $remaining -le 0 -or $remaining -gt 43200000 -or [long]$Reply.session.id -le 0 -or [long]$Reply.session.end -le 0) { throw 'Invalid session grant' }
 # Count the entire request latency against the grant, conservatively.
 $deadline=$SentAt+$remaining
 if ($deadline -le $Elapsed) { return }
 $Lease.Deadline=$deadline
 $Lease.SessionId=[long]$Reply.session.id
 $Lease.SessionEnd=[long]$Reply.session.end
}
