"""Package source + built web assets without credentials, databases or caches."""
from pathlib import Path
import hashlib
import tarfile
import os
import io

root = Path(__file__).resolve().parent.parent
output = root / 'outputs' / 'release'
output.mkdir(parents=True, exist_ok=True)
folders = ['app', 'components', 'hooks', 'lib', 'db', 'drizzle', 'selfhost', 'backend', 'deploy', 'docs', 'scripts', 'vendor', 'build', 'mobile', 'tests', 'dist-selfhost']
files = ['package.json', 'package-lock.json', 'tsconfig.json', 'vite.selfhost.config.ts', 'vite.config.ts', 'postcss.config.mjs', 'eslint.config.mjs', 'next-env.d.ts', 'next.config.ts', 'cloudflare-env.d.ts', 'drizzle.config.ts', 'README.md', '.dockerignore', '.npmrc', '.openai/hosting.json']
excluded = {'node_modules', '.git', '.expo', '.wrangler', '.sites-runtime', 'android', 'ios', 'data', '__pycache__'}
selected = [root / name for name in files if (root / name).is_file()]
for folder in folders:
    for current, dirs, names in os.walk(root / folder):
        dirs[:] = [d for d in dirs if d not in excluded and not (folder == 'mobile' and d == 'dist')]
        for name in names:
            file = Path(current) / name
            if name.startswith('.env') or name in {'.dev.vars', 'wrangler.jsonc', 'preview-selfhost.mjs'}:
                continue
            if file.suffix in {'.sqlite', '.sqlite3', '.db', '.pem', '.key', '.p12', '.jks', '.keystore', '.log', '.tsbuildinfo'} or name.endswith(('-wal', '-shm', '-journal')):
                continue
            selected.append(file)
archive = output / 'GroSuite-0.2.0-server.tar.gz'
with tarfile.open(archive, 'w:gz') as tar:
    for file in sorted(set(selected)):
        if file.is_symlink():
            raise ValueError(f'Release must not contain symlinks: {file}')
        info = tar.gettarinfo(file, arcname='grosuite/' + file.relative_to(root).as_posix())
        info.uid = info.gid = 0
        info.uname = info.gname = ''
        info.mode = 0o755 if file.suffix == '.sh' else 0o644
        contents = file.read_bytes()
        if file.suffix == '.sh':
            contents = contents.replace(b'\r\n', b'\n')
        info.size = len(contents)
        tar.addfile(info, io.BytesIO(contents))
with tarfile.open(archive, 'r:gz') as tar:
    names = tar.getnames()
    assert len(names) == len(set(names))
    assert 'grosuite/mobile/src/model.ts' in names
    assert 'grosuite/deploy/setup.sh' in names
    assert 'grosuite/dist-selfhost/index.html' in names
    assert not any('/node_modules/' in n or '/.env' in n or n.endswith('.sqlite') for n in names)
    assert not any('preview-selfhost' in n or '/.sites-runtime/' in n or n.endswith(('-wal', '-shm', '-journal')) for n in names)
    for member in tar.getmembers():
        assert member.isfile() and not member.name.startswith('/') and '..' not in Path(member.name).parts
        if member.name.endswith('.sh'):
            assert member.mode == 0o755 and b'\r' not in tar.extractfile(member).read()
digest = hashlib.sha256(archive.read_bytes()).hexdigest()
archive.with_suffix(archive.suffix + '.sha256').write_text(digest + '  ' + archive.name + '\n', encoding='utf-8', newline='\n')
print(f'{archive}\n{len(names)} files; {archive.stat().st_size:,} bytes\nSHA-256 {digest}')
