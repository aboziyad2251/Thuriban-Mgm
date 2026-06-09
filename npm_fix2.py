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

# Write a Python helper script directly to the server via SFTP
helper_script = f'''import subprocess, sqlite3, sys

# Generate bcrypt hash via node
result = subprocess.run(
    ["docker", "exec", "nginx_proxy_manager", "node", "-e",
     "const b=require('/app/node_modules/bcrypt');b.hash('{TEMP_PWD}',10,(e,h)=>{{if(e){{process.exit(1)}}process.stdout.write(h)}})"],
    capture_output=True, text=True, timeout=30
)
h = result.stdout.strip()
if not h.startswith('$2'):
    print("Hash failed:", result.stderr[:200])
    sys.exit(1)
print("Hash:", h)

# Update DB
conn = sqlite3.connect('/opt/npm/data/database.sqlite')
conn.execute("UPDATE auth SET secret=? WHERE user_id=1 AND type='password'", (h,))
conn.commit()
row = conn.execute("SELECT secret FROM auth WHERE user_id=1").fetchone()
print("DB secret:", row[0])
conn.close()
print("DB updated OK")
'''

sftp = ssh.open_sftp()
with sftp.open('/tmp/npm_hash_update.py', 'w') as f:
    f.write(helper_script)
sftp.close()

print('=== Updating NPM password via server-side script ===')
print(run("python3 /tmp/npm_hash_update.py"))

print('\n=== Restarting NPM ===')
print(run("docker restart nginx_proxy_manager 2>&1"))
time.sleep(12)
print(run("docker ps --filter name=nginx_proxy_manager --format '{{.Status}}'"))

print(f'\n=== Login to NPM API ===')
resp = run(f"curl -s -X POST http://localhost:81/api/tokens -H 'Content-Type: application/json' -d '{{\"identity\":\"{NPM_EMAIL}\",\"secret\":\"{TEMP_PWD}\"}}'")
print(f'  Response: {resp[:200]}')

if '"token"' not in resp:
    print('\n  Login still failing.')
    print('  MANUAL: http://76.13.40.119:81')
    print('  Add proxy host: thuriban.mabotargagh.online -> http://thuriban:3000')
    ssh.close()
    sys.exit(1)

token = json.loads(resp)['token']
print('  Logged in!')

# Check existing hosts
hosts_raw = run(f"curl -s http://localhost:81/api/nginx/proxy-hosts -H 'Authorization: Bearer {token}'")
hosts = json.loads(hosts_raw)
print(f'\n=== Proxy hosts ({len(hosts)}) ===')
for h in hosts:
    enabled = h.get('enabled', 1)
    print(f'  [{enabled}] {h.get("domain_names")} -> {h.get("forward_host")}:{h.get("forward_port")}')

existing = [h for h in hosts if any('thuriban' in d for d in h.get('domain_names', []))]

if not existing:
    # Write proxy host payload to temp file to avoid quoting issues
    ph_payload = {
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
    }
    sftp = ssh.open_sftp()
    with sftp.open('/tmp/ph_payload.json', 'w') as f:
        f.write(json.dumps(ph_payload))
    sftp.close()

    print('\n=== Creating proxy host ===')
    result = run(f"curl -s -X POST http://localhost:81/api/nginx/proxy-hosts -H 'Authorization: Bearer {token}' -H 'Content-Type: application/json' -d @/tmp/ph_payload.json")
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

# Enable SSL via file payload
ssl_data = {
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
}
sftp = ssh.open_sftp()
with sftp.open('/tmp/ssl_payload.json', 'w') as f:
    f.write(json.dumps(ssl_data))
sftp.close()

print('\n=== Enabling SSL (Let\'s Encrypt) ===')
ssl_result = run(f"curl -s -X PUT http://localhost:81/api/nginx/proxy-hosts/{host_id} -H 'Authorization: Bearer {token}' -H 'Content-Type: application/json' -d @/tmp/ssl_payload.json", timeout=120)
ssl_obj = json.loads(ssl_result)
cert_id = ssl_obj.get('certificate_id', 0)
if cert_id and cert_id != 0:
    print(f'  SSL enabled! Cert ID: {cert_id}')
    print('\n  LIVE: https://thuriban.mabotargagh.online')
else:
    print(f'  SSL response: {ssl_result[:500]}')
    print('\n  HTTP live: http://thuriban.mabotargagh.online')

# External test
print('\n=== External test ===')
time.sleep(3)
ext = run("curl -s -o /dev/null -w '%{http_code}' http://thuriban.mabotargagh.online/api/stats 2>&1")
print(f'  HTTP status: {ext}')

ssh.close()
print('\nDone.')
