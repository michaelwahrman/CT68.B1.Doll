#!/usr/bin/env python3
"""CT68.A4.Doll  -  image + prompt -> doll textures and a doll description.

    python3 tools/doll_textures.py dolls/<name>/spec.json            (run in WSL)
    python3 tools/doll_textures.py dolls/*/spec.json

Reads one spec.json per doll (see dolls/*/spec.json). The spec names a reference photograph and
says where things are in it: the face (midline, cheek edges, eye line, chin, the two eyes) and
rectangles of each fabric (dress, sleeve, bonnet, hair, ribbon, lace, candle, holder).
Its "prompt" is the written description; "params" are the shape choices made from that prompt.

Writes next to the spec:
    tex/face.jpg        the face, turned to the front ("unturned" from a 3/4 view) on a 1024 square
                        that is planar-projected onto the front of the head
    tex/face_mask.png   white = skin, black = the two eye openings and the lip slit (alphaMap in three.js, opacity in Arnold)
    tex/eye.jpg         an eyeball (equirectangular; the iris is at the top row = the sphere's pole)
    tex/<fabric>.jpg    512 seamless tiles: the rectangle, lighting flattened, mirrored 2 x 2
    doll.json           spec + derived values (skin and iris colours, eye openings in face units)

Face units: x, y in -1..1 across the head's front, y up, 0,0 the head centre.
"""
import json, os, sys
import numpy as np
import cv2

FACE_N = 1024
TILE_N = 512
EYE_LINE = 0.08     # where the eye line lands in face units
CHIN = -0.92        # where the chin lands
CHEEK = 0.88
SLIT = 0.012       # the lip slit's half height in face units (src/doll_rig.js uses the same)        # where the left / right cheek edges land


def flatten(img, strength=0.75):
    """take the photo's lighting gradient out of a patch so it can repeat"""
    f = img.astype(np.float32) + 1
    s = max(img.shape[:2]) / 3
    blur = cv2.GaussianBlur(f, (0, 0), s)
    mean = f.reshape(-1, 3).mean(0)
    flat = f / blur * mean
    out = f * (1 - strength) + flat * strength
    return np.clip(out - 1, 0, 255).astype(np.uint8)


def seamless(p):
    """make a square patch repeat without seams: blend it with itself shifted by half, first across and then down.
    In each pass the shifted copy's seam lies where the original has full weight, so it never shows."""
    n = p.shape[0]
    r = np.abs((np.arange(n) + 0.5) / n * 2 - 1)            # 0 centre .. 1 edge
    w = np.clip((1 - r) / 0.5, 0, 1)
    w = w * w * (3 - 2 * w)
    out = p.astype(np.float32)
    out = out * w[None, :, None] + np.roll(out, n // 2, 1) * (1 - w[None, :, None])
    out = out * w[:, None, None] + np.roll(out, n // 2, 0) * (1 - w[:, None, None])
    return np.clip(out, 0, 255).astype(np.uint8)


def tile(img, box, bright=1.0):
    x0, y0, x1, y1 = box
    p = flatten(img[y0:y1, x0:x1])
    p = cv2.resize(p, (TILE_N, TILE_N), interpolation=cv2.INTER_AREA)
    t = seamless(p)
    return np.clip(t.astype(np.float32) * bright, 0, 255).astype(np.uint8)


def strip(img, box, w=128, h=512, bright=1.0):
    """a vertical strip (candle): flattened sideways only, mirrored left/right so it wraps"""
    x0, y0, x1, y1 = box
    p = img[y0:y1, x0:x1].astype(np.float32)
    col = p.mean(1, keepdims=True)                 # remove left-right shading of the cylinder
    p = p / (cv2.GaussianBlur(p, (0, 0), (x1 - x0) / 3) + 1) * (col + 1)
    p = cv2.resize(np.clip(p, 0, 255).astype(np.uint8), (w // 2, h), interpolation=cv2.INTER_AREA)
    t = np.hstack([p, p[:, ::-1]])
    return np.clip(t.astype(np.float32) * bright, 0, 255).astype(np.uint8)


def median_color(img, cx, cy, r, lo=0.0, hi=1.0):
    y0, y1, x0, x1 = max(0, cy - r), cy + r, max(0, cx - r), cx + r
    p = img[y0:y1, x0:x1].reshape(-1, 3).astype(np.float32)
    lum = p @ np.array([0.114, 0.587, 0.299], np.float32)
    o = np.argsort(lum)
    p = p[o[int(lo * len(o)):max(int(hi * len(o)), int(lo * len(o)) + 1)]]
    return np.median(p, 0)  # BGR


def face_maps(F):
    """the face warp: output face units -> source pixels, and its forward version for the eyes"""
    mid, left, right, eye_y, chin = F['mid'], F['left'], F['right'], F['eyeY'], F['chin']
    sv = (EYE_LINE - CHIN) / (chin - eye_y)          # face units per source pixel, vertically

    def fwd(x, y):
        fx = (x - mid) / (mid - left) * CHEEK if x < mid else (x - mid) / (right - mid) * CHEEK
        return fx, EYE_LINE - (y - eye_y) * sv

    def scale_x(x):
        return CHEEK / (mid - left) if x < mid else CHEEK / (right - mid)

    u = (np.arange(FACE_N) + 0.5) / FACE_N * 2 - 1
    fx, fy = np.meshgrid(u, -u)                      # row 0 = top (y = +1)
    if F.get('mirror') == 'left':      # a strongly turned face: use the near (left) half for both sides
        sx = mid - np.abs(fx) / CHEEK * (mid - left)
    elif F.get('mirror') == 'right':
        sx = mid + np.abs(fx) / CHEEK * (right - mid)
    else:
        sx = np.where(fx < 0, mid + fx / CHEEK * (mid - left), mid + fx / CHEEK * (right - mid))
    sy = eye_y + (EYE_LINE - fy) / sv
    return sx.astype(np.float32), sy.astype(np.float32), fx, fy, fwd, scale_x, sv


def build(spec_path):
    spec_path = os.path.abspath(spec_path)
    here = os.path.dirname(spec_path)
    spec = json.load(open(spec_path))
    src = os.path.normpath(os.path.join(here, spec['image']))
    img = cv2.imread(src, cv2.IMREAD_COLOR)
    if img is None:
        sys.exit(f'cannot read {src}')
    wb = np.array(spec.get('whiteBalance', [1, 1, 1])[::-1], np.float32)  # given RGB, stored BGR
    img = np.clip(img.astype(np.float32) * wb, 0, 255).astype(np.uint8)
    os.makedirs(os.path.join(here, 'tex'), exist_ok=True)
    out = lambda n: os.path.join(here, 'tex', n)
    F = spec['face']

    # ---- face ----
    sx, sy, fx, fy, fwd, scale_x, sv = face_maps(F)
    face = cv2.remap(img, sx, sy, cv2.INTER_CUBIC, borderMode=cv2.BORDER_REFLECT)
    sk = F['skin']
    skin = median_color(img, sk[0], sk[1], sk[2], 0.5, 0.95) * F.get('bright', 1.0)
    if 'skinColor' in F:
        skin = np.array([int(F['skinColor'][i:i + 2], 16) for i in (5, 3, 1)], np.float32)
    # outside the face oval fade to plain skin (hair and bonnet cover it on the model)
    ex, ey, rx, ry = F.get('oval', [0, -0.28, 0.9, 0.86])
    d = np.sqrt(((fx - ex) / rx) ** 2 + ((fy - ey) / ry) ** 2)
    k = np.clip((d - 0.9) / 0.15, 0, 1)[..., None]
    face = np.clip(face.astype(np.float32) * F.get('bright', 1.0), 0, 255)
    face = (face * (1 - k) + skin * k).astype(np.uint8)
    cv2.imwrite(out('face.jpg'), face, [cv2.IMWRITE_JPEG_QUALITY, 92])

    # ---- eye openings (in face units) and the mask ----
    eyes = []
    mask = np.full((FACE_N, FACE_N), 255, np.uint8)
    src_eyes = F['eyes']
    if F.get('mirror') in ('left', 'right'):
        e = src_eyes[0] if F['mirror'] == 'left' else src_eyes[1]
        ux, uy = fwd(e[0], e[1])
        src_eyes = [e, e]
    for i, (cx, cy, hw, hh) in enumerate(src_eyes):
        ux, uy = fwd(cx, cy)
        if F.get('mirror') in ('left', 'right'):
            ux = -abs(ux) if i == 0 else abs(ux)
        w = hw * (CHEEK / (F['mid'] - F['left']) if ux < 0 or F.get('mirror') == 'left' else CHEEK / (F['right'] - F['mid'])) * F.get('holeScale', 0.9)
        h = hh * sv * F.get('holeScale', 0.9)
        eyes.append({'x': round(ux, 4), 'y': round(uy, 4), 'w': round(w, 4), 'h': round(h, 4)})
        c = (int((ux + 1) / 2 * FACE_N), int((1 - uy) / 2 * FACE_N))
        cv2.ellipse(mask, c, (int(w / 2 * FACE_N), int(h / 2 * FACE_N)), F.get('eyeTilt', 0), 0, 360, 0, -1, cv2.LINE_AA)
    # ---- the lip slit (A2): a thin opening along the line where the lips meet; the rig opens the mouth by
    # pulling the face apart across it. mouth = [x, y, half width] and nose = [x, y] (the tip), in face units,
    # read off tex/face.jpg (which has the face units -1..1 across it).
    mx, my, mw = F.get('mouth', [0, -0.6, 0.14])
    cv2.ellipse(mask, (int((mx + 1) / 2 * FACE_N), int((1 - my) / 2 * FACE_N)), (int(mw / 2 * FACE_N), max(1, int(SLIT / 2 * FACE_N))), 0, 0, 360, 0, -1, cv2.LINE_AA)
    cv2.imwrite(out('face_mask.png'), mask)

    # ---- eyeball: iris colour sampled from the photograph ----
    cx, cy, hw, hh = F['eyes'][0]
    iris = median_color(img, cx, cy, max(3, int(hh * 0.7)), 0.55, 0.9)
    if 'iris' in F:
        iris = np.array([int(F['iris'][i:i + 2], 16) for i in (5, 3, 1)], np.float32)
    white = np.array(F.get('sclera', [232, 226, 214])[::-1], np.float32)
    H, W = 256, 512
    v = (np.arange(H) + 0.5) / H * 180.0              # degrees from the pole (row 0 = pole)
    a = (np.arange(W) + 0.5) / W * 2 * np.pi
    V, A = np.meshgrid(v, a, indexing='ij')
    rng = np.random.default_rng(len(spec['name']))
    streak = np.zeros(W)
    for f in (7, 13, 29, 53, 97):
        streak += rng.uniform(0.3, 1) * np.sin(A[0] * f + rng.uniform(0, 6.3))
    streak = 1 + 0.12 * streak / 2.5
    ir, pr = F.get('irisDeg', 40), F.get('pupilDeg', 15)   # the rig sizes the ball for a 40° iris
    eye = np.empty((H, W, 3), np.float32)
    t = np.clip(V / ir, 0, 1)
    irisc = iris * (0.75 + 0.5 * t)[..., None] * streak[None, :, None]
    irisc = irisc * (1 - 0.55 * np.clip((t - 0.82) / 0.18, 0, 1))[..., None]   # dark limbal ring
    eye[:] = white
    eye = np.where((V < ir)[..., None], irisc, eye)
    eye = np.where((V < pr)[..., None], np.array([18, 14, 12], np.float32), eye)
    eye[V >= ir] = white * (1 - 0.15 * np.clip((V[V >= ir] - ir) / 60, 0, 1))[:, None]
    cv2.imwrite(out('eye.jpg'), np.clip(eye, 0, 255).astype(np.uint8), [cv2.IMWRITE_JPEG_QUALITY, 92])

    # ---- fabrics ----
    P = spec['patches']
    for n, box in P.items():
        if n == 'candle':
            cv2.imwrite(out('candle.jpg'), strip(img, box, bright=spec.get('bright', {}).get(n, 1.0)), [cv2.IMWRITE_JPEG_QUALITY, 90])
        else:
            cv2.imwrite(out(f'{n}.jpg'), tile(img, box, spec.get('bright', {}).get(n, 1.0)), [cv2.IMWRITE_JPEG_QUALITY, 90])

    hexc = lambda bgr: '#%02x%02x%02x' % tuple(int(np.clip(c, 0, 255)) for c in bgr[::-1])
    doll = {
        'name': spec['name'], 'title': spec.get('title', spec['name']), 'prompt': spec.get('prompt', ''),
        'image': spec['image'], 'params': spec.get('params', {}),
        'skin': hexc(skin), 'iris': '#%02x%02x%02x' % tuple(int(c) for c in iris[::-1]),
        'eyes': eyes,
        'mouth': dict(zip(('x', 'y', 'w'), F.get('mouth', [0, -0.6, 0.14]))),
        'nose': dict(zip(('x', 'y'), F.get('nose', [0, -0.3]))),
        'textures': {'face': 'tex/face.jpg', 'faceMask': 'tex/face_mask.png', 'eye': 'tex/eye.jpg',
                     **{n: f'tex/{n}.jpg' for n in P}},
    }
    json.dump(doll, open(os.path.join(here, 'doll.json'), 'w'), indent=2)
    print(f"{spec['name']}: skin {doll['skin']} iris {doll['iris']} eyes {eyes}")


if __name__ == '__main__':
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    for p in sys.argv[1:]:
        build(p)
