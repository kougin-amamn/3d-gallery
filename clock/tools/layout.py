# 輪列の配置を探す: 脱進機(E,P,B,F)は M1 のまま、2番車(中心)・3番車・香箱の位置を決める
import math, itertools
E=(0.8,-1.2); P=(2.64,-2.58); B=(6.0,-5.1); F=(-1.75,2.2)
d=lambda a,b: math.hypot(a[0]-b[0],a[1]-b[1])
def inter(c1,r1,c2,r2):
    D=d(c1,c2)
    if D>r1+r2 or D<abs(r1-r2): return []
    a=(r1*r1-r2*r2+D*D)/(2*D); h=math.sqrt(max(0,r1*r1-a*a))
    mx=c1[0]+a*(c2[0]-c1[0])/D; my=c1[1]+a*(c2[1]-c1[1])/D
    return [(mx+h*(c2[1]-c1[1])/D, my-h*(c2[0]-c1[0])/D),(mx-h*(c2[1]-c1[1])/D, my+h*(c2[0]-c1[0])/D)]
best=None
for ix in range(-120,121,2):
  for iy in range(-120,121,2):
    C=(ix/10,iy/10)
    cons=[14.6-(d(C,B)+4.75), d(C,E)-4.5, d(C,F)-4.3, d(C,P)-4.4, d(C,B)-4.4]
    if min(cons)<0: continue
    for C3 in inter(C,4.5,F,4.25):
      c3=[d(C3,E)-4.25,d(C3,P)-4.1,d(C3,B)-3.95]
      if min(c3)<0: continue
      for k in range(72):
        a=k*5*math.pi/180; BR=(C[0]+6.75*math.cos(a),C[1]+6.75*math.sin(a))
        cb=[d(BR,B)-10.95,d(BR,P)-7.8,d(BR,E)-8.25,d(BR,F)-7.0,d(BR,C3)-6.7]
        if min(cb)<0: continue
        s=min(cons+c3+cb)
        if best is None or s>best[0]: best=(s,C,C3,BR)
print(best)
