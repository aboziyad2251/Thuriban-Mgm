import sys, io, os, time
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')
import paramiko

HOST     = '76.13.40.119'
USER     = 'root'
PASSWORD = 'Rawad@225144'
REMOTE   = '/opt/thuriban'
LOCAL    = r'c:\Users\moham\Desktop\Mgm Thuriban\backend'

UPLOAD_FILES = ['server.js', 'package.json', 'package-lock.json',
                'Dockerfile', 'docker-compose.yml', '.dockerignore']
UPLOAD_DIRS  = ['public']

def banner(msg):
    print(f'\n{"="*55}\n  {msg}\n{"="*55}')
    sys.stdout.flush()

def run(ssh, cmd, check=True, timeout=300):
    print(f'  $ {cmd}')
    sys.stdout.flush()
    transport = ssh.get_transport()
    chan = transport.open_session()
    chan.set_combine_stderr(True)
    chan.exec_command(f'TERM=dumb {cmd}')

    out_bytes = b''
    while True:
        if chan.recv_ready():
            out_bytes += chan.recv(4096)
        elif chan.exit_status_ready():
            while chan.recv_ready():
                out_bytes += chan.recv(4096)
            break
        else:
            time.sleep(0.1)

    code = chan.recv_exit_status()
    out  = out_bytes.decode('utf-8', errors='replace')

    import re
    out = re.sub(r'\x1b\[[0-9;?]*[A-Za-z]', '', out)
    out = re.sub(r'\x1b\([A-Z]', '', out)
    out = re.sub(r'[\r]', '', out)

    for line in out.strip().splitlines():
        l = line.strip()
        if l:
            print(f'    {l}')

    if check and code != 0:
        print(f'  FAILED (exit {code})')
        sys.stdout.flush()
        sys.exit(1)
    sys.stdout.flush()
    return out, code

def sftp_put_dir(sftp, local_dir, remote_dir):
    try:
        sftp.mkdir(remote_dir)
    except OSError:
        pass
    for item in sorted(os.listdir(local_dir)):
        lp = os.path.join(local_dir, item)
        rp = remote_dir + '/' + item
        if os.path.isdir(lp):
            sftp_put_dir(sftp, lp, rp)
        else:
            print(f'    upload {rp}')
            sftp.put(lp, rp)
    sys.stdout.flush()

# ── Connect ───────────────────────────────────────────────────────
banner('Connecting to VPS')
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASSWORD, timeout=30)
print(f'  Connected to {HOST}')

# ── Docker check ──────────────────────────────────────────────────
banner('Checking Docker')
run(ssh, 'docker --version')
run(ssh, 'docker compose version 2>/dev/null || docker-compose --version')
run(ssh, 'docker network ls --filter name=proxy_network')

# ── Upload ────────────────────────────────────────────────────────
banner(f'Uploading to {REMOTE}')
run(ssh, f'mkdir -p {REMOTE}')
sftp = ssh.open_sftp()

for fname in UPLOAD_FILES:
    lp = os.path.join(LOCAL, fname)
    rp = REMOTE + '/' + fname
    if os.path.exists(lp):
        print(f'    upload {rp}')
        sftp.put(lp, rp)

for dname in UPLOAD_DIRS:
    sftp_put_dir(sftp, os.path.join(LOCAL, dname), REMOTE + '/' + dname)

sftp.close()

# ── Stop old container if running ────────────────────────────────
banner('Stopping old container')
run(ssh, f'cd {REMOTE} && docker compose down 2>&1', check=False)

# ── Build ─────────────────────────────────────────────────────────
banner('Building Docker image')
run(ssh, f'cd {REMOTE} && DOCKER_BUILDKIT=0 docker compose build --no-cache --progress=plain 2>&1', timeout=300)

# ── Launch ────────────────────────────────────────────────────────
banner('Launching container')
run(ssh, f'cd {REMOTE} && docker compose up -d 2>&1')

# ── Verify ────────────────────────────────────────────────────────
banner('Verification')
time.sleep(4)
run(ssh, 'docker ps --filter name=thuriban --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"', check=False)
out, _ = run(ssh, 'curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/stats', check=False)
code_line = [l.strip() for l in out.strip().splitlines() if l.strip()]
http_code = code_line[-1] if code_line else '?'

if http_code == '200':
    print('\n  [OK] App responding on port 3000')
else:
    print(f'\n  [WARN] Health check: {http_code}')
    run(ssh, 'docker logs thuriban --tail 30 2>&1', check=False)

print('\n  Container name: thuriban')
print('  Internal port:  3000')
print('  NPM route:      thuriban.mabotargagh.online -> thuriban:3000')

ssh.close()
print('\n  Deployment complete!')
print('  Next: configure NPM proxy host for thuriban.mabotargagh.online')
