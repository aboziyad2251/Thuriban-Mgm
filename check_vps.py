import sys, io, time
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
import paramiko, re

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
    result = re.sub(r'\x1b\[[0-9;?]*[A-Za-z]', '', out.decode('utf-8', errors='replace'))
    return result.strip()

print('=== ALL DOCKER NETWORKS ===')
print(run("docker network ls"))

print('\n=== RUNNING CONTAINERS ===')
print(run("docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}'"))

print('\n=== TRAEFIK CONTAINER (if any) ===')
print(run("docker inspect $(docker ps -q --filter name=traefik) 2>/dev/null | python3 -c \"import sys,json; c=json.load(sys.stdin); [print('Network:', list(c[0]['NetworkSettings']['Networks'].keys())) if c else print('no traefik')]\" 2>/dev/null || echo 'traefik not running'"))

print('\n=== TRAEFIK COMPOSE FILES ===')
print(run("find /opt /root /home -maxdepth 3 -name 'docker-compose*' 2>/dev/null | head -20"))

ssh.close()
