"""Own one on-demand Dashboard; stdin EOF/stop terminates only that process group.

Executed through wsl.exe with a fixed Python program, never a user-supplied shell.
Python 3.8+ (Ubuntu 20.04) is sufficient; Selark uses its own installed interpreter.
"""
import json
import os
import re
import shutil
import signal
import subprocess
import sys
import threading


def emit(value):
    print(json.dumps(value, ensure_ascii=True), flush=True)


def main():
    settings = json.loads(sys.argv[1])
    executable = settings.get("executable") or shutil.which("selark")
    if not executable:
        executable = os.path.expanduser("~/.local/bin/selark")
    executable = os.path.expanduser(executable)
    if not os.path.isabs(executable) or not os.path.isfile(executable) or not os.access(executable, os.X_OK):
        emit({"type": "error", "code": "selark_not_found"})
        return 1
    args = [executable]
    if settings.get("configDir"):
        args.extend(["--config-dir", os.path.expanduser(settings["configDir"])])
    args.extend(["dashboard", "--no-open", "--port", "0"])
    if settings.get("readOnly"):
        args.append("--read-only")
    env = dict(os.environ, PYTHONUNBUFFERED="1", PYTHONIOENCODING="utf-8")
    try:
        child = subprocess.Popen(args, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                                 stderr=subprocess.PIPE, cwd=os.path.expanduser("~"),
                                 env=env, start_new_session=True)
    except OSError:
        emit({"type": "error", "code": "launch_failed"})
        return 1

    stopping = threading.Event()

    def stop():
        if stopping.is_set():
            return
        stopping.set()
        if child.poll() is None:
            try:
                os.killpg(child.pid, signal.SIGTERM)
                child.wait(timeout=8)
            except subprocess.TimeoutExpired:
                if child.poll() is None:
                    os.killpg(child.pid, signal.SIGKILL)
                child.wait()
            except ProcessLookupError:
                pass

    def watch_parent():
        # No heartbeat or periodic process scan. Broken/closed parent pipe is EOF.
        try:
            sys.stdin.buffer.readline()
        finally:
            stop()

    def drain_errors():
        # Backend diagnostics may contain private paths. Never forward raw stderr.
        while child.stderr.read(4096):
            pass

    signal.signal(signal.SIGTERM, lambda *_: stop())
    signal.signal(signal.SIGINT, lambda *_: stop())
    threading.Thread(target=watch_parent, daemon=True).start()
    threading.Thread(target=drain_errors, daemon=True).start()
    ready = False
    try:
        # Read bounded lines so a broken executable cannot grow our buffer forever.
        while True:
            line = child.stdout.readline(8193)
            if not line:
                break
            if not ready and len(line) <= 8192:
                match = re.fullmatch(rb"http://127\.0\.0\.1:([0-9]{1,5})/#login=([A-Za-z0-9_-]{20,512})", line.strip())
                if match and 1 <= int(match.group(1)) <= 65535:
                    ready = True
                    # This private pipe is read only by Electron's main process.
                    emit({"type": "ready", "link": line.strip().decode("ascii")})
        code = child.wait()
        if not ready and not stopping.is_set():
            emit({"type": "error", "code": "dashboard_failed"})
        return code
    finally:
        stop()


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (Exception, KeyboardInterrupt):
        # No traceback: arguments/output can include an ephemeral login credential.
        emit({"type": "error", "code": "runner_failed"})
        sys.exit(1)
