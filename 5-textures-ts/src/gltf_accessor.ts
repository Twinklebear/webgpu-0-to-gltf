import { GLTFBufferView } from "./gltf_buffer";
import {
  GLTFComponentType,
  GLTFType,
  gltfTypeSize,
  gltfVertexType,
} from "./gltf_enums";

export class GLTFAccessor {
  count: number;
  componentType: GLTFComponentType;
  gltfType: GLTFType;
  view: GLTFBufferView;
  byteOffset: number;

  constructor(
    view: GLTFBufferView,
    count: number,
    componentType: GLTFComponentType,
    gltfType: GLTFType,
    byteOffset: number
  ) {
    this.count = count;
    this.componentType = componentType;
    this.gltfType = gltfType;
    this.view = view;
    this.byteOffset = byteOffset;
  }

  get byteStride() {
    let elementSize = gltfTypeSize(this.componentType, this.gltfType);
    return Math.max(elementSize, this.view.byteStride);
  }

  get byteLength() {
    return this.count * this.byteStride;
  }

  // Get the vertex attribute type for accessors that are used as vertex attributes
  get elementType() {
    return gltfVertexType(this.componentType, this.gltfType);
  }
}
