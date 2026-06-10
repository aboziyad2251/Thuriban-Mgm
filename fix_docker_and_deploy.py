import sys, io, os, time
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')
import paramiko, re

HOST     = '76.13.40.119'
USER     = 'root'
PASSWORD = 'Rawad@225144'
REMOTE   = '/opt/thuriban'
LOCAL    = r'c:\Users\moham\Desktop\Mgm Thuriban\backend'

def banner(msg):
    print(f'\n{"="*55}\n  {msg}\n{"="*55}')
    sys.stdout.flush()

def run(ssh, cmd, check=True, timeout=300):
    print(f'  $ {cmd}')
    sys.stdout.flush()
    chan = ssh.get_transport().open_session()
    chan.set_combine_stderr(True)
    chan.exec_command(f'TERM=dumb {cmd}')
    out_bytes = b''
    deadline = time.time() + timeout
    while time.time() < deadline:
        if chan.recv_ready(): out_bytes += chan.recv(4096)
        elif chan.exit_status_ready():
            while chan.recv_ready(): out_bytes += chan.recv(4096)
            break
        else: time.sleep(0.1)
    code = chan.recv_exit_status()
    out = re.sub(r'\x1b\[[0-9;?]*[A-Za-z]', '', out_bytes.decode('utf-8', errors='replace'))
    out = re.sub(r'[\r]', '', out)
    for line in out.strip().splitlines():
        l = line.strip()
        if l: print(f'    {l}')
    if check and code != 0:
        print(f'  FAILED (exit {code})')
        sys.stdout.flush()
        sys.exit(1)
    sys.stdout.flush()
    return out, code

def sftp_put_dir(sftp, local_dir, remote_dir):
    try: sftp.mkdir(remote_dir)
    except OSError: pass
    for item in sorted(os.listdir(local_dir)):
        lp = os.path.join(local_dir, item)
        rp = remote_dir + '/' + item
        if os.path.isdir(lp): sftp_put_dir(sftp, lp, rp)
        else:
            print(f'    upload {rp}')
            sftp.put(lp, rp)
    sys.stdout.flush()

banner('Connecting to VPS')
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASSWORD, timeout=30)
print(f'  Connected to {HOST}')

banner('Pruning Docker build cache')
run(ssh, 'docker builder prune -f 2>&1', check=False)
run(ssh, 'docker image prune -f 2>&1', check=False)
print('  Docker cache cleared')

banner(f'Uploading to {REMOTE}')
run(ssh, f'mkdir -p {REMOTE}')
sftp = ssh.open_sftp()
for fname in ['server.js', 'package.json', 'package-lock.json', 'Dockerfile', 'docker-compose.yml', '.dockerignore']:
    lp = os.path.join(LOCAL, fname)
    rp = REMOTE + '/' + fname
    if os.path.exists(lp):
        print(f'    upload {rp}')
        sftp.put(lp, rp)
sftp_put_dir(sftp, os.path.join(LOCAL, 'public'), REMOTE + '/public')
sftp.close()

banner('Building Docker image')
run(ssh, f'cd {REMOTE} && DOCKER_BUILDKIT=0 docker compose build --no-cache --progress=plain 2>&1', timeout=300)

banner('Launching container')
run(ssh, f'cd {REMOTE} && docker compose up -d 2>&1')

banner('Verification')
time.sleep(4)
run(ssh, 'docker ps --filter name=thuriban --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"', check=False)
out, _ = run(ssh, "docker run --rm --network proxy_network curlimages/curl:latest curl -s http://thuriban:3000/api/hierarchy-levels 2>&1", check=False)
if 'CEO' in out:
    print('\n  [OK] 8 hierarchy levels confirmed on API')
else:
    print(f'\n  [WARN] hierarchy-levels response: {out[:200]}')
    run(ssh, 'docker logs thuriban --tail 20 2>&1', check=False)

ssh.close()
print('\n  Deployment complete!')
print('  https://thuriban.mabotargagh.online')
