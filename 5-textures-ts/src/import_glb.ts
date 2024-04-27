import { mat4, ReadonlyVec3 } from "gl-matrix";
import {
  GLTFRenderMode,
  GLTFComponentType,
  parseGltfType,
  GLTFTextureFilter,
  GLTFTextureWrap,
} from "./gltf_enums";
import { GLTFBuffer, GLTFBufferView } from "./gltf_buffer";
import { GLTFAccessor } from "./gltf_accessor";
import { GLTFPrimitive } from "./gltf_primitive";
import { GLTFMesh, GLTFNode, GLTFScene } from "./gltf_mesh";
import { GLTFImage, GLTFSampler, GLTFTexture } from "./gltf_texture";
import { GLTFMaterial } from "./gltf_material";

// Flatten the glTF node tree passed to a single-level so that we don't have to worry
// about nested transforms in the renderer. The root node is included in the flattened tree
export function flattenTree(
  allNodes: any,
  node: any,
  parent_transform: mat4
): any {
  let flattened = [];
  let tfm = readNodeTransform(node);
  if (parent_transform != undefined) mat4.mul(tfm, parent_transform, tfm);

  // Add the flattened current node
  let n = {
    matrix: tfm,
    mesh: node["mesh"],
    camera: node["camera"],
  };
  flattened.push(n);

  // Loop through the node's children and flatten them as well
  if (node["children"]) {
    for (let i = 0; i < node["children"].length; ++i) {
      flattened.push(
        ...flattenTree(allNodes, allNodes[node["children"][i]], tfm)
      );
    }
  }
  return flattened;
}

function readNodeTransform(node: any) {
  if (node["matrix"]) {
    let m = node["matrix"];
    // Both glTF and gl matrix are column major
    return mat4.fromValues(
      m[0] as number,
      m[1] as number,
      m[2] as number,
      m[3] as number,
      m[4] as number,
      m[5] as number,
      m[6] as number,
      m[7] as number,
      m[8] as number,
      m[9] as number,
      m[10] as number,
      m[11] as number,
      m[12] as number,
      m[13] as number,
      m[14] as number,
      m[15] as number
    );
  } else {
    let scale = [1, 1, 1] as ReadonlyVec3;
    let rotation = [0, 0, 0, 1];
    let translation = [0, 0, 0] as ReadonlyVec3;
    if (node["scale"]) {
      scale = node["scale"] as ReadonlyVec3;
    }
    if (node["rotation"]) {
      rotation = node["rotation"] as Array<number>;
    }
    if (node["translation"]) {
      translation = node["translation"] as ReadonlyVec3;
    }
    let m = mat4.create();
    return mat4.fromRotationTranslationScale(m, rotation, translation, scale);
  }
}

function loadBufferViews(jsonChunk: any, binaryChunk: GLTFBuffer) {
  // Create GLTFBufferView objects for all the buffer views in the glTF file
  let bufferViews = [];
  for (let bv of jsonChunk.bufferViews) {
    let byteLength = bv["byteLength"] as number;
    let byteStride = 0;
    if ("byteStride" in bv) {
      byteStride = bv["byteStride"] as number;
    }
    let byteOffset = 0;
    if ("byteOffset" in bv) {
      byteOffset = bv["byteOffset"] as number;
    }
    bufferViews.push(
      new GLTFBufferView(binaryChunk, byteLength, byteOffset, byteStride)
    );
  }
  return bufferViews;
}

function loadAccessors(jsonChunk: any, bufferViews: GLTFBufferView[]) {
  // Create GLTFAccessor objects for the accessors in the glTF file
  // We need to handle possible errors being thrown here if a model is using
  // accessors for types we don't support yet. For example, a model with animation
  // may have a MAT4 accessor, which we currently don't support.
  let accessors = [];
  for (let ac of jsonChunk.accessors) {
    let viewID = ac["bufferView"];
    let count = ac["count"] as number;
    let componentType = ac["componentType"] as GLTFComponentType;
    let gltfType = parseGltfType(ac["type"]);
    let byteOffset = 0;
    if ("byteOffset" in ac) {
      byteOffset = ac["byteOffset"] as number;
    }
    // Now parse the json data out of accessorInfo
    accessors.push(
      new GLTFAccessor(
        bufferViews[viewID],
        count,
        componentType,
        gltfType,
        byteOffset
      )
    );
  }
  return accessors;
}

async function loadImages(jsonChunk: any, bufferViews: GLTFBufferView[]) {
  let images = [];
  for (let img of jsonChunk.images) {
    let bv = bufferViews[img["bufferView"]];
    let gltfImg = new GLTFImage(bv, img["mimeType"]);
    await gltfImg.decode();
    images.push(gltfImg);
  }
  return images;
}

function loadSamplers(jsonChunk: any) {
  let samplers = [];
  for (let s of jsonChunk.samplers) {
    console.log(s);
    samplers.push(
      new GLTFSampler(
        s["magFilter"] as GLTFTextureFilter,
        s["minFilter"] as GLTFTextureFilter,
        s["wrapS"] as GLTFTextureWrap,
        s["wrapT"] as GLTFTextureWrap
      )
    );
  }
  return samplers;
}

function loadTextures(
  jsonChunk: any,
  images: GLTFImage[],
  samplers: GLTFSampler[]
) {
  let textures = [];
  for (let t of jsonChunk.textures) {
    console.log(t);
    textures.push(new GLTFTexture(samplers[t["sampler"]], images[t["source"]]));
  }
  return textures;
}

function loadMaterials(jsonChunk: any, textures: GLTFTexture[]) {
  let materials = [];
  for (let m of jsonChunk.materials) {
    console.log(m);
    const pbrMR = m["pbrMetallicRoughness"];
    // Default base color factor of 1, 1, 1
    const baseColorFactor = pbrMR["baseColorFactor"] ?? [1, 1, 1, 1];
    const metallicFactor = pbrMR["metallicFactor"] ?? 0;
    const roughnessFactor = pbrMR["roughnessFactor"] ?? 1;

    let baseColorTexture: GLTFTexture | null = null;
    if ("baseColorTexture" in pbrMR) {
      baseColorTexture = textures[pbrMR["baseColorTexture"]["index"]];
    }
    let metallicRoughnessTexture: GLTFTexture | null = null;
    if ("metallicRoughnessTexture" in pbrMR) {
      metallicRoughnessTexture =
        textures[pbrMR["metallicRoughnessTexture"]["index"]];
    }
    materials.push(
      new GLTFMaterial(
        baseColorFactor,
        baseColorTexture,
        metallicFactor,
        roughnessFactor,
        metallicRoughnessTexture
      )
    );
  }
  return materials;
}

function loadMeshes(
  jsonChunk: any,
  accessors: GLTFAccessor[],
  materials: GLTFMaterial[]
) {
  let meshes = [];
  for (let mesh of jsonChunk.meshes) {
    let meshPrimitives = [];
    for (let prim of mesh.primitives) {
      let topology = prim["mode"];
      // Default is triangles if mode specified
      if (topology === undefined) {
        topology = GLTFRenderMode.TRIANGLES;
      }
      if (
        topology != GLTFRenderMode.TRIANGLES &&
        topology != GLTFRenderMode.TRIANGLE_STRIP
      ) {
        throw Error(`Unsupported primitive mode ${prim["mode"]}`);
      }

      let indices = null;
      if (jsonChunk["accessors"][prim["indices"]] !== undefined) {
        indices = accessors[prim["indices"]];
      }

      // Loop through all the attributes to find the POSITION attribute.
      // While we only want the position attribute right now, we'll load
      // the others later as well.
      let positions = null;
      let texcoords = null;
      for (let attr in prim["attributes"]) {
        let accessor = accessors[prim["attributes"][attr]];
        if (attr === "POSITION") {
          positions = accessor;
        } else if (attr === "TEXCOORD_0") {
          texcoords = accessor;
        }
      }

      // Lookup the material for the primitive
      let mat = materials[prim["material"]];

      // Add the primitive to the mesh's list of primitives
      meshPrimitives.push(
        new GLTFPrimitive(mat, positions, indices, texcoords, topology)
      );
    }
    meshes.push(new GLTFMesh(mesh["name"], meshPrimitives));
  }
  return meshes;
}

// Upload a GLB model and return it
export async function uploadGLB(buffer: ArrayBuffer, device: GPUDevice) {
  document.getElementById("loading-text").hidden = false;
  // glB has a JSON chunk and a binary chunk, potentially followed by
  // other chunks specifying extension specific data, which we ignore
  // since we don't support any extensions.
  // Read the glB header and the JSON chunk header together
  // glB header:
  // - magic: u32 (expect: 0x46546C67)
  // - version: u32 (expect: 2)
  // - length: u32 (size of the entire file, in bytes)
  // JSON chunk header
  // - chunkLength: u32 (size of the chunk, in bytes)
  // - chunkType: u32 (expect: 0x4E4F534A for the JSON chunk)
  let header = new Uint32Array(buffer, 0, 5);
  if (header[0] != 0x46546c67) {
    throw Error("Provided file is not a glB file");
  }
  if (header[1] != 2) {
    throw Error("Provided file is glTF 2.0 file");
  }
  if (header[4] != 0x4e4f534a) {
    throw Error(
      "Invalid glB: The first chunk of the glB file is not a JSON chunk!"
    );
  }

  // Parse the JSON chunk of the glB file to a JSON object
  let jsonChunk = JSON.parse(
    new TextDecoder("utf-8").decode(new Uint8Array(buffer, 20, header[3]))
  );

  // Read the binary chunk header
  // - chunkLength: u32 (size of the chunk, in bytes)
  // - chunkType: u32 (expect: 0x46546C67 for the binary chunk)
  let binaryHeader = new Uint32Array(buffer, 20 + header[3], 2);
  if (binaryHeader[1] != 0x004e4942) {
    throw Error(
      "Invalid glB: The second chunk of the glB file is not a binary chunk!"
    );
  }
  // Make a GLTFBuffer that is a view of the entire binary chunk's data,
  // we'll use this to create buffer views within the chunk for memory referenced
  // by objects in the glTF scene
  let binaryChunk = new GLTFBuffer(buffer, 28 + header[3], binaryHeader[0]);

  // Load the buffer views
  const bufferViews = loadBufferViews(jsonChunk, binaryChunk);

  // Load the GLTF accessors
  const accessors = loadAccessors(jsonChunk, bufferViews);

  // Load and decode all the images in the file
  const images = await loadImages(jsonChunk, bufferViews);

  // Load all the samplers in the file
  const samplers = loadSamplers(jsonChunk);
  console.log(samplers);

  // Load all the textures, which just combine a sampler + image
  const textures = loadTextures(jsonChunk, images, samplers);
  console.log(textures);

  // Load all the materials
  const materials = loadMaterials(jsonChunk, textures);
  console.log(materials);

  // Load all meshes
  const meshes = loadMeshes(jsonChunk, accessors, materials);
  console.log(meshes);

  // Create all samplers
  samplers.forEach((s: GLTFSampler) => {
    s.create(device);
  });

  // Upload all images, now that we know their usage and can pick the right
  // GPU texture format
  images.forEach((img: GLTFImage) => {
    img.upload(device);
  });

  // Create bind groups and UBOs for materials
  materials.forEach((mat: GLTFMaterial) => {
    mat.upload(device);
  });

  // Upload the buffer views used by mesh
  bufferViews.forEach((bv: GLTFBufferView) => {
    if (bv.needsUpload) {
      bv.upload(device);
    }
  });

  // Build the default GLTFScene, we just take all the mesh nodes for now
  let defaultSceneNodes = jsonChunk["scenes"][0]["nodes"];

  // If we have a default scene, load it, otherwise we use the first scene
  if ("scenes" in jsonChunk) {
    defaultSceneNodes = jsonChunk["scenes"][jsonChunk["scene"]]["nodes"];
  }

  let defaultNodes = [];
  for (let i = 0; i < defaultSceneNodes.length; ++i) {
    // Get each node referenced by the scene and flatten it and its children
    // out to a single-level scene so that we don't need to keep track of nested
    // transforms in the renderer
    // TODO: We'll need to put a bit more thought here when we start handling animated nodes
    // in the hierarchy. For now this is fine.
    let n = jsonChunk["nodes"][defaultSceneNodes[i]];
    let identity = mat4.create();
    mat4.identity(identity);
    let flattenedNodes = flattenTree(jsonChunk["nodes"], n, identity);

    // Add all the mesh nodes in the flattened node list to the scene's default nodes
    for (let fn of flattenedNodes) {
      if ("mesh" in fn && fn["mesh"] != undefined) {
        defaultNodes.push(
          new GLTFNode(n["name"], fn["matrix"], meshes[fn["mesh"]])
        );
      }
    }
  }
  document.getElementById("loading-text").hidden = true;

  return new GLTFScene(defaultNodes);
}
