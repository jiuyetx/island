"""Authored plant-form review only. No runtime asset export before approval.

Run Blender --background --python tools/blender_preview_plants.py
All coordinates here use Blender Z-up; runtime adaptation remains pending.
"""
import bpy
import math
import os
import json
from mathutils import Vector

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'artifacts', 'plants-review')
os.makedirs(os.path.join(OUT, 'renders'), exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

def material(name, color, roughness=.86):
    result = bpy.data.materials.new(name)
    result.diffuse_color = (*color, 1)
    result.use_nodes = True
    bsdf = result.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    bsdf.inputs['Roughness'].default_value = roughness
    return result

LEAVES = [material('Leaf_Jade', (.14, .36, .095)),
          material('Leaf_Sage', (.27, .47, .13)),
          material('Leaf_NewGrowth', (.46, .62, .19))]
WOOD = material('Warm_Ringed_Bark', (.45, .28, .14))
RINGS = material('Soft_Bark_Collars', (.55, .36, .19))
COCONUT = material('Olive_Coconuts', (.35, .39, .12))
TWIG = material('Shrub_Stem', (.26, .18, .075))
PETAL = material('Hibiscus_Coral', (.88, .27, .20))
PETAL_LIGHT = material('Hibiscus_Peach', (.98, .54, .33))
GOLD = material('Pollen', (.99, .72, .20))
SOIL = material('Review_Sand', (.76, .69, .51))

def assign(obj, name, mat):
    obj.name = name
    obj.data.materials.append(mat)
    for poly in obj.data.polygons:
        poly.use_smooth = True
    return obj

def tube(name, points, radii, mat, sides=10):
    if len(points) != len(radii):
        raise ValueError(f'{name}: centreline and radius counts must agree')
    vertices, faces = [], []
    for i, (point, radius) in enumerate(zip(points, radii)):
        direction = Vector(points[min(i+1, len(points)-1)]) - Vector(points[max(0, i-1)])
        direction.normalize()
        axis = direction.cross(Vector((0, 1, 0)))
        if axis.length < .01:
            axis = direction.cross(Vector((1, 0, 0)))
        axis.normalize()
        other = direction.cross(axis).normalized()
        for j in range(sides):
            angle = j * math.tau / sides
            vertices.append(Vector(point) + radius * (math.cos(angle)*axis + math.sin(angle)*other))
    for i in range(len(points)-1):
        for j in range(sides):
            a, b = i*sides+j, i*sides+(j+1)%sides
            faces.append((a, b, b+sides, a+sides))
    faces += [tuple(reversed(range(sides))), tuple((len(points)-1)*sides+i for i in range(sides))]
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    return assign(obj, name, mat)

def ellipsoid(name, point, scale, mat, segments=12, rings=6):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, location=point)
    obj = assign(bpy.context.object, name, mat)
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return obj

def palm_frond(origin, angle, length, width, rise, droop, mat, seed):
    """Continuous feather silhouette, scalloped edges and rounded V-camber.

    Broad connected leaves read at island camera distance; short edge splits
    still suggest pinnae without the former detached comb-like skeleton.
    """
    along = Vector((math.cos(angle), math.sin(angle), 0))
    side = Vector((-math.sin(angle), math.cos(angle), 0))
    vertices, faces, spine = [], [], []
    stations, across = 17, (-1, -.5, 0, .5, 1)
    for i in range(stations):
        t = i / (stations-1)
        center = Vector(origin) + along*(length*t) + side*(.10*math.sin(t*math.pi)*math.sin(seed))
        center.z += rise*math.sin(t*math.pi*.9)-droop*t*t
        profile = max(.015, math.sin(math.pi*t)**.8)
        # Shallow leaf splits, not alternating missing rectangles.
        scallop = .75 if i % 2 == 0 and 2 < i < stations-3 else 1
        half_width = width*profile*scallop
        spine.append(center.copy()+Vector((0, 0, .025)))
        for a in across:
            point = center + side*(a*half_width)
            point.z += .10*(1-abs(a))*profile-.085*abs(a)**1.5*profile
            vertices.append(point)
    for i in range(stations-1):
        for j in range(len(across)-1):
            a = i*len(across)+j
            faces.append((a, a+len(across), a+len(across)+1, a+1))
    mesh = bpy.data.meshes.new('Palm_Frond')
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new('Palm_Frond', mesh)
    bpy.context.collection.objects.link(obj)
    assign(obj, 'Palm_Frond', mat)
    # A real underside prevents paper-edge silhouettes in oblique views.
    solid = obj.modifiers.new('Leaf_thickness', 'SOLIDIFY')
    solid.thickness = .018
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=solid.name)
    vein = spine[::3]+[spine[-1]]
    tube('Palm_LeafVein', vein, [.023*(1-i/(len(vein)-1))+.003 for i in range(len(vein))], LEAVES[2], 4)
    return obj

def palm(location, size=1, seed=0):
    start = set(bpy.context.scene.objects)
    points = []
    for i in range(13):
        t = i/12
        points.append((.30*t*t, .14*math.sin(t*math.pi*.8), t*3.55))
    tube('Palm_Trunk', points, [.30-.16*i/12 for i in range(13)], WOOD, 12)
    for i in range(1, 12):
        t = i/12
        bpy.ops.mesh.primitive_torus_add(major_segments=10, minor_segments=3,
            location=points[i], major_radius=.30-.16*t+.002, minor_radius=.016)
        ring = assign(bpy.context.object, 'Palm_BarkRing', RINGS)
        ring.rotation_euler.y = .10*t
    crown = Vector(points[-1])
    # Three levels create an umbrella crown, rather than one flat star.
    for i in range(9):
        angle = i*math.tau/9 + .11*math.sin(i*2.1+seed)
        palm_frond(crown, angle, 2.25+.16*math.sin(i*1.7), .57+.07*math.cos(i*1.3),
                   .32, .82+.14*math.sin(i*2.2), LEAVES[i%2], i+seed)
    for i in range(4):
        angle = i*math.tau/4+.4
        palm_frond(crown+Vector((0, 0, .07)), angle, 1.64, .46, .85, .38, LEAVES[2 if i%2 else 1], i+2)
    for i in range(3):
        angle = i*math.tau/3
        ellipsoid('Palm_Coconut', crown+Vector((math.cos(angle)*.21, math.sin(angle)*.21, -.25)),
                  (.18, .16, .22), COCONUT)
    for obj in set(bpy.context.scene.objects)-start:
        obj.location = Vector(location)+obj.location*size
        obj.scale *= size
    return list(set(bpy.context.scene.objects)-start)

def shrub_leaf(origin, angle, length, width, tilt, mat):
    along = Vector((math.cos(angle), math.sin(angle), math.sin(tilt)))
    side = Vector((-math.sin(angle), math.cos(angle), 0))
    vertices, faces = [], []
    for i in range(7):
        t = i/6
        center = Vector(origin)+along*(length*t)
        center.z += math.sin(t*math.pi)*.055
        w = width*max(.012, math.sin(math.pi*t)**.7)
        for a in (-1, 0, 1):
            point = center+side*(a*w)
            point.z += (1-abs(a))*.028
            vertices.append(point)
    for i in range(6):
        for j in range(2):
            a = i*3+j
            faces.append((a, a+3, a+4, a+1))
    mesh = bpy.data.meshes.new('Hibiscus_Leaf')
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new('Hibiscus_Leaf', mesh)
    bpy.context.collection.objects.link(obj)
    assign(obj, 'Hibiscus_Leaf', mat)
    solid = obj.modifiers.new('Leaf_thickness', 'SOLIDIFY')
    solid.thickness = .012
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=solid.name)

def flower(point, mat):
    for i in range(5):
        angle = i*math.tau/5+.1
        petal = ellipsoid('Hibiscus_Petal', Vector(point)+Vector((math.cos(angle)*.11, math.sin(angle)*.11, .008)),
                          (.115, .082, .034), mat, 8, 4)
        petal.rotation_euler.z = angle
        petal.rotation_euler.y = -.19
    tube('Hibiscus_Stamen', [point, Vector(point)+Vector((.01, -.025, .11))], [.012, .009], GOLD, 6)
    ellipsoid('Hibiscus_Pollen', Vector(point)+Vector((.01, -.025, .12)), (.025, .025, .02), GOLD, 8, 4)

def shrub(location, size=1, seed=0):
    start = set(bpy.context.scene.objects)
    for branch in range(7):
        angle = branch*math.tau/7 + .11*math.sin(seed+branch)
        tip = Vector((math.cos(angle)*.42, math.sin(angle)*.42, .42+.11*math.sin(branch*1.8)))
        tube('Hibiscus_Branch', [(0, 0, 0), tip*.6, tip], [.045, .027, .014], TWIG, 7)
        for row in range(3):
            origin = tip*(.40+row*.28)
            for side in (-1, 1):
                shrub_leaf(origin, angle+side*.8, .34+row*.035, .145, .1+row*.09, LEAVES[(branch+row)%2])
        if branch in (1, 3, 5):
            flower(tip+Vector((.015, 0, .10)), PETAL if branch==3 else PETAL_LIGHT)
    # Upright tips hide the stem junction without a large opaque boulder mass.
    for i in range(5):
        shrub_leaf((0, 0, .21), i*math.tau/5, .38, .13, .85, LEAVES[1])
    for obj in set(bpy.context.scene.objects)-start:
        obj.location = Vector(location)+obj.location*size
        obj.scale *= size
    return list(set(bpy.context.scene.objects)-start)

def review():
    palms = palm((-2.15, .5, 0), 1, 0)
    palms += palm((2.5, 1.3, 0), .79, 2)
    palms += palm((1.3, -1.05, 0), .38, 4)
    shrubs = shrub((-1.85, -1.15, 0), 1.4, 1)
    shrubs += shrub((-.10, -1.45, 0), 1.25, 2)
    shrubs += shrub((3.25, -.45, 0), 1.15, 3)
    plants = palms+shrubs
    triangle_count = sum(sum(len(p.vertices)-2 for p in obj.data.polygons) for obj in plants)
    per_palm = sum(sum(len(p.vertices)-2 for p in obj.data.polygons) for obj in palms)//3
    per_shrub = sum(sum(len(p.vertices)-2 for p in obj.data.polygons) for obj in shrubs)//3
    for obj in plants:
        if obj.data.validate(verbose=True):
            raise ValueError(f'Invalid mesh rejected before review: {obj.name}')
    with open(os.path.join(OUT, 'model-metrics.json'), 'w') as stream:
        json.dump({'triangleCount': triangle_count, 'trianglesPerPalm': per_palm, 'trianglesPerShrub': per_shrub, 'objectCount': len(plants),
                   'exported': False, 'reviewOnly': True, 'source': 'tools/blender_preview_plants.py'}, stream, indent=2)

    bpy.ops.mesh.primitive_plane_add(size=200, location=(0, 0, -.008))
    assign(bpy.context.object, 'Review_Ground', SOIL)
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = 48
    scene.cycles.use_denoising = True
    scene.render.resolution_x = 1400
    scene.render.resolution_y = 1000
    scene.render.resolution_percentage = 100
    scene.world.color = (.6, .65, .7)
    scene.world.use_nodes = True
    scene.world.node_tree.nodes['Background'].inputs[0].default_value = (.68, .77, .81, 1)
    scene.world.node_tree.nodes['Background'].inputs[1].default_value = .55
    scene.view_settings.view_transform = 'AgX'
    bpy.ops.object.light_add(type='AREA', location=(-4, -6, 10))
    bpy.context.object.data.energy = 1700
    bpy.context.object.data.shape = 'DISK'
    bpy.context.object.data.size = 7
    bpy.ops.object.light_add(type='AREA', location=(6, 2, 7))
    bpy.context.object.data.energy = 800
    bpy.context.object.data.size = 6
    bpy.ops.object.camera_add(location=(9, -15, 12))
    camera = bpy.context.object
    camera.data.type = 'ORTHO'
    scene.camera = camera

    def render(name, location, target, scale):
        camera.location = location
        camera.rotation_euler = (Vector(target)-camera.location).to_track_quat('-Z', 'Y').to_euler()
        camera.data.ortho_scale = scale
        scene.render.filepath = os.path.join(OUT, 'renders', name+'.png')
        bpy.ops.render.render(write_still=True)

    render('plant-family', (9, -15, 12), (.15, 0, 1.6), 11.4)
    render('production-angle', (10, -10, 14), (.15, 0, 1.4), 12.7)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, 'plant-form-review.blend'))
    print('Plant review created; runtime export awaits explicit approval.')

if __name__ == '__main__':
    review()
