# Seccomp fallback for the compiler's per-job sandbox (bubblewrap)

`seccomp-compile-userns.json` is **deliberately ALLOW-everything** — an empty
syscall list on top of `defaultAction: SCMP_ACT_ALLOW`. It exists for one
narrow purpose: Docker's default seccomp profile blocks `clone`/`unshare` with
user-namespace flags for unprivileged users on some hosts, which is exactly
what the compiler's per-job bubblewrap sandbox needs. This file is a **fallback
of last resort** that trades default-seccomp filtering for per-job namespace
isolation.

An allow-all profile is a **real weakening of the container**: it removes the
syscall filtering Docker applies by default to every container. It is justified
only because, with it, every compile job runs inside its own user+mount
namespace sandbox (`bwrap --unshare-all`, read-only root, the job directory as
the only writable path, no network, no IPC) — which is a strictly smaller and
more targeted attack surface than the default syscall filter alone. Do not use
this profile for any other service.

## This file is NOT wired into any compose file

No compose file references it. The integrator decides from production
evidence, in this order:

1. Deploy the compiler as-is (image with `bubblewrap` installed) and read the
   boot log line / the `/health` endpoint:
   - `isolation=bwrap` — the host's default seccomp already lets user
     namespaces through. **This file stays unused; delete it.**
   - `isolation=none reason=...` (typically `bwrap exit 1: bwrap: No
permissions to create new namespace`) — user namespaces are blocked.
2. Only if the probe says userns is blocked, wire the profile onto the
   compiler service and redeploy:

   ```yaml
   compiler:
     security_opt:
       - "no-new-privileges:true"
       - "seccomp=./deploy/seccomp-compile-userns.json"
   ```

3. Confirm the boot line flips to `isolation=bwrap` and `/health` reports
   `"isolation": "bwrap"`. If it still reports `none`, remove the profile
   again — the compiler safely falls back to today's behavior either way
   (compilation never depends on the sandbox being available).

The boot line also prints `kernel=<release>` and `userns=<max_user_namespaces>`
(`?` when the sysctl file is missing) to tell the "kernel has user namespaces
off" case apart from the "seccomp blocks them" case.

## Outcome on the current production host (2026-11-06)

Wired once (f0b6c88) and reverted the same day (d1e8f7f). Evidence trail:
with Docker's default seccomp the boot probe says `isolation=none ... No
permissions to create new namespace` (the profile blocks clone(NEWUSER)).
With this profile wired, the probe gets PAST namespace creation but dies at
`bwrap: Failed to make / slave: Permission denied` — the host (Debian 12,
kernel 6.1, Docker under Dokploy) does not allow the mount-propagation change
from inside the container, and bwrap's setup order makes that step mandatory.
So on this host the trade buys nothing: an allow-all filter with no per-job
jails. Default seccomp restored; the compiler keeps its self-adapting probe
(isolation=none today) and this profile stays here for a future host or
Docker setup where the slave remount is permitted — wire it, deploy, and read
the boot line: `isolation=bwrap` means it worked.
