/* =========================================================
   한강시 — 씬/메시 구축 (인스턴싱 + LOD + 거리 컬링)
   ========================================================= */

const WORLD = {
  scene: null, renderer: null, camera: null,
  sun: null, hemi: null, ambient: null, sky: null, sunSprite: null,
  water: null, waterNormal: null,
  bldNear: [], bldFar: null, bldFarMat: null,
  facades: [], glowMat: null, headMat: null,
  checkpointRings: [], skyCourseGroup: null,
  night: 0
};

const GLOBAL_U = {
  uNight: { value: 0 },
  uWindowLit: { value: 0.42 },
  uTime: { value: 0 }
};

/* ---------- 파사드 셰이더 패치 ---------- */
function patchFacadeMaterial(mat, cell, roofColor, rect) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uNight = GLOBAL_U.uNight;
    shader.uniforms.uWindowLit = GLOBAL_U.uWindowLit;
    shader.uniforms.uCell = { value: new THREE.Vector2(cell[0], cell[1]) };
    shader.uniforms.uRect = { value: new THREE.Vector4(rect[0], rect[1], rect[2], rect[3]) };
    shader.uniforms.uRoofColor = { value: new THREE.Color(roofColor) };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform vec2 uCell;\nvarying vec2 vFacadeUv;\nvarying vec2 vFacadeSeed;\nvarying float vUpFace;')
      .replace('#include <begin_vertex>', [
        '#include <begin_vertex>',
        '{',
        '  vec3 iscale = vec3(1.0);',
        '#ifdef USE_INSTANCING',
        '  iscale = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));',
        '#endif',
        '  vUpFace = abs(normal.y) > 0.5 ? 1.0 : 0.0;',
        '  float sx = (abs(normal.x) > 0.5) ? iscale.z : iscale.x;',
        '  float u = (abs(normal.x) > 0.5) ? (position.z + 0.5) : (position.x + 0.5);',
        '  float vv = position.y + 0.5;',
        '  vFacadeUv = vec2(u * sx / uCell.x, vv * iscale.y / uCell.y);',
        '  vec4 _wp = vec4(transformed, 1.0);',
        '#ifdef USE_INSTANCING',
        '  _wp = instanceMatrix * _wp;',
        '#endif',
        '  _wp = modelMatrix * _wp;',
        '  vFacadeSeed = _wp.xz;',
        '}'
      ].join('\n'));
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', [
        '#include <common>',
        'uniform float uNight;',
        'uniform float uWindowLit;',
        'uniform vec4 uRect;',
        'uniform vec3 uRoofColor;',
        'varying vec2 vFacadeUv;',
        'varying vec2 vFacadeSeed;',
        'varying float vUpFace;',
        'float h21f(vec2 p){ p = fract(p*vec2(127.31,311.7)); p += dot(p, p+34.23); return fract(p.x*p.y); }'
      ].join('\n'))
      .replace('#include <map_fragment>', [
        'vec4 _texel = texture2D( map, vFacadeUv );',
        'diffuseColor.rgb *= _texel.rgb;',
        'if ( vUpFace > 0.5 ) diffuseColor.rgb = uRoofColor * (0.8 + 0.35*_texel.r);'
      ].join('\n'))
      .replace('#include <emissivemap_fragment>', [
        '#include <emissivemap_fragment>',
        'if ( vUpFace < 0.5 && uNight > 0.01 ) {',
        '  vec2 _f = fract(vFacadeUv);',
        '  float _in = step(uRect.x, _f.x) * step(_f.x, uRect.z) * step(uRect.y, _f.y) * step(_f.y, uRect.w);',
        '  if ( _in > 0.5 ) {',
        '    vec2 _cid = floor(vFacadeUv) + floor(vFacadeSeed * 0.37);',
        '    float _r = h21f(_cid);',
        '    float _lit = step(1.0 - uWindowLit * uNight, _r);',
        '    totalEmissiveRadiance += vec3(1.0,0.85,0.60) * _lit * uNight * 1.6;',
        '  }',
        '}'
      ].join('\n'));
  };
  mat.customProgramCacheKey = () => 'hangang-facade';
  return mat;
}

/* ---------- 텍스처 메시 빌더 ---------- */
function TexturedBuilder() { this.pos = []; this.nor = []; this.uv = []; this.idx = []; }
TexturedBuilder.prototype.quad = function (a, b, c, d, uvs) {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
  const vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
  let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
  const base = this.pos.length / 3;
  const pts = [a, b, c, d];
  for (let i = 0; i < 4; i++) {
    this.pos.push(pts[i][0], pts[i][1], pts[i][2]);
    this.nor.push(nx, ny, nz);
    this.uv.push(uvs[i * 2], uvs[i * 2 + 1]);
  }
  this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
};
TexturedBuilder.prototype.build = function () {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
  g.setIndex(this.idx);
  g.computeBoundingSphere();
  return g;
};

/* ---------- 지면/도로 메시 ---------- */
function buildGroundMesh() {
  const b = new MeshBuilder();
  const H = CITY.HALF, R = CITY.ROAD / 2;
  const C_ASPHALT = [0.205, 0.215, 0.235];
  const C_GROUND = [0.285, 0.300, 0.260];
  const C_SIDEWALK = [0.430, 0.420, 0.395];
  const C_CURB = [0.360, 0.355, 0.340];
  const C_DASH = [0.760, 0.730, 0.560];
  const C_CROSS = [0.800, 0.800, 0.780];

  // 바탕 땅
  b.quad([-H - 40, 0, -H - 40], [H + 40, 0, -H - 40], [H + 40, 0, H + 40], [-H - 40, 0, H + 40], C_GROUND);

  // 수직 도로
  for (let k = 0; k <= CITY.GRID; k++) {
    const x = roadX(k);
    const spans = [[-H - 10, CITY.RIVER_Z0], [CITY.RIVER_Z1, H + 10]];
    for (const [z0, z1] of spans) {
      b.quad([x - R, 0.02, z0], [x + R, 0.02, z0], [x + R, 0.02, z1], [x - R, 0.02, z1], C_ASPHALT);
      // 중앙 점선
      for (let z = z0 + 6; z < z1 - 6; z += 17) {
        b.quad([x - 0.22, 0.05, z], [x + 0.22, 0.05, z], [x + 0.22, 0.05, z + 6], [x - 0.22, 0.05, z + 6], C_DASH);
      }
    }
  }
  // 수평 도로
  for (let l = 0; l <= CITY.GRID; l++) {
    const z = roadZ(l);
    b.quad([-H - 10, 0.02, z - R], [-H - 10, 0.02, z + R], [H + 10, 0.02, z + R], [H + 10, 0.02, z - R], C_ASPHALT);
    for (let x = -H + 6; x < H - 6; x += 17) {
      b.quad([x, 0.05, z - 0.22], [x + 6, 0.05, z - 0.22], [x + 6, 0.05, z + 0.22], [x, 0.05, z + 0.22], C_DASH);
    }
  }
  // 차선 경계선(간선 도로)
  for (let k = 0; k <= CITY.GRID; k += 3) {
    const x = roadX(k);
    for (const [z0, z1] of [[-H - 10, CITY.RIVER_Z0], [CITY.RIVER_Z1, H + 10]]) {
      b.quad([x - R + 0.8, 0.045, z0], [x - R + 1.1, 0.045, z0], [x - R + 1.1, 0.045, z1], [x - R + 0.8, 0.045, z1], C_DASH);
      b.quad([x + R - 1.1, 0.045, z0], [x + R - 0.8, 0.045, z0], [x + R - 0.8, 0.045, z1], [x + R - 1.1, 0.045, z1], C_DASH);
    }
  }
  // 횡단보도
  for (let l = 1; l < CITY.GRID; l++) {
    for (let k = 1; k < CITY.GRID; k++) {
      const cx = roadX(k), cz = roadZ(l);
      for (let s = 0; s < 4; s++) {
        const ang = s * Math.PI / 2;
        const dx = Math.cos(ang), dz = Math.sin(ang);
        const ox = -dz * 5.5, oz = dx * 5.5;
        for (let i = -3; i <= 3; i++) {
          const px = cx + ox + dx * i * 2.1, pz = cz + oz + dz * i * 2.1;
          const w = 0.85;
          b.quad([px - dz * 1.1 - dx * w, 0.05, pz + dx * 1.1 - dz * w],
                 [px - dz * 1.1 + dx * w, 0.05, pz + dx * 1.1 + dz * w],
                 [px + dz * 1.1 + dx * w, 0.05, pz - dx * 1.1 + dz * w],
                 [px + dz * 1.1 - dx * w, 0.05, pz - dx * 1.1 - dz * w], C_CROSS);
        }
      }
    }
  }
  // 보도(블록) + 연석
  for (const blk of CITYDATA.blocks) {
    if (blk.type === 'river') continue;
    const y = 0.16;
    b.quad([blk.x0, y, blk.z0], [blk.x0, y, blk.z1], [blk.x1, y, blk.z1], [blk.x1, y, blk.z0], C_SIDEWALK);
    // 연석(옆면)
    b.quad([blk.x0, 0, blk.z0], [blk.x0, y, blk.z0], [blk.x0, y, blk.z1], [blk.x0, 0, blk.z1], C_CURB);
    b.quad([blk.x1, 0, blk.z1], [blk.x1, y, blk.z1], [blk.x1, y, blk.z0], [blk.x1, 0, blk.z0], C_CURB);
    b.quad([blk.x1, 0, blk.z0], [blk.x1, y, blk.z0], [blk.x0, y, blk.z0], [blk.x0, 0, blk.z0], C_CURB);
    b.quad([blk.x0, 0, blk.z1], [blk.x0, y, blk.z1], [blk.x1, y, blk.z1], [blk.x1, 0, blk.z1], C_CURB);
  }
  // 강둑
  b.quad([-H - 10, -1.6, CITY.RIVER_Z0], [H + 10, -1.6, CITY.RIVER_Z0], [H + 10, 0.4, CITY.RIVER_Z0], [-H - 10, 0.4, CITY.RIVER_Z0], [0.26, 0.25, 0.23]);
  b.quad([-H - 10, 0.4, CITY.RIVER_Z1], [-H - 10, -1.6, CITY.RIVER_Z1], [H + 10, -1.6, CITY.RIVER_Z1], [H + 10, 0.4, CITY.RIVER_Z1], [0.26, 0.25, 0.23]);
  return b.build();
}

/* ---------- 고가도로 / 다리 (리본) ---------- */
function ribbon(builder, halfWidth, thickness, color, samples) {
  for (let i = 0; i < samples.length - 1; i++) {
    const s0 = samples[i], s1 = samples[i + 1];
    // s = {x, z, y, dx, dz} (방향은 진행 방향)
    const px = -s0.dz, pz = s0.dx;
    const a = [s0.x - px * halfWidth, s0.y, s0.z - pz * halfWidth];
    const c = [s0.x + px * halfWidth, s0.y, s0.z + pz * halfWidth];
    const d = [s1.x + px * halfWidth, s1.y, s1.z + pz * halfWidth];
    const e = [s1.x - px * halfWidth, s1.y, s1.z - pz * halfWidth];
    builder.quad(a, c, d, e, color);
    // 옆면 (두께)
    const y0 = s0.y - thickness;
    builder.quad([a[0], y0, a[2]], [a[0], a[1], a[2]], [e[0], e[1], e[2]], [e[0], y0, e[2]], [color[0] * 0.55, color[1] * 0.55, color[2] * 0.55]);
    builder.quad([c[0], c[1], c[2]], [c[0], y0, c[2]], [d[0], y0, d[2]], [d[0], d[1], d[2]], [color[0] * 0.55, color[1] * 0.55, color[2] * 0.55]);
  }
}
function buildExpressway() {
  const b = new MeshBuilder();
  const samples = [];
  const N = 120;
  for (let i = 0; i <= N; i++) {
    const x = -CITY.HALF - 20 + (CITY.WORLD + 40) * (i / N);
    samples.push({ x, z: CITY.EXPR_Z, y: expresswayHeight(x) + 0.2, dx: 1, dz: 0 });
  }
  ribbon(b, CITY.EXPRESS_W / 2, 1.1, [0.255, 0.262, 0.272], samples);
  // 중앙 분리 볼라드 대신 황색 가장자리선
  for (let i = 0; i < samples.length - 1; i++) {
    const s0 = samples[i], s1 = samples[i + 1];
    if (s0.y < 1) continue;
    b.quad([s0.x - 0.3, s0.y + 0.02, s0.z], [s1.x - 0.3, s1.y + 0.02, s1.z], [s1.x - 0.3, s1.y + 0.02, s1.z + 0.5], [s0.x - 0.3, s0.y + 0.02, s0.z + 0.5], [0.7, 0.62, 0.25]);
    b.quad([s0.x + 0.3, s0.y + 0.02, s0.z], [s0.x + 0.3, s0.y + 0.02, s0.z + 0.5], [s1.x + 0.3, s1.y + 0.02, s1.z + 0.5], [s1.x + 0.3, s1.y + 0.02, s1.z], [0.7, 0.62, 0.25]);
  }
  // 지지 기둥
  for (let x = -CITY.HALF + 20; x < CITY.HALF; x += 34) {
    const h = expresswayHeight(x);
    if (h < 3) continue;
    let near = false;
    for (let k = 0; k <= CITY.GRID; k++) if (Math.abs(roadX(k) - x) < 16) near = true;
    if (near) continue;
    b.box(x, (h + 0.2) / 2, CITY.EXPR_Z, 2.4, h + 0.2, 3.2, [0.42, 0.41, 0.39]);
  }
  // 방음벽
  for (let i = 0; i < samples.length - 1; i++) {
    const s0 = samples[i], s1 = samples[i + 1];
    if (s0.y < 2) continue;
    const h = 1.1;
    b.quad([s0.x, s0.y + h, s0.z - CITY.EXPRESS_W / 2], [s1.x, s1.y + h, s1.z - CITY.EXPRESS_W / 2], [s1.x, s1.y, s1.z - CITY.EXPRESS_W / 2], [s0.x, s0.y, s0.z - CITY.EXPRESS_W / 2], [0.33, 0.33, 0.32]);
    b.quad([s0.x, s0.y, s0.z + CITY.EXPRESS_W / 2], [s1.x, s1.y, s1.z + CITY.EXPRESS_W / 2], [s1.x, s1.y + h, s1.z + CITY.EXPRESS_W / 2], [s0.x, s0.y + h, s0.z + CITY.EXPRESS_W / 2], [0.33, 0.33, 0.32]);
  }
  return b.build();
}
function buildBridges() {
  const b = new MeshBuilder();
  for (const bx of CITY.BRIDGE_X) {
    const samples = [];
    const N = 90;
    for (let i = 0; i <= N; i++) {
      const z = -180 + 360 * (i / N);
      samples.push({ x: bx, z, y: bridgeHeight(bx, z) + 0.2, dx: 0, dz: 1 });
    }
    ribbon(b, 13, 1.2, [0.262, 0.268, 0.278], samples);
    // 중앙선
    for (let i = 0; i < samples.length - 1; i++) {
      const s0 = samples[i], s1 = samples[i + 1];
      if (s0.y < 1.2) continue;
      b.quad([s0.x - 0.25, s0.y + 0.02, s0.z], [s0.x + 0.25, s0.y + 0.02, s0.z], [s1.x + 0.25, s1.y + 0.02, s1.z], [s1.x - 0.25, s1.y + 0.02, s1.z], [0.7, 0.62, 0.25]);
    }
    // 기둥
    for (let z = -60; z <= 60; z += 30) {
      const h = bridgeHeight(bx, z);
      b.box(bx, h / 2 - 1.2, z, 3.4, h + 2.4, 3.4, [0.40, 0.39, 0.37]);
    }
    // 난간
    for (let i = 0; i < samples.length - 1; i++) {
      const s0 = samples[i], s1 = samples[i + 1];
      const h = 1.2;
      b.quad([s0.x - 13, s0.y + h, s0.z], [s1.x - 13, s1.y + h, s1.z], [s1.x - 13, s1.y, s1.z], [s0.x - 13, s1.y, s1.z], [0.35, 0.35, 0.34]);
      b.quad([s0.x + 13, s0.y, s0.z], [s1.x + 13, s1.y, s1.z], [s1.x + 13, s1.y + h, s1.z], [s0.x + 13, s0.y + h, s1.z], [0.35, 0.35, 0.34]);
    }
  }
  return b.build();
}

/* ---------- 옥상 코스 구조물 ---------- */
function buildSkyCourseMesh() {
  const b = new MeshBuilder();
  const c = CITYDATA.skyCourse;
  for (const p of c.platforms) {
    if (p.ramp) {
      // 경사 슬래브: 4단으로 나누어 쌓기
      const steps = 6;
      for (let i = 0; i < steps; i++) {
        const t0 = i / steps, t1 = (i + 1) / steps;
        const y0 = lerp(p.y0, p.y1, t0), y1 = lerp(p.y0, p.y1, t1);
        let x0, x1, z0, z1;
        if (p.axis === 'x') { x0 = lerp(p.x0, p.x1, t0); x1 = lerp(p.x0, p.x1, t1); z0 = p.z0; z1 = p.z1; }
        else { z0 = lerp(p.z0, p.z1, t0); z1 = lerp(p.z0, p.z1, t1); x0 = p.x0; x1 = p.x1; }
        const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
        const w = Math.abs(x1 - x0) + 0.3, d = Math.abs(z1 - z0) + 0.3;
        b.box(cx, y0 - 0.5, cz, w, 1.0, d, [0.42, 0.43, 0.45]);
        b.box(cx, y1 - 0.5, cz, w, 1.0, d, [0.42, 0.43, 0.45]);
      }
    } else {
      b.box(p.x, (p.y + p.base) / 2, p.z, p.w, p.h, p.d, [0.42, 0.43, 0.45]);
      // 난간
      b.box(p.x, p.y + 0.5, p.z0 + 0.2, p.w, 1.0, 0.4, [0.58, 0.58, 0.54]);
      b.box(p.x, p.y + 0.5, p.z1 - 0.2, p.w, 1.0, 0.4, [0.58, 0.58, 0.54]);
      b.box(p.x0 + 0.2, p.y + 0.5, p.z, 0.4, 1.0, p.d, [0.58, 0.58, 0.54]);
      b.box(p.x1 - 0.2, p.y + 0.5, p.z, 0.4, 1.0, p.d, [0.58, 0.58, 0.54]);
    }
  }
  return b.build();
}

/* ---------- 간판 / 상가 파사드 ---------- */
function buildSigns() {
  const atlas = makeSignAtlas();
  const tex = canvasTex(atlas.canvas, { aniso: 8 });
  const tb = new TexturedBuilder();
  const gb = new TexturedBuilder();
  for (const s of CITYDATA.signs) {
    const col = s.tile % atlas.cols, row = Math.floor(s.tile / atlas.cols);
    const u0 = col / atlas.cols, u1 = (col + 1) / atlas.cols;
    const v0 = 1 - (row + 1) / atlas.rows, v1 = 1 - row / atlas.rows;
    const hw = s.scale * 0.5, hh = s.scale * 0.5;
    const c = Math.cos(s.rot), sn = Math.sin(s.rot);
    const corners = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]];
    const pts = corners.map(([lx, ly]) => [s.x + lx * c, s.y + ly, s.z - lx * sn]);
    tb.quad(pts[0], pts[1], pts[2], pts[3], [u0, v0, u1, v0, u1, v1, u0, v1]);
    const gw = hw * 1.45, gh = hh * 1.45;
    const gpts = corners.map(([lx, ly]) => [s.x + lx * c * 1.45, s.y + ly * 1.45, s.z - lx * sn * 1.45]);
    gb.quad(gpts[0], gpts[1], gpts[2], gpts[3], [u0, v0, u1, v0, u1, v1, u0, v1]);
  }
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, depthWrite: false, toneMapped: false });
  const mesh = new THREE.Mesh(tb.build(), mat);
  mesh.renderOrder = 2;
  const glowMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  const glow = new THREE.Mesh(gb.build(), glowMat);
  glow.renderOrder = 1;
  WORLD.signMat = mat; WORLD.signGlowMat = glowMat;
  return { mesh, glow };
}
function buildStoreFronts() {
  const atlas = makeStoreAtlas();
  const tex = canvasTex(atlas.canvas, { aniso: 8 });
  const tb = new TexturedBuilder();
  for (const s of CITYDATA.stores) {
    const col = s.tile % atlas.cols, row = Math.floor(s.tile / atlas.cols);
    const u0 = col / atlas.cols, u1 = (col + 1) / atlas.cols;
    const v0 = 1 - (row + 1) / atlas.rows, v1 = 1 - row / atlas.rows;
    const w = s.scale, h = s.scale * 0.5;
    const c = Math.cos(s.rot), sn = Math.sin(s.rot);
    const corners = [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]];
    const pts = corners.map(([lx, ly]) => [s.x + lx * c, s.y + ly, s.z - lx * sn]);
    tb.quad(pts[0], pts[1], pts[2], pts[3], [u0, v0, u1, v0, u1, v1, u0, v1]);
  }
  const mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide, toneMapped: false });
  WORLD.storeMat = mat;
  return new THREE.Mesh(tb.build(), mat);
}

/* ---------- 인스턴스 풀(거리 컬링) ---------- */
function InstancedPool(geo, mat, max, shadow) {
  const mesh = new THREE.InstancedMesh(geo, mat, max);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.count = 0;
  if (shadow) { mesh.castShadow = true; mesh.receiveShadow = true; }
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
  mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
  return mesh;
}
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _v3 = new THREE.Vector3(), _s3 = new THREE.Vector3(), _col = new THREE.Color(), _eul = new THREE.Euler();
function setInst(mesh, i, x, y, z, rx, ry, rz, sx, sy, sz, color) {
  _eul.set(rx || 0, ry || 0, rz || 0);
  _q.setFromEuler(_eul);
  _v3.set(x, y, z); _s3.set(sx, sy, sz);
  _m4.compose(_v3, _q, _s3);
  mesh.setMatrixAt(i, _m4);
  if (color !== undefined) {
    if (typeof color === 'number') _col.setRGB(clamp(color, 0, 1), clamp(color, 0, 1), clamp(color, 0, 1));
    else _col.set(color);
    mesh.setColorAt(i, _col);
  }
}

/* =========================================================
   씬 구축
   ========================================================= */
function buildScene(renderer) {
  const scene = new THREE.Scene();
  WORLD.scene = scene;
  scene.fog = new THREE.Fog(0x9fc4e8, 70, 430);

  // 하늘 돔
  const skyGeo = new THREE.SphereGeometry(900, 24, 16);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      uZenith: { value: new THREE.Color(0x3f7fc4) },
      uHorizon: { value: new THREE.Color(0xbcd9f2) },
      uGround: { value: new THREE.Color(0x5a5f63) },
      uNight: GLOBAL_U.uNight
    },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: [
      'uniform vec3 uZenith; uniform vec3 uHorizon; uniform vec3 uGround; uniform float uNight;',
      'varying vec3 vDir;',
      'float h31f(vec3 p){ p = fract(p*0.1031); p += dot(p, p.yzx+33.33); return fract((p.x+p.y)*p.z); }',
      'void main(){',
      '  vec3 d = normalize(vDir);',
      '  float t = clamp(d.y*0.5+0.5, 0.0, 1.0);',
      '  vec3 c = mix(uHorizon, uZenith, pow(smoothstep(0.48,1.0,t),0.75));',
      '  c = mix(uGround, c, smoothstep(-0.10, 0.04, d.y));',
      '  if (uNight > 0.01) {',
      '    float s = h31f(floor(d*320.0));',
      '    float star = smoothstep(0.9972, 1.0, s) * uNight * smoothstep(0.03, 0.35, d.y);',
      '    c += vec3(star*1.4);',
      '  }',
      '  gl_FragColor = vec4(c, 1.0);',
      '  #include <colorspace_fragment>',
      '}'
    ].join('\n')
  });
  WORLD.sky = new THREE.Mesh(skyGeo, skyMat);
  WORLD.sky.frustumCulled = false;
  scene.add(WORLD.sky);

  // 조명
  WORLD.hemi = new THREE.HemisphereLight(0xbcd8f5, 0x55524a, 0.85);
  scene.add(WORLD.hemi);
  WORLD.ambient = new THREE.AmbientLight(0xffffff, 0.12);
  scene.add(WORLD.ambient);
  WORLD.sun = new THREE.DirectionalLight(0xfff1d2, 2.4);
  WORLD.sun.position.set(160, 220, 120);
  WORLD.sun.castShadow = true;
  WORLD.sun.shadow.mapSize.set(1024, 1024);
  WORLD.sun.shadow.camera.near = 1;
  WORLD.sun.shadow.camera.far = 460;
  const S = 90;
  WORLD.sun.shadow.camera.left = -S; WORLD.sun.shadow.camera.right = S;
  WORLD.sun.shadow.camera.top = S; WORLD.sun.shadow.camera.bottom = -S;
  WORLD.sun.shadow.bias = -0.0009;
  WORLD.sun.shadow.normalBias = 0.05;
  scene.add(WORLD.sun);
  scene.add(WORLD.sun.target);

  // 태양/달 스프라이트
  const glowTex = canvasTex(makeGlowTexture(), { srgb: false });
  const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xfff0c0, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false }));
  sunSprite.scale.set(150, 150, 1);
  scene.add(sunSprite);
  WORLD.sunSprite = sunSprite;

  // 지면
  const groundMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0.0 });
  const ground = new THREE.Mesh(buildGroundMesh(), groundMat);
  ground.receiveShadow = true;
  scene.add(ground);

  scene.add(new THREE.Mesh(buildExpressway(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 })));
  scene.add(new THREE.Mesh(buildBridges(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 })));
  scene.add(new THREE.Mesh(buildSkyCourseMesh(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 })));

  // 물
  WORLD.waterNormal = canvasTex(makeWaterNormal(), { srgb: false, aniso: 4 });
  WORLD.waterNormal.repeat.set(14, 3);
  const waterMat = new THREE.MeshStandardMaterial({
    color: 0x1d3b52, roughness: 0.14, metalness: 0.45,
    normalMap: WORLD.waterNormal, normalScale: new THREE.Vector2(0.85, 0.85)
  });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(CITY.WORLD + 80, CITY.RIVER_Z1 - CITY.RIVER_Z0, 1, 1), waterMat);
  water.rotation.x = -Math.PI / 2;
  water.position.y = -0.9;
  water.position.z = (CITY.RIVER_Z0 + CITY.RIVER_Z1) / 2;
  scene.add(water);
  WORLD.water = water;

  // 건물: 근거리(LOD0) / 원거리(LOD1)
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  for (let i = 0; i < FACADE_STYLES.length; i++) {
    const st = FACADE_STYLES[i];
    const tex = canvasTex(makeFacadeTexture(st), { aniso: 8 });
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: st.rough, metalness: st.metal });
    patchFacadeMaterial(mat, st.cell, 0x4a4a48, st.rect);
    WORLD.facades.push({ style: st, mat, mesh: null, list: [] });
  }
  // 원거리용 통합 머티리얼
  {
    const st = { key: 'far', wall: [0.42, 0.42, 0.44], glass: [0.22, 0.26, 0.32], cell: [2.6, 3.3], rect: [0.12, 0.18, 0.88, 0.76] };
    const tex = canvasTex(makeFacadeTexture(st), { aniso: 4 });
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9, metalness: 0.02 });
    patchFacadeMaterial(mat, st.cell, 0x46464a, st.rect);
    WORLD.bldFarMat = mat;
  }

  // 간판/상가
  const signPair = buildSigns();
  scene.add(signPair.mesh); scene.add(signPair.glow);
  scene.add(buildStoreFronts());

  // 가로등/나무/소품 인스턴스
  const poleGeo = new THREE.CylinderGeometry(0.16, 0.2, 7.4, 6);
  const poleMat = flatMaterial(0x4a4d52, 0.7, 0.4);
  WORLD.lightPole = InstancedPool(poleGeo, poleMat, CITYDATA.streetlights.length, false);
  scene.add(WORLD.lightPole);

  const armGeo = new THREE.BoxGeometry(0.22, 0.22, 2.2);
  const armMat = flatMaterial(0x4a4d52, 0.7, 0.4);
  WORLD.lightArm = InstancedPool(armGeo, armMat, CITYDATA.streetlights.length, false);
  scene.add(WORLD.lightArm);

  const headGeo = new THREE.BoxGeometry(0.7, 0.28, 1.1);
  WORLD.headMat = new THREE.MeshStandardMaterial({ color: 0x9aa0a8, emissive: 0xffd9a0, emissiveIntensity: 0, roughness: 0.4 });
  WORLD.lightHead = InstancedPool(headGeo, WORLD.headMat, CITYDATA.streetlights.length, false);
  scene.add(WORLD.lightHead);

  const poolGeo = new THREE.PlaneGeometry(11, 11);
  const poolTex = canvasTex(makeGlowTexture(), { srgb: false });
  WORLD.poolMat = new THREE.MeshBasicMaterial({ map: poolTex, color: 0xffcf94, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: true, toneMapped: false });
  WORLD.lightPool = InstancedPool(poolGeo, WORLD.poolMat, CITYDATA.streetlights.length, false);
  scene.add(WORLD.lightPool);

  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.3, 3, 5);
  WORLD.treeTrunk = InstancedPool(trunkGeo, flatMaterial(0x4a3a2c, 0.95, 0), CITYDATA.trees.length, false);
  scene.add(WORLD.treeTrunk);
  const leafGeo = new THREE.IcosahedronGeometry(1.9, 0);
  WORLD.treeLeaf = InstancedPool(leafGeo, flatMaterial(0x2f5c33, 0.95, 0), CITYDATA.trees.length, false);
  scene.add(WORLD.treeLeaf);

  const acGeo = new THREE.BoxGeometry(1.6, 1.0, 1.6);
  WORLD.acMesh = InstancedPool(acGeo, flatMaterial(0x777a7d, 0.85, 0.3), CITYDATA.props.length, false);
  scene.add(WORLD.acMesh);
  const tankGeo = new THREE.CylinderGeometry(1.1, 1.1, 2.2, 8);
  WORLD.tankMesh = InstancedPool(tankGeo, flatMaterial(0x6d6257, 0.9, 0.1), CITYDATA.props.length, false);
  scene.add(WORLD.tankMesh);

  // 체크포인트 링
  const cgrp = new THREE.Group();
  const ringGeo = new THREE.TorusGeometry(2.4, 0.26, 8, 30);
  for (const cp of CITYDATA.skyCourse.checkpoints) {
    const mat = new THREE.MeshStandardMaterial({ color: 0x1b2030, emissive: 0x3fd8ff, emissiveIntensity: 1.6, roughness: 0.4 });
    const ring = new THREE.Mesh(ringGeo, mat);
    ring.position.set(cp.x, cp.y, cp.z);
    ring.userData.cp = cp;
    cgrp.add(ring);
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: poolTex, color: 0x3fd8ff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.55, fog: false, toneMapped: false }));
    spr.position.set(cp.x, cp.y, cp.z);
    spr.scale.set(9, 9, 1);
    cgrp.add(spr);
    cp.ring = ring; cp.sprite = spr;
  }
  scene.add(cgrp);
  WORLD.skyCourseGroup = cgrp;

  return scene;
}

/* ---------- LOD / 거리 컬링 갱신 ---------- */
const LOD = { near: 190, far: 620, timer: 0, lastX: 1e9, lastZ: 1e9 };
function updateBuildingLOD(px, pz) {
  const near = WORLD.facades.map(() => 0);
  const farList = [];
  for (const f of WORLD.facades) f.list.length = 0;
  for (const b of CITYDATA.buildings) {
    const d = Math.hypot(b.x - px, b.z - pz);
    if (d < LOD.near) {
      const fi = FACADE_STYLES.findIndex(s => s.key === b.style);
      if (fi >= 0) WORLD.facades[fi].list.push(b);
    } else if (d < LOD.far) {
      farList.push(b);
    }
  }
  for (let i = 0; i < WORLD.facades.length; i++) {
    const f = WORLD.facades[i];
    if (!f.mesh) {
      f.mesh = InstancedPool(new THREE.BoxGeometry(1, 1, 1), f.mat, Math.max(64, f.list.length + 64), true);
      WORLD.scene.add(f.mesh);
    }
    let n = 0;
    for (const b of f.list) {
      const base = b.podium ? b.podium.h : 0;
      const gy = surfaceHeight(b.x, b.z);
      setInst(f.mesh, n, b.x, gy + base + b.h / 2, b.z, 0, 0, 0, b.w, b.h, b.d, b.tint);
      n++;
      if (n >= f.mesh.instanceMatrix.count) break;
    }
    f.mesh.count = n;
    f.mesh.instanceMatrix.needsUpdate = true;
    if (f.mesh.instanceColor) f.mesh.instanceColor.needsUpdate = true;
  }
  if (!WORLD.bldFar) {
    WORLD.bldFar = InstancedPool(new THREE.BoxGeometry(1, 1, 1), WORLD.bldFarMat, 900, false);
    WORLD.scene.add(WORLD.bldFar);
  }
  let n = 0;
  for (const b of farList) {
    const base = b.podium ? b.podium.h : 0;
    const gy = surfaceHeight(b.x, b.z);
    setInst(WORLD.bldFar, n, b.x, gy + base + b.h / 2, b.z, 0, 0, 0, b.w, b.h, b.d, b.tint * 0.85);
    n++;
    if (n >= WORLD.bldFar.instanceMatrix.count) break;
  }
  WORLD.bldFar.count = n;
  WORLD.bldFar.instanceMatrix.needsUpdate = true;
  if (WORLD.bldFar.instanceColor) WORLD.bldFar.instanceColor.needsUpdate = true;
}

/* ---------- 소품/가로등 인스턴스 갱신 ---------- */
function updateProps(px, pz) {
  const R = 170;
  let n = 0;
  for (const s of CITYDATA.streetlights) {
    if (Math.hypot(s.x - px, s.z - pz) > R) continue;
    if (n >= WORLD.lightPole.instanceMatrix.count) break;
    setInst(WORLD.lightPole, n, s.x, 3.9, s.z, 0, s.rot, 0, 1, 1, 1);
    setInst(WORLD.lightArm, n, s.x + Math.cos(s.rot) * 1.0, 7.5, s.z - Math.sin(s.rot) * 1.0, 0, s.rot, 0, 1, 1, 1);
    setInst(WORLD.lightHead, n, s.x + Math.cos(s.rot) * 2.0, 7.35, s.z - Math.sin(s.rot) * 2.0, 0, s.rot, 0, 1, 1, 1);
    setInst(WORLD.lightPool, n, s.x + Math.cos(s.rot) * 2.0, 0.19, s.z - Math.sin(s.rot) * 2.0, -Math.PI / 2, 0, 0, 1, 1, 1, 0xffffff);
    n++;
  }
  WORLD.lightPole.count = n; WORLD.lightArm.count = n; WORLD.lightHead.count = n; WORLD.lightPool.count = n;
  for (const m of [WORLD.lightPole, WORLD.lightArm, WORLD.lightHead, WORLD.lightPool]) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }

  n = 0;
  for (const t of CITYDATA.trees) {
    if (Math.hypot(t.x - px, t.z - pz) > R) continue;
    if (n >= WORLD.treeTrunk.instanceMatrix.count) break;
    setInst(WORLD.treeTrunk, n, t.x, 1.5 * t.s, t.z, 0, t.rot, 0, t.s, t.s, t.s);
    setInst(WORLD.treeLeaf, n, t.x, 3.6 * t.s, t.z, 0, t.rot, 0, t.s * 1.1, t.s * 1.25, t.s * 1.1, 0xffffff);
    n++;
  }
  WORLD.treeTrunk.count = n; WORLD.treeLeaf.count = n;
  WORLD.treeTrunk.instanceMatrix.needsUpdate = true; WORLD.treeLeaf.instanceMatrix.needsUpdate = true;
  if (WORLD.treeLeaf.instanceColor) WORLD.treeLeaf.instanceColor.needsUpdate = true;

  n = 0;
  for (const p of CITYDATA.props) {
    if (Math.hypot(p.x - px, p.z - pz) > 150) continue;
    if (p.kind === 'ac') {
      if (n >= WORLD.acMesh.instanceMatrix.count) break;
      setInst(WORLD.acMesh, n, p.x, p.y + 0.5, p.z, 0, p.rot, 0, p.s, p.s, p.s);
      n++;
    } else if (p.kind === 'tank') {
      if (n >= WORLD.tankMesh.instanceMatrix.count) break;
      setInst(WORLD.tankMesh, n, p.x, p.y + 1.1, p.z, 0, p.rot, 0, p.s, p.s, p.s);
      n++;
    }
  }
  WORLD.acMesh.count = n; WORLD.tankMesh.count = n;
  WORLD.acMesh.instanceMatrix.needsUpdate = true; WORLD.tankMesh.instanceMatrix.needsUpdate = true;
}
