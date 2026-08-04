import math
def srgb_lin(c):
    c/=255
    return c/12.92 if c<=0.04045 else ((c+0.055)/1.055)**2.4
def lin_srgb(c):
    c=max(0.0,min(1.0,c))
    v=12.92*c if c<=0.0031308 else 1.055*(c**(1/2.4))-0.055
    return round(v*255)
def hex2rgb(h):
    h=h.lstrip('#'); return tuple(int(h[i:i+2],16) for i in (0,2,4))
def rgb2hex(r,g,b): return '#%02x%02x%02x'%(r,g,b)
M1=[[0.4122214708,0.5363325363,0.0514459929],
    [0.2119034982,0.6806995451,0.1073969566],
    [0.0883024619,0.2817188376,0.6299787005]]
M2=[[0.2104542553,0.7936177850,-0.0040720468],
    [1.9779984951,-2.4285922050,0.4505937099],
    [0.0259040371,0.7827717662,-0.8086757660]]
def rgb2oklch(r,g,b):
    R,G,B=srgb_lin(r),srgb_lin(g),srgb_lin(b)
    l,m,s=[sum(M1[i][j]*[R,G,B][j] for j in range(3)) for i in range(3)]
    l,m,s=[math.copysign(abs(v)**(1/3),v) for v in (l,m,s)]
    L,a,bb=[sum(M2[i][j]*[l,m,s][j] for j in range(3)) for i in range(3)]
    C=math.hypot(a,bb); H=math.degrees(math.atan2(bb,a))%360
    return L,C,H
def oklch2rgb(L,C,H):
    a=C*math.cos(math.radians(H)); bb=C*math.sin(math.radians(H))
    l_=L+0.3963377774*a+0.2158037573*bb
    m_=L-0.1055613458*a-0.0638541728*bb
    s_=L-0.0894841775*a-1.2914855480*bb
    l,m,s=[v**3 for v in (l_,m_,s_)]
    R= 4.0767416621*l-3.3077115913*m+0.2309699292*s
    G=-1.2684380046*l+2.6097574011*m-0.3413193965*s
    B=-0.0041960863*l-0.7034186147*m+1.7076147010*s
    return lin_srgb(R),lin_srgb(G),lin_srgb(B)
def lum(h):
    r,g,b=hex2rgb(h); return 0.2126*srgb_lin(r)+0.7152*srgb_lin(g)+0.0722*srgb_lin(b)
def ratio(a,b):
    la,lb=lum(a),lum(b); hi,lo=max(la,lb),min(la,lb); return (hi+0.05)/(lo+0.05)
