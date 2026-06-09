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

print('=== NPM DB - admin email ===')
print(run("python3 -c \"import sqlite3; c=sqlite3.connect('/opt/npm/data/database.sqlite'); print(c.execute('SELECT email,nickname FROM user').fetchall())\""))

print('\n=== /opt/npm compose ===')
print(run("ls /opt/npm/"))
print(run("cat /opt/npm/docker-compose.yml 2>/dev/null || cat /opt/npm/*.yml 2>/dev/null || echo 'no compose found'"))

ssh.close()
