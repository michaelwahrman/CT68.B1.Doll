#!/usr/bin/env python3
"""contact sheet of every doll's textures:  python3 tools/montage.py out.jpg dolls/*"""
import sys, os, cv2, numpy as np
rows = []
for d in sys.argv[2:]:
    t = os.path.join(d, 'tex'); cells = []
    for n in ['face.jpg', 'face_mask.png', 'eye.jpg', 'dress.jpg', 'sleeve.jpg', 'lace.jpg', 'bonnet.jpg', 'hair.jpg', 'ribbon.jpg', 'candle.jpg', 'holder.jpg']:
        p = os.path.join(t, n); im = cv2.imread(p) if os.path.exists(p) else np.zeros((8, 8, 3), np.uint8)
        im = cv2.resize(im, (200, 200)); cv2.putText(im, n[:-4], (4, 194), 0, 0.5, (0, 255, 0), 1); cells.append(im)
    rows.append(np.hstack(cells))
cv2.imwrite(sys.argv[1], np.vstack(rows))
