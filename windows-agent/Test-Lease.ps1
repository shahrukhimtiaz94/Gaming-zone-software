# Cross-platform timer policy tests; native Windows enforcement still needs a real PC.
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'Lease.ps1')
function Assert($condition,$message) { if (-not $condition) { throw $message } }
$lease=New-NexusLease
Assert (Test-NexusLeaseExpired $lease 0) 'Startup must be blocked'
$reply=@{device=5;session=@{id=10;end=1900000000000;remainingMs=3600000}}
Set-NexusLease $lease $reply 5 100 250
Assert ($lease.Deadline -eq 3600100) 'Network latency must not add free time'
Assert (-not (Test-NexusLeaseExpired $lease 3599999)) 'Existing grant survives loss of network before expiry'
# No network responses arrive. Local elapsed time alone must enforce the deadline.
Assert (Test-NexusLeaseExpired $lease 3600100) 'Offline grant must expire at its exact deadline'
Assert (Test-NexusLeaseExpired $lease 7200100) 'Offline grant must not renew itself'
# An approved extension received before expiry updates deadline and acknowledgement.
$reply.session.remainingMs=7200000; $reply.session.end=1900003600000
Set-NexusLease $lease $reply 5 300000 300100
Assert ($lease.Deadline -eq 7500000) 'Extension must update the local approved deadline'
Assert ($lease.SessionEnd -eq 1900003600000) 'Agent must acknowledge exact approved end'
Clear-NexusLease $lease
Assert (Test-NexusLeaseExpired $lease 300100) 'Revocation must block immediately on receipt'
$reply.session.remainingMs=50
Set-NexusLease $lease $reply 5 100 200
Assert (Test-NexusLeaseExpired $lease 200) 'Grant already expired in transit must not enable access'
$reply.session.remainingMs=3600000
try { Set-NexusLease $lease $reply 6 100 200; throw 'Expected device mismatch' } catch { Assert ($_.Exception.Message -eq 'Device mismatch') 'Wrong PC must be rejected' }
Assert (Test-NexusLeaseExpired $lease 200) 'Mismatched response must clear old approval'
foreach($bad in @(-1,0,43200001,[double]::NaN,[double]::PositiveInfinity)) {
 $reply.session.remainingMs=$bad
 $rejected=$false
 try { Set-NexusLease $lease $reply 5 100 200 } catch { $rejected=$true }
 Assert $rejected 'Invalid grant must be rejected'
 Assert (Test-NexusLeaseExpired $lease 200) 'Invalid grant must leave agent blocked'
}
Set-NexusLease $lease @{device=5;session=$null} 5 100 200
Assert (Test-NexusLeaseExpired $lease 200) 'No approved session must leave agent blocked'
Write-Host 'PASS: offline expiry, extension, revocation, transit expiry, invalid grants and device isolation'
