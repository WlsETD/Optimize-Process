# 一次產生連續 N 個月（亂數種子）：python3 gen50.py 2026 12 50 out50
import sys, json, random, os
import gen_month as G
y, m, n, outdir = int(sys.argv[1]), int(sys.argv[2]), int(sys.argv[3]), sys.argv[4]
R = random.SystemRandom(); used = set(); man = []
for i in range(n):
    seed = R.randint(1, 999999)
    while seed in used: seed = R.randint(1, 999999)
    used.add(seed)
    g = G.generate(y, m, seed)
    fn = f'AI模擬月份_{y}-{m:02d}_種子{seed}.xlsx'
    G.write_xlsx(g, os.path.join(outdir, fn))
    s = g['sales']
    man.append(dict(i=i + 1, ym=f'{y}-{m:02d}', seed=seed, file=fn, workdays=sum(1 for d in g['days'] if not d['off']),
                    sales=g['sales'], floor=g['floor'], money=g['money'], events=g['events'], totals=g['totals']))
    m += 1
    if m > 12: m = 1; y += 1
json.dump(man, open(os.path.join(outdir, 'manifest.json'), 'w'), ensure_ascii=False, indent=1)
print(len(man), man[0]['ym'], man[-1]['ym'])
