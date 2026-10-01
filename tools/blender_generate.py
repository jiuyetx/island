"""Headless Blender 3.6+ tropical asset build.

Run: Blender --background --python tools/blender_generate.py
Outputs two GLBs with one embedded atlas material each.  The atlas is deliberately
small (512px) so the next web build can transcode it to KTX2 without changing UVs.
"""
import math
import os
import json
import sys
import bpy

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "assets", "generated")
ATLAS_PATH = os.path.join(OUT, "tropical-atlas.png")
ATLAS_WEBP_PATH = os.path.join(OUT, "tropical-atlas.webp")
os.makedirs(OUT, exist_ok=True)
with open(os.path.join(ROOT, 'assets', 'coastline.json'), encoding='utf-8') as coastline_file:
    COASTLINE = json.load(coastline_file)
if (COASTLINE['shellBands']['sand'][-1][0] != COASTLINE['shoreRadius']
        or COASTLINE['shellBands']['underwater'][0][0] != COASTLINE['shoreRadius']):
    raise ValueError('Coastline shader radius must match both shoreline mesh bands')

# 4x4 swatches: sand, grass, wood, wall, roof, leaf, coral, rock, water/AO.
PALETTE = [
    (0.96, .73, .36, 1), (.25, .60, .26, 1), (.38, .18, .06, 1), (.93, .78, .52, 1),
    (.83, .36, .10, 1), (.13, .48, .18, 1), (1.0, .24, .35, 1), (.35, .38, .36, 1),
    (.04, .35, .40, 1), (.08, .62, .58, 1), (.95, .84, .63, 1), (.10, .24, .18, 1),
    (.80, .16, .46, 1), (.97, .54, .12, 1), (.58, .37, .22, 1), (.72, .90, .36, 1),
]

def make_atlas():
    # The atlas image is authored by tools/build_atlas.py so it can be rebuilt
    # without a working GPU/Metal backend. The GLBs export geometry-only
    # (export_materials='NONE'), so this is loaded only for the in-Blender
    # material reference and never embedded.
    if os.path.exists(ATLAS_PATH):
        return bpy.data.images.load(ATLAS_PATH)
    return bpy.data.images.new("TropicalAtlas", 512, 512, alpha=True)

ATLAS = make_atlas()

def make_material():
    material = bpy.data.materials.new("Tropical_Atlas_Material")
    material.use_nodes = True
    nodes, links = material.node_tree.nodes, material.node_tree.links
    bsdf = nodes.get("Principled BSDF")
    bsdf.inputs['Roughness'].default_value = .88
    tex = nodes.new('ShaderNodeTexImage')
    tex.image = ATLAS
    tex.interpolation = 'Linear'
    links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    return material

MATERIAL = make_material()

def uv_tile(obj, tile):
    """Map existing/generated UVs into one atlas tile (tile 0..15, top-left order)."""
    mesh = obj.data
    if not mesh.uv_layers:
        layer = mesh.uv_layers.new(name='UVMap')
        for loop in layer.data:
            loop.uv = (.5, .5)
    layer = mesh.uv_layers.active
    col, row = tile % 4, 3 - tile // 4
    for loop in layer.data:
        loop.uv = ((col + loop.uv.x * .94 + .03) / 4, (row + loop.uv.y * .94 + .03) / 4)
    # Geometry-only GLBs keep grayscale AO.  Three.js multiplies this by the
    # external atlas, while the GLB itself never carries an embedded image.
    color = mesh.color_attributes.get('AOColor') or mesh.color_attributes.new(
        name='AOColor', type='FLOAT_COLOR', domain='CORNER')
    base = PALETTE[tile]
    for i, loop in enumerate(color.data):
        uv = layer.data[i].uv
        edge = min((uv.x * 4) % 1, (uv.y * 4) % 1, 1 - ((uv.x * 4) % 1), 1 - ((uv.y * 4) % 1))
        ao = .76 + min(.24, edge * 1.25)
        loop.color = (ao, ao, ao, 1)
    obj.select_set(False)

def finish(obj, tile, name):
    obj.name = name
    uv_tile(obj, tile)
    for poly in obj.data.polygons:
        poly.use_smooth = False
    return obj

def cube(name, loc, scale, tile, bevel=None):
    """Create from Three.js coordinates: X right, Y up, Z forward.

    Blender is Z-up, so the coordinate and dimensions are swizzled here once.
    """
    x, y, z = loc
    sx, sy, sz = scale
    bpy.ops.mesh.primitive_cube_add(size=1, location=(x, z, y))
    obj = bpy.context.object
    obj.dimensions = (sx, sz, sy)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    # Slightly soften exposed hard-surface props by default. Keep the radius
    # proportional so tiny trim does not collapse under the bevel modifier.
    if bevel is None:
        bevel = min(sx, sy, sz) * .075
    if bevel:
        modifier = obj.modifiers.new('Soft corners', 'BEVEL')
        modifier.width, modifier.segments = min(bevel, min(sx, sy, sz) * .45), 2
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    return finish(obj, tile, name)

def cone(name, loc, radius1, radius2, depth, tile, vertices=7):
    x, y, z = loc
    bpy.ops.mesh.primitive_cone_add(vertices=vertices, radius1=radius1, radius2=radius2, depth=depth, location=(x, z, y))
    obj = finish(bpy.context.object, tile, name)
    # Keep caps crisp but let bark, rope, coral and posts read as rounded forms.
    for poly in obj.data.polygons:
        poly.use_smooth = len(poly.vertices) < vertices
    return obj

def ico(name, loc, radius, tile, subdivisions=1):
    x, y, z = loc
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=subdivisions, radius=radius, location=(x, z, y))
    return finish(bpy.context.object, tile, name)

def organic_rock(name, loc, radius, tile, seed=0):
    """Low-poly, rounded beach rock with an irregular footprint, not a cube/icosahedron."""
    x, y, z = loc
    rings, segments = ((0.0, .62), (.28, 1.05), (.67, .86), (1.0, .18)), 9
    verts, faces = [], []
    for ri, (height, scale) in enumerate(rings):
        for i in range(segments):
            a = math.tau * i / segments
            wobble = (1 + .10 * math.sin(a * 3 + seed) + .055 * math.sin(a * 5 - seed * 1.7)
                      + .035 * math.sin(a * 2 + seed + ri * 1.1))
            verts.append((x + math.cos(a) * radius * scale * wobble,
                          y + height * radius * (.78 + .07 * math.sin(a * 3 + seed)
                                                  + .035 * math.sin(a * 5 - seed)),
                          z + math.sin(a) * radius * scale * wobble))
    for ri in range(len(rings) - 1):
        for i in range(segments):
            a, b = ri * segments + i, ri * segments + (i + 1) % segments
            faces.append((a, b, b + segments, a + segments))
    faces.append(tuple(range(segments - 1, -1, -1)))
    faces.append(tuple((len(rings) - 1) * segments + i for i in range(segments)))
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata([(px, pz, py) for px, py, pz in verts], [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    finish(obj, tile, name)
    for poly in mesh.polygons:
        poly.use_smooth = True
    return obj

def tri_prism(name, loc, width, height, depth, tile):
    """Vertical triangular prism (gable end), centred on loc in Three.js coords."""
    x, y, z = loc
    hw, hd = width / 2, depth / 2
    verts = [(-hw, -hd, 0), (hw, -hd, 0), (0, -hd, height),
             (-hw, hd, 0), (hw, hd, 0), (0, hd, height)]
    faces = [(0, 1, 2), (3, 5, 4), (0, 2, 5, 3), (1, 4, 5, 2), (0, 3, 4, 1)]
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.location = (x, z, y)
    return finish(obj, tile, name)

def boat_hull(name, loc, tile):
    """Open skiff with a lifted bow, narrow keel and rounded, flared sides."""
    x, y, z = loc
    stations = [(-1.50, .05, .66, .44), (-1.08, .34, .55, .12),
                (-.38, .53, .50, -.08), (.45, .50, .52, -.03),
                (1.08, .30, .59, .15), (1.48, .05, .70, .47)]
    verts = []
    for sx, half, rail, keel in stations:
        verts.extend([(x + sx, y + rail, z - half), (x + sx, y + rail, z + half),
                      (x + sx, y + keel, z - half * .56), (x + sx, y + keel, z + half * .56)])
    faces = []
    for i in range(len(stations) - 1):
        a, b = i * 4, (i + 1) * 4
        faces += [(a, b, b + 2, a + 2), (a + 1, a + 3, b + 3, b + 1),
                  (a + 2, b + 2, b + 3, a + 3)]
    # Close the pointed bow/stern but deliberately leave the deck open.
    faces += [(0, 2, 3, 1), (len(verts) - 4, len(verts) - 3, len(verts) - 1, len(verts) - 2)]
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata([(px, pz, py) for px, py, pz in verts], [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    finish(obj, tile, name)
    for poly in mesh.polygons:
        poly.use_smooth = True
    return obj

def sail_triangle(name, loc, width, height, tile):
    """Slightly bowed canvas triangle, facing the production camera."""
    x, y, z = loc
    verts = [(x, y, z), (x + width, y, z), (x, y + height, z), (x + width * .52, y + height * .52, z - .08)]
    front = [(0, 1, 3), (1, 2, 3), (2, 0, 3)]
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata([(px, pz, py) for px, py, pz in verts], [], front)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    return finish(obj, tile, name)

def leaf_blade(name, start, end, width, tile, bend=.12, low_poly=False):
    """A curved, cupped, tapered leaflet in Three.js coordinates."""
    dx, dy, dz = end[0] - start[0], end[1] - start[1], end[2] - start[2]
    horizontal = math.hypot(dx, dz) or 1
    side = (-dz / horizontal, 0, dx / horizontal)
    stations = (0, .18, .42, .68, .86, 1) if low_poly else (0, .15, .33, .52, .70, .87, 1)
    across_values = (-1, 0, 1) if low_poly else (-1, -.5, 0, .5, 1)
    profile = (.08, .52, .84, 1, .88, .55, .01)
    verts, uvs = [], []
    for t in stations:
        profile_at = t * (len(profile) - 1)
        profile_index = min(len(profile) - 2, int(profile_at))
        profile_amount = profile_at - profile_index
        shape = profile[profile_index] * (1 - profile_amount) + profile[profile_index + 1] * profile_amount
        cx = start[0] + dx * t
        cy = start[1] + dy * t - bend * t * t
        cz = start[2] + dz * t
        for across in across_values:
            camber = .08 * (1 - abs(across) ** 1.5) * shape
            verts.append((cx + side[0] * width * shape * across,
                          cy + camber,
                          cz + side[2] * width * shape * across))
            uvs.append((t, (across + 1) * .5))
    faces = []
    for i in range(len(stations) - 1):
        for j in range(len(across_values) - 1):
            a = i * len(across_values) + j
            # Swizzling Three.js Y-up into Blender Z-up reverses handedness;
            # reverse each face once so its normal points above the leaf.
            stride = len(across_values)
            face = (a, a + 1, a + stride + 1, a + stride)
            faces.append(tuple(reversed(face)))
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata([(x, z, y) for x, y, z in verts], [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    uv = mesh.uv_layers.new(name='UVMap')
    for poly in mesh.polygons:
        for li in poly.loop_indices:
            uv.data[li].uv = uvs[mesh.loops[li].vertex_index]
    finish(obj, tile, name)
    for poly in mesh.polygons:
        poly.use_smooth = True
    return obj

def curved_chest_lid(name, loc, width, depth, tile):
    """A shallow barrel lid with a real crown, rather than another box top.

    The chest remains deliberately low-poly, but its curved cross section makes
    the lid read as a separate, hinged wood part from the playable cutaway
    camera.  Coordinates remain in the script's Three.js Y-up convention.
    """
    x, y, z = loc
    profile = [(-.50, 0), (-.27, .073), (0, .125), (.27, .073), (.50, 0)]
    verts = []
    for side in (-1, 1):
        for along, rise in profile:
            verts.append((x + side * width * .5, y + rise, z + along * depth))
    faces = []
    stride = len(profile)
    for i in range(stride - 1):
        faces.append((i, i + 1, stride + i + 1, stride + i))
    # Cap the rounded ends and close the underside so the chest has thickness.
    faces.extend((tuple(range(stride - 1, -1, -1)),
                  tuple(stride + i for i in range(stride)),
                  (0, stride, stride + stride - 1, stride - 1)))
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata([(px, pz, py) for px, py, pz in verts], [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    return finish(obj, tile, name)

def soft_rug(name, loc, width, depth, tile):
    """A thin rounded woven-rug silhouette with a raised, compressible centre."""
    x, y, z = loc
    segments = 16
    # Two rounded-rectangle rings make a slight fabric roll at the perimeter;
    # the centre fan avoids the old perfectly flat, wooden-tile appearance.
    def rounded_ring(scale, height):
        points = []
        for i in range(segments):
            a = math.tau * i / segments
            c, s = math.cos(a), math.sin(a)
            # Superellipse gives broad straight runs and soft, textile corners.
            px = math.copysign(abs(c) ** .34, c) * width * .5 * scale
            pz = math.copysign(abs(s) ** .34, s) * depth * .5 * scale
            points.append((x + px, y + height, z + pz))
        return points

    outer = rounded_ring(1, 0)
    inner = rounded_ring(.91, .025)
    verts = outer + inner + [(x, y + .040, z)]
    faces = []
    for i in range(segments):
        nxt = (i + 1) % segments
        faces.append((i, nxt, segments + nxt, segments + i))
        faces.append((segments + i, segments + nxt, segments * 2))
    # A sealed, nearly invisible underside prevents a paper-thin floating plane
    # when the player looks into the lifted-roof interior.
    faces.append(tuple(range(segments - 1, -1, -1)))
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata([(px, pz, py) for px, py, pz in verts], [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    for poly in mesh.polygons:
        poly.use_smooth = True
    return finish(obj, tile, name)

def join(objects, name):
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.join()
    objects[0].name = name
    return objects[0]

def island():
    """Irregular island: grass interior, sloped beach, underwater skirt.

    Split into one radial shell per material so no face spans two atlas tiles
    (that would lerp UVs through unrelated swatches). Shared boundary rings use
    the same wobble, so the shells meet exactly. The denser beach bands make a
    continuous dry-sand, wet-sand and shallow-water cross-section instead of
    the former stepped island tiers. Walkable grass stays at Y=2.0.
    """
    return [
        _radial_shell('Island_Grass', COASTLINE['shellBands']['grass'], 1, cap=True),
        _radial_shell('Island_Sand', COASTLINE['shellBands']['sand'], 0),
        _radial_shell('Island_Underwater', COASTLINE['shellBands']['underwater'], 8),
    ]


def _radial_shell(name, bands, tile, cap=False):
    """Build a ring-band mesh sampling a single atlas tile, so UVs never bleed."""
    segments = COASTLINE['segments']
    col, row = tile % 4, 3 - tile // 4

    def tile_uv(u, v):
        return ((col + u * .9 + .05) / 4, (row + v * .9 + .05) / 4)

    def wobble(angle, radius):
        # Broad coves and headlands first, with only a little fine shoreline noise.
        distortion = sum(term['amplitude'] * math.sin(angle * term['frequency'] + term['phase'])
                         for term in COASTLINE['radialHarmonics'])
        features = 0
        for feature in COASTLINE['shoreFeatures']:
            delta = math.atan2(math.sin(angle - feature['angle']), math.cos(angle - feature['angle']))
            features += feature['offset'] * math.exp(-.5 * (delta / feature['width']) ** 2)
        # Localized coves do not pinch the clear playable core. Inland grass has
        # its own lobes, giving the sand uneven width rather than a uniform ring.
        feature_weight = max(0, min(1, (radius - 8.5) / 6.2))
        # The outer shore must remain the exact runtime/shader contour. Interior
        # bands receive a small cross-slope drift so the beach does not read as
        # concentric, parallel rings while every shared material seam still joins.
        cross_slope = (radius - COASTLINE['shoreRadius']) * (
            .15 * math.sin(angle * 2 + .45) + .09 * math.sin(angle * 5 - 1.1)
            + .05 * math.sin(angle * 11 + .8))
        return radius * (1 + distortion) + cross_slope + features * feature_weight

    verts, uvs = [], []
    shell_bands = [band for band in bands if not cap or band[0] > 0]
    if cap:
        verts.append((0.0, 0.0, bands[0][1]))
        uvs.append(tile_uv(.5, .5))
    for ri, (radius, height) in enumerate(shell_bands):
        for i in range(segments):
            angle = i / segments * math.tau
            rr = wobble(angle, radius)
            # Gentle undulation breaks the cake-tier profile while preserving a
            # broad, clear centre for gameplay placement. It is a pure function
            # of the shared band coordinate, so grass, sand and seabed meet.
            beach_weight = max(0, 1 - abs(radius - 12.0) / 2.7)
            dune = beach_weight * (.17 * math.sin(angle * 5 + radius * 1.7)
                                  + .09 * math.sin(angle * 13 - radius * 2.4))
            verts.append((math.cos(angle) * rr, math.sin(angle) * rr,
                          height + .065 * math.sin(angle * 4 + radius) + .028 * math.sin(angle * 7 - radius) + dune))
            # Planar island-scale mapping keeps grains continuous across the
            # grass, sand and underwater material boundaries.
            uvs.append(tile_uv(.5 + math.cos(angle) * rr / 38,
                               .5 + math.sin(angle) * rr / 38))

    offset = 1 if cap else 0
    faces = []
    if cap:
        for i in range(segments):
            faces.append((0, 1 + i, 1 + (i + 1) % segments))
    for ri in range(len(shell_bands) - 1):
        inner = offset + ri * segments
        outer = inner + segments
        for i in range(segments):
            n = (i + 1) % segments
            faces.append((inner + i, outer + i, outer + n, inner + n))

    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)

    layer = mesh.uv_layers.new(name='UVMap')
    for poly in mesh.polygons:
        for li in poly.loop_indices:
            layer.data[li].uv = uvs[mesh.loops[li].vertex_index]

    color = mesh.color_attributes.new(name='AOColor', type='FLOAT_COLOR', domain='CORNER')
    for poly in mesh.polygons:
        for li in poly.loop_indices:
            co = mesh.vertices[mesh.loops[li].vertex_index].co
            if name == 'Island_Sand':
                radius = math.hypot(co.x, co.y)
                angle = math.atan2(co.y, co.x)
                shoreline = wobble(angle, COASTLINE['shoreRadius'])
                # A three-metre, uneven moisture fade follows this exact shoreline
                # contour. It is deliberately wider than the foam so wet sand is
                # a material zone, not a sharp painted outline.
                wet_edge = shoreline - 3.25 + .18 * math.sin(angle * 6 + .9)
                damp = max(0, min(1, (radius - wet_edge) / 3.45))
                damp = damp * damp * (3 - 2 * damp)
            else:
                damp = 0
            color.data[li].color = (.96 - .23 * damp, .96 - .17 * damp, .96 - .08 * damp, 1)

    for poly in mesh.polygons:
        poly.use_smooth = True
    obj.select_set(False)
    return obj

def hut_parts(origin=(1.6, 2.0, -1.4)):
    """Island cottage: hollow plaster walls, gable roof, porch and a furnished
    interior. Roof parts are named HutRoof_* so the runtime can lift them when
    the camera zooms in close enough to see inside."""
    x, y, z = origin
    out = []
    # Hollow shell so the interior is empty once the roof is lifted.
    out.append(cube('Hut_WallBack', (x, y + 1.22, z - 1.48), (3.9, 2.44, .14), 3))
    for side, dx in (('L', -1.88), ('R', 1.88)):
        out.append(cube(f'Hut_Wall{side}', (x + dx, y + 1.22, z), (.14, 2.44, 3.1), 3))
    # Front wall is built around the door and window openings, so glass and door
    # planes sit inside actual reveals instead of floating on a solid box face.
    for name, center_x, width in (('Hut_WallFront', -1.255, 1.39),
                                  ('Hut_WallFrontLower', 1.155, 1.59)):
        out.append(cube(name, (x + center_x, y + .58, z + 1.48), (width, 1.16, .14), 3))
    for name, center_x, width in (('Hut_WallFrontMidL', -1.765, .37),
                                  ('Hut_WallFrontMidR', 1.765, .37)):
        out.append(cube(name, (x + center_x, y + 1.51, z + 1.48), (width, .70, .14), 3))
    # The centre remains open to the top of the door, with a short lintel above it.
    out.append(cube('Hut_WallDoorJambL', (x - .69, y + 1.43, z + 1.48), (.26, .54, .14), 3))
    out.append(cube('Hut_WallDoorJambR', (x + .59, y + 1.43, z + 1.48), (.46, .54, .14), 3))
    out.append(cube('Hut_WallDoorLintel', (x, y + 1.78, z + 1.48), (1.64, .16, .14), 3))
    out.append(cube('Hut_WallFrontTop', (x, y + 2.20, z + 1.48), (3.9, .48, .14), 3))
    out.append(cube('Hut_Floor', (x, y + .04, z), (3.7, .12, 2.9), 2))
    # Timber frame and eaves give the plaster shell construction and scale.
    for dx in (-1.82, 1.82):
        for dz in (-1.42, 1.42):
            out.append(cone('Hut_CornerPost', (x + dx, y + 1.22, z + dz), .11, .09, 2.5, 2, 7))
    for dx in (-1.70, -.62, .54, 1.70):
        out.append(cube('Hut_FrontTimber', (x + dx, y + 1.22, z + 1.57), (.12, 2.28, .08), 2))
    out.append(cube('Hut_EaveFront', (x, y + 2.43, z + 1.55), (4.18, .16, .20), 2))
    out.append(cube('Hut_EaveBack', (x, y + 2.43, z - 1.55), (4.18, .16, .20), 2))
    # Interior: rounded mattress, supported furniture and a small round table.
    bed = ico('Hut_BedBase', (x - 1.05, y + .35, z - .5), 1, 14, 2)
    bed.scale = (.67, .97, .23)
    out.append(bed)
    quilt = ico('Hut_BedQuilt', (x - 1.05, y + .53, z - .23), 1, 10, 2)
    quilt.scale = (.61, .73, .105)
    out.append(quilt)
    pillow = ico('Hut_BedPillow', (x - 1.05, y + .57, z - 1.17), 1, 3, 1)
    pillow.scale = (.45, .23, .11)
    out.append(pillow)
    for dx, dz in ((-.48, -.72), (.48, -.72), (-.48, .72), (.48, .72)):
        out.append(cone('Hut_BedLeg', (x - 1.05 + dx, y + .16, z - .5 + dz), .075, .11, .34, 14, 6))
    # Storage chest: framed front, curved lid, feet and an actual ring pull.
    # Keep Hut_Chest as the source-name contract; the surrounding parts explain
    # how it opens and stands rather than presenting a single solid cube.
    chest_x, chest_z = x + 1.2, z - .95
    out.append(cube('Hut_Chest', (chest_x, y + .305, chest_z), (.80, .33, .55), 14, .035))
    for side in (-1, 1):
        out.append(cube('Hut_ChestFrontStile',
                        (chest_x + side * .325, y + .305, chest_z + .286), (.065, .30, .040), 2, .012))
    out.append(cube('Hut_ChestFrontRailTop', (chest_x, y + .435, chest_z + .287), (.67, .055, .040), 2, .012))
    out.append(cube('Hut_ChestFrontRailBottom', (chest_x, y + .175, chest_z + .287), (.67, .055, .040), 2, .012))
    out.append(cube('Hut_ChestFrontPanel', (chest_x, y + .305, chest_z + .294), (.53, .19, .018), 14, .009))
    out.append(curved_chest_lid('Hut_ChestLid', (chest_x, y + .475, chest_z), .88, .62, 14))
    # Narrow lid battens follow the same crown at either end; they are small
    # structural trim, not a second rectangular lid.
    for side in (-1, 1):
        out.append(curved_chest_lid('Hut_ChestLidBatten',
                                    (chest_x + side * .325, y + .485, chest_z), .050, .64, 2))
    for dx in (-.30, .30):
        for dz in (-.19, .19):
            out.append(cone('Hut_ChestFoot', (chest_x + dx, y + .162, chest_z + dz), .060, .044, .125, 2, 7))
    out.append(cube('Hut_ChestLockPlate', (chest_x, y + .305, chest_z + .319), (.090, .105, .022), 2, .009))
    bpy.ops.mesh.primitive_torus_add(major_radius=.082, minor_radius=.014, major_segments=8, minor_segments=4,
                                     location=(chest_x, chest_z + .338, y + .305), rotation=(math.pi * .5, 0, 0))
    out.append(finish(bpy.context.object, 2, 'Hut_ChestRingPull'))
    # The rug is a low, softly domed textile with a rounded perimeter and light
    # fringe.  Its underside sits on the floor rather than floating above it.
    out.append(soft_rug('Hut_Rug', (x + .1, y + .102, z + .45), 1.60, 1.30, 12))
    for side in (-1, 1):
        for tassel_x in (-.46, 0, .46):
            out.append(cube('Hut_RugTassel', (x + .1 + tassel_x, y + .112, z + .45 + side * .705),
                            (.026, .014, .15), 12, .006))
    out.append(cone('Hut_InsideTable', (x + 1.15, y + .5, z + .72), .47, .50, .12, 2, 12))
    out.append(cone('Hut_InsideTableLeg', (x + 1.15, y + .26, z + .72), .10, .16, .56, 14, 7))

    def roof_panel(name, side):
        cols, rows, thickness = 5, 5, .11
        verts = []
        for lower in (0, 1):
            for row in range(rows):
                length_t = row / (rows - 1)
                for col in range(cols):
                    slope_t = col / (cols - 1)
                    px = x + side * 2.42 * slope_t
                    py = y + 3.67 - 1.24 * slope_t + .045 * math.sin(math.pi * length_t)
                    pz = z - 1.96 + 3.92 * length_t
                    verts.append((px, py - lower * thickness, pz))
        faces = []
        layer = cols * rows
        for row in range(rows - 1):
            for col in range(cols - 1):
                a = row * cols + col
                faces.append((a, a + cols, a + cols + 1, a + 1))
                faces.append((layer + a + 1, layer + a + cols + 1, layer + a + cols, layer + a))
        for row in range(rows - 1):
            for col in (0, cols - 1):
                a, b = row * cols + col, (row + 1) * cols + col
                faces.append((a, b, layer + b, layer + a))
        for col in range(cols - 1):
            for row in (0, rows - 1):
                a, b = row * cols + col, row * cols + col + 1
                faces.append((a, layer + a, layer + b, b))
        mesh = bpy.data.meshes.new(name)
        mesh.from_pydata([(px, pz, py) for px, py, pz in verts], [], faces)
        mesh.update()
        panel = bpy.data.objects.new(name, mesh)
        bpy.context.collection.objects.link(panel)
        return finish(panel, 4, name)

    # Continuous roof sheets carry the silhouette; narrow ribs only explain construction.
    out.extend((roof_panel('HutRoof_Left', -1), roof_panel('HutRoof_Right', 1)))
    out.append(cube('HutRoof_Ridge', (x, y + 3.64, z), (.20, .13, 4.02), 2))
    roof_pitch = math.atan2(1.24, 2.42)
    for side in (-1, 1):
        for dz in (-1.76, -1.04, -.32, .40, 1.12, 1.76):
            rafter = cube('HutRoof_Rafter', (x + side * 1.20, y + 3.12, z + dz),
                           (2.56, .07, .075), 2)
            rafter.rotation_euler[1] = side * roof_pitch
            out.append(rafter)
    # Tapered chimney avoids another unbroken box silhouette on the roofline.
    out.append(cone('HutRoof_Chimney', (x - .95, y + 3.3, z - .85), .34, .25, 2.5, 7, 6))
    out.append(cone('HutRoof_ChimneyCap', (x - .95, y + 4.66, z - .85), .43, .40, .18, 3, 8))
    # Green-framed windows on the front wall.
    for side, dx in (('L', -1.2), ('R', 1.2)):
        out.append(cube(f'Hut_Window_{side}', (x + dx, y + 1.52, z + 1.535), (.66, .62, .04), 8))
        out.append(cube(f'Hut_WindowFrame_{side}', (x + dx, y + 1.52, z + 1.59), (.92, .88, .07), 2))
    # Door, step and a surfboard leaning on the wall.
    out.append(cube('Hut_Door', (x - .1, y + .9, z + 1.6), (.86, 1.6, .12), 8))
    out.append(cube('Hut_Step', (x - .1, y + .14, z + 1.94), (1.6, .28, .72), 2))
    board = cube('Hut_Surfboard', (x + 1.72, y + 1.05, z + 1.78), (.46, 2.1, .1), 10)
    board.rotation_euler[1] = .12
    out.append(board)
    # Front porch: separate curved-edge boards sit on two visible crossbeams.
    for i in range(5):
        out.append(cube('Hut_Deck' if i == 0 else 'Hut_DeckPlank',
                        (x, y + .12, z + 2.14 + i * .34), (3.22 - .08 * (i % 2), .14, .29), 2))
    for dz in (2.34, 3.34):
        out.append(cube('Hut_DeckBeam', (x, y - .02, z + dz), (3.34, .16, .15), 14))
    for dx in (-1.35, 1.35):
        out.append(cone('Hut_PorchPost', (x + dx, y + 1.15, z + 3.32), .14, .11, 2.2, 2, 7))
    out.append(cube('Hut_PorchBeam', (x, y + 2.22, z + 3.32), (3.1, .18, .2), 2))
    # Porch furniture: a bench and a small round table.
    out.append(cube('Hut_BenchSeat', (x - 1.0, y + .5, z + 2.92), (1.35, .14, .52), 2))
    out.append(cube('Hut_BenchBack', (x - 1.0, y + .84, z + 2.68), (1.35, .46, .12), 2))
    for dx in (-.55, .55):
        out.append(cube('Hut_BenchLeg', (x - 1.0 + dx, y + .26, z + 2.92), (.14, .48, .46), 14))
    out.append(cube('Hut_TableTop', (x + .95, y + .56, z + 2.86), (.82, .12, .82), 2))
    out.append(cone('Hut_TableLeg', (x + .95, y + .26, z + 2.86), .1, .13, .56, 14, 6))
    return out

def boat_parts(origin=(-9.4, .35, 5.4)):
    x, y, z = origin
    hull = boat_hull('Boat_Hull', (x, y, z), 2)
    out = [hull, cube('Boat_SeatA', (x - .42, y + .36, z), (.18, .10, .92), 14),
           cube('Boat_SeatB', (x + .35, y + .37, z), (.18, .10, .84), 14),
           cone('Boat_Mast', (x - .12, y + 1.35, z), .07, .045, 2.45, 2, 7),
           sail_triangle('Boat_Sail', (x - .08, y + .54, z + .02), 1.42, 1.68, 10)]

    # A continuous, slightly cambered inner floor prevents the water plane
    # from being visible through the open hull. It is a thin boat-shaped
    # surface rather than a solid rectangular plug.
    floor_stations = [(-1.46, .025, .36), (-1.05, .26, .16),
                      (-.38, .43, .11), (.45, .40, .13),
                      (1.05, .23, .20), (1.44, .025, .39)]
    floor_verts = []
    for sx, half, rise in floor_stations:
        floor_verts.extend(((x + sx, z - half, y + rise),
                            (x + sx, z + half, y + rise)))
    floor_faces = [(2*i, 2*i+2, 2*i+3, 2*i+1)
                   for i in range(len(floor_stations)-1)]
    floor_mesh = bpy.data.meshes.new('Boat_Interior')
    floor_mesh.from_pydata(floor_verts, [], floor_faces)
    floor_mesh.update()
    floor_obj = bpy.data.objects.new('Boat_Interior', floor_mesh)
    bpy.context.collection.objects.link(floor_obj)
    out.append(finish(floor_obj, 14, 'Boat_Interior'))

    def gunwale(name, side):
        stations = [(-1.50, .05, .66), (-1.08, .34, .55), (-.38, .53, .50),
                    (.45, .50, .52), (1.08, .30, .59), (1.48, .05, .70)]
        verts, faces = [], []
        for sx, half, rail in stations:
            px, py, pz = x + sx, y + rail + .025, z + side * half
            verts.extend(((px, py - .035, pz - .026), (px, py - .035, pz + .026),
                          (px, py + .035, pz - .026), (px, py + .035, pz + .026)))
        for i in range(len(stations) - 1):
            a, b = i * 4, (i + 1) * 4
            faces.extend(((a, b, b + 2, a + 2), (a + 1, a + 3, b + 3, b + 1),
                          (a, a + 1, b + 1, b), (a + 2, b + 2, b + 3, a + 3)))
        faces.extend(((0, 2, 3, 1), (len(verts) - 4, len(verts) - 3,
                      len(verts) - 1, len(verts) - 2)))
        mesh = bpy.data.meshes.new(name)
        mesh.from_pydata([(px, pz, py) for px, py, pz in verts], [], faces)
        mesh.update()
        rail = bpy.data.objects.new(name, mesh)
        bpy.context.collection.objects.link(rail)
        return finish(rail, 14, name)

    for side in (-1, 1):
        out.append(gunwale('Boat_Gunwale', side))
    for side in (-1, 1):
        shaft = cube('Boat_Oar', (x + .18, y + .65, z + side * .78), (1.75, .06, .055), 14)
        shaft.rotation_euler[1] = side * .22
        out.append(shaft)
        out.append(leaf_blade('Boat_OarBlade', (x + .97, y + .64, z + side * .94),
                              (x + 1.52, y + .62, z + side * 1.15), .16, 14, bend=.03, low_poly=True))
    out.append(cone('Boat_MooringCleat', (x + 1.12, y + .55, z), .065, .09, .20, 14, 6))
    out.append(cone('Boat_MooringStake', (x + 1.78, y + .13, z + .72), .045, .07, .36, 14, 5))
    out.append(leaf_blade('Boat_MooringRope', (x + 1.12, y + .66, z),
                          (x + 1.78, y + .31, z + .72), .035, 14, bend=.22, low_poly=True))
    return out

def dock_parts(origin=(4.7, 1.1, 4.9)):
    x, y, z = origin
    out = []
    # Gapped, independently rounded planks sit over transverse beams.
    for i in range(6):
        out.append(cube('Dock_Platform' if i == 0 else 'Dock_Plank',
                        (x + .035 * math.sin(i * 2.1), y, z - .70 + i * .28),
                        (3.88 - .10 * (i % 2), .16, .245), 2))
    for dz in (-.47, .48):
        out.append(cube('Dock_Crossbeam', (x, y - .17, z + dz), (3.72, .17, .16), 14))
    for dx, dz, h in ((-1.55, -.52, 1.88), (1.55, -.52, 2.06),
                      (-1.55, .54, 2.00), (1.55, .54, 1.82)):
        out.append(cone('Dock_Post', (x + dx, y - h / 2 + .06, z + dz), .15, .12, h, 14, 7))
    for side in (-1, 1):
        brace = cube('Dock_Brace', (x + side * 1.46, y - .49, z - .49), (.10, 1.18, .10), 14)
        brace.rotation_euler[1] = side * .62
        out.append(brace)
    out.append(cone('Dock_Bollard', (x + 1.25, y + .19, z + .48), .12, .15, .36, 14, 7))
    out.append(cone('Dock_RopeTie', (x + 1.76, y + .19, z + .82), .08, .10, .36, 14, 6))
    out.append(leaf_blade('Dock_MooringRope', (x + 1.25, y + .38, z + .48),
                          (x + 1.76, y + .38, z + .82), .035, 14, bend=.20, low_poly=True))
    # Shore cargo uses actual boards, proud battens and barrel hoops so its
    # construction still reads at the game's camera distance.
    def crate(cx, cz, size):
        base_y = y + .11
        core = cube('Dock_Crate', (cx, base_y + size * .5, cz),
                    (size * .90, size * .90, size * .90), 2, bevel=.018)
        out.append(core)
        board = size * .285
        face = size * .465
        for offset in (-board, 0, board):
            # Separate boards on the front, back and lid create real seams.
            out.append(cube('Dock_Crate', (cx + offset, base_y + size * .5, cz + face),
                            (board - .014, size * .84, .035), 2, bevel=.006))
            out.append(cube('Dock_Crate', (cx + offset, base_y + size * .5, cz - face),
                            (board - .014, size * .84, .035), 2, bevel=.006))
            out.append(cube('Dock_Crate', (cx + offset, base_y + size * .965, cz),
                            (board - .014, .035, size * .84), 2, bevel=.006))
            out.append(cube('Dock_Crate', (cx + face, base_y + size * .5, cz + offset),
                            (.035, size * .84, board - .014), 2, bevel=.006))
            out.append(cube('Dock_Crate', (cx - face, base_y + size * .5, cz + offset),
                            (.035, size * .84, board - .014), 2, bevel=.006))
        for height in (base_y + size * .29, base_y + size * .71):
            out.append(cube('Dock_Crate', (cx, height, cz + face + .018),
                            (size * .98, .075, .055), 14, bevel=.008))
            out.append(cube('Dock_Crate', (cx, height, cz - face - .018),
                            (size * .98, .075, .055), 14, bevel=.008))

    def barrel(cx, cz):
        height, rings, sides = .84, ((-.42, .245), (-.30, .295), (0, .335),
                                     (.30, .295), (.42, .245)), 12
        verts, faces = [], []
        for by, radius in rings:
            for side in range(sides):
                angle = side * math.tau / sides
                # A slight alternating spread gives every stave its own plane.
                stave_radius = radius * (1 + .018 * math.sin(side * 5.1))
                verts.append((cx + math.cos(angle) * stave_radius, y + .11 + height * .5 + by,
                              cz + math.sin(angle) * stave_radius))
        for ring in range(len(rings) - 1):
            for side in range(sides):
                a = ring * sides + side
                next_side = (side + 1) % sides
                faces.append((a, a + sides, (ring + 1) * sides + next_side,
                              ring * sides + next_side))
        faces.extend((tuple(reversed(range(sides))),
                      tuple((len(rings) - 1) * sides + side for side in range(sides))))
        mesh = bpy.data.meshes.new('Dock_Barrel')
        mesh.from_pydata([(px, pz, py) for px, py, pz in verts], [], faces)
        mesh.update()
        body = bpy.data.objects.new('Dock_Barrel', mesh)
        bpy.context.collection.objects.link(body)
        finish(body, 14, 'Dock_Barrel')
        for poly in mesh.polygons:
            poly.use_smooth = len(poly.vertices) == 4
        out.append(body)
        for by, radius in ((-.25, .308), (.02, .346), (.27, .308)):
            bpy.ops.mesh.primitive_torus_add(major_radius=radius, minor_radius=.026,
                                             major_segments=12, minor_segments=4,
                                             location=(cx, cz, y + .11 + height * .5 + by))
            out.append(finish(bpy.context.object, 7, 'Dock_Barrel'))
        bpy.ops.mesh.primitive_torus_add(major_radius=.205, minor_radius=.035,
                                         major_segments=12, minor_segments=4,
                                         location=(cx, cz, y + .11 + height))
        out.append(finish(bpy.context.object, 7, 'Dock_Barrel'))
        out.append(cone('Dock_Barrel', (cx, y + .11 + height + .004, cz), .19, .19, .016, 11, 12))

    crate(x - 1.3, z + .35, .52)
    crate(x + .7, z - .35, .44)
    barrel(x + 1.45, z + .45)
    return out

def garden_parts(origin=(-3.2, 1.3, 4.2)):
    x, y, z = origin
    out = []
    def soil_ridge(name, center_z):
        rings = ((0, 1.50, .38), (.09, 1.42, .33), (.19, 1.15, .23))
        segments, verts, faces = 12, [], []
        for height, rx, rz in rings:
            for i in range(segments):
                angle = i * math.tau / segments
                wobble = 1 + .035 * math.sin(angle * 3 + center_z * 2)
                verts.append((x + math.cos(angle) * rx * wobble,
                              y + height,
                              z + center_z + math.sin(angle) * rz * wobble))
        for ring in range(len(rings) - 1):
            for i in range(segments):
                a, b = ring * segments + i, ring * segments + (i + 1) % segments
                faces.append((a, b, b + segments, a + segments))
        faces.append(tuple((len(rings) - 1) * segments + i for i in range(segments)))
        mesh = bpy.data.meshes.new(name)
        mesh.from_pydata([(px, pz, py) for px, py, pz in verts], [], faces)
        mesh.update()
        ridge = bpy.data.objects.new(name, mesh)
        bpy.context.collection.objects.link(ridge)
        finish(ridge, 14, name)
        for face in mesh.polygons:
            face.use_smooth = True
        return ridge

    for row in (-.8, 0, .8):
        out.append(soil_ridge('Garden_Bed', row))
        for index, dx in enumerate((-.78, 0, .78)):
            stem_height = .34 + .045 * math.sin(index + row * 4)
            out.append(cone('Garden_Sprout', (x + dx, y + .19 + stem_height / 2, z + row),
                            .045, .025, stem_height, 15, 5))
            for side in (-1, 1):
                out.append(leaf_blade('Garden_Leaf', (x + dx, y + .19 + stem_height * .52, z + row),
                                      (x + dx + side * (.23 + .025 * index), y + .18 + stem_height,
                                       z + row + .12 * math.sin(index + side)),
                                      .095, 15 if side < 0 else 5, bend=.055, low_poly=True))
    return out

def static_pack():
    parts = island() + hut_parts() + boat_parts()
    for i, (x, z, tile) in enumerate(((-8, -6, 7), (-5.3, 7.5, 6), (7.4, 6.6, 12), (9.5, -4.6, 13), (-10, 2.5, 9))):
        parts.append(organic_rock('Coral_or_Rock', (x, .12, z), .5 + (i % 2) * .16, tile, i * 1.7))
    return parts

def palm(origin=(0, 0, 0), prefix='Palm_Source'):
    """One continuous, wind-bent palm with an uneven feather-leaf crown."""
    x, y, z = origin
    parts = []
    segments, rings = 10, 9
    trunk_verts, trunk_faces = [], []
    for ring in range(rings):
        t = ring / (rings - 1)
        center_x = x + .22 * math.sin(t * math.pi * .72) + .045 * t * t
        center_z = z + .15 * math.sin(t * math.pi * .58) - .035 * t
        height = y + .18 + t * 4.18
        # Subtle swelling at old leaf collars keeps this a single trunk, not
        # a stack of cones, while still catching a little light in silhouette.
        collar = .022 * math.sin(t * math.pi * 7.5 + .4)
        radius = .41 - .218 * t + collar + .025 * math.exp(-t * 12)
        for side in range(segments):
            angle = side / segments * math.tau
            grain = 1 + .045 * math.sin(angle * 3 + t * 4.2) + .025 * math.sin(angle * 5 - t * 2.1)
            trunk_verts.append((center_x + math.cos(angle) * radius * grain,
                                center_z + math.sin(angle) * radius * grain,
                                height))
    for ring in range(rings - 1):
        for side in range(segments):
            a = ring * segments + side
            b = ring * segments + (side + 1) % segments
            trunk_faces.append((a, b, b + segments, a + segments))
    trunk_faces.extend([tuple(reversed(range(segments))), tuple((rings - 1) * segments + side for side in range(segments))])
    trunk_mesh = bpy.data.meshes.new('Palm_Trunk')
    trunk_mesh.from_pydata(trunk_verts, [], trunk_faces)
    trunk_mesh.update()
    trunk = bpy.data.objects.new('Palm_Trunk', trunk_mesh)
    bpy.context.collection.objects.link(trunk)
    finish(trunk, 2, 'Palm_Trunk')
    for face in trunk_mesh.polygons:
        face.use_smooth = len(face.vertices) == 4
    parts.append(trunk)

    top = y + 4.36
    crown_x, crown_z = x + .22 * math.sin(.72 * math.pi) + .045, z + .15 * math.sin(.58 * math.pi) - .035
    for i in range(4):
        a = i * math.tau / 4 + .19
        coconut = ico('Palm_Coconut', (crown_x + math.cos(a) * .23, top - .26 + .025 * math.sin(i * 2),
                                        crown_z + math.sin(a) * .23), .145, 14, 1)
        coconut.scale = (.92 + .10 * math.sin(i * 2.2), 1.10, .84)
        parts.append(coconut)
    for i in range(7):
        angle = i * math.tau / 7 + .19 * math.sin(i * 2.7) + .07 * math.sin(i * 5.1)
        length = 2.48 + .78 * (.5 + .5 * math.sin(i * 2.13 + .4))
        droop = .92 + .86 * (.5 + .5 * math.sin(i * 1.7 + .8))
        base = (crown_x + .035 * math.sin(i * 2.4), top + .08 * math.sin(i * 2.1), crown_z + .035 * math.cos(i * 1.9))

        def midrib(t):
            reach = length * t
            return (crown_x + math.cos(angle) * reach,
                    base[1] + .16 * math.sin(math.pi * t) - droop * t * t,
                    crown_z + math.sin(angle) * reach)

        tip = midrib(1)
        parts.append(leaf_blade('Palm_Rib', base, tip, .052, 15, bend=.27, low_poly=True))

        for row in range(7):
            t = .12 + row * .098 + .012 * math.sin(i * 1.8 + row * 1.5)
            px, py, pz = midrib(t)
            fullness = max(.22, math.sin(math.pi * t) ** .78)
            for side in (-1, 1):
                # Two short missing runs make a weathered, less star-like crown.
                if (side == 1 and (i + row) % 5 == 0) or (i == 4 and row == 5):
                    continue
                sweep = angle + side * (.16 + .025 * math.sin(i + row))
                side_angle = angle + side * (math.pi / 2 - .10 * t)
                llen = (.22 + .86 * fullness) * (1 - .19 * t) * (1 + side * .075 + .035 * math.sin(row * 2.4 + i))
                tip = (px + math.cos(side_angle) * llen + math.cos(sweep) * .10,
                       py - .10 - (.34 + .22 * fullness) * t * t + .035 * math.sin(i * 1.4 + row),
                       pz + math.sin(side_angle) * llen + math.sin(sweep) * .10)
                parts.append(leaf_blade('Palm_Leaflet', (px, py, pz), tip,
                                        .062 + .026 * fullness,
                                        15 if (row + (side > 0)) % 3 == 0 else 5,
                                        bend=.11 + .06 * math.sin(i + row * .7), low_poly=True))
    return parts

def vegetation_pack():
    # Each source has an independent anchor.  Overlap is intentional so loaders
    # can clone any source at (0, 0, 0) before applying an instance transform.
    parts = palm((0, 0, 0))

    def shrub_lobe(loc, radius, seed):
        """Asymmetric foliage cushion with shallow bays between leaf masses."""
        x, y, z = loc
        rings, sides = ((0, .48), (.16, .90), (.42, 1.02), (.66, .72), (.82, .34), (.88, .08)), 8
        verts, faces = [], []
        for ri, (height, scale) in enumerate(rings):
            for side in range(sides):
                a = math.tau * side / sides
                petal = .13 * math.sin(a * 3 + seed) + .07 * math.sin(a * 5 - seed * 1.6)
                bay = -.10 if math.sin(a * 3 + seed) < -.58 else 0
                wobble = 1 + petal + bay
                verts.append((x + math.cos(a) * radius * scale * wobble,
                              y + height * radius * (1.26 + .08 * math.sin(seed)),
                              z + math.sin(a) * radius * scale * wobble * .82))
        for ri in range(len(rings) - 1):
            for side in range(sides):
                a, b = ri * sides + side, ri * sides + (side + 1) % sides
                faces.append((a, b, b + sides, a + sides))
        faces += [tuple(reversed(range(sides))), tuple((len(rings) - 1) * sides + side for side in range(sides))]
        mesh = bpy.data.meshes.new('Bush_Mesh')
        mesh.from_pydata([(px, pz, py) for px, py, pz in verts], [], faces)
        mesh.update()
        obj = bpy.data.objects.new('Bush_Mesh', mesh)
        bpy.context.collection.objects.link(obj)
        finish(obj, 5, 'Bush_Mesh')
        for poly in mesh.polygons:
            poly.use_smooth = True
        return obj

    # Small inner foliage fills the stem junction; the outer silhouette is made
    # from identifiable individual leaves instead of green boulder cushions.
    parts += [shrub_lobe((-.16, 0, -.06), .31, .4),
              shrub_lobe((.19, .04, .03), .29, 2.1),
              shrub_lobe((.02, .08, .19), .25, 4.0)]
    for i in range(12):
        angle = math.tau * i / 12 + .11 * math.sin(i * 2.3)
        reach = .64 + .08 * math.sin(i * 1.7)
        for row in range(3):
            t = .32 + row * .25
            stem = (math.cos(angle) * reach * t,
                    .21 + .42 * t + .035 * math.sin(i + row),
                    math.sin(angle) * reach * t)
            for side in (-1, 1):
                tip_angle = angle + side * (.62 + row * .07)
                leaf_length = .31 + .05 * math.sin(i * 1.3 + row)
                tip = (stem[0] + math.cos(tip_angle) * leaf_length,
                       stem[1] + .12 - row * .015,
                       stem[2] + math.sin(tip_angle) * leaf_length)
                parts.append(leaf_blade('Bush_Mesh', stem, tip,
                                        .16 + .028 * (row == 2), 5,
                                        bend=.045, low_poly=True))

    # A squat base plus two offset weathered shelves gives the rock a bedding plane.
    parts.append(organic_rock('Rock_Mesh', (0, 0, 0), .64, 7, .9))
    shelf_a = organic_rock('Rock_Mesh', (-.10, .31, .05), .43, 7, 2.3)
    shelf_a.scale = (1.30, .28, .78)
    shelf_b = organic_rock('Rock_Mesh', (.16, .17, -.14), .32, 7, 4.1)
    shelf_b.scale = (.95, .22, .65)
    parts += [shelf_a, shelf_b]

    def branch(name, points, radii):
        sides, verts, faces = 6, [], []
        for ri, ((px, py, pz), radius) in enumerate(zip(points, radii)):
            for side in range(sides):
                a = math.tau * side / sides + ri * .12
                verts.append((px + math.cos(a) * radius, py, pz + math.sin(a) * radius))
        for ri in range(len(points) - 1):
            for side in range(sides):
                a, b = ri * sides + side, ri * sides + (side + 1) % sides
                faces.append((a, b, b + sides, a + sides))
        faces += [tuple(reversed(range(sides))), tuple((len(points) - 1) * sides + side for side in range(sides))]
        mesh = bpy.data.meshes.new(name)
        mesh.from_pydata([(px, pz, py) for px, py, pz in verts], [], faces)
        mesh.update()
        obj = bpy.data.objects.new(name, mesh)
        bpy.context.collection.objects.link(obj)
        finish(obj, 6, name)
        for poly in mesh.polygons:
            poly.use_smooth = True
        return obj

    # One shared basal node splits into unequal rounded twigs; no cone row.
    parts += [branch('Coral_Branch', [(0, .03, 0), (0, .38, 0), (-.08, .68, -.06), (-.30, .92, -.16)], [.17, .14, .10, .035]),
              branch('Coral_Branch', [(.02, .31, .01), (.18, .58, .02), (.28, .92, .18), (.20, 1.12, .33)], [.12, .10, .065, .025]),
              branch('Coral_Branch', [(-.02, .26, .02), (-.20, .52, .16), (-.39, .68, .31)], [.11, .075, .024]),
              branch('Coral_Branch', [(.01, .24, -.03), (.06, .52, -.24), (.22, .72, -.39)], [.10, .07, .023])]
    return parts

def reef_pack():
    """Varied reef dressing: several coral growth forms plus sea grass and kelp.

    Every part is tinted per instance at runtime, so the atlas tile only drives
    the baked AO; colour comes from the loader's instance colours.
    """
    parts = []

    def branch(name, points, radii, tile=10):
        sides, verts, faces = 6, [], []
        for ri, ((px, py, pz), radius) in enumerate(zip(points, radii)):
            for side in range(sides):
                a = math.tau * side / sides + ri * .11
                verts.append((px + math.cos(a) * radius, py, pz + math.sin(a) * radius))
        for ri in range(len(points) - 1):
            for side in range(sides):
                a, b = ri * sides + side, ri * sides + (side + 1) % sides
                faces.append((a, b, b + sides, a + sides))
        faces += [tuple(reversed(range(sides))), tuple((len(points) - 1) * sides + side for side in range(sides))]
        mesh = bpy.data.meshes.new(name)
        mesh.from_pydata([(px, pz, py) for px, py, pz in verts], [], faces)
        mesh.update()
        obj = bpy.data.objects.new(name, mesh)
        bpy.context.collection.objects.link(obj)
        finish(obj, tile, name)
        for poly in mesh.polygons:
            poly.use_smooth = True
        return obj

    def tube(name, x, z, height, bottom_radius, top_radius):
        """Open sponge tube with a visible wall thickness and dark inner mouth."""
        sides, verts, faces = 8, [], []
        for y, radius in ((.02, bottom_radius), (height, top_radius), (height, top_radius * .58), (height - .15, top_radius * .46)):
            for side in range(sides):
                a = math.tau * side / sides
                wobble = 1 + .07 * math.sin(a * 3 + height * 5)
                verts.append((x + math.cos(a) * radius * wobble, y, z + math.sin(a) * radius * wobble))
        for side in range(sides):
            a, b = side, (side + 1) % sides
            faces += [(a, b, b + sides, a + sides),
                      (sides + a, sides + b, 2 * sides + b, 2 * sides + a),
                      (2 * sides + a, 2 * sides + b, 3 * sides + b, 3 * sides + a)]
        faces.append(tuple(reversed(range(sides))))
        mesh = bpy.data.meshes.new(name)
        mesh.from_pydata([(px, pz, py) for px, py, pz in verts], [], faces)
        mesh.update()
        obj = bpy.data.objects.new(name, mesh)
        bpy.context.collection.objects.link(obj)
        finish(obj, 10, name)
        for poly in mesh.polygons:
            poly.use_smooth = True
        return obj

    # Branch coral: shared, knuckled base and uneven branching paths.
    parts += [branch('Reef_Staghorn', [(0, .02, 0), (0, .42, 0), (-.14, .72, -.08), (-.34, .98, -.18)], [.16, .13, .085, .03]),
              branch('Reef_Staghorn', [(.02, .34, .01), (.20, .62, .02), (.30, .99, .18), (.19, 1.17, .32)], [.12, .09, .06, .023]),
              branch('Reef_Staghorn', [(-.02, .32, .02), (-.24, .54, .18), (-.40, .75, .33)], [.11, .07, .023]),
              branch('Reef_Staghorn', [(.01, .29, -.03), (.05, .53, -.24), (.19, .73, -.40)], [.10, .065, .022])]

    # A single scalloped sheet makes a fan silhouette without radial blade spokes.
    cols, rows, fan_verts, fan_faces = 7, 5, [], []
    for row in range(rows):
        t = row / (rows - 1)
        half_width = .04 + .62 * (math.sin(t * math.pi * .52) ** .9)
        for col in range(cols):
            u = col / (cols - 1) * 2 - 1
            edge = abs(u)
            fan_verts.append((u * half_width, .18 + t * .95 - .04 * edge * edge,
                              .08 * (1 - u * u) + .055 * math.sin(u * 5 + t * 3)))
    for row in range(rows - 1):
        for col in range(cols - 1):
            a = row * cols + col
            fan_faces.append((a, a + 1, a + cols + 1, a + cols))
    fan_mesh = bpy.data.meshes.new('Reef_Fan')
    fan_mesh.from_pydata([(px, pz, py) for px, py, pz in fan_verts], [], fan_faces)
    fan_mesh.update()
    fan = bpy.data.objects.new('Reef_Fan', fan_mesh)
    bpy.context.collection.objects.link(fan)
    finish(fan, 10, 'Reef_Fan')
    for poly in fan_mesh.polygons:
        poly.use_smooth = True
    parts.append(fan)
    parts.append(branch('Reef_Fan', [(0, .02, 0), (0, .24, 0)], [.075, .045]))

    # Brain coral stays a squat dome but gets an irregular maze-like crown, not a sphere.
    brain = ico('Reef_Brain', (0, .27, 0), .50, 10, 2)
    brain.scale = (1.05, .52, .96)
    for vertex in brain.data.vertices:
        angle = math.atan2(vertex.co.y, vertex.co.x)
        vertex.co *= 1 + .075 * math.sin(angle * 5 + vertex.co.z * 8) + .035 * math.cos(angle * 3)
    parts.append(brain)
    for angle in (-.74, -.28, .16, .61):
        start = (0, .42, 0)
        end = (math.cos(angle) * .42, .55 + .04 * math.sin(angle * 3), math.sin(angle) * .38)
        parts.append(leaf_blade('Reef_Brain', start, end, .026, 10, bend=.02, low_poly=True))

    # Table coral: offset supporting stalk and a thin, lopsided plate.
    parts.append(branch('Reef_Table', [(0, .02, 0), (-.05, .39, .03)], [.09, .06]))
    table = organic_rock('Reef_Table', (.03, .44, -.02), .66, 10, 5.3)
    table.scale = (1.18, .13, .92)
    parts.append(table)

    # Hollow tube sponges differ in height, tilt and mouth width.
    for dx, dz, h, r0, r1 in ((-.16, -.10, .82, .105, .12), (.05, .14, 1.04, .12, .145),
                              (.20, -.05, .65, .09, .10), (-.05, .05, .49, .11, .085)):
        parts.append(tube('Reef_Tube', dx, dz, h, r0, r1))

    # Mushroom coral: dome on a stalk.
    parts.append(cone('Reef_Mushroom', (0, .22, 0), .09, .07, .44, 12, 6))
    cap = ico('Reef_Mushroom', (0, .5, 0), .44, 12, 1)
    cap.scale = (1.0, .48, 1.0)
    parts.append(cap)

    # Anemone: a low base with curled, flat tentacles rather than cone spikes.
    parts.append(ico('Reef_Anemone', (0, .28, 0), .26, 13, 1))
    for i in range(6):
        a = i * math.tau / 6
        parts.append(leaf_blade('Reef_Anemone', (math.cos(a) * .14, .40, math.sin(a) * .14),
                                (math.cos(a) * .37, .62 + .08 * math.sin(i), math.sin(a) * .37),
                                .055, 13, bend=.11, low_poly=True))

    # Sea grass: individual bent blades with differing tips, not a cone brush.
    for i in range(6):
        a = i * math.tau / 6
        parts.append(leaf_blade('Sea_Grass', (math.cos(a) * .08, .03, math.sin(a) * .08),
                                (math.cos(a) * (.22 + .09 * math.sin(i)), .76 + .16 * (i % 3),
                                 math.sin(a) * (.22 + .09 * math.sin(i))),
                                .05, 15, bend=.13, low_poly=True))

    # Kelp: a few long, cupped blades rather than rectangular ribbons.
    for i in range(4):
        a = i * math.tau / 4
        start = (math.cos(a) * .1, .1, math.sin(a) * .1)
        end = (math.cos(a) * .36, 1.25, math.sin(a) * .36)
        parts.append(leaf_blade('Kelp', start, end, .12, 11, bend=.08))

    return parts


def creature_pack():
    """Readable lagoon animals: distinct fish, shellfish and real wing silhouettes."""
    parts = []

    def mesh_piece(name, vertices, faces, tile=10, smooth=False):
        mesh = bpy.data.meshes.new(name)
        mesh.from_pydata([(x, z, y) for x, y, z in vertices], [], faces)
        mesh.update()
        obj = bpy.data.objects.new(name, mesh)
        bpy.context.collection.objects.link(obj)
        finish(obj, tile, name)
        for poly in mesh.polygons:
            poly.use_smooth = smooth
        return obj

    def fin(name, root_a, root_b, tip, tile=10):
        """Small wedge, giving fins a visible leading and trailing thickness."""
        normal = (0, .014, .018)
        verts = [root_a, root_b, tip,
                 (root_a[0] + normal[0], root_a[1] + normal[1], root_a[2] + normal[2]),
                 (root_b[0] + normal[0], root_b[1] + normal[1], root_b[2] + normal[2]),
                 (tip[0] + normal[0], tip[1] + normal[1], tip[2] + normal[2])]
        return mesh_piece(name, verts, [(0, 1, 2), (5, 4, 3), (0, 3, 4, 1), (1, 4, 5, 2), (2, 5, 3, 0)], tile)

    def fish(name, length, height, width, tile=10):
        """Spindle fish with a narrow tail stock, attached fins and forked tail."""
        sides = 8
        rings = [(.52 * length, .16, .16), (.33 * length, .78, .76), (.05 * length, 1, 1),
                 (-.24 * length, .76, .73), (-.43 * length, .25, .30)]
        verts, faces = [], []
        for x, h_scale, w_scale in rings:
            for side in range(sides):
                a = math.tau * side / sides
                verts.append((x, math.cos(a) * height * h_scale, math.sin(a) * width * w_scale))
        for ring in range(len(rings) - 1):
            for side in range(sides):
                a, b = ring * sides + side, ring * sides + (side + 1) % sides
                faces.append((a, b, b + sides, a + sides))
        faces += [tuple(reversed(range(sides))), tuple((len(rings) - 1) * sides + side for side in range(sides))]
        parts.append(mesh_piece(name, verts, faces, tile, smooth=True))
        # Back, belly and paired pectoral fins share the body root, avoiding floating triangles.
        parts.append(fin(name, (.16 * length, height * .56, -.06), (-.20 * length, height * .48, -.04),
                         (-.04 * length, height * 1.10, 0), tile))
        parts.append(fin(name, (.11 * length, -height * .48, -.06), (-.12 * length, -height * .40, -.04),
                         (-.02 * length, -height * .84, 0), tile))
        for side in (-1, 1):
            parts.append(fin(name, (.20 * length, .02, side * width * .58), (-.02 * length, -.05, side * width * .56),
                             (.05 * length, -.13, side * width * 1.28), tile))
        # Two lobes form a forked tail instead of a rectangular tail plate.
        tail_root = (-.42 * length, 0, 0)
        parts.extend([fin(name, tail_root, (-.50 * length, height * .18, 0), (-.66 * length, height * .72, .015), tile),
                      fin(name, tail_root, (-.50 * length, -height * .18, 0), (-.66 * length, -height * .72, -.015), tile)])
        for side in (-1, 1):
            eye = ico(name, (.34 * length, height * .12, side * width * .68), .042, tile, 1)
            eye.scale = (.8, .8, .8)
            parts.append(eye)

    # Existing source names remain for runtime schools: reef fish and a fuller lagoon fish.
    fish('Fish_A', 1.18, .27, .20)
    fish('Fish_B', .92, .33, .24)
    fish('Sea_SilverJack', 1.40, .31, .24)

    # Sand crab: broad carapace, stalk eyes, eight bent legs and two broad claws.
    crab = ico('Sea_Crab', (0, .13, 0), .34, 13, 1)
    crab.scale = (1.24, .38, .88)
    parts.append(crab)
    for side in (-1, 1):
        for index, x in enumerate((-.20, -.06, .10, .22)):
            start = (x, .12, side * .22)
            end = (x - .10 - index * .025, .025, side * (.43 + .025 * index))
            parts.append(leaf_blade('Sea_Crab', start, end, .026, 13, bend=.045, low_poly=True))
        eye_stalk = cone('Sea_Crab', (.17, .26, side * .17), .025, .018, .17, 13, 5)
        parts.append(eye_stalk)
        parts.append(ico('Sea_Crab', (.17, .35, side * .17), .045, 13, 1))
        parts.append(leaf_blade('Sea_Crab', (.28, .14, side * .18), (.48, .17, side * .36), .075, 13, bend=.03, low_poly=True))

    # Lobster: segmented abdomen, fan tail, antennae and unequal claws.
    for index, (x, scale) in enumerate(((-.26, .82), (-.08, .96), (.12, 1.08), (.34, 1.14))):
        segment = ico('Sea_Lobster', (x, .15, 0), .18, 6, 1)
        segment.scale = (scale, .55, .72)
        parts.append(segment)
    head = ico('Sea_Lobster', (.52, .20, 0), .22, 6, 1)
    head.scale = (1.12, .75, .84)
    parts.append(head)
    for side in (-1, 1):
        parts.append(leaf_blade('Sea_Lobster', (-.42, .14, side * .04), (-.64, .08, side * .32), .08, 6, bend=.035, low_poly=True))
        parts.append(leaf_blade('Sea_Lobster', (-.42, .14, side * .04), (-.58, .03, side * .05), .07, 6, bend=.02, low_poly=True))
        for index, x in enumerate((.05, .22, .37)):
            parts.append(leaf_blade('Sea_Lobster', (x, .13, side * .13), (x - .10, .025, side * (.34 + .03 * index)),
                                    .022, 6, bend=.04, low_poly=True))
        parts.append(leaf_blade('Sea_Lobster', (.58, .29, side * .12), (.90, .42 + .04 * side, side * .42),
                                .018, 6, bend=.05, low_poly=True))
    parts.append(leaf_blade('Sea_Lobster', (.63, .18, -.14), (.93, .19, -.34), .07, 6, bend=.03, low_poly=True))
    parts.append(leaf_blade('Sea_Lobster', (.63, .18, .14), (.90, .16, .31), .10, 6, bend=.03, low_poly=True))

    # Pearl oyster: two thick offset valves, exposed hinge gap and fan-shaped shell ribs.
    lower = ico('Sea_PearlOyster', (0, .09, 0), .36, 3, 2)
    lower.scale = (1.14, .30, .90)
    upper = ico('Sea_PearlOyster', (-.025, .18, .045), .34, 3, 2)
    upper.scale = (1.08, .24, .86)
    parts += [lower, upper]
    for i in range(7):
        a = -.95 + i * .32
        parts.append(leaf_blade('Sea_PearlOyster', (-.28, .19, 0),
                                (.26 + .06 * math.cos(a), .27, math.sin(a) * .29),
                                .021, 3, bend=.015, low_poly=True))

    def bird(name, span):
        body = ico(name, (.03, 0, 0), .14, 10, 1)
        body.scale = (1.55, .55, .48)
        parts.append(body)
        # Beak is a functional taper, not a wing or a generic V-bar.
        beak = cone(name, (.29, .01, 0), .035, 0, .18, 10, 5)
        beak.rotation_euler = (0, math.pi / 2, 0)
        parts.append(beak)
        for side in (-1, 1):
            root = (0, .035, side * .04)
            verts = [root, (.22, .09, side * span * .46), (-.02, -.005, side * span),
                     (-.32, -.03, side * span * .68),
                     (root[0], root[1] - .025, root[2])]
            parts.append(mesh_piece(name, verts, [(0, 1, 2), (0, 2, 3), (4, 2, 1), (4, 3, 2), (0, 4, 1), (0, 3, 4)], 10, smooth=True))
            parts.append(leaf_blade(name, (-.22, -.02, side * .02), (-.48, -.08, side * .19), .045, 10, bend=.02, low_poly=True))
        parts.append(leaf_blade(name, (-.26, -.02, 0), (-.45, -.07, 0), .055, 10, bend=.015, low_poly=True))

    bird('Bird_A', 1.04)
    bird('Bird_B', .72)
    return parts


def buildings_pack():
    """Placeable templates at local origin, exported separately from the map."""
    huts = hut_parts((0, 0, 0))
    gardens = garden_parts((0, 0, 0))
    docks = dock_parts((0, 0, 0))
    return huts, gardens, docks

def root(name, objects):
    """Stable public GLTF node; child mesh names remain useful for picking."""
    bpy.ops.object.empty_add(type='PLAIN_AXES', location=(0, 0, 0))
    anchor = bpy.context.object
    anchor.name = name
    for obj in objects:
        if obj.parent is None:
            obj.parent = anchor
    return anchor

def export(objects, filename):
    for obj in objects:
        if obj.type == 'MESH' and obj.data.validate(verbose=True):
            print('repaired invalid mesh:', obj.name)
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, filename), export_format='GLB', use_selection=True,
                              export_materials='NONE', export_apply=True, export_yup=True,
                              export_normals=True, export_texcoords=True)
    bpy.ops.object.select_all(action='DESELECT')
    bpy.ops.object.delete(use_global=False)

def _prefixed(objects, prefix):
    return [obj for obj in objects if obj.name.startswith(prefix)]

def _prefixed_except(objects, prefix, exclude):
    return [obj for obj in objects if obj.name.startswith(prefix) and not obj.name.startswith(exclude)]

def _merge_group(group, name):
    """Join a group into one mesh so runtime instancing needs one draw call.

    Callers must collect every group before joining: join() deletes the source
    objects, so touching an earlier list afterwards would hit dangling RNA.
    """
    return [join(group, name)] if len(group) > 1 else group

# --- island plus hero props ---
static_objects = static_pack()
island_nodes = _prefixed(static_objects, 'Island')
coral_nodes = _prefixed(static_objects, 'Coral')
hut_body = _prefixed_except(static_objects, 'Hut', 'HutRoof')
hut_roof = _prefixed(static_objects, 'HutRoof')
boat_group = _prefixed(static_objects, 'Boat')
hut_nodes = _merge_group(hut_body, 'Hut') + _merge_group(hut_roof, 'HutRoof')
boat_nodes = _merge_group(boat_group, 'Boat')
roots = [root('Island', island_nodes), root('HeroHut', hut_nodes),
         root('Boat', boat_nodes), root('Coral', coral_nodes)]
export(island_nodes + coral_nodes + hut_nodes + boat_nodes + roots, 'tropical-island.glb')
if '--island-only' in sys.argv:
    print('generated island terrain only; vegetation and buildings preserved')
    sys.exit(0)

# --- vegetation, reef dressing and fish ---
VEGETATION_KINDS = ('Palm', 'Coral', 'Bush', 'Rock', 'Reef_Staghorn', 'Reef_Fan', 'Reef_Brain',
                    'Reef_Table', 'Reef_Tube', 'Reef_Mushroom', 'Reef_Anemone', 'Sea_Grass',
                    'Kelp', 'Fish_A', 'Fish_B', 'Sea_Crab', 'Sea_SilverJack', 'Sea_Lobster',
                    'Sea_PearlOyster', 'Bird_A', 'Bird_B')
raw_vegetation = vegetation_pack() + reef_pack() + creature_pack()
vegetation_groups = {prefix: _prefixed(raw_vegetation, prefix) for prefix in VEGETATION_KINDS}
vegetation_final, veg_roots = [], []
for prefix in VEGETATION_KINDS:
    merged = _merge_group(vegetation_groups[prefix], prefix)
    if merged:
        if prefix == 'Palm':
            triangles = sum(max(0, len(face.vertices) - 2) for obj in merged for face in obj.data.polygons)
            print('Palm_Source triangles:', triangles)
            if not 1200 <= triangles <= 2500:
                raise RuntimeError(f'Palm triangle budget exceeded: {triangles}')
        vegetation_final += merged
        veg_roots.append(root(prefix + '_Source', merged))
export(vegetation_final + veg_roots, 'tropical-vegetation.glb')

# --- placeable buildings ---
huts, gardens, docks = buildings_pack()
placed_hut_body = _prefixed_except(huts, 'Hut', 'HutRoof')
placed_hut_roof = _prefixed(huts, 'HutRoof')
# Keep the existing door leaf separate: runtime hinges it open for actual entry.
placed_hut_door = [obj for obj in placed_hut_body if obj.name.startswith('Hut_Door')]
placed_hut_body = [obj for obj in placed_hut_body if obj not in placed_hut_door]
hut_nodes = _merge_group(placed_hut_body, 'Hut') + _merge_group(placed_hut_roof, 'HutRoof') + placed_hut_door
garden_nodes = _merge_group(gardens, 'Garden')
dock_nodes = _merge_group(docks, 'Dock')
roots = [root('Hut_Source', hut_nodes), root('Garden_Source', garden_nodes), root('Dock_Source', dock_nodes)]
export(hut_nodes + garden_nodes + dock_nodes + roots, 'tropical-buildings.glb')
print('generated:', ATLAS_PATH)
print('generated:', ATLAS_WEBP_PATH)
print('generated:', os.path.join(OUT, 'tropical-island.glb'))
print('generated:', os.path.join(OUT, 'tropical-vegetation.glb'))
print('generated:', os.path.join(OUT, 'tropical-buildings.glb'))
