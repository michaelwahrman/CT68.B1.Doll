#!/usr/bin/env python3
"""the UV test image for Arnold (the page draws the same pattern itself):  python3 tools/uv_test.py tex/uv_test.png"""
import sys, cv2, numpy as np
N, n = 1024, 8; s = N // n
im = np.zeros((N, N, 3), np.uint8)
for j in range(n):
    for i in range(n):
        u, v = (i + .5) / n, 1 - (j + .5) / n
        im[j*s:(j+1)*s, i*s:(i+1)*s] = (150 if (i + j) % 2 == 0 else 70, int(40 + 215 * v), int(40 + 215 * u))  # BGR
for k in range(0, N + 1, s // 2):
    cv2.line(im, (k, 0), (k, N), (255, 255, 255), 2); cv2.line(im, (0, k), (N, k), (255, 255, 255), 2)
for j in range(n):
    for i in range(n):
        t = f'{i / n:.2f},{1 - (j + 1) / n:.2f}'
        cv2.putText(im, t, (i * s + 12, j * s + int(s * .62)), cv2.FONT_HERSHEY_SIMPLEX, 0.62, (255, 255, 255), 2, cv2.LINE_AA)
cv2.imwrite(sys.argv[1], im)
