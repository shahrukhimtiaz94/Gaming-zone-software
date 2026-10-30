# Windows 10 x64 agent — experimental, hardware validation required

This is a Windows PowerShell 5.1 **SYSTEM scheduled task**, not a compiled Windows service or seamless lock-screen application. It enables the dedicated local `NexusPlayer` standard account only while the server reports an approved session. On expiry or early stop it disables that account and disconnects its Windows session **without signing out or killing games**. The existing desktop/processes are intended to remain running. After an approved extension is received, sign in again to reconnect to that account. Actual game preservation and blocked re-login must be verified on your Windows edition; some games exit or disconnect on session switch. No game pause or save is performed. It never logs the user in automatically and never knows/stores their Windows password.

**No Windows machine is available in this cloud workspace. Installation, native API calls, boot behaviour and actual gaming must pass the checklist below before real customer use.** Backend integration tests do not validate Windows enforcement.

## Connect one test PC first

1. Host the Node dashboard behind a valid HTTPS endpoint reachable by the gaming PC. Certificates must be trusted by Windows/SYSTEM. Do not turn off TLS verification or expose port 3000 publicly. Server hosting and DNS are separate setup work.
2. On the dashboard log in as owner, go to Team, select PC 1 and generate a device key. Keep it private; it grants that PC polling access only. Re-generating rotates the key. The server stores only its SHA-256 hash.
3. Copy this `windows-agent` folder to the Windows PC. Review the installer, Agent.ps1 and Lease.ps1. Use **64-bit Windows PowerShell as Administrator**, not x86. If files were marked as downloaded, unblock only these reviewed files with `Unblock-File .\Install.ps1` and `Unblock-File .\Agent.ps1`. Domain policy/signing requirements must still be satisfied; do not bypass organizational execution policy.
4. Run, substituting your actual server hostname:

   ```powershell
   .\Install.ps1 -Server https://zone.example.com -Device 1
   ```

5. Enter the PC key at the secure prompt, then choose a password for the new `NexusPlayer` account. The installer refuses to overwrite an existing account/install. It creates a disabled standard user, protects `%ProgramData%\NexusZone` with SYSTEM/Administrators-only ACLs, and registers `NexusZoneAgent` as a SYSTEM startup task. Do not give customers the administrator account or its password.
6. Check Task Scheduler and dashboard status. Approve a short booking. On Windows choose `NexusPlayer` and enter its password. Approval enables sign-in; **it does not open the desktop automatically**. Repeat for PC 2 through PC 10 with a different key on each machine.

The dashboard can create a timed booking even when an agent is offline. That is not proof of physical access. Check the agent's state before seating the player. Installer preflight briefly reports `blocked` before installation finishes; wait for version `0.3.0-win10-x64`.

## Operating behaviour

- Agent polls every 5 seconds and reports `blocked`, `enabled` or `error`. Dashboard marks it offline after 20 seconds without a poll. Reports are claims from the authenticated agent, not independent physical-usage telemetry. An enabled account is not evidence someone is playing.
- No session: disable the account and disconnect its local Windows session. Staff approval: enable the account. End/expiry: disable and disconnect; never log off as a fallback. Already disconnected sessions are left running. Other Windows users are not intentionally disconnected. Windows edition/policy may reject disconnection: agent reports error and that PC must not be treated as securely controlled.
- The local timer uses a monotonic clock and subtracts request latency. Network loss preserves only the current in-memory approved deadline; no new offline approval. A response never executes remote commands or accepts executable code.
- HTTP requests run asynchronously with a 3-second configured timeout. The local expiry check runs every 500 ms independently of DNS/TLS/HTTP completion. Windows native calls can still delay/fail enforcement, so this is not a hard real-time guarantee.
- Key revocation blocks on the next successful contact (401/403). An offline agent may retain its existing approval until expiry. Revocation is not an instant offline kill switch.
- Process restart first disables/disconnects, then needs fresh server confirmation. Expiry is not persisted as an offline unlock grant.
- A five-minute advisory uses Windows `msg.exe`. Its delivery depends on Windows edition/configuration; test it. No branded lock screen exists yet.
- Windows account enablement is persistent OS state. If Windows or the task crashes while enabled, the account can remain enabled until the task starts and disables it. Task restart is configured but **this is not a boot-proof sign-in gate**. Suspend/resume must also be tested. Do not promise reboot bypass protection with this version.
- Only `NexusPlayer` is controlled. Other enabled accounts, saved admin credentials, physical boot access and local administrators can bypass it. Restrict account access and boot settings separately. Do not reuse employee or owner accounts as gaming accounts.
- PS5 is not supported by this agent. AI, payment or voice input cannot authorize the device polling endpoint; only staff-approved server sessions can.

## Acceptance checklist on a spare Windows 10 x64 PC

Keep an independent administrator login working throughout these checks.

- Confirm installer rejects wrong keys, keys for another PC, non-HTTPS server and a second install.
- Confirm account is a standard user, disabled before approval, and cannot read/modify agent files or config or stop the SYSTEM task without elevation.
- Request a five-minute session; request alone must not enable access. Approve and verify sign-in becomes possible within a polling interval.
- Verify warning, expiry disconnect, blocked re-login and corresponding dashboard state. Extend the expired session, wait for agent acknowledgement, sign in and check that the same game/desktop remains. Test full-screen games; test both console and any RDP sessions. A disconnect failure must be visible as error, never silently replaced by logoff.
- Test staff early stop, busy-PC rejection, active and expired extensions, key rotation and revocation. Confirm the timer stops access with network physically unplugged; test a stalled server too.
- Disconnect internet during an approved session: expiry must still enforce. Restart agent while offline: access must be disabled. Reconnect: require a currently valid session.
- Test boot, forced power loss and sleep/resume; document the known enabled-account boot window. Production requires a stronger Windows logon gating design before unattended use.
- Verify another local/domain account with a similar name and the administrator account are not disconnected.
- Test account deletion/rename, Windows updates, Task Scheduler failures and an inaccessible server. Inspect task status and error behaviour.

## Recovery / uninstall (administrator only)

Sign in with your independent admin account. In Task Scheduler stop and disable `NexusZoneAgent`. Explicitly disable `NexusPlayer` and sign out that user's session; a hard process kill does not reliably execute PowerShell's finally block. Revoke the PC's key in the owner dashboard. Export any user game saves/profile data before deleting an account. Remove the scheduled task and protected install directory only after confirming the right machine and account. The installer intentionally leaves partial failures visible for admin inspection rather than deleting accounts or files automatically.

Do not paste config.json, keys or credentials into support chats. Logs should contain state/error categories only.

## Time extensions and game continuity

Use **+ Time barhayein** on a live device, or **+ Time** on its report row after expiry. Only authenticated staff/owner can approve. Enter minutes and confirm the additional bill. During a live session, the approved end moves forward without removing time already used; paid credit is retained and only the additional balance becomes due. After expiry, continuation creates a new billing session starting now, so the locked gap is not charged. It uses the same customer/account; this does not guarantee a particular game survived. A manually stopped session or an older session superseded by another booking cannot be extended.

Saving an extension is not delivery. Until the agent reconnects, it follows the last deadline it actually received. The device card distinguishes **pending delivery** from **agent received latest time (reported)**, based on the session ID and end timestamp echoed on a later heartbeat. Old agent versions do not provide acknowledgement and must be upgraded. No offline/unapproved time grants are allowed. Staff must not assume server approval instantly unlocks an offline PC.

To upgrade a previously installed test agent: use the separate admin account, disable `NexusPlayer`, stop the scheduled task, replace both Agent.ps1 and Lease.ps1 in the protected install directory with the reviewed versions, then restart the task. Do not overwrite config.json or disclose its key. This does not automatically sign the player back in. Stopping the old 0.2 agent may sign the user out; save games first.

Online multiplayer matches do not pause when Windows disconnects: they can keep running, lose connection or kick inactive players. Game developers' session/GPU behaviour may also close a game. Reboot, power loss or a crash can lose unsaved progress.

## Timer policy tests

With PowerShell installed, run `pwsh -NoProfile -File windows-agent/Test-Lease.ps1` from the repository root (or `powershell.exe` on Windows). These execute the agent's shared monotonic timer policy, including network silence at expiry, approved extensions, revocation, in-transit expiry, malformed grants and wrong-device rejection. Cross-platform timer tests and syntax parsing do not validate native Windows disconnect/account APIs, automatic login or physical enforcement.

Games stay in a shared Windows profile. Before a **different** customer uses the station, staff must have the previous player save and sign out of their games/accounts and explicitly sign out the retained Windows session. A new booking alone does not clean up another player's running game or credentials. Do not leave customer accounts open for the next player.
