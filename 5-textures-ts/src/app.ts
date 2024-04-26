// We use webpack to package our shaders as string resources that we can import
import { mat4 } from "gl-matrix";
import { ArcballCamera } from "arcball_camera";
import { Controller } from "ez_canvas_controller";

import shaderCode from "./gltf_prim.wgsl";
import duck from "./Duck.glb";

import { uploadGLB } from "./import_glb";

(async () => {
  if (navigator.gpu === undefined) {
    document
      .getElementById("webgpu-canvas")
      .setAttribute("style", "display:none;");
    document
      .getElementById("no-webgpu")
      .setAttribute("style", "display:block;");
    return;
  }

  // Get a GPU device to render with
  let adapter = await navigator.gpu.requestAdapter();
  let device = await adapter.requestDevice();

  // Get a context to display our rendered image on the canvas
  let canvas = document.getElementById("webgpu-canvas") as HTMLCanvasElement;
  let context = canvas.getContext("webgpu");

  // Setup shader modules
  let shaderModule = device.createShaderModule({ code: shaderCode });
  let compilationInfo = await shaderModule.getCompilationInfo();
  if (compilationInfo.messages.length > 0) {
    let hadError = false;
    console.log("Shader compilation log:");
    for (let i = 0; i < compilationInfo.messages.length; ++i) {
      let msg = compilationInfo.messages[i];
      console.log(`${msg.lineNum}:${msg.linePos} - ${msg.message}`);
      hadError = hadError || msg.type == "error";
    }
    if (hadError) {
      console.log("Shader failed to compile");
      return;
    }
  }

  // Setup render outputs
  let swapChainFormat = "bgra8unorm" as GPUTextureFormat;
  context.configure({
    device: device,
    format: swapChainFormat,
    usage: GPUTextureUsage.RENDER_ATTACHMENT,
  });

  let depthFormat = "depth24plus-stencil8" as GPUTextureFormat;
  let depthTexture = device.createTexture({
    size: { width: canvas.width, height: canvas.height, depthOrArrayLayers: 1 },
    format: depthFormat,
    usage: GPUTextureUsage.RENDER_ATTACHMENT,
  });

  // Create bind group layout
  let bindGroupLayout = device.createBindGroupLayout({
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.VERTEX,
        buffer: { type: "uniform" },
      },
    ],
  });

  // Create a buffer to store the view parameters
  let viewParamsBuffer = device.createBuffer({
    size: 16 * 4,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  let viewParamBG = device.createBindGroup({
    layout: bindGroupLayout,
    entries: [{ binding: 0, resource: { buffer: viewParamsBuffer } }],
  });

  // Load the packaged GLB file
  let scene = await fetch(duck)
    .then((res) => res.arrayBuffer())
    .then((buf) => uploadGLB(buf, device));

  scene.buildRenderPipeline(
    device,
    shaderModule,
    swapChainFormat,
    depthFormat,
    bindGroupLayout
  );

  console.log(scene);

  // Setup onchange listener for file uploads
  document.getElementById("uploadGLB").onchange = function (evt) {
    document.getElementById("loading-text").hidden = false;
    let reader = new FileReader();
    reader.onerror = function () {
      throw Error("Error reading GLB file");
    };
    reader.onload = function () {
      scene = uploadGLB(reader.result as ArrayBuffer, device);
      scene.buildRenderPipeline(
        device,
        shaderModule,
        swapChainFormat,
        depthFormat,
        bindGroupLayout
      );
      console.log(scene);
    };
    let picker = evt.target as HTMLInputElement;
    if (picker.files) {
      reader.readAsArrayBuffer(picker.files[0]);
    }
  };

  // Setup the camera
  let camera = new ArcballCamera([0, 1, -3], [0, 1, 0], [0, 1, 0], 0.5, [
    canvas.width,
    canvas.height,
  ]);
  let proj = mat4.perspective(
    mat4.create(),
    (50 * Math.PI) / 180.0,
    canvas.width / canvas.height,
    0.01,
    1000
  );
  let projView = mat4.create();

  // Register mouse and touch listeners
  let controller = new Controller();
  controller.mousemove = function (
    prev: Array<number>,
    cur: Array<number>,
    evt: MouseEvent
  ) {
    if (evt.buttons == 1) {
      camera.rotate(prev, cur);
    } else if (evt.buttons == 2) {
      camera.pan([cur[0] - prev[0], prev[1] - cur[1]]);
    }
  };
  controller.wheel = function (amt: number) {
    camera.zoom(amt);
  };
  controller.pinch = controller.wheel;
  controller.twoFingerDrag = function (drag: number) {
    camera.pan(drag);
  };
  controller.registerForCanvas(canvas);

  let animationFrame = function () {
    let resolve = null;
    let promise = new Promise((r) => (resolve = r));
    window.requestAnimationFrame(resolve);
    return promise;
  };
  requestAnimationFrame(animationFrame);

  let renderPassDesc = {
    colorAttachments: [
      {
        view: null as GPUTextureView,
        loadOp: "clear" as GPULoadOp,
        clearValue: [0.3, 0.3, 0.3, 1],
        storeOp: "store" as GPUStoreOp,
      },
    ],
    depthStencilAttachment: {
      view: depthTexture.createView(),
      depthLoadOp: "clear" as GPULoadOp,
      depthClearValue: 1.0,
      depthStoreOp: "store" as GPUStoreOp,
      stencilLoadOp: "clear" as GPULoadOp,
      stencilClearValue: 0,
      stencilStoreOp: "store" as GPUStoreOp,
    },
  };

  // Render!
  while (true) {
    await animationFrame();

    // Update camera buffer
    projView = mat4.mul(projView, proj, camera.camera);

    let upload = device.createBuffer({
      size: 16 * 4,
      usage: GPUBufferUsage.COPY_SRC,
      mappedAtCreation: true,
    });
    {
      let map = new Float32Array(upload.getMappedRange());
      map.set(projView);
      upload.unmap();
    }

    renderPassDesc.colorAttachments[0].view = context
      .getCurrentTexture()
      .createView();

    let commandEncoder = device.createCommandEncoder();
    commandEncoder.copyBufferToBuffer(upload, 0, viewParamsBuffer, 0, 16 * 4);

    let renderPass = commandEncoder.beginRenderPass(renderPassDesc);

    scene.render(renderPass, viewParamBG);

    renderPass.end();
    device.queue.submit([commandEncoder.finish()]);
  }
})();
