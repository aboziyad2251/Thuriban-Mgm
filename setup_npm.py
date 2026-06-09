import sys, io, time, re, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
import paramiko

HOST, USER, PASSWORD = '76.13.40.119', 'root', 'Rawad@225144'

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASSWORD, timeout=30)

def run(cmd):
    chan = ssh.get_transport().open_session()
    chan.set_combine_stderr(True)
    chan.exec_command(cmd)
    out = b''
    while True:
        if chan.recv_ready(): out += chan.recv(4096)
        elif chan.exit_status_ready():
            while chan.recv_ready(): out += chan.recv(4096)
            break
        else: time.sleep(0.1)
    return re.sub(r'\x1b\[[0-9;?]*[A-Za-z]', '', out.decode('utf-8', errors='replace')).strip()

# Test app from within proxy_network using another container
print('=== App health check (from proxy_network) ===')
print(run("docker run --rm --network proxy_network curlimages/curl:latest curl -s http://thuriban:3000/api/stats 2>&1 | head -c 500"))

print('\n=== NPM container ports ===')
print(run("docker inspect nginx_proxy_manager --format '{{json .NetworkSettings.Ports}}'"))

print('\n=== NPM API - get token ===')
npm_login = run("""curl -s -X POST http://localhost:81/api/tokens \
  -H 'Content-Type: application/json' \
  -d '{"identity":"admin@example.com","secret":"changeme"}' 2>&1""")
print(npm_login)

ssh.close()
