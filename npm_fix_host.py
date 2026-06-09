import sys, io, time, re, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
import paramiko

HOST, USER, PASSWORD = '76.13.40.119', 'root', 'Rawad@225144'
NPM_EMAIL = 'tarj123@gmail.com'
TEMP_PWD  = 'TempDeploy2026!'
HOST_ID   = 28

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASSWORD, timeout=30)

def run(cmd, timeout=120):
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

# Login
resp = run(f"curl -s -X POST http://localhost:81/api/tokens -H 'Content-Type: application/json' -d '{{\"identity\":\"{NPM_EMAIL}\",\"secret\":\"{TEMP_PWD}\"}}'")
if '"token"' not in resp:
    print('Login failed')
    ssh.close()
    sys.exit(1)
token = json.loads(resp)['token']
print('Logged in')

# Get current host details
print(f'\n=== Current host {HOST_ID} details ===')
current = run(f"curl -s http://localhost:81/api/nginx/proxy-hosts/{HOST_ID} -H 'Authorization: Bearer {token}'")
current_obj = json.loads(current)
print(f'  Domain: {current_obj.get("domain_names")}')
print(f'  Forward: {current_obj.get("forward_host")}:{current_obj.get("forward_port")}')
print(f'  SSL forced: {current_obj.get("ssl_forced")}')
print(f'  Certificate ID: {current_obj.get("certificate_id")}')

# Check existing certificates for this domain
print('\n=== Existing certificates ===')
certs_raw = run(f"curl -s http://localhost:81/api/nginx/certificates -H 'Authorization: Bearer {token}'")
certs = json.loads(certs_raw)
thuriban_certs = [c for c in certs if any('thuriban' in str(d) for d in c.get('domain_names', []))]
print(f'  thuriban certs: {thuriban_certs}')

# Step 1: update to correct backend (no SSL change yet)
print(f'\n=== Step 1: Fix forward host to thuriban:3000 ===')
fix_payload = {
    "domain_names": ["thuriban.mabotargagh.online"],
    "forward_scheme": "http",
    "forward_host": "thuriban",
    "forward_port": 3000,
    "access_list_id": 0,
    "certificate_id": current_obj.get("certificate_id", 0),
    "ssl_forced": current_obj.get("ssl_forced", False),
    "caching_enabled": False,
    "block_exploits": True,
    "advanced_config": current_obj.get("advanced_config", ""),
    "allow_websocket_upgrade": True,
    "http2_support": current_obj.get("http2_support", False),
    "meta": current_obj.get("meta", {}),
    "locations": current_obj.get("locations", [])
}
sftp = ssh.open_sftp()
with sftp.open('/tmp/fix_payload.json', 'w') as f:
    f.write(json.dumps(fix_payload))
sftp.close()

fix_result = run(f"curl -s -X PUT http://localhost:81/api/nginx/proxy-hosts/{HOST_ID} -H 'Authorization: Bearer {token}' -H 'Content-Type: application/json' -d @/tmp/fix_payload.json")
fix_obj = json.loads(fix_result)
print(f'  Forward now: {fix_obj.get("forward_host")}:{fix_obj.get("forward_port")}')
print(f'  SSL forced: {fix_obj.get("ssl_forced")}  Cert ID: {fix_obj.get("certificate_id")}')

# Test HTTP
print('\n=== HTTP test ===')
time.sleep(2)
ext = run("curl -s -o /dev/null -w '%{http_code}' http://thuriban.mabotargagh.online/api/stats 2>&1")
print(f'  HTTP: {ext}')

# Step 2: Enable SSL
existing_cert_id = fix_obj.get("certificate_id", 0)
if existing_cert_id and existing_cert_id != 0:
    # Use existing cert, just force SSL
    print(f'\n=== Step 2: Using existing cert {existing_cert_id}, forcing SSL ===')
    ssl_payload = dict(fix_payload)
    ssl_payload['certificate_id'] = existing_cert_id
    ssl_payload['ssl_forced'] = True
    ssl_payload['http2_support'] = True
    sftp = ssh.open_sftp()
    with sftp.open('/tmp/ssl_payload2.json', 'w') as f:
        f.write(json.dumps(ssl_payload))
    sftp.close()
    ssl_result = run(f"curl -s -X PUT http://localhost:81/api/nginx/proxy-hosts/{HOST_ID} -H 'Authorization: Bearer {token}' -H 'Content-Type: application/json' -d @/tmp/ssl_payload2.json")
    ssl_obj = json.loads(ssl_result)
    print(f'  SSL result cert_id: {ssl_obj.get("certificate_id")}  forced: {ssl_obj.get("ssl_forced")}')
else:
    # Request new Let's Encrypt cert
    print('\n=== Step 2: Requesting new Let\'s Encrypt cert ===')
    ssl_payload = dict(fix_payload)
    ssl_payload['certificate_id'] = "new"
    ssl_payload['ssl_forced'] = True
    ssl_payload['http2_support'] = True
    ssl_payload['meta'] = {
        "letsencrypt_agree": True,
        "letsencrypt_email": "tarj123@gmail.com",
        "dns_challenge": False
    }
    sftp = ssh.open_sftp()
    with sftp.open('/tmp/ssl_payload2.json', 'w') as f:
        f.write(json.dumps(ssl_payload))
    sftp.close()
    ssl_result = run(f"curl -s -X PUT http://localhost:81/api/nginx/proxy-hosts/{HOST_ID} -H 'Authorization: Bearer {token}' -H 'Content-Type: application/json' -d @/tmp/ssl_payload2.json", timeout=120)
    ssl_obj = json.loads(ssl_result)
    cert_id = ssl_obj.get('certificate_id', 0)
    if cert_id and cert_id != 0:
        print(f'  New cert issued! Cert ID: {cert_id}')
    else:
        error = ssl_obj.get('error', {}).get('message', ssl_result[:300])
        print(f'  SSL error: {error}')

# Final test
print('\n=== Final tests ===')
time.sleep(3)
http = run("curl -s -o /dev/null -w '%{http_code}' http://thuriban.mabotargagh.online/api/stats 2>&1")
https = run("curl -sk -o /dev/null -w '%{http_code}' https://thuriban.mabotargagh.online/api/stats 2>&1")
print(f'  HTTP:  {http}')
print(f'  HTTPS: {https}')

if http == '200' or https == '200':
    print('\n  DEPLOYMENT COMPLETE!')
    print('  https://thuriban.mabotargagh.online')
else:
    print('\n  Site may need DNS propagation or manual SSL setup')

ssh.close()
