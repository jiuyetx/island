"""Create the playable islander as a low-poly, articulated GLB.

The hierarchy deliberately uses named pivots instead of an opaque baked mesh so
the Mini Game runtime can animate work actions without shipping a heavyweight
skeletal-animation stack.  Run with:
  /Applications/Blender.app/Contents/MacOS/Blender --background --python tools/blender_generate_avatar.py
"""
import os
import math
import bpy

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


SKIN = material('Skin', (.68, .31, .16), .9)
SKIN_LIGHT = material('SkinHighlight', (.86, .50, .29), .86)
SHIRT = material('TealShirt', (.055, .31, .30), .82)
SHIRT_LIGHT = material('ShirtTrim', (.12, .52, .47), .76)
SHORTS = material('NavyShorts', (.055, .13, .17), .88)
STRAW = material('WovenStraw', (.72, .53, .27), .92)
STRAW_LIGHT = material('StrawEdge', (.90, .72, .39), .86)
HAIR = material('Hair', (.10, .045, .025), .9)
LEATHER = material('Leather', (.19, .09, .045), .85)
CANVAS = material('Canvas', (.74, .59, .37), .88)
EYE = material('Eye', (.015, .012, .009), .5)
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


def uv_sphere(name, location, scale, mat, parent_obj, segments=12, rings=8):
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


clear_scene()
root = empty('Avatar_Root')
body = empty('Avatar_Body', parent_obj=root)

# Feet and legs are independent pivots so walking, swimming and working poses
# have a readable knee/boot silhouette instead of a single moving capsule.
for side, x in (('L', -.135), ('R', .135)):
    leg = empty(f'Avatar_Leg_{side}', (x, 0, .64), root)
    cylinder(f'Avatar_Thigh_{side}', (0, 0, -.16), .11, .34, SHORTS, leg, 9, .095)
    cylinder(f'Avatar_Calf_{side}', (0, .005, -.42), .085, .30, SKIN, leg, 9, .072)
    boot = uv_sphere(f'Avatar_Boot_{side}', (0, -.055, -.60), (.115, .17, .075), LEATHER, leg, 10, 6)
    boot.rotation_euler[0] = math.radians(-9)

# Layered shirt, sash and pack provide material and depth separation in the
# isometric camera.  The pack straps visibly bridge chest to backpack.
cylinder('Avatar_Torso', (0, 0, 1.03), .265, .55, SHIRT, body, 12, .23)
torus('Avatar_Belt', (0, 0, .79), .245, .022, LEATHER, body)
rounded_box('Avatar_Pack', (0, .16, .98), (.30, .13, .40), CANVAS, body, .045)
rounded_box('Avatar_PackFlap', (0, .237, 1.08), (.25, .018, .12), STRAW_LIGHT, body, .012)
tube('Avatar_Strap_L', [(-.18, .045, 1.28), (-.18, .13, 1.06), (-.13, .20, .87)], .018, CANVAS, body)
tube('Avatar_Strap_R', [(.18, .045, 1.28), (.18, .13, 1.06), (.13, .20, .87)], .018, CANVAS, body)

for side, x in (('L', -.31), ('R', .31)):
    arm = empty(f'Avatar_Arm_{side}', (x, 0, 1.25), root)
    cylinder(f'Avatar_UpperArm_{side}', (0, 0, -.16), .085, .30, SHIRT, arm, 9, .075)
    cylinder(f'Avatar_Forearm_{side}', (0, -.005, -.40), .065, .27, SKIN, arm, 9, .058)
    hand = uv_sphere(f'Avatar_Hand_{side}', (0, -.012, -.57), (.074, .060, .075), SKIN_LIGHT, arm, 9, 6)
    # short shirt cuff makes the arm articulation legible in motion
    torus(f'Avatar_Cuff_{side}', (0, 0, -.305), .075, .013, SHIRT_LIGHT, arm)

neck = cylinder('Avatar_Neck', (0, 0, 1.37), .09, .16, SKIN, body, 10)
head = uv_sphere('Avatar_Head', (0, -.01, 1.60), (.205, .19, .235), SKIN_LIGHT, body, 13, 9)
# Face points toward negative Blender Y (positive Three Z after conversion).
for x in (-.067, .067):
    uv_sphere('Avatar_Eye', (x, -.182, 1.635), (.024, .012, .029), EYE, body, 8, 5)
uv_sphere('Avatar_Nose', (0, -.194, 1.59), (.032, .026, .038), SKIN, body, 8, 5)
tube('Avatar_Smile', [(-.045, -.192, 1.535), (0, -.208, 1.520), (.045, -.192, 1.535)], .010, HAIR, body)
for x in (-.205, .205):
    uv_sphere('Avatar_Ear', (x, 0, 1.60), (.038, .026, .052), SKIN, body, 8, 5)

# Hair and a woven, two-part straw hat give the hero a readable silhouette.
hair = uv_sphere('Avatar_Hair', (0, .015, 1.72), (.212, .20, .15), HAIR, body, 12, 7)
hair.rotation_euler[0] = math.radians(10)
for x in (-.12, -.06, .06, .12):
    tube('Avatar_HairLock', [(x, .11, 1.73), (x * 1.08, .13, 1.60)], .018, HAIR, body)
cylinder('Avatar_HatBrim', (0, 0, 1.80), .315, .032, STRAW_LIGHT, body, 18, .29)
cylinder('Avatar_HatCrown', (0, 0, 1.865), .18, .14, STRAW, body, 14, .165)
torus('Avatar_HatBand', (0, 0, 1.835), .178, .017, LEATHER, body)

# ToolGrip stays a dedicated pivot. Runtime-created rods, nets, axes and cans
# attach here; it is intentionally offset to the right hand rather than to the
# character centre so action arcs look physically motivated.
tool_grip = empty('Avatar_ToolGrip', (.33, -.035, .72), root)
tool_grip.rotation_euler[1] = math.radians(-5)

# Ground marker is not rendered in runtime; it documents the attachment plane
# and makes Blender review renders expose floating feet.
marker = cylinder('Avatar_ContactMarker', (0, 0, .008), .24, .016, METAL, root, 16)
marker.hide_render = True
marker.hide_viewport = True

bpy.ops.object.select_all(action='DESELECT')
for obj in bpy.context.scene.objects:
    obj.select_set(True)
bpy.context.view_layer.objects.active = root
bpy.ops.export_scene.gltf(
    filepath=os.path.join(OUT, 'tropical-avatar.glb'), export_format='GLB', use_selection=True,
    export_apply=True, export_yup=True, export_normals=True, export_materials='EXPORT',
    export_cameras=False, export_lights=False,
)

triangles = sum(len(poly.vertices) - 2 for obj in bpy.data.objects if obj.type == 'MESH' for poly in obj.data.polygons)
if not 1000 <= triangles <= 5200:
    raise RuntimeError(f'Avatar triangle budget failed: {triangles}')
print('generated avatar:', os.path.join(OUT, 'tropical-avatar.glb'), 'triangles:', triangles)
