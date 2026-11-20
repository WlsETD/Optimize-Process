"""
昇嶺電子 3D 廠房（Blender / bpy）：四條 SMT 線的機台、辦公室、倉庫、出貨區的靜態細節。
座標用模擬器座標（x 右、y 上、z 朝觀眾），與 04_factory3d.js 的場景一致。
不含會動的部分（吸嘴頭、料車、人員、貨車、燈塔、紙箱、訊息），那些仍由 JS 程式控制。
"""
import sys, os
import bpy
from mathutils import Vector
OUT = sys.argv[1] if len(sys.argv) > 1 else '/home/claude/factory_out'
SRC = '/mnt/user-data/outputs/模型/build_line.py'
src = open(SRC, encoding='utf-8').read()
sys.argv = ['x', OUT]
ns = {'__name__': 'factory'}
# 載入 build_line.py 的材質、機台函式與累積器（只取到「組裝」之前）
head = src[:src.index('conveyor(); floor_marks()')]
exec(head, ns)
ns['HEX']['carton'] = 0xc79a62   # 紙箱（build_line 沒有這個色）

def B2(p):
    o = ns['OFF']
    return Vector((p[0] + o[0], -(p[2] + o[2]), p[1]))
ns['OFF'] = (0.0, 0.0, 0.0)
ns['B'] = B2
f = {k: ns[k] for k in ('common', 'upper', 'magazine', 'printer', 'camera_gantry', 'placer', 'oven', 'conveyor', 'box', 'cyl', 'sph')}
LZ = [0.0, 4.4, 8.8, 13.2]
ST = ns['ST']

# ---- 四條 SMT 線：機台本體（x 平移 +7 對齊模擬器的線頭位置，z 依線別）
for z in LZ:
    ns['OFF'] = (7.0, 0.0, z)
    f['conveyor']()
    for s in ST:
        k = s['kind']
        if k == 'placer': f['placer'](s)
        elif k == 'oven': f['oven'](s)
        else:
            f['common'](s); f['upper'](s, window=(k != 'mag'))
            if k == 'mag': f['magazine'](s)
            elif k == 'printer': f['printer'](s)
            elif k == 'cam': f['camera_gantry'](s)
ns['OFF'] = (0.0, 0.0, 0.0)
box, cyl, sph = f['box'], f['cyl'], f['sph']

# ---- 辦公室：三張辦公桌（老闆、業務、生管），桌上螢幕、鍵盤、盆栽、抽屜櫃
for (x, z) in [(-31.5, 1.6), (-24.0, 1.6), (-17.0, 8.6)]:
    box('wood', x, 0.76, z, 1.9, 0.08, 0.9, 0.02)
    for a, b in [(-0.85, -0.38), (0.85, -0.38), (-0.85, 0.38), (0.85, 0.38)]:
        box('dark', x + a, 0.37, z + b, 0.06, 0.74, 0.06)
    box('metal', x + 0.6, 0.3, z + 0.05, 0.42, 0.6, 0.6, 0.02)           # 抽屜櫃
    for k in range(3): box('steel', x + 0.6, 0.12 + k * 0.2, z + 0.36, 0.3, 0.03, 0.01)
    box('dark', x, 0.81, z - 0.25, 0.25, 0.02, 0.2)                     # 螢幕底座
    box('dark', x, 1.1, z - 0.25, 0.8, 0.5, 0.05, 0.01)                 # 螢幕外框
    box('screen', x, 1.1, z - 0.22, 0.72, 0.42, 0.02)
    box('dark', x, 0.81, z + 0.12, 0.42, 0.02, 0.14, 0.006)              # 鍵盤
    sph('board', x + 0.7, 0.98, z - 0.3, 0.17, 'static', 10)            # 盆栽
    cyl('gray', x + 0.7, 0.86, z - 0.3, 0.1, 0.2, 'y', 14)

# ---- 倉庫：四座料架（每座三層、紙箱、托板、立柱）
for z in LZ:
    for sx in (-0.28, 0.28):
        for sz in (-1.4, 1.4): box('steel', -8 + sx, 1.1, z + sz, 0.06, 2.2, 0.06)
    for y in (0.5, 1.2, 1.9):
        box('steel', -8, y, z, 0.62, 0.05, 2.9)
        for j, zz in enumerate((-0.8, 0.0, 0.8)):
            col = 'blue' if (j + int(y * 10)) % 2 else 'carton'
            box(col, -8, y + 0.22, z + zz, 0.5, 0.42, 0.7, 0.01)
    box('wood', -8, 0.05, z, 0.62, 0.1, 2.9)

# ---- 出貨碼頭：托板、防撞墊、門框
for dz in (-2.4, 0.0, 2.4):
    box('wood', 41, 0.15, 6.6 + dz, 3.6, 0.05, 0.5)
for dz in (4.8, 8.4):
    box('dark', 38.3, 0.7, dz, 0.3, 0.5, 0.6)
box('base', 37.6, 2.4, 6.6, 0.2, 4.8, 0.2); box('base', 37.6, 2.4, 3.2, 0.2, 4.8, 0.2)
box('base', 37.6, 4.8, 4.9, 0.2, 0.2, 3.4)

# ---- 排除會動的節點（由 JS 控制）：吸嘴頭、料車、人員、燈塔、貨車等
PRE = ('Head_', 'FR', 'Board_', 'Cart', 'Tech', 'Lamp', 'Pre')
exec(src[src.index('OBJ = {}'):src.index('# 存 .blend')], ns)
import bpy
for ob in list(bpy.data.objects):
    if ob.name.startswith(PRE):
        bpy.data.objects.remove(ob, do_unlink=True)
print('objects after cull:', len([o for o in bpy.data.objects if o.type == 'MESH']))

blend = os.path.join(OUT, '昇嶺_3D廠房_靜態細節.blend')
bpy.ops.wm.save_as_mainfile(filepath=blend)
glb = os.path.join(OUT, 'factory_kit.glb')
bpy.ops.export_scene.gltf(filepath=glb, export_format='GLB', export_apply=True, export_yup=True,
                          export_materials='EXPORT', export_image_format='NONE', export_cameras=False, export_lights=False)
print('GLB bytes', os.path.getsize(glb))
