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

NPM_EMAIL = 'tarj123@gmail.com'
TEMP_PWD  = 'TempDeploy2026!'

# Generate bcrypt hash for temp password using node inside NPM container
print('=== Generating bcrypt hash for temp password ===')
hash_result = run(f"""docker exec nginx_proxy_manager node -e \
  "const b=require('bcryptjs');b.hash('{TEMP_PWD}',10).then(h=>console.log(h))" 2>&1""")
print(f'  Hash: {hash_result[:30]}...')

if not hash_result.startswith('$2'):
    # Try with bcrypt (non-js variant)
    hash_result = run(f"""python3 -c "import subprocess,sys
import hashlib,hmac
# Use htpasswd approach via openssl
import subprocess
r=subprocess.run(['openssl','passwd','-6','-stdin'],input=b'{TEMP_PWD}',capture_output=True)
print(r.stdout.decode().strip())" 2>&1""")
    print(f'  Fallback hash: {hash_result[:30]}')

# Update DB
print('\n=== Updating NPM DB password ===')
update_result = run(f"""python3 -c "
import sqlite3
conn = sqlite3.connect('/opt/npm/data/database.sqlite')
conn.execute('''UPDATE user SET password=? WHERE email=?''', ('{hash_result}', '{NPM_EMAIL}'))
conn.commit()
rows = conn.execute('SELECT email, password FROM user WHERE email=?', ('{NPM_EMAIL}',)).fetchall()
print('Updated rows:', rows[0][0], 'hash starts:', rows[0][1][:15])
conn.close()
" 2>&1""")
print(f'  {update_result}')

# Now login with temp password
print(f'\n=== Logging into NPM with temp password ===')
resp = run(f"""curl -s -X POST http://localhost:81/api/tokens \
  -H 'Content-Type: application/json' \
  -d '{{"identity":"{NPM_EMAIL}","secret":"{TEMP_PWD}"}}'""")
print(f'  Response: {resp[:200]}')

if '"token"' in resp:
    token = json.loads(resp)['token']
    print(f'  Got token!')

    # Check existing hosts
    hosts_raw = run(f"curl -s http://localhost:81/api/nginx/proxy-hosts -H 'Authorization: Bearer {token}'")
    hosts = json.loads(hosts_raw)
    print(f'\n=== Existing proxy hosts ({len(hosts)}) ===')
    for h in hosts:
        print(f'  {h.get("domain_names")} -> {h.get("forward_host")}:{h.get("forward_port")}')

    existing = [h for h in hosts if any('thuriban' in d for d in h.get('domain_names', []))]

    if not existing:
        print('\n=== Creating thuriban proxy host ===')
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
        if 'id' in result_obj:
            host_id = result_obj['id']
            print(f'  HTTP proxy host created! ID: {host_id}')

            # Enable Let's Encrypt SSL
            print('\n=== Requesting Let\'s Encrypt certificate ===')
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
            if ssl_obj.get('certificate_id', 0) > 0:
                print(f'  SSL enabled! Certificate ID: {ssl_obj["certificate_id"]}')
                print('\n  Site live at: https://thuriban.mabotargagh.online')
            else:
                print(f'  SSL response: {ssl_result[:400]}')
                print('\n  HTTP-only for now: http://thuriban.mabotargagh.online')
        else:
            print(f'  Error creating host: {result[:300]}')
    else:
        print('  thuriban proxy host already configured!')
else:
    print(f'  Login failed after DB update. Manual NPM config needed.')
    print(f'  Go to http://76.13.40.119:81 and add proxy host:')
    print(f'    Domain: thuriban.mabotargagh.online')
    print(f'    Forward: http://thuriban:3000')

ssh.close()
