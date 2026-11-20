"""
昇嶺電子 A1 SMT 線：機器細節 3D 模型（Blender / bpy）
座標：用「模擬器座標」寫（x 向右、y 向上、z 朝觀眾），輸出時轉成 Blender 座標（x, -z, y），
glTF 匯出器再轉回 y-up，所以 GLB 載入 three.js 後座標與模擬器完全一致。
會動的部分各自是一個命名節點（Board_i、Head_p、FRp_j、Cart、CartReel_j、Lamp、Tech）；不含線外預裝台（換線外部化已移出方案），
其餘靜態零件依材質合併成一個網格，檔案小、繪製次數少。
外觀為通用 SMT 線示意，不是昇嶺電子的實際機型（資料裡沒有機台品牌、型號）。
"""
import bpy, bmesh, math, sys, os
from mathutils import Matrix, Vector

OUT_DIR = sys.argv[1] if len(sys.argv) > 1 else '/home/claude/blender/out'
os.makedirs(OUT_DIR, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
coll = scene.collection

# ------------------------------------------------------------------ 材質
HEX = dict(
    body=0xe6eaee, body2=0xf1f3f5, panel=0xcdd3da, base=0x56616d, dark=0x27303a, metal=0xa3adb8,
    steel=0xc8d0d8, conv=0x39434e, board=0x2e9e62, gray=0x8792a0, orange=0xeb6834, wood=0xb08a5a,
    skin=0xf0c9a4, blue=0x2a78d6, red=0xb4282e, green=0x35d07f, pale=0xd99a14, yellow=0xf2c230,
    white=0xf7f8fa, screen=0x7fe0d0, glass=0x9ec9e8, black=0x15191e, esd=0x3f7d5a, amber=0xf0a020,
    light=0xfff6d8, hat=0xf4f4f0, pants=0x3a4350, shoe=0x1d2229, copper=0xc9893a
)
MATS = {}
def mat(name):
    if name in MATS: return MATS[name]
    m = bpy.data.materials.new(name); m.use_nodes = True
    h = HEX[name]; r, g, b = ((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (r, g, b, 1)
    bsdf.inputs['Roughness'].default_value = 0.6
    bsdf.inputs['Metallic'].default_value = 0.0
    m.diffuse_color = (r, g, b, 1)
    MATS[name] = m
    return m

# ------------------------------------------------------------------ 累積器（依 群組＋材質 合併幾何）
ACC = {}                       # (group, mat) -> bmesh
GROUPS = {}                    # name -> dict(o=(x,y,z) 模擬器座標, p=parent name)
def B(p): return Vector((p[0], -p[2], p[1]))     # 模擬器 → Blender
def group(name, o=(0, 0, 0), p=None): GROUPS[name] = dict(o=o, p=p)
def _bm(g, m):
    k = (g, m)
    if k not in ACC: ACC[k] = bmesh.new()
    return ACC[k]

def box(m, cx, cy, cz, w, h, d, b=0.0, g='static'):
    bm = _bm(g, m)
    M = Matrix.Translation(B((cx, cy, cz))) @ Matrix.Diagonal((w, d, h, 1))
    res = bmesh.ops.create_cube(bm, size=1.0, matrix=M)
    bb = min(b, 0.45 * min(w, h, d))
    if bb > 0.004:
        edges = list({e for v in res['verts'] for e in v.link_edges})
        bmesh.ops.bevel(bm, geom=edges, offset=bb, segments=1, affect='EDGES')

def cyl(m, cx, cy, cz, r, ln, axis='y', seg=16, g='static'):
    bm = _bm(g, m)
    R = {'y': Matrix.Identity(4), 'z': Matrix.Rotation(math.radians(90), 4, 'X'), 'x': Matrix.Rotation(math.radians(90), 4, 'Y')}[axis]
    M = Matrix.Translation(B((cx, cy, cz))) @ R
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=seg, radius1=r, radius2=r, depth=ln, matrix=M)

def sph(m, cx, cy, cz, r, g='static', seg=14):
    bm = _bm(g, m)
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=max(6, seg // 2), radius=r, matrix=Matrix.Translation(B((cx, cy, cz))))

# ------------------------------------------------------------------ 常數（與 07_machine.js 舊版一致）
ST = [
    dict(n='loader',  x=-7.6, w=1.2, h=1.3, kind='mag', full=True),
    dict(n='printer', x=-5.6, w=1.5, h=1.5, kind='printer'),
    dict(n='spi',     x=-3.9, w=1.1, h=1.2, kind='cam'),
    dict(n='placer0', x=-1.7, w=2.2, h=1.9, kind='placer', p=0),
    dict(n='placer1', x= 1.1, w=2.2, h=1.9, kind='placer', p=1),
    dict(n='oven',    x= 4.6, w=3.4, h=1.4, kind='oven'),
    dict(n='aoi',     x= 7.4, w=1.2, h=1.3, kind='cam', ring=True),
    dict(n='unloader',x= 9.1, w=1.2, h=1.3, kind='mag', full=False),
]

# ------------------------------------------------------------------ 共通機身
def common(s, window=True):
    x, w, h = s['x'], s['w'], s['h']; top = 0.2 + h
    box('base', x, 0.26, 0, w + 0.1, 0.12, 1.8, 0.02)
    box('body', x, 0.5, 0, w, 0.6, 1.7, 0.025)
    # 下櫃門板、把手、散熱縫
    n = 2 if w >= 1.1 else 1
    for i in range(n):
        px = x + (i - (n - 1) / 2) * (w / n)
        box('panel', px, 0.5, 0.86, w / n - 0.1, 0.46, 0.02, 0.01)
        hx = px + (w / n / 2 - 0.12) * (-1 if i == 0 else 1)
        box('dark', hx, 0.52, 0.885, 0.03, 0.14, 0.03, 0.006)
        if w / n > 0.55:
            for k in range(3): box('dark', px, 0.36 + k * 0.035, 0.872, w / n - 0.32, 0.012, 0.006)
    box('dark', x, 0.8, 0, w + 0.02, 0.03, 1.72)            # 上下分隔條
    # 輸送帶進出口（側面深色凹口）
    for sx in (-1, 1): box('dark', x + sx * (w / 2 + 0.006), 0.96, 0, 0.02, 0.22, 0.56)
    # 急停鈕
    cyl('yellow', x - w / 2 + 0.17, 0.97, 0.865, 0.075, 0.03, 'z')
    cyl('red', x - w / 2 + 0.17, 0.97, 0.89, 0.048, 0.04, 'z')
    # 頂蓋
    box('panel', x, top + 0.015, 0, w + 0.04, 0.03, 1.74, 0.012)

def upper(s, window=True):
    x, w, h = s['x'], s['w'], s['h']; top = 0.2 + h; uh = top - 0.8
    box('body2', x, 0.8 + uh / 2, 0, w - 0.02, uh, 1.68, 0.03)
    if window:
        ww, wh = w - 0.55, uh - 0.22; wx = x - 0.13; wy = 0.8 + uh / 2 + 0.02
        box('dark', wx, wy, 0.855, ww + 0.06, wh + 0.06, 0.012, 0.01)        # 窗框
        box('black', wx, wy, 0.862, ww, wh, 0.008)                          # 機內暗部
        box('glass', wx, wy, 0.872, ww - 0.02, wh - 0.02, 0.008)
    # 觸控螢幕
    mx, my = x + w / 2 - 0.22, top - 0.25
    box('dark', mx, my, 0.875, 0.28, 0.21, 0.03, 0.01)
    box('screen', mx, my, 0.893, 0.23, 0.16, 0.006)

# ------------------------------------------------------------------ 各機種
def magazine(s):
    x, top = s['x'], 0.2 + s['h']
    box('metal', x, top + 0.07, 0, 0.84, 0.05, 0.64, 0.01)
    for sx in (-1, 1):
        for sz in (-1, 1): box('steel', x + sx * 0.38, top + 0.52, sz * 0.27, 0.035, 0.9, 0.035)
    box('steel', x, top + 0.96, 0, 0.84, 0.03, 0.64, 0.008)
    for i in range(9):
        y = top + 0.15 + i * 0.1
        box('metal', x, y, 0, 0.72, 0.012, 0.52)
        if (s['full'] and i < 7) or ((not s['full']) and i < 3):
            box('board', x, y + 0.016, 0, 0.62, 0.014, 0.42)
    box('dark', x, top + 0.45, -0.38, 0.1, 0.9, 0.06)                        # 升降導軌

def printer(s):
    x, top = s['x'], 0.2 + s['h']
    box('body2', x, top + 0.17, 0, s['w'] - 0.12, 0.3, 1.6, 0.03)
    box('dark', x, top + 0.17, 0.815, s['w'] - 0.36, 0.2, 0.012)
    box('glass', x, top + 0.17, 0.826, s['w'] - 0.4, 0.17, 0.008)
    cyl('white', x - 0.32, top + 0.45, 0.15, 0.05, 0.3, 'y')                 # 錫膏匣
    cyl('dark', x - 0.32, top + 0.62, 0.15, 0.058, 0.04, 'y')
    cyl('steel', x + 0.3, top + 0.4, -0.45, 0.07, 0.5, 'x', 12)               # 排氣管
    box('steel', x + 0.58, top + 0.28, -0.45, 0.04, 0.3, 0.04)
    box('metal', x, top + 0.34, 0.5, 0.9, 0.025, 0.04)                        # 鋼板框示意

def camera_gantry(s):
    x, top = s['x'], 0.2 + s['h']
    for sz in (-1, 1): box('steel', x, top + 0.07, sz * 0.6, 0.95, 0.05, 0.05)
    box('dark', x, top + 0.17, 0, 0.12, 0.1, 1.3, 0.015)
    box('body', x, top + 0.33, 0.15, 0.24, 0.22, 0.24, 0.02)
    cyl('black', x, top + 0.2, 0.15, 0.07, 0.12, 'y')
    if s.get('ring'):
        cyl('light', x, top + 0.215, 0.15, 0.115, 0.025, 'y', 20)
        box('body', x - 0.3, top + 0.31, -0.2, 0.18, 0.18, 0.18, 0.02)
        cyl('black', x - 0.3, top + 0.19, -0.2, 0.05, 0.1, 'y')
    for sz in (-1, 1):
        box('steel', x - 0.5, top + 0.2, sz * 0.6, 0.04, 0.25, 0.04)
        box('steel', x + 0.5, top + 0.2, sz * 0.6, 0.04, 0.25, 0.04)

def placer(s):
    x, w, p = s['x'], s['w'], s['p']; top = 2.1
    # 下裙板 + 玻璃安全罩（看得到輸送帶與吸嘴頭）
    box('base', x, 0.26, 0, w + 0.1, 0.12, 1.8, 0.02)
    box('body', x, 0.5, 0, w, 0.6, 1.7, 0.025)
    for i in range(2):
        px = x + (i - 0.5) * 1.1
        box('panel', px, 0.5, 0.86, 1.0, 0.46, 0.02, 0.01)
        hx = px + (0.38 if i == 0 else -0.38) * -1
        box('dark', px + (-0.4 if i == 0 else 0.4), 0.52, 0.885, 0.03, 0.14, 0.03, 0.006)
        for k in range(3): box('dark', px, 0.36 + k * 0.035, 0.872, 0.7, 0.012, 0.006)
    box('dark', x, 0.8, 0, w + 0.02, 0.03, 1.72)
    for sx in (-1, 1): box('dark', x + sx * (w / 2 + 0.006), 0.96, 0, 0.02, 0.22, 0.56)
    cyl('yellow', x - w / 2 + 0.17, 0.97, 0.865, 0.075, 0.03, 'z'); cyl('red', x - w / 2 + 0.17, 0.97, 0.89, 0.048, 0.04, 'z')
    # 安全罩框架
    for sx in (-1, 1):
        for sz in (-1, 1): box('steel', x + sx * (w / 2 - 0.02), 1.46, sz * 0.8, 0.07, 1.3, 0.07, 0.01)
    for yy in (0.82, top):
        box('steel', x, yy, 0.8, w, 0.06, 0.06); box('steel', x, yy, -0.8, w, 0.06, 0.06)
        for sx in (-1, 1): box('steel', x + sx * (w / 2 - 0.02), yy, 0, 0.06, 0.06, 1.6)
    box('dark', x, 1.46, -0.8, w - 0.1, 1.26, 0.02)                           # 後板
    box('glass', x, 1.46, 0.82, w - 0.12, 1.2, 0.008)                         # 前玻璃
    for sx in (-1, 1): box('glass', x + sx * (w / 2 - 0.02), 1.46, 0, 0.008, 1.2, 1.54)
    box('glass', x, top + 0.012, 0, w - 0.1, 0.008, 1.56)
    # X 軸導軌
    for sz in (-1, 1): box('steel', x, 1.78, sz * 0.7, w - 0.2, 0.05, 0.05)
    # 觸控螢幕 + 狀態燈條
    box('dark', x + w / 2 - 0.2, 1.0, 0.9, 0.3, 0.22, 0.03, 0.01); box('screen', x + w / 2 - 0.2, 1.0, 0.918, 0.25, 0.17, 0.006)
    # 會動的吸嘴頭組（沿 x 移動）：橫樑 + 滑座 + 6 支吸嘴
    gh = 'Head_%d' % p; group(gh, (x, 0, 0))
    box('dark', x, 1.86, 0, 0.14, 0.12, 1.5, 0.015, gh)
    box('orange', x, 1.7, 0.12, 0.32, 0.3, 0.34, 0.03, gh)
    box('dark', x, 1.5, 0.12, 0.28, 0.06, 0.3, 0.01, gh)
    for k in range(6):
        a = k / 6 * math.tau
        cyl('steel', x + math.cos(a) * 0.1, 1.42, 0.12 + math.sin(a) * 0.1, 0.018, 0.14, 'y', 8, gh)
    cyl('black', x - 0.2, 1.62, -0.35, 0.05, 0.1, 'y', 10, gh)                  # 影像鏡頭
    for sz in (-1, 1): box('steel', x, 1.8, sz * 0.7, 0.22, 0.12, 0.09, 0.01, gh)  # 兩端滑塊
    # 飛達櫃：8 支飛達，每支各自有一個卷盤（會依進度變橘）
    box('dark', x, 0.74, 1.2, 1.95, 0.06, 0.62, 0.01)
    box('base', x, 0.46, 1.2, 1.9, 0.5, 0.58, 0.02)
    for j in range(8):
        fx = x - 0.8 + j * 0.23
        box('steel', fx, 1.02, 1.2, 0.17, 0.5, 0.5, 0.012)
        box('dark', fx, 1.3, 1.2, 0.12, 0.04, 0.4)
        cyl('dark', fx, 1.12, 1.51, 0.032, 0.07, 'z', 10)
        gr = 'FR%d_%d' % (p, j); group(gr, (fx, 1.12, 1.52))
        cyl('gray', fx, 1.12, 1.52, 0.1, 0.05, 'z', 18, gr)
    box('white', x, 0.46, 1.5, 0.5, 0.05, 0.008)                               # 標籤條

def oven(s):
    x, w = s['x'], s['w']; top = 0.2 + s['h']
    box('base', x, 0.26, 0, w + 0.1, 0.12, 1.8, 0.02)
    box('body', x, 0.5, 0, w, 0.6, 1.7, 0.025)
    for i in range(4):
        px = x - 1.2 + i * 0.8
        box('panel', px, 0.5, 0.86, 0.7, 0.46, 0.02, 0.01); box('dark', px + 0.28, 0.52, 0.885, 0.03, 0.14, 0.03, 0.006)
        for k in range(3): box('dark', px, 0.36 + k * 0.035, 0.872, 0.5, 0.012, 0.006)
    box('dark', x, 0.8, 0, w + 0.02, 0.03, 1.72)
    for sx in (-1, 1): box('dark', x + sx * (w / 2 + 0.006), 0.96, 0, 0.02, 0.22, 0.56)
    n = 6; sw = 0.5; gap = 0.035; tot = n * sw + (n - 1) * gap; x0 = x - tot / 2 + sw / 2
    uh = top - 0.8
    for i in range(n):
        sx = x0 + i * (sw + gap)
        box('body2', sx, 0.8 + uh / 2, 0, sw, uh, 1.68, 0.03)
        box('red' if i < 4 else 'blue', sx, top + 0.012, 0.0, 0.38, 0.024, 0.9)    # 加熱區（紅）/ 冷卻區（藍）
        cyl('steel', sx, top + 0.13, -0.35, 0.065, 0.22, 'y', 12)               # 排氣管
        box('dark', sx, 1.36, 0.848, 0.28, 0.035, 0.03, 0.008)                   # 掀蓋把手
        box('amber' if i < 4 else 'green', sx, 1.12, 0.846, 0.05, 0.05, 0.012)   # 區段指示
    for i in range(n - 1): box('dark', x0 + i * (sw + gap) + (sw + gap) / 2, 0.8 + uh / 2, 0, gap + 0.01, uh, 1.69)
    cyl('dark', x + 1.1, top + 0.03, 0.3, 0.17, 0.05, 'y', 18)                  # 冷卻風扇
    cyl('dark', x + 1.1, top + 0.03, -0.3, 0.17, 0.05, 'y', 18)
    box('dark', x + w / 2 - 0.18, 1.2, 0.88, 0.28, 0.22, 0.03, 0.01); box('screen', x + w / 2 - 0.18, 1.2, 0.898, 0.23, 0.17, 0.006)
    cyl('yellow', x - w / 2 + 0.17, 0.97, 0.865, 0.075, 0.03, 'z'); cyl('red', x - w / 2 + 0.17, 0.97, 0.89, 0.048, 0.04, 'z')

# ------------------------------------------------------------------ 輸送帶、地面標線、燈塔
def conveyor():
    box('conv', 0.7, 0.94, 0, 18.2, 0.05, 0.78)
    for sz in (-1, 1): box('steel', 0.7, 1.0, sz * 0.43, 18.2, 0.1, 0.05, 0.01)
    for gx in (-6.675, -4.65, -3.075, -0.3, 2.55, 6.55, 8.25):
        for sz in (-1, 1): box('dark', gx, 0.5, sz * 0.4, 0.06, 0.8, 0.06)
        box('dark', gx, 0.3, 0, 0.06, 0.05, 0.8)

def floor_marks():
    y = 0.006
    box('yellow', 0.7, y, 1.95, 18.2, 0.012, 0.07)                                 # 走道線
    def rect(cx, cz, w, d, t=0.06):
        box('yellow', cx, y, cz - d / 2, w, 0.012, t); box('yellow', cx, y, cz + d / 2, w, 0.012, t)
        box('yellow', cx - w / 2, y, cz, t, 0.012, d); box('yellow', cx + w / 2, y, cz, t, 0.012, d)
    rect(-1.7, 2.5, 1.9, 0.95)          # 料車停車格（在機台前）

def tower():
    box('base', -8.4, 0.42, 0, 0.3, 0.05, 0.3, 0.01)
    cyl('steel', -8.4, 1.45, 0, 0.03, 2.1, 'y', 10)
    cyl('amber', -8.4, 2.1, 0, 0.1, 0.14, 'y', 14); cyl('blue', -8.4, 1.9, 0, 0.1, 0.14, 'y', 14)
    group('Lamp', (-8.4, 2.6, 0)); sph('green', -8.4, 2.6, 0, 0.22, 'Lamp')        # 顏色由程式依狀態換（紅/綠）

def boards():
    for i in range(6):
        g = 'Board_%d' % i; x = -8 + i * 3.0; group(g, (x, 1.0, 0))
        box('board', x, 1.0, 0, 0.7, 0.05, 0.6, 0.012, g)
        for (dx, dz, c) in ((-0.2, -0.12, 'black'), (0.05, 0.1, 'black'), (0.22, -0.08, 'dark')):
            box(c, x + dx, 1.035, dz, 0.12, 0.03, 0.1, 0.004, g)
        for dx in (-0.3, 0.3):
            for dz in (-0.25, 0.25): box('copper', x + dx, 1.027, dz, 0.04, 0.006, 0.04, 0, g)

# ------------------------------------------------------------------ 料車（原點在腳下中心；程式用位置移動）
def cart():
    group('Cart', (0, 0, 0))
    g = 'Cart'
    for sx in (-1, 1):
        for sz in (-1, 1): box('steel', sx * 0.7, 0.5, sz * 0.25, 0.045, 0.78, 0.045, 0.008, g)
    box('dark', 0, 0.28, 0, 1.5, 0.04, 0.58, 0.01, g)                           # 下層
    box('metal', 0, 0.7, 0, 1.5, 0.04, 0.58, 0.01, g)                           # 上層
    for sx in (-1, 1): box('steel', sx * 0.7, 1.0, -0.3, 0.04, 0.55, 0.04, 0.008, g)
    box('steel', 0, 1.27, -0.3, 1.46, 0.04, 0.04, 0.008, g)                     # 推把
    for sx in (-1, 1):
        for sz in (-1, 1):
            cyl('dark', sx * 0.64, 0.1, sz * 0.22, 0.085, 0.06, 'z', 12, g)
            box('steel', sx * 0.64, 0.19, sz * 0.22, 0.05, 0.12, 0.08, 0.008, g)
    for k in range(4): box('gray', -0.45 + k * 0.3, 0.34, 0, 0.2, 0.08, 0.4, 0.01, g)  # 下層備用飛達盒
    for j in range(7):
        fx = -0.6 + j * 0.2
        box('steel', fx, 0.84, 0, 0.14, 0.26, 0.4, 0.01, g)
        box('dark', fx, 0.99, 0, 0.1, 0.03, 0.3, 0, g)
        cyl('dark', fx, 1.1, 0.215, 0.028, 0.06, 'z', 8, g)
        gr = 'CartReel_%d' % j; group(gr, (fx, 1.1, 0.24), 'Cart')
        cyl('gray', fx, 1.1, 0.24, 0.092, 0.045, 'z', 16, gr)
    box('yellow', 0, 0.7, 0.3, 0.4, 0.05, 0.012, 0, g)                          # 標籤

def prestation():
    group('Pre', (0, 0, 0)); g = 'Pre'
    box('wood', 0, 0.9, 0, 2.6, 0.06, 1.1, 0.01, g)
    box('esd', 0, 0.935, 0.02, 2.4, 0.012, 0.9, 0, g)                          # 防靜電墊
    for sx in (-1, 1):
        for sz in (-1, 1): box('dark', sx * 1.2, 0.45, sz * 0.45, 0.07, 0.9, 0.07, 0.01, g)
    for sz in (-1, 1): box('steel', 0, 0.3, sz * 0.45, 2.4, 0.04, 0.04, 0.008, g)
    box('metal', 0, 0.3, 0, 2.4, 0.03, 0.9, 0.008, g)                          # 下層
    for k in range(3): box('gray', -0.7 + k * 0.7, 0.36, 0, 0.5, 0.1, 0.4, 0.01, g)   # 備料盒
    for j in range(6):
        fx = -1.0 + j * 0.4
        box('steel', fx, 1.0, 0, 0.17, 0.12, 0.42, 0.008, g)
        cyl('dark', fx, 1.12, 0.215, 0.028, 0.06, 'z', 8, g)
        gr = 'PreReel_%d' % j; group(gr, (fx, 1.14, 0.24), 'Pre')
        cyl('gray', fx, 1.14, 0.24, 0.115, 0.05, 'z', 16, gr)
    # 掃碼槍座 + 治具
    box('dark', 1.05, 0.99, -0.3, 0.2, 0.08, 0.2, 0.01, g); box('black', 1.05, 1.05, -0.3, 0.06, 0.1, 0.12, 0.01, g)
    box('dark', -1.1, 0.98, -0.32, 0.25, 0.06, 0.2, 0.01, g)
    # 吊燈
    for sx in (-1, 1): box('dark', sx * 1.2, 1.35, -0.5, 0.04, 0.9, 0.04, 0, g)
    box('dark', 0, 1.8, -0.5, 2.45, 0.05, 0.12, 0.01, g)
    box('light', 0, 1.76, -0.5, 2.2, 0.025, 0.07, 0, g)

def tech():
    group('Tech', (0, 0, 0)); g = 'Tech'
    for sx in (-1, 1):
        cyl('pants', sx * 0.08, 0.28, 0, 0.065, 0.56, 'y', 10, g)
        box('shoe', sx * 0.08, 0.04, -0.04, 0.13, 0.08, 0.24, 0.02, g)
    box('blue', 0, 0.86, 0, 0.36, 0.56, 0.22, 0.05, g)                           # 上衣
    box('orange', 0, 0.9, -0.115, 0.3, 0.3, 0.012, 0, g)                         # 反光背心（前）
    for sx in (-1, 1):
        cyl('blue', sx * 0.22, 0.82, -0.05, 0.05, 0.42, 'y', 10, g)
        sph('skin', sx * 0.22, 0.58, -0.08, 0.05, g, 8)
    cyl('skin', 0, 1.2, 0, 0.05, 0.08, 'y', 8, g)
    sph('skin', 0, 1.36, 0, 0.15, g)
    sph('hat', 0, 1.42, 0, 0.165, g)                                             # 安全帽（球頂）
    box('hat', 0, 1.36, -0.15, 0.24, 0.025, 0.1, 0.008, g)                       # 帽沿朝前（-z）
    box('black', -0.055, 1.37, -0.14, 0.03, 0.03, 0.02, 0, g); box('black', 0.055, 1.37, -0.14, 0.03, 0.03, 0.02, 0, g)

# ------------------------------------------------------------------ 組裝
conveyor(); floor_marks(); tower(); boards(); cart(); tech()
for s in ST:
    k = s['kind']
    if k == 'placer': placer(s)
    elif k == 'oven': oven(s)
    else:
        common(s); upper(s, window=(k != 'mag'))
        if k == 'mag': magazine(s)
        elif k == 'printer': printer(s)
        elif k == 'cam': camera_gantry(s)

# ------------------------------------------------------------------ 輸出成 Blender 物件
OBJ = {}
def ensure_group(name):
    if name in OBJ: return OBJ[name]
    gi = GROUPS[name]; par = gi['p']
    e = bpy.data.objects.new(name, None); e.empty_display_type = 'PLAIN_AXES'; e.empty_display_size = 0.2
    coll.objects.link(e)
    base = B(gi['o'])
    if par:
        pe = ensure_group(par); e.parent = pe; e.location = base - B(GROUPS[par]['o'])
    else:
        e.location = base
    OBJ[name] = e
    return e

for gname in list(GROUPS): ensure_group(gname)
tri = 0
for (g, m), bm in ACC.items():
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    if g != 'static':
        off = B(GROUPS[g]['o'])
        for v in bm.verts: v.co -= off
    me = bpy.data.meshes.new('%s_%s' % (g, m)); bm.to_mesh(me); bm.free()
    me.materials.append(mat(m))
    ob = bpy.data.objects.new(('%s_%s' % (g, m)) if g != 'static' else ('Static_%s' % m), me)
    coll.objects.link(ob)
    if g != 'static': ob.parent = OBJ[g]
    tri += len(me.polygons)
print('materials', len(MATS), 'objects', len(bpy.data.objects), 'faces', tri)

# 存 .blend 給使用者
blend = os.path.join(OUT_DIR, '昇嶺_A1_SMT線_機器細節.blend')
bpy.ops.wm.save_as_mainfile(filepath=blend)

glb = os.path.join(OUT_DIR, 'smt_line.glb')
bpy.ops.export_scene.gltf(filepath=glb, export_format='GLB', export_apply=True, export_yup=True,
                          export_materials='EXPORT', export_image_format='NONE', export_cameras=False, export_lights=False)
print('GLB bytes', os.path.getsize(glb))
