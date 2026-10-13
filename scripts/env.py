import os
ENV = {}
for line in open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".env"), encoding="utf-8-sig"):
    if "=" in line and not line.strip().startswith("#"):
        k, v = line.strip().split("=", 1); ENV[k.strip()] = v.strip().strip('"')
