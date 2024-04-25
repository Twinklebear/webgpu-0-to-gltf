export enum GLTFRenderMode {
  POINTS = 0,
  LINE = 1,
  LINE_LOOP = 2,
  LINE_STRIP = 3,
  TRIANGLES = 4,
  TRIANGLE_STRIP = 5,
  // Note: fans are not supported in WebGPU, use should be
  // an error or converted into a list/strip
  TRIANGLE_FAN = 6,
}

export enum GLTFComponentType {
  BYTE = 5120,
  UNSIGNED_BYTE = 5121,
  SHORT = 5122,
  UNSIGNED_SHORT = 5123,
  INT = 5124,
  UNSIGNED_INT = 5125,
  FLOAT = 5126,
  DOUBLE = 5130,
}

export enum GLTFType {
  SCALAR = 0,
  VEC2 = 1,
  VEC3 = 2,
  VEC4 = 3,
  MAT2 = 4,
  MAT3 = 5,
  MAT4 = 6,
}

export function alignTo(val: number, align: number) {
  return Math.floor((val + align - 1) / align) * align;
}

export function parseGltfType(type: string) {
  switch (type) {
    case "SCALAR":
      return GLTFType.SCALAR;
    case "VEC2":
      return GLTFType.VEC2;
    case "VEC3":
      return GLTFType.VEC3;
    case "VEC4":
      return GLTFType.VEC4;
    case "MAT2":
      return GLTFType.MAT2;
    case "MAT3":
      return GLTFType.MAT3;
    case "MAT4":
      return GLTFType.MAT4;
    default:
      throw Error(`Unhandled glTF Type ${type}`);
  }
}

export function gltfTypeNumComponents(type: GLTFType) {
  switch (type) {
    case GLTFType.SCALAR:
      return 1;
    case GLTFType.VEC2:
      return 2;
    case GLTFType.VEC3:
      return 3;
    case GLTFType.VEC4:
    case GLTFType.MAT2:
      return 4;
    case GLTFType.MAT3:
      return 9;
    case GLTFType.MAT4:
      return 16;
    default:
      throw Error(`Invalid glTF Type ${type}`);
  }
}

// Note: only returns non-normalized type names,
// so byte/ubyte = sint8/uint8, not snorm8/unorm8, same for ushort
export function gltfVertexType(
  componentType: GLTFComponentType,
  type: GLTFType
) {
  let typeStr = null;
  switch (componentType) {
    case GLTFComponentType.BYTE:
      typeStr = "sint8";
      break;
    case GLTFComponentType.UNSIGNED_BYTE:
      typeStr = "uint8";
      break;
    case GLTFComponentType.SHORT:
      typeStr = "sint16";
      break;
    case GLTFComponentType.UNSIGNED_SHORT:
      typeStr = "uint16";
      break;
    case GLTFComponentType.INT:
      typeStr = "int32";
      break;
    case GLTFComponentType.UNSIGNED_INT:
      typeStr = "uint32";
      break;
    case GLTFComponentType.FLOAT:
      typeStr = "float32";
      break;
    default:
      throw Error(`Unrecognized or unsupported glTF type ${componentType}`);
  }

  switch (gltfTypeNumComponents(type)) {
    case 1:
      return typeStr;
    case 2:
      return typeStr + "x2";
    case 3:
      return typeStr + "x3";
    case 4:
      return typeStr + "x4";
    default:
      throw Error(`Invalid number of components for gltfType: ${type}`);
  }
}

export function gltfTypeSize(componentType: GLTFComponentType, type: GLTFType) {
  let componentSize = 0;
  switch (componentType) {
    case GLTFComponentType.BYTE:
      componentSize = 1;
      break;
    case GLTFComponentType.UNSIGNED_BYTE:
      componentSize = 1;
      break;
    case GLTFComponentType.SHORT:
      componentSize = 2;
      break;
    case GLTFComponentType.UNSIGNED_SHORT:
      componentSize = 2;
      break;
    case GLTFComponentType.INT:
      componentSize = 4;
      break;
    case GLTFComponentType.UNSIGNED_INT:
      componentSize = 4;
      break;
    case GLTFComponentType.FLOAT:
      componentSize = 4;
      break;
    case GLTFComponentType.DOUBLE:
      componentSize = 8;
      break;
    default:
      throw Error("Unrecognized GLTF Component Type?");
  }
  return gltfTypeNumComponents(type) * componentSize;
}
