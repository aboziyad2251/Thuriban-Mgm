import sys, io, time, re, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
import paramiko

HOST, USER, PASSWORD = '76.13.40.119', 'root', 'Rawad@225144'
NPM_EMAIL = 'tarj123@gmail.com'
TEMP_PWD  = 'TempDeploy2026!'

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

# Step 1: generate bcrypt hash inside NPM container using its bcrypt module
print('=== Step 1: Generate bcrypt hash ===')
hash_cmd = f"""docker exec nginx_proxy_manager node -e "
const bcrypt = require('/app/node_modules/bcrypt');
bcrypt.hash('{TEMP_PWD}', 10, (err, hash) => {{
  if (err) {{ console.error(err); process.exit(1); }}
  process.stdout.write(hash);
}});" 2>&1"""
new_hash = run(hash_cmd).strip()
print(f'  Hash: {new_hash[:25]}...')

if not new_hash.startswith('$2'):
    print('  ERROR: failed to generate hash')
    ssh.close()
    sys.exit(1)

# Step 2: update auth.secret in SQLite
print('\n=== Step 2: Update auth.secret in DB ===')
# Escape single quotes in hash
escaped = new_hash.replace("'", "''")
update = run(f"""python3 -c "
import sqlite3
conn = sqlite3.connect('/opt/npm/data/database.sqlite')
conn.execute(\\\"UPDATE auth SET secret='{escaped}' WHERE user_id=1 AND type='password'\\\")
conn.commit()
r = conn.execute(\\\"SELECT secret FROM auth WHERE user_id=1\\\").fetchone()
print('Updated:', r[0][:25])
conn.close()
" """)
print(f'  {update}')

# Step 3: login with temp password
print(f'\n=== Step 3: Login to NPM API ===')
resp = run(f"""curl -s -X POST http://localhost:81/api/tokens \
  -H 'Content-Type: application/json' \
  -d '{{"identity":"{NPM_EMAIL}","secret":"{TEMP_PWD}"}}'""")
print(f'  Response: {resp[:100]}')

if '"token"' not in resp:
    print('  Login failed. Manual setup required.')
    print(f'  http://76.13.40.119:81 -> Add proxy host:')
    print(f'    Domain: thuriban.mabotargagh.online')
    print(f'    Forward: http://thuriban:3000')
    ssh.close()
    sys.exit(1)

token = json.loads(resp)['token']
print('  Logged in!')

# Step 4: check existing proxy hosts
hosts_raw = run(f"curl -s http://localhost:81/api/nginx/proxy-hosts -H 'Authorization: Bearer {token}'")
hosts = json.loads(hosts_raw)
print(f'\n=== Existing proxy hosts ({len(hosts)}) ===')
for h in hosts:
    print(f'  {h.get("domain_names")} -> {h.get("forward_host")}:{h.get("forward_port")}')

existing = [h for h in hosts if any('thuriban' in d for d in h.get('domain_names', []))]

if not existing:
    print('\n=== Step 4: Create thuriban HTTP proxy host ===')
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
    if 'id' not in result_obj:
        print(f'  Error: {result[:300]}')
        ssh.close()
        sys.exit(1)
    host_id = result_obj['id']
    print(f'  HTTP proxy host created! ID: {host_id}')
else:
    host_id = existing[0]['id']
    print(f'  thuriban proxy host already exists! ID: {host_id}')

# Step 5: Enable Let's Encrypt SSL
print('\n=== Step 5: Enable SSL (Let\'s Encrypt) ===')
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
  -d '{ssl_payload}'""")
ssl_obj = json.loads(ssl_result)
cert_id = ssl_obj.get('certificate_id', 0)
if cert_id and cert_id != 0:
    print(f'  SSL enabled! Certificate ID: {cert_id}')
    print('\n  LIVE: https://thuriban.mabotargagh.online')
else:
    print(f'  SSL setup: {ssl_result[:400]}')
    print('\n  HTTP available: http://thuriban.mabotargagh.online')
    print('  (Enable SSL manually in NPM at http://76.13.40.119:81)')

# Final: test external access
print('\n=== Final: external health check ===')
time.sleep(3)
ext = run("curl -s -o /dev/null -w '%{http_code}' http://thuriban.mabotargagh.online/api/stats 2>&1")
print(f'  HTTP status: {ext}')

ssh.close()
print('\nDone.')
