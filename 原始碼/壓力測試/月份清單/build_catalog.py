# python3 tools/build_catalog.py → parts/17a_catalog.js
# 輸入：/tmp/cat/months.json（catalog_extract.js 用模擬器自己的 parseMonthBook 解析的 Excel）、/tmp/res50/*.json（eval50.js 的評估結果）
# 成績：綠＝只靠系統（額外 0 人時）達標；黃＝要額外 210 人時才達標；紅＝210 人時也達不到。
# 達標＝出貨 ≥ 該月導入前 × 1.1（九月用個案 125.4）、準時率 ≥ 90%、最忙站 ≤ 100%（presetSearch 已含）。
import json, os, io
here = os.path.dirname(os.path.abspath(__file__))
months = json.load(open('/tmp/cat/months.json', encoding='utf-8'))
by_n = {m['n']: m for m in months}
r1 = lambda x: None if x is None else round(x, 1)
r3 = lambda x: None if x is None else round(x, 3)

def rate(res):
    def pack(c):
        if not c: return None
        return {'ship': r1(c['rows']['ship']), 'otd': r3(c['rows']['otd']), 'bu': r3(c['bu']), 'ids': c['ids'].split('+'), 's': c['s']}
    s0, s2 = pack(res['std0']), pack(res['std210'])
    lvl = 'g' if s0 else ('y' if s2 else 'r')
    sf = res['sweepExtra']['maxShip'] < res['target']['ship'] - 1e-9      # 210 人時、功能全開，出貨仍到不了目標
    of = res['sweepExtra']['maxOtd'] < res['target']['otd'] - 1e-9        # 準時率仍到不了 90%
    why = None if lvl != 'r' else ('both' if sf and of else 'ship' if sf else 'otd' if of else 'joint')
    return {'lvl': lvl, 'why': why, 'wd': res['workdays'], 'ev': res['base']['rush'], 'r': {'tgt': r1(res['target']['ship']), 'base': [r1(res['base']['ship']), r3(res['base']['otd'])],
            's0': s0, 's2': s2, 'mx': [r1(res['sweepExtra']['maxShip']), r3(res['sweepExtra']['maxOtd'])]}}

entries = []
sept = json.load(open('/tmp/res50/sept.json', encoding='utf-8'))['res']
e = rate(sept); e.update({'ym': '2026/09', 'd': None}); entries.append(e)
for n, m in by_n.items():
    res = json.load(open('/tmp/res50/%02d.json' % n, encoding='utf-8'))['res']
    assert res['ym'] == m['data']['ym'], (n, res['ym'], m['data']['ym'])
    e = rate(res); e.update({'ym': m['data']['ym'], 'd': m['data']}); entries.append(e)
entries.sort(key=lambda e: e['ym'])
cnt = {k: sum(1 for e in entries if e['lvl'] == k) for k in 'gyr'}
js = ('/* ===== 月份清單（資料月份視窗自動讀取，不用選檔）=====\n'
      '   %d 個月：九月（個案）＋ 2026/10、2026/11 與 2026/12～2031/01 的 AI 模擬月份。資料與成績都在這裡，不連網。\n'
      '   成績是用模擬器預先算好的：綠＝只靠系統達標、黃＝要額外 210 人時才達標、紅＝210 人時也達不到。\n'
      '   換了假設（效果係數、強度範圍、210 人時）要重算：tools/build_catalog.py。 */\n'
      'const MONTH_CATALOG = %s;\n') % (len(entries), json.dumps(entries, ensure_ascii=False, separators=(',', ':')))
io.open(os.path.join(here, '..', 'parts', '17a_catalog.js'), 'w', encoding='utf-8', newline='').write(js)
print('entries', len(entries), cnt, 'bytes', len(js.encode('utf-8')))
