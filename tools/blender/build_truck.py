# 卡車改裝王：用 Blender 建寫實歐式平頭聯結車，並算出橫向模式用的分層 PNG
# 用法（背景執行，不用開 Blender 視窗）：
#   blender -b --factory-startup --python tools/blender/build_truck.py -- <輸出資料夾> [品質: draft|final]
# 輸出：
#   <輸出>/side/*.png        每一層（拖車、車頭底盤、車頭、改裝零件）＋烤漆遮罩 *_mask.png＋輪子 wheel.png
#   <輸出>/side/layout.json  每一層在 2D 卡車畫布上的位置、輪軸、頭燈尾燈、排氣管、車窗位置
#   <輸出>/truck.glb         整台的 3D 模型（之後 3D 版可以用）
# 座標：車頭朝 -Y（匯出 glTF 後會變成 +Z，跟遊戲一樣），Z 朝上，地面 z=0。s＝往前的距離（s 越大越前面）。
import bpy, bmesh, math, sys, os, json
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = os.path.abspath(argv[0] if argv else 'blender_out')
QUALITY = argv[1] if len(argv) > 1 else 'final'
os.makedirs(os.path.join(OUT, 'side'), exist_ok=True)

# ---------------- 清空場景 ----------------
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene

def Y(s): return -s  # 往前＝-Y

# ---------------- 材質 ----------------
def mat(name, color=(0.8, 0.8, 0.8), metal=0.0, rough=0.5, coat=0.0, emit=None, alpha=None, spec=0.5):
    m = bpy.data.materials.new(name); m.use_nodes = True
    p = m.node_tree.nodes['Principled BSDF']
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Metallic'].default_value = metal
    p.inputs['Roughness'].default_value = rough
    if 'Coat Weight' in p.inputs: p.inputs['Coat Weight'].default_value = coat; p.inputs['Coat Roughness'].default_value = 0.03
    if emit is not None: p.inputs['Emission Color'].default_value = (*emit, 1); p.inputs['Emission Strength'].default_value = 2.0
    if alpha is not None: p.inputs['Alpha'].default_value = alpha  # 車窗半透明：2D 遊戲裡司機畫在後面看得到
    m['paint'] = name.startswith('PAINT')
    return m

M = {
    'paint': mat('PAINT_cab', (0.8, 0.8, 0.8), 0.0, 0.18, coat=1.0),
    'tpaint': mat('PAINT_trailer', (0.8, 0.8, 0.8), 0.0, 0.35, coat=0.3),
    'chrome': mat('chrome', (0.95, 0.95, 0.95), 1.0, 0.04),
    'alu': mat('alu', (0.85, 0.86, 0.88), 1.0, 0.28),
    'frame': mat('frame', (0.06, 0.065, 0.07), 0.6, 0.45),
    'plastic': mat('plastic', (0.035, 0.037, 0.04), 0.0, 0.55),
    'rubber': mat('rubber', (0.02, 0.02, 0.022), 0.0, 0.85),
    'glass': mat('glass', (0.02, 0.03, 0.04), 0.0, 0.04, alpha=0.55),
    'grille': mat('grille', (0.05, 0.055, 0.06), 0.8, 0.35),
    'head': mat('headlight', (0.9, 0.92, 0.95), 0.0, 0.05, emit=(0.0, 0.0, 0.0)),
    'tail': mat('tail', (0.5, 0.02, 0.02), 0.0, 0.2),
    'amber': mat('amber', (0.9, 0.45, 0.02), 0.0, 0.2),
    'rim': mat('rim', (0.92, 0.92, 0.9), 0.4, 0.25),
    'rimdark': mat('rimdark', (0.15, 0.15, 0.16), 0.6, 0.4),
    'steel': mat('steel', (0.45, 0.47, 0.5), 0.9, 0.35),
    'reflect': mat('reflect_tape', (0.9, 0.55, 0.05), 0.0, 0.3),
    'black': mat('black', (0.01, 0.01, 0.012), 0.0, 0.4),
}

# ---------------- 小工具 ----------------
COLL = {}
def coll(name):
    if name not in COLL:
        c = bpy.data.collections.new(name); scene.collection.children.link(c); COLL[name] = c
    return COLL[name]

def link(obj, layer):
    for c in obj.users_collection: c.objects.unlink(obj)
    coll(layer).objects.link(obj)
    obj.name = layer + '__' + obj.name   # 名字前面加圖層，遊戲載入 GLB 時靠這個分類
    return obj

def box(layer, name, s0, s1, x0, x1, z0, z1, m, bevel=0.0, seg=3):
    bpy.ops.mesh.primitive_cube_add(size=1)
    o = bpy.context.active_object; o.name = name
    o.scale = ((x1 - x0), (s1 - s0), (z1 - z0))
    o.location = ((x0 + x1) / 2, Y((s0 + s1) / 2), (z0 + z1) / 2)
    bpy.ops.object.transform_apply(scale=True)
    if bevel > 0:
        b = o.modifiers.new('bv', 'BEVEL'); b.width = bevel; b.segments = seg; b.limit_method = 'ANGLE'
    o.data.materials.append(m)
    bpy.ops.object.shade_smooth() if bevel > 0 else None
    return link(o, layer)

def cyl_x(layer, name, s, x, z, r, length, m, verts=32, bevel=0.0):  # 軸朝 X（左右）
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=length, location=(x, Y(s), z), rotation=(0, math.pi / 2, 0))
    o = bpy.context.active_object; o.name = name; o.data.materials.append(m)
    if bevel > 0: b = o.modifiers.new('bv', 'BEVEL'); b.width = bevel; b.segments = 3
    bpy.ops.object.shade_smooth()
    return link(o, layer)

def cyl_y(layer, name, s0, s1, x, z, r, m, verts=32):  # 軸朝前後
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=abs(s1 - s0), location=(x, Y((s0 + s1) / 2), z), rotation=(math.pi / 2, 0, 0))
    o = bpy.context.active_object; o.name = name; o.data.materials.append(m)
    bpy.ops.object.shade_smooth()
    return link(o, layer)

def cyl_z(layer, name, s, x, z0, z1, r, m, verts=24):  # 直立
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=z1 - z0, location=(x, Y(s), (z0 + z1) / 2))
    o = bpy.context.active_object; o.name = name; o.data.materials.append(m)
    bpy.ops.object.shade_smooth()
    return link(o, layer)

# ================= 尺寸 =================
# 尺寸跟 3D 遊戲（js/truck.js）一樣，匯出的模型才能直接換上去
WR = 0.53            # 輪胎半徑
FRONT_AX = 3.8       # 前軸
DRIVE_AX = [0.7, -0.7]
TRAIL_AX = [-9.4, -10.7, -12.0]
CAB_S0, CAB_S1 = 3.09, 5.35   # 駕駛室前後
CAB_W = 2.5
CAB_Z0, CAB_Z1 = 1.35, 4.45
TR_S0, TR_S1 = -12.7, 0.9     # 拖車前後
TR_Z0, TR_Z1 = 1.45, 4.45
TR_W = 2.55

# ================= 拖車（trailer） =================
L = 'trailer'
box(L, 'tr_box', TR_S0, TR_S1, -TR_W / 2, TR_W / 2, TR_Z0, TR_Z1, M['tpaint'], bevel=0.04)
for z in (TR_Z0 + 0.06, TR_Z1 - 0.06):  # 上下鋁條
    box(L, 'tr_rail', TR_S0 - 0.01, TR_S1 + 0.01, -TR_W / 2 - 0.02, TR_W / 2 + 0.02, z - 0.07, z + 0.07, M['alu'], bevel=0.01)
s = TR_S0 + 0.3
while s < TR_S1 - 0.2:  # 側面直立加強肋
    box(L, 'tr_rib', s - 0.03, s + 0.03, -TR_W / 2 - 0.025, TR_W / 2 + 0.025, TR_Z0 + 0.12, TR_Z1 - 0.12, M['alu'])
    s += 0.62
box(L, 'tr_frame', TR_S0 + 0.2, TR_S1 - 0.3, -0.55, 0.55, TR_Z0 - 0.3, TR_Z0, M['frame'])
for s0 in (-1.9,):  # 支撐腳
    for x in (-0.85, 0.85):
        box(L, 'tr_leg', s0 - 0.08, s0 + 0.08, x - 0.08, x + 0.08, 0.35, TR_Z0 - 0.2, M['steel'])
        box(L, 'tr_foot', s0 - 0.18, s0 + 0.18, x - 0.18, x + 0.18, 0.28, 0.36, M['steel'])
for side in (-1, 1):  # 側邊防撞桿
    for z in (0.62, 0.86):
        box(L, 'tr_guard', -7.6, -2.2, side * 1.22 - 0.03, side * 1.22 + 0.03, z - 0.05, z + 0.05, M['steel'])
    s = -2.2
    while s >= -7.6:
        box(L, 'tr_guardpost', s - 0.03, s + 0.03, side * 1.2 - 0.03, side * 1.2 + 0.03, 0.55, TR_Z0 - 0.25, M['steel']); s -= 1.35
for s0 in TRAIL_AX:  # 擋泥板＋輪軸
    cyl_x(L, 'tr_axle', s0, 0, WR, 0.07, 2.0, M['frame'], 16)
box(L, 'tr_fender', TRAIL_AX[-1] - 0.7, TRAIL_AX[0] + 0.7, -1.28, 1.28, 1.12, 1.18, M['plastic'])
box(L, 'tr_rear_bumper', TR_S0 - 0.08, TR_S0 + 0.05, -1.15, 1.15, 0.45, 0.6, M['steel'])
box(L, 'tr_tape', TR_S0 + 0.4, TR_S1 - 0.4, -TR_W / 2 - 0.03, TR_W / 2 + 0.03, TR_Z0 + 0.16, TR_Z0 + 0.22, M['reflect'])
for side in (-1, 1):
    box(L, 'tr_tail', TR_S0 - 0.06, TR_S0, side * 0.95 - 0.18, side * 0.95 + 0.18, 0.95, 1.12, M['tail'])
    box(L, 'tr_mudflap', TRAIL_AX[-1] - 0.75, TRAIL_AX[-1] - 0.72, side * 1.0 - 0.32, side * 1.0 + 0.32, 0.2, 0.75, M['rubber'])
for i in range(6):  # 側面示寬燈
    box(L, 'tr_marker', -1.0 - i * 2.0 - 0.05, -1.0 - i * 2.0 + 0.05, -TR_W / 2 - 0.04, TR_W / 2 + 0.04, TR_Z0 + 0.02, TR_Z0 + 0.1, M['amber'])

# ================= 車頭底盤（tractor：大樑、油箱、擋泥板、第五輪，不會點頭） =================
L = 'tractor'
for x in (-0.43, 0.43):
    box(L, 'rail', -2.3, 4.7, x - 0.06, x + 0.06, 0.82, 1.12, M['frame'])
box(L, 'fifthwheel', -0.3, 1.2, -1.0, 1.0, 1.12, 1.24, M['frame'], bevel=0.03)
for s0 in DRIVE_AX: cyl_x(L, 'axle', s0, 0, WR, 0.09, 1.9, M['frame'], 16)
cyl_x(L, 'faxle', FRONT_AX, 0, WR, 0.08, 2.0, M['frame'], 16)
for side in (-1, 1):
    cyl_y(L, 'tank', 1.55, 2.95, side * 0.98, 0.98, 0.32, M['alu'], 40)                    # 鋁油箱
    for s0 in (1.8, 2.7): cyl_y(L, 'tank_strap', s0 - 0.03, s0 + 0.03, side * 0.98, 0.98, 0.355, M['black'], 40)
    box(L, 'rear_fender', DRIVE_AX[1] - 0.75, DRIVE_AX[0] + 0.75, side * 1.25 - 0.36, side * 1.25 + 0.36, 1.13, 1.2, M['plastic'], bevel=0.02)
    box(L, 'mudflap', DRIVE_AX[1] - 0.8, DRIVE_AX[1] - 0.77, side * 1.0 - 0.32, side * 1.0 + 0.32, 0.2, 0.75, M['rubber'])
    cyl_y(L, 'airtank', -0.6, 0.6, side * 0.75, 0.72, 0.13, M['steel'], 24)
box(L, 'battery', 2.98, 3.15, -1.2, 1.2, 0.75, 1.15, M['plastic'], bevel=0.02)

# ================= 駕駛室（cab：會跟著懸吊點頭） =================
L = 'cab'
cab = box(L, 'cab_body', CAB_S0, CAB_S1, -CAB_W / 2, CAB_W / 2, CAB_Z0, CAB_Z1, M['paint'], bevel=0.14, seg=5)
# 前臉稍微往後傾：把車頂前緣往後推
bpy.context.view_layer.objects.active = cab
bpy.ops.object.mode_set(mode='EDIT'); bm = bmesh.from_edit_mesh(cab.data)
for v in bm.verts:
    if v.co.z > (CAB_Z0 + CAB_Z1) / 2 and v.co.y < Y((CAB_S0 + CAB_S1) / 2): v.co.y += 0.18 * (v.co.z - CAB_Z0) / (CAB_Z1 - CAB_Z0)
bmesh.update_edit_mesh(cab.data); bpy.ops.object.mode_set(mode='OBJECT')
# 前輪輪拱：從車殼挖掉一個圓
bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=WR + 0.12, depth=3, location=(0, Y(FRONT_AX), WR), rotation=(0, math.pi / 2, 0))
cut = bpy.context.active_object
bl = cab.modifiers.new('arch', 'BOOLEAN'); bl.object = cut; bl.operation = 'DIFFERENCE'
bpy.context.view_layer.objects.active = cab
for md in list(cab.modifiers): bpy.ops.object.modifier_apply(modifier=md.name)
bpy.data.objects.remove(cut)
bpy.ops.object.shade_smooth()
# 車窗（擋風玻璃、側窗）
box(L, 'windshield', CAB_S1 - 0.05, CAB_S1 + 0.01, -1.12, 1.12, 2.85, 4.0, M['glass'])
for side in (-1, 1):
    box(L, 'sidewin', 4.25, 5.15, side * CAB_W / 2 - 0.01, side * CAB_W / 2 + 0.012, 2.95, 3.9, M['glass'], bevel=0.03)
    box(L, 'sleeperwin', 3.3, 3.95, side * CAB_W / 2 - 0.01, side * CAB_W / 2 + 0.012, 3.25, 3.65, M['glass'], bevel=0.02)
    box(L, 'doorseam_f', 5.2, 5.22, side * CAB_W / 2 - 0.005, side * CAB_W / 2 + 0.015, 1.5, 3.95, M['black'])
    box(L, 'doorseam_r', 4.18, 4.2, side * CAB_W / 2 - 0.005, side * CAB_W / 2 + 0.015, 1.5, 3.95, M['black'])
    box(L, 'handle', 4.3, 4.48, side * CAB_W / 2, side * CAB_W / 2 + 0.03, 2.75, 2.8, M['chrome'])
    # 上車踏板
    for i, z in enumerate((0.62, 0.98)):
        box(L, 'step', 4.35, 5.05, side * (CAB_W / 2 - 0.1 - i * 0.06) - 0.12, side * (CAB_W / 2 - 0.1 - i * 0.06) + 0.12, z, z + 0.05, M['alu'])
    # 後照鏡
    box(L, 'mirror_arm', 5.2, 5.3, side * (CAB_W / 2 + 0.02), side * (CAB_W / 2 + 0.32), 3.6, 3.66, M['black'])
    box(L, 'mirror', 5.18, 5.34, side * (CAB_W / 2 + 0.26) - 0.1, side * (CAB_W / 2 + 0.26) + 0.1, 3.0, 3.75, M['black'], bevel=0.03)
    # 頭燈、方向燈
    box(L, 'headlight', CAB_S1 - 0.02, CAB_S1 + 0.06, side * 0.92 - 0.26, side * 0.92 + 0.26, 1.5, 1.7, M['head'], bevel=0.02)
    box(L, 'indicator', CAB_S1 - 0.03, CAB_S1 + 0.05, side * 1.2 - 0.06, side * 1.2 + 0.06, 1.5, 1.7, M['amber'])
# 水箱罩（橫條）
for i in range(6):
    z = 1.85 + i * 0.14
    box(L, 'grille', CAB_S1 - 0.01, CAB_S1 + 0.04, -0.85, 0.85, z, z + 0.07, M['grille'])
# 原廠保險桿（黑色）
box(L, 'bumper', CAB_S1 - 0.1, CAB_S1 + 0.18, -1.22, 1.22, 0.75, 1.35, M['plastic'], bevel=0.05)
box(L, 'sunstrip', CAB_S1 - 0.3, CAB_S1 + 0.02, -1.24, 1.24, 4.05, 4.12, M['black'])
box(L, 'roofmarkers', CAB_S1 - 0.12, CAB_S1 - 0.06, -0.6, 0.6, 4.46, 4.52, M['amber'])

# ================= 改裝零件（各自一層） =================
box('kit_bumper_chromeb', 'chrome_bumper', CAB_S1 - 0.08, CAB_S1 + 0.22, -1.24, 1.24, 0.75, 1.37, M['chrome'], bevel=0.06)
for x in (-0.9, -0.3, 0.3, 0.9):  # 鐵牛欄
    box('kit_bumper_bull', 'bull_v', CAB_S1 + 0.25, CAB_S1 + 0.31, x - 0.04, x + 0.04, 0.75, 1.85, M['chrome'], bevel=0.02)
for z in (0.95, 1.8):
    box('kit_bumper_bull', 'bull_h', CAB_S1 + 0.24, CAB_S1 + 0.32, -1.1, 1.1, z - 0.04, z + 0.04, M['chrome'], bevel=0.02)
sp = box('kit_spoiler', 'spoiler', CAB_S0 + 0.15, CAB_S1 - 0.35, -1.18, 1.18, CAB_Z1 - 0.05, CAB_Z1 + 0.75, M['paint'], bevel=0.25, seg=6)
bpy.context.view_layer.objects.active = sp
bpy.ops.object.mode_set(mode='EDIT'); bm = bmesh.from_edit_mesh(sp.data)
for v in bm.verts:  # 導流罩前低後高
    if v.co.z > CAB_Z1 + 0.3: v.co.y += 0.0 if v.co.y > Y(CAB_S0 + 1.0) else 0.0
    t = (v.co.y - Y(CAB_S1 - 0.35)) / (Y(CAB_S0 + 0.15) - Y(CAB_S1 - 0.35))
    if v.co.z > CAB_Z1 + 0.1: v.co.z = CAB_Z1 + 0.1 + (v.co.z - CAB_Z1 - 0.1) * max(0.15, min(1, t))
bmesh.update_edit_mesh(sp.data); bpy.ops.object.mode_set(mode='OBJECT')
box('kit_lightbar', 'lightbar', CAB_S1 - 0.35, CAB_S1 - 0.15, -1.0, 1.0, CAB_Z1 + 0.02, CAB_Z1 + 0.2, M['black'], bevel=0.03)
for i in range(7): box('kit_lightbar', 'lb_led', CAB_S1 - 0.16, CAB_S1 - 0.12, -0.9 + i * 0.3 - 0.11, -0.9 + i * 0.3 + 0.11, CAB_Z1 + 0.05, CAB_Z1 + 0.17, M['head'])
box('kit_visor', 'visor', CAB_S1 - 0.05, CAB_S1 + 0.4, -1.25, 1.25, 4.0, 4.08, M['paint'], bevel=0.02)
for side in (-1, 1):
    cyl_z('kit_stacks', 'stack', CAB_S0 - 0.18, side * 1.1, 1.2, 4.85, 0.11, M['chrome'], 32)
    box('kit_stacks', 'heatshield', CAB_S0 - 0.18 - 0.14, CAB_S0 - 0.18 + 0.14, side * 1.1 - 0.14, side * 1.1 + 0.14, 2.4, 3.4, M['chrome'], bevel=0.02)
    box('kit_skirts', 'skirt', 1.35, 3.15, side * 1.34 - 0.03, side * 1.34 + 0.03, 0.75, 1.4, M['paint'], bevel=0.02)

# ================= 輪子（只建一顆，正面算圖；遊戲裡自己轉） =================
L = 'wheel'
cyl_x(L, 'tire', 0, 0, 0, WR, 0.32, M['rubber'], 64, bevel=0.06)
cyl_x(L, 'rim', 0, -0.15, 0, WR * 0.62, 0.04, M['rim'], 48)
cyl_x(L, 'hub', 0, -0.17, 0, WR * 0.22, 0.05, M['steel'], 32)
for i in range(10):
    a = i / 10 * math.tau
    cyl_x(L, 'nut', 0, -0.2, 0, 0.022, 0.04, M['chrome'], 12).location = (-0.2, math.cos(a) * WR * 0.3, math.sin(a) * WR * 0.3)
for i in range(8):
    a = i / 8 * math.tau + 0.2
    cyl_x(L, 'hole', 0, -0.17, 0, 0.045, 0.02, M['rimdark'], 16).location = (-0.17, math.cos(a) * WR * 0.46, math.sin(a) * WR * 0.46)
# 胎紋：輪胎外圈一圈小方塊
from mathutils import Matrix
for i in range(36):
    a = i / 36 * math.tau
    o = box(L, 'tread', -0.03, 0.03, -0.14, 0.14, WR - 0.02, WR + 0.012, M['rubber'])
    o.data.transform(Matrix.Translation(o.location)); o.location = (0, 0, 0)   # 把位置烘進網格，原點回到輪軸
    o.data.transform(Matrix.Rotation(a, 4, 'X'))                                # 繞輪軸排一圈

# ================= 燈光、世界、相機 =================
world = bpy.data.worlds.new('w'); scene.world = world; world.use_nodes = True
bg = world.node_tree.nodes['Background']
sky = world.node_tree.nodes.new('ShaderNodeTexSky')
try: sky.sky_type = 'NISHITA'; sky.sun_elevation = math.radians(40); sky.sun_rotation = math.radians(200)
except Exception: pass
world.node_tree.links.new(sky.outputs[0], bg.inputs[0]); bg.inputs[1].default_value = 0.3
def light(kind, loc, rot, energy, size=1.0, color=(1, 1, 1)):
    d = bpy.data.lights.new(kind + str(len(bpy.data.lights)), kind); d.energy = energy; d.color = color
    if kind == 'AREA': d.size = size
    o = bpy.data.objects.new(d.name, d); o.location = loc; o.rotation_euler = rot; scene.collection.objects.link(o); return o
light('SUN', (0, 0, 10), (math.radians(40), math.radians(-25), math.radians(-60)), 2.0)                  # 主光（太陽）
light('AREA', (-12, Y(-3), 8), (math.radians(60), 0, math.radians(-90)), 700, size=12, color=(0.85, 0.9, 1))  # 天空補光
light('AREA', (-6, Y(-4), 0.3), (math.radians(100), 0, math.radians(-90)), 150, size=14, color=(1, 0.95, 0.88))  # 地面反射光

S_MIN, S_MAX, Z_MAX = TR_S0 - 0.25, CAB_S1 + 0.45, 5.4
PXM = 720.0 / (S_MAX - S_MIN)   # 2D 設計像素／公尺（整台約 720 寬）
RES_MUL = 3 if QUALITY == 'final' else 1.5  # PNG 比設計像素多幾倍（畫面比較清楚）
cam_d = bpy.data.cameras.new('cam'); cam_d.type = 'ORTHO'
cam = bpy.data.objects.new('cam', cam_d); scene.collection.objects.link(cam); scene.camera = cam
W_M, H_M = S_MAX - S_MIN, Z_MAX
cam_d.ortho_scale = W_M
cam.location = (-30, Y((S_MIN + S_MAX) / 2), H_M / 2)
cam.rotation_euler = (math.radians(90), 0, math.radians(-90))   # 從 -X 看過去：畫面右邊＝車頭
scene.render.resolution_x = int(W_M * PXM * RES_MUL); scene.render.resolution_y = int(H_M * PXM * RES_MUL)
scene.render.film_transparent = True
scene.render.engine = 'CYCLES'
scene.cycles.samples = 64 if QUALITY == 'final' else 16
scene.cycles.use_denoising = True
scene.cycles.device = 'CPU'
scene.view_settings.view_transform = 'AgX'   # 亮的地方不會整片死白
scene.view_settings.exposure = -0.3
scene.render.image_settings.file_format = 'PNG'; scene.render.image_settings.color_mode = 'RGBA'

LAYERS = ['trailer', 'tractor', 'cab', 'kit_bumper_chromeb', 'kit_bumper_bull', 'kit_spoiler', 'kit_lightbar', 'kit_visor', 'kit_stacks', 'kit_skirts']
PAINT_LAYERS = {'trailer': 'PAINT_trailer', 'cab': 'PAINT_cab', 'kit_spoiler': 'PAINT_cab', 'kit_visor': 'PAINT_cab', 'kit_skirts': 'PAINT_cab'}

def only(layer_names):
    for n, c in COLL.items():
        c.hide_render = n not in layer_names

def render(path):
    scene.render.filepath = path; bpy.ops.render.render(write_still=True)

# 遮罩：烤漆的地方白、其他黑（只算一次光，很快）
mask_white = bpy.data.materials.new('mask_w'); mask_white.use_nodes = True
mask_black = bpy.data.materials.new('mask_b'); mask_black.use_nodes = True
for mm, col in ((mask_white, 1.0), (mask_black, 0.0)):
    nt = mm.node_tree; nt.nodes.clear(); em = nt.nodes.new('ShaderNodeEmission'); em.inputs[0].default_value = (col, col, col, 1); out = nt.nodes.new('ShaderNodeOutputMaterial'); nt.links.new(em.outputs[0], out.inputs[0])

def render_mask(layer, paint_name, path):
    saved = []
    for o in COLL[layer].objects:
        for i, slot in enumerate(o.material_slots):
            saved.append((o, i, slot.material))
            slot.material = mask_white if slot.material and slot.material.name == paint_name else mask_black
    sam = scene.cycles.samples; scene.cycles.samples = 4; dn = scene.cycles.use_denoising; scene.cycles.use_denoising = False
    scene.view_settings.view_transform = 'Standard'; ex = scene.view_settings.exposure; scene.view_settings.exposure = 0
    render(path)
    scene.view_settings.view_transform = 'AgX'; scene.view_settings.exposure = ex
    scene.cycles.samples = sam; scene.cycles.use_denoising = dn
    for o, i, m in saved: o.material_slots[i].material = m

side_dir = os.path.join(OUT, 'side')
for layer in LAYERS:
    only([layer]); render(os.path.join(side_dir, layer + '.png'))
    if layer in PAINT_LAYERS: render_mask(layer, PAINT_LAYERS[layer], os.path.join(side_dir, layer + '_mask.png'))

# 輪子：正面（相機看著輪軸）
only(['wheel'])
cam.location = (-10, 0, 0); cam.rotation_euler = (math.radians(90), 0, math.radians(-90)); cam_d.ortho_scale = WR * 2.08
scene.render.resolution_x = scene.render.resolution_y = 256
render(os.path.join(side_dir, 'wheel.png'))

# ---------------- 位置資料（給 2D 遊戲疊圖用） ----------------
def px(s): return 10 + (s - S_MIN) * PXM          # 2D 卡車畫布 x
def py(z): return 300 - z * PXM                    # 2D 卡車畫布 y（地面 300）
layout = {
    'pxPerM': PXM, 'resMul': RES_MUL,
    'frame': [px(S_MIN), py(Z_MAX), W_M * PXM, H_M * PXM],   # 每張分層圖都貼在這個框
    'layers': LAYERS, 'paint': PAINT_LAYERS,
    'wheelR': WR * PXM * 1.04,
    'axlesTractor': [px(FRONT_AX)] + [px(a) for a in DRIVE_AX],
    'axlesTrailer': [px(a) for a in TRAIL_AX],
    'head': [px(CAB_S1 + 0.08), py(1.6)], 'tail': [px(TR_S0 - 0.05), py(1.03)],
    'stack': [px(CAB_S0 - 0.18), py(4.85)], 'exhaust': [px(CAB_S0 - 0.2), py(0.8)],
    'window': [px(4.25), py(3.9), (5.15 - 4.25) * PXM, (3.9 - 2.95) * PXM],
    'cabPivot': [px(FRONT_AX - 0.5), py(1.2)],
}
with open(os.path.join(side_dir, 'layout.json'), 'w', encoding='utf8') as f: json.dump(layout, f, ensure_ascii=False, indent=1)

# ---------------- 3D 模型 ----------------
only(LAYERS)
for c in COLL.values(): c.hide_render = False
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, 'truck.glb'), export_format='GLB', export_yup=True, export_apply=True)
print('完成：', OUT)
