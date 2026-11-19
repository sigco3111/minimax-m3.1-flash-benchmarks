import sys, zlib, struct
def read_png(path):
    d = open(path,'rb').read()
    assert d[:8] == b'\x89PNG\r\n\x1a\n'
    pos, idat, w, h, bd, ct = 8, b'', 0,0,0,0
    while pos < len(d):
        ln = struct.unpack('>I', d[pos:pos+4])[0]; typ = d[pos+4:pos+8]; data = d[pos+8:pos+8+ln]; pos += 12+ln
        if typ == b'IHDR': w,h,bd,ct = struct.unpack('>IIBB', data[:10])
        elif typ == b'IDAT': idat += data
        elif typ == b'IEND': break
    raw = zlib.decompress(idat)
    ch = {0:1,2:3,3:1,4:2,6:4}[ct]
    stride = w*ch
    out = bytearray(h*stride); prev = bytearray(stride); p = 0
    for y in range(h):
        f = raw[p]; p += 1
        line = bytearray(raw[p:p+stride]); p += stride
        if f == 1:
            for i in range(ch, stride): line[i] = (line[i] + line[i-ch]) & 255
        elif f == 2:
            for i in range(stride): line[i] = (line[i] + prev[i]) & 255
        elif f == 3:
            for i in range(stride):
                a = line[i-ch] if i >= ch else 0
                line[i] = (line[i] + ((a + prev[i]) >> 1)) & 255
        elif f == 4:
            for i in range(stride):
                a = line[i-ch] if i >= ch else 0
                b = prev[i]; c = prev[i-ch] if i >= ch else 0
                pp = a+b-c; pa,pb,pc = abs(pp-a),abs(pp-b),abs(pp-c)
                pr = a if (pa<=pb and pa<=pc) else (b if pb<=pc else c)
                line[i] = (line[i] + pr) & 255
        out[y*stride:(y+1)*stride] = line; prev = line
    return w,h,ch,bytes(out)
if __name__ == '__main__':
    path = sys.argv[1]; x0,y0 = int(sys.argv[2]), int(sys.argv[3])
    w,h,ch,px = read_png(path)
    print('size', w, h, 'channels', ch)
    step = int(sys.argv[4]) if len(sys.argv)>4 else 1
    for y in range(y0, min(h, y0+900), step):
        i = (y*w + x0)*ch
        print(y, px[i], px[i+1], px[i+2])
