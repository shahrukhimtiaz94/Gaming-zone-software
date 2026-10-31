#Requires -Version 5.1
#Requires -RunAsAdministrator
param(
 [Parameter(Mandatory=$true)][uri]$Server,
 [Parameter(Mandatory=$true)][ValidateRange(1,2147483647)][int]$Device
)
$ErrorActionPreference='Stop'
if (-not [Environment]::Is64BitProcess) { throw '64-bit Windows PowerShell as Administrator use karein.' }
if ($Server.Scheme -ne 'https' -or $Server.Query -or $Server.Fragment -or $Server.UserInfo -or $Server.AbsolutePath -ne '/') { throw 'HTTPS origin chahiye, e.g. https://zone.example.com (no path).' }
$dest=Join-Path $env:ProgramData 'NexusZone'
$account='NexusPlayer'
if ((Test-Path $dest) -or (Get-LocalUser -Name $account -ErrorAction SilentlyContinue) -or (Get-ScheduledTask -TaskName 'NexusZoneAgent' -ErrorAction SilentlyContinue)) { throw 'Existing installation/account mila; overwrite nahi hoga. README recovery steps dekhein.' }
$keySecure=Read-Host 'Dashboard se PC ki private device key' -AsSecureString
$bstr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($keySecure)
try { $key=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
if ($key -notmatch '^[a-f0-9]{64}$') { throw 'Invalid key format.' }
# Verify the key and PC mapping before changing local Windows accounts.
[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12
$reply=Invoke-RestMethod -Uri ($Server.AbsoluteUri.TrimEnd('/')+'/api/agent/poll') -Method Post -Headers @{Authorization=('Bearer '+$key)} -ContentType 'application/json' -Body '{"state":"blocked","version":"installer-preflight"}' -TimeoutSec 10
if ([int]$reply.device -ne $Device) { throw 'Key doosray PC ki hai.' }
$password=Read-Host 'Naye NexusPlayer standard account ka password' -AsSecureString
New-Item -ItemType Directory -Path $dest | Out-Null
# Secrets and executable scripts writable/readable only by Administrators and SYSTEM.
& icacls.exe $dest /inheritance:r /grant:r '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Folder permissions set nahi huin.' }
$user=New-LocalUser -Name $account -Password $password -Description 'Nexus dedicated gaming account' -AccountNeverExpires -PasswordNeverExpires -UserMayNotChangePassword -Disabled
Add-LocalGroupMember -SID 'S-1-5-32-545' -Member $user
Copy-Item (Join-Path $PSScriptRoot 'Agent.ps1') (Join-Path $dest 'Agent.ps1')
Copy-Item (Join-Path $PSScriptRoot 'Lease.ps1') (Join-Path $dest 'Lease.ps1')
@{server=$Server.AbsoluteUri.TrimEnd('/');device=$Device;key=$key;accountName=$account;accountSid=$user.SID.Value} | ConvertTo-Json | Set-Content (Join-Path $dest 'config.json') -Encoding UTF8
$key=$null
$ps=Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
# RemoteSigned retains script policy; reviewed downloaded scripts may require Unblock-File.
$action=New-ScheduledTaskAction -Execute $ps -Argument ('-NoProfile -NonInteractive -ExecutionPolicy RemoteSigned -File "'+$dest+'\Agent.ps1"')
$trigger=New-ScheduledTaskTrigger -AtStartup
$principal=New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
$settings=New-ScheduledTaskSettingsSet -StartWhenAvailable -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName 'NexusZoneAgent' -Action $action -Trigger $trigger -Principal $principal -Settings $settings | Out-Null
Start-ScheduledTask -TaskName 'NexusZoneAgent'
Write-Host 'Installed. Dedicated account NexusPlayer hai. Windows acceptance tests complete kiye baghair unattended use na karein.'
