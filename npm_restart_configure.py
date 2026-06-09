import sys, io, time, re, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
import paramiko

HOST, USER, PASSWORD = '76.13.40.119', 'root', 'Rawad@225144'
NPM_EMAIL = 'tarj123@gmail.com'
TEMP_PWD  = 'TempDeploy2026!'

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASSWORD, timeout=30)

def run(cmd, timeout=60):
    chan = ssh.get_transport().open_session()
    chan.set_combine_stderr(True)
    chan.exec_command(cmd)
    out = b''
    deadline = time.time() + timeout
    while time.time() < deadline:
        if chan.recv_ready(): out += chan.recv(4096)
        elif chan.exit_status_ready():
            while chan.recv_ready(): out += chan.recv(4096)
            break
        else: time.sleep(0.1)
    return re.sub(r'\x1b\[[0-9;?]*[A-Za-z]', '', out.decode('utf-8', errors='replace')).strip()

# Restart NPM to pick up DB change
print('=== Restarting NPM container ===')
print(run("docker restart nginx_proxy_manager 2>&1"))
print('  Waiting 10s for NPM to come back...')
time.sleep(10)

# Check it's running
print(run("docker ps --filter name=nginx_proxy_manager --format '{{.Status}}'"))

# Login
print(f'\n=== Login to NPM API ===')
resp = run(f"""curl -s -X POST http://localhost:81/api/tokens \
  -H 'Content-Type: application/json' \
  -d '{{"identity":"{NPM_EMAIL}","secret":"{TEMP_PWD}"}}'""")
print(f'  Response: {resp[:200]}')

if '"token"' not in resp:
    print('\n  Still failing. Trying direct DB read to verify hash...')
    check = run("""python3 -c "
import sqlite3
conn = sqlite3.connect('/opt/npm/data/database.sqlite')
r = conn.execute('SELECT secret FROM auth WHERE user_id=1').fetchone()
print('Current secret in DB:', r[0])
conn.close()
" """)
    print(f'  {check}')

    print('\n  MANUAL STEPS:')
    print('  1. Go to http://76.13.40.119:81')
    print('  2. Add Proxy Host:')
    print('     Domain: thuriban.mabotargagh.online')
    print('     Scheme: http  Host: thuriban  Port: 3000')
    print('     Enable SSL with Let\'s Encrypt')
    ssh.close()
    sys.exit(1)

token = json.loads(resp)['token']
print('  Logged in!')

# Check existing hosts
hosts_raw = run(f"curl -s http://localhost:81/api/nginx/proxy-hosts -H 'Authorization: Bearer {token}'")
hosts = json.loads(hosts_raw)
print(f'\n=== Proxy hosts ({len(hosts)}) ===')
for h in hosts:
    print(f'  {h.get("domain_names")} -> {h.get("forward_host")}:{h.get("forward_port")}')

existing = [h for h in hosts if any('thuriban' in d for d in h.get('domain_names', []))]

if not existing:
    print('\n=== Creating thuriban proxy host (HTTP first) ===')
    payload = json.dumps({
        "domain_names": ["thuriban.mabotargagh.online"],
        "forward_scheme": "http",
        "forward_host": "thuriban",
        "forward_port": 3000,
        "access_list_id": 0,
        "certificate_id": 0,
        "ssl_forced": False,
        "caching_enabled": False,
        "block_exploits": True,
        "advanced_config": "",
        "allow_websocket_upgrade": True,
        "http2_support": False,
        "meta": {"letsencrypt_agree": False, "dns_challenge": False},
        "locations": []
    })
    result = run(f"""curl -s -X POST http://localhost:81/api/nginx/proxy-hosts \
      -H 'Authorization: Bearer {token}' \
      -H 'Content-Type: application/json' \
      -d '{payload}'""")
    result_obj = json.loads(result)
    host_id = result_obj.get('id')
    if not host_id:
        print(f'  Error: {result[:300]}')
        ssh.close()
        sys.exit(1)
    print(f'  Created! ID: {host_id}')
else:
    host_id = existing[0]['id']
    print(f'  Already exists. ID: {host_id}')

# Enable SSL
print('\n=== Enabling SSL ===')
ssl_payload = json.dumps({
    "domain_names": ["thuriban.mabotargagh.online"],
    "forward_scheme": "http",
    "forward_host": "thuriban",
    "forward_port": 3000,
    "access_list_id": 0,
    "certificate_id": "new",
    "ssl_forced": True,
    "caching_enabled": False,
    "block_exploits": True,
    "advanced_config": "",
    "allow_websocket_upgrade": True,
    "http2_support": True,
    "meta": {
        "letsencrypt_agree": True,
        "letsencrypt_email": "tarj123@gmail.com",
        "dns_challenge": False
    },
    "locations": []
})
ssl_result = run(f"""curl -s -X PUT http://localhost:81/api/nginx/proxy-hosts/{host_id} \
  -H 'Authorization: Bearer {token}' \
  -H 'Content-Type: application/json' \
  -d '{ssl_payload}'""", timeout=120)
ssl_obj = json.loads(ssl_result)
cert_id = ssl_obj.get('certificate_id', 0)
if cert_id and cert_id != 0:
    print(f'  SSL enabled! Cert ID: {cert_id}')
    print('\n  LIVE: https://thuriban.mabotargagh.online')
else:
    print(f'  SSL response: {ssl_result[:500]}')
    print('\n  HTTP live: http://thuriban.mabotargagh.online')
    print('  Enable SSL at http://76.13.40.119:81 if DNS is propagated')

# External check
print('\n=== External health check ===')
time.sleep(3)
ext = run("curl -s -o /dev/null -w '%{http_code}' http://thuriban.mabotargagh.online/api/stats 2>&1")
print(f'  HTTP status: {ext}')

ssh.close()
