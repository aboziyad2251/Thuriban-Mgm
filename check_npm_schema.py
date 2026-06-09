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

print('=== NPM user table schema ===')
print(run("""python3 -c "
import sqlite3
conn = sqlite3.connect('/opt/npm/data/database.sqlite')
print(conn.execute('PRAGMA table_info(user)').fetchall())
conn.close()
" """))

print('\n=== NPM user row ===')
print(run("""python3 -c "
import sqlite3
conn = sqlite3.connect('/opt/npm/data/database.sqlite')
row = conn.execute('SELECT * FROM user LIMIT 1').fetchone()
print(row)
conn.close()
" """))

print('\n=== Node bcrypt modules in NPM container ===')
print(run("docker exec nginx_proxy_manager find /app/node_modules -name 'bcrypt*' -maxdepth 2 2>/dev/null | head -10"))

print('\n=== Try node bcrypt hash ===')
print(run("""docker exec nginx_proxy_manager node -e "
try {
  const b = require('/app/node_modules/bcryptjs');
  b.hash('test123',10).then(h=>process.stdout.write(h+'\\n'));
} catch(e) { console.log('bcryptjs err:', e.message); }
try {
  const b = require('/app/node_modules/bcrypt');
  b.hash('test123',10).then(h=>process.stdout.write(h+'\\n'));
} catch(e2) { console.log('bcrypt err:', e2.message); }
" 2>&1"""))

ssh.close()
