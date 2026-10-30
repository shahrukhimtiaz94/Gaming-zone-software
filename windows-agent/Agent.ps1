# Windows PowerShell 5.1 x64. Run only through the installed SYSTEM task.
# Controls only the dedicated account SID pinned by Install.ps1.
#Requires -Version 5.1
#Requires -RunAsAdministrator
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
. (Join-Path $PSScriptRoot 'Lease.ps1')
$config = Get-Content (Join-Path $PSScriptRoot 'config.json') -Raw | ConvertFrom-Json
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class ZoneSessions {
 [StructLayout(LayoutKind.Sequential)] public struct Session { public int Id; public IntPtr Station; public int State; }
 [DllImport("wtsapi32.dll", SetLastError=true)] public static extern bool WTSEnumerateSessions(IntPtr server,int reserved,int version,out IntPtr sessions,out int count);
 [DllImport("wtsapi32.dll", CharSet=CharSet.Unicode, SetLastError=true)] public static extern bool WTSQuerySessionInformation(IntPtr server,int id,int kind,out IntPtr buffer,out int bytes);
 [DllImport("wtsapi32.dll",SetLastError=true)] public static extern bool WTSDisconnectSession(IntPtr server,int id,bool wait);
 [DllImport("wtsapi32.dll")] public static extern void WTSFreeMemory(IntPtr buffer);
}
'@
function Get-Account {
 $account = Get-LocalUser -SID $config.accountSid
 if ($account.Name -ne $config.accountName) { throw 'Pinned account renamed; operator review required.' }
 $admins = Get-LocalGroupMember -SID 'S-1-5-32-544'
 if ($admins.SID.Value -contains $account.SID.Value) { throw 'Gaming account must not be administrator.' }
 return $account
}
function Block-Account {
 # Prevent re-login, then disconnect the interactive session without logging off.
 # Never fall back to logoff/kill: the game processes must stay alive.
 Disable-LocalUser -SID $config.accountSid
 $ptr = [IntPtr]::Zero; $count = 0
 if (-not [ZoneSessions]::WTSEnumerateSessions([IntPtr]::Zero,0,1,[ref]$ptr,[ref]$count)) { throw 'Cannot enumerate Windows sessions.' }
 try {
  $size = [Runtime.InteropServices.Marshal]::SizeOf([type][ZoneSessions+Session])
  for ($i=0; $i -lt $count; $i++) {
   $s = [Runtime.InteropServices.Marshal]::PtrToStructure([IntPtr]::Add($ptr,$i*$size),[type][ZoneSessions+Session])
   $buf = [IntPtr]::Zero; $bytes = 0
   if (-not [ZoneSessions]::WTSQuerySessionInformation([IntPtr]::Zero,$s.Id,5,[ref]$buf,[ref]$bytes)) { continue }
   try { $name = [Runtime.InteropServices.Marshal]::PtrToStringUni($buf) } finally { [ZoneSessions]::WTSFreeMemory($buf) }
   if ($name -ine $config.accountName) { continue }
   # Verify domain as well: do not disconnect a domain user with the same name.
   $buf = [IntPtr]::Zero; $bytes = 0
   if (-not [ZoneSessions]::WTSQuerySessionInformation([IntPtr]::Zero,$s.Id,7,[ref]$buf,[ref]$bytes)) { throw 'Cannot verify session domain.' }
   try { $domain = [Runtime.InteropServices.Marshal]::PtrToStringUni($buf) } finally { [ZoneSessions]::WTSFreeMemory($buf) }
   if ($domain -ieq $env:COMPUTERNAME) {
    # WTSDisconnected (4) already has no interactive access; preserve all processes.
    if ($s.State -ne 4 -and -not [ZoneSessions]::WTSDisconnectSession([IntPtr]::Zero,$s.Id,$false)) { throw 'Disconnect failed; Windows edition/configuration must be checked.' }
   }
  }
 } finally { [ZoneSessions]::WTSFreeMemory($ptr) }
}
# Network I/O is asynchronous: a stalled DNS/TLS/HTTP operation must not hold up expiry.
Add-Type -AssemblyName System.Net.Http
$handler = New-Object System.Net.Http.HttpClientHandler
$handler.AllowAutoRedirect = $false
$client = New-Object System.Net.Http.HttpClient($handler)
$client.Timeout = [TimeSpan]::FromSeconds(3)
$client.MaxResponseContentBufferSize = 65536
$client.DefaultRequestHeaders.Authorization = New-Object System.Net.Http.Headers.AuthenticationHeaderValue('Bearer', $config.key)
$null = Get-Account
Block-Account
$state = 'blocked'
$clock = [Diagnostics.Stopwatch]::StartNew()
$lease = New-NexusLease
$nextPoll = 0.0
$pending = $null
$content = $null
$warned = $false
try {
 while ($true) {
  # This path runs independently of whether any network request has completed.
  if (Test-NexusLeaseExpired $lease $clock.Elapsed.TotalMilliseconds) {
   try { Block-Account; $state='blocked' } catch { $state='error' }
  }
  if ($null -ne $pending -and $pending.IsCompleted) {
   $response = $null
   try {
    # GetResult does not wait here: IsCompleted is true and PostAsync buffers response content.
    $response = $pending.GetAwaiter().GetResult()
    if ([int]$response.StatusCode -in @(401,403)) {
     Clear-NexusLease $lease
     Block-Account; $state='blocked'
    } elseif ($response.IsSuccessStatusCode) {
     $reply = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult() | ConvertFrom-Json
     Set-NexusLease $lease $reply $config.device $sentAt $clock.Elapsed.TotalMilliseconds
     if (-not (Test-NexusLeaseExpired $lease $clock.Elapsed.TotalMilliseconds)) {
      try {
       $null = Get-Account
       Enable-LocalUser -SID $config.accountSid
       $state='enabled'
      } catch {
       Clear-NexusLease $lease
       $state='error'
       throw
      }
      if ($lease.Deadline-$clock.Elapsed.TotalMilliseconds -gt 300000) { $warned=$false }
     } else { Block-Account; $state='blocked'; $warned=$false }
    }
    # 5xx and other non-success responses never renew an existing deadline.
   } catch {
    # Failed transport retains only the previous approval, never extends it.
    # Invalid parsed grants clear the lease in Set-NexusLease. Native failures report error.
    if (Test-NexusLeaseExpired $lease $clock.Elapsed.TotalMilliseconds) {
     try { Block-Account; $state='blocked' } catch { $state='error' }
    }
   } finally {
    if ($null -ne $response) { $response.Dispose() }
    $content.Dispose(); $content=$null; $pending=$null
    $nextPoll=$clock.Elapsed.TotalMilliseconds+5000
   }
  }
  if ($null -eq $pending -and $clock.Elapsed.TotalMilliseconds -ge $nextPoll) {
   $sentAt=$clock.Elapsed.TotalMilliseconds
   $json=@{state=$state;version='0.3.0-win10-x64';sessionId=$lease.SessionId;sessionEnd=$lease.SessionEnd} | ConvertTo-Json -Compress
   $content=New-Object System.Net.Http.StringContent($json,[Text.Encoding]::UTF8,'application/json')
   $pending=$client.PostAsync(($config.server.TrimEnd('/')+'/api/agent/poll'),$content)
  }
  if (-not (Test-NexusLeaseExpired $lease $clock.Elapsed.TotalMilliseconds) -and $lease.Deadline-$clock.Elapsed.TotalMilliseconds -le 300000 -and -not $warned) {
   # Advisory only. Start asynchronously, so messaging cannot hold up local expiry.
   Start-Process -FilePath "$env:SystemRoot\System32\msg.exe" -ArgumentList @($config.accountName, '/TIME:30', '"Gaming session: 5 minutes ya kam baqi. Time barhane ke liye staff se kahein; expiry par access lock hoga."') -WindowStyle Hidden -ErrorAction SilentlyContinue
   $warned=$true
  }
  Start-Sleep -Milliseconds 500
 }
} finally {
 $client.Dispose()
 if ($null -ne $content) { $content.Dispose() }
 Block-Account
}
