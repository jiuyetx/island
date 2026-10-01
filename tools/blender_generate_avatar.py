"""Create the playable islander as a low-poly, articulated GLB.

The hierarchy deliberately uses named pivots instead of an opaque baked mesh so
the Mini Game runtime can animate work actions without shipping a heavyweight
skeletal-animation stack.  Run with:
  /Applications/Blender.app/Contents/MacOS/Blender --background --python tools/blender_generate_avatar.py
"""
import os
import math
import sys
import bpy
import mathutils

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'assets', 'generated')
os.makedirs(OUT, exist_ok=True)


def clear_scene():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)


def material(name, color, roughness=.78):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    bsdf.inputs['Roughness'].default_value = roughness
    return mat


SKIN = material('Skin', (.73, .40, .23), .9)
SKIN_LIGHT = material('SkinHighlight', (.94, .63, .40), .86)
SHIRT = material('TealShirt', (.055, .40, .36), .82)
SHIRT_LIGHT = material('ShirtTrim', (.37, .75, .62), .76)
SHORTS = material('NavyShorts', (.055, .13, .17), .88)
STRAW = material('WovenStraw', (.72, .53, .27), .92)
STRAW_LIGHT = material('StrawEdge', (.90, .72, .39), .86)
HAIR = material('Hair', (.10, .045, .025), .9)
LEATHER = material('Leather', (.19, .09, .045), .85)
CANVAS = material('Canvas', (.74, .59, .37), .88)
EYE = material('Eye', (.015, .012, .009), .5)
WHITE = material('WarmWhite', (.97, .94, .81), .78)
BLUSH = material('PeachBlush', (.92, .33, .25), .88)
IRIS = material('HoneyIris', (.25, .10, .045), .63)
METAL = material('Metal', (.31, .48, .48), .48)


def parent(obj, pivot):
    obj.parent = pivot
    return obj


def empty(name, location=(0, 0, 0), parent_obj=None):
    bpy.ops.object.empty_add(type='PLAIN_AXES', location=location)
    obj = bpy.context.object
    obj.name = name
    if parent_obj:
        obj.parent = parent_obj
    return obj


def assign(obj, mat, name):
    obj.name = name
    obj.data.materials.append(mat)
    for face in obj.data.polygons:
        face.use_smooth = True
    return obj


def uv_sphere(name, location, scale, mat, parent_obj, segments=12, rings=7):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, location=location)
    obj = assign(bpy.context.object, mat, name)
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    parent(obj, parent_obj)
    return obj


def ico(name, location, scale, mat, parent_obj, subdivisions=1):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=subdivisions, radius=1, location=location)
    obj = assign(bpy.context.object, mat, name)
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    parent(obj, parent_obj)
    return obj


def cylinder(name, location, radius, depth, mat, parent_obj, vertices=10, radius2=None):
    bpy.ops.mesh.primitive_cone_add(vertices=vertices, radius1=radius, radius2=radius if radius2 is None else radius2,
                                   depth=depth, location=location)
    obj = assign(bpy.context.object, mat, name)
    parent(obj, parent_obj)
    return obj


def torus(name, location, major, minor, mat, parent_obj, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor, major_segments=12, minor_segments=5,
                                    location=location, rotation=rotation)
    obj = assign(bpy.context.object, mat, name)
    parent(obj, parent_obj)
    return obj


def rounded_box(name, location, scale, mat, parent_obj, bevel=.035):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    obj = assign(bpy.context.object, mat, name)
    obj.dimensions = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    modifier = obj.modifiers.new('Soft seams', 'BEVEL')
    modifier.width = bevel
    modifier.segments = 2
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    parent(obj, parent_obj)
    return obj


def tube(name, points, radius, mat, parent_obj):
    curve = bpy.data.curves.new(name, 'CURVE')
    curve.dimensions = '3D'
    curve.resolution_u = 2
    curve.bevel_depth = radius
    curve.bevel_resolution = 2
    spline = curve.splines.new('BEZIER')
    spline.bezier_points.add(len(points) - 1)
    for point, value in zip(spline.bezier_points, points):
        point.co = value
        point.handle_left_type = 'AUTO'
        point.handle_right_type = 'AUTO'
    obj = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)
    parent(obj, parent_obj)
    return obj


def hair_cap(parent_obj):
    # An open cap, not a whole sphere intersecting the face. The lower rim
    # leaves both eyebrows and eyes visible from the production camera.
    vertices, faces = [], []
    segments, rings = 20, 6
    for row in range(rings + 1):
        phi = .035 + row / rings * 1.25
        for col in range(segments):
            theta = col / segments * math.tau
            vertices.append((.364 * math.sin(phi) * math.cos(theta),
                             .314 * math.sin(phi) * math.sin(theta),
                             .014 + .373 * math.cos(phi)))
    for row in range(rings):
        for col in range(segments):
            a = row * segments + col
            b = row * segments + (col + 1) % segments
            faces.append((a, b, b + segments, a + segments))
    mesh = bpy.data.meshes.new('SoftHairCap')
    mesh.from_pydata(vertices, [], faces)
    obj = bpy.data.objects.new('Avatar_Hair', mesh)
    bpy.context.collection.objects.link(obj)
    assign(obj, HAIR, 'Avatar_Hair')
    parent(obj, parent_obj)


clear_scene()
root = empty('Avatar_Root')
body = empty('Avatar_Body', parent_obj=root)

# Original cozy islander: ~2.7 heads tall, broad cheeks, short rounded limbs.
# Overall height and foot contact remain compatible with existing navigation.
for side, x in (('L', -.145), ('R', .145)):
    leg = empty(f'Avatar_Leg_{side}', (x, 0, .53), root)
    uv_sphere(f'Avatar_Thigh_{side}', (0, 0, -.11), (.127, .125, .17), SHORTS, leg)
    cylinder(f'Avatar_Calf_{side}', (0, 0, -.31), .085, .20, SKIN_LIGHT, leg, 12)
    cylinder(f'Avatar_Sock_{side}', (0, 0, -.385), .092, .085, WHITE, leg, 12)
    uv_sphere(f'Avatar_Boot_{side}', (0, -.066, -.448), (.133, .185, .082), LEATHER, leg, 14, 8)
    uv_sphere(f'Avatar_Sole_{side}', (0, -.064, -.495), (.137, .188, .032), CANVAS, leg, 12, 6)

uv_sphere('Avatar_Torso', (0, 0, .815), (.28, .205, .28), SHIRT, body, 16, 10)
torus('Avatar_ShirtHem', (0, 0, .627), .213, .026, SHIRT_LIGHT, body)
cylinder('Avatar_Neck', (0, 0, 1.095), .09, .14, SKIN_LIGHT, body, 12)
torus('Avatar_Collar', (0, 0, 1.046), .10, .023, WHITE, body)
tube('Avatar_ShirtPlacket', [(0, -.182, 1.01), (0, -.211, .84)], .012, SHIRT_LIGHT, body)
for z in (.93, .855):
    uv_sphere('Avatar_Button', (0, -.222, z), (.018, .008, .018), WHITE, body, 8, 5)
rounded_box('Avatar_Pocket', (-.124, -.185, .835), (.108, .024, .092), SHIRT_LIGHT, body, .022)
rounded_box('Avatar_Pack', (0, .187, .817), (.30, .16, .32), CANVAS, body, .065)
rounded_box('Avatar_PackFlap', (0, .278, .89), (.265, .026, .12), STRAW_LIGHT, body, .035)
rounded_box('Avatar_PackBuckle', (0, .298, .845), (.043, .021, .064), LEATHER, body, .009)
for x in (-.18, .18):
    tube('Avatar_Strap', [(x, -.095, 1.019), (x, -.18, .86), (x, -.12, .66)], .020, CANVAS, body)

arms = {}
for side, x in (('L', -.305), ('R', .305)):
    arm = empty(f'Avatar_Arm_{side}', (x, 0, 1.018), root)
    arms[side] = arm
    uv_sphere(f'Avatar_Sleeve_{side}', (0, 0, -.105), (.112, .106, .155), SHIRT, arm)
    torus(f'Avatar_Cuff_{side}', (0, 0, -.213), .081, .015, SHIRT_LIGHT, arm)
    uv_sphere(f'Avatar_Forearm_{side}', (0, -.008, -.298), (.075, .073, .119), SKIN_LIGHT, arm)
    uv_sphere(f'Avatar_Hand_{side}', (0, -.025, -.427), (.088, .077, .091), SKIN_LIGHT, arm)
    uv_sphere(f'Avatar_Thumb_{side}', (-.059 if side == 'R' else .059, -.064, -.412),
              (.035, .036, .042), SKIN_LIGHT, arm, 8, 5)

head_pivot = empty('Avatar_HeadPivot', (0, 0, 1.44), body)
uv_sphere('Avatar_Head', (0, -.006, 0), (.35, .30, .36), SKIN_LIGHT, head_pivot, 20, 12)
# Large layered eyes and peach cheeks stay readable at the actual game scale.
# Each eye has a separate pivot for inexpensive blink animation.
for side, x in (('L', -.126), ('R', .126)):
    eye = empty(f'Avatar_Eye_{side}', (x, -.282, .032), head_pivot)
    uv_sphere(f'Avatar_EyeWhite_{side}', (0, 0, 0), (.073, .024, .095), WHITE, eye, 12, 8)
    uv_sphere(f'Avatar_Iris_{side}', (.006, -.023, -.004), (.044, .011, .065), IRIS, eye, 12, 8)
    uv_sphere(f'Avatar_Pupil_{side}', (.009, -.032, -.004), (.031, .008, .054), EYE, eye, 10, 6)
    uv_sphere(f'Avatar_Catchlight_{side}', (-.004, -.040, .023), (.012, .006, .018), WHITE, eye, 8, 5)
    tube(f'Avatar_Brow_{side}', [(x - .053, -.262, .149), (x, -.283, .161), (x + .043, -.262, .151)],
         .011, HAIR, head_pivot)
    uv_sphere(f'Avatar_Cheek_{side}', (x * 1.63, -.244, -.096), (.042, .010, .022), BLUSH, head_pivot, 10, 6)
uv_sphere('Avatar_Nose', (0, -.315, -.045), (.046, .043, .052), SKIN, head_pivot, 12, 8)
tube('Avatar_Smile', [(-.052, -.281, -.144), (0, -.288, -.165), (.052, -.281, -.144)],
     .011, HAIR, head_pivot)
for side, x in (('L', -.346), ('R', .346)):
    uv_sphere(f'Avatar_Ear_{side}', (x, -.008, -.01), (.064, .047, .076), SKIN_LIGHT, head_pivot, 12, 8)
    uv_sphere(f'Avatar_EarInner_{side}', (x, -.046, -.01), (.030, .011, .041), SKIN, head_pivot, 10, 6)

hair_cap(head_pivot)
for i, (x, z, angle) in enumerate([(-.185, .194, -.35), (-.054, .225, -.18), (.096, .228, .28)]):
    lock = uv_sphere(f'Avatar_Fringe_{i}', (x, -.265, z), (.090, .036, .105), HAIR, head_pivot, 12, 8)
    lock.rotation_euler[1] = angle
for x in (-.29, .29):
    uv_sphere('Avatar_Sideburn', (x, -.117, .047), (.038, .051, .104), HAIR, head_pivot, 10, 6)
cylinder('Avatar_HatBrim', (0, .015, .328), .455, .043, STRAW_LIGHT, head_pivot, 32, .443)
cylinder('Avatar_HatCrown', (0, .015, .409), .277, .146, STRAW, head_pivot, 24, .259)
torus('Avatar_HatBand', (0, .015, .357), .278, .022, SHIRT, head_pivot)
for z, radius in ((.390, .270), (.430, .266), (.469, .261)):
    torus('Avatar_HatWeave', (0, .015, z), radius, .005, STRAW_LIGHT, head_pivot)
# Original shell badge; no logos or copied clothing patterns.
uv_sphere('Avatar_HatShell', (.225, -.157, .378), (.038, .014, .041), WHITE, head_pivot, 10, 6)

# Grip inherits the right arm's motion and follows the mitten, rather than
# leaving the tool floating beside the torso during work actions.
tool_grip = empty('Avatar_ToolGrip', (0, -.060, -.425), arms['R'])

# Ground marker is not rendered in runtime; it documents the attachment plane
# and makes Blender review renders expose floating feet.
root['design'] = 'Original cozy islander / articulated / 2.7-head proportion'

bpy.ops.object.select_all(action='DESELECT')
for obj in bpy.context.scene.objects:
    obj.select_set(True)
bpy.context.view_layer.objects.active = root
triangles = 0
depsgraph = bpy.context.evaluated_depsgraph_get()
for obj in bpy.context.scene.objects:
    if obj.type not in ('MESH', 'CURVE'):
        continue
    evaluated = obj.evaluated_get(depsgraph)
    geometry = evaluated.to_mesh()
    triangles += sum(len(poly.vertices) - 2 for poly in geometry.polygons)
    evaluated.to_mesh_clear()
if not 1000 <= triangles <= 8000:
    raise RuntimeError(f'Avatar triangle budget failed: {triangles}')
bpy.ops.export_scene.gltf(
    filepath=os.path.join(OUT, 'tropical-avatar.glb'), export_format='GLB', use_selection=True,
    export_apply=True, export_yup=True, export_normals=True, export_materials='EXPORT',
    export_cameras=False, export_lights=False,
)

print('generated avatar:', os.path.join(OUT, 'tropical-avatar.glb'), 'triangles:', triangles)

if '--review' in sys.argv:
    # Review renders use this authored mesh, not a separate concept drawing.
    review = os.path.join(ROOT, 'artifacts', 'avatar')
    os.makedirs(review, exist_ok=True)
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = 24
    scene.render.resolution_x = 640
    scene.render.resolution_y = 640
    scene.render.resolution_percentage = 100
    scene.world.color = (.32, .40, .39)
    scene.view_settings.view_transform = 'AgX'
    bpy.ops.mesh.primitive_plane_add(size=200)
    floor = bpy.context.object
    floor.data.materials.append(material('ReviewGround', (.55, .69, .62)))
    for location, energy, size in (((-3, -4, 6), 480, 5), ((4, -1, 4), 240, 4), ((0, 4, 5), 350, 3)):
        bpy.ops.object.light_add(type='AREA', location=location)
        light = bpy.context.object
        light.data.energy, light.data.shape, light.data.size = energy, 'DISK', size
        light.rotation_euler = (mathutils.Vector((0, 0, 1)) - light.location).to_track_quat('-Z', 'Y').to_euler()
    bpy.ops.object.camera_add(location=(3, -6, 3.1))
    camera = bpy.context.object
    camera.data.type = 'ORTHO'
    camera.data.ortho_scale = 2.6
    scene.camera = camera
    for name, location in [('front', (0, -6, 2.8)), ('three-quarter', (3, -6, 3.1)), ('back', (-3, 6, 3))]:
        camera.location = location
        camera.rotation_euler = (mathutils.Vector((0, 0, .98)) - camera.location).to_track_quat('-Z', 'Y').to_euler()
        scene.render.filepath = os.path.join(review, name + '.png')
        bpy.ops.render.render(write_still=True)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(review, 'islander.blend'))
