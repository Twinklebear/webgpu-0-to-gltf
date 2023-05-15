alias float4 = vec4<f32>;

struct VertexInput {
    @location(0) position: float4,
};

struct VertexOutput {
    @builtin(position) position: float4,
};

struct ViewParams {
    view_proj: mat4x4<f32>,
};

@group(0) @binding(0)
var<uniform> view_params: ViewParams;

@vertex
fn vertex_main(vert: VertexInput) -> VertexOutput {
    var out: VertexOutput;
    out.position = view_params.view_proj * vert.position;
    return out;
};

@fragment
fn fragment_main(in: VertexOutput) -> @location(0) float4 {
    return float4(1.0);
}
