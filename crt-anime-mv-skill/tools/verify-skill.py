import json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # skill root
os.chdir(ROOT)
fail = []

# 1. JSON validity of all four manifests
manifests = ['plugin.json', '.claude-plugin/plugin.json',
             '.claude-plugin/marketplace.json', '.agents/plugins/marketplace.json']
for f in manifests:
    try:
        json.load(open(f, encoding='utf-8'))
    except Exception as e:
        fail.append('JSON %s: %s' % (f, e))
print('1. json:', 'ok' if not fail else 'FAIL')

# 2. every references/*.md cited in SKILL.md resolves
s = open('SKILL.md', encoding='utf-8').read()
refs = sorted(set(re.findall(r'references/([a-z0-9-]+\.md)', s)))
missing = [r for r in refs if not os.path.exists(os.path.join('references', r))]
print('2. refs cited:', refs)
print('   missing:', missing or 'none')
if missing:
    fail.append('missing refs %s' % missing)

# 3. frontmatter name + version
m = re.match(r'^---\r?\n(.*?)\r?\n---', s, re.S)
if not m:
    fail.append('no frontmatter')
else:
    fm = m.group(1)
    name = re.search(r'^name:\s*(\S+)', fm, re.M).group(1)
    ver = re.search(r'version:\s*"?([0-9.]+)', fm)
    ver = ver.group(1) if ver else None
    print('3. frontmatter name=%s version=%s' % (name, ver))
    if name != 'crt-anime-mv':
        fail.append('skill name is %s' % name)
    pv = json.load(open('plugin.json', encoding='utf-8'))['version']
    cv = json.load(open('.claude-plugin/plugin.json', encoding='utf-8'))['version']
    print('   manifest versions: plugin=%s claude-plugin=%s' % (pv, cv))
    if not (ver == pv == cv):
        fail.append('version drift: skill=%s plugin=%s claude=%s' % (ver, pv, cv))

# 4. no stray skill-like files that would create a second skill
extra = []
for dirpath, dirnames, filenames in os.walk('.'):
    dirnames[:] = [d for d in dirnames if d not in ('.git', 'node_modules')]
    for fn in filenames:
        if fn.lower() == 'skill.md':
            p = os.path.relpath(os.path.join(dirpath, fn), '.')
            if p.replace('\\', '/') != 'SKILL.md':
                extra.append(p)
print('4. extra SKILL.md files:', extra or 'none')
if extra:
    fail.append('extra skills: %s' % extra)

# 5. SKILL.md must be at root
print('5. SKILL.md at root:', os.path.exists('SKILL.md'))
if not os.path.exists('SKILL.md'):
    fail.append('SKILL.md not at root')

print()
if fail:
    print('RESULT: FAIL')
    for f in fail:
        print('  -', f)
    sys.exit(1)
print('RESULT: all static checks PASS')
