"""Replace only approved plant sources; preserve every reef/creature source.

Blender --background --python tools/blender_export_plants.py
This uses exactly the review geometry functions, not an unrelated substitute.
"""
import os
import sys
import json
import hashlib
import shutil
import subprocess
import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(__file__))
from blender_preview_plants import palm, shrub, ROOT, OUT

with open(os.path.join(OUT, 'milestone-reviews.json')) as stream:
    reviews = json.load(stream)
for gate in ('function', 'form'):
    if reviews[gate]['status'] != 'approved' or not reviews[gate]['approvedBy']:
        raise RuntimeError(f'Explicit human {gate} approval required')

def make_source(parts, name, budget):
    for obj in parts:
        if obj.data.validate(verbose=True):
            raise ValueError(f'Invalid plant geometry: {obj.name}')
        color = obj.data.color_attributes.new(name='PlantColor', type='FLOAT_COLOR', domain='CORNER')
        # Authoring material values are linear RGB, as expected by glTF COLOR_0.
        rgba = obj.data.materials[0].diffuse_color
        for sample in color.data:
            sample.color = rgba
        obj.data.color_attributes.active_color = color
        obj.data.color_attributes.render_color_index = obj.data.color_attributes.find(color.name)
        uv = obj.data.uv_layers.new(name='UVMap')
        for loop in uv.data:
            loop.uv = (.5, .5)
    bpy.ops.object.select_all(action='DESELECT')
    for obj in parts:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    merged = bpy.context.object
    merged.name = name.removesuffix('_Source')
    bpy.context.scene.cursor.location = (0, 0, 0)
    bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    bottom = min(v.co.z for v in merged.data.vertices)
    for v in merged.data.vertices:
        v.co.z -= bottom
    triangles = sum(len(p.vertices)-2 for p in merged.data.polygons)
    if triangles > budget:
        raise RuntimeError(f'{name} exceeds triangle budget: {triangles}/{budget}')
    # No material-slot split: one mesh, one vertex-colour draw per source.
    merged.data.materials.clear()
    merged['authoredPlant'] = True
    root = bpy.data.objects.new(name, None)
    root['authoredPlant'] = True
    bpy.context.collection.objects.link(root)
    merged.parent = root
    bounds = [list(v) for v in (Vector((min(v.co.x for v in merged.data.vertices), min(v.co.y for v in merged.data.vertices), 0)),
                              Vector((max(v.co.x for v in merged.data.vertices), max(v.co.y for v in merged.data.vertices), max(v.co.z for v in merged.data.vertices))))]
    return root, {'triangles': triangles, 'drawsPerInstance': 1, 'boundsZUp': bounds}

# Build the approved sources before importing the old pack to avoid name clashes.
palm_parts = palm((0, 0, 0))
shrub_parts = shrub((0, 0, 0))
asset = os.path.join(ROOT, 'assets', 'generated', 'tropical-vegetation.glb')
backup = os.path.join(OUT, 'meshes', 'vegetation-before-plants.glb')
os.makedirs(os.path.dirname(backup), exist_ok=True)
if not os.path.exists(backup):
    shutil.copy2(asset, backup)
palm_root, palm_metrics = make_source(palm_parts, 'Palm_Source', 6500)
shrub_root, shrub_metrics = make_source(shrub_parts, 'Bush_Source', 5500)
bpy.context.view_layer.update()
source_blend = os.path.join(OUT, 'plant-runtime-source.blend')
bpy.ops.wm.save_as_mainfile(filepath=source_blend)
bpy.ops.object.select_all(action='SELECT')
temporary = os.path.join(OUT, 'meshes', 'approved-plants.glb')
bpy.ops.export_scene.gltf(filepath=temporary, export_format='GLB', use_selection=True,
                          export_materials='NONE', export_apply=True, export_yup=True,
                          export_normals=True, export_texcoords=True, export_extras=True,
                          export_all_vertex_colors=True)
subprocess.run(['node', os.path.join(ROOT, 'tools', 'replace-glb-plants.mjs'), asset, temporary], check=True)
with open(asset, 'rb') as stream:
    digest = hashlib.sha256(stream.read()).hexdigest()
with open(os.path.join(OUT, 'runtime', 'plant-export.json'), 'w') as stream:
    json.dump({'source': 'plant-runtime-source.blend', 'sha256': digest,
               'Palm_Source': palm_metrics, 'Bush_Source': shrub_metrics,
               'formApproval': reviews['form'], 'provider': 'local-blender-procedural'}, stream, indent=2)
print('Approved plant export:', palm_metrics, shrub_metrics, digest)
