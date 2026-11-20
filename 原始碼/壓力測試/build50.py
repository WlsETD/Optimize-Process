import json, os, sys
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter as L
from openpyxl.formatting.rule import CellIsRule

OUT = '/home/claude/build50/out'; os.makedirs(OUT + '/逐月', exist_ok=True)
man = json.load(open('/home/claude/monthgen/out50/manifest.json'))
R = {r['i']: json.load(open(f"/tmp/res50/{r['i']:02d}.json"))['res'] for r in man}
FN = {'intake': '單一插單入口', 'gate': '交期試算閘門', 'realsched': '排程用實際換線時間', 'kit': '齊套上線', 'kitsel': '選擇性齊套', 'eta': '料到日確認'}
ORDER = ['intake', 'gate', 'realsched', 'kit', 'kitsel', 'eta']
def ids_txt(c):
    if not c: return '找不到組合'
    ids = c['ids'].split('+'); return '＋'.join(FN[x] for x in ORDER if x in ids)

AR = 'Arial'
F = lambda **k: Font(name=AR, size=k.pop('size', 10), **k)
BLUE = F(color='0000FF'); BLK = F(); BOLD = F(bold=True); HDR = F(bold=True, color='FFFFFF'); TTL = F(bold=True, size=14)
HF = PatternFill('solid', start_color='1F3864'); GF = PatternFill('solid', start_color='D9E1F2'); NOTE = F(italic=True, color='595959')
GREEN = PatternFill('solid', start_color='C6EFCE'); RED = PatternFill('solid', start_color='FFC7CE'); GREY = PatternFill('solid', start_color='E7E6E6')
thin = Side(style='thin', color='BFBFBF'); BOX = Border(left=thin, right=thin, top=thin, bottom=thin)
CEN = Alignment(horizontal='center', vertical='center', wrap_text=True); WRAP = Alignment(vertical='top', wrap_text=True)

def cf(ws, rng):
    ws.conditional_formatting.add(rng, CellIsRule(operator='equal', formula=['"達標"'], fill=GREEN))
    ws.conditional_formatting.add(rng, CellIsRule(operator='equal', formula=['"未達標"'], fill=RED))
    ws.conditional_formatting.add(rng, CellIsRule(operator='equal', formula=['"找不到組合"'], fill=GREY))
    ws.conditional_formatting.add(rng, CellIsRule(operator='equal', formula=['"排不下"'], fill=RED))
    ws.conditional_formatting.add(rng, CellIsRule(operator='equal', formula=['"增加"'], fill=RED))
    ws.conditional_formatting.add(rng, CellIsRule(operator='equal', formula=['"排得下"'], fill=GREEN))
    ws.conditional_formatting.add(rng, CellIsRule(operator='equal', formula=['"不增加"'], fill=GREEN))

# ------------------------------------------------------------------ 逐月檔
METRICS = [  # key, label, unit, fmt, kind  (kind: 'same'=導入後同導入前)
    ('ship', '出貨', '千片', '0.0'), ('otd', '準時交貨率', '%', '0.0%'), ('orders', '接單', '千片', '0'), ('rush', '追加單與換零件', '件', '0'),
    ('co', '換線次數', '次', '0'), ('coH', '換線停機', 'h', '0.0'), ('waitH', '等料停機', 'h', '0.0'), ('faultH', '拋料與故障停機', 'h', '0.0'),
    ('run', 'SMT 正常運轉', 'h', '#,##0'), ('util', 'SMT 稼動率', '%', '0.0%'), ('retest', '重測比率', '%', '0.00%'),
    ('ot', '加班（模型假設不變）【我猜的】', 'h', '#,##0'), ('cLate', '客訴：交期', '件', '0.0'), ('cQual', '客訴：品質', '件', '0.0'), ('cAll', '客訴合計', '件', '0.0'),
    ('penalty', '延遲罰款', '萬元', '0.0'), ('claimC', '客訴處理與退貨', '萬元', '0.0'), ('otCost', '加班費（超過 1,800 h 的部分）', '萬元', '0.0'),
    ('gm', '多出貨帶來的毛利', '萬元', '0.0'), ('value', '每月效益合計（扣系統月費）', '萬元', '0.0')]
SAME = {'orders', 'rush', 'ot', 'otCost'}

def cfg_vals(c, b, key):
    if c is None: return '—'
    if key in SAME: return b[key]
    return c['rows'][key]

def build_month(r):
    i = r['i']; x = R[i]; b = x['base']; t = x['target']
    wb = openpyxl.Workbook(); ws = wb.active; ws.title = '月度指標'
    ws['A1'] = f"月度指標｜{x['ym']}｜種子 {r['seed']}【AI模擬】"; ws['A1'].font = TTL
    ws['A2'] = '練習資料：AI 隨機產生的月份，用昇嶺電子模擬器匯入後跑出來，不是企業實績。藍字＝模擬器的值；黑字＝公式；標【我猜的】＝假設。'; ws['A2'].font = NOTE
    hdr = ['指標', '單位', '導入前（這個月模擬實際）', '目標', '只靠系統\n（人工站額外 0 人時）', f"達標配置\n（人工站額外 {x['std210']['extra'] if x['std210'] else 210} 人時）", '建議配置\n（額外 210 人時、最忙站 ≤95%）']
    for j, h in enumerate(hdr, 1):
        c = ws.cell(4, j, h); c.font = HDR; c.fill = HF; c.alignment = CEN; c.border = BOX
    cfgs = [x['std0'], x['std210'], x['best210']]
    row = 5; pos = {}
    # 配置說明列
    info = [('導入項目', None), ('效果強度', None), ('最忙站稼動率', None)]
    for k, (lab, _) in enumerate(info):
        ws.cell(row, 1, lab).font = BOLD; ws.cell(row, 2, {0: '', 1: '0.50～1.00', 2: '%'}[k]).font = BLK
        for j, c in enumerate(cfgs):
            cell = ws.cell(row, 5 + j)
            if k == 0: cell.value = ids_txt(c)
            elif k == 1: cell.value = c['s'] if c else '—'; cell.number_format = '0.00'
            else: cell.value = c['bu'] if c else '—'; cell.number_format = '0.0%'
            cell.font = BLUE; cell.alignment = CEN; cell.border = BOX
        for jj in (1, 2, 3, 4): ws.cell(row, jj).border = BOX
        pos[['ids', 'str', 'bu'][k]] = row; row += 1
    for key, lab, unit, fmt in METRICS:
        ws.cell(row, 1, lab).font = BOLD; ws.cell(row, 2, unit).font = BLK
        cb = ws.cell(row, 3, b[key] if key in b else None); cb.font = BLUE; cb.number_format = fmt
        if key == 'ship': ws.cell(row, 4, f'=ROUND(C{row}*1.1,1)').number_format = fmt
        elif key == 'otd': ws.cell(row, 4, 0.9).number_format = fmt; ws.cell(row, 4).font = BLUE
        elif key == 'ot': ws.cell(row, 4, f'=C{row}').number_format = fmt
        for j, c in enumerate(cfgs):
            cell = ws.cell(row, 5 + j, cfg_vals(c, b, key)); cell.font = BLUE; cell.number_format = fmt; cell.alignment = Alignment(horizontal='right')
        if key == 'ship' or key == 'ot': ws.cell(row, 4).font = BLK
        for jj in range(1, 8): ws.cell(row, jj).border = BOX
        if key in ('gm', 'value'): ws.cell(row, 3).value = 0
        pos[key] = row; row += 1
    # 判定
    row += 1; ws.cell(row, 1, '判定').font = BOLD; row += 1
    J = {}
    labels = [('ship', '出貨 ≥ 目標'), ('otd', '準時率 ≥ 90%'), ('bu', '最忙站排得下（≤100%）'), ('ot', '加班不增加'), ('all', '總判定')]
    for k, lab in labels:
        ws.cell(row, 1, lab).font = BOLD
        for jj in range(1, 8): ws.cell(row, jj).border = BOX
        J[k] = row; row += 1
    for j in range(3):
        col = L(5 + j)
        ws[f'{col}{J["ship"]}'] = f'=IF(ISNUMBER({col}{pos["ship"]}),IF({col}{pos["ship"]}>=$D${pos["ship"]},"達標","未達標"),"找不到組合")'
        ws[f'{col}{J["otd"]}'] = f'=IF(ISNUMBER({col}{pos["otd"]}),IF({col}{pos["otd"]}>=$D${pos["otd"]},"達標","未達標"),"找不到組合")'
        cap = 0.95 if j == 2 else 1
        ws[f'{col}{J["bu"]}'] = f'=IF(ISNUMBER({col}{pos["bu"]}),IF({col}{pos["bu"]}<={cap},"排得下","排不下"),"找不到組合")'
        ws[f'{col}{J["ot"]}'] = f'=IF(ISNUMBER({col}{pos["ot"]}),IF({col}{pos["ot"]}<=$C${pos["ot"]},"不增加","增加"),"找不到組合")'
        ws[f'{col}{J["all"]}'] = (f'=IF({col}{J["ship"]}="找不到組合","找不到組合",IF(AND({col}{J["ship"]}="達標",{col}{J["otd"]}="達標",{col}{J["bu"]}="排得下",{col}{J["ot"]}="不增加"),"達標","未達標"))')
        for k in J: ws[f'{col}{J[k]}'].font = BLK; ws[f'{col}{J[k]}'].alignment = CEN; ws[f'{col}{J[k]}'].border = BOX
    cf(ws, f'E{J["ship"]}:G{J["all"]}')
    ws.cell(J['all'], 3, '').border = BOX
    # 備註
    row += 1
    notes = ['達標配置：出貨 ≥ 目標、準時率 ≥ 90% 下，最忙站最低的組合；建議配置：最忙站 ≤95%、準時率 ≥ 90% 下出貨最多。',
             '目標出貨＝這個月導入前出貨 × 1.1（沿用個案 +10% 的口徑）。「找不到組合」＝強度 0.50～1.00 內沒有任何導入組合同時符合。',
             f"最少要多少額外人時才找得到達標配置：{x['minExtraH'] if x['minExtraH'] is not None else '加到 2,000 人時仍找不到'}（模擬器結果）。",
             '加班：模型沒有加班輸出，假設維持這個月的值，不宣稱會下降。金額（罰款、客訴處理、毛利、月效益）都按個案單價與比例推算【我猜的】。']
    for n in notes:
        ws.cell(row, 1, n).font = NOTE; ws.merge_cells(start_row=row, start_column=1, end_row=row, end_column=7); ws.cell(row, 1).alignment = WRAP; ws.row_dimensions[row].height = 28; row += 1
    for col, w in zip('ABCDEFG', [30, 11, 22, 11, 26, 26, 30]): ws.column_dimensions[col].width = w
    ws.row_dimensions[4].height = 42; ws.freeze_panes = 'C5'
    # 狀況與說明
    w2 = wb.create_sheet('這個月的狀況')
    w2['A1'] = f"{x['ym']} 抽到的狀況（種子 {r['seed']}）"; w2['A1'].font = TTL
    rows = [('月份', x['ym']), ('種子', r['seed']), ('工作天', x['workdays']), ('追加單與換零件', f"{b['rush']} 件"),
            ('重現指令', f"python gen_month.py --month {r['ym']} --seed {r['seed']}"), ('資料檔', r['file'])]
    for k, (a, v) in enumerate(rows, 3): w2.cell(k, 1, a).font = BOLD; w2.cell(k, 2, v).font = BLK
    w2.cell(10, 1, '事件').font = BOLD
    for k, e in enumerate(r['events'], 11): w2.cell(k, 1, '').font = BLK; w2.cell(k, 2, e).font = BLK
    w2.cell(12 + len(r['events']), 1, '以上都是 AI 模擬【AI模擬】；機率與影響時數是【我猜的】。假日 2026/12 起依規則推定，實際放假以行政院公告為準。').font = NOTE
    w2.column_dimensions['A'].width = 18; w2.column_dimensions['B'].width = 90
    fn = f"月度指標_{r['ym']}_種子{r['seed']}.xlsx"
    wb.save(f'{OUT}/逐月/{fn}'); return fn

files = {}
for r in man: files[r['i']] = build_month(r)
print('逐月檔', len(files))

# ------------------------------------------------------------------ 總表
wb = openpyxl.Workbook()
ws = wb.active; ws.title = '月度指標'
COLS = [  # key, header, group, fmt, width
 ('idx', '序', '', '0', 5), ('ym', '月份', '', '@', 9), ('yr', '年', '', '0', 6), ('seed', '種子', '', '0', 9), ('wd', '工作天', '', '0', 7), ('rush', '插單(件)', '', '0', 7), ('ev', '這個月的狀況', '', '@', 60),
 ('b_orders', '接單(千片)', '導入前（這個月模擬實際）', '0', 9), ('b_ship', '出貨(千片)', '導入前（這個月模擬實際）', '0.0', 9), ('b_otd', '準時率', '導入前（這個月模擬實際）', '0%', 8),
 ('b_ot', '加班(h)', '導入前（這個月模擬實際）', '#,##0', 8), ('b_cAll', '客訴(件)', '導入前（這個月模擬實際）', '0', 7), ('b_co', '換線(次)', '導入前（這個月模擬實際）', '0', 7),
 ('b_wait', '等料停機(h)', '導入前（這個月模擬實際）', '0.0', 9), ('b_util', 'SMT稼動率', '導入前（這個月模擬實際）', '0%', 8), ('b_pen', '罰款(萬)', '導入前（這個月模擬實際）', '0.0', 8),
 ('tgt', '目標出貨(千片)', '目標', '0.0', 10),
 ('s_ids', '導入項目', '只靠系統（人工站額外 0 人時）', '@', 30), ('s_str', '強度', '只靠系統（人工站額外 0 人時）', '0.00', 6), ('s_ship', '出貨(千片)', '只靠系統（人工站額外 0 人時）', '0.0', 9),
 ('s_otd', '準時率', '只靠系統（人工站額外 0 人時）', '0.0%', 8), ('s_bu', '最忙站', '只靠系統（人工站額外 0 人時）', '0%', 7), ('s_res', '判定', '只靠系統（人工站額外 0 人時）', '@', 10),
 ('d_ids', '導入項目', '達標配置（人工站額外 210 人時）', '@', 30), ('d_str', '強度', '達標配置（人工站額外 210 人時）', '0.00', 6), ('d_ship', '出貨(千片)', '達標配置（人工站額外 210 人時）', '0.0', 9),
 ('d_otd', '準時率', '達標配置（人工站額外 210 人時）', '0.0%', 8), ('d_bu', '最忙站', '達標配置（人工站額外 210 人時）', '0%', 7), ('d_co', '換線(次)', '達標配置（人工站額外 210 人時）', '0', 7),
 ('d_cAll', '客訴(件)', '達標配置（人工站額外 210 人時）', '0.0', 7), ('d_val', '月效益(萬)', '達標配置（人工站額外 210 人時）', '0.0', 9), ('d_res', '判定', '達標配置（人工站額外 210 人時）', '@', 10),
 ('g_ids', '導入項目', '建議配置（額外 210 人時、最忙站 ≤95%）', '@', 30), ('g_ship', '出貨(千片)', '建議配置（額外 210 人時、最忙站 ≤95%）', '0.0', 9),
 ('g_otd', '準時率', '建議配置（額外 210 人時、最忙站 ≤95%）', '0.0%', 8), ('g_bu', '最忙站', '建議配置（額外 210 人時、最忙站 ≤95%）', '0%', 7),
 ('x_min', '最少額外人時才達標', '診斷', '#,##0', 12), ('x_maxS0', '額外0人時出貨上限(千片)', '診斷', '0.0', 12), ('x_maxS', '額外210人時出貨上限(千片)', '診斷', '0.0', 12),
 ('x_maxO', '額外210人時準時率上限', '診斷', '0.0%', 12), ('x_ot37', '加班本來就超過3,700h', '診斷', '@', 10), ('x_why', '未達標原因', '診斷', '@', 30), ('file', '逐月檔', '診斷', '@', 40)]
CI = {c[0]: L(k + 1) for k, c in enumerate(COLS)}
# group header row 1, header row 2
prev = None; start = 1
for k, c in enumerate(COLS, 1):
    h = ws.cell(2, k, c[1]); h.font = HDR; h.fill = HF; h.alignment = CEN; h.border = BOX
    ws.column_dimensions[L(k)].width = c[4]
gs = {}
for k, c in enumerate(COLS, 1): gs.setdefault(c[2], []).append(k)
for g, ks in gs.items():
    if not g: continue
    ws.merge_cells(start_row=1, start_column=ks[0], end_row=1, end_column=ks[-1])
    cell = ws.cell(1, ks[0], g); cell.font = BOLD; cell.fill = GF; cell.alignment = CEN
    for kk in ks: ws.cell(1, kk).fill = GF; ws.cell(1, kk).border = BOX
ws.row_dimensions[2].height = 44
FIRST = 3; LAST = FIRST + len(man) - 1
def put(row, key, v, formula=False):
    c = ws[f'{CI[key]}{row}']; c.value = v; fmt = [x for x in COLS if x[0] == key][0][3]
    c.number_format = fmt; c.font = BLK if formula else BLUE; c.border = BOX
    if fmt == '@' or isinstance(v, str): c.alignment = Alignment(vertical='center', wrap_text=(key in ('ev', 's_ids', 'd_ids', 'g_ids')))
    return c
for k, r in enumerate(man):
    row = FIRST + k; x = R[r['i']]; b = x['base']; s0, d, g = x['std0'], x['std210'], x['best210']; q = lambda key: f'{CI[key]}{row}'
    put(row, 'idx', r['i']); put(row, 'ym', x['ym']); put(row, 'yr', f'=VALUE(LEFT({q("ym")},4))', True); put(row, 'seed', r['seed']); put(row, 'wd', x['workdays']); put(row, 'rush', b['rush'])
    put(row, 'ev', '；'.join(r['events']))
    put(row, 'b_orders', b['orders']); put(row, 'b_ship', b['ship']); put(row, 'b_otd', b['otd']); put(row, 'b_ot', b['ot']); put(row, 'b_cAll', b['cAll']); put(row, 'b_co', b['co'])
    put(row, 'b_wait', b['waitH']); put(row, 'b_util', b['util']); put(row, 'b_pen', b['penalty'])
    put(row, 'tgt', f'=ROUND({q("b_ship")}*1.1,1)', True)
    for pre, c in (('s', s0), ('d', d)):
        put(row, pre + '_ids', ids_txt(c)); put(row, pre + '_str', c['s'] if c else '—'); put(row, pre + '_ship', c['rows']['ship'] if c else '—')
        put(row, pre + '_otd', c['rows']['otd'] if c else '—'); put(row, pre + '_bu', c['bu'] if c else '—')
        ship, otd, bu = q(pre + '_ship'), q(pre + '_otd'), q(pre + '_bu')
        put(row, pre + '_res', f'=IF(ISNUMBER({ship}),IF(AND({ship}>={q("tgt")},{otd}>=0.9,{bu}<=1),"達標","未達標"),"找不到組合")', True)
    put(row, 'd_co', d['rows']['co'] if d else '—'); put(row, 'd_cAll', d['rows']['cAll'] if d else '—'); put(row, 'd_val', d['rows']['value'] if d else '—')
    put(row, 'g_ids', ids_txt(g)); put(row, 'g_ship', g['rows']['ship'] if g else '—'); put(row, 'g_otd', g['rows']['otd'] if g else '—'); put(row, 'g_bu', g['bu'] if g else '—')
    put(row, 'x_min', x['minExtraH'] if x['minExtraH'] is not None else '加人也不行')
    put(row, 'x_maxS0', x['sys0']['maxShip']); put(row, 'x_maxS', x['sweepExtra']['maxShip']); put(row, 'x_maxO', x['sweepExtra']['maxOtd'])
    put(row, 'x_ot37', f'=IF({q("b_ot")}>3700,"是","否")', True)
    put(row, 'x_why', f'=IF({q("d_res")}="達標","",IF(AND({q("x_maxS")}<{q("tgt")},{q("x_maxO")}<0.9),"出貨與準時率都到不了",IF({q("x_maxS")}<{q("tgt")},"出貨到不了（SMT／人工站上限）",IF({q("x_maxO")}<0.9,"準時率到不了","兩者無法同時達到"))))', True)
    put(row, 'file', files[r['i']])
    ws.row_dimensions[row].height = 30
cf(ws, f'{CI["s_res"]}{FIRST}:{CI["s_res"]}{LAST}'); cf(ws, f'{CI["d_res"]}{FIRST}:{CI["d_res"]}{LAST}')
ws.freeze_panes = f'H{FIRST}'; ws.auto_filter.ref = f'A2:{L(len(COLS))}{LAST}'
RG = lambda key: f"'月度指標'!${CI[key]}${FIRST}:${CI[key]}${LAST}"

# ---- 總覽
ov = wb.create_sheet('總覽', 0)
ov['A1'] = '昇嶺電子模擬器｜50 個月壓力測試（2026/12～2031/1）'; ov['A1'].font = TTL
ov['A2'] = '50 個月都是 AI 隨機產生的練習資料【AI模擬】，每月獨立抽種子，逐月匯入模擬器後跑出結果。藍字＝模擬器的值；黑字＝公式。'; ov['A2'].font = NOTE
def sec(row, title):
    c = ov.cell(row, 1, title); c.font = HDR; c.fill = HF
    for j in range(2, 5): ov.cell(row, j).fill = HF
def line(row, label, formula, fmt='0', note=None):
    ov.cell(row, 1, label).font = BLK; c = ov.cell(row, 2, formula); c.font = BLK; c.number_format = fmt
    if note: ov.cell(row, 4, note).font = NOTE
    for j in range(1, 3): ov.cell(row, j).border = BOX
    return c
r0 = 4; sec(r0, '一、結果一覽'); ov.cell(r0, 2, '月數').font = HDR; ov.cell(r0, 3, '占比').font = HDR
items = [('模擬月份數', f'=COUNTA({RG("ym")})', None),
         ('導入前準時率 ≥ 90%', f'=COUNTIF({RG("b_otd")},">=0.9")', None),
         ('只靠系統（人工站額外 0 人時）達標', f'=COUNTIF({RG("s_res")},"達標")', None),
         ('達標配置（人工站額外 210 人時）達標', f'=COUNTIF({RG("d_res")},"達標")', None),
         ('找得到建議配置（最忙站 ≤95%）', f'=COUNTIF({RG("g_ids")},"<>找不到組合")', None),
         ('加班本來就超過 3,700 h 的月份', f'=COUNTIF({RG("x_ot37")},"是")', None)]
for k, (lab, f_, _) in enumerate(items, 1):
    row = r0 + k; line(row, lab, f_)
    c = ov.cell(row, 3, f'=B{row}/$B${r0+1}'); c.number_format = '0%'; c.font = BLK; c.border = BOX
ov.cell(r0 + 1, 3).value = None
r1 = r0 + len(items) + 2; sec(r1, '二、達標配置沒達標的 月份 為什麼'); ov.cell(r1, 2, '月數').font = HDR
why = ['出貨到不了（SMT／人工站上限）', '準時率到不了', '出貨與準時率都到不了', '兩者無法同時達到']
for k, w in enumerate(why, 1): line(r1 + k, w, f'=COUNTIF({RG("x_why")},"{w}")')
line(r1 + 5, '合計（應等於未達標月數）', f'=SUM(B{r1+1}:B{r1+4})')
ov.cell(r1 + 6, 1, '核對：未達標月數').font = BLK; ov.cell(r1 + 6, 2, f'=COUNTIF({RG("d_res")},"未達標")+COUNTIF({RG("d_res")},"找不到組合")').font = BLK
r2 = r1 + 8; sec(r2, '三、達標的月份：導入前 → 達標配置（平均）'); ov.cell(r2, 2, '導入前').font = HDR; ov.cell(r2, 3, '達標配置').font = HDR
cmp_ = [('出貨（千片）', 'b_ship', 'd_ship', '0.0'), ('準時率', 'b_otd', 'd_otd', '0.0%'), ('客訴（件）', 'b_cAll', 'd_cAll', '0.0'), ('換線（次）', 'b_co', 'd_co', '0.0')]
for k, (lab, kb, ka, fmt) in enumerate(cmp_, 1):
    row = r2 + k; ov.cell(row, 1, lab).font = BLK
    a = ov.cell(row, 2, f'=AVERAGEIF({RG("d_res")},"達標",{RG(kb)})'); a.number_format = fmt; a.font = BLK
    b2 = ov.cell(row, 3, f'=AVERAGEIF({RG("d_res")},"達標",{RG(ka)})'); b2.number_format = fmt; b2.font = BLK
    for j in range(1, 4): ov.cell(row, j).border = BOX
row = r2 + len(cmp_) + 1; ov.cell(row, 1, '每月效益（萬元，平均）').font = BLK
c = ov.cell(row, 3, f'=AVERAGEIF({RG("d_res")},"達標",{RG("d_val")})'); c.number_format = '0.0'; c.font = BLK
for j in range(1, 4): ov.cell(row, j).border = BOX
ov.cell(row, 4, '含多出貨毛利、少付罰款與客訴處理，扣系統月費 0.6 萬【我猜的】').font = NOTE
r3 = row + 2; sec(r3, '四、各年達標率（達標配置）'); ov.cell(r3, 2, '月數').font = HDR; ov.cell(r3, 3, '達標').font = HDR; ov.cell(r3, 4, '達標率').font = HDR
for k, y in enumerate(range(2026, 2032), 1):
    row = r3 + k; ov.cell(row, 1, y).font = BLK
    ov.cell(row, 2, f'=COUNTIF({RG("yr")},A{row})').font = BLK
    ov.cell(row, 3, f'=COUNTIFS({RG("yr")},A{row},{RG("d_res")},"達標")').font = BLK
    c = ov.cell(row, 4, f'=IF(B{row}=0,"",C{row}/B{row})'); c.number_format = '0%'; c.font = BLK
    for j in range(1, 5): ov.cell(row, j).border = BOX
ov.cell(r3 + 7, 1, '月份互相獨立，年度之間的差異是抽樣誤差，不是趨勢（每年只有 12 個月，2026、2031 各 1 個月）。').font = NOTE
r4 = r3 + 8; sec(r4, '五、哪種月份比較難達標（達標配置）'); ov.cell(r4, 2, '月數').font = HDR; ov.cell(r4, 3, '達標').font = HDR; ov.cell(r4, 4, '達標率').font = HDR
bands = [('工作天 ≤ 21（春節、連假多）', 'wd', '"<=21"', None), ('工作天 22～24', 'wd', '">=22"', '"<=24"'), ('工作天 ≥ 25', 'wd', '">=25"', None),
         ('插單 ≤ 8 件（平靜月）', 'rush', '"<=8"', None), ('插單 9～13 件', 'rush', '">=9"', '"<=13"'), ('插單 ≥ 14 件（插單多）', 'rush', '">=14"', None),
         ('導入前準時率 ≥ 85%（本來就不差）', 'b_otd', '">=0.85"', None), ('導入前準時率 < 70%（很差）', 'b_otd', '"<0.7"', None)]
for k, (lab, key, c1, c2) in enumerate(bands, 1):
    row = r4 + k; ov.cell(row, 1, lab).font = BLK
    crit = f'{RG(key)},{c1}' + (f',{RG(key)},{c2}' if c2 else '')
    ov.cell(row, 2, f'=COUNTIFS({crit})').font = BLK
    ov.cell(row, 3, f'=COUNTIFS({crit},{RG("d_res")},"達標")').font = BLK
    c = ov.cell(row, 4, f'=IF(B{row}=0,"",C{row}/B{row})'); c.number_format = '0%'; c.font = BLK
    for j in range(1, 5): ov.cell(row, j).border = BOX
ov.cell(r4 + len(bands) + 1, 1, '「出貨到不了」＝即使調到最強的組合，出貨也到不了目標；原因是 SMT 運轉時數與人工站時數的上限，多給人時也沒用。').font = NOTE
r5 = r4 + len(bands) + 2; sec(r5, '六、最少要多少額外人時才找得到達標配置'); ov.cell(r5, 2, '值').font = HDR
line(r5 + 1, '有答案的月數（加到 2,000 人時內）', f'=COUNT({RG("x_min")})')
line(r5 + 2, '加人也不行的月數', f'=COUNTIF({RG("x_min")},"加人也不行")')
line(r5 + 3, '中位數（人時／月）', f'=MEDIAN({RG("x_min")})')
line(r5 + 4, '最大值（人時／月）', f'=MAX({RG("x_min")})')
line(r5 + 5, '額外 0 人時就夠的月數', f'=COUNTIF({RG("x_min")},0)')
line(r5 + 6, '額外 ≤ 210 人時就夠的月數', f'=COUNTIF({RG("x_min")},"<=210")')
ov.column_dimensions['A'].width = 44
for col in 'BCD': ov.column_dimensions[col].width = 14
ov.column_dimensions['D'].width = 60
cf(ov, 'A1:A1')

# ---- 說明
rd = wb.create_sheet('說明', 1)
lines = [('這份在做什麼', None),
 ('昇嶺電子案例只給了九月的逐日資料。為了知道模擬器與研究結論「換一個月還站不站得住」，用 AI 產生器隨機產生接下來 50 個月（2026/12～2031/1），逐月匯入模擬器，跑三種配置，記錄月度指標。', None),
 ('怎麼產生', None),
 ('每個月用系統亂數抽一個種子（1～999999，50 個都不同），產生器抽出這個月碰到的狀況（插單件數、颱風、請假潮、缺料、機台故障、跳電、品質異常、週六保養、客戶拉貨或延後），再依資料1 十二個月擬合的關係算出逐日資料。完整參數見使用說明。', None),
 ('月與月之間互相獨立：每個月都是以九月案例為基準抽出來的新狀況，沒有「前一個月導入後這個月變好」的累積效果。', None),
 ('假日：2026/12 起依規則推定（元旦、春節除夕到初三、和平紀念日、兒童節與清明、勞動節、端午、中秋、教師節、國慶、光復節、行憲紀念日；週六遇假日補前一個上班日、週日補後一個上班日）。實際放假與補班日以行政院公告為準【我猜的】。', None),
 ('三種配置', None),
 ('只靠系統：人工站額外可用時數 0，用模擬器「達標配置」按鈕找「出貨 ≥ 目標、準時率 ≥ 90%」下最忙站最低的組合。', None),
 ('達標配置（額外 210 人時）：同上，但人工站每月額外有 210 人時（產線省下人時的一半約 85 ＋ 現有加班改派約 125，都是【我猜的】）。', None),
 ('建議配置（額外 210 人時）：最忙站 ≤95%、準時率 ≥ 90% 下出貨最多，不一定達 +10%。', None),
 ('判定標準', None),
 ('出貨 ≥ 該月導入前出貨 × 1.1；準時率 ≥ 90%；最忙站稼動率 ≤100%（不加人、不加班排得下）；加班不增加（模型沒有加班輸出，假設維持）。', None),
 ('加班：產生器的加班月總量常超過個案單的 3,700 h 上限（上限抽 3,900～4,100 h），「加班本來就超過 3,700 h」欄位標出這些月份。', None),
 ('要小心的地方', None),
 ('1. 這是模擬器對模擬資料的結果，不是企業實績；金額、機率、假日都有【我猜的】成分。', None),
 ('2. 「達標」是在模擬器自己的模型裡成立。模型的換線、等料、故障與插單的關係來自個案十二個月，沒有在其他月份驗證過。', None),
 ('3. 有 6 個月的導入前出貨與產生器內部值差 0.1 千片（四捨五入方式不同），表內以模擬器的值為準。', None),
 ('4. 同一個種子要重現同一份資料，需用目前版本的 gen_month.py（假日規則與事件機率已更新）。', None),
 ('欄位', None),
 ('「月度指標」每月一列；「總覽」用公式統計；「種子與檔案」列出每個月的種子、重現指令與檔名。逐月檔在「月度指標_逐月」資料夾，每月一份。', None)]
for k, (t, _) in enumerate(lines, 1):
    c = rd.cell(k, 1, t); c.alignment = WRAP
    if t in ('這份在做什麼', '怎麼產生', '三種配置', '判定標準', '要小心的地方', '欄位'): c.font = HDR; c.fill = HF
    else: c.font = BLK; rd.row_dimensions[k].height = 42 if len(t) > 80 else 20
rd.column_dimensions['A'].width = 120

# ---- 種子與檔案
sd = wb.create_sheet('種子與檔案')
for j, h in enumerate(['序', '月份', '種子', '重現指令', '資料檔（匯入模擬器用）', '月度指標逐月檔'], 1):
    c = sd.cell(1, j, h); c.font = HDR; c.fill = HF; c.alignment = CEN
for k, r in enumerate(man, 2):
    vals = [r['i'], r['ym'], r['seed'], f"python gen_month.py --month {r['ym']} --seed {r['seed']}", r['file'], files[r['i']]]
    for j, v in enumerate(vals, 1):
        c = sd.cell(k, j, v); c.font = BLUE if j <= 3 else BLK
for col, w in zip('ABCDEF', [5, 10, 9, 52, 44, 44]): sd.column_dimensions[col].width = w
sd.freeze_panes = 'A2'
wb.move_sheet('月度指標', offset=-(wb.sheetnames.index('月度指標') - 1))
wb._sheets = [wb['總覽'], wb['月度指標'], wb['說明'], wb['種子與檔案']]
wb.active = 0
wb.save(f'{OUT}/50個月_月度指標總表.xlsx'); print('summary saved', wb.sheetnames)
