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

print('=== NPM container networks ===')
print(run("docker inspect nginx_proxy_manager --format '{{json .NetworkSettings.Networks}}' | python3 -c \"import sys,json; d=json.load(sys.stdin); [print(k) for k in d]\""))

print('\n=== proxy_network inspect ===')
print(run("docker network inspect proxy_network --format '{{range .Containers}}{{.Name}} {{end}}'"))

print('\n=== nazrah docker-compose.yml ===')
print(run("cat /opt/nazrah/docker-compose.yml"))

print('\n=== existing thuriban on remote ===')
print(run("cat /opt/thuriban/docker-compose.yml"))

ssh.close()
