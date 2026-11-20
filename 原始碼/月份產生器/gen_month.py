#!/usr/bin/env python3
"""昇嶺電子：AI 模擬新月份產生器（資料全部是模擬，不是企業資料）

用法：python3 gen_month.py --month 2026-10 [--seed 12345] --out 檔名.xlsx

做法：
1. 先抽「這個月碰到什麼狀況」（插單件數、缺料、機台故障、颱風、請假潮……），每次種子不同結果就不同。
2. 月總量依資料1 十二個月擬合出的關係抓目標（換線、等料、拋料故障都和插單件數線性相關），再加上抽到的事件。
3. 逐日分配：週一到週五全天、週六半天、週日與國定假日休；每天的開機＝正常運轉＋三種停機（與資料3 相同的恆等式）。
4. 出貨＝150 片 × 正常運轉小時（資料1 十二個月都在 149.9–150.1）。
5. 準時率用模擬器同一條公式（1.819 − 0.854 × 接單／出貨 − 0.0067 × 插單）再加小擾動。
6. 金額（罰款、客訴處理、加班費）用九月個案單的金額按比例推。
輸出格式與資料1、資料3 相同，模擬器可以直接匯入。
"""
import argparse, calendar, datetime as dt, json, math, random
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment
from openpyxl.utils import get_column_letter

WD = '一二三四五六日'

# 資料1 十二個月（用來擬合客訴關係）
HIST = dict(
    otd=[0.94, 0.94, 0.93, 0.94, 0.95, 0.93, 0.93, 0.92, 0.90, 0.85, 0.81, 0.78],
    rr=[0.03, 0.03, 0.03, 0.03, 0.03, 0.03, 0.03, 0.03, 0.04, 0.05, 0.06, 0.07],
    late=[1, 1, 1, 0, 1, 1, 1, 2, 3, 5, 8, 10],
    qual=[1, 2, 2, 2, 1, 2, 2, 2, 2, 3, 3, 4])


def fit(xs, ys):
    n = len(xs); mx = sum(xs) / n; my = sum(ys) / n
    b = sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / sum((x - mx) ** 2 for x in xs)
    return my - b * mx, b


LATE_FIT = fit([1 - o for o in HIST['otd']], HIST['late'])
QUAL_FIT = fit(HIST['rr'], HIST['qual'])

# 台灣國定假日。2026/10、2026/11 沿用原本的表；2026/12 起用下面的規則推定（都是【我猜的】：實際放假與補班日以行政院每年公告為準）
HOLIDAYS = {
    (2026, 10): {9: '國慶補假', 10: '國慶日'},
    (2026, 11): {},
}
# 農曆節日與清明的日期（農曆用 lunardate 套件算出後寫死，不需要執行時安裝）
LUNAR = {  # 年: (春節初一, 端午, 中秋, 清明日)
    2026: ((2, 17), (6, 19), (9, 25), (4, 5)),
    2027: ((2, 6), (6, 9), (9, 15), (4, 5)),
    2028: ((1, 26), (5, 28), (10, 3), (4, 4)),
    2029: ((2, 13), (6, 16), (9, 22), (4, 4)),
    2030: ((2, 3), (6, 5), (9, 12), (4, 5)),
    2031: ((1, 23), (6, 24), (10, 1), (4, 5)),
}


def holidays_for(year, month):
    """依規則推定該月的放假日：元旦、春節（除夕到初三）、和平紀念日、兒童節與清明、勞動節、端午、中秋、
    教師節、國慶、光復節、行憲紀念日。落在週六→前一個上班日補假；落在週日→後一個上班日補假。【我猜的】"""
    if (year, month) in HOLIDAYS:
        return dict(HOLIDAYS[(year, month)])
    base = []
    for y in (year - 1, year, year + 1):
        if y not in LUNAR: continue
        (cm, cd), (dm, dd), (mm, md), (qm, qd) = LUNAR[y]
        cny = dt.date(y, cm, cd)
        for k, nm in [(-1, '除夕'), (0, '春節'), (1, '春節'), (2, '春節')]:
            base.append((cny + dt.timedelta(days=k), nm))
        base += [(dt.date(y, 1, 1), '元旦'), (dt.date(y, 2, 28), '和平紀念日'),
                 (dt.date(y, qm, qd), '清明節'),
                 (dt.date(y, 4, 3) if (qm, qd) == (4, 4) else dt.date(y, 4, 4), '兒童節'),
                 (dt.date(y, 5, 1), '勞動節'), (dt.date(y, dm, dd), '端午節'), (dt.date(y, mm, md), '中秋節'),
                 (dt.date(y, 9, 28), '教師節'), (dt.date(y, 10, 10), '國慶日'),
                 (dt.date(y, 10, 25), '光復節'), (dt.date(y, 12, 25), '行憲紀念日')]
    off = {}
    for d, nm in sorted(base):
        off.setdefault(d, nm)
    for d, nm in sorted(base):
        w = d.weekday()
        if w in (5, 6):
            step = -1 if w == 5 else 1
            t = d + dt.timedelta(days=step)
            while t in off or t.weekday() in (5, 6):
                t += dt.timedelta(days=step)
            off[t] = nm + '補假'
    return {d.day: nm for d, nm in off.items() if d.year == year and d.month == month}


def r5(x): return int(5 * round(x / 5))
def r10(x): return int(10 * round(x / 10))
def rh(x): return round(x * 2) / 2   # 取到 0.5
def r1(x): return round(x, 1)


def generate(year, month, seed):
    R = random.Random(seed)
    ndays = calendar.monthrange(year, month)[1]
    hol = holidays_for(year, month)
    days = []
    for d in range(1, ndays + 1):
        w = dt.date(year, month, d).weekday()
        days.append(dict(d=d, w=WD[w], off=('休' if w == 6 else hol.get(d))))

    ev_log = []          # 這個月抽到的狀況（寫進說明頁）
    def work(): return [x for x in days if not x['off']]
    def weekdays(): return [x for x in days if not x['off'] and x['w'] != '六']

    # ---------- 1. 抽事件 ----------
    typhoon = R.random() < 0.245 and month in (7, 8, 9, 10)
    if typhoon:
        cand = [x for x in weekdays() if 5 <= x['d'] <= ndays - 5]
        t = R.choice(cand); t['off'] = '颱風假，停班'
        ev_log.append(f"颱風：{month}/{t['d']} 停班一天，隔天物流延誤、等料變多")
    flu = R.random() < 0.325
    flu_days = set()
    if flu:
        s = R.randint(3, ndays - 10)
        flu_days = {x['d'] for x in work() if s <= x['d'] < s + 7}
        eff_drop = R.choice([0.01, 0.01, 0.02])
        ev_log.append(f"請假潮（流感）：{month}/{s} 起約一週，人工站人手少、加班變多，人工效率約 −{int(eff_drop*100)} 個百分點")
    else:
        eff_drop = 0
    pull = R.random() < 0.30
    cut = (not pull) and R.random() < 0.18
    if pull: ev_log.append('客戶甲提前拉貨：接單增加，甲多 1～2 張追加單')
    if cut: ev_log.append('客戶丙延後部分訂單：接單減少')

    # 插單件數：九月 12 件，前三個月 8→10→12 持續上升；這個月在 4～18 之間隨機（平均 11）
    ev = max(4, min(18, round(R.gauss(11, 3.5)))) + (R.randint(1, 2) if pull else 0)
    ev_log.insert(0, f'追加單與換零件：{ev} 件（九月 12 件）')

    # ---------- 2. 插單事件 ----------
    wk = weekdays()
    rush_days = R.sample(wk, min(ev, len(wk)))
    rush_days.sort(key=lambda x: x['d'])
    models = {'甲': ['A1', 'A1', 'A2'], '乙': ['B2', 'B1'], '丙': ['C1', 'C2']}
    later = {}
    for x in rush_days:
        kind_r = R.random()
        if kind_r < 0.62: cust, kind = '甲', '追加'
        elif kind_r < 0.70: cust, kind = '乙', '追加'
        elif kind_r < 0.78: cust, kind = '丙', '追加'
        else: cust, kind = '丙', '換零件'
        m = R.choice(models[cust])
        what = f'追加 {R.choice([200,300,300,400,400,500,600,800])} 片（{m}）' if kind == '追加' else f'換零件（{m}）'
        how = R.choices(['LINE', '正式單', '口頭', '電話'], [0.50, 0.25, 0.15, 0.10])[0]
        nt = R.randint(8 * 60 + 30, 16 * 60 + 30)
        def hm(mm): return f'{mm // 60:02d}:{mm % 60:02d}'
        if how == '正式單':
            delay = R.randint(15, 35); notice = hm(nt); known = hm(nt + delay)
        elif how == '口頭':
            delay = R.randint(60, 360); notice = '沒記錄'; known = hm(min(nt + delay, 17 * 60 + 30))
        else:
            delay = R.randint(60, 300) if how == 'LINE' else R.randint(60, 180)
            notice = hm(nt)
            if nt + delay > 17 * 60 + 20:
                known = f'隔天 {hm(R.randint(8*60, 8*60+40))}'; delay = 17 * 60 + 30 - nt + 15 * 60
            else:
                known = hm(nt + delay)
        result = None
        informal = how != '正式單'
        if cust == '甲' and informal and R.random() < 0.6:
            victim = R.choice(['乙', '乙', '丙'])
            wno = f'W{month:02d}{max(1, x["d"] - R.randint(0, 3)):02d}'
            result = f'{victim}的 {wno} 晚 {R.choice([1,1,2])} 天' + ('出貨' if R.random() < 0.3 else '')
        elif kind == '換零件' and informal and R.random() < 0.45:
            result = f'{R.choice([80,120,150,200])} 片拆掉重做'
        elif kind == '換零件' and R.random() < 0.4:
            result = f'換線 {R.choice([1.5, 2])} 小時'
        elif how == '正式單' and R.random() < 0.6:
            result = '準時'
        x['rush'] = dict(what=what, cust=cust, how=how, notice=notice, known=known, result=result,
                         informal=informal, delay=delay)

    # ---------- 3. 逐日停機 ----------
    nwork = len(work()); scale = nwork / 26
    T_co = (36.5 + 9.33 * ev) * scale + R.gauss(0, 4)
    T_mw = (20.7 + 3.72 * ev) * scale + R.gauss(0, 3)
    T_fl = (18.6 + 2.38 * ev) * scale + R.gauss(0, 2)

    sat = [x for x in work() if x['w'] == '六']
    wkd = [x for x in work() if x['w'] != '六']
    for x in sat: x['co'] = R.choice([2, 2, 2, 3])
    for x in wkd:
        x['co_extra'] = (R.randint(2, 4) if x.get('rush') else 0)
    base_co = (T_co - sum(x['co'] for x in sat) - sum(x['co_extra'] for x in wkd)) / len(wkd)
    for x in wkd: x['co'] = max(3, round(base_co + R.gauss(0, 0.6)) + x['co_extra'])
    for x in work():
        x['coH'] = max(1.5, rh(x['co'] * R.uniform(0.84, 0.96) + (1 if R.random() < 0.06 else 0)))

    # 等料：插單日（非正式、晚知道）多；其餘平均分攤
    for x in work():
        r = x.get('rush')
        x['mw_extra'] = (R.uniform(1.0, 3.0) * (1.4 if r['informal'] else 0.6) if r else 0)
    base_mw = max(0.3, (T_mw - sum(x['mw_extra'] for x in work())) / (len(wkd) + 0.4 * len(sat)))
    for x in work():
        b = base_mw * (0.4 if x['w'] == '六' else 1)
        x['mwH'] = max(0.5, rh(b + x['mw_extra'] + R.gauss(0, 0.35)))
    for x in work():
        x['flH'] = 0
    base_fl = T_fl / (len(wkd) + 0.55 * len(sat))
    for x in work():
        b = base_fl * (0.55 if x['w'] == '六' else 1) + (0.4 if x.get('rush') else 0)
        x['flH'] = max(0.5, rh(b + R.gauss(0, 0.3)))

    notes = {}
    def note(x, s):
        notes.setdefault(x['d'], []).append(s)

    # 颱風隔天
    if typhoon:
        tday = next(x for x in days if x['off'] == '颱風假，停班')
        nxt = next((x for x in work() if x['d'] > tday['d']), None)
        if nxt:
            nxt['mwH'] = rh(nxt['mwH'] + R.uniform(2, 4)); note(nxt, '颱風後物流晚到，等料')
    # 缺料
    n_short = R.choices([0, 1, 2], [0.325, 0.45, 0.225])[0]
    for _ in range(n_short):
        x = R.choice(wkd); h = R.choice([3, 3, 4, 5])
        m = R.choice(['C1', 'C2', 'A2', 'B2'])
        x['mwH'] = rh(x['mwH'] + h + R.uniform(0, 1.5)); note(x, f'{m} 等料，停線 {h} 小時')
        ev_log.append(f'供應商缺料：{month}/{x["d"]} {m} 停線 {h} 小時')
    # 機台故障
    if R.random() < 0.475:
        x = R.choice(wkd); h = R.uniform(3, 6); ln = R.randint(1, 4)
        x['flH'] = rh(x['flH'] + h)
        s = R.choice([f'（隔天補寫）{ln} 線拋料停機', f'{ln} 線回焊爐溫度異常，停機', f'{ln} 線貼片機吸嘴卡料'])
        note(x, s); ev_log.append(f'機台故障：{month}/{x["d"]} {ln} 線約 {h:.1f} 小時')
    # 跳電
    if R.random() < 0.145:
        x = R.choice(wkd); x['flH'] = rh(x['flH'] + R.uniform(1.5, 2.5))
        note(x, '跳電，全線重開機'); ev_log.append(f'跳電：{month}/{x["d"]} 全線重開機')
    # 品質異常
    quality = R.random() < 0.375
    qday = R.choice(wkd) if quality else None
    if quality:
        ev_log.append(f'品質異常：{month}/{qday["d"]} 重測大增')
    # 週六保養
    pm_day = None
    if R.random() < 0.25 and sat:
        pm_day = R.choice(sat); note(pm_day, '4 線保養'); ev_log.append(f'預防保養：{month}/{pm_day["d"]}（週六）4 線不開')

    # ---------- 4. 運轉、出貨、重測、加班 ----------
    pre_hol = set()
    for x in days:
        if x['off'] and x['off'] not in ('休',) and '颱風' not in x['off']:
            prev = [y for y in work() if y['d'] < x['d']]
            if prev: pre_hol.add(prev[-1]['d'])
    for x in work():
        satd = x['w'] == '六'
        stops = x['coH'] + x['mwH'] + x['flH']
        R0 = R.gauss(15.2, 0.35) if satd else R.gauss(33.4, 0.3)
        base = 3.5 if satd else 6.5
        if x is pm_day: R0 *= 0.75
        u = R.uniform(0.25, 0.6)
        run = R0 - u * max(0, stops - base) + (0.8 if x['d'] in pre_hol else 0)
        x['run'] = r1(max(0.5 * R0, run))
        x['open'] = r1(x['run'] + stops)
        x['ship'] = int(25 * round(150 * x['run'] / 25))
        x['ret'] = r10(130 + 30 * x['co'] + R.gauss(0, 8))
        if x is qday:
            x['ret'] += r10(R.uniform(250, 400))
            note(x, R.choice(['測試：機台怪怪的，重測', f'乙退回 {R.choice([10,20,30])} 片重測', '首件不良，整批重測']))
        if satd:
            ot = R.uniform(240, 280) + (15 if typhoon else 0)
        else:
            ot = 95 + 2.8 * stops + R.gauss(0, 4)
            if x['d'] in flu_days: ot += 10
            if x['d'] in pre_hol: ot += 15
            ot = min(150, max(100, ot))
        x['ot_w'] = ot
    # 加班月總量：資料1 十二個月「加班 vs 三種停機合計」的關係（2025/10 停機 94 h → 1,700 h；2026/09 243 h → 3,700 h），
    # 再依上面的日型態（平日看停機、週六較多）分到每天
    tot_stop = sum(x['coH'] + x['mwH'] + x['flH'] for x in work())
    T_ot = 440 + 13.4 * tot_stop + R.gauss(0, 60) + (80 if flu else 0)
    # 上限：全廠約 100 人〔個案單〕× 勞基法每人每月加班 46 h ≈ 4,600 h；實務抓 4,000 h 左右就排不出人【我猜的】
    cap = R.uniform(3900, 4100)
    if T_ot > cap:
        short = T_ot - cap; T_ot = cap
        cut_run = short / 100 * 1.5                     # 每少 100 h 加班，SMT 少跑約 1.5 h【我猜的】
        wl = [x for x in work() if x['w'] != '六']
        for x in wl:
            x['run'] = r1(x['run'] - cut_run / len(wl)); x['open'] = r1(x['run'] + x['coH'] + x['mwH'] + x['flH'])
            x['ship'] = int(25 * round(150 * x['run'] / 25))
        ev_log.append(f'加班排不出人：需要約 {T_ot + short:,.0f} h，只排得出約 {cap:,.0f} h，SMT 少跑約 {cut_run:.0f} h')
    k = T_ot / sum(x['ot_w'] for x in work())
    for x in work():
        x['ot'] = r5(x['ot_w'] * k)

    # ---------- 5. 課長備註 ----------
    for x in work():
        r = x.get('rush'); ns = notes.get(x['d'], [])
        if r and not ns:
            if r['cust'] == '甲':
                ns.append(R.choice(['甲的先做', '老闆說先做', 'SMT 排滿，乙的往後', '客戶甲的先做']))
            elif r['what'].startswith('換零件'):
                ns.append(R.choice(['換線', '舊料退庫', f'舊料已貼 {R.choice([80,120,150])} 片']))
            else:
                ns.append('照排')
        if x['d'] in flu_days and R.random() < 0.5:
            ns.append('請假多，插件站人手不夠')
        if x['d'] in pre_hol: ns.append('連假前趕貨')
        if not ns:
            if x['w'] == '六':
                ns.append(R.choice(['加班', '加班趕乙的', '加班補料', None]))
            else:
                stops = x['coH'] + x['mwH'] + x['flH']
                if stops > 10: ns.append(R.choice(['等料', '換線等飛達', '夾具不夠', '夾具借走了']))
                else: ns.append(R.choice([None, None, None, '正常', '照排', '換線後首件不良，重測']))
        ns = [s for s in ns if s]
        x['note'] = '。'.join(ns) if ns else None

    # ---------- 6. 月總量 ----------
    W = work()
    ship = sum(x['ship'] for x in W)
    ot = sum(x['ot'] for x in W)
    ret = sum(x['ret'] for x in W)
    co = sum(x['co'] for x in W)
    F = dict(open=r1(sum(x['open'] for x in W)), run=r1(sum(x['run'] for x in W)),
             coH=r1(sum(x['coH'] for x in W)), mwH=r1(sum(x['mwH'] for x in W)), flH=r1(sum(x['flH'] for x in W)))
    orders = round(R.gauss(125, 4) + (R.uniform(4, 8) if pull else 0) - (R.uniform(4, 8) if cut else 0))
    ratio = orders / (ship / 1000)
    if ratio > 1.114:   # 超出十二個月範圍（1.009～1.114）時減半外推，避免公式掉得太誇張
        ratio = 1.114 + 0.5 * (ratio - 1.114)
    otd = 1.819 - 0.854 * ratio - 0.0067 * ev + R.gauss(0, 0.006) - (0.01 if typhoon else 0)
    otd = round(min(0.97, max(0.60, otd)), 2)
    rr = ret / ship
    late = max(0, round(LATE_FIT[0] + LATE_FIT[1] * (1 - otd) + R.gauss(0, 0.8)))
    qual = max(0, round(QUAL_FIT[0] + QUAL_FIT[1] * rr + R.gauss(0, 0.6)) + (1 if quality else 0))
    eff = round(min(0.97, max(0.92, 0.96 - eff_drop + R.gauss(0, 0.004))), 2)

    # 金額（以九月個案單金額按比例推；都是模擬）
    pen = 590000 * (1 - otd) / (1 - 0.78) * R.uniform(0.85, 1.15)
    share_b = R.uniform(0.62, 0.78)
    pen_b = round(pen * share_b, -3); pen_c = round(pen * (1 - share_b), -3)
    claim = round(250000 * (late + qual) / 14 * R.uniform(0.85, 1.15), -3)
    otcost = round(max(0, ot - 1800) * 268, -3)
    oA = round(min(0.99, otd + R.uniform(0.07, 0.11)), 2)
    oB = round(max(0.4, otd - R.uniform(0.05, 0.09)), 2)
    oC = round(max(0.4, otd - R.uniform(0.07, 0.11)), 2)

    return dict(year=year, month=month, seed=seed, days=days, ev=ev, events=ev_log,
                sales=[orders, ev, round(ship / 1000, 1), otd, ot, round(rr, 3), late + qual, late, qual],
                floor=[eff, F['open'], F['run'], round(F['run'] / F['open'], 2), co, F['coH'], F['mwH'], F['flH']],
                money=dict(pen_b=pen_b, pen_c=pen_c, claim=claim, otcost=otcost),
                cust_otd=dict(甲=oA, 乙=oB, 丙=oC), totals=dict(ship=ship, ot=ot, ret=ret, co=co))


# ---------------- 寫 Excel ----------------
HDR = Font(name='Arial', bold=True)
F_ = Font(name='Arial')
TAG = Font(name='Arial', bold=True, color='C05000')
HFILL = PatternFill('solid', start_color='DDE6F0')


def ws_rows(ws, rows, header=True):
    for i, r in enumerate(rows, 1):
        for j, v in enumerate(r, 1):
            c = ws.cell(i, j, v); c.font = HDR if (header and i == 1) else F_
            if header and i == 1: c.fill = HFILL; c.alignment = Alignment(wrap_text=True, vertical='center')


def autow(ws, widths):
    for i, w in enumerate(widths, 1): ws.column_dimensions[get_column_letter(i)].width = w


def write_xlsx(g, path):
    y, m = g['year'], g['month']; ym = f'{y}/{m:02d}'
    wb = openpyxl.Workbook()
    # 說明
    ws = wb.active; ws.title = '說明'
    lines = [
        (f'昇嶺電子：{ym} 模擬月份資料【AI模擬】', TAG),
        ('這份資料是 AI 隨機產生的，不是企業資料。格式與資料1、資料3 相同，可匯入「工廠流水線實戰模擬」。', F_),
        (None, F_),
        (f'月份：{ym}　隨機種子：{g["seed"]}（同一個種子會產生完全相同的資料）', F_),
        (f'產生時間：{dt.datetime.now():%Y-%m-%d %H:%M}', F_),
        (None, F_),
        ('這個月抽到的狀況', HDR),
    ] + [('・' + e, F_) for e in g['events']] + [
        (None, F_),
        ('怎麼產生的', HDR),
        ('1. 先抽事件：插單件數在 4～18 件之間、平均 11 件（九月 12 件）；颱風、請假潮、缺料、機台故障、跳電、品質異常、週六保養、客戶拉貨或延後各有機率。機率是【我猜的】。', F_),
        ('2. 月總量照資料1 十二個月擬合出的關係抓目標：換線 ＝ 36.5 ＋ 9.33 × 插單；等料 ＝ 20.7 ＋ 3.72 × 插單；拋料故障 ＝ 18.6 ＋ 2.38 × 插單（依工作天數比例調整），再加隨機誤差與抽到的事件。', F_),
        ('3. 逐日：週一到週五全天、週六半天；週日與國定假日休（週六遇國定假日，前一個週五補假，依台灣放假規則推定）。每天 開機 ＝ 正常運轉 ＋ 換線停機 ＋ 等料停機 ＋ 拋料故障停機（與資料3 相同）。', F_),
        ('4. 正常運轉：平日約 33.4 h、週六約 15.2 h（資料3 九月無插單日的水準），停機多的日子只補回一部分（隨機 40～75%）。', F_),
        ('5. 出貨 ＝ 150 片 × 正常運轉小時（資料1 十二個月都在 149.9～150.1），取到 25 片。', F_),
        ('6. 重測 ＝ 130 ＋ 30 × 換線次數（資料3 九月一般日的關係），品質異常日另加 250～400 片。', F_),
        ('7. 加班：月總量 ＝ 440 ＋ 13.4 × 三種停機合計（資料1：2025/10 停機 94 h、加班 1,700 h；2026/09 停機 243 h、加班 3,700 h）＋ 隨機誤差；再照資料3 九月的日型態分到每天（平日停機多的日子多、週六最多），請假潮、連假前會多一些。上限約 4,000 h（全廠約 100 人 × 勞基法每人每月 46 h ≈ 4,600 h，實務排不滿，【我猜的】）；超過的部分排不出人，每少 100 h，SMT 少跑約 1.5 h【我猜的】。', F_),
        ('8. 準時交貨率 ＝ 1.819 − 0.854 × 接單／出貨 − 0.0067 × 插單（模擬器同一條公式）＋ 小擾動。接單在 125 千片附近隨機。接單／出貨超出十二個月範圍（1.009～1.114）時，超出的部分只算一半，準時率最低 60%（避免公式外推過頭，這是【我猜的】）。', F_),
        ('9. 客訴：交期客訴、品質客訴分別照資料1 十二個月和「1 − 準時率」、「重測比率」的關係，再加隨機誤差。', F_),
        ('10. 金額：罰款 ＝ 九月 59 萬 ×（1 − 準時率）÷ 22% × 隨機 0.85～1.15；客訴處理 ＝ 九月 25 萬 × 客訴件數 ÷ 14 × 隨機；加班費多出 ＝（加班 − 1,800 h）× 268 元（個案單：九月比四月多 1,900 h、51 萬）。比例推算方式是【我猜的】。', F_),
        ('11. 分客戶準時率：甲比全廠高 7～11 個百分點、乙低 5～9、丙低 7～11（九月 87／71／69 的差距）。', F_),
        (None, F_),
        ('注意', HDR),
        ('・數字是模擬的練習資料，用來測試模擬器在不同月份是否站得住，不能當成企業實績引用。', F_),
        ('・產銷概況的出貨取到 0.1 千片（資料1 原檔是整數），讓月合計與每日加總一致。', F_),
    ]
    for i, (t, f) in enumerate(lines, 1):
        c = ws.cell(i, 1, t); c.font = f; c.alignment = Alignment(wrap_text=True, vertical='top')
    ws.column_dimensions['A'].width = 120

    # 每日紀錄
    ws = wb.create_sheet('每日紀錄')
    rows = [['日期', '星期', '出貨（片）', '加班（小時）', 'SMT 換線（次）', '重測（片）', '課長備註（原文）', '追加單或換零件', '客戶', '怎麼通知', '通知時間', '現場知道的時間', '後來怎樣']]
    for x in g['days']:
        date = dt.datetime(y, m, x['d'])
        if x['off']:
            rows.append([date, x['w'], None, None, None, None, x['off'], None, None, None, None, None, None]); continue
        r = x.get('rush') or {}
        rows.append([date, x['w'], x['ship'], x['ot'], x['co'], x['ret'], x['note'], r.get('what'), r.get('cust'), r.get('how'), r.get('notice'), r.get('known'), r.get('result')])
    t = g['totals']
    rows.append(['合計', None, t['ship'], t['ot'], t['co'], t['ret'], None, f'{g["ev"]} 筆', None, None, None, None, None])
    rows += [[None] * 13, ['來源：AI 模擬產生【AI模擬】，不是企業資料。生成方式見「說明」頁。'] + [None] * 12,
             ['課長備註是空格的，代表課長當天沒有寫。'] + [None] * 12]
    ws_rows(ws, rows)
    for row in ws.iter_rows(min_row=2, max_col=1):
        for c in row:
            if isinstance(c.value, dt.datetime): c.number_format = 'yyyy/m/d'
    autow(ws, [11, 6, 10, 10, 12, 9, 40, 18, 6, 9, 10, 14, 22])
    ws.freeze_panes = 'A2'

    # SMT
    ws = wb.create_sheet('SMT開機與停機')
    rows = [['日期', '開機（小時）', '正常運轉（小時）', '稼動率', '換線（次）', '換線停機（小時）', '等料停機（小時）', '拋料與故障停機（小時）']]
    for x in g['days']:
        if x['off']: continue
        rows.append([dt.datetime(y, m, x['d']), x['open'], x['run'], round(x['run'] / x['open'], 2), x['co'], x['coH'], x['mwH'], x['flH']])
    f = g['floor']
    rows.append(['合計', f[1], f[2], f[3], f[4], f[5], f[6], f[7]])
    rows += [[None] * 8, ['來源：AI 模擬產生【AI模擬】。4 條線加起來；週日與國定假日休。'] + [None] * 7]
    ws_rows(ws, rows)
    for row in ws.iter_rows(min_row=2, max_col=1):
        for c in row:
            if isinstance(c.value, dt.datetime): c.number_format = 'yyyy/m/d'
    for row in ws.iter_rows(min_row=2, min_col=4, max_col=4):
        for c in row:
            if isinstance(c.value, float): c.number_format = '0%'
    autow(ws, [11, 12, 15, 8, 10, 15, 15, 20]); ws.freeze_panes = 'A2'

    # 產銷概況 / 現場概況（一列，欄位同資料1）
    ws = wb.create_sheet('產銷概況')
    ws_rows(ws, [['月份', '接單（千片）', '追加單與換零件（次）', '出貨（千片）', '準時交貨率', '加班（小時）', '重測比率', '客訴合計（件）', '客訴：交期（件）', '客訴：品質（件）'],
                 [ym] + g['sales'], [None] * 10, ['來源：AI 模擬產生【AI模擬】。'] + [None] * 9])
    ws['E2'].number_format = '0%'; ws['G2'].number_format = '0.0%'
    autow(ws, [9, 12, 18, 12, 11, 11, 9, 13, 14, 14])
    ws = wb.create_sheet('現場概況')
    ws_rows(ws, [['月份', '人工效率', 'SMT 開機（小時）', 'SMT 正常運轉（小時）', 'SMT 稼動率', '換線（次）', '換線停機（小時）', '等料停機（小時）', '拋料與故障停機（小時）'],
                 [ym] + g['floor'], [None] * 9, ['來源：AI 模擬產生【AI模擬】。'] + [None] * 8])
    ws['B2'].number_format = '0%'; ws['E2'].number_format = '0%'
    autow(ws, [9, 9, 14, 18, 11, 9, 15, 15, 20])

    # 損失與客戶
    ws = wb.create_sheet('損失與客戶')
    mo = g['money']; co = g['cust_otd']
    ws_rows(ws, [['項目', '數值', '單位', '怎麼來的'],
                 ['延遲罰款：乙', mo['pen_b'], '元', '九月 59 萬按（1 − 準時率）比例推，再隨機分給乙、丙【AI模擬】'],
                 ['延遲罰款：丙', mo['pen_c'], '元', '同上【AI模擬】'],
                 ['客訴處理與退貨', mo['claim'], '元', '九月 25 萬按客訴件數比例推【AI模擬】'],
                 ['比四月多出的加班費', mo['otcost'], '元', '（加班 − 1,800 h）× 268 元【AI模擬】'],
                 ['準時交貨率：甲', co['甲'], '', '比全廠高 7～11 個百分點【AI模擬】'],
                 ['準時交貨率：乙', co['乙'], '', '比全廠低 5～9 個百分點【AI模擬】'],
                 ['準時交貨率：丙', co['丙'], '', '比全廠低 7～11 個百分點【AI模擬】']])
    for r in range(2, 6): ws.cell(r, 2).number_format = '#,##0'
    for r in range(6, 9): ws.cell(r, 2).number_format = '0%'
    autow(ws, [20, 12, 6, 60])
    wb.save(path)


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--month', default='2026-10')
    ap.add_argument('--seed', type=int, default=None)
    ap.add_argument('--out', default=None)
    ap.add_argument('--json', default=None)
    a = ap.parse_args()
    y, m = map(int, a.month.split('-'))
    seed = a.seed if a.seed is not None else random.SystemRandom().randint(1, 999999)
    g = generate(y, m, seed)
    out = a.out or f'AI模擬月份_{y}-{m:02d}_種子{seed}.xlsx'
    write_xlsx(g, out)
    if a.json:
        json.dump({k: v for k, v in g.items() if k != 'days'}, open(a.json, 'w'), ensure_ascii=False, indent=1)
    print(out)
    print(json.dumps(dict(sales=g['sales'], floor=g['floor'], money=g['money'], cust=g['cust_otd'], events=g['events']), ensure_ascii=False))
