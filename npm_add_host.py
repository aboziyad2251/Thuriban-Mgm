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
# Try VPS password first
for pwd in ['Rawad@225144', 'changeme', 'admin', 'password']:
    print(f'  Trying password: {pwd[:4]}****')
    resp = run(f"""curl -s -X POST http://localhost:81/api/tokens \
      -H 'Content-Type: application/json' \
      -d '{{"identity":"{NPM_EMAIL}","secret":"{pwd}"}}'""")
    if '"token"' in resp:
        print(f'  SUCCESS with password: {pwd[:4]}****')
        token = json.loads(resp)['token']
        print(f'  Token: {token[:30]}...')

        # Check if proxy host already exists
        print('\n=== Existing proxy hosts ===')
        hosts_raw = run(f"curl -s http://localhost:81/api/nginx/proxy-hosts -H 'Authorization: Bearer {token}'")
        hosts = json.loads(hosts_raw)
        print(f'  Found {len(hosts)} proxy hosts')
        for h in hosts:
            domains = h.get('domain_names', [])
            fwd = f"{h.get('forward_host')}:{h.get('forward_port')}"
            print(f'    {domains} -> {fwd}')

        # Check if thuriban already configured
        existing = [h for h in hosts if any('thuriban' in d for d in h.get('domain_names', []))]
        if existing:
            print('\n  thuriban proxy host already exists!')
        else:
            print('\n=== Adding thuriban proxy host ===')
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
                print(f'  Proxy host created! ID: {host_id}')

                # Now enable SSL with Let's Encrypt
                print('\n=== Enabling SSL (Let\'s Encrypt) ===')
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
                if 'certificate_id' in ssl_obj:
                    print(f'  SSL configured! Certificate ID: {ssl_obj["certificate_id"]}')
                else:
                    print(f'  SSL response: {ssl_result[:300]}')
            else:
                print(f'  Error: {result[:300]}')
        break
    else:
        print(f'  Failed: {resp[:100]}')

ssh.close()
