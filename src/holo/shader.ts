// Fragment shader for the holographic background. Phase uT = 2π·t/15 s; every use of uT has an
// INTEGER coefficient, so the image at t = 15 s equals the image at t = 0 (seamless loop) and
// every term travels forward (monotonic, no ping-pong).
export const FRAG = `
precision highp float; // required: startHolo bails out if the GPU has no highp in fragment shaders
uniform vec2 uRes;     // canvas size in px
uniform float uT;      // phase, radians, 0..2π
uniform vec3 uC[6];    // pearl, pink, lilac, cyan, shade, ridge (from tokens)

// Flow coordinate: ribbons run along x; the 2D warp makes them fold and curl.
float S(vec2 p){
  p += .65*vec2(sin(.7*p.y+uT), sin(.6*p.x-uT+1.));
  p += .16*vec2(sin(1.9*p.y-2.*uT), sin(1.7*p.x+2.*uT+2.));
  float u = p.y + .36*sin(.9*p.x+uT) + .13*sin(1.7*p.x-2.*uT+2.) + .05*sin(3.1*p.x+3.*uT);
  return u + .28*sin(1.9*u + .7*p.x - uT);
}

// Band position 0..1 -> pearl, pink fringe, lilac, cyan core, shade crease.
vec3 ramp(float w){
  vec3 c = mix(uC[0], uC[1], clamp(w/.38, 0., 1.));
  c = mix(c, uC[2], clamp((w-.30)/.22, 0., 1.));
  c = mix(c, uC[3], clamp((w-.56)/.16, 0., 1.));
  return mix(c, uC[4], clamp((w-.86)/.14, 0., 1.));
}

void main(){
  vec2 p = (gl_FragCoord.xy - .5*uRes) / uRes.y * 3.2;
  float e = .02, s = S(p);
  vec2 g = vec2(S(p+vec2(e,0.))-s, S(p+vec2(0.,e))-s) / e;   // slope of the surface
  float a = 3.1*s + 1.3*sin(1.3*s + .5*p.x + uT);
  float w = mix(asin(clamp(sin(a), -1., 1.))/3.14159 + .5, .5 + .5*sin(a), .4); // clamp: asin(>1) is NaN on some mobile GPUs
  w = pow(clamp(w, 0., 1.), 1.5);                                            // pearl dominates, cyan is narrow
  vec3 c = vec3(ramp(w+.05).r, ramp(w).g, ramp(w-.05).b);     // per-channel offset = thin-film hue fringe
  float l = dot(normalize(vec3(-g*.9, 1.)), normalize(vec3(-.3,.6,.75)));
  c = mix(c, uC[5], pow(max(l,0.), 12.)*.85);                 // specular ridges
  c = mix(c, uC[4], clamp(.55-l,0.,1.)*.3);                   // soft fold shade
  gl_FragColor = vec4(c, 1.);
}`;
