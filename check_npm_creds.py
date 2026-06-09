import sys, io, time, re
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

print('=== NPM admin user from DB ===')
# NPM uses SQLite at /data/database.sqlite inside the container
print(run("""docker exec nginx_proxy_manager sqlite3 /data/database.sqlite \
  "SELECT email, nickname FROM user WHERE id=1;" 2>&1"""))

print('\n=== Find NPM data dir ===')
print(run("docker inspect nginx_proxy_manager --format '{{json .Mounts}}' | python3 -c \"import sys,json; [print(m['Source'],'->',m['Destination']) for m in json.load(sys.stdin)]\""))

print('\n=== NPM env compose ===')
print(run("find /opt /root -maxdepth 3 -name '*.yml' -exec grep -l 'nginx_proxy_manager\|NPM\|proxy.manager' {} \\; 2>/dev/null"))

ssh.close()
