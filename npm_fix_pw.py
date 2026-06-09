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

print('=== All tables in NPM DB ===')
print(run("""python3 -c "
import sqlite3
conn = sqlite3.connect('/opt/npm/data/database.sqlite')
tables = conn.execute(\\\"SELECT name FROM sqlite_master WHERE type='table'\\\").fetchall()
for t in tables:
    print(t[0])
    cols = conn.execute(f'PRAGMA table_info({t[0]})').fetchall()
    for c in cols: print('  ', c[1], c[2])
conn.close()
" """))

print('\n=== auth table content ===')
print(run("""python3 -c "
import sqlite3
conn = sqlite3.connect('/opt/npm/data/database.sqlite')
try:
    rows = conn.execute('SELECT * FROM auth LIMIT 5').fetchall()
    for r in rows: print(r)
except Exception as e:
    print('Error:', e)
conn.close()
" """))

ssh.close()
