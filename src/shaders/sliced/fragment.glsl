uniform float uSliceStart;
uniform float uSliceArc;
uniform float uAngularVelocity;  // NEW: 0.0 = static, 1.0 = fast motion

varying vec3 vPosition;

void main() {
    float angle = atan(vPosition.y, vPosition.x);

    // Rotate slice start
    angle -= uSliceStart;
    angle = mod(angle, PI2);

    // MOTION BLUR EMULATION: Soften edges during motion
    // Faster motion = wider epsilon and edgeWidth = smoother appearance
    
    // Base epsilon increases with velocity (0.020 → 0.045)
    float motionEpsilon = 0.020 + (uAngularVelocity * 0.025);
    
    // Base edge width increases with velocity (0.015 → 0.035)
    float motionEdgeWidth = 0.015 + (uAngularVelocity * 0.020);

    // Calculate base smoothstep fade
    float alphaLow  = smoothstep(motionEpsilon, motionEpsilon + motionEdgeWidth, angle);
    float alphaHigh = smoothstep(uSliceArc - motionEdgeWidth, uSliceArc, angle);
    
    // QUADRATIC SMOOTHSTEP: Apply smoother easing function
    alphaLow = alphaLow * alphaLow * (3.0 - 2.0 * alphaLow);
    alphaHigh = alphaHigh * alphaHigh * (3.0 - 2.0 * alphaHigh);
    
    // Combine fades
    float alpha = 1.0 - (alphaLow * (1.0 - alphaHigh));

    // Apply alpha
    if(alpha < 0.01) discard;
    gl_FragColor = vec4(vec3(1.0), alpha);

    float csm_Slice;
}