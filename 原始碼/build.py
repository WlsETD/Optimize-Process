import base64, io, os, sys
here = os.path.dirname(os.path.abspath(__file__))
P = lambda f: io.open(os.path.join(here, 'parts', f), encoding='utf-8').read()
shell = P('00_shell.html').replace('<!--SCHED-->', P('12_sched.html'))
parts = ['00_helpers.js','01_data.js','02_day.js','03_flow2d.js','04_factory3d.js','05_charts.js','06_app.js','07_machine.js','08_month.js','10_engine.js','11_calc.js','12_sched.js','13_fair.js','14_labor.js','15_kitdemo.js','16_roster.js','17_month.js','09_nav.js']
js = '\n'.join('/* ===== %s ===== */\n%s' % (f, P(f)) for f in parts)
vendor_dir = os.path.join(here, 'node_modules', 'three')
three = io.open(os.path.join(vendor_dir, 'build', 'three.min.js'), encoding='utf-8').read()
orbit = io.open(os.path.join(vendor_dir, 'examples', 'js', 'controls', 'OrbitControls.js'), encoding='utf-8').read()
gltf = io.open(os.path.join(vendor_dir, 'examples', 'js', 'loaders', 'GLTFLoader.js'), encoding='utf-8').read()
vendor = '/* three.js r128（MIT），內嵌以便離線使用 */\n' + three + '\n/* OrbitControls r128（MIT） */\n' + orbit + '\n/* GLTFLoader r128（MIT） */\n' + gltf
xl_path = os.path.join(here, 'vendor_xlsx', 'xlsx.full.min.js')
if os.path.exists(xl_path):
    vendor += '\n/* SheetJS xlsx 0.18.5（Apache-2.0），匯入月份 Excel 用 */\n' + io.open(xl_path, encoding='utf-8').read()
    print('xlsx reader embedded')
else:
    print('WARNING: xlsx reader missing (月份匯入不能用)')
demo = os.environ.get('DEMO_HTML', '')
b64 = base64.b64encode(io.open(demo,'rb').read()).decode('ascii') if demo and os.path.exists(demo) else ''
print('demo embedded' if b64 else 'WARNING: demo not embedded')
glb_path = os.path.join(here, 'assets', 'smt_line.glb')
glb64 = base64.b64encode(io.open(glb_path,'rb').read()).decode('ascii') if os.path.exists(glb_path) else ''
fk_path = os.path.join(here, 'assets', 'factory_kit.glb')
fk64 = base64.b64encode(io.open(fk_path,'rb').read()).decode('ascii') if os.path.exists(fk_path) else ''
print('factory kit embedded' if fk64 else 'WARNING: factory kit missing')
print('machine glb embedded' if glb64 else 'WARNING: machine glb missing (fallback to procedural boxes)')
d2p = os.path.join(here, 'assets', 'dept_v2.html')
d2 = base64.b64encode(io.open(d2p,'rb').read()).decode('ascii') if os.path.exists(d2p) else ''
print('dept v2 embedded' if d2 else 'WARNING: dept v2 missing')
safe = lambda s: s.replace('</script', '<\\/script')
out = shell.replace('/*VENDOR*/', safe(vendor)).replace('/*PARTS*/', safe('window.DEMO_B64="%s";\nwindow.MD_GLB_B64="%s";\n' % (b64, glb64) + 'window.FK_GLB_B64="%s";\n' % fk64 + 'window.DEMO2_B64="%s";\n' % d2 + js))
dst = sys.argv[1]
os.makedirs(os.path.dirname(dst), exist_ok=True)
io.open(dst, 'w', encoding='utf-8', newline='').write(out)
print('built %s  %.0f KB' % (dst, len(out.encode('utf-8'))/1024))
